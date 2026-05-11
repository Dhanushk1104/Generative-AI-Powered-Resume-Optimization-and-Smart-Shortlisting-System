import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = "AI Resume Screening System"
    VERSION: str  = "2.0"
    HOST: str     = "0.0.0.0"
    PORT: int     = 8000

    # ── Optional LLM API keys (leave blank to use local fallback) ──────────
    OPENAI_API_KEY: str  = os.getenv("OPENAI_API_KEY",  "")
    MISTRAL_API_KEY: str = os.getenv("MISTRAL_API_KEY", "")

    # ── LLM backend: "gpt" | "mistral" | "local" ───────────────────────────
    DEFAULT_LLM: str = os.getenv("DEFAULT_LLM", "local")

    # ── ATS scoring ─────────────────────────────────────────────────────────
    ATS_THRESHOLD: int = 70

    # ── NLP models ──────────────────────────────────────────────────────────
    SPACY_MODEL: str                = "en_core_web_sm"
    SENTENCE_TRANSFORMER_MODEL: str = "all-MiniLM-L6-v2"

    # ── File upload limits ───────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int           = 10
    SUPPORTED_FILE_TYPES: list      = [".pdf", ".docx"]

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list = [
        "http://localhost:3000",   # React frontend
        "http://localhost:8080",   # Spring Boot backend
    ]


settings = Settings()
