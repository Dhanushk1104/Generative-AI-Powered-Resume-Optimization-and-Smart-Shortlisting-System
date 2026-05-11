import { useState, useCallback } from "react";
import {
  suggestSkills,
  generateProjectSummary,
  suggestJDAdditions,
  ProjectSummaryResp,
  JDSuggestionsResp,
} from "../api/aiApi";
import SkillSuggestions, { SkillSuggestionsData } from "./SkillSuggestions";

type Tab = "rewrite" | "projects" | "tailor";

/* ─── Copy helper hook ─────────────────────────────────────────────────────── */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);
  return { copied, copy };
}

export default function ResumeEnhancer() {
  const { copied, copy } = useCopy();
  const [activeTab, setActiveTab] = useState<Tab>("rewrite");

  // ── Rewrite Tab: Skill Suggestions ────────────────────────────────────────
  const [skillData,    setSkillData]    = useState<SkillSuggestionsData | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillError,   setSkillError]   = useState<string | null>(null);

  // ── Projects Tab: Title + Tech Stack → Summary ─────────────────────────────
  const [projTitle, setProjTitle] = useState("");
  const [projTechStack, setProjTechStack] = useState("");
  const [projSummary, setProjSummary] = useState<ProjectSummaryResp | null>(null);
  const [projSummaryLoading, setProjSummaryLoading] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  // ── Tailor Tab: JD only → Skills + Project suggestions ────────────────────
  const [tailorJD, setTailorJD] = useState("");
  const [jdSuggestions, setJdSuggestions] = useState<JDSuggestionsResp | null>(null);
  const [jdSuggestLoading, setJdSuggestLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSuggestSkills = async () => {
    setSkillLoading(true);
    setSkillError(null);
    setSkillData(null);
    try {
      // Phase 2: read the extracted resume text stored after Phase 1 ATS analysis
      const resumeText = localStorage.getItem("extracted_text") || "";
      if (!resumeText.trim()) {
        setSkillError("No resume found. Please upload and analyse your resume from the Dashboard first.");
        return;
      }
      const res = await suggestSkills(resumeText);
      setSkillData(res as SkillSuggestionsData);
    } catch (e: any) {
      setSkillError(e?.response?.data?.detail || "Failed to generate skill gap analysis. Ensure your resume has been uploaded and analysed first.");
    } finally {
      setSkillLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!projTitle.trim() || !projTechStack.trim()) {
      setProjError("Please enter both a project title and tech stack.");
      return;
    }
    setProjSummaryLoading(true);
    setProjError(null);
    setProjSummary(null);
    try {
      const res = await generateProjectSummary(projTitle, projTechStack);
      setProjSummary(res);
    } catch (e: any) {
      setProjError(e?.response?.data?.detail || "Failed to generate summary.");
    } finally {
      setProjSummaryLoading(false);
    }
  };

  const handleJDSuggest = async () => {
    if (!tailorJD.trim()) {
      setJdError("Please paste a job description.");
      return;
    }
    setJdSuggestLoading(true);
    setJdError(null);
    setJdSuggestions(null);
    try {
      const res = await suggestJDAdditions("", tailorJD);
      setJdSuggestions(res);
    } catch (e: any) {
      setJdError(e?.response?.data?.detail || "Failed to analyse job description.");
    } finally {
      setJdSuggestLoading(false);
    }
  };

  // ── Tab config (Phase 2 modules per project report) ───────────────────────
  const tabs: { id: Tab; label: string; icon: string; desc: string }[] = [
    { id: "rewrite",  label: "Skill Gap Analysis", icon: "✍️", desc: "Generative AI rewrites & suggests missing skills from your resume" },
    { id: "projects", label: "Project Enhancer",   icon: "🚀", desc: "Convert simple statements into quantified, impactful descriptions" },
    { id: "tailor",   label: "JD Tailoring",       icon: "🎯", desc: "Align your resume with a job description using LLM analysis" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold mb-3">
            <span>✨</span> Phase 2 — Generative AI Enhancement
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Resume Enhancer</h1>
          <p className="text-slate-500 mt-1">
            Powered by LLM — Skill Gap Analysis · Project Enhancement · JD Tailoring
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
                activeTab === t.id
                  ? "border-teal-500 bg-teal-50 shadow-md shadow-teal-100"
                  : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              <div className="text-xl mb-1">{t.icon}</div>
              <div className={`text-sm font-bold mb-1 ${activeTab === t.id ? "text-teal-700" : "text-slate-700"}`}>
                {t.label}
              </div>
              <div className="text-xs text-slate-400 leading-snug hidden sm:block">{t.desc}</div>
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════
            TAB: REWRITE — Analyse button + SkillSuggestions
        ════════════════════════════════════════════════ */}
        {activeTab === "rewrite" && (
          <div className="space-y-5">
            {/* Analyse trigger — only show if no data yet */}
            {!skillData && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-600 text-xs font-semibold mb-3">
                  <span>⚙️</span> Phase 2 — Generative AI Module
                </div>
                <h2 className="text-base font-bold text-slate-800 mb-1">
                  Generate Skill Gap Analysis
                </h2>
                <p className="text-sm text-slate-400 mb-1 leading-relaxed">
                  Uses your Phase 1 ATS-scored resume to identify missing technical skills, AI-trending technologies, soft skills, and recommended certifications — powered by GPT, LLaMA, and Mistral via SentenceTransformers.
                </p>
                <p className="text-xs text-slate-300 mb-4">
                  ✅ Requires resume upload &amp; Phase 1 analysis to be completed first.
                </p>
                {skillError && <ErrorMsg msg={skillError} />}
                <button
                  onClick={handleSuggestSkills}
                  disabled={skillLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-indigo-500 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2 shadow-md transition-all"
                >
                  {skillLoading ? <Spinner /> : <><span>⚡</span> Generate Skill Gap Analysis</>}
                </button>
              </div>
            )}

            {/* Results — only renders when data is present */}
            <SkillSuggestions apiData={skillData} />

            {/* Re-run button — only show after first analysis */}
            {skillData && (
              <button
                onClick={handleSuggestSkills}
                disabled={skillLoading}
                className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-slate-500 text-sm font-semibold hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {skillLoading ? <Spinner /> : <><span>🔄</span> Re-run Analysis</>}
              </button>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TAB: PROJECTS — Title + Tech Stack → Summary only
        ════════════════════════════════════════════════ */}
        {activeTab === "projects" && (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <span>✨</span> Generate Project Summary
                  <span className="px-2 py-0.5 bg-teal-50 text-teal-600 border border-teal-100 rounded-full text-xs font-semibold">New</span>
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Enter your project title and the technologies used — AI generates a professional summary you can copy directly to your resume.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-50 transition-all"
                    placeholder="e.g. AI-Powered Resume Screening System"
                    value={projTitle}
                    onChange={(e) => setProjTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateSummary()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Tech Stack *
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-50 transition-all"
                    placeholder="e.g. React, Spring Boot, FastAPI, MySQL"
                    value={projTechStack}
                    onChange={(e) => setProjTechStack(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateSummary()}
                  />
                </div>
              </div>

              {projError && <ErrorMsg msg={projError} />}

              <button
                onClick={handleGenerateSummary}
                disabled={projSummaryLoading || !projTitle.trim() || !projTechStack.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2 shadow-md transition-all"
              >
                {projSummaryLoading ? <Spinner /> : <><span>🪄</span> Generate Project Summary</>}
              </button>
            </div>

            {/* Summary Results */}
            {projSummary && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-8 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-700 flex items-center gap-2">
                    <span>📄</span> Generated Summary for <span className="text-teal-600">"{projTitle}"</span>
                  </h3>
                  <CopyButton
                    text={[projSummary.one_liner, "", projSummary.full_summary, "", ...(projSummary.highlights || [])].join("\n")}
                    copyKey="all-summary"
                    copied={copied}
                    onCopy={copy}
                    label="Copy All"
                  />
                </div>

                <SummaryCard
                  label="One-liner (ATS Bullet)"
                  icon="⚡"
                  text={projSummary.one_liner}
                  copyKey="proj-oneliner"
                  copied={copied}
                  onCopy={copy}
                  mono
                />

                <SummaryCard
                  label="Full Project Summary"
                  icon="📋"
                  text={projSummary.full_summary}
                  copyKey="proj-full"
                  copied={copied}
                  onCopy={copy}
                />

                {projSummary.highlights?.length > 0 && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span>✅</span> Key Highlights
                      </p>
                      <CopyButton
                        text={projSummary.highlights.join("\n")}
                        copyKey="proj-highlights"
                        copied={copied}
                        onCopy={copy}
                      />
                    </div>
                    <ul className="space-y-2">
                      {projSummary.highlights.map((h: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="text-teal-500 mt-0.5 shrink-0">▸</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {projSummary.impact_metrics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span>💥</span> Suggested Impact Metrics
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {projSummary.impact_metrics.map((m: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => copy(m, `metric-${i}`)}
                          className={`px-3 py-1.5 border rounded-full text-xs font-medium transition-colors ${
                            copied === `metric-${i}`
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100"
                          }`}
                        >
                          {copied === `metric-${i}` ? "✓ Copied" : m}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">Click any metric to copy it into your project description</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TAB: TAILOR TO JD — JD input only, no resume text
        ════════════════════════════════════════════════ */}
        {activeTab === "tailor" && (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <span>🎯</span> Tailor to Job Description
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Paste a job description and get a personalised list of skills and project ideas to add to your resume.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Job Description *
                </label>
                <textarea
                  rows={10}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-50 transition-all"
                  placeholder="Paste the full job description here — the more detail, the better the suggestions…"
                  value={tailorJD}
                  onChange={(e) => setTailorJD(e.target.value)}
                />
              </div>

              {jdError && <ErrorMsg msg={jdError} />}

              <button
                onClick={handleJDSuggest}
                disabled={jdSuggestLoading || !tailorJD.trim()}
                className="mt-5 w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2 shadow-md transition-all"
              >
                {jdSuggestLoading ? <Spinner /> : <><span>🎯</span> Analyse Job Description</>}
              </button>
            </div>

            {/* JD Suggestions Results */}
            {jdSuggestions && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-700 flex items-center gap-2">
                    <span>🧩</span> What to Add to Your Resume
                  </h3>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-full text-xs font-semibold">AI</span>
                </div>

                {jdSuggestions.skills_to_add?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span>⚙️</span> Skills to Add
                      </p>
                      <CopyButton
                        text={jdSuggestions.skills_to_add.join(", ")}
                        copyKey="jd-skills"
                        copied={copied}
                        onCopy={copy}
                        label="Copy All"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {jdSuggestions.skills_to_add.map((skill: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => copy(skill, `jd-skill-${i}`)}
                          className={`px-3 py-1.5 border rounded-full text-xs font-medium transition-colors ${
                            copied === `jd-skill-${i}`
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100"
                          }`}
                        >
                          {copied === `jd-skill-${i}` ? "✓ Copied" : `+ ${skill}`}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">Click any skill to copy it</p>
                  </div>
                )}

                {jdSuggestions.projects_to_add?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span>🚀</span> Project Ideas to Build / Add
                      </p>
                      <CopyButton
                        text={jdSuggestions.projects_to_add.map((p: any) => `${p.title}: ${p.description}`).join("\n\n")}
                        copyKey="jd-projects"
                        copied={copied}
                        onCopy={copy}
                        label="Copy All"
                      />
                    </div>
                    <div className="space-y-3">
                      {jdSuggestions.projects_to_add.map((proj: any, i: number) => (
                        <div key={i} className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-indigo-800">{proj.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{proj.description}</p>
                              {proj.tech_stack && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {proj.tech_stack.map((t: string, j: number) => (
                                    <span key={j} className="px-2 py-0.5 bg-white text-indigo-600 border border-indigo-200 rounded-full text-xs font-medium">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => copy(`${proj.title}: ${proj.description}`, `jd-proj-${i}`)}
                              className={`shrink-0 text-xs font-semibold border px-2 py-1 rounded-lg transition-colors ${
                                copied === `jd-proj-${i}`
                                  ? "bg-green-50 border-green-200 text-green-700"
                                  : "text-indigo-600 border-indigo-200 hover:bg-white"
                              }`}
                            >
                              {copied === `jd-proj-${i}` ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {jdSuggestions.keywords_to_include?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span>🔑</span> Keywords to Weave Into Your Resume
                      </p>
                      <CopyButton
                        text={jdSuggestions.keywords_to_include.join(", ")}
                        copyKey="jd-keywords"
                        copied={copied}
                        onCopy={copy}
                        label="Copy All"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {jdSuggestions.keywords_to_include.map((kw: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => copy(kw, `kw-${i}`)}
                          className={`px-3 py-1 border rounded-full text-xs font-medium transition-colors ${
                            copied === `kw-${i}`
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                          }`}
                        >
                          {copied === `kw-${i}` ? "✓" : "#"} {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {jdSuggestions.action_plan?.length > 0 && (
                  <div className="p-4 bg-gradient-to-br from-teal-50 to-indigo-50 border border-teal-100 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider flex items-center gap-1">
                        <span>📋</span> Priority Action Plan
                      </p>
                      <CopyButton
                        text={jdSuggestions.action_plan.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}
                        copyKey="action-plan"
                        copied={copied}
                        onCopy={copy}
                      />
                    </div>
                    <ol className="space-y-2">
                      {jdSuggestions.action_plan.map((step: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center font-bold">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ─── Reusable sub-components ─────────────────────────────────────────────── */

function CopyButton({
  text, copyKey, copied, onCopy, label = "Copy",
}: {
  text: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  label?: string;
}) {
  const isCopied = copied === copyKey;
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
        isCopied
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {isCopied ? <><span>✓</span> Copied!</> : <><span>📋</span> {label}</>}
    </button>
  );
}

function SummaryCard({
  label, icon, text, copyKey, copied, onCopy, mono = false,
}: {
  label: string;
  icon: string;
  text: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <span>{icon}</span> {label}
        </p>
        <CopyButton text={text} copyKey={copyKey} copied={copied} onCopy={onCopy} />
      </div>
      <p className={`text-sm text-slate-700 leading-relaxed ${mono ? "font-mono" : ""}`}>{text}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
      <span>⚠️</span> {msg}
    </div>
  );
}