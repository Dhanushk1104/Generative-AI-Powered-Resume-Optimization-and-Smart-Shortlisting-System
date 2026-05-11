"""
main.py
────────
FastAPI application — AI Resume Screening System  v2.0

FIX-DOTENV-PATH:
  The .env file lives at  ai_service/services/.env
  but main.py is at       ai_service/main.py
  Plain load_dotenv() only searches CWD (ai_service/) so it never finds
  the file inside services/.  Fixed by explicitly loading from both locations
  in priority order:
    1. ai_service/services/.env   ← where your file actually is
    2. ai_service/.env            ← standard fallback
  Both are loaded with override=True so whichever has a key wins.

FIX-LLM-PRIORITY:
  - /suggest-skills, /project-summary, /jd-suggestions now call get_llm_completion()
    with model="auto" so Groq → OpenAI → Mistral are all tried before any
    rule-based fallback.
  - _has_any_llm_key() strips whitespace before truthiness check.

Original fixes preserved:
  BUG-1  : POST /analyze-file route confirmed correct.
  BUG-2  : MAX_FILE_SIZE_MB check before reading content.
  BUG-3  : 400 returned for unsupported file types.
  BUG-4  : lifespan context manager pattern (FastAPI 0.104+).
  BUG-5  : /ai/advanced-parse kept for backwards compatibility.
  DATA   : Name populated from fixed extract_profile().
  NEW-1  : /suggest-skills endpoint.
  NEW-2  : /project-summary endpoint.
  NEW-3  : /jd-suggestions endpoint.
  FIX-PY311 : No backslashes inside f-string {} expressions.
  FIX-JSON  : expect_json=True used so GPT-2/rule-based output is safely
              coerced into valid JSON before _parse_llm_json() is called.
"""

import json
import os
import logging
import re as _re
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from pathlib import Path

# ── FIX-DOTENV-PATH: load .env from its actual location ──────────────────────
# Must happen before ANY other import that might call os.getenv().
logging.basicConfig(level=logging.INFO, format="%(levelname)s │ %(name)s │ %(message)s")
_log_early = logging.getLogger("ai_service")

def _load_env_files():
    """
    Load .env from every candidate location, most-specific first.

    Your project layout:
        ai_service/
            main.py          ← this file
            services/
                .env          ← where your keys actually live
                llm_client.py
                ...

    load_dotenv() with no arguments only searches CWD.
    When you run `python main.py` from ai_service/, CWD = ai_service/,
    so services/.env is never found and all os.getenv() calls return None.

    We fix this by building the path explicitly from __file__.
    """
    from dotenv import load_dotenv

    this_dir     = Path(__file__).parent.resolve()        # ai_service/
    services_env = this_dir / "services" / ".env"         # ai_service/services/.env
    root_env     = this_dir / ".env"                      # ai_service/.env

    loaded_any = False
    for env_path in [services_env, root_env]:
        if env_path.exists():
            load_dotenv(str(env_path), override=True)
            _log_early.info(f"✅ Loaded .env from: {env_path}")
            loaded_any = True
        else:
            _log_early.debug(f"   .env not found at: {env_path} (skipping)")

    if not loaded_any:
        _log_early.warning(
            "⚠️  No .env file found in ai_service/ or ai_service/services/\n"
            "     Create ai_service/services/.env with your API keys:\n"
            "       GROQ_API_KEY=gsk_...\n"
            "       MISTRAL_API_KEY=..."
        )

_load_env_files()
# ─────────────────────────────────────────────────────────────────────────────

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from services.text_extractor import extract_text_from_file
from services.advanced_resume_ai import advanced_parse_resume
from services.resume_rewriter import rewrite_resume
from services.project_enhancer import enhance_projects
from services.jd_tailor import tailor_resume_to_jd
from services.llm_client import get_llm_completion
from services.hr_shortlisting import (
    rank_candidates,
    cluster_candidates,
    auto_shortlist_by_threshold,
    generate_hr_insights,
)

# ──────────────────────────────────────────────────────────────────────────────
log = logging.getLogger("ai_service")

MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _has_any_llm_key() -> bool:
    """
    Return True if at least one real LLM API key is configured.
    .strip() guards against `GROQ_API_KEY= ` (space after =) in .env.
    """
    groq    = (os.getenv("GROQ_API_KEY")    or "").strip()
    openai  = (os.getenv("OPENAI_API_KEY")  or "").strip()
    mistral = (os.getenv("MISTRAL_API_KEY") or "").strip()
    return bool(groq or openai or mistral)


def _parse_llm_json(raw: str) -> dict:
    """Strip markdown fences and parse JSON from LLM output."""
    cleaned = _re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
    return json.loads(cleaned)


# ══════════════════════════════════════════════════════════════════════════════
# LIFESPAN
# ══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up heavy models at startup so first request is not slow."""
    log.info("━━━ AI Service starting ━━━")

    # Print each key's status so issues are immediately obvious in the log
    groq_key    = (os.getenv("GROQ_API_KEY")    or "").strip()
    openai_key  = (os.getenv("OPENAI_API_KEY")  or "").strip()
    mistral_key = (os.getenv("MISTRAL_API_KEY") or "").strip()

    log.info(f"  GROQ_API_KEY    : {'✅ set (' + groq_key[:8] + '...)' if groq_key    else '❌ NOT SET'}")
    log.info(f"  OPENAI_API_KEY  : {'✅ set (' + openai_key[:8] + '...)' if openai_key  else '❌ NOT SET'}")
    log.info(f"  MISTRAL_API_KEY : {'✅ set (' + mistral_key[:8] + '...)' if mistral_key else '❌ NOT SET'}")

    if not _has_any_llm_key():
        log.warning(
            "⚠️  NO LLM API KEYS FOUND — all AI endpoints will use rule-based fallback.\n"
            "     Keys must be in ai_service/services/.env  OR  ai_service/.env"
        )

    try:
        from services.jd_tailor import _get_sentence_model
        model = _get_sentence_model()
        if model:
            log.info("✅ SentenceTransformer loaded")
        else:
            log.warning("⚠️  SentenceTransformer unavailable — keyword fallback active")
    except Exception as e:
        log.warning(f"⚠️  Model warmup failed: {e}")

    from services.llm_client import get_active_backends
    backends = get_active_backends()
    active = [k for k, v in backends.items() if v]
    log.info(f"✅ LLM backends available: {', '.join(active)}")
    log.info("✅ AI Service ready at http://0.0.0.0:8000")
    yield
    log.info("━━━ AI Service shutting down ━━━")


# ══════════════════════════════════════════════════════════════════════════════
# APP
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="AI-powered resume analysis, enhancement, and HR automation API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ══════════════════════════════════════════════════════════════════════════════

class RewriteRequest(BaseModel):
    resumeText:     str
    jobDescription: Optional[str] = None


class ProjectEnhanceRequest(BaseModel):
    projects: List[str] = Field(..., min_items=1)


class JDTailorRequest(BaseModel):
    resumeText:     str
    jobDescription: str


class HRRankRequest(BaseModel):
    candidates: List[Dict[str, Any]]


class HRClusterRequest(BaseModel):
    candidates: List[Dict[str, Any]]
    n_clusters: Optional[int] = Field(default=3, ge=1, le=10)


class HRShortlistRequest(BaseModel):
    candidates: List[Dict[str, Any]]
    threshold:  Optional[int] = Field(default=70, ge=0, le=100)


class SkillSuggestRequest(BaseModel):
    resumeText: str = ""


class ProjectSummaryRequest(BaseModel):
    title:     str
    techStack: str


class JDSuggestionsRequest(BaseModel):
    resumeText:     str = ""
    jobDescription: str


# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
async def root():
    from services.llm_client import get_active_backends
    return {
        "message":  f"{settings.APP_NAME} v{settings.VERSION}",
        "status":   "running",
        "docs":     "http://localhost:8000/docs",
        "backends": get_active_backends(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — ANALYSE FILE
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/analyze-file", tags=["Phase 1"])
async def analyze_file(file: UploadFile = File(...)):
    """
    Upload a resume (PDF or DOCX) and receive ATS analysis.

    Returns:
        ats_score, recommended_role, matched_keywords, explanation,
        ai_data (profile, education, skills), extracted_text
    """
    filename = file.filename or ""
    if not (filename.lower().endswith(".pdf") or filename.lower().endswith(".docx")):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: '{filename}'. Only PDF and DOCX are accepted.",
        )

    content = await file.read()

    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {settings.MAX_FILE_SIZE_MB} MB.",
        )

    try:
        text = extract_text_from_file(content, filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Text extraction failed: {str(e)}")

    if not text or len(text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Resume appears to be empty or could not be read. Please try a different file.",
        )

    try:
        result = advanced_parse_resume(text)
    except Exception as e:
        log.error(f"ATS analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"ATS analysis failed: {str(e)}")

    log.info(
        f"✅ Analyzed '{filename}' — ATS: {result['ats']['ats_score']} "
        f"Role: {result['ats']['recommended_role']} "
        f"Skills: {len(result['ai_data']['skills'])}"
    )

    return {
        "ats_score":        result["ats"]["ats_score"],
        "recommended_role": result["ats"]["recommended_role"],
        "matched_keywords": result["ai_data"]["skills"],
        "explanation":      result["ats"]["feedback"],
        "ai_data":          result["ai_data"],
        "extracted_text":   text,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — AI ENHANCEMENT (existing endpoints)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/rewrite", tags=["Phase 2"])
async def rewrite_endpoint(request: RewriteRequest):
    """
    Rewrite a resume to be ATS-optimised and impactful.
    LLM priority: Groq → OpenAI → Mistral → rule-based (last resort).
    """
    if not request.resumeText.strip():
        raise HTTPException(status_code=400, detail="resumeText must not be empty")
    try:
        return rewrite_resume(request.resumeText, request.jobDescription)
    except Exception as e:
        log.error(f"Rewrite error: {e}")
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")


@app.post("/project-enhance", tags=["Phase 2"])
async def project_enhance_endpoint(request: ProjectEnhanceRequest):
    """Transform plain project descriptions into quantified bullet points."""
    non_empty = [p for p in request.projects if p and p.strip()]
    if not non_empty:
        raise HTTPException(status_code=400, detail="At least one non-empty project is required")
    try:
        return enhance_projects(non_empty)
    except Exception as e:
        log.error(f"Project enhance error: {e}")
        raise HTTPException(status_code=500, detail=f"Project enhancement failed: {str(e)}")


@app.post("/jd-tailor", tags=["Phase 2"])
async def jd_tailor_endpoint(request: JDTailorRequest):
    """Tailor a resume to a specific job description with semantic match score."""
    if not request.resumeText.strip():
        raise HTTPException(status_code=400, detail="resumeText must not be empty")
    if not request.jobDescription.strip():
        raise HTTPException(status_code=400, detail="jobDescription must not be empty")
    try:
        return tailor_resume_to_jd(request.resumeText, request.jobDescription)
    except Exception as e:
        log.error(f"JD tailor error: {e}")
        raise HTTPException(status_code=500, detail=f"JD tailoring failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — NEW ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/suggest-skills", tags=["Phase 2"])
async def suggest_skills_endpoint(request: SkillSuggestRequest):
    """
    Suggest missing / trending skills and certifications.
    LLM priority: Groq → OpenAI → Mistral → rule-based.
    """
    resume_text = request.resumeText.strip()

    if resume_text:
        task_line    = "Analyse the resume below and suggest skills to improve it."
        resume_block = "RESUME TEXT:\n" + resume_text + "\n\n"
    else:
        task_line    = "Suggest the most in-demand skills for software engineers in 2025."
        resume_block = ""

    prompt = f"""You are an expert career coach and technical recruiter.
{task_line}

{resume_block}Return a JSON object with EXACTLY these keys (no markdown, no backticks, plain JSON only):
{{
  "missing_technical": ["list of 5-8 missing/recommended technical skills"],
  "trending": ["list of 5-7 trending skills in 2025 (e.g. LLM Fine-Tuning, RAG, LangChain, Vector Databases, Kubernetes, Terraform, GitHub Actions, GraphQL)"],
  "soft_skills": ["list of 4-6 professional/soft skills (e.g. Cross-functional Collaboration, Technical Communication, Agile / Scrum, Problem Decomposition, Code Review, Mentorship)"],
  "certifications": [
    {{"name": "certification name", "provider": "provider name", "level": "Beginner/Intermediate/Advanced"}}
  ],
  "role_gap_analysis": "2-3 sentence analysis of skill gaps and recommendations"
}}

Return ONLY valid JSON. No explanation, no markdown fences."""

    if _has_any_llm_key():
        try:
            raw    = get_llm_completion(prompt, model="auto", expect_json=True)
            result = _parse_llm_json(raw)
            for key in ["missing_technical", "trending", "soft_skills", "certifications", "role_gap_analysis"]:
                if key not in result:
                    raise ValueError(f"Missing key: {key}")
            log.info("✅ suggest-skills: LLM response used")
            return result
        except Exception as e:
            log.warning(f"suggest-skills LLM failed ({e}), using rule-based fallback")
    else:
        log.warning(
            "suggest-skills: No LLM API key found (GROQ_API_KEY / OPENAI_API_KEY / MISTRAL_API_KEY). "
            "Using rule-based fallback. Add a key to .env for AI-powered suggestions."
        )

    return _rule_based_skill_suggestions(resume_text)


def _rule_based_skill_suggestions(resume_text: str) -> Dict[str, Any]:
    """Deterministic skill suggestions when LLM is unavailable."""
    from services.advanced_resume_ai import extract_skills

    existing = set(s.lower() for s in extract_skills(resume_text)) if resume_text else set()

    all_missing_tech = [
        "Docker", "Kubernetes", "CI/CD Pipelines", "Redis", "System Design",
        "REST API Design", "OAuth2 / JWT", "Cloud Deployment (AWS/GCP/Azure)",
        "GraphQL", "Terraform", "GitHub Actions", "Elasticsearch",
    ]
    missing = [s for s in all_missing_tech if s.lower() not in existing][:8]

    gap_analysis = (
        f"Resume detected {len(existing)} skills. Focus on adding cloud/DevOps skills and "
        "modern AI/ML tooling to significantly improve your ATS score and role match."
        if resume_text else
        "No resume provided — showing the most in-demand skills for software engineers in 2025."
    )

    return {
        "missing_technical": missing,
        "trending": [
            "LLM Fine-Tuning", "RAG (Retrieval-Augmented Generation)", "LangChain",
            "Vector Databases", "Kubernetes", "Terraform", "GitHub Actions", "GraphQL",
        ],
        "soft_skills": [
            "Cross-functional Collaboration", "Technical Communication",
            "Agile / Scrum", "Problem Decomposition", "Code Review", "Mentorship",
        ],
        "certifications": [
            {"name": "AWS Certified Developer – Associate", "provider": "Amazon",    "level": "Intermediate"},
            {"name": "HashiCorp Terraform Associate",       "provider": "HashiCorp", "level": "Intermediate"},
            {"name": "Certified Kubernetes Administrator (CKA)", "provider": "CNCF", "level": "Advanced"},
            {"name": "Google Professional Cloud Developer", "provider": "Google",    "level": "Intermediate"},
        ],
        "role_gap_analysis": gap_analysis,
    }


@app.post("/project-summary", tags=["Phase 2"])
async def project_summary_endpoint(request: ProjectSummaryRequest):
    """Generate a professional project summary. Returns: one_liner, full_summary, highlights, impact_metrics"""
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="title must not be empty")
    if not request.techStack.strip():
        raise HTTPException(status_code=400, detail="techStack must not be empty")

    title      = request.title.strip()
    tech_stack = request.techStack.strip()

    prompt = f"""You are an expert resume writer. Generate a professional project summary for a resume.

PROJECT TITLE: {title}
TECH STACK: {tech_stack}

Return a JSON object with EXACTLY these keys (no markdown, no backticks, plain JSON only):
{{
  "one_liner": "• [Action Verb] {title} using {tech_stack}, delivering [quantified impact]. (1 line, ATS bullet format)",
  "full_summary": "2-3 sentence professional summary of the project, what it does, tech used, and impact",
  "highlights": [
    "Key highlight 1 (technical achievement)",
    "Key highlight 2 (feature or integration)",
    "Key highlight 3 (performance or scale)"
  ],
  "impact_metrics": [
    "Reduced API latency by 35%",
    "Serving 10,000+ daily requests",
    "Zero-downtime deployments"
  ]
}}

Return ONLY valid JSON. No explanation, no markdown fences."""

    if _has_any_llm_key():
        try:
            raw    = get_llm_completion(prompt, model="auto", expect_json=True)
            result = _parse_llm_json(raw)
            for key in ["one_liner", "full_summary", "highlights", "impact_metrics"]:
                if key not in result:
                    raise ValueError(f"Missing key: {key}")
            log.info("✅ project-summary: LLM response used")
            return result
        except Exception as e:
            log.warning(f"project-summary LLM failed ({e}), using rule-based fallback")
    else:
        log.warning("project-summary: No LLM API key found. Using rule-based fallback.")

    return _rule_based_project_summary(title, tech_stack)


def _rule_based_project_summary(title: str, tech_stack: str) -> Dict[str, Any]:
    return {
        "one_liner": (
            f"• Designed {title.upper()} using {tech_stack}, delivering a "
            "production-ready solution with measurable performance improvements."
        ),
        "full_summary": (
            f"Developed {title} using {tech_stack}. "
            "The system provides scalable, high-performance functionality with a clean architecture. "
            "Implemented best practices including automated testing, CI/CD pipelines, and cloud deployment."
        ),
        "highlights": [
            "Implemented RESTful APIs with Spring Boot and OpenAPI docs",
            "Configured JPA/Hibernate with lazy loading for efficiency",
            "Achieved 85%+ unit and integration test coverage with JUnit 5",
        ],
        "impact_metrics": [
            "Reduced API latency by 35%",
            "Serving 10,000+ daily requests",
            "Zero-downtime deployments",
        ],
    }


@app.post("/jd-suggestions", tags=["Phase 2"])
async def jd_suggestions_endpoint(request: JDSuggestionsRequest):
    """Analyse a JD and suggest skills, projects, and keywords to match it."""
    if not request.jobDescription.strip():
        raise HTTPException(status_code=400, detail="jobDescription must not be empty")

    jd     = request.jobDescription.strip()
    resume = request.resumeText.strip()
    resume_section = ("CURRENT RESUME:\n" + resume + "\n\n") if resume else ""

    prompt = f"""You are an expert resume coach. Analyse the job description below and suggest what to add to a resume.

JOB DESCRIPTION:
{jd}

{resume_section}Return a JSON object with EXACTLY these keys (no markdown, no backticks, plain JSON only):
{{
  "skills_to_add": ["list of 8-10 specific skills from the JD the resume should include"],
  "projects_to_add": [
    {{
      "title": "Project title that demonstrates JD requirements",
      "description": "1-2 sentence description of what to build and why it fits the JD",
      "tech_stack": ["list", "of", "technologies"]
    }}
  ],
  "keywords_to_include": ["list of 8-12 ATS keywords from the JD to weave into resume bullets"],
  "action_plan": [
    "Step 1: specific action to take",
    "Step 2: specific action to take",
    "Step 3: specific action to take",
    "Step 4: specific action to take",
    "Step 5: specific action to take"
  ]
}}

Provide 2-3 project ideas. Return ONLY valid JSON. No explanation, no markdown fences."""

    if _has_any_llm_key():
        try:
            raw    = get_llm_completion(prompt, model="auto", expect_json=True)
            result = _parse_llm_json(raw)
            for key in ["skills_to_add", "projects_to_add", "keywords_to_include", "action_plan"]:
                if key not in result:
                    raise ValueError(f"Missing key: {key}")
            log.info("✅ jd-suggestions: LLM response used")
            return result
        except Exception as e:
            log.warning(f"jd-suggestions LLM failed ({e}), using rule-based fallback")
    else:
        log.warning("jd-suggestions: No LLM API key found. Using rule-based fallback.")

    return _rule_based_jd_suggestions(jd)


def _rule_based_jd_suggestions(jd: str) -> Dict[str, Any]:
    from services.jd_tailor import _extract_jd_keywords

    jd_lower    = jd.lower()
    jd_keywords = _extract_jd_keywords(jd)

    is_java      = any(w in jd_lower for w in ["java", "spring", "spring boot"])
    is_react     = any(w in jd_lower for w in ["react", "frontend", "typescript"])
    is_fullstack = is_java and is_react
    is_python    = any(w in jd_lower for w in ["python", "django", "fastapi"])
    is_cloud     = any(w in jd_lower for w in ["aws", "azure", "gcp", "cloud"])
    is_devops    = any(w in jd_lower for w in ["docker", "kubernetes", "ci/cd"])

    skills_raw: List[str] = []
    if is_java:   skills_raw += ["Java", "Spring Boot", "Spring MVC", "Hibernate"]
    if is_react:  skills_raw += ["React", "TypeScript", "Redux"]
    if is_python: skills_raw += ["Python", "FastAPI", "Django"]
    if is_cloud:  skills_raw += ["AWS", "Cloud Deployment"]
    if is_devops: skills_raw += ["Docker", "Kubernetes", "CI/CD"]
    skills_raw += ["REST API", "MySQL", "PostgreSQL", "Git"]

    seen: set = set()
    skills: List[str] = []
    for s in skills_raw:
        if s not in seen:
            seen.add(s)
            skills.append(s)

    tech_1 = ["Spring Boot", "Kafka", "Docker", "PostgreSQL", "API Gateway"] if is_java else ["React", "Node.js", "Redis", "MySQL"]
    tech_2 = ["Spring Boot", "WebSocket", "Redis", "React", "MySQL"] if is_fullstack else ["Python", "FastAPI", "PostgreSQL", "Docker"]

    keywords = jd_keywords[:12] if jd_keywords else [
        "experience", "develop", "maintain", "scalable", "microservices",
        "agile", "REST", "API", "database", "cloud", "testing", "deploy",
    ]

    return {
        "skills_to_add":       skills[:10],
        "projects_to_add": [
            {
                "title": "Microservices Order Management System",
                "description": "Distributed order processing with Spring Boot microservices, API gateway, and Kafka.",
                "tech_stack": tech_1,
            },
            {
                "title": "Real-Time Inventory Tracker",
                "description": "Live inventory dashboard using WebSocket, Redis caching, and a React frontend.",
                "tech_stack": tech_2,
            },
        ],
        "keywords_to_include": keywords,
        "action_plan": [
            f"Add missing skills to your Skills section: {', '.join(skills[:3])}",
            "Build 'Microservices Order Management System' — it directly matches this JD",
            f"Weave these keywords into your bullets: {', '.join(keywords[:4])}",
            "Reorder your Skills section to mirror the JD's technology priority",
            "Tailor your summary/objective to reflect this job's title and requirements",
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# HR AI ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/hr/rank", tags=["HR"])
async def hr_rank_endpoint(request: HRRankRequest):
    if not request.candidates:
        raise HTTPException(status_code=400, detail="candidates list must not be empty")
    try:
        return {"ranked_candidates": rank_candidates(request.candidates)}
    except Exception as e:
        log.error(f"HR rank error: {e}")
        raise HTTPException(status_code=500, detail=f"Ranking failed: {str(e)}")


@app.post("/hr/cluster", tags=["HR"])
async def hr_cluster_endpoint(request: HRClusterRequest):
    if not request.candidates:
        raise HTTPException(status_code=400, detail="candidates list must not be empty")
    try:
        return cluster_candidates(request.candidates, request.n_clusters or 3)
    except Exception as e:
        log.error(f"HR cluster error: {e}")
        raise HTTPException(status_code=500, detail=f"Clustering failed: {str(e)}")


@app.post("/hr/auto-shortlist", tags=["HR"])
async def hr_auto_shortlist_endpoint(request: HRShortlistRequest):
    if not request.candidates:
        raise HTTPException(status_code=400, detail="candidates list must not be empty")
    try:
        return auto_shortlist_by_threshold(request.candidates, request.threshold or 70)
    except Exception as e:
        log.error(f"HR shortlist error: {e}")
        raise HTTPException(status_code=500, detail=f"Auto-shortlisting failed: {str(e)}")


@app.post("/hr/insights", tags=["HR"])
async def hr_insights_endpoint(request: HRRankRequest):
    if not request.candidates:
        raise HTTPException(status_code=400, detail="candidates list must not be empty")
    try:
        return generate_hr_insights(request.candidates)
    except Exception as e:
        log.error(f"HR insights error: {e}")
        raise HTTPException(status_code=500, detail=f"Insights generation failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# ADVANCED PARSE (legacy / dev endpoint)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/ai/advanced-parse", tags=["Dev"])
async def advanced_parse(file: UploadFile = File(...)):
    filename = file.filename or ""
    content  = await file.read()
    try:
        text      = extract_text_from_file(content, filename)
        ai_result = advanced_parse_resume(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "raw_text":      text,
        "ai_structured": ai_result,
        "model":         "PURE_AI_ENGINE_V3",
        "level":         "ADVANCED_AI",
    }


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info",
    )