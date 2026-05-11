"""
test_api.py
───────────
End-to-end API test suite for the AI Resume Screening System.
Run with:  python test_api.py

Fixed vs original (tset_api.py):
  - Renamed tset_api.py → test_api.py (typo)
  - Added test_hr_cluster() and test_hr_insights() (were missing)
  - Added test_suggest_skills(), test_project_summary(), test_jd_suggestions()
  - Increased TIMEOUT from 30s to 60s — Groq/Mistral can take up to 45s on
    first call; 30s caused false-negative timeouts for valid LLM responses
  - Added timeout to all requests so tests don't hang forever
  - Added per-test timing so you can see which endpoints are slow
  - Added LLM backend check at startup so you know which backends are active
"""

import time
import json
import requests

BASE_URL = "http://localhost:8000"
TIMEOUT  = 60   # seconds per request — increased from 30 to handle LLM latency


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _ok(label: str, data=None):
    print(f"  ✅ {label}")
    if data:
        preview = json.dumps(data, indent=None)
        print(f"     {preview[:300]}")


def _fail(label: str, err):
    print(f"  ❌ {label}: {err}")


# ──────────────────────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────────────────────

def test_health_check() -> bool:
    print("\n1. Health Check")
    try:
        r = requests.get(f"{BASE_URL}/", timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        backends = data.get("backends", {})
        active = [k for k, v in backends.items() if v]
        _ok(f"Running — active backends: {', '.join(active)}", data)
        return True
    except Exception as e:
        _fail("Health check failed", e)
        return False


def test_rewrite() -> bool:
    print("\n2. Resume Rewrite  POST /rewrite")
    try:
        data = {
            "resumeText": (
                "I am a software developer with 2 years of experience in Java and Python. "
                "I made a web application using Spring Boot. "
                "I helped the team with code reviews and fixed many bugs. "
                "I worked on a REST API project and used MySQL for the database."
            ),
            "jobDescription": "Looking for Full Stack Developer with Java and React experience",
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/rewrite", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        source  = result.get("source", "unknown")
        _ok(f"Done in {elapsed:.1f}s  [source={source}]")
        print(f"     optimized_resume (first 300 chars): {result.get('optimized_resume','')[:300]}")
        print(f"     improvements: {result.get('improvements', [])}")
        # Validate that the output is a proper resume, not GPT-2 garbage
        optimized = result.get("optimized_resume", "")
        if len(optimized) < 100:
            _fail("Rewrite output too short (likely GPT-2 garbage)", f"len={len(optimized)}")
            return False
        return True
    except Exception as e:
        _fail("Rewrite failed", e)
        return False


def test_project_enhance() -> bool:
    print("\n3. Project Enhancement  POST /project-enhance")
    try:
        data = {
            "projects": [
                "Built a website using React",
                "Created REST API with Spring Boot",
            ]
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/project-enhance", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        count   = result.get("total_enhanced", 0)
        _ok(f"Enhanced {count} projects in {elapsed:.1f}s")
        for i, p in enumerate(result.get("enhanced_projects", [])[:3], 1):
            print(f"     Project {i}: {p[:200]}")
        # Validate output quality
        enhanced = result.get("enhanced_projects", [])
        if not enhanced:
            _fail("No enhanced projects returned", "empty list")
            return False
        if any(len(p) < 20 for p in enhanced):
            _fail("Some enhanced projects too short", enhanced)
            return False
        return True
    except Exception as e:
        _fail("Project enhance failed", e)
        return False


def test_jd_tailor() -> bool:
    print("\n4. JD Tailoring  POST /jd-tailor")
    try:
        data = {
            "resumeText": (
                "Java Developer with Spring Boot experience. Built REST APIs and microservices."
            ),
            "jobDescription": (
                "Seeking Java Developer with Spring Boot, Microservices, and AWS experience"
            ),
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/jd-tailor", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        _ok(f"Done in {elapsed:.1f}s")
        print(f"     jd_match_score:   {result.get('jd_match_score', 0):.1f}%")
        print(f"     key_requirements: {', '.join(result.get('key_requirements', [])[:5])}")
        print(f"     suggestions:      {result.get('suggestions', [])[:2]}")
        return True
    except Exception as e:
        _fail("JD tailor failed", e)
        return False


def test_suggest_skills() -> bool:
    print("\n5. Suggest Skills  POST /suggest-skills")
    try:
        data = {
            "resumeText": (
                "Java Developer with 2 years of experience. "
                "Skills: Java, Spring Boot, MySQL, Git. "
                "Built REST APIs and microservices."
            )
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/suggest-skills", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        _ok(f"Done in {elapsed:.1f}s")
        print(f"     missing_technical:  {result.get('missing_technical', [])[:4]}")
        print(f"     trending:           {result.get('trending', [])[:4]}")
        print(f"     soft_skills:        {result.get('soft_skills', [])[:3]}")
        print(f"     certifications:     {result.get('certifications', [])[:2]}")
        print(f"     role_gap_analysis:  {str(result.get('role_gap_analysis',''))[:150]}")
        # Validate required keys
        for key in ["missing_technical", "trending", "soft_skills", "certifications", "role_gap_analysis"]:
            if key not in result:
                _fail(f"Missing key in response: {key}", result)
                return False
        return True
    except Exception as e:
        _fail("Suggest skills failed", e)
        return False


def test_project_summary() -> bool:
    print("\n6. Project Summary  POST /project-summary")
    try:
        data = {
            "title":     "E-Commerce Platform",
            "techStack": "React, Spring Boot, MySQL, Docker, AWS",
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/project-summary", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        _ok(f"Done in {elapsed:.1f}s")
        print(f"     one_liner:      {result.get('one_liner','')[:200]}")
        print(f"     full_summary:   {result.get('full_summary','')[:200]}")
        print(f"     highlights:     {result.get('highlights', [])[:2]}")
        print(f"     impact_metrics: {result.get('impact_metrics', [])[:2]}")
        # Validate required keys
        for key in ["one_liner", "full_summary", "highlights", "impact_metrics"]:
            if key not in result:
                _fail(f"Missing key in response: {key}", result)
                return False
        return True
    except Exception as e:
        _fail("Project summary failed", e)
        return False


def test_jd_suggestions() -> bool:
    print("\n7. JD Suggestions  POST /jd-suggestions")
    try:
        data = {
            "resumeText": (
                "Java Developer with Spring Boot experience. Built REST APIs."
            ),
            "jobDescription": (
                "Seeking Java Developer with Spring Boot, Microservices, Docker, "
                "Kubernetes, and AWS experience. Knowledge of React is a plus."
            ),
        }
        t0 = time.time()
        r  = requests.post(f"{BASE_URL}/jd-suggestions", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        elapsed = time.time() - t0
        _ok(f"Done in {elapsed:.1f}s")
        print(f"     skills_to_add:       {result.get('skills_to_add', [])[:4]}")
        print(f"     keywords_to_include: {result.get('keywords_to_include', [])[:4]}")
        print(f"     action_plan:         {result.get('action_plan', [])[:2]}")
        projects = result.get("projects_to_add", [])
        if projects:
            print(f"     projects_to_add[0]:  {projects[0].get('title', '')}")
        # Validate required keys
        for key in ["skills_to_add", "projects_to_add", "keywords_to_include", "action_plan"]:
            if key not in result:
                _fail(f"Missing key in response: {key}", result)
                return False
        return True
    except Exception as e:
        _fail("JD suggestions failed", e)
        return False


def test_hr_rank() -> bool:
    print("\n8. HR Ranking  POST /hr/rank")
    try:
        data = {
            "candidates": [
                {"email": "alice@test.com",   "atsScore": 85, "experienceYears": 3},
                {"email": "bob@test.com",     "atsScore": 72, "experienceYears": 2},
                {"email": "charlie@test.com", "atsScore": 90, "experienceYears": 5},
                {"email": "diana@test.com",   "atsScore": 65, "experienceYears": 1},
            ]
        }
        r = requests.post(f"{BASE_URL}/hr/rank", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result = r.json()
        ranked = result.get("ranked_candidates", [])
        _ok(f"Ranked {len(ranked)} candidates")
        for c in ranked[:3]:
            print(f"     #{c.get('rank')}  {c.get('email')}  score={c.get('rank_score'):.1f}  status={c.get('status')}")
        return True
    except Exception as e:
        _fail("HR rank failed", e)
        return False


def test_hr_auto_shortlist() -> bool:
    print("\n9. HR Auto-Shortlist  POST /hr/auto-shortlist")
    try:
        data = {
            "candidates": [
                {"email": "a@test.com", "atsScore": 85},
                {"email": "b@test.com", "atsScore": 65},
                {"email": "c@test.com", "atsScore": 90},
                {"email": "d@test.com", "atsScore": 55},
            ],
            "threshold": 70,
        }
        r = requests.post(f"{BASE_URL}/hr/auto-shortlist", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result  = r.json()
        summary = result.get("summary", {})
        _ok("Done")
        print(f"     total={summary.get('total')}  shortlisted={summary.get('shortlisted_count')}  "
              f"pending={summary.get('pending_count')}  rejected={summary.get('rejected_count')}")
        return True
    except Exception as e:
        _fail("HR auto-shortlist failed", e)
        return False


def test_hr_cluster() -> bool:
    print("\n10. HR Clustering  POST /hr/cluster")
    try:
        data = {
            "candidates": [
                {"email": "a@test.com", "atsScore": 85, "experienceYears": 3},
                {"email": "b@test.com", "atsScore": 72, "experienceYears": 2},
                {"email": "c@test.com", "atsScore": 90, "experienceYears": 5},
                {"email": "d@test.com", "atsScore": 55, "experienceYears": 1},
                {"email": "e@test.com", "atsScore": 78, "experienceYears": 4},
                {"email": "f@test.com", "atsScore": 60, "experienceYears": 1},
            ],
            "n_clusters": 3,
        }
        r = requests.post(f"{BASE_URL}/hr/cluster", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result = r.json()
        _ok(f"{result.get('total_clusters')} clusters created")
        for s in result.get("cluster_summary", []):
            print(f"     {s['cluster_name']}: {s['size']} members, avg ATS={s['avg_ats_score']:.1f}")
        return True
    except Exception as e:
        _fail("HR cluster failed", e)
        return False


def test_hr_insights() -> bool:
    print("\n11. HR Insights  POST /hr/insights")
    try:
        data = {
            "candidates": [
                {"email": "a@test.com", "atsScore": 85, "skills": ["Python", "React"],        "recommendedRole": "Full Stack Developer"},
                {"email": "b@test.com", "atsScore": 72, "skills": ["Java", "Spring Boot"],    "recommendedRole": "Java Developer"},
                {"email": "c@test.com", "atsScore": 90, "skills": ["Python", "ML", "TensorFlow"], "recommendedRole": "Data Scientist"},
            ]
        }
        r = requests.post(f"{BASE_URL}/hr/insights", json=data, timeout=TIMEOUT)
        r.raise_for_status()
        result = r.json()
        _ok("Done")
        print(f"     total_candidates:  {result.get('total_candidates')}")
        print(f"     average_ats_score: {result.get('average_ats_score')}")
        print(f"     top_skills:        {result.get('top_skills', [])[:3]}")
        print(f"     recommendations:   {result.get('recommendations', [])[:2]}")
        return True
    except Exception as e:
        _fail("HR insights failed", e)
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Runner
# ──────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  AI Resume Screening System — API Test Suite")
    print("=" * 65)
    print(f"  Base URL : {BASE_URL}")
    print(f"  Timeout  : {TIMEOUT}s per request")
    print("=" * 65)

    tests = [
        test_health_check,
        test_rewrite,
        test_project_enhance,
        test_jd_tailor,
        test_suggest_skills,
        test_project_summary,
        test_jd_suggestions,
        test_hr_rank,
        test_hr_auto_shortlist,
        test_hr_cluster,
        test_hr_insights,
    ]

    passed = 0
    start  = time.time()

    for test in tests:
        if test():
            passed += 1

    elapsed = time.time() - start
    print("\n" + "=" * 65)
    print(f"  Results : {passed}/{len(tests)} tests passed  ({elapsed:.1f}s total)")
    print("=" * 65)

    if passed == len(tests):
        print("\n✅  All tests passed — your API is fully operational.")
    else:
        failed = len(tests) - passed
        print(f"\n⚠️   {failed} test(s) failed. Check errors above.")
        print("     Is the AI service running?  →  python main.py")


if __name__ == "__main__":
    main()