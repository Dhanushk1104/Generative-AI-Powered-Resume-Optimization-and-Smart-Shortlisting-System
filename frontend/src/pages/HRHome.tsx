// src/pages/hr/HRHome.tsx
// ─── HR Landing Page with integrated Bulk Upload ──────────────────────────────
// CSS & layout identical to Home.tsx (light: white / slate / teal / indigo)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/api";
import HRNavbar from "../components/HRnavbar";

interface UploadResult {
  filename: string;
  email: string;
  name: string;
  atsScore: number | null;
  recommendedRole: string;
  status: "UPLOADED" | "FAILED";
  error?: string;
}

/* ── Animated counter — same pattern used in Home.tsx ATSGauge ── */
function AnimatedCount({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / 50;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 20);
    return () => clearInterval(timer);
  }, [target]);
  return <>{count}</>;
}

/* ── Score bar — identical to BulkUpload.tsx scoreBg/scoreColor ─ */
function ScoreBar({ score }: { score: number }) {
  const barColor  = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-400";
  const textColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-slate-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-black ${textColor}`}>{score}</span>
    </div>
  );
}

export default function HRHome() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [results,   setResults]   = useState<UploadResult[]>([]);
  const [summary,   setSummary]   = useState<{ uploaded: number; failed: number } | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "results">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Process files ────────────────────────────────────────────── */
  const processFiles = async (files: FileList) => {
    if (!files || files.length === 0) return;
    const token = localStorage.getItem("token");
    const form  = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));

    setUploading(true);
    setResults([]);
    setSummary(null);
    setError(null);

    try {
      const resp = await API.post<{
        uploaded: number;
        failed: number;
        results: UploadResult[];
      }>("/hr/bulk-upload", form, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setResults(resp.data.results || []);
      setSummary({ uploaded: Number(resp.data.uploaded), failed: Number(resp.data.failed) });
      setActiveTab("results");
    } catch (e: any) {
      setError(e?.response?.data?.error || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  /* ── Derived stats ────────────────────────────────────────────── */
  const shortlisted = results.filter((r) => r.status !== "FAILED" && (r.atsScore ?? 0) >= 70);
  const pending     = results.filter((r) => r.status !== "FAILED" && (r.atsScore ?? 0) >= 60 && (r.atsScore ?? 0) < 70);
  const rejected    = results.filter((r) => r.status !== "FAILED" && (r.atsScore ?? 0) < 60);

  const getDecision = (r: UploadResult) => {
    if (r.status === "FAILED") return "FAILED";
    const s = r.atsScore ?? 0;
    return s >= 70 ? "SHORTLISTED" : s >= 60 ? "PENDING" : "REJECTED";
  };

  /* Identical to BulkUpload.tsx decisionCx */
  const decisionCx: Record<string, string> = {
    SHORTLISTED: "bg-green-100 text-green-700 border-green-200",
    PENDING:     "bg-amber-100 text-amber-700 border-amber-200",
    REJECTED:    "bg-red-100 text-red-700 border-red-200",
    FAILED:      "bg-slate-100 text-slate-500 border-slate-200",
  };

  /* ── Export CSV ───────────────────────────────────────────────── */
  const exportCSV = () => {
    const rows = shortlisted.map(
      (r) => `"${r.filename}","${r.email}","${r.name}",${r.atsScore},"${r.recommendedRole}","SHORTLISTED"`
    );
    const blob = new Blob([["Filename,Email,Name,ATS Score,Role,Status", ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "shortlisted.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* ── HR Navbar (same look as Navbar.tsx) ─────────────────── */}
      <HRNavbar />

      {/* ── Page — bg identical to Home.tsx ─────────────────────── */}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

          {/* ── Title block — copy of Home.tsx title block ─────────── */}
          <div className="text-center mb-8">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-teal-600 mb-1">
              🤖 Gen AI–Powered
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              HR Bulk Upload &{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-indigo-600">
                Smart Shortlisting System
              </span>
            </h1>
            <div className="w-16 h-1 bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full mx-auto mt-3" />
          </div>

          {/* ── Welcome bar — identical to Home.tsx welcome bar ────── */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                👥
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">HR Portal</p>
                <p className="text-sm font-bold text-slate-800">Bulk Screening & Shortlisting 👋</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              AI Engine Active
            </div>
          </div>

          {/* ── Summary stat cards — shown after upload ───────────── */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Processed", value: summary.uploaded + summary.failed, color: "bg-slate-50 border-slate-200 text-slate-700"  },
                { label: "✅ Shortlisted",  value: shortlisted.length,               color: "bg-green-50 border-green-200 text-green-700"  },
                { label: "⏳ Pending",      value: pending.length,                   color: "bg-amber-50 border-amber-200 text-amber-700"  },
                { label: "❌ Rejected",     value: rejected.length,                  color: "bg-red-50 border-red-100 text-red-700"        },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
                  <p className="text-3xl font-black"><AnimatedCount target={value} /></p>
                  <p className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-70">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Two-column grid — identical to Home.tsx ───────────── */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">

            {/* ── LEFT: Upload card — identical to Home.tsx upload card */}
            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-xl">📤</div>
                <div>
                  <h2 className="font-bold text-slate-800 text-lg">Bulk Resume Upload</h2>
                  <p className="text-xs text-slate-400">PDF or DOCX · Multiple files allowed</p>
                </div>
              </div>

              {/* Tabs — styled like Home.tsx section buttons */}
              <div className="flex gap-2 mb-5">
                {(["upload", "results"] as const).map((tab) => (
                  <button key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all border ${
                      activeTab === tab
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    {tab === "upload" ? "📤 Upload" : `📊 Results${results.length > 0 ? ` (${results.length})` : ""}`}
                  </button>
                ))}
              </div>

              {/* ── Upload tab ── */}
              {activeTab === "upload" && (
                <div>
                  {/* Drop zone — identical to BulkUpload.tsx drop zone */}
                  <label
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-3xl p-14 cursor-pointer transition-all ${
                      dragOver
                        ? "border-indigo-400 bg-indigo-50"
                        : uploading
                        ? "border-slate-200 bg-slate-50 cursor-wait"
                        : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">
                      {uploading ? "⏳" : dragOver ? "🎯" : "📂"}
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-slate-700">
                        {uploading ? "Analysing resumes, please wait…" : "Drop resumes here or click to browse"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">PDF and DOCX supported · Multiple files allowed</p>
                    </div>
                    {uploading && (
                      <div className="w-48 bg-slate-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-indigo-500 animate-pulse w-full" />
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file" multiple accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => e.target.files && processFiles(e.target.files)}
                      disabled={uploading}
                    />
                  </label>

                  {/* Error */}
                  {error && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700 flex items-center gap-2">
                      <span>⚠️</span> {error}
                    </div>
                  )}

                  {/* Quick actions */}
                  {results.length > 0 && !uploading && (
                    <div className="mt-4 flex items-center gap-3">
                      <button onClick={() => setActiveTab("results")}
                        className="px-4 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold hover:bg-teal-100 transition-all">
                        📊 View {results.length} results
                      </button>
                      <button onClick={exportCSV}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all">
                        ⬇ Export CSV
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Results tab (compact list) ── */}
              {activeTab === "results" && (
                <div>
                  {results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                      <p className="text-4xl mb-3">📭</p>
                      <p className="text-slate-500 font-medium text-sm">No results yet</p>
                      <p className="text-xs text-slate-400 mt-1">Upload resumes to see analysis</p>
                      <button onClick={() => setActiveTab("upload")}
                        className="mt-3 text-xs text-indigo-500 underline">Go to Upload</button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {results.map((r, i) => {
                        const decision = getDecision(r);
                        const score    = r.atsScore ?? 0;
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <span className="text-xs text-slate-400 font-medium w-5 text-center">{i + 1}</span>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-sm shrink-0">
                                {r.filename?.toLowerCase().endsWith(".pdf") ? "📄" : "📝"}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate max-w-[120px]" title={r.filename}>
                                  {r.name || r.filename}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{r.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.status === "FAILED" ? (
                                <span className="text-xs text-red-400">Failed</span>
                              ) : (
                                <ScoreBar score={score} />
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${decisionCx[decision]}`}>
                                {decision}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* How It Works — identical to Home.tsx Quick Tips card */}
              <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">⚡ How It Works</p>
                <ul className="space-y-2">
                  {[
                    "Drop multiple PDF or DOCX resumes at once",
                    "AI analyses ATS score & role fit for each resume",
                    "Auto-decisions: Shortlisted ≥70 · Pending 60–69 · Rejected <60",
                    "Export shortlist CSV or deep-dive in HR Dashboard",
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-teal-500 mt-0.5">→</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── RIGHT: Results panel or empty placeholder ──────────── */}
            {results.length > 0 ? (
              <div className="space-y-5">

                {/* Shortlisting summary bars — same as Home.tsx Resume Strength Meter */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-700 text-sm mb-4">Shortlisting Summary</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Shortlisted (≥70)", count: shortlisted.length, color: "bg-green-500" },
                      { label: "Pending (60–69)",   count: pending.length,     color: "bg-amber-500" },
                      { label: "Rejected (<60)",    count: rejected.length,    color: "bg-red-400"   },
                    ].map(({ label, count, color }) => {
                      const total = results.filter((r) => r.status !== "FAILED").length;
                      const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>{label}</span>
                            <span className="font-semibold">{count} / {total}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all duration-700 ${color}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full results table — identical to BulkUpload.tsx table */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-slate-800">Analysis Results</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {shortlisted.length} candidates qualify (ATS ≥ 70)
                      </p>
                    </div>
                    <button onClick={exportCSV}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-all shadow-sm">
                      ⬇ Export Shortlist CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                          <th className="text-left px-5 py-3 font-semibold">#</th>
                          <th className="text-left px-5 py-3 font-semibold">File</th>
                          <th className="text-left px-5 py-3 font-semibold">Email / Name</th>
                          <th className="text-left px-5 py-3 font-semibold">ATS Score</th>
                          <th className="text-left px-5 py-3 font-semibold">Role</th>
                          <th className="text-left px-5 py-3 font-semibold">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.map((r, i) => {
                          const score    = r.atsScore ?? 0;
                          const decision = getDecision(r);
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-4 text-xs text-slate-400 font-medium">{i + 1}</td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2">
                                  <span>{r.filename?.toLowerCase().endsWith(".pdf") ? "📄" : "📝"}</span>
                                  <span className="text-sm text-slate-700 font-medium max-w-[130px] truncate" title={r.filename}>
                                    {r.filename}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-sm text-slate-700">{r.email}</p>
                                {r.name && <p className="text-xs text-slate-400">{r.name}</p>}
                              </td>
                              <td className="px-5 py-4">
                                {r.status === "FAILED" ? (
                                  <span className="text-xs text-red-400">Failed</span>
                                ) : (
                                  <ScoreBar score={score} />
                                )}
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-500">{r.recommendedRole || "—"}</td>
                              <td className="px-5 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${decisionCx[decision]}`}>
                                  {decision}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CTA button — identical to Home.tsx CTA */}
                <button
                  onClick={() => navigate("/hr")}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-600 text-white font-bold hover:from-indigo-700 hover:to-teal-700 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  📊 Open HR Dashboard for AI Ranking & Insights →
                </button>
              </div>
            ) : (
              /* Empty placeholder — identical to Home.tsx empty right panel */
              <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center min-h-[320px]">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-3xl mb-4">📊</div>
                <p className="font-semibold text-slate-600 mb-1">Results will appear here</p>
                <p className="text-sm text-slate-400">Upload resumes to see ATS scores, role matches, and shortlisting decisions</p>
                <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-xs">
                  {[
                    { icon: "🎯", label: "ATS Score" },
                    { icon: "💡", label: "Role Match" },
                    { icon: "✅", label: "Shortlist"  },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1 p-3 bg-slate-50 rounded-xl">
                      <span className="text-xl">{icon}</span>
                      <span className="text-[11px] text-slate-500 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Stats strip — identical to Home.tsx stats strip ─────── */}
          {!summary && (
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { n: "10K+", label: "Resumes screened" },
                { n: "95%",  label: "ATS accuracy"     },
                { n: "3s",   label: "Per resume"       },
                { n: "3",    label: "Decision tiers"   },
              ].map(({ n, label }) => (
                <div key={label} className="text-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-2xl font-black text-teal-600">{n}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}