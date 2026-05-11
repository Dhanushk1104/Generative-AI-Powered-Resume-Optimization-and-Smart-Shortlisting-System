"""
llm_client.py
─────────────
Unified LLM interface with graceful fallback chain:
  Groq   (if GROQ_API_KEY set)       — fastest, free tier
  OpenAI (if OPENAI_API_KEY set)     — GPT-3.5-turbo / GPT-4
  Mistral(if MISTRAL_API_KEY set)    — mistral-small
  GPT-2  (local, always available)   — offline fallback ONLY when NO API keys set
  Rule-based (always available)      — no dependencies

TWO PROCESSES:
  Process 1 — AI Path: Groq -> OpenAI -> Mistral -> GPT-2 (all return normalized output)
  Process 2 — Rule-based Path: triggered ONLY when ALL AI options fail

FIX-LLM-PRIORITY:
  - get_llm_completion() now ALWAYS tries ALL LLM backends before rule-based.
  - Groq is tried REGARDLESS of which other keys are set.
  - Rule-based is a last resort, never the first choice.
  - expect_json=True still skips GPT-2 (can't produce JSON) but still tries
    Groq/OpenAI/Mistral fully before falling back to rule-based JSON.

FIX-GPT2-SKIP:
  - GPT-2 is now SKIPPED entirely when ANY real API key (Groq/OpenAI/Mistral)
    is configured. GPT-2 is only used as a fallback when NO API keys are set at all.
  - This prevents the 24-30s GPT-2 slowdown when cloud LLMs are available.

FIX-HTTP-CLIENT:
  - Both httpx and requests are tried for HTTP calls (httpx preferred).
  - Detailed error logging added so failures are visible in console.
  - Connection timeouts separated from read timeouts for better diagnostics.
"""

import os
import re
import json
import random
import logging
from typing import Optional

log = logging.getLogger("llm_client")

# Module-level cache (lazy loaded)
_gpt2_pipeline = None


def _has_any_api_key() -> bool:
    """Return True if at least one real cloud LLM API key is configured."""
    return bool(
        os.getenv("GROQ_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("MISTRAL_API_KEY")
    )


def get_llm_completion(prompt: str, model: str = "auto", expect_json: bool = False) -> str:
    """
    Main entry point.

    Priority order (ALWAYS):
      1. Groq        (if GROQ_API_KEY set)
      2. OpenAI GPT  (if OPENAI_API_KEY set)
      3. Mistral     (if MISTRAL_API_KEY set)
      4. GPT-2 local (ONLY when NO API keys set AND expect_json=False)
      5. Rule-based  (guaranteed fallback — LAST RESORT ONLY)

    Args:
        prompt:      The prompt to send to the LLM.
        model:       "auto" | "groq" | "gpt" | "mistral" | "local"
                     "auto" tries all available APIs in priority order.
        expect_json: If True, skips GPT-2 (which cannot produce valid JSON)
                     and goes straight to rule-based JSON coercion.
    """
    # Always try AI backends first
    result = _run_ai_process(prompt, model, skip_local=expect_json)

    if result is None:
        log.warning("[llm_client] All AI backends failed — using rule-based fallback (last resort)")
        result = _rule_based_response(prompt)

    if expect_json:
        return _ensure_json(result, prompt)

    return result


def _run_ai_process(prompt: str, model: str, skip_local: bool = False) -> Optional[str]:
    """
    Try every AI backend in priority order.
    Returns None only if ALL backends fail — caller then uses rule-based.

    FIX-LLM-PRIORITY: Groq is ALWAYS attempted first when model=="auto",
    regardless of what other keys are configured.

    FIX-GPT2-SKIP: GPT-2 is skipped entirely when any cloud API key is present.
    This prevents 24-30s delays from GPT-2 inference when Groq/Mistral are available.
    """

    # ── 1. Groq (fastest, free tier — always first) ───────────────────────────
    if model in ("auto", "groq") and os.getenv("GROQ_API_KEY"):
        result = _get_groq_completion(prompt)
        if result:
            return result

    # ── 2. OpenAI GPT ─────────────────────────────────────────────────────────
    if model in ("auto", "gpt") and os.getenv("OPENAI_API_KEY"):
        result = _get_gpt_completion(prompt)
        if result:
            return result

    # ── 3. Mistral ────────────────────────────────────────────────────────────
    if model in ("auto", "mistral") and os.getenv("MISTRAL_API_KEY"):
        result = _get_mistral_completion(prompt)
        if result:
            return result

    # ── 4. GPT-2 local ────────────────────────────────────────────────────────
    # FIX-GPT2-SKIP: Only use GPT-2 when NO cloud API keys are configured.
    # If Groq/OpenAI/Mistral keys exist but the calls failed, return None so
    # the rule-based fallback is used instead of waiting 24-30s for GPT-2.
    if not skip_local and not _has_any_api_key():
        result = _get_local_completion(prompt)
        if result:
            return result

    return None


def _make_http_post(url: str, headers: dict, data: dict, timeout: int = 30) -> Optional[dict]:
    """
    Attempt HTTP POST using httpx first, then requests as fallback.
    Returns parsed JSON dict or None on failure.

    FIX-HTTP-CLIENT: Using httpx as the primary client because it handles
    connection issues more gracefully. Falls back to requests if httpx
    is not installed. Detailed errors are logged for debugging.
    """
    # ── Try httpx first (preferred) ───────────────────────────────────────────
    try:
        import httpx
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=10)) as client:
            response = client.post(url, json=data, headers=headers)
            response.raise_for_status()
            return response.json()
    except ImportError:
        pass  # httpx not installed — fall through to requests
    except Exception as e:
        log.warning(f"[llm_client] httpx POST to {url} failed: {type(e).__name__}: {e}")
        return None

    # ── Fallback: requests ────────────────────────────────────────────────────
    try:
        import requests as req
        response = req.post(url, json=data, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log.warning(f"[llm_client] requests POST to {url} failed: {type(e).__name__}: {e}")
        return None


def _get_groq_completion(prompt: str) -> Optional[str]:
    """
    Call Groq API (llama-3.3-70b-versatile).
    FIX-HTTP-CLIENT: Uses _make_http_post() with dual httpx/requests support.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None

    log.info("[llm_client] Trying Groq (llama-3.3-70b-versatile)...")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert resume writer and career coach. "
                    "Always respond with valid JSON when asked for JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens":  2000,
    }

    try:
        json_data = _make_http_post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            data=data,
            timeout=30,
        )
        if json_data is None:
            log.warning("[llm_client] ⚠️  Groq: HTTP request failed — trying next backend")
            return None

        content = json_data["choices"][0]["message"]["content"]
        if content and content.strip():
            log.info("[llm_client] ✅ Groq responded successfully")
            return content.strip()

        log.warning("[llm_client] ⚠️  Groq: empty content in response")
        return None

    except Exception as e:
        log.warning(f"[llm_client] ⚠️  Groq failed: {type(e).__name__}: {e} — trying next backend")
        return None


def _get_gpt_completion(prompt: str) -> Optional[str]:
    """Call OpenAI GPT-3.5-turbo."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    log.info("[llm_client] Trying OpenAI GPT-3.5-turbo...")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an expert resume writer and career coach."},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.7,
        )
        content = response.choices[0].message.content
        if content and content.strip():
            log.info("[llm_client] ✅ OpenAI GPT responded successfully")
            return content.strip()
        log.warning("[llm_client] ⚠️  OpenAI GPT: empty response")
        return None
    except Exception as e:
        log.warning(f"[llm_client] ⚠️  GPT API failed: {type(e).__name__}: {e} — trying next backend")
        return None


def _get_mistral_completion(prompt: str) -> Optional[str]:
    """
    Call Mistral API (mistral-small-latest).
    FIX-HTTP-CLIENT: Uses _make_http_post() with dual httpx/requests support.
    FIX-MODEL-NAME: Updated to 'mistral-small-latest' (mistral-small deprecated).
    """
    api_key = os.getenv("MISTRAL_API_KEY", "").strip()
    if not api_key:
        return None

    log.info("[llm_client] Trying Mistral (mistral-small-latest)...")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": "You are an expert resume writer and career coach."},
            {"role": "user",   "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens":  2000,
    }

    try:
        json_data = _make_http_post(
            "https://api.mistral.ai/v1/chat/completions",
            headers=headers,
            data=data,
            timeout=30,
        )
        if json_data is None:
            log.warning("[llm_client] ⚠️  Mistral: HTTP request failed — trying next backend")
            return None

        content = (
            json_data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if content and content.strip():
            log.info("[llm_client] ✅ Mistral responded successfully")
            return content.strip()

        log.warning("[llm_client] ⚠️  Mistral: empty content in response")
        return None

    except Exception as e:
        log.warning(f"[llm_client] ⚠️  Mistral API failed: {type(e).__name__}: {e} — trying next backend")
        return None


def _get_local_completion(prompt: str) -> Optional[str]:
    """
    GPT-2 local inference — ONLY used when NO cloud API keys are configured.
    FIX-GPT2-SKIP: _run_ai_process() guards this with _has_any_api_key() check.
    """
    global _gpt2_pipeline
    try:
        from transformers import pipeline
        if _gpt2_pipeline is None:
            log.info("[llm_client] Loading GPT-2 pipeline (first call only)...")
            _gpt2_pipeline = pipeline("text-generation", model="gpt2")
        short_prompt = prompt[-500:] if len(prompt) > 500 else prompt
        result = _gpt2_pipeline(
            short_prompt,
            max_new_tokens=200,
            num_return_sequences=1,
            pad_token_id=50256,
            truncation=True,
            do_sample=True,
            temperature=0.7,
        )
        generated = result[0].get("generated_text", "")
        if generated.startswith(short_prompt):
            generated = generated[len(short_prompt):].strip()
        if not generated or len(generated.strip()) < 10:
            log.warning("[llm_client] GPT-2 returned empty/too-short output — trying rule-based")
            return None
        return generated
    except Exception as e:
        log.warning(f"[llm_client] Local GPT-2 failed: {e}")
        return None


def _rule_based_response(prompt: str) -> str:
    """
    Pure rule-based generation — no ML, no network.
    LAST RESORT ONLY — only called when every LLM backend has failed.
    """
    log.info("[llm_client] 🔄 Using rule-based fallback (all LLMs unavailable)")
    if any(kw in prompt.lower() for kw in ["rewrite", "enhance", "improve", "tailor"]):
        return _improve_text_with_rules(prompt)
    if any(kw in prompt.lower() for kw in ["skill", "suggest", "recommend"]):
        return _suggest_skills_rules(prompt)
    return "Enhanced resume with improved structure, professional language, and ATS-friendly formatting."


def _improve_text_with_rules(text: str) -> str:
    """Replace weak verbs with strong action verbs."""
    weak_to_strong = {
        r"\bmade\b":             "developed",
        r"\bdid\b":              "executed",
        r"\bworked on\b":        "contributed to",
        r"\bhelped\b":           "facilitated",
        r"\bused\b":             "leveraged",
        r"\bgot\b":              "achieved",
        r"\bwrote\b":            "authored",
        r"\bfixed\b":            "resolved",
        r"\bhandled\b":          "managed",
        r"\bwas in charge of\b": "led",
    }
    improved = text
    for pattern, replacement in weak_to_strong.items():
        improved = re.sub(pattern, replacement, improved, flags=re.IGNORECASE)
    return improved


def _suggest_skills_rules(prompt: str) -> str:
    """Return a sensible default skill list when AI is unavailable."""
    default_skills = [
        "Communication", "Problem Solving", "Team Collaboration",
        "Time Management", "Critical Thinking", "Adaptability",
        "Project Management", "Attention to Detail",
    ]
    return ", ".join(default_skills)


def _ensure_json(text: str, prompt: str) -> str:
    """
    Guarantee the returned string is valid JSON.
    Priority:
      1. text is already valid JSON → return as-is
      2. text contains a JSON block → extract and return it
      3. Build a structured JSON from the plain text (rule-based safety net)
    """
    # 1. Already valid JSON?
    try:
        json.loads(text)
        return text
    except (json.JSONDecodeError, TypeError):
        pass

    # 2. Contains a JSON block?
    json_match = re.search(r"```json\s*([\s\S]+?)\s*```", text)
    if not json_match:
        json_match = re.search(r"(\{[\s\S]+\}|\[[\s\S]+\])", text)
    if json_match:
        candidate = json_match.group(1).strip()
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # 3. Build structured fallback JSON based on prompt context
    prompt_lower = prompt.lower()

    if "missing_technical" in prompt_lower or (
        "certification" in prompt_lower and "trending" in prompt_lower
    ):
        payload = {
            "missing_technical": ["Docker", "Kubernetes", "CI/CD Pipelines", "Redis", "System Design"],
            "trending": ["LLM Fine-Tuning", "RAG", "LangChain", "Vector Databases", "Kubernetes"],
            "soft_skills": [
                "Cross-functional Collaboration", "Technical Communication",
                "Agile / Scrum", "Problem Decomposition",
            ],
            "certifications": [
                {"name": "AWS Certified Developer - Associate", "provider": "Amazon",  "level": "Intermediate"},
                {"name": "Certified Kubernetes Administrator (CKA)", "provider": "CNCF", "level": "Advanced"},
            ],
            "role_gap_analysis": (
                "Focus on cloud and DevOps skills to improve ATS score and role match. "
                "Add LLM/AI skills (RAG, LangChain) for maximum 2025 relevance."
            ),
        }
    elif "one_liner" in prompt_lower or "full_summary" in prompt_lower:
        payload = {
            "one_liner": "Designed the project delivering a production-ready solution with measurable improvements.",
            "full_summary": (
                "Developed a scalable system using modern technologies with best practices "
                "including automated testing and CI/CD pipelines."
            ),
            "highlights": [
                "Implemented RESTful APIs",
                "Configured database with lazy loading",
                "Achieved 85%+ test coverage",
            ],
            "impact_metrics": [
                "Reduced API latency by 35%",
                "Serving 10,000+ daily requests",
                "Zero-downtime deployments",
            ],
        }
    elif "skills_to_add" in prompt_lower or "keywords_to_include" in prompt_lower:
        payload = {
            "skills_to_add": ["Docker", "Kubernetes", "REST API", "MySQL", "Git", "CI/CD", "Spring Boot", "AWS"],
            "projects_to_add": [
                {
                    "title": "Microservices Order Management System",
                    "description": "Distributed order processing with Spring Boot microservices and Kafka.",
                    "tech_stack": ["Spring Boot", "Kafka", "Docker", "PostgreSQL"],
                }
            ],
            "keywords_to_include": [
                "microservices", "REST API", "agile", "scalable", "cloud", "docker", "CI/CD", "database",
            ],
            "action_plan": [
                "Add missing skills to your Skills section",
                "Build a microservices project to match the JD",
                "Weave JD keywords into your bullet points",
                "Reorder Skills section to mirror JD priority",
                "Tailor your summary to reflect the job title",
            ],
        }
    elif any(kw in prompt_lower for kw in ["rewrite", "enhance", "improve"]):
        payload = {"enhanced_text": text.strip(), "source": "rule-based"}
    else:
        payload = {"result": text.strip(), "source": "rule-based"}

    return json.dumps(payload, ensure_ascii=False)


def enhance_with_quantification(text: str) -> str:
    quantifiers = [
        "improving efficiency by 40%",
        "reducing processing time by 50%",
        "serving 100+ users",
        "achieving 30% performance gain",
        "cutting deployment time by 60%",
    ]
    has_metric = any(
        kw in text.lower()
        for kw in ["by", "improved", "reduced", "increased", "%", "users", "clients"]
    )
    if not has_metric:
        text = text.rstrip(".") + f", thereby {random.choice(quantifiers)}."
    return text


def get_active_backends() -> dict:
    """Returns which LLM backends are currently configured."""
    return {
        "groq":       bool(os.getenv("GROQ_API_KEY")),
        "openai":     bool(os.getenv("OPENAI_API_KEY")),
        "mistral":    bool(os.getenv("MISTRAL_API_KEY")),
        "gpt2":       not _has_any_api_key(),   # GPT-2 only active when no API keys set
        "rule_based": True,
    }