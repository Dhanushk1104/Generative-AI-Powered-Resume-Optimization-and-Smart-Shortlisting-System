// src/pages/ApplicantDashboard.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyzeResp, getAtsScore, getRecommendedRole, getSkills, getFeedback } from "../api/aiApi";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell,
} from "recharts";

const ROLE_KEYWORDS: Record<string, string[]> = {
  "Software Engineer":    ["python", "java", "c++", "javascript", "spring", "react", "node.js", "api", "docker", "git"],
  "Data Scientist":       ["python", "r", "sql", "pandas", "numpy", "tensorflow", "keras", "ml", "data analysis", "statistics"],
  "DevOps Engineer":      ["docker", "kubernetes", "ci/cd", "terraform", "jenkins", "aws", "azure", "linux", "bash"],
  "Full Stack Developer": ["react", "node.js", "javascript", "typescript", "api", "mongodb", "css", "html"],
  "ML Engineer":          ["machine learning", "tensorflow", "pytorch", "nlp", "keras", "scikit-learn", "bert"],
  "Data Analyst":         ["sql", "tableau", "power bi", "pandas", "data analysis", "excel", "matplotlib"],
  "Cloud Engineer":       ["aws", "azure", "gcp", "terraform", "docker", "kubernetes", "ci/cd"],
  "Backend Developer":    ["java", "python", "node.js", "rest api", "microservices", "postgresql", "redis"],
};

const SKILL_CATEGORIES: Record<string, string[]> = {
  "Languages":   ["python", "java", "javascript", "typescript", "c++", "c#", "go", "kotlin", "swift", "sql", "r"],
  "Frameworks":  ["react", "django", "flask", "spring", "node.js", "angular", "vue", "fastapi", "express"],
  "Cloud/DevOps":["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "jenkins", "ansible"],
  "ML/AI":       ["machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "nlp", "keras", "bert"],
  "Databases":   ["mysql", "postgresql", "mongodb", "redis", "firebase", "elasticsearch", "sqlite"],
  "Tools":       ["git", "github", "jira", "postman", "figma", "jenkins", "vs code", "confluence"],
};

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899", "#0d9488"];

function scoreColor(s: number) {
  return s >= 80 ? "text-green-600" : s >= 60 ? "text-amber-600" : "text-red-600";
}
function scoreBg(s: number) {
  return s >= 80
    ? "from-green-50 to-emerald-50 border-green-200"
    : s >= 60
    ? "from-amber-50 to-yellow-50 border-amber-200"
    : "from-red-50 to-rose-50 border-red-200";
}
function scoreLabel(s: number) {
  return s >= 80 ? "Excellent" : s >= 60 ? "Good" : "Needs Improvement";
}

export default function ApplicantDashboard() {
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<"overview" | "skills" | "roles">("overview");

  // ── Read from localStorage ──
  const result: AnalyzeResp | null = (() => {
    try {
      const stored = localStorage.getItem("resumeResult");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  })();

  // ── FIX: Use safe helper functions that handle both flat and nested response ──
  const atsScore        = getAtsScore(result);
  const recommendedRole = getRecommendedRole(result);
  const skills          = getSkills(result);
  const feedback        = getFeedback(result);
  const skillsLower     = skills.map((s) => s.toLowerCase());

  // ── Radar chart: skill category coverage ──
  const radarData = Object.entries(SKILL_CATEGORIES).map(([category, catSkills]) => {
    const matched = catSkills.filter((s) => skillsLower.includes(s)).length;
    const score   = Math.round((matched / catSkills.length) * 100);
    return { category, score, matched, total: catSkills.length };
  });

  // ── Role match bar chart ──
  const roleMatchData = Object.entries(ROLE_KEYWORDS)
    .map(([role, keywords]) => ({
      role: role.replace(" ", "\n"),
      fullRole: role,
      matchPct: Math.round((keywords.filter((k) => skillsLower.includes(k)).length / keywords.length) * 100),
    }))
    .sort((a, b) => b.matchPct - a.matchPct);

  // ── Skill gap for top matched role ──
  const topRole       = roleMatchData[0]?.fullRole ?? "";
  const topRoleSkills = ROLE_KEYWORDS[topRole] ?? [];
  const missingSkills = topRoleSkills.filter((k) => !skillsLower.includes(k));
  const presentSkills = topRoleSkills.filter((k) => skillsLower.includes(k));

  // ── ATS breakdown ──
  const atsBreakdown = [
    { label: "Skills",         pct: Math.min(skills.length * 4, 40), max: 40 },
    { label: "Projects",       pct: feedback.includes("Developed") || feedback.includes("Built") ? 20 : 12, max: 20 },
    { label: "Education",      pct: result?.ai_data?.education?.degree ? 15 : 4, max: 15 },
    { label: "Experience",     pct: feedback.toLowerCase().includes("intern") ? 15 : 8, max: 15 },
    { label: "Certifications", pct: feedback.toLowerCase().includes("udemy") || feedback.toLowerCase().includes("aws certified") ? 10 : 0, max: 10 },
    { label: "Contact",        pct: result?.ai_data?.profile?.email && result?.ai_data?.profile?.phone ? 5 : 2, max: 5 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              Applicant Dashboard
            </div>
            <h1 className="text-3xl font-bold text-slate-900">My Resume Analytics</h1>
            <p className="text-slate-500 mt-1">Deep insights from your uploaded resume</p>
          </div>
          <button
            onClick={() => nav("/home")}
            className="px-5 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-all shadow-sm"
          >
            ← Upload New Resume
          </button>
        </div>

        {/* ── No result ── */}
        {!result && (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-3xl mb-4">📊</div>
            <p className="font-semibold text-slate-600 mb-1">No resume analysed yet</p>
            <p className="text-sm text-slate-400 mb-6">Upload a resume from the Home page to see your full analytics here</p>
            <button
              onClick={() => nav("/home")}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-600 text-white font-bold hover:from-teal-700 hover:to-indigo-700 transition-all shadow-lg"
            >
              ← Go to Home & Upload
            </button>
          </div>
        )}

        {result && (
          <>
            {/* ── ATS Hero Card ── */}
            <div className={`rounded-3xl border bg-gradient-to-br p-8 ${scoreBg(atsScore)}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ATS Score</p>
                  <div className={`text-7xl font-black ${scoreColor(atsScore)}`}>
                    {atsScore}
                    <span className="text-3xl text-slate-400 font-medium">/100</span>
                  </div>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white border ${scoreColor(atsScore)}`}>
                    {scoreLabel(atsScore)}
                  </span>
                  {/* FIX: Shows recommended role from helper getter */}
                  <p className="text-sm text-slate-600 mt-2">
                    Suggested Role: <strong>{recommendedRole || "Analysing…"}</strong>
                  </p>
                  <div className="w-56 bg-white/70 rounded-full h-3 mt-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${atsScore >= 80 ? "bg-green-500" : atsScore >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${atsScore}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:text-right">
                  {result.ai_data?.profile?.email && (
                    <p className="text-sm text-slate-600">📧 {result.ai_data.profile.email}</p>
                  )}
                  {result.ai_data?.profile?.phone && (
                    <p className="text-sm text-slate-600">📞 {result.ai_data.profile.phone}</p>
                  )}
                  {result.ai_data?.education?.degree && (
                    <p className="text-sm text-slate-600">🎓 {result.ai_data.education.degree}</p>
                  )}
                  {result.ai_data?.education?.cgpa && (
                    <p className="text-sm text-slate-600">📈 CGPA: {result.ai_data.education.cgpa}</p>
                  )}
                  {result.ai_data?.education?.college && (
                    <p className="text-sm text-slate-600">🏫 {result.ai_data.education.college}</p>
                  )}
                  <p className="text-sm text-slate-600">💡 {skills.length} skills detected</p>
                </div>
              </div>
            </div>

            {/* ── Tab Nav ── */}
            <div className="flex gap-2 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm w-fit">
              {(["overview", "skills", "roles"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${
                    activeTab === tab
                      ? "bg-teal-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {tab === "overview" ? "📊 Overview" : tab === "skills" ? "💡 Skills" : "🎯 Role Fit"}
                </button>
              ))}
            </div>

            {/* ══ TAB: OVERVIEW ══ */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "ATS Score",     value: `${atsScore}/100`,                        icon: "🏆", color: "teal"   },
                    { label: "Skills Found",  value: skills.length,                             icon: "💡", color: "indigo" },
                    { label: "Role Match",    value: `${roleMatchData[0]?.matchPct ?? 0}%`,     icon: "🎯", color: "amber" },
                    { label: "Skill Gaps",    value: missingSkills.length,                      icon: "⚠️", color: "red"  },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <div className="text-2xl mb-2">{icon}</div>
                      <p className="text-2xl font-black text-slate-800">{String(value)}</p>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
                    </div>
                  ))}
                </div>

                {/* ATS Score Breakdown */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                  <h2 className="font-bold text-slate-800 mb-1">ATS Score Breakdown</h2>
                  <p className="text-xs text-slate-400 mb-5">How your resume scores across each ATS dimension</p>
                  <div className="space-y-3">
                    {atsBreakdown.map(({ label, pct, max }) => (
                      <div key={label}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-slate-700">{label}</span>
                          <span className="text-xs text-slate-400">{Math.round(pct)}/{max} pts</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-700 ${
                              pct / max >= 0.8 ? "bg-green-500" : pct / max >= 0.5 ? "bg-amber-500" : "bg-red-400"
                            }`}
                            style={{ width: `${(pct / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skill Gap Analysis */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                  <h2 className="font-bold text-slate-800 mb-1">Skill Gap Analysis</h2>
                  <p className="text-xs text-slate-400 mb-5">
                    For your top matched role: <strong className="text-teal-600">{topRole}</strong>
                  </p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">✅ You Have ({presentSkills.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {presentSkills.map((k) => (
                          <span key={k} className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">
                            {k}
                          </span>
                        ))}
                        {presentSkills.length === 0 && <p className="text-xs text-slate-400">None matched</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">❌ You're Missing ({missingSkills.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {missingSkills.map((k) => (
                          <span key={k} className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-xs font-medium">
                            {k}
                          </span>
                        ))}
                        {missingSkills.length === 0 && (
                          <p className="text-xs text-green-600 font-semibold">🎉 Perfect match!</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Recommendations */}
                {feedback && (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                    <h2 className="font-bold text-slate-800 mb-4">💬 AI Recommendations</h2>
                    <div className="space-y-2">
                      {feedback
                        .split("\n")
                        .filter((line) => line.trim().startsWith("•"))
                        .map((line, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                            <span className="text-indigo-500 mt-0.5">💡</span>
                            <p className="text-sm text-slate-700">{line.replace("•", "").trim()}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: SKILLS ══ */}
            {activeTab === "skills" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                  <h2 className="font-bold text-slate-800 mb-1">Skill Category Coverage</h2>
                  <p className="text-xs text-slate-400 mb-4">How well your skills cover each technical domain</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="category" tick={{ fontSize: 12, fill: "#64748b" }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Radar name="Coverage" dataKey="score" stroke="#0d9488" fill="#0d9488" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    {radarData.map(({ category, score, matched, total }) => (
                      <div key={category} className="p-3 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-slate-600">{category}</span>
                          <span className={`text-xs font-bold ${score >= 60 ? "text-green-600" : score >= 30 ? "text-amber-600" : "text-red-500"}`}>
                            {score}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${score >= 60 ? "bg-green-500" : score >= 30 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{matched}/{total} skills</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* All Matched Skills */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                  <h2 className="font-bold text-slate-800 mb-4">
                    All Matched Skills
                    <span className="ml-2 text-xs font-normal text-slate-400">({skills.length} total)</span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((k, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-default"
                        style={{
                          backgroundColor: COLORS[idx % COLORS.length] + "15",
                          borderColor:     COLORS[idx % COLORS.length] + "40",
                          color:           COLORS[idx % COLORS.length],
                        }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: ROLE FIT ══ */}
            {activeTab === "roles" && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                  <h2 className="font-bold text-slate-800 mb-1">Role Compatibility Score</h2>
                  <p className="text-xs text-slate-400 mb-4">% of required skills you already have for each role</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={roleMatchData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="role" tick={{ fontSize: 11, fill: "#64748b" }} width={120} />
                      <Tooltip
                        formatter={(v: number) => [`${v}%`, "Match"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                      />
                      <Bar dataKey="matchPct" radius={[0, 8, 8, 0]}>
                        {roleMatchData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={index === 0 ? "#0d9488" : index === 1 ? "#6366f1" : "#94a3b8"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Role Cards */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {roleMatchData.slice(0, 4).map(({ fullRole, matchPct }, idx) => {
                    const roleSkills   = ROLE_KEYWORDS[fullRole] ?? [];
                    const present      = roleSkills.filter((k) => skillsLower.includes(k));
                    const missing      = roleSkills.filter((k) => !skillsLower.includes(k));
                    const isTopMatch   = idx === 0;
                    return (
                      <div
                        key={fullRole}
                        className={`rounded-2xl border p-5 ${isTopMatch ? "border-teal-300 bg-teal-50/50" : "border-slate-100 bg-white"} shadow-sm`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{fullRole}</p>
                            {isTopMatch && (
                              <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">⭐ Best Match</span>
                            )}
                          </div>
                          <span className={`text-lg font-black ${matchPct >= 60 ? "text-green-600" : matchPct >= 40 ? "text-amber-600" : "text-red-500"}`}>
                            {matchPct}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
                          <div
                            className={`h-2 rounded-full transition-all duration-700 ${matchPct >= 60 ? "bg-green-500" : matchPct >= 40 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${matchPct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-green-600 font-semibold mb-1">✅ Have: {present.join(", ") || "—"}</p>
                        <p className="text-[10px] text-red-500 font-semibold">❌ Need: {missing.join(", ") || "—"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Phase 2 CTA ── */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">✨</div>
                <div>
                  <h2 className="font-bold text-slate-800">Enhance Your Resume</h2>
                  <p className="text-xs text-slate-400">Phase 2 — AI Enhancement</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { icon: "✍️", label: "Rewrite Resume",   desc: "ATS-optimised with stronger language", tab: "rewrite"  },
                  { icon: "🚀", label: "Enhance Projects", desc: "Quantified, impact-focused bullets",    tab: "projects" },
                  { icon: "🎯", label: "Tailor to JD",     desc: "Match score + keyword alignment",       tab: "tailor"   },
                ].map(({ icon, label, desc, tab }) => (
                  <button
                    key={tab}
                    onClick={() => nav("/resume-enhancer", { state: { extractedText: result.extracted_text, result } })}
                    className="text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-teal-400 hover:bg-teal-50 transition-all"
                  >
                    <div className="text-2xl mb-2">{icon}</div>
                    <p className="font-semibold text-slate-800 text-sm">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}