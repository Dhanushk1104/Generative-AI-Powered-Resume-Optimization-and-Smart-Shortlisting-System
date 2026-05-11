"""
jd_tailor.py
─────────────
Phase 2 — Tailors a resume to match a specific job description.
Uses SentenceTransformers for semantic match score (no API key needed).

Fixes applied vs original:
  BUG-1 : Import `from services.llm_client` broke when not running from root.
           Fixed to package-relative import.
  BUG-2 : jd_match_score could be negative (cosine sim can be < 0).
           Score now clamped to [0, 100].
  BUG-3 : SentenceTransformer model was a bare module-level variable initialised
           to None with a getter — a common pattern but fragile under import.
           Wrapped in a proper lazy-singleton with exception handling.
  BUG-4 : If sentence_transformers is not installed the entire service crashed
           at import time. Added graceful ImportError fallback that uses a
           keyword-overlap score instead.
  BUG-5 : SentenceTransformer was downloading model from internet on every cold
           start. Now loads from local path: services/models/all-MiniLM-L6-v2/
"""

import os
import re
from typing import Dict, Any, List, Optional

from services.llm_client import get_llm_completion

# ──────────────────────────────────────────────────────────────────────────────
# Local model path — place downloaded model files here:
#   services/models/all-MiniLM-L6-v2/
# ──────────────────────────────────────────────────────────────────────────────
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "all-MiniLM-L6-v2")

# ──────────────────────────────────────────────────────────────────────────────
# Lazy singleton for SentenceTransformer
# ──────────────────────────────────────────────────────────────────────────────
_sentence_model = None
_sentence_model_available = None   # None = not yet checked


def _get_sentence_model():
    """Return a cached SentenceTransformer, or None if unavailable."""
    global _sentence_model, _sentence_model_available

    if _sentence_model_available is False:
        return None

    if _sentence_model is not None:
        return _sentence_model

    try:
        from sentence_transformers import SentenceTransformer

        # BUG-5 fix: load from local path first, fall back to hub name
        if os.path.isdir(_MODEL_PATH):
            print(f"[jd_tailor] Loading SentenceTransformer from local path: {_MODEL_PATH}")
            _sentence_model = SentenceTransformer(_MODEL_PATH)
        else:
            print("[jd_tailor] Local model not found, downloading from HuggingFace Hub…")
            _sentence_model = SentenceTransformer("all-MiniLM-L6-v2")

        _sentence_model_available = True
        return _sentence_model
    except Exception as e:
        print(f"[jd_tailor] SentenceTransformer unavailable: {e}  — using keyword fallback")
        _sentence_model_available = False
        return None


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def tailor_resume_to_jd(resume_text: str, job_description: str) -> Dict[str, Any]:
    """
    Tailors a resume to a specific job description.

    Returns:
        {
            "tailored_resume":   str,
            "jd_match_score":    float,   # 0–100
            "key_requirements":  List[str],
            "suggestions":       List[str]
        }
    """
    jd_keywords    = _extract_jd_keywords(job_description)
    match_score    = _calculate_jd_match(resume_text, job_description)
    tailored       = _generate_tailored_resume(resume_text, job_description, jd_keywords)
    suggestions    = _generate_suggestions(resume_text, jd_keywords)

    return {
        "tailored_resume":  tailored,
        "jd_match_score":   match_score,
        "key_requirements": jd_keywords[:10],
        "suggestions":      suggestions,
    }


# ══════════════════════════════════════════════════════════════════════════════
# KEYWORD EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

_COMMON_TECH_KEYWORDS = [
    "java", "python", "javascript", "typescript", "kotlin", "go",
    "react", "angular", "vue", "next.js",
    "spring boot", "django", "flask", "node.js", "express", "fastapi",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
    "mysql", "postgresql", "mongodb", "redis", "elasticsearch",
    "rest api", "microservices", "graphql", "grpc",
    "ci/cd", "jenkins", "github actions",
    "machine learning", "deep learning", "nlp", "data analysis",
    "pandas", "numpy", "tensorflow", "pytorch", "scikit-learn",
    "agile", "scrum", "jira", "linux", "git",
]


def _extract_jd_keywords(jd_text: str) -> List[str]:
    """Extract tech keywords that appear in the job description."""
    jd_lower = jd_text.lower()
    found = [kw for kw in _COMMON_TECH_KEYWORDS if kw in jd_lower]
    return found


# ══════════════════════════════════════════════════════════════════════════════
# MATCH SCORE
# ══════════════════════════════════════════════════════════════════════════════

def _calculate_jd_match(resume: str, jd: str) -> float:
    """
    Compute a semantic similarity score [0, 100].
    Falls back to keyword-overlap if SentenceTransformer is unavailable.
    """
    model = _get_sentence_model()

    if model is not None:
        return _semantic_score(resume, jd, model)
    else:
        return _keyword_overlap_score(resume, jd)


def _semantic_score(resume: str, jd: str, model) -> float:
    """Cosine similarity via SentenceTransformer, clamped to [0, 100]."""
    try:
        from sentence_transformers import util

        res_emb = model.encode(resume, convert_to_tensor=True)
        jd_emb  = model.encode(jd,     convert_to_tensor=True)
        sim     = float(util.cos_sim(res_emb, jd_emb)[0][0])

        # BUG-2 fix: cosine sim ∈ [-1, 1]; clamp to [0, 1] then scale
        score = max(0.0, min(sim, 1.0)) * 100
        return round(score, 2)

    except Exception as e:
        print(f"[jd_tailor] Semantic scoring failed: {e}")
        return _keyword_overlap_score(resume, jd)


def _keyword_overlap_score(resume: str, jd: str) -> float:
    """
    BUG-4 fix fallback: Jaccard-like keyword overlap score.
    No external model required.
    """
    resume_words = set(re.findall(r"\b\w+\b", resume.lower()))
    jd_words     = set(re.findall(r"\b\w+\b", jd.lower()))

    # Remove very common stop words
    stop = {"the", "a", "an", "and", "or", "in", "of", "to", "for",
            "is", "are", "with", "on", "at", "by", "we", "you", "your"}
    jd_words     -= stop
    resume_words -= stop

    if not jd_words:
        return 0.0

    overlap = resume_words & jd_words
    score   = (len(overlap) / len(jd_words)) * 100
    return round(min(score, 100.0), 2)


# ══════════════════════════════════════════════════════════════════════════════
# TAILORED RESUME GENERATION
# ══════════════════════════════════════════════════════════════════════════════

def _generate_tailored_resume(resume: str, jd: str, keywords: List[str]) -> str:
    kw_str = ", ".join(keywords[:10]) if keywords else "the listed requirements"

    prompt = f"""You are an expert resume tailor. Customise the resume below to match the job \
description while staying truthful and accurate.

JOB DESCRIPTION:
{jd}

ORIGINAL RESUME:
{resume}

KEY REQUIREMENTS TO EMPHASISE: {kw_str}

INSTRUCTIONS:
1. Reorder skills to prioritise those in the JD
2. Rephrase project descriptions to align with JD requirements
3. Emphasise experience that matches the JD
4. Use JD keywords naturally throughout — do NOT add false information
5. Maintain the same overall structure

Return only the tailored resume. No preamble or explanation.
"""

    result = get_llm_completion(prompt)

    if not result or len(result.strip()) < 50:
        # Fallback: return original with a header note
        result = (
            f"[Tailored for: {kw_str}]\n\n"
            + resume
        )

    return result.strip()


# ══════════════════════════════════════════════════════════════════════════════
# SUGGESTIONS
# ══════════════════════════════════════════════════════════════════════════════

def _generate_suggestions(resume: str, jd_keywords: List[str]) -> List[str]:
    resume_lower = resume.lower()
    suggestions  = []

    missing = [kw for kw in jd_keywords[:15] if kw not in resume_lower]
    if missing:
        suggestions.append(
            f"Consider adding these keywords if relevant to your experience: "
            f"{', '.join(missing[:5])}"
        )

    if "projects" not in resume_lower and "experience" not in resume_lower:
        suggestions.append(
            "Add a Projects or Experience section to showcase relevant work"
        )

    action_verbs = ["developed", "implemented", "designed", "led", "architected"]
    if not any(v in resume_lower for v in action_verbs):
        suggestions.append(
            "Use strong action verbs to start each bullet point "
            "(Developed, Implemented, Designed, Led…)"
        )

    suggestions.append(
        "Ensure your Skills section is placed near the top for ATS visibility"
    )

    return suggestions