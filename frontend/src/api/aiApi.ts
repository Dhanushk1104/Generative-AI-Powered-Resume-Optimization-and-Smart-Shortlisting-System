import API from "./api";
import api from "./api";

// ─── Phase 1 ──────────────────────────────────────────────────────────────────

// ── NEW: Role match with percentage returned by FastAPI ───────────────────────
export interface RoleMatch {
  role: string;        // e.g. "Full Stack Developer"
  percentage: number;  // 0–100
}

/**
 * Supports BOTH:
 *  - Spring Boot flat response
 *  - FastAPI nested response
 */
export interface AnalyzeResp {
  // ── Flat top-level keys ────────────────────────────────────────────────────
  ats_score?: number;
  recommended_role?: string;
  matched_keywords?: string[];
  explanation?: string;

  // ── NEW: role match support ────────────────────────────────────────────────
  role_matches?: RoleMatch[];

  // ── Nested ats object (FastAPI compatibility) ──────────────────────────────
  ats?: {
    ats_score: number;
    recommended_role: string;
    feedback: string;
    role_matches?: RoleMatch[];
  };

  // ── AI structured data ─────────────────────────────────────────────────────
  ai_data: {
    profile: { name: string | null; email: string | null; phone: string | null };
    education: { degree?: string; cgpa?: string; college?: string; location?: string };
    skills: string[];
    skill_count: number;

    // also may contain role matches
    role_matches?: RoleMatch[];

    confidence: string;
    meta: { date: string; time: string; location: string };
  };

  // ── Extracted resume text ───────────────────────────────────────────────────
  extracted_text: string;
}

/**
 * Safe getters (flat → nested → fallback)
 */
export function getAtsScore(result: AnalyzeResp | null): number {
  if (!result) return 0;
  if (result.ats_score != null) return result.ats_score;
  if (result.ats?.ats_score != null) return result.ats.ats_score;
  return 0;
}

export function getRecommendedRole(result: AnalyzeResp | null): string {
  if (!result) return "";
  if (result.recommended_role) return result.recommended_role;
  if (result.ats?.recommended_role) return result.ats.recommended_role;
  return "";
}

export function getSkills(result: AnalyzeResp | null): string[] {
  if (!result) return [];
  if (result.ai_data?.skills?.length) return result.ai_data.skills;
  if (result.matched_keywords?.length) return result.matched_keywords;
  return [];
}

export function getFeedback(result: AnalyzeResp | null): string {
  if (!result) return "";
  if (result.ats?.feedback) return result.ats.feedback;
  if (result.explanation) return result.explanation;
  return "";
}

/**
 * NEW: Role matches getter (top-level → nested → ai_data)
 */
export function getRoleMatches(result: AnalyzeResp | null): RoleMatch[] {
  if (!result) return [];
  if (result.role_matches?.length) return result.role_matches;
  if (result.ats?.role_matches?.length) return result.ats.role_matches!;
  if (result.ai_data?.role_matches?.length) return result.ai_data.role_matches!;
  return [];
}

export async function analyzeResume(file: File): Promise<AnalyzeResp> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await API.post<AnalyzeResp>("/ai/analyze-file", formData);

  // ── Phase 2 bridge ────────────────────────────────────────────────────────
  if (res.data?.extracted_text) {
    localStorage.setItem("extracted_text", res.data.extracted_text);
  }

  return res.data;
}

// ─── Phase 2 ──────────────────────────────────────────────────────────────────

export interface RewriteResp {
  optimized_resume: string;
  improvements: string[];
  source: "llm" | "rule_based";
}

export async function rewriteResume(
  resumeText: string,
  jobDescription?: string
): Promise<RewriteResp> {
  const res = await API.post<RewriteResp>("/ai/rewrite", { resumeText, jobDescription });
  return res.data;
}

export interface ProjectEnhanceResp {
  enhanced_projects: string[];
  total_enhanced: number;
}

export async function enhanceProjects(
  projects: string[]
): Promise<ProjectEnhanceResp> {
  const res = await API.post<ProjectEnhanceResp>("/ai/project-enhance", { projects });
  return res.data;
}

export interface JDTailorResp {
  tailored_resume: string;
  jd_match_score: number;
  key_requirements: string[];
  suggestions: string[];
}

export async function tailorToJD(
  resumeText: string,
  jobDescription: string
): Promise<JDTailorResp> {
  const res = await API.post<JDTailorResp>("/ai/jd-tailor", {
    resumeText,
    jobDescription,
  });
  return res.data;
}

// ─── HR AI ────────────────────────────────────────────────────────────────────

export interface Candidate {
  email: string;
  atsScore: number;
  recommendedRole?: string;
  experienceYears?: number;
  skillsMatch?: number;
  skills?: string[];
}

export interface RankedCandidate extends Candidate {
  rank: number;
  rank_score: number;
  status: "SHORTLISTED" | "PENDING" | "REJECTED";
}

export async function rankCandidates(
  candidates: Candidate[]
): Promise<{ ranked_candidates: RankedCandidate[] }> {
  const res = await API.post("/hr/rank", { candidates });
  return res.data as { ranked_candidates: RankedCandidate[] };
}

export interface ClusterResp {
  clusters: Record<string, Candidate[]>;
  total_clusters: number;
  cluster_summary: {
    cluster_name: string;
    size: number;
    avg_ats_score: number;
    avg_experience: number;
    description: string;
  }[];
}

export async function clusterCandidates(
  candidates: Candidate[],
  n_clusters = 3
): Promise<ClusterResp> {
  const res = await API.post("/hr/cluster", { candidates, n_clusters });
  return res.data as ClusterResp;
}

export interface AutoShortlistResp {
  shortlisted: Candidate[];
  pending: Candidate[];
  rejected: Candidate[];
  summary: {
    total: number;
    shortlisted_count: number;
    pending_count: number;
    rejected_count: number;
    threshold_used: number;
  };
}

export async function autoShortlist(
  candidates: Candidate[],
  threshold = 70
): Promise<AutoShortlistResp> {
  const res = await API.post("/hr/auto-shortlist", { candidates, threshold });
  return res.data as AutoShortlistResp;
}

export interface HRInsightsResp {
  total_candidates: number;
  average_ats_score: number;
  top_skills: { skill: string; count: number }[];
  role_distribution: Record<string, number>;
  recommendations: string[];
}

export async function getHRInsights(
  candidates: Candidate[]
): Promise<HRInsightsResp> {
  const res = await API.post("/hr/insights", { candidates });
  return res.data as HRInsightsResp;
}

// ─── Phase 2 — Skill Gap / Resume Enhancement ─────────────────────────────────

export interface CertificationSuggestion {
  name: string;
  provider: string;
  level: string;
}

export interface SkillSuggestResp {
  missing_technical: string[];
  trending: string[];
  soft_skills: string[];
  certifications: CertificationSuggestion[];
  role_gap_analysis: string;

  // indicates LLM or fallback
  source?: "llm" | "nlp_fallback";
}

export interface ProjectSummaryResp {
  one_liner: string;
  full_summary: string;
  highlights: string[];
  impact_metrics: string[];
}

export interface ProjectSuggestion {
  title: string;
  description: string;
  tech_stack: string[];
}

export interface JDSuggestionsResp {
  skills_to_add: string[];
  projects_to_add: ProjectSuggestion[];
  keywords_to_include: string[];
  action_plan: string[];
}

export const suggestSkills = async (
  resumeText: string
): Promise<SkillSuggestResp> => {
  const res = await api.post<SkillSuggestResp>("/ai/suggest-skills", { resumeText });
  return res.data;
};

export const generateProjectSummary = async (
  title: string,
  techStack: string
): Promise<ProjectSummaryResp> => {
  const res = await api.post<ProjectSummaryResp>("/ai/project-summary", {
    title,
    techStack,
  });
  return res.data;
};

export const suggestJDAdditions = async (
  resumeText: string,
  jobDescription: string
): Promise<JDSuggestionsResp> => {
  const res = await api.post<JDSuggestionsResp>("/ai/jd-suggestions", {
    resumeText,
    jobDescription,
  });
  return res.data;
};