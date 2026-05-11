"""
advanced_resume_ai.py
─────────────────────
Phase 1 — ATS analysis engine with real-time LLM scoring.

MERGE NOTE:
  Document 5 (LLM version) + Document 6 (rule-based bug-fix version)
  merged into a single authoritative file. Every fix from both versions
  is present. The LLM engine is the primary scorer; the rule-based engine
  is the offline fallback.

─── LLM-SCORE-1 (from Doc 5) ────────────────────────────────────────────────
  ATS score now calculated by a real LLM (Groq → Mistral → rule-based
  fallback). The LLM receives the full resume text and returns structured
  JSON with: ats_score, breakdown (7 dimensions), details, recommended_role,
  role_matches (top 3 with percentages), feedback_summary.

─── BUG FIXES (from Doc 6) ───────────────────────────────────────────────────
  BUG-FIX-1 : advanced_parse_resume() returns BOTH nested structure AND flat
               top-level keys (ats_score, recommended_role, matched_keywords)
               so Java Spring controllers can read the top-level JSON directly.

  BUG-FIX-2 : extract_skills() — multi-word skill matching fixed.
               Phrases like "machine learning", "spring boot", "rest api"
               now use substring search instead of broken word-boundary regex.

  BUG-FIX-3 : calculate_ats_score_detailed() — COMPLETELY REDESIGNED
               graduated 7-dimension algorithm (kept as rule-based fallback):
                 Minimal fresher   → 13–25
                 Average fresher   → 45–60
                 Good fresher      → 60–75
                 Experienced dev   → 80–97
               Dimensions: Skills(25) | Projects(20) | Experience(20) |
               Education(15) | Certs(10) | Contact(5) | Format(5).

  BUG-FIX-4 : predict_role() — "Software Engineer" reliable fallback so
               Suggested Role is never blank on the frontend.

  BUG-FIX-5 : extract_education() CGPA regex improved — "cgpa: 8.9",
               "8.5/10", "8.5 / 10", "85.5%", "gpa: 3.8" all captured.

  BUG-FIX-6 : extract_education() college name now captures the FULL LINE
               containing the institution keyword (not just from the keyword).
               "Vels Institute of Science, Technology & Advanced Studies" no
               longer truncated to "Institute of Science...".

  BUG-FIX-7 : extract_education() — label prefixes like "Education:",
               "From:", "Institution:" are stripped from the college name.

  BUG-FIX-8 : generate_feedback() expanded with per-section breakdown and
               targeted improvement advice.

  SKILL-EXPAND-1 : SKILL_DB expanded from ~55 to 140+ industry-standard
               skills covering AI/ML, cloud-native, DevOps, modern web,
               mobile, data engineering, security, and testing.

  SCORE-DETAIL-1 : calculate_ats_score_detailed() exposes per-dimension
               breakdown so the React frontend can power the strength meter.

  DATA-FIX-1 through DATA-FIX-4, CLEAN-1: all preserved from original.
"""

import re
import os
import json
import logging
from typing import Dict, List, Any, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# SKILL DATABASE  (SKILL-EXPAND-1: extended from ~55 to 140+ skills)
# ══════════════════════════════════════════════════════════════════════════════

SKILL_DB = {
    # ── Programming Languages ─────────────────────────────────────────────────
    "python", "java", "c", "c++", "c#", "javascript", "typescript",
    "sql", "html", "css", "kotlin", "swift", "go", "golang", "rust",
    "scala", "r", "php", "ruby", "perl", "bash", "shell", "powershell",
    "dart", "matlab", "groovy", "lua", "elixir", "haskell", "cobol",
    "fortran", "assembly", "vhdl", "verilog", "solidity", "abap",
    "objective-c", "f#", "ocaml", "clojure", "erlang", "zig", "nim",

    # ── Frontend Frameworks / Libraries ──────────────────────────────────────
    "react", "angular", "vue", "next.js", "nuxt.js", "gatsby", "svelte",
    "bootstrap", "tailwind css", "tailwind", "material ui", "ant design",
    "redux", "zustand", "react query", "graphql", "apollo",
    "webpack", "vite", "babel", "parcel", "rollup", "esbuild",
    "storybook", "styled components", "emotion", "chakra ui",
    "three.js", "d3.js", "chart.js", "highcharts", "echarts",
    "rxjs", "mobx", "recoil", "pinia", "vuex",
    "html5", "css3", "sass", "scss", "less",
    "web components", "pwa", "spa", "ssr", "ssg",
    "accessibility", "wcag", "responsive design", "cross browser",

    # ── Backend Frameworks ────────────────────────────────────────────────────
    "node.js", "express", "express.js", "django", "flask", "fastapi",
    "spring", "spring boot", "spring mvc", "spring security", "spring cloud",
    "hibernate", "jpa", "maven", "gradle",
    "rails", "ruby on rails", "laravel", "symfony", "codeigniter",
    "asp.net", ".net core", "dotnet", "blazor",
    "quarkus", "micronaut", "ktor", "vertx",
    "hapi.js", "koa.js", "nest.js", "nestjs", "strapi",
    "gin", "fiber", "echo", "chi",
    "actix", "axum", "rocket",
    "celery", "dramatiq", "rq",
    "graphql", "rest", "grpc", "websocket",

    # ── Mobile ────────────────────────────────────────────────────────────────
    "android", "ios", "react native", "flutter", "xamarin",
    "jetpack compose", "swiftui", "kotlin multiplatform",
    "ionic", "capacitor", "cordova", "expo",
    "mobile development", "push notifications", "firebase fcm",
    "app store", "google play", "mobile ui", "responsive",

    # ── AI / ML / Data Science ────────────────────────────────────────────────
    "machine learning", "deep learning", "nlp", "natural language processing",
    "computer vision", "tensorflow", "pytorch", "scikit-learn", "sklearn",
    "opencv", "yolov5", "yolov8", "yolo", "keras", "huggingface", "transformers",
    "llm", "large language model", "generative ai", "gen ai",
    "bert", "gpt", "gpt-4", "claude", "llama", "mistral", "gemini",
    "langchain", "llamaindex", "vector database", "rag", "retrieval augmented generation",
    "reinforcement learning", "neural network", "cnn", "rnn", "lstm", "gru", "transformer",
    "xgboost", "lightgbm", "catboost", "random forest", "gradient boosting",
    "mlops", "model deployment", "feature engineering", "feature selection",
    "a/b testing", "statistical analysis", "data science", "bayesian",
    "time series", "anomaly detection", "recommendation system",
    "text classification", "sentiment analysis", "named entity recognition",
    "image classification", "object detection", "image segmentation",
    "speech recognition", "text to speech", "multimodal",
    "prompt engineering", "fine tuning", "lora", "rlhf",
    "embedding", "similarity search", "faiss", "pinecone", "weaviate", "chroma",
    "data labeling", "annotation", "synthetic data",
    "model evaluation", "cross validation", "hyperparameter tuning",
    "pca", "t-sne", "umap", "clustering", "k-means", "dbscan",
    "linear regression", "logistic regression", "svm", "naive bayes",
    "jupyter", "jupyter notebook", "google colab", "kaggle",

    # ── Databases ─────────────────────────────────────────────────────────────
    "mysql", "postgresql", "mongodb", "firebase", "oracle", "sqlite",
    "redis", "cassandra", "elasticsearch", "dynamodb", "couchdb",
    "neo4j", "influxdb", "snowflake", "bigquery", "aurora",
    "ms sql server", "sql server", "mariadb", "cockroachdb",
    "supabase", "planetscale", "tidb", "clickhouse",
    "database design", "database optimization", "query optimization",
    "indexing", "sharding", "replication", "partitioning",
    "stored procedures", "triggers", "views", "orm",
    "acid", "transactions", "nosql", "newsql",
    "timescaledb", "questdb", "prometheus tsdb",

    # ── Cloud Platforms ───────────────────────────────────────────────────────
    "aws", "azure", "gcp", "google cloud", "heroku", "digitalocean",
    "vercel", "netlify", "cloudflare", "linode", "vultr", "oracle cloud",
    "ec2", "s3", "lambda", "rds", "sqs", "sns", "ecs", "eks",
    "cloudfront", "route53", "vpc", "iam", "cloudwatch", "cloudformation",
    "azure devops", "azure functions", "azure blob", "azure ad",
    "gke", "cloud run", "cloud functions", "bigquery", "pub/sub",
    "serverless framework", "sam", "cdk", "pulumi",
    "multi cloud", "hybrid cloud", "cloud migration", "cloud architecture",
    "cost optimization", "cloud security", "well architected",

    # ── DevOps / Infrastructure ───────────────────────────────────────────────
    "docker", "kubernetes", "terraform", "ansible", "puppet", "chef",
    "jenkins", "ci/cd", "github actions", "gitlab ci", "circleci",
    "linux", "ubuntu", "centos", "rhel", "debian", "alpine",
    "nginx", "apache", "tomcat", "haproxy", "traefik",
    "helm", "istio", "prometheus", "grafana", "elk stack",
    "vagrant", "packer", "pulumi", "crossplane",
    "argocd", "flux", "gitops", "devsecops",
    "monitoring", "alerting", "logging", "observability", "tracing",
    "jaeger", "zipkin", "opentelemetry",
    "site reliability engineering", "sre", "chaos engineering",
    "infrastructure as code", "iac", "configuration management",
    "service mesh", "api gateway", "load balancing", "auto scaling",
    "blue green deployment", "canary deployment", "rolling update",

    # ── Message Queues / Streaming ────────────────────────────────────────────
    "kafka", "rabbitmq", "activemq", "nats", "pulsar",
    "apache kafka", "apache spark", "apache flink", "apache storm",
    "event streaming", "event driven architecture", "cqrs", "event sourcing",
    "message broker", "pub sub", "queue", "dead letter queue",

    # ── Version Control / Collaboration ──────────────────────────────────────
    "git", "github", "gitlab", "bitbucket", "svn", "mercurial",
    "jira", "confluence", "trello", "notion", "linear", "asana",
    "code review", "pull request", "branching strategy", "gitflow",
    "monorepo", "nx", "turborepo",

    # ── Testing ───────────────────────────────────────────────────────────────
    "junit", "testng", "mockito", "jest", "mocha", "chai", "jasmine",
    "selenium", "cypress", "playwright", "puppeteer", "pytest", "unittest",
    "postman", "rest assured", "karate", "gatling", "locust", "k6",
    "tdd", "bdd", "cucumber", "test automation", "e2e testing",
    "unit testing", "integration testing", "performance testing",
    "load testing", "stress testing", "smoke testing", "regression testing",
    "code coverage", "sonarqube", "mutation testing",

    # ── Security ──────────────────────────────────────────────────────────────
    "oauth", "oauth2", "jwt", "ssl", "tls", "https",
    "oauth2 / jwt", "cybersecurity", "owasp", "penetration testing",
    "vulnerability assessment", "sast", "dast", "siem",
    "zero trust", "identity management", "sso", "saml",
    "encryption", "hashing", "secrets management", "vault",
    "firewall", "waf", "ddos protection", "intrusion detection",
    "compliance", "gdpr", "hipaa", "soc2", "iso 27001",

    # ── Data / Analytics ──────────────────────────────────────────────────────
    "numpy", "pandas", "matplotlib", "seaborn", "plotly", "bokeh",
    "tableau", "power bi", "excel", "looker", "metabase", "superset",
    "spark", "hadoop", "hive", "airflow", "dbt", "prefect", "dagster",
    "etl", "elt", "data pipeline", "data warehouse", "data lake", "data lakehouse",
    "data modeling", "data governance", "data quality", "data catalog",
    "apache beam", "google dataflow", "aws glue", "azure data factory",
    "business intelligence", "bi", "reporting", "dashboard",
    "data visualization", "kpi", "metrics", "data driven",
    "delta lake", "apache iceberg", "apache hudi",

    # ── Web / API ─────────────────────────────────────────────────────────────
    "rest api", "restful api", "microservices", "api", "websocket",
    "grpc", "soap", "openapi", "swagger", "api documentation",
    "api gateway", "load balancer", "reverse proxy", "cdn",
    "http", "https", "http/2", "http/3", "tcp/ip", "dns",
    "web scraping", "web crawling", "beautifulsoup", "scrapy", "selenium",
    "oauth", "api versioning", "rate limiting", "throttling",

    # ── Design Tools ──────────────────────────────────────────────────────────
    "figma", "adobe xd", "sketch", "invision", "zeplin",
    "adobe photoshop", "adobe illustrator", "canva",
    "ui design", "ux design", "wireframing", "prototyping",
    "design system", "user research", "usability testing",
    "interaction design", "information architecture",

    # ── Development Practices ─────────────────────────────────────────────────
    "agile", "scrum", "kanban", "devops", "system design",
    "object oriented programming", "oop", "design patterns", "solid principles",
    "microservices architecture", "event driven", "serverless",
    "domain driven design", "ddd", "clean architecture", "hexagonal architecture",
    "functional programming", "reactive programming",
    "code review", "pair programming", "refactoring", "technical debt",
    "documentation", "api documentation", "architecture documentation",
    "low level design", "high level design", "lld", "hld",

    # ── IDE / Dev Tools ───────────────────────────────────────────────────────
    "vs code", "intellij", "eclipse", "pycharm", "android studio",
    "xcode", "visual studio", "vim", "neovim", "emacs",
    "postman", "insomnia", "dbeaver", "datagrip",

    # ── Blockchain / Web3 ─────────────────────────────────────────────────────
    "blockchain", "ethereum", "solidity", "web3", "smart contracts",
    "nft", "defi", "hardhat", "truffle", "metamask", "ipfs",

    # ── Embedded / IoT ────────────────────────────────────────────────────────
    "embedded systems", "iot", "arduino", "raspberry pi", "rtos",
    "firmware", "uart", "spi", "i2c", "can bus", "modbus",
    "mqtt", "zigbee", "bluetooth", "ble", "lorawan",

    # ── Game Development ──────────────────────────────────────────────────────
    "unity", "unreal engine", "godot", "game development",
    "opengl", "vulkan", "directx", "webgl",
    "physics engine", "shader", "hlsl", "glsl",
}


# ══════════════════════════════════════════════════════════════════════════════
# ROLE KEYWORDS
# ══════════════════════════════════════════════════════════════════════════════

ROLE_KEYWORDS: Dict[str, List[str]] = {
    "Java Developer": [
        "java", "spring", "spring boot", "spring mvc", "spring security",
        "hibernate", "jpa", "maven", "gradle", "junit", "testng", "mockito",
        "rest api", "microservices", "multithreading", "jvm", "tomcat",
        "mysql", "postgresql", "redis", "kafka", "docker", "kubernetes",
        "design patterns", "solid principles", "oop", "ci/cd",
    ],
    "Python Developer": [
        "python", "django", "flask", "fastapi", "pandas", "numpy",
        "celery", "sqlalchemy", "pytest", "pydantic", "asyncio",
        "rest api", "microservices", "postgresql", "redis", "mongodb",
        "docker", "linux", "git", "ci/cd", "scripting", "automation",
    ],
    "Full Stack Developer": [
        "react", "angular", "vue", "next.js", "node.js", "express",
        "javascript", "typescript", "html", "css", "tailwind", "bootstrap",
        "rest api", "graphql", "mongodb", "postgresql", "mysql",
        "docker", "git", "ci/cd", "aws", "vercel", "netlify",
        "frontend", "backend", "api", "responsive design",
    ],
    "Frontend Developer": [
        "react", "angular", "vue", "next.js", "svelte", "javascript",
        "typescript", "html5", "css3", "sass", "tailwind css", "bootstrap",
        "redux", "zustand", "react query", "graphql", "webpack", "vite",
        "jest", "cypress", "playwright", "storybook", "figma",
        "responsive design", "accessibility", "wcag", "performance optimization",
        "ui", "ux", "cross browser", "pwa", "spa",
    ],
    "Backend Developer": [
        "rest api", "microservices", "node.js", "express", "nestjs",
        "java", "spring boot", "python", "django", "fastapi", "flask",
        "postgresql", "mysql", "mongodb", "redis", "kafka", "rabbitmq",
        "docker", "kubernetes", "aws", "ci/cd", "linux",
        "authentication", "jwt", "oauth2", "api gateway", "grpc",
        "database design", "query optimization", "caching",
    ],
    "Data Scientist": [
        "python", "machine learning", "deep learning", "pandas", "numpy",
        "scikit-learn", "tensorflow", "pytorch", "keras", "xgboost",
        "nlp", "computer vision", "statistical analysis", "a/b testing",
        "jupyter", "matplotlib", "seaborn", "plotly", "tableau",
        "sql", "spark", "feature engineering", "model evaluation",
        "hypothesis testing", "regression", "classification", "clustering",
        "time series", "data visualization", "kaggle", "google colab",
    ],
    "ML Engineer": [
        "machine learning", "deep learning", "tensorflow", "pytorch", "keras",
        "mlops", "model deployment", "docker", "kubernetes", "airflow",
        "feature engineering", "model evaluation", "hyperparameter tuning",
        "python", "scikit-learn", "xgboost", "lightgbm",
        "aws sagemaker", "azure ml", "vertex ai", "mlflow", "kubeflow",
        "ci/cd", "rest api", "grpc", "vector database", "rag",
        "llm", "fine tuning", "prompt engineering", "huggingface",
    ],
    "DevOps Engineer": [
        "docker", "kubernetes", "terraform", "ansible", "jenkins",
        "ci/cd", "github actions", "gitlab ci", "aws", "azure", "gcp",
        "linux", "bash", "python", "helm", "argocd", "gitops",
        "prometheus", "grafana", "elk stack", "monitoring", "alerting",
        "nginx", "load balancer", "vpc", "iam", "security",
        "infrastructure as code", "sre", "devsecops", "observability",
    ],
    "Cloud Engineer": [
        "aws", "azure", "gcp", "google cloud", "terraform", "pulumi",
        "docker", "kubernetes", "serverless", "lambda", "cloud functions",
        "ec2", "s3", "rds", "vpc", "iam", "cloudfront",
        "cloud architecture", "cloud migration", "cloud security",
        "cost optimization", "multi cloud", "hybrid cloud",
        "ci/cd", "devops", "infrastructure as code",
    ],
    "Data Analyst": [
        "sql", "excel", "tableau", "power bi", "looker", "metabase",
        "pandas", "python", "numpy", "matplotlib", "seaborn",
        "data visualization", "dashboard", "reporting", "kpi",
        "a/b testing", "statistical analysis", "business intelligence",
        "etl", "data pipeline", "data cleaning", "data modeling",
        "mysql", "postgresql", "bigquery", "snowflake", "google sheets",
    ],
    "Android Developer": [
        "android", "kotlin", "java", "jetpack compose", "android studio",
        "mvvm", "retrofit", "room", "hilt", "dagger", "coroutines",
        "firebase", "google play", "push notifications", "rest api",
        "sqlite", "rxjava", "livedata", "viewmodel", "navigation component",
    ],
    "iOS Developer": [
        "ios", "swift", "swiftui", "objective-c", "xcode",
        "cocoapods", "spm", "core data", "combine", "uikit",
        "rest api", "firebase", "app store", "push notifications",
        "mvvm", "mvc", "arkit", "coreml",
    ],
    "Data Engineer": [
        "python", "sql", "spark", "hadoop", "kafka", "airflow",
        "dbt", "etl", "elt", "data pipeline", "data warehouse",
        "snowflake", "bigquery", "redshift", "delta lake",
        "aws", "gcp", "azure", "docker", "kubernetes",
        "data modeling", "data governance", "data quality",
        "postgresql", "mongodb", "redis", "elasticsearch",
    ],
    "Security Engineer": [
        "cybersecurity", "penetration testing", "vulnerability assessment",
        "owasp", "sast", "dast", "siem", "zero trust",
        "oauth2", "jwt", "ssl", "tls", "encryption",
        "firewall", "waf", "intrusion detection", "soc",
        "gdpr", "hipaa", "soc2", "compliance", "vault",
        "python", "linux", "bash", "network security",
    ],
    "Embedded Engineer": [
        "embedded systems", "c", "c++", "rtos", "firmware",
        "arduino", "raspberry pi", "uart", "spi", "i2c",
        "iot", "mqtt", "bluetooth", "ble", "lorawan",
        "microcontroller", "fpga", "vhdl", "verilog",
        "linux", "assembly", "can bus", "modbus",
    ],
}


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE EXTRACTION  (DATA-FIX-1: name heuristic preserved)
# ══════════════════════════════════════════════════════════════════════════════

def extract_profile(text: str) -> Dict:
    """
    Extract name, email, phone, LinkedIn, and GitHub from resume text.
    LinkedIn and GitHub added to support contact completeness scoring.
    """
    # Email
    email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    email = email_match.group() if email_match else None

    # Phone — supports +country code and common separators
    phone_match = re.search(
        r"(\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}", text
    )
    phone = phone_match.group().strip() if phone_match else None

    # LinkedIn URL
    linkedin_match = re.search(r"linkedin\.com/in/[a-zA-Z0-9\-_%]+", text, re.IGNORECASE)
    linkedin = linkedin_match.group() if linkedin_match else None

    # GitHub URL
    github_match = re.search(r"github\.com/[a-zA-Z0-9\-_%]+", text, re.IGNORECASE)
    github = github_match.group() if github_match else None

    # ── Name heuristic (DATA-FIX-1) ──────────────────────────────────────────
    name = None
    name_pattern = re.compile(r"^[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3}$")
    for line in text.split("\n")[:15]:
        line = line.strip()
        if not line:
            continue
        if "@" in line or "http" in line or re.search(r"\d{5,}", line):
            continue
        if re.search(
            r"(resume|curriculum|vitae|cv|profile|objective|summary|education|skills)",
            line, re.IGNORECASE,
        ):
            continue
        if name_pattern.match(line) and len(line) >= 4:
            name = line
            break

    return {
        "name":     name,
        "email":    email,
        "phone":    phone,
        "linkedin": linkedin,
        "github":   github,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SKILLS EXTRACTION  (BUG-FIX-2: multi-word skills + SKILL-EXPAND-1)
# ══════════════════════════════════════════════════════════════════════════════

def extract_skills(text: str) -> List[str]:
    """
    Match skills from SKILL_DB against resume text (case-insensitive).

    BUG-FIX-2: Multi-word skills (e.g. "spring boot", "machine learning",
    "rest api") are matched via simple substring search. Single-word skills
    use word-boundary regex to avoid partial matches like "c" inside "bachelor".
    """
    text_low = text.lower()
    found: set = set()
    for skill in SKILL_DB:
        if " " in skill:
            # Multi-word: simple substring match — correct and fast
            if skill in text_low:
                found.add(skill.title())
        else:
            # Single-word: word boundary to avoid false positives
            pattern = r"\b" + re.escape(skill) + r"\b"
            if re.search(pattern, text_low):
                found.add(skill.title())
    return sorted(found)


# ══════════════════════════════════════════════════════════════════════════════
# EDUCATION EXTRACTION  (BUG-FIX-5 + BUG-FIX-6 + BUG-FIX-7)
# ══════════════════════════════════════════════════════════════════════════════

LOCATIONS = [
    # ── Indian cities ─────────────────────────────────────────────────────────
    "chennai", "bangalore", "bengaluru", "hyderabad", "delhi", "mumbai",
    "pune", "coimbatore", "madurai", "salem", "erode", "tiruppur",
    "trichy", "tiruchirappalli", "vellore", "kochi", "kolkata", "ahmedabad",
    "surat", "jaipur", "lucknow", "nagpur", "indore", "bhopal", "patna",
    "noida", "gurgaon", "gurugram", "chandigarh", "vadodara",
    "nellore", "vijayawada", "visakhapatnam", "vizag", "mangalore",
    "mysuru", "mysore", "hubli", "belgaum",
    "kattankulathur", "perungalathur", "tambaram",
    # ── Indian states ─────────────────────────────────────────────────────────
    "tamil nadu", "karnataka", "kerala", "andhra pradesh", "telangana",
    "maharashtra", "gujarat", "rajasthan", "uttar pradesh", "west bengal",
    "madhya pradesh", "bihar", "punjab", "haryana", "odisha",
    # ── Countries ─────────────────────────────────────────────────────────────
    "india", "usa", "uk", "canada", "australia", "germany", "singapore",
    "united states", "united kingdom",
]

_LOCATION_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(loc) for loc in LOCATIONS) + r")\b",
    re.IGNORECASE,
)

# Keywords that mark a line as an institution name
_INSTITUTION_KEYWORD_RE = re.compile(
    r"(college|institute|university|polytechnic|school of)",
    re.IGNORECASE,
)

# Label prefixes to strip from extracted college name (BUG-FIX-7)
_LABEL_PREFIX_RE = re.compile(
    r"^(education|qualification|from|at|institution|college|school|university)\s*[:\-]\s*",
    re.IGNORECASE,
)


def extract_education(text: str) -> Dict:
    """
    Extract degree, CGPA, college name, and location from resume text.

    BUG-FIX-5 : Broader CGPA patterns capture more formats.
    BUG-FIX-6 : College name extracted from the FULL LINE containing the
                institution keyword — no longer anchored at the keyword
                position. "Vels Institute of Science, Technology & Advanced
                Studies" is no longer truncated to "Institute of Science...".
    BUG-FIX-7 : Label prefixes ("Education:", "From:") stripped from name.
    """
    text_low = text.lower()

    # ── Degree ────────────────────────────────────────────────────────────────
    degree = None
    degree_patterns = [
        r"b\.?tech\b", r"m\.?tech\b", r"b\.?e\.?\b", r"b\.?sc\b", r"m\.?sc\b",
        r"b\.?ca\b",   r"m\.?ca\b",   r"b\.?com\b",  r"m\.?com\b", r"m\.?b\.?a\b",
        r"ph\.?d\b",   r"bachelor\s+of\s+\w+", r"master\s+of\s+\w+",
        r"bachelor",   r"master",     r"diploma",
    ]
    for pat in degree_patterns:
        m = re.search(pat, text_low)
        if m:
            degree = m.group().strip().upper()
            break

    # ── CGPA / GPA (BUG-FIX-5) ───────────────────────────────────────────────
    # More specific patterns listed first to avoid partial matches
    cgpa = None
    cgpa_patterns = [
        r"cgpa\s*[:\-]?\s*(\d+\.?\d*)\s*/\s*10",     # cgpa: 8.5/10
        r"cgpa\s*[:\-]?\s*(\d+\.?\d*)",               # cgpa: 8.5
        r"gpa\s*[:\-]?\s*(\d+\.?\d*)\s*/\s*4\.?0?",  # gpa: 3.8/4.0
        r"gpa\s*[:\-]?\s*(\d+\.?\d*)",                # gpa: 3.8
        r"(\d+\.?\d*)\s*/\s*10",                      # 8.5/10  or  8.5 / 10
        r"(\d{2}\.\d+)\s*%",                           # 85.50%
        r"percentage\s*[:\-]?\s*(\d+\.?\d*)",         # percentage: 85
    ]
    for pat in cgpa_patterns:
        m = re.search(pat, text_low)
        if m:
            cgpa = m.group().strip()
            break

    # ── College / University Name (BUG-FIX-6 + BUG-FIX-7) ───────────────────
    #
    # The OLD approach anchored at the keyword, returning "Institute of ..."
    # instead of "Vels Institute of ...".
    #
    # The NEW approach iterates every line and returns the FULL LINE that
    # contains an institution keyword.
    college = None
    for line in text.split("\n"):
        line_stripped = line.strip()
        if len(line_stripped) < 5:
            continue
        if re.search(
            r"(internship|work experience|experience|project|skills|"
            r"certification|email|phone|linkedin|github|objective|summary)",
            line_stripped, re.IGNORECASE,
        ):
            continue
        if _INSTITUTION_KEYWORD_RE.search(line_stripped):
            # BUG-FIX-7: strip label prefixes like "Education:", "From:"
            cleaned = _LABEL_PREFIX_RE.sub("", line_stripped).strip()
            # Remove pipe-separated location suffix  e.g. "Name | Chennai"
            cleaned = re.sub(r"\s*[|]\s*.+$", "", cleaned).strip()
            # Remove trailing year range  e.g. "Name - 2020-2024"
            cleaned = re.sub(r"\s*[\-–]\s*\d{4}.*$", "", cleaned).strip()
            if len(cleaned) > 150:
                cleaned = cleaned[:150].strip()
            cleaned = cleaned.rstrip(".,;:")
            if len(cleaned) >= 5:
                college = cleaned
                break

    # ── Location ──────────────────────────────────────────────────────────────
    location = None
    m = _LOCATION_PATTERN.search(text)
    if m:
        location = m.group().title()

    if not any([degree, cgpa, college, location]):
        return {}

    return {"degree": degree, "cgpa": cgpa, "college": college, "location": location}


# ══════════════════════════════════════════════════════════════════════════════
# META
# ══════════════════════════════════════════════════════════════════════════════

def extract_meta() -> Dict:
    """Return timestamp metadata for the analysis run."""
    now = datetime.now()
    return {
        "date":     now.strftime("%Y-%m-%d"),
        "time":     now.strftime("%H:%M:%S"),
        "location": "User System",
    }


# ══════════════════════════════════════════════════════════════════════════════
# ROLE PREDICTION  (BUG-FIX-4: reliable "Software Engineer" fallback)
# ══════════════════════════════════════════════════════════════════════════════

def predict_role(text: str, skills: List[str]) -> str:
    text_low   = text.lower()
    skills_low = [s.lower() for s in skills]
    scores: Dict[str, int] = {}
    for role, keywords in ROLE_KEYWORDS.items():
        text_hits  = sum(1 for kw in keywords if kw in text_low)
        skill_hits = sum(1 for kw in keywords if kw in skills_low)
        scores[role] = text_hits + skill_hits

    if not scores or max(scores.values()) == 0:
        if any(s in skills_low for s in ["python", "django", "flask", "fastapi"]):
            return "Python Developer"
        if any(s in skills_low for s in ["java", "spring", "spring boot"]):
            return "Java Developer"
        if any(s in skills_low for s in ["react", "angular", "vue", "javascript"]):
            return "Frontend Developer"
        if any(s in skills_low for s in ["docker", "kubernetes", "aws", "terraform"]):
            return "DevOps Engineer"
        if any(s in skills_low for s in ["machine learning", "deep learning", "tensorflow"]):
            return "ML Engineer"
        return "Software Engineer"

    return max(scores, key=scores.get)  # type: ignore[arg-type]


# ══════════════════════════════════════════════════════════════════════════════
# ROLE MATCH PERCENTAGES
# ══════════════════════════════════════════════════════════════════════════════

def compute_role_matches(text: str, skills: List[str]) -> List[Dict]:
    """
    Compute match percentage for all roles and return top 3 sorted by score.

    Uses both raw text presence AND extracted skills list for scoring —
    same dual-signal approach as predict_role().

    Returns:
        [
          { "role": "Full Stack Developer", "percentage": 85 },
          { "role": "Backend Developer",    "percentage": 62 },
          { "role": "Frontend Developer",   "percentage": 50 },
        ]
    """
    text_low   = text.lower()
    skills_low = [s.lower() for s in skills]

    role_scores = []
    for role, keywords in ROLE_KEYWORDS.items():
        matched = sum(1 for kw in keywords if kw in text_low or kw in skills_low)
        pct = round((matched / len(keywords)) * 100) if keywords else 0
        role_scores.append({"role": role, "percentage": pct})

    role_scores.sort(key=lambda x: x["percentage"], reverse=True)
    top3 = role_scores[:3]

    # Ensure at least 1% so bars are always visible in the frontend
    for r in top3:
        if r["percentage"] == 0:
            r["percentage"] = 1

    return top3


# ══════════════════════════════════════════════════════════════════════════════
# RULE-BASED ATS SCORE ENGINE  (BUG-FIX-3 + SCORE-DETAIL-1)
#
# Kept as the offline fallback when both LLM providers are unavailable.
#
# ROOT CAUSE OF OLD BUG:
#   Old max = skills(40) + projects(20) + edu(15) + exp(15) + certs(10) +
#             contact(5) = 105, capped to 100. Any resume with 10+ skills
#             AND all sections scored 100. Not discriminating at all.
#
# NEW ALGORITHM (BUG-FIX-3) — 7 weighted dimensions:
#   Skills(25) | Projects(20) | Experience(20) | Education(15) |
#   Certs(10)  | Contact(5)   | Formatting(5)
#   Total max = 100 exactly — no artificial cap needed.
#
# SCORE-DETAIL-1: breakdown + details dicts surfaced for the React frontend
#   Resume Strength Meter without a second API call.
# ══════════════════════════════════════════════════════════════════════════════

# Industry-standard action verbs that ATS systems recognise
_ACTION_VERBS = [
    "developed", "implemented", "designed", "optimized", "optimised", "built",
    "architected", "engineered", "created", "deployed", "integrated", "automated",
    "reduced", "increased", "improved", "achieved", "launched", "led", "managed",
    "delivered", "maintained", "refactored", "migrated", "resolved", "collaborated",
    "mentored", "streamlined", "accelerated", "established", "transformed", "enhanced",
    "configured", "orchestrated", "monitored", "tested", "documented", "published",
    "scaled", "secured", "analysed", "analyzed", "coordinated", "spearheaded",
    "prototyped", "shipped", "contributed", "researched", "trained", "presented",
    "reviewed", "optimized", "structured", "modelled", "modeled", "benchmarked",
]

# Patterns that indicate quantified achievements — key ATS differentiator
_QUANT_PATTERNS = [
    r"\d+\s*%",                   # 40%,  35 %
    r"\d+[kK]\+?",                # 10K+, 5k users
    r"\d+\s*(users|requests|records|ms|seconds|hours|days|engineers|members|clients|transactions)",
    r"\$\s*\d+",                  # $5M, $500
    r"\d+x\s",                    # 3x faster
    r"\d+\s*\+\s*(projects|years|clients|products|services)",
    r"\d{1,3},\d{3}",             # 1,000 / 10,000 — large numbers
]


def calculate_ats_score_detailed(text: str, skills: List[str]) -> Dict[str, Any]:
    """
    Rule-based ATS scorer — used as offline fallback when LLM is unavailable.

    Returns:
      {
        "total":     int (0–100),
        "breakdown": { dimension: score, ... },
        "details":   { dimension: "human-readable note", ... }
      }

    BUG-FIX-3  : Graduated scoring — realistic distribution, not 100-for-all.
    SCORE-DETAIL-1: Breakdown dict powers the React frontend strength meter.
    """
    text_low = text.lower()
    breakdown: Dict[str, int] = {}
    details:   Dict[str, str] = {}

    # ── 1. SKILLS (max 25) ────────────────────────────────────────────────────
    n_skills = len(skills)
    if   n_skills >= 15: skills_pts = 25
    elif n_skills >= 12: skills_pts = 22
    elif n_skills >= 8:  skills_pts = 18
    elif n_skills >= 5:  skills_pts = 13
    elif n_skills >= 3:  skills_pts = 9
    elif n_skills >= 1:  skills_pts = 5
    else:                skills_pts = 0
    breakdown["skills"] = skills_pts
    details["skills"] = (
        f"{n_skills} skills detected. Great coverage — keep it relevant to your target role!"
        if skills_pts >= 18 else
        f"{n_skills} skills detected. Add more to reach 8+ (aim for cloud, DevOps, or AI skills)."
        if skills_pts < 13 else
        f"{n_skills} skills detected. Good — consider adding cloud/DevOps/AI skills to reach 12+."
    )

    # ── 2. PROJECTS (max 20) ──────────────────────────────────────────────────
    has_project_section = bool(re.search(r"\bproject", text_low))
    verb_hits  = sum(1 for v in _ACTION_VERBS   if v in text_low)
    quant_hits = sum(1 for p in _QUANT_PATTERNS if re.search(p, text_low))

    if   has_project_section and verb_hits >= 6 and quant_hits >= 3: proj_pts = 20
    elif has_project_section and verb_hits >= 4 and quant_hits >= 2: proj_pts = 16
    elif has_project_section and verb_hits >= 3 and quant_hits >= 1: proj_pts = 12
    elif has_project_section and verb_hits >= 2:                     proj_pts = 8
    elif has_project_section or  verb_hits >= 1:                     proj_pts = 5
    else:                                                             proj_pts = 0
    breakdown["projects"] = proj_pts
    details["projects"] = (
        f"{verb_hits} action verbs, {quant_hits} quantified metrics — excellent project section!"
        if proj_pts >= 16 else
        f"{verb_hits} action verbs found but 0 quantified metrics. Add numbers (e.g. 'reduced latency by 30%')."
        if quant_hits == 0 else
        f"{verb_hits} action verbs, {quant_hits} metrics. Add more impact statements to score higher."
    )

    # ── 3. EXPERIENCE (max 20) ────────────────────────────────────────────────
    has_exp_section = any(
        w in text_low for w in ["experience", "employment", "work history", "work experience"]
    )
    has_job_title = any(
        w in text_low for w in [
            "software engineer", "developer", "analyst", "architect",
            "manager", "lead", "consultant", "specialist", "scientist",
            "researcher", "associate", "officer", "designer",
        ]
    )
    has_internship = any(
        w in text_low for w in ["intern", "internship", "trainee", "apprentice"]
    )
    year_mentions = re.findall(r"(\d+)\+?\s*years?\s*(of\s+)?(experience|exp)", text_low)
    max_years = 0
    if year_mentions:
        try:
            max_years = max(int(y[0]) for y in year_mentions)
        except Exception:
            max_years = 0
    year_ranges    = re.findall(r"20\d{2}\s*[\-–]\s*(20\d{2}|present|current)", text_low)
    has_year_range = len(year_ranges) >= 1

    if   has_exp_section and has_job_title and max_years >= 5: exp_pts = 20
    elif has_exp_section and has_job_title and max_years >= 3: exp_pts = 18
    elif has_exp_section and has_job_title and has_year_range: exp_pts = 15
    elif has_exp_section and has_job_title:                    exp_pts = 13
    elif has_exp_section and has_internship:                   exp_pts = 10
    elif has_internship:                                       exp_pts = 7
    elif has_exp_section:                                      exp_pts = 4
    else:                                                      exp_pts = 0
    breakdown["experience"] = exp_pts
    details["experience"] = (
        f"Full-time experience detected ({max_years}+ years) — strong profile!"
        if has_job_title and has_exp_section and max_years >= 3 else
        "Full-time experience section detected — good."
        if has_job_title and has_exp_section else
        "Internship detected — solid for a fresher. Describe impact using action verbs."
        if has_internship else
        "No experience section found. Add internships, projects, or part-time work."
    )

    # ── 4. EDUCATION (max 15) ─────────────────────────────────────────────────
    has_degree = bool(re.search(
        r"\b(b\.?tech|btech|b\.?e|bachelor|b\.?sc|m\.?tech|mtech|m\.?sc|"
        r"master|mca|bca|phd|ph\.?d|diploma|m\.?b\.?a)\b",
        text_low,
    ))
    has_cgpa = bool(re.search(r"(cgpa|gpa|percentage|%)\s*[:\-]?\s*\d", text_low))
    has_institution = bool(re.search(
        r"\b(university|college|institute|polytechnic)\b", text_low, re.IGNORECASE
    ))
    edu_pts = 0
    if has_degree:      edu_pts += 7
    if has_cgpa:        edu_pts += 5
    if has_institution: edu_pts += 3
    breakdown["education"] = min(edu_pts, 15)
    details["education"] = (
        "Degree, CGPA, and institution all detected — complete education section!"
        if (has_degree and has_cgpa and has_institution) else
        "Degree and institution found but CGPA/percentage is missing — add it."
        if (has_degree and has_institution and not has_cgpa) else
        "Degree found but institution name is missing — add your college name."
        if (has_degree and not has_institution) else
        "Add Education section with degree name, college, and CGPA/percentage."
    )

    # ── 5. CERTIFICATIONS (max 10) ────────────────────────────────────────────
    top_cert_keywords = [
        "aws certified", "google certified", "microsoft certified", "oracle certified",
        "azure certified", "pmp certified", "cissp", "cka", "ckad",
        "hashicorp certified", "certified scrum master", "six sigma", "comptia",
        "salesforce certified", "google cloud professional",
    ]
    generic_cert_keywords = [
        "certification", "certified", "certificate", "nptel", "coursera",
        "udemy", "edx", "linkedin learning", "hackerrank", "codecademy",
        "infosys springboard", "great learning",
    ]
    top_hits     = sum(1 for c in top_cert_keywords     if c in text_low)
    generic_hits = sum(1 for c in generic_cert_keywords if c in text_low)
    if   top_hits >= 2:                        cert_pts = 10
    elif top_hits >= 1 and generic_hits >= 1:  cert_pts = 8
    elif top_hits >= 1:                        cert_pts = 7
    elif generic_hits >= 3:                    cert_pts = 6
    elif generic_hits >= 2:                    cert_pts = 5
    elif generic_hits >= 1:                    cert_pts = 3
    else:                                      cert_pts = 0
    breakdown["certifications"] = cert_pts
    details["certifications"] = (
        "Strong certification profile with industry-recognized credentials!"
        if cert_pts >= 7 else
        "Good — add more recognised certs (AWS, Google, Microsoft, Oracle) for a higher score."
        if cert_pts >= 3 else
        "No certifications detected. Add at least one industry cert or online course certificate."
    )

    # ── 6. CONTACT COMPLETENESS (max 5) ───────────────────────────────────────
    has_email     = bool(re.search(r"\b[A-Za-z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[A-Za-z]{2,}\b", text))
    has_phone     = bool(re.search(r"\b\d{10}\b|\+\d{1,3}[\s\-]\d{5,}", text))
    has_linkedin  = "linkedin" in text_low
    has_github    = "github"   in text_low
    has_portfolio = any(w in text_low for w in ["portfolio", "personal site", "website"])
    contact_pts = min(
        (1 if has_email    else 0) + (1 if has_phone    else 0) +
        (1 if has_linkedin else 0) + (1 if has_github   else 0) +
        (1 if has_portfolio or (has_email and has_phone and has_linkedin and has_github) else 0),
        5,
    )
    breakdown["contact"] = contact_pts
    missing_contact = [
        x for x, v in [
            ("email", has_email), ("phone", has_phone),
            ("LinkedIn", has_linkedin), ("GitHub", has_github),
        ] if not v
    ]
    details["contact"] = (
        "Complete contact profile — email, phone, LinkedIn, and GitHub all present."
        if contact_pts >= 4 else
        "Add missing contact info: " + ", ".join(missing_contact) + "."
        if missing_contact else
        "Contact info present."
    )

    # ── 7. RESUME STRUCTURE / FORMATTING (max 5) ─────────────────────────────
    has_summary = any(
        w in text_low for w in [
            "objective", "summary", "career objective",
            "professional summary", "profile", "about me",
        ]
    )
    section_keywords = [
        "skills", "education", "experience", "project", "certification",
        "achievement", "award", "publication", "volunteer", "extracurricular",
    ]
    n_sections = sum(1 for s in section_keywords if s in text_low)
    word_count  = len(text.split())

    if   has_summary and n_sections >= 5 and word_count >= 300: fmt_pts = 5
    elif has_summary and n_sections >= 4 and word_count >= 200: fmt_pts = 4
    elif n_sections >= 4 and word_count >= 200:                 fmt_pts = 3
    elif n_sections >= 3 and word_count >= 100:                 fmt_pts = 2
    elif n_sections >= 2:                                       fmt_pts = 1
    else:                                                       fmt_pts = 0
    breakdown["formatting"] = fmt_pts
    details["formatting"] = (
        "Well-structured resume with Summary and all key sections labelled."
        if fmt_pts >= 4 else
        "Good structure — add an Objective/Summary section at the top for a higher score."
        if (not has_summary and n_sections >= 3) else
        "Ensure all main sections (Skills, Education, Projects, Experience) are clearly labelled."
        if n_sections < 4 else
        "Resume is sparse. Add more content and clearly labelled sections."
    )

    # ── Minimum floor ─────────────────────────────────────────────────────────
    # If the document has real content but nothing matched at all, give a base score
    total = sum(breakdown.values())
    if total == 0 and word_count >= 50:
        total = 8
        breakdown["skills"] = 8
        details["skills"] = "Could not parse structured sections — check resume formatting."

    return {
        "total":     min(total, 100),
        "breakdown": breakdown,
        "details":   details,
    }


def calculate_ats_score(text: str, skills: List[str]) -> int:
    """
    Convenience wrapper — returns only the final integer score (0–100).
    BUG-FIX-3: Uses the redesigned graduated scoring algorithm.
    """
    return calculate_ats_score_detailed(text, skills)["total"]


# ══════════════════════════════════════════════════════════════════════════════
# FEEDBACK GENERATOR  (BUG-FIX-8: per-section breakdown + targeted tips)
# ══════════════════════════════════════════════════════════════════════════════

def generate_feedback(
    score:     int,
    role:      str,
    skills:    List[str],
    breakdown: Dict[str, int] = None,
    details:   Dict[str, str] = None,
) -> str:
    """
    Generate a rich, readable ATS feedback report.

    BUG-FIX-8: Includes per-section score breakdown and targeted
    improvement advice from the details dict when available.
    The report format is both machine-parseable and human-readable
    for the frontend ResumeEnhancer component.
    """
    strength = (
        "Excellent"        if score >= 80
        else "Good"        if score >= 60
        else "Fair"        if score >= 40
        else "Needs Improvement"
    )

    lines = [
        f"ATS SCORE: {score}/100  [{strength}]",
        f"RECOMMENDED ROLE: {role}",
        "",
        f"SKILLS DETECTED ({len(skills)}):",
        f"{', '.join(skills[:60]) or 'None detected'}",
        "",
    ]

    # ── Per-section score breakdown (SCORE-DETAIL-1) ──────────────────────────
    if breakdown:
        lines.append("SCORE BREAKDOWN:")
        label_map = {
            "skills":         ("Skills Coverage",       25),
            "projects":       ("Projects & Impact",     20),
            "experience":     ("Work Experience",       20),
            "education":      ("Education",             15),
            "certifications": ("Certifications",        10),
            "contact":        ("Contact Information",    5),
            "formatting":     ("Resume Structure",       5),
        }
        for key, (label, max_pts) in label_map.items():
            pts    = breakdown.get(key, 0)
            filled = "█" * pts
            empty  = "░" * (max_pts - pts)
            lines.append(f"  {label:<28} {pts:>2}/{max_pts}  {filled}{empty}")
        lines.append("")

    # ── Per-section advice ────────────────────────────────────────────────────
    if details:
        lines.append("SECTION FEEDBACK:")
        for key, note in details.items():
            lines.append(f"  • {note}")
        lines.append("")

    # ── General improvement tips (score-gated) ────────────────────────────────
    tips = []
    if len(skills) < 8:
        tips.append("• Add more technical skills relevant to your target role (aim for 8–15)")
    if score < 90:
        tips.append("• Quantify project outcomes (e.g., 'reduced checkout time by 35%', 'serving 5K+ users')")
    if score < 80:
        tips.append("• Add industry certifications (AWS, Google Cloud, Microsoft Azure) to boost score")
        tips.append("• Group skills by category: Languages | Frameworks | Databases | Cloud | Tools")
        tips.append("• Use strong action verbs to start each bullet: Developed, Implemented, Optimised")
    if score < 60:
        tips.append("• Add a professional Summary or Career Objective section at the top of your resume")
        tips.append("• Ensure email and phone number are visible at the top")
        tips.append("• Include LinkedIn profile URL and GitHub profile link")
        tips.append("• Education section must show: degree name, institution name, and CGPA/percentage")
    if score < 40:
        tips.append("• Ensure your resume has clearly labelled sections: Skills, Education, Projects, Experience")
        tips.append("• Minimum recommended length: 300 words / 1 page")

    if tips:
        lines.append("IMPROVEMENT TIPS:")
        lines.extend(tips)

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# LLM-BASED ATS SCORING  (LLM-SCORE-1)
# ══════════════════════════════════════════════════════════════════════════════

# System prompt engineered to force valid JSON output on every LLM call
_LLM_SYSTEM_PROMPT = """You are an expert ATS (Applicant Tracking System) evaluator and senior technical recruiter with 15+ years of experience. You will analyse a resume and return a precise, honest ATS evaluation as a JSON object.

SCORING DIMENSIONS (total = 100 points):
1. skills         — max 25 pts  : depth, breadth, and relevance of technical skills
2. projects       — max 20 pts  : quality, impact, quantified achievements, action verbs
3. experience     — max 20 pts  : work history, internships, years of experience
4. education      — max 15 pts  : degree, institution, CGPA/GPA completeness
5. certifications — max 10 pts  : industry-recognised certs > online course certs
6. contact        — max  5 pts  : email, phone, LinkedIn, GitHub, portfolio
7. formatting     — max  5 pts  : clear sections, summary/objective, adequate length

ROLE CATEGORIES you must choose from:
Java Developer, Python Developer, Full Stack Developer, Frontend Developer,
Backend Developer, Data Scientist, ML Engineer, DevOps Engineer, Cloud Engineer,
Data Analyst, Android Developer, iOS Developer, Data Engineer,
Security Engineer, Embedded Engineer, Software Engineer

You MUST respond with ONLY a valid JSON object — no markdown, no code fences,
no explanation, no preamble. The JSON must exactly match this structure:

{
  "ats_score": <integer 0-100>,
  "recommended_role": "<one role from the list above>",
  "breakdown": {
    "skills": <0-25>,
    "projects": <0-20>,
    "experience": <0-20>,
    "education": <0-15>,
    "certifications": <0-10>,
    "contact": <0-5>,
    "formatting": <0-5>
  },
  "details": {
    "skills": "<specific actionable advice about skills>",
    "projects": "<specific actionable advice about projects>",
    "experience": "<specific actionable advice about experience>",
    "education": "<specific actionable advice about education>",
    "certifications": "<specific actionable advice about certifications>",
    "contact": "<specific actionable advice about contact info>",
    "formatting": "<specific actionable advice about formatting>"
  },
  "role_matches": [
    {"role": "<role1>", "percentage": <0-100>},
    {"role": "<role2>", "percentage": <0-100>},
    {"role": "<role3>", "percentage": <0-100>}
  ],
  "feedback_summary": "<3-5 sentence overall assessment mentioning strongest points and top 2-3 improvements>"
}

Be accurate and discriminating — a mediocre fresher resume should score 40-60,
a good fresher 60-75, an experienced professional 75-90.
Perfect 100 is essentially impossible."""


def _build_llm_user_prompt(resume_text: str, skills: List[str]) -> str:
    """Build the user message sent to the LLM alongside the resume text."""
    skill_summary = ", ".join(skills[:30]) if skills else "None detected by rule-based parser"
    # Truncate to 3500 chars to stay within token limits for all providers
    truncated = resume_text[:3500] + ("\n...[truncated]" if len(resume_text) > 3500 else "")
    return (
        f"Please evaluate the following resume and return your assessment as JSON only.\n\n"
        f"Pre-detected skills (for reference): {skill_summary}\n\n"
        f"RESUME TEXT:\n{truncated}"
    )


def _parse_llm_json(raw: str) -> Dict[str, Any]:
    """
    Robustly extract and parse the JSON blob from an LLM response.
    Handles markdown code fences, leading/trailing text, and extra whitespace.
    """
    # Strip markdown fences if present
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    # Find the outermost {...} block
    start = raw.find("{")
    end   = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(raw[start:end + 1])


def _validate_llm_result(data: Dict[str, Any]) -> bool:
    """Check that the parsed JSON has all required keys with correct types."""
    required_keys = ["ats_score", "recommended_role", "breakdown", "details", "role_matches"]
    if not all(k in data for k in required_keys):
        return False
    if not isinstance(data["ats_score"], (int, float)):
        return False
    breakdown_keys = [
        "skills", "projects", "experience", "education",
        "certifications", "contact", "formatting",
    ]
    if not all(k in data.get("breakdown", {}) for k in breakdown_keys):
        return False
    if not isinstance(data.get("role_matches"), list) or len(data["role_matches"]) == 0:
        return False
    return True


def _score_via_groq(resume_text: str, skills: List[str]) -> Dict[str, Any]:
    """
    Call Groq API (llama-3.3-70b-versatile) for real-time ATS scoring.
    Requires GROQ_API_KEY in the environment.
    """
    try:
        from groq import Groq  # type: ignore
    except ImportError:
        raise RuntimeError("groq package not installed — run: pip install groq")

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set in environment")

    client   = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _LLM_SYSTEM_PROMPT},
            {"role": "user",   "content": _build_llm_user_prompt(resume_text, skills)},
        ],
        temperature=0.1,    # Low temperature for consistent, deterministic scoring
        max_tokens=1200,
    )
    raw = response.choices[0].message.content
    logger.info("[LLM-SCORE] Groq response received (%d chars)", len(raw))
    return _parse_llm_json(raw)


def _score_via_mistral(resume_text: str, skills: List[str]) -> Dict[str, Any]:
    """
    Call Mistral API (mistral-large-latest) for real-time ATS scoring.
    Requires MISTRAL_API_KEY in the environment.
    """
    try:
        from mistralai import Mistral  # type: ignore
    except ImportError:
        raise RuntimeError("mistralai package not installed — run: pip install mistralai")

    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY not set in environment")

    client   = Mistral(api_key=api_key)
    response = client.chat.complete(
        model="mistral-large-latest",
        messages=[
            {"role": "system", "content": _LLM_SYSTEM_PROMPT},
            {"role": "user",   "content": _build_llm_user_prompt(resume_text, skills)},
        ],
        temperature=0.1,
        max_tokens=1200,
    )
    raw = response.choices[0].message.content
    logger.info("[LLM-SCORE] Mistral response received (%d chars)", len(raw))
    return _parse_llm_json(raw)


def _normalise_llm_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalise LLM output to the internal format expected by advanced_parse_resume().
    Clamps all dimension scores to their allowed maxima — prevents LLM score inflation.
    Re-sums the total from clamped dimensions (prevents inflated ats_score field).
    """
    MAX_SCORES = {
        "skills": 25, "projects": 20, "experience": 20,
        "education": 15, "certifications": 10, "contact": 5, "formatting": 5,
    }
    breakdown: Dict[str, int] = {}
    for key, max_val in MAX_SCORES.items():
        raw_val = data.get("breakdown", {}).get(key, 0)
        breakdown[key] = max(0, min(int(raw_val), max_val))

    # Re-sum to get true total — prevents LLM from inflating the ats_score field
    total = min(sum(breakdown.values()), 100)

    details      = data.get("details", {})
    role_matches = data.get("role_matches", [])

    # Normalise role_matches to the expected shape
    normalised_matches = []
    for rm in role_matches[:3]:
        normalised_matches.append({
            "role":       str(rm.get("role", "Software Engineer")),
            "percentage": max(1, min(100, int(rm.get("percentage", 1)))),
        })

    return {
        "total":            total,
        "breakdown":        breakdown,
        "details":          details,
        "recommended_role": str(data.get("recommended_role", "Software Engineer")),
        "role_matches":     normalised_matches,
        "feedback_summary": str(data.get("feedback_summary", "")),
        "source":           data.get("source", "llm"),
    }


def llm_score_resume(resume_text: str, skills: List[str]) -> Dict[str, Any]:
    """
    LLM-SCORE-1 : Main entry point for LLM-based ATS scoring.

    Priority chain:
      1. Groq   (llama-3.3-70b-versatile) — fastest, free tier available
      2. Mistral (mistral-large-latest)   — fallback if Groq unavailable/errors
      3. Rule-based engine                — offline fallback, always works

    Both LLM calls use temperature=0.1 for deterministic, consistent scoring.
    All LLM output is clamped and re-summed via _normalise_llm_result() to
    prevent score inflation.

    Returns a dict with the same shape as calculate_ats_score_detailed()
    PLUS: recommended_role, role_matches, feedback_summary, source.
    """
    # ── Try Groq ──────────────────────────────────────────────────────────────
    try:
        data = _score_via_groq(resume_text, skills)
        if _validate_llm_result(data):
            data["source"] = "groq"
            logger.info("[LLM-SCORE] ✅ Groq scoring succeeded — ATS: %s", data.get("ats_score"))
            return _normalise_llm_result(data)
        else:
            logger.warning("[LLM-SCORE] Groq JSON validation failed, trying Mistral")
    except Exception as e:
        logger.warning("[LLM-SCORE] Groq failed: %s — trying Mistral", e)

    # ── Try Mistral ───────────────────────────────────────────────────────────
    try:
        data = _score_via_mistral(resume_text, skills)
        if _validate_llm_result(data):
            data["source"] = "mistral"
            logger.info("[LLM-SCORE] ✅ Mistral scoring succeeded — ATS: %s", data.get("ats_score"))
            return _normalise_llm_result(data)
        else:
            logger.warning("[LLM-SCORE] Mistral JSON validation failed, falling back to rule-based")
    except Exception as e:
        logger.warning("[LLM-SCORE] Mistral failed: %s — falling back to rule-based", e)

    # ── Rule-based fallback ───────────────────────────────────────────────────
    logger.info("[LLM-SCORE] Using rule-based fallback scorer")
    rb           = calculate_ats_score_detailed(resume_text, skills)
    role         = predict_role(resume_text, skills)
    role_matches = compute_role_matches(resume_text, skills)
    return {
        "total":            rb["total"],
        "breakdown":        rb["breakdown"],
        "details":          rb["details"],
        "recommended_role": role,
        "role_matches":     role_matches,
        "feedback_summary": generate_feedback(
            rb["total"], role, skills, rb["breakdown"], rb["details"]
        ),
        "source":           "rule_based",
    }


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT  (BUG-FIX-1 + LLM-SCORE-1 + SCORE-DETAIL-1)
# ══════════════════════════════════════════════════════════════════════════════

def advanced_parse_resume(text: str) -> dict:
    """
    Full Phase 1 analysis pipeline with LLM-powered ATS scoring.

    Flow:
      1. Rule-based extractions (profile, skills, education, meta) — always
         run first, no API cost, zero latency.
      2. LLM scoring via llm_score_resume() — Groq → Mistral → rule-based
         fallback. Provides ats_score, breakdown, details, recommended_role,
         role_matches, and feedback_summary.
      3. Unified response assembled with both flat + nested key structures
         so both Java Spring Boot and React frontend are satisfied.

    BUG-FIX-1 : Returns BOTH nested structure AND flat top-level keys so
                Java Spring controllers can read ats_score, recommended_role,
                and matched_keywords directly from root JSON.

    LLM-SCORE-1: ATS score, breakdown, details, role, and role_matches now
                 come from the LLM when available; rule-based is the fallback.

    SCORE-DETAIL-1: breakdown and details dicts surfaced in the response so
                    the React Resume Strength Meter works without a 2nd call.

    Returns:
      {
        # Flat top-level (for Java Spring Boot / direct JSON readers):
        "ats_score", "recommended_role", "matched_keywords", "explanation",
        "role_matches", "scoring_source"

        # Nested (for React: result.ats.*):
        "ats": { "ats_score", "recommended_role", "feedback", "breakdown",
                 "details", "role_matches", "scoring_source" }

        # AI extracted data (for React: result.ai_data.*):
        "ai_data": { "profile", "education", "skills", "skill_count",
                     "score_breakdown", "score_details", "role_matches",
                     "scoring_source", "confidence", "meta" }
      }
    """
    # ── Rule-based extractions — always run, no API cost ──────────────────────
    profile   = extract_profile(text)
    skills    = extract_skills(text)
    education = extract_education(text)
    meta      = extract_meta()

    # ── LLM scoring (Groq → Mistral → rule-based fallback) ───────────────────
    llm_result = llm_score_resume(text, skills)

    ats_score        = llm_result["total"]
    breakdown        = llm_result["breakdown"]
    details          = llm_result["details"]
    role             = llm_result["recommended_role"]
    role_matches     = llm_result["role_matches"]
    feedback_summary = llm_result.get("feedback_summary", "")
    scoring_source   = llm_result.get("source", "unknown")

    # Generate the full structured feedback text (breakdown bar chart + tips)
    feedback = generate_feedback(ats_score, role, skills, breakdown, details)

    # Prepend the LLM's natural-language summary when available
    if feedback_summary and scoring_source != "rule_based":
        feedback = f"AI ASSESSMENT:\n{feedback_summary}\n\n" + feedback

    logger.info(
        "✅ Analyzed resume — ATS: %d  Role: %s  Skills: %d  Source: %s",
        ats_score, role, len(skills), scoring_source,
    )

    return {
        # ── Flat top-level keys (for Java Spring Boot / direct JSON readers) ──
        "ats_score":        ats_score,
        "recommended_role": role,
        "matched_keywords": skills,
        "explanation":      feedback,
        "role_matches":     role_matches,
        "scoring_source":   scoring_source,   # "groq" | "mistral" | "rule_based"

        # ── Nested structure (for React: result.ats.*) ─────────────────────────
        "ats": {
            "ats_score":        ats_score,
            "recommended_role": role,
            "feedback":         feedback,
            "breakdown":        breakdown,
            "details":          details,
            "role_matches":     role_matches,
            "scoring_source":   scoring_source,
        },

        # ── AI extracted data (for React: result.ai_data.*) ───────────────────
        "ai_data": {
            "profile":         profile,
            "education":       education,
            "skills":          skills,
            "skill_count":     len(skills),
            "score_breakdown": breakdown,    # mirrors ats.breakdown for easy access
            "score_details":   details,
            "role_matches":    role_matches,
            "scoring_source":  scoring_source,
            "confidence":      f"LLM_ENGINE_V4_{scoring_source.upper()}",
            "meta":            meta,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# LOCAL TEST  — run: python advanced_resume_ai.py
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import json as _json

    # ── Test 1: Good Fresher ──────────────────────────────────────────────────
    sample_fresher = """
    Dhanush Kumar
    dhanush.kumar@gmail.com  |  +91-9876543210  |  Chennai, Tamil Nadu
    linkedin.com/in/dhanushkumar  |  github.com/dhanushkumar

    OBJECTIVE
    Seeking a challenging role as a Software Engineer to apply my skills.

    EDUCATION
    B.Tech in Computer Science
    Vels Institute of Science, Technology & Advanced Studies
    Chennai, Tamil Nadu | 2020 - 2024 | CGPA: 8.7/10

    SKILLS
    Python, Java, React, Spring Boot, MySQL, Docker, AWS, Git, Machine Learning, TypeScript

    EXPERIENCE
    Software Intern — Infosys, Chennai  (Jun 2023 – Dec 2023)
    Developed REST API using Spring Boot integrated with MySQL database.
    Implemented pagination reducing query response time by 40%.

    PROJECTS
    1. E-Commerce Platform
       Built using React and Node.js, deployed on AWS EC2.
       Reduced checkout latency by 35%, serving 5K+ daily users.
    2. ML Image Classifier
       Implemented deep learning model using TensorFlow achieving 92% accuracy.
       Trained on 50K+ images, deployed via Flask REST API.

    CERTIFICATIONS
    AWS Certified Developer – Associate
    Udemy: Full Stack Web Development (React + Node.js)
    NPTEL: Data Structures and Algorithms
    """

    # ── Test 2: Minimal Resume ────────────────────────────────────────────────
    sample_minimal = """
    Raj
    raj@email.com
    Skills: Python, Java
    Project: Built a calculator app
    """

    # ── Test 3: Experienced Developer ────────────────────────────────────────
    sample_experienced = """
    Priya Sharma
    priya.sharma@gmail.com | +91-9876543211 | Bangalore, Karnataka
    linkedin.com/in/priyasharma | github.com/priyasharma

    SUMMARY
    Senior Software Engineer with 5+ years of experience building scalable distributed systems.

    EDUCATION
    B.Tech in Computer Science — IIT Delhi  CGPA: 9.1/10

    EXPERIENCE
    Senior Software Engineer — Google, Bangalore  (2019 – 2024)  5+ years
    Architected microservices platform serving 100K+ daily users.
    Optimized database queries reducing latency by 60%.
    Led team of 8 engineers, delivered 4 major product launches.
    Automated CI/CD pipeline reducing deployment time by 75%.

    SKILLS
    Python, Java, React, Node.js, Docker, Kubernetes, AWS, MySQL, Redis,
    GraphQL, TypeScript, Spring Boot, Kafka, Terraform, GitHub Actions,
    Machine Learning, TensorFlow, Elasticsearch

    PROJECTS
    Distributed Cache System — Reduced API response time by 45% serving 1M+ requests/day.
    ML Recommendation Engine — Increased click-through rate by 22% for 500K+ users.

    CERTIFICATIONS
    AWS Certified Solutions Architect – Professional
    Google Cloud Professional Data Engineer
    Oracle Certified Java Developer
    """

    print("Testing merged LLM + rule-based pipeline...\n")

    for test_name, sample in [
        ("GOOD FRESHER",    sample_fresher),
        ("MINIMAL RESUME",  sample_minimal),
        ("EXPERIENCED DEV", sample_experienced),
    ]:
        print("=" * 65)
        print(f"TEST: {test_name}")
        print("=" * 65)
        r = advanced_parse_resume(sample)
        print(f"  ATS Score      : {r['ats_score']}")
        print(f"  Role           : {r['recommended_role']}")
        print(f"  Scoring Source : {r['scoring_source']}")
        print(f"  Skills ({r['ai_data']['skill_count']:>2})     : {', '.join(r['matched_keywords'][:10])}...")
        print(f"  College        : {r['ai_data']['education'].get('college')}")
        print(f"  CGPA           : {r['ai_data']['education'].get('cgpa')}")
        print(f"  Role Matches   : {r['role_matches']}")
        print(f"  Breakdown      : {r['ats']['breakdown']}")
        print()