// src/types.ts

export type Role = "USER" | "ADMIN" | string;

// Response from ATS resume analysis
export type AnalyzeResp = {
  ats_score: number;               // Overall ATS match score
  recommended_role: string;        // Suggested role
  matched_keywords: string[];      // Keywords matched from JD/resume
  explanation?: string;            // Optional explanation or notes
};

// Response from JD matching endpoint
export type JDMatchResp = {
  jd_match_score: number;          // Sequence similarity %
  similarity_score: number;        // Jaccard similarity %
  missing_skills: string[];        // Missing skills in resume vs JD
  summary?: string;                // Optional summary or notes
};

// Suggestions for improvement
export type ImproveResp = {
  suggestions: string[];
};

// Record structure for history
export type HistoryRecord = {
  id: number;
  email: string;
  atsScore: number;
  recommendedRole: string;
  matchedKeywords: string;
  missingSkills: string;
  jdMatchScore: number | null;
  similarityScore: number | null;
  createdAt: string;               // ISO date string
};
