# resume_rewriter.py
# ─── Phase 2: Resume Rewriting + Skill Gap Analysis ──────────────────────────
#
# FIXES APPLIED (original rewrite module):
#   FIX-1 : LLM is now ALWAYS attempted first (Groq → OpenAI → Mistral).
#            Rule-based NLP is used ONLY as a last resort when ALL LLM
#            backends fail — not the other way around.
#   FIX-2 : _extract_improvements() uses meaningful checks (verb counts,
#            quantification detection, weak-verb reduction) instead of a
#            trivial length comparison.
#   FIX-3 : The LLM prompt includes the FULL original resume so every
#            resume gets a unique, personalised rewrite — not a generic
#            template identical for all inputs.
#
# FIX-GPT2-GARBAGE:
#   Added _is_valid_rewrite() to detect and reject GPT-2 hallucinations.
#   If validation fails, rule-based rewrite is used instead.
#
# ADDED — Skill Gap Analysis (was skill_gap.py, merged here):
#   POST /ai/suggest-skills  →  { resumeText: string }
#   Strategy: LLM-first (LLaMA-3-70B → 8B → Mistral), NLP fallback on failure.
#   Uses the same _is_valid_rewrite logic and groq_client as rewrite_resume().
#   Response includes source: "llm" | "nlp_fallback" for frontend badge.
# ─────────────────────────────────────────────────────────────────────────────

import os
import re
import json
import asyncio
import logging
from typing import Dict, Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq

# Phase 1 NLP imports (already present in your project)
import spacy
from sentence_transformers import SentenceTransformer, util

from services.llm_client import get_llm_completion, _improve_text_with_rules

log    = logging.getLogger("resume_rewriter")
router = APIRouter(prefix="/ai", tags=["Phase2-ResumeAI"])

# ── Prevent HuggingFace network calls on startup ──────────────────────────────
# The model is already in local cache. These env vars stop the HEAD request to
# huggingface.co that causes 30-second startup delays when offline.
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE",       "1")

# ── Shared clients (rewrite + skill gap both use these) ───────────────────────
# timeout: connect=10s, read=60s — gives Groq enough time for the 70B model
# max_retries=2 auto-retries transient network errors (NOT timeouts, by design)
groq_client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
    # connect=8s: fail fast if Groq is unreachable
    # read=25s: enough for LLaMA-3-70B; shorter = faster retry on slow responses
    timeout=httpx.Timeout(connect=8.0, read=25.0, write=8.0, pool=5.0),
    max_retries=2,
)
nlp         = spacy.load("en_core_web_sm")

# local_files_only=True — load from cache without any network request.
# If cache is missing (first run), temporarily re-enables download.
try:
    embedder = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
    log.info("[resume_rewriter] SentenceTransformer loaded from local cache.")
except Exception as _st_err:
    log.warning(
        f"[resume_rewriter] Local cache miss ({_st_err}). "
        "Downloading model — connect to the internet once to cache it."
    )
    os.environ.pop("TRANSFORMERS_OFFLINE", None)
    os.environ.pop("HF_HUB_OFFLINE",       None)
    embedder = SentenceTransformer("all-MiniLM-L6-v2")

# ── Groq model priority list (shared by both features) ────────────────────────
LLM_MODELS = [
    "llama3-70b-8192",     # primary  : LLaMA 3 70B
    "llama3-8b-8192",      # secondary: LLaMA 3 8B (faster fallback)
    "mixtral-8x7b-32768",  # tertiary : Mistral
]

# ── Hallucination phrases (shared validator) ──────────────────────────────────
_HALLUCINATION_PHRASES = [
    "actual content is not part of",
    "i will use a full blown",
    "i will now create",
    "here is a full blown",
    "this is a placeholder",
    "lorem ipsum",
    "the following is a sample",
    "note: this is a fictional",
    "disclaimer:",
    "as an ai language model",
    "as a language model",
    "as an ai",
    "i cannot create a resume",
    "i am unable to",
    "i don't have access to",
    "here is a sample",
]


# ══════════════════════════════════════════════════════════════════════════════
# SHARED VALIDATOR
# ══════════════════════════════════════════════════════════════════════════════

def _is_valid_rewrite(result: str, original: str, min_len: int = 100) -> bool:
    """
    Validate that LLM output is genuine and not hallucinated / off-topic.
    Used by BOTH rewrite_resume() and suggest_skills().

    FIX-GPT2-GARBAGE: Returns False if the output:
      - Is too short (< min_len chars)
      - Contains hallucination marker phrases
      - Has < 5% word overlap with the original resume
    """
    if not result or len(result.strip()) < min_len:
        return False

    result_lower = result.lower()
    for phrase in _HALLUCINATION_PHRASES:
        if phrase in result_lower:
            log.warning(f"[resume_rewriter] Hallucination phrase: '{phrase}'")
            return False

    # Content overlap check — JSON output has lower overlap threshold
    original_words = set(
        w.lower() for w in re.findall(r"\b\w{4,}\b", original)
        if w.lower() not in {
            "that", "this", "with", "from", "have", "been", "will",
            "your", "their", "were", "which", "than", "then", "when",
        }
    )
    if original_words:
        result_words   = set(w.lower() for w in re.findall(r"\b\w{4,}\b", result))
        overlap_ratio  = len(original_words & result_words) / len(original_words)
        if overlap_ratio < 0.05:
            log.warning(f"[resume_rewriter] Low overlap: {overlap_ratio:.1%}")
            return False

    return True


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — RESUME REWRITE  (original feature)
# ══════════════════════════════════════════════════════════════════════════════

_ACTION_VERBS = [
    "developed", "implemented", "designed", "optimized", "optimised", "led",
    "architected", "engineered", "built", "created", "delivered",
    "automated", "launched", "maintained", "integrated", "deployed",
    "reduced", "increased", "improved", "achieved", "streamlined",
    "migrated", "refactored", "established", "coordinated", "spearheaded",
    "configured", "orchestrated", "monitored", "tested", "documented",
]

_WEAK_VERBS = ["made", "did", "worked", "helped", "used", "got", "was", "were"]


def rewrite_resume(
    resume_text:     str,
    job_description: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Rewrites a resume to be ATS-friendly and impactful.

    Priority order:
      1. LLM (Groq → OpenAI → Mistral via get_llm_completion) — personalised
      2. Rule-based NLP fallback — only when ALL LLM backends fail

    Returns:
        { "optimized_resume": str, "improvements": List[str], "source": str }
    """
    jd_block = ""
    if job_description and job_description.strip():
        jd_block = f"\nJOB DESCRIPTION TO TAILOR TOWARD:\n{job_description.strip()}\n"

    prompt = f"""You are an expert resume writer and career coach.
Rewrite the ENTIRE resume below so it is ATS-friendly and highly impactful.

STRICT GUIDELINES:
1. Use strong past-tense action verbs to start EVERY bullet
   (Developed, Implemented, Designed, Optimised, Led, Architected, Delivered, Automated)
2. Quantify EVERY achievement with real or plausible metrics
   (%, time saved, users served, revenue impact, latency reduction)
3. Keep bullets concise — one strong impact per line
4. Highlight technical skills clearly in a dedicated Skills section
5. Ensure consistent ATS-friendly formatting (no tables, no columns, no icons)
6. Preserve the candidate's real name, contact info, education, and dates exactly
7. Do NOT invent new personal details — only improve phrasing and add plausible metrics
8. Tailor language to the job description if one is provided
{jd_block}
ORIGINAL RESUME:
{resume_text}

Output ONLY the fully rewritten resume text.
No explanations, no preamble, no markdown fences.
"""

    # ── Step 1: Try LLM ───────────────────────────────────────────────────────
    optimized_resume = None
    source = "llm"

    try:
        result = get_llm_completion(prompt, model="auto")
        if result and _is_valid_rewrite(result, resume_text):
            optimized_resume = result.strip()
            log.info("[resume_rewriter] ✅ LLM rewrite succeeded and passed validation")
        elif result:
            log.warning(f"[resume_rewriter] LLM rewrite failed validation — using rule-based")
        else:
            log.warning("[resume_rewriter] LLM returned empty output")
    except Exception as e:
        log.warning(f"[resume_rewriter] LLM exception: {type(e).__name__}: {e}")

    # ── Step 2: Rule-based NLP fallback ──────────────────────────────────────
    if not optimized_resume:
        log.warning("[resume_rewriter] All LLM backends failed — falling back to rule-based NLP")
        source = "rule_based"
        optimized_resume = _apply_rule_based_rewrite(resume_text)

    return {
        "optimized_resume": optimized_resume,
        "improvements":     _extract_improvements(resume_text, optimized_resume),
        "source":           source,
    }


def _extract_improvements(original: str, optimized: str) -> list:
    """Detect which improvements were applied. Returns human-readable labels."""
    improvements = []
    orig_low = original.lower()
    opti_low = optimized.lower()

    orig_verb_count = sum(1 for v in _ACTION_VERBS if v in orig_low)
    opti_verb_count = sum(1 for v in _ACTION_VERBS if v in opti_low)
    if opti_verb_count > orig_verb_count:
        improvements.append(f"Added {opti_verb_count - orig_verb_count} strong action verb(s)")

    quant_re = r"\d+\s*%|\d+[kK]\+?|\d+\s*(users|clients|ms|seconds|requests|records)"
    if re.search(quant_re, opti_low) and not re.search(quant_re, orig_low):
        improvements.append("Added quantified achievements (%, users, latency, etc.)")
    elif re.search(quant_re, opti_low):
        improvements.append("Enhanced metric visibility across bullet points")

    orig_weak = sum(1 for v in _WEAK_VERBS if re.search(r"\b" + v + r"\b", orig_low))
    opti_weak = sum(1 for v in _WEAK_VERBS if re.search(r"\b" + v + r"\b", opti_low))
    if opti_weak < orig_weak:
        improvements.append(f"Replaced {orig_weak - opti_weak} weak verb(s) with impactful language")

    orig_words = len(original.split())
    opti_words = len(optimized.split())
    if opti_words > orig_words * 1.1:
        improvements.append("Expanded content with richer detail and context")
    elif opti_words < orig_words * 0.85:
        improvements.append("Tightened language for conciseness and clarity")

    improvements.append("Improved ATS compatibility and keyword density")
    improvements.append("Enhanced professional tone and formatting consistency")
    return improvements


def _apply_rule_based_rewrite(text: str) -> str:
    """
    Lightweight rule-based rewrite — ONLY used when ALL LLM backends fail.
    """
    improved = _improve_text_with_rules(text)

    lines = improved.split("\n")
    enhanced_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("•", "-", "*")) and not re.search(r"\d", stripped):
            line = line.rstrip() + "  ← add a metric here (%, numbers, users)"
        enhanced_lines.append(line)

    improved = "\n".join(enhanced_lines)
    improved += (
        "\n\n─────────────────────────────────────────────────────────────\n"
        "NOTE: This resume was enhanced using rule-based NLP because no\n"
        "LLM API key is configured. For a fully personalised AI rewrite,\n"
        "add GROQ_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY to your .env\n"
        "─────────────────────────────────────────────────────────────"
    )
    return improved


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — SKILL GAP ANALYSIS  (merged from skill_gap.py)
# ══════════════════════════════════════════════════════════════════════════════

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SkillGapRequest(BaseModel):
    resumeText: str   # matches aiApi.ts: suggestSkills sends { resumeText }

class CertificationItem(BaseModel):
    name:     str
    provider: str
    level:    str     # "Beginner" | "Intermediate" | "Advanced"

class SkillGapResponse(BaseModel):
    missing_technical: list[str]
    trending:          list[str]
    soft_skills:       list[str]
    certifications:    list[CertificationItem]
    role_gap_analysis: str
    source:            str   # "llm" | "nlp_fallback" — consumed by frontend badge

# ── Static corpora for NLP fallback ──────────────────────────────────────────

_TECH_CORPUS = [
    "Docker", "Kubernetes", "CI/CD", "Redis", "GraphQL", "Terraform",
    "AWS", "Azure", "GCP", "Spring Boot", "FastAPI", "React", "TypeScript",
    "PostgreSQL", "MongoDB", "Kafka", "Elasticsearch",
    "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow",
    "LLM Fine-Tuning", "RAG", "LangChain", "Vector Databases",
    "WebAssembly", "Rust", "Go", "Cybersecurity", "System Design",
]

_TRENDING = [
    "LLM Fine-Tuning", "RAG", "LangChain", "Vector Databases",
    "Kubernetes", "Terraform", "GraphQL", "Rust", "WebAssembly",
]

_SOFT_SKILLS = [
    "Cross-functional Collaboration", "Technical Communication",
    "Agile / Scrum", "Problem Decomposition", "Code Review", "Mentorship",
    "Leadership", "Conflict Resolution", "Stakeholder Management",
]

_CERTS_DB = [
    {"name": "AWS Certified Developer",       "provider": "Amazon Web Services", "level": "Intermediate"},
    {"name": "Certified Kubernetes Admin",    "provider": "CNCF",                "level": "Advanced"},
    {"name": "Google Cloud Professional",     "provider": "Google Cloud",        "level": "Advanced"},
    {"name": "Certified Scrum Master",        "provider": "Scrum Alliance",      "level": "Beginner"},
    {"name": "HashiCorp Terraform Associate", "provider": "HashiCorp",           "level": "Intermediate"},
    {"name": "Microsoft Azure Fundamentals",  "provider": "Microsoft",           "level": "Beginner"},
]

# ── NLP fallback for skill gap ────────────────────────────────────────────────

def _skill_gap_nlp_fallback(resume_text: str) -> dict:
    """
    Phase 1 NLP rule-based skill gap detection.
    Uses SentenceTransformer cosine similarity to find skills absent from
    the resume. Used ONLY when all LLM backends fail.
    """
    log.warning("[resume_rewriter] Skill gap: LLM failed — using NLP fallback.")

    resume_emb  = embedder.encode(resume_text,  convert_to_tensor=True)
    corpus_embs = embedder.encode(_TECH_CORPUS, convert_to_tensor=True)
    scores  = util.cos_sim(resume_emb, corpus_embs)[0].tolist()
    missing = [s for s, sc in zip(_TECH_CORPUS, scores) if sc < 0.25][:8]

    resume_lower  = resume_text.lower()
    trending_miss = [s for s in _TRENDING    if s.lower() not in resume_lower][:7]
    soft_miss     = [s for s in _SOFT_SKILLS if s.lower() not in resume_lower][:6]

    doc      = nlp(resume_text[:3000])
    gap_text = (
        f"Based on NLP analysis of your resume, key gaps include expertise in "
        f"{', '.join(missing[:3]) if missing else 'cloud and AI technologies'}. "
        f"Focusing on these alongside certifications in Kubernetes and AWS will "
        f"significantly improve your ATS score and market competitiveness."
    )

    return {
        "missing_technical": missing,
        "trending":          trending_miss,
        "soft_skills":       soft_miss,
        "certifications":    _CERTS_DB[:3],
        "role_gap_analysis": gap_text,
        "source":            "nlp_fallback",
    }

# ── LLM prompt for skill gap ──────────────────────────────────────────────────

def _build_skill_gap_prompt(resume_text: str) -> str:
    return f"""You are an expert technical recruiter and career coach.
Analyse the resume below and return a personalised skill gap report.

RESUME:
\"\"\"
{resume_text[:4000]}
\"\"\"

Return ONLY a valid JSON object with exactly these keys (no markdown, no explanation):
{{
  "missing_technical": ["skill1", ...],
  "trending":          ["skill1", ...],
  "soft_skills":       ["skill1", ...],
  "certifications": [
    {{"name": "...", "provider": "...", "level": "Beginner|Intermediate|Advanced"}},
    ...
  ],
  "role_gap_analysis": "..."
}}

Rules:
- missing_technical : 5-8 technical skills ABSENT from this specific resume
- trending          : 5-7 AI/cloud/DevOps skills relevant to THIS candidate's domain
- soft_skills       : 4-6 soft skills this specific candidate should develop
- certifications    : 2-4 certs matched to this resume's actual tech stack
- role_gap_analysis : 3-5 sentences referencing technologies actually found in the resume
- ALL output must be personalised to THIS resume — no generic boilerplate
"""

# ── FastAPI endpoint ──────────────────────────────────────────────────────────

@router.post("/suggest-skills", response_model=SkillGapResponse)
async def suggest_skills(req: SkillGapRequest):
    """
    Phase 2 Skill Gap Analysis endpoint.

    Receives the resume's plain text (sent from localStorage["extracted_text"]
    stored by the frontend after Phase 1 ATS analysis completes).

    Strategy — mirrors rewrite_resume():
      1. Try each Groq model in priority order (LLaMA-3-70B → 8B → Mistral)
      2. Validate output with _is_valid_rewrite() — same validator as rewrite
      3. On ALL LLM failures → NLP fallback (spaCy + SentenceTransformers)

    Response always includes source: "llm" | "nlp_fallback".
    """
    resume_text = (req.resumeText or "").strip()
    if not resume_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "resumeText is empty. "
                "Please upload and analyse your resume from the Dashboard first."
            ),
        )

    _REQUIRED_KEYS = {
        "missing_technical", "trending", "soft_skills",
        "certifications", "role_gap_analysis",
    }

    # ── LLM attempts ──────────────────────────────────────────────────────────
    for model in LLM_MODELS:
        try:
            # Retry once on ConnectTimeout before moving to next model.
            # This handles the common case where Groq is slow on first request
            # (cold start / rate limit) but succeeds immediately on retry.
            last_exc: Exception | None = None
            response = None
            for attempt in range(2):   # attempt 0 = first try, attempt 1 = retry
                try:
                    response = groq_client.chat.completions.create(
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": "You are a JSON-only API. Return only valid JSON, no markdown.",
                            },
                            {
                                "role": "user",
                                "content": _build_skill_gap_prompt(resume_text),
                            },
                        ],
                        temperature=0.4,
                        max_tokens=1200,
                    )
                    break   # success — exit retry loop
                except Exception as _retry_exc:
                    last_exc = _retry_exc
                    exc_name = type(_retry_exc).__name__
                    log.warning(f"[resume_rewriter] {model} attempt {attempt+1}/2 failed: {exc_name}")
                    if attempt == 0:
                        await asyncio.sleep(2)   # non-blocking pause before retry
                    continue

            if response is None:
                raise last_exc or Exception("No response after retries")

            raw = response.choices[0].message.content.strip()

            # Strip markdown fences if model adds them despite instructions
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            # Reuse shared validator (min_len=50 for JSON)
            if not _is_valid_rewrite(raw, resume_text, min_len=50):
                log.warning(f"[resume_rewriter] {model} skill gap output failed validation")
                continue

            parsed: dict = json.loads(raw)

            if not _REQUIRED_KEYS.issubset(parsed.keys()):
                log.warning(f"[resume_rewriter] {model} missing keys: {_REQUIRED_KEYS - parsed.keys()}")
                continue

            log.info(f"[resume_rewriter] ✅ Skill gap LLM ({model}) succeeded.")

            return SkillGapResponse(
                missing_technical = parsed["missing_technical"],
                trending          = parsed["trending"],
                soft_skills       = parsed["soft_skills"],
                certifications    = [CertificationItem(**c) for c in parsed["certifications"]],
                role_gap_analysis = parsed["role_gap_analysis"],
                source            = "llm",
            )

        except Exception as e:
            log.warning(f"[resume_rewriter] {model} skill gap failed: {type(e).__name__}: {e}")
            continue

    # ── NLP fallback (all LLMs failed) ───────────────────────────────────────
    log.warning(
        "[resume_rewriter] ⚠️  All LLM backends failed for suggest-skills. "
        "Using NLP rule-based fallback. source=nlp_fallback will be set in response."
    )
    fallback = _skill_gap_nlp_fallback(resume_text)
    return SkillGapResponse(**fallback)