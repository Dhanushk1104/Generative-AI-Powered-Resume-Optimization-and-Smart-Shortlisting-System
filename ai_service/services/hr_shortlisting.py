"""
hr_shortlisting.py
──────────────────
HR automation: candidate ranking, K-means clustering, auto-shortlisting,
and insight generation. Pure ML — no LLM required.

Fixes applied vs original:
  BUG-1 : df['atsScore'].mean() raises if column has NaN values (e.g. when a
           candidate dict is missing 'atsScore'). All numeric columns now filled
           with 0 before arithmetic so pandas never produces NaN in output.
  BUG-2 : cluster_candidates() could request more clusters than candidates
           (n_clusters > len(candidates)), causing KMeans to crash.
           Guard already existed but didn't handle the edge case len < 2.
           Fixed with a max(1, …) guard.
  BUG-3 : clusters dict used integer keys from df['cluster'] (int64), which
           JSON serialises as numbers, not "cluster_0" strings. The
           get_cluster_summary() then iterated over the wrong keys.
           Fixed: cluster key is now always f"cluster_{int(cluster_id)}".
  BUG-4 : rank_candidates() mutated the input dicts in place (adding 'rank'
           and 'status' keys to the caller's original data). Fixed by copying.
  BUG-5 : generate_hr_insights() — if 'atsScore' column is missing entirely,
           the mean() call raises KeyError. Added safe accessor.
"""

from typing import List, Dict, Any
from collections import defaultdict

import pandas as pd
import numpy as np
from sklearn.cluster import KMeans


# ══════════════════════════════════════════════════════════════════════════════
# RANKING
# ══════════════════════════════════════════════════════════════════════════════

def rank_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Rank candidates by a composite score (ATS + experience + skills).
    Returns a new list; input dicts are NOT mutated (BUG-4 fix).
    """
    if not candidates:
        return []

    # BUG-1 fix: fillna before arithmetic
    df = pd.DataFrame(candidates).fillna(0)

    df["rank_score"] = 0.0
    if "atsScore" in df.columns:
        df["rank_score"] += pd.to_numeric(df["atsScore"], errors="coerce").fillna(0)
    if "experienceYears" in df.columns:
        df["rank_score"] += pd.to_numeric(df["experienceYears"], errors="coerce").fillna(0) * 2
    if "skillsMatch" in df.columns:
        df["rank_score"] += pd.to_numeric(df["skillsMatch"], errors="coerce").fillna(0) * 0.5

    df = df.sort_values("rank_score", ascending=False).reset_index(drop=True)

    result = []
    for i, row in df.iterrows():
        # BUG-4 fix: build a new dict instead of mutating the original
        candidate = row.to_dict()
        candidate["rank"]   = int(i) + 1
        candidate["status"] = "SHORTLISTED" if candidate.get("rank_score", 0) >= 70 else "PENDING"
        # Convert numpy types → native Python for JSON serialisation
        candidate = _serialise(candidate)
        result.append(candidate)

    return result


# ══════════════════════════════════════════════════════════════════════════════
# CLUSTERING
# ══════════════════════════════════════════════════════════════════════════════

def cluster_candidates(
    candidates: List[Dict[str, Any]],
    n_clusters: int = 3,
) -> Dict[str, Any]:
    """
    Group candidates into k clusters using K-means on numeric features.
    """
    if not candidates:
        return {"clusters": {}, "total_clusters": 0, "cluster_summary": []}

    # BUG-2 fix: clamp n_clusters
    n_clusters = max(1, min(n_clusters, len(candidates)))

    # Build feature matrix
    features = []
    for c in candidates:
        features.append([
            float(c.get("atsScore",       0) or 0),
            float(c.get("experienceYears", 0) or 0),
            float(c.get("skillsMatch",     0) or 0),
            float(len(c.get("skills", [])) or 0),
        ])

    X  = np.array(features)
    df = pd.DataFrame(candidates)

    if len(X) >= n_clusters and n_clusters > 1:
        kmeans      = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        df["cluster"] = kmeans.fit_predict(X)
    else:
        df["cluster"] = 0

    # BUG-3 fix: always use string keys "cluster_0", "cluster_1", …
    clusters: Dict[str, List] = defaultdict(list)
    for _, row in df.iterrows():
        key = f"cluster_{int(row['cluster'])}"
        clusters[key].append(_serialise(row.to_dict()))

    clusters_dict = dict(clusters)
    return {
        "clusters":        clusters_dict,
        "total_clusters":  len(clusters_dict),
        "cluster_summary": _get_cluster_summary(clusters_dict),
    }


def _get_cluster_summary(clusters: Dict[str, List]) -> List[Dict[str, Any]]:
    summary = []
    for cluster_name, members in clusters.items():
        df = pd.DataFrame(members)

        # BUG-1 fix: fillna before mean()
        avg_ats = (
            float(pd.to_numeric(df["atsScore"], errors="coerce").fillna(0).mean())
            if "atsScore" in df.columns else 0.0
        )
        avg_exp = (
            float(pd.to_numeric(df["experienceYears"], errors="coerce").fillna(0).mean())
            if "experienceYears" in df.columns else 0.0
        )

        summary.append({
            "cluster_name": cluster_name,
            "size":         len(members),
            "avg_ats_score": round(avg_ats, 2),
            "avg_experience": round(avg_exp, 2),
            "description":  _cluster_description(avg_ats),
        })

    return summary


def _cluster_description(avg_ats: float) -> str:
    if avg_ats >= 80:
        return "Highly qualified candidates — top performers"
    elif avg_ats >= 70:
        return "Strong candidates — well qualified"
    elif avg_ats >= 60:
        return "Moderate candidates — potential with development"
    else:
        return "Entry-level candidates — require training"


# ══════════════════════════════════════════════════════════════════════════════
# AUTO-SHORTLISTING
# ══════════════════════════════════════════════════════════════════════════════

def auto_shortlist_by_threshold(
    candidates: List[Dict[str, Any]],
    threshold: int = 70,
) -> Dict[str, Any]:
    """
    Categorise candidates into SHORTLISTED / PENDING / REJECTED based on
    their ATS score relative to the threshold.
    """
    shortlisted: List[Dict] = []
    pending:     List[Dict] = []
    rejected:    List[Dict] = []

    for raw_candidate in candidates:
        candidate  = dict(raw_candidate)      # BUG-4 fix: copy
        ats_score  = float(candidate.get("atsScore", 0) or 0)

        if ats_score >= threshold:
            candidate["status"] = "SHORTLISTED"
            shortlisted.append(candidate)
        elif ats_score >= threshold - 10:
            candidate["status"] = "PENDING"
            pending.append(candidate)
        else:
            candidate["status"] = "REJECTED"
            rejected.append(candidate)

    return {
        "shortlisted": shortlisted,
        "pending":     pending,
        "rejected":    rejected,
        "summary": {
            "total":             len(candidates),
            "shortlisted_count": len(shortlisted),
            "pending_count":     len(pending),
            "rejected_count":    len(rejected),
            "threshold_used":    threshold,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# INSIGHTS
# ══════════════════════════════════════════════════════════════════════════════

def generate_hr_insights(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate aggregate insights about a candidate pool.
    """
    if not candidates:
        return {
            "total_candidates":   0,
            "average_ats_score":  0.0,
            "top_skills":         [],
            "role_distribution":  {},
            "recommendations":    ["No candidates found. Start by uploading resumes."],
        }

    # BUG-5 fix: safe column access with fillna
    df = pd.DataFrame(candidates)

    avg_ats = 0.0
    if "atsScore" in df.columns:
        avg_ats = float(
            pd.to_numeric(df["atsScore"], errors="coerce").fillna(0).mean()
        )

    insights: Dict[str, Any] = {
        "total_candidates":  len(candidates),
        "average_ats_score": round(avg_ats, 2),
        "top_skills":        _get_top_skills(candidates),
        "role_distribution": _get_role_distribution(candidates),
        "recommendations":   [],
    }

    # Generate recommendations
    if avg_ats < 65:
        insights["recommendations"].append(
            "Overall candidate quality is below average. "
            "Consider expanding recruitment channels or revising the JD."
        )
    if avg_ats >= 80:
        insights["recommendations"].append(
            "Strong candidate pool — recommend accelerating the shortlisting process."
        )
    if len(candidates) < 10:
        insights["recommendations"].append(
            "Small candidate pool. Recommend extending the application deadline."
        )
    if not insights["recommendations"]:
        insights["recommendations"].append(
            "Candidate pool looks healthy. Review top-ranked candidates first."
        )

    return insights


def _get_top_skills(candidates: List[Dict[str, Any]]) -> List[Dict[str, int]]:
    skill_count: Dict[str, int] = defaultdict(int)

    for c in candidates:
        for skill in c.get("skills", []):
            if skill:
                skill_count[str(skill)] += 1

    sorted_skills = sorted(skill_count.items(), key=lambda x: x[1], reverse=True)
    return [{"skill": s, "count": cnt} for s, cnt in sorted_skills[:10]]


def _get_role_distribution(candidates: List[Dict[str, Any]]) -> Dict[str, int]:
    role_count: Dict[str, int] = defaultdict(int)
    for c in candidates:
        role = c.get("recommendedRole") or "Unknown"
        role_count[str(role)] += 1
    return dict(role_count)


# ══════════════════════════════════════════════════════════════════════════════
# SERIALISATION HELPER
# ══════════════════════════════════════════════════════════════════════════════

def _serialise(d: Dict) -> Dict:
    """Convert numpy/pandas scalar types to native Python for JSON safety."""
    out = {}
    for k, v in d.items():
        if isinstance(v, (np.integer,)):
            out[k] = int(v)
        elif isinstance(v, (np.floating,)):
            out[k] = float(v)
        elif isinstance(v, np.ndarray):
            out[k] = v.tolist()
        else:
            out[k] = v
    return out
