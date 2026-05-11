// src/pages/hr/HRDashboard.tsx
// ─── HR Dashboard — AI Ranking, Shortlisting, Insights, Clustering ────────────
// CSS & layout identical to Home.tsx (light: white / slate / teal / indigo)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/api";
import HRNavbar from "../components/HRnavbar";
import {
  rankCandidates,
  autoShortlist,
  getHRInsights,
  clusterCandidates,
  Candidate,
  RankedCandidate,
  AutoShortlistResp,
  HRInsightsResp,
  ClusterResp,
} from "../api/aiApi";

type Section = "list" | "rank" | "shortlist" | "insights" | "cluster";

/* ── Spinner — light version matching Home.tsx loading patterns ── */
function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
  );
}

/* ── StatRow — light card style ──────────────────────────────────── */
function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

/* ── Decision badge — light colours matching BulkUpload.tsx ──────── */
function DecBadge({ status }: { status: string }) {
  const cx: Record<string, string> = {
    SHORTLISTED: "bg-green-100 text-green-700 border-green-200",
    PENDING:     "bg-amber-100 text-amber-700 border-amber-200",
    REJECTED:    "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${cx[status] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {status}
    </span>
  );
}

/* ── Score bar — same as HRHome.tsx / BulkUpload.tsx ─────────────── */
function ScoreBar({ score }: { score: number }) {
  const barColor  = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-400";
  const textColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-bold ${textColor}`}>{score}</span>
    </div>
  );
}

/* ── Delete Confirm Modal ─────────────────────────────────────────── */
function DeleteModal({
  count,
  mode,
  onConfirm,
  onCancel,
}: {
  count: number;
  mode: "selected" | "all";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-8 max-w-sm w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-3xl mx-auto mb-4">
            🗑️
          </div>
          <h3 className="text-lg font-black text-slate-800">
            {mode === "all" ? "Delete All Candidates?" : `Delete ${count} Candidate${count !== 1 ? "s" : ""}?`}
          </h3>
          <p className="text-sm text-slate-400 mt-2">
            {mode === "all"
              ? "This will permanently remove all candidates from the database."
              : `This will permanently remove ${count} selected candidate${count !== 1 ? "s" : ""}.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-all shadow-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HRDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("list");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dbLoading,  setDbLoading]  = useState(true);

  const [filterAts,    setFilterAts]    = useState(0);
  const [filterRole,   setFilterRole]   = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "SHORTLISTED" | "PENDING" | "REJECTED">("ALL");

  const [ranked,          setRanked]          = useState<RankedCandidate[] | null>(null);
  const [shortlistResult, setShortlistResult] = useState<AutoShortlistResp | null>(null);
  const [insights,        setInsights]        = useState<HRInsightsResp | null>(null);
  const [clusters,        setClusters]        = useState<ClusterResp | null>(null);

  const [threshold, setThreshold] = useState(70);
  const [nClusters, setNClusters] = useState(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);

  // ── Delete state ──────────────────────────────────────────────────
  const [selectedEmails,  setSelectedEmails]  = useState<Set<string>>(new Set());
  const [deleteModal,     setDeleteModal]     = useState<{ open: boolean; mode: "selected" | "all" }>({ open: false, mode: "selected" });
  const [deleteLoading,   setDeleteLoading]   = useState(false);
  const [deleteSuccess,   setDeleteSuccess]   = useState<string | null>(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await API.get<Candidate[]>("/hr/rankings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setCandidates(res.data);
    } catch {
      setCandidates([]);
    } finally {
      setDbLoading(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    const ats      = c.atsScore ?? 0;
    const status   = ats >= 70 ? "SHORTLISTED" : ats >= 60 ? "PENDING" : "REJECTED";
    const roleOk   = filterRole === "" || (c.recommendedRole ?? "").toLowerCase().includes(filterRole.toLowerCase());
    const atsOk    = ats >= filterAts;
    const statusOk = filterStatus === "ALL" || status === filterStatus;
    return roleOk && atsOk && statusOk;
  });

  const exportShortlistCSV = () => {
    const shortlisted = candidates.filter((c) => (c.atsScore ?? 0) >= 70);
    const header = "Email,Name,ATS Score,Recommended Role,Status";
    const rows   = shortlisted.map(
      (c: any) => `"${c.email}","${c.name ?? ""}",${c.atsScore},"${c.recommendedRole ?? ""}","SHORTLISTED"`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "shortlisted_candidates.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Select / Deselect helpers ─────────────────────────────────────
  const toggleSelect = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEmails.size === filteredCandidates.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredCandidates.map((c: any) => c.email)));
    }
  };

  const allSelected = filteredCandidates.length > 0 && selectedEmails.size === filteredCandidates.length;

  // ── Delete handler ────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteModal({ open: false, mode: "selected" });
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (deleteModal.mode === "all") {
        await API.delete("/hr/candidates/all", { headers });
        setCandidates([]);
        setSelectedEmails(new Set());
        setDeleteSuccess("All candidates deleted successfully.");
      } else {
        const emailsToDelete = Array.from(selectedEmails);
        await API.request({
          method: "DELETE",
          url: "/hr/candidates",
          headers,
          data: { emails: emailsToDelete },
        });
        setCandidates((prev) => prev.filter((c: any) => !selectedEmails.has(c.email)));
        setDeleteSuccess(`${emailsToDelete.length} candidate${emailsToDelete.length !== 1 ? "s" : ""} deleted.`);
        setSelectedEmails(new Set());
      }
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || "Delete failed. Please try again.");
    } finally {
      setDeleteLoading(false);
      setTimeout(() => setDeleteSuccess(null), 3000);
    }
  };

  const runAI = async (action: Section) => {
    if (!candidates.length) {
      setAiError("No candidates loaded. Upload resumes on HR Home first.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      if (action === "rank") {
        const res = await rankCandidates(candidates);
        setRanked(res.ranked_candidates);
      } else if (action === "shortlist") {
        const res = await autoShortlist(candidates, threshold);
        setShortlistResult(res);
      } else if (action === "insights") {
        const res = await getHRInsights(candidates);
        setInsights(res);
      } else if (action === "cluster") {
        const res = await clusterCandidates(candidates, nClusters);
        setClusters(res);
      }
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || `${action} failed.`);
    } finally {
      setAiLoading(false);
    }
  };

  const sections: { id: Section; label: string; icon: string }[] = [
    { id: "list",      label: "Candidates",     icon: "👥" },
    { id: "rank",      label: "AI Ranking",     icon: "🏆" },
    { id: "shortlist", label: "Auto-Shortlist", icon: "✅" },
    { id: "insights",  label: "Insights",       icon: "📊" },
    { id: "cluster",   label: "Clustering",     icon: "🔵" },
  ];

  return (
    <>
      {/* ── HR Navbar ─────────────────────────────────────────────── */}
      <HRNavbar />

      {/* ── Delete Confirm Modal ───────────────────────────────────── */}
      {deleteModal.open && (
        <DeleteModal
          count={selectedEmails.size}
          mode={deleteModal.mode}
          onConfirm={handleDelete}
          onCancel={() => setDeleteModal({ open: false, mode: "selected" })}
        />
      )}

      {/* ── Page background — identical to Home.tsx ───────────────── */}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

          {/* ── Title block ───────────────────────────────────────── */}
          <div className="text-center mb-8">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-teal-600 mb-1">
              🤖 Gen AI–Powered
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              HR Candidate Dashboard &{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-indigo-600">
                AI Screening Tools
              </span>
            </h1>
            <div className="w-16 h-1 bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full mx-auto mt-3" />
          </div>

          {/* ── Welcome bar ───────────────────────────────────────── */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                👥
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Candidate Pool</p>
                <p className="text-sm font-bold text-slate-800">
                  {dbLoading ? "Loading…" : `${candidates.length} candidate${candidates.length !== 1 ? "s" : ""} in pool`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              AI Engine Active
            </div>
          </div>

          {/* ── Section Tabs ──────────────────────────────────────── */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 flex-wrap">
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${
                  activeSection === s.id
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
            <button onClick={() => navigate("/hr-home")}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-all">
              📤 Bulk Upload
            </button>
          </div>

          {/* ── AI Error ──────────────────────────────────────────── */}
          {aiError && (
            <div className="mb-5 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700 flex items-center gap-2">
              <span>⚠️</span> {aiError}
              <button onClick={() => setAiError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* ── Delete Success Toast ───────────────────────────────── */}
          {deleteSuccess && (
            <div className="mb-5 p-4 bg-green-50 border border-green-100 rounded-2xl text-sm text-green-700 flex items-center gap-2">
              <span>✅</span> {deleteSuccess}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* SECTION: Candidate List                                  */}
          {/* ════════════════════════════════════════════════════════ */}
          {activeSection === "list" && (
            <div className="space-y-5">

              {/* Filter bar */}
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">🔍 Filter Candidates</p>
                <div className="grid sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2">
                      Min ATS: <span className="text-indigo-600 font-black">{filterAts}</span>
                    </label>
                    <input type="range" min={0} max={95} value={filterAts}
                      onChange={(e) => setFilterAts(Number(e.target.value))}
                      className="w-full accent-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2">Role / Skills</label>
                    <input type="text" placeholder="e.g. React, Python…"
                      value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-2">Status</label>
                    <div className="flex gap-2 flex-wrap">
                      {(["ALL", "SHORTLISTED", "PENDING", "REJECTED"] as const).map((s) => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            filterStatus === s
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                          }`}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Candidate table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="font-bold text-slate-800">Candidate Database</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Showing {filteredCandidates.length} of {candidates.length}
                      {selectedEmails.size > 0 && (
                        <span className="ml-2 text-indigo-500 font-semibold">
                          · {selectedEmails.size} selected
                        </span>
                      )}
                    </p>
                  </div>

                  {/* ── Action buttons ──────────────────────────── */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Delete Selected */}
                    {selectedEmails.size > 0 && (
                      <button
                        onClick={() => setDeleteModal({ open: true, mode: "selected" })}
                        disabled={deleteLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm"
                      >
                        {deleteLoading ? <Spinner /> : "🗑️"} Delete Selected ({selectedEmails.size})
                      </button>
                    )}

                    {/* Delete All */}
                    {candidates.length > 0 && (
                      <button
                        onClick={() => setDeleteModal({ open: true, mode: "all" })}
                        disabled={deleteLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-all"
                      >
                        🗑️ Delete All
                      </button>
                    )}

                    {/* Export */}
                    <button onClick={exportShortlistCSV}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-all shadow-sm">
                      ⬇ Export Shortlist
                    </button>
                  </div>
                </div>

                {dbLoading ? (
                  <div className="p-12 text-center">
                    <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Loading candidates…</p>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-4xl mb-3">{candidates.length === 0 ? "📭" : "🔍"}</p>
                    <p className="text-slate-500 font-medium text-sm">
                      {candidates.length === 0
                        ? "No candidates yet. Go to HR Home to bulk upload resumes."
                        : "No candidates match your filters."}
                    </p>
                    {candidates.length === 0 && (
                      <button onClick={() => navigate("/hr-home")}
                        className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-teal-700 transition-all shadow-sm">
                        📤 Upload Resumes
                      </button>
                    )}
                    {candidates.length > 0 && (
                      <button onClick={() => { setFilterAts(0); setFilterRole(""); setFilterStatus("ALL"); }}
                        className="mt-3 text-xs text-indigo-500 underline">Clear filters</button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                          {/* Checkbox column */}
                          <th className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 accent-indigo-500 cursor-pointer"
                            />
                          </th>
                          {["Email", "Name", "ATS Score", "Role", "Decision", "Uploaded", "Action"].map((h) => (
                            <th key={h} className="text-left px-5 py-3 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredCandidates.map((c: any, i) => {
                          const score    = c.atsScore ?? 0;
                          const decision = score >= 70 ? "SHORTLISTED" : score >= 60 ? "PENDING" : "REJECTED";
                          const isSelected = selectedEmails.has(c.email);
                          return (
                            <tr
                              key={i}
                              className={`transition-colors ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                            >
                              {/* Checkbox */}
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(c.email)}
                                  className="w-4 h-4 accent-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-700">{c.email}</td>
                              <td className="px-5 py-4 text-sm text-slate-500">{c.name || "—"}</td>
                              <td className="px-5 py-4"><ScoreBar score={score} /></td>
                              <td className="px-5 py-4 text-sm text-slate-500">{c.recommendedRole || "—"}</td>
                              <td className="px-5 py-4"><DecBadge status={decision} /></td>
                              <td className="px-5 py-4 text-xs text-slate-400">
                                {c.uploadedAt ? new Date(c.uploadedAt).toLocaleDateString() : "—"}
                              </td>
                              {/* Individual delete button */}
                              <td className="px-5 py-4">
                                <button
                                  onClick={() => {
                                    setSelectedEmails(new Set([c.email]));
                                    setDeleteModal({ open: true, mode: "selected" });
                                  }}
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                  title="Delete candidate"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* SECTION: AI Ranking                                      */}
          {/* ════════════════════════════════════════════════════════ */}
          {activeSection === "rank" && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">🏆</div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg">AI-Powered Ranking</h2>
                    <p className="text-xs text-slate-400">Ranks candidates by composite score (ATS + experience + skills)</p>
                  </div>
                </div>
                <button onClick={() => runAI("rank")} disabled={aiLoading}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-600 text-white font-bold hover:from-indigo-700 hover:to-teal-700 disabled:opacity-50 transition-all shadow-lg">
                  {aiLoading ? <><Spinner /> Running…</> : "🏆 Run AI Ranking"}
                </button>
              </div>

              {ranked && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">Ranked Results</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{ranked.length} candidates ranked</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                          {["Rank", "Email", "AI Score", "ATS", "Status"].map((h) => (
                            <th key={h} className="text-left px-5 py-3 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {ranked.map((c) => (
                          <tr key={c.rank} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border ${
                                c.rank <= 3
                                  ? "bg-amber-50 text-amber-600 border-amber-200"
                                  : "bg-slate-50 text-slate-500 border-slate-200"
                              }`}>
                                #{c.rank}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">{c.email}</td>
                            <td className="px-5 py-4 text-sm font-bold text-indigo-600">{c.rank_score?.toFixed(1)}</td>
                            <td className="px-5 py-4 text-sm text-slate-500">{c.atsScore}</td>
                            <td className="px-5 py-4"><DecBadge status={c.status ?? ""} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* SECTION: Auto-Shortlist                                  */}
          {/* ════════════════════════════════════════════════════════ */}
          {activeSection === "shortlist" && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl">✅</div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg">Auto-Shortlist</h2>
                    <p className="text-xs text-slate-400">ATS ≥ threshold → SHORTLISTED · within 10 below → PENDING · rest → REJECTED</p>
                  </div>
                </div>
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-500 mb-2">
                    Threshold: <span className="text-teal-600 font-black">{threshold}</span>
                  </label>
                  <input type="range" min={40} max={95} value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-48 accent-teal-600" />
                </div>
                <button onClick={() => runAI("shortlist")} disabled={aiLoading}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-600 text-white font-bold hover:from-teal-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-lg">
                  {aiLoading ? <><Spinner /> Running…</> : "✅ Run Auto-Shortlist"}
                </button>
              </div>

              {shortlistResult && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Total",       value: shortlistResult.summary.total,             color: "bg-slate-50 border-slate-200 text-slate-700"  },
                      { label: "Shortlisted", value: shortlistResult.summary.shortlisted_count, color: "bg-green-50 border-green-200 text-green-700"  },
                      { label: "Pending",     value: shortlistResult.summary.pending_count,     color: "bg-amber-50 border-amber-200 text-amber-700"  },
                      { label: "Rejected",    value: shortlistResult.summary.rejected_count,    color: "bg-red-50 border-red-100 text-red-700"        },
                    ].map(({ label, value, color }) => (
                      <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
                        <p className="text-3xl font-black">{value}</p>
                        <p className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-70">{label}</p>
                      </div>
                    ))}
                  </div>

                  {(["shortlisted", "pending", "rejected"] as const).map((group) => {
                    const list = shortlistResult[group] as Candidate[];
                    if (!list?.length) return null;
                    const groupIcon = group === "shortlisted" ? "✅" : group === "pending" ? "⏳" : "❌";
                    const groupCx   = group === "shortlisted" ? "bg-green-50 border-green-100"
                                    : group === "pending"     ? "bg-amber-50 border-amber-100"
                                    :                           "bg-red-50 border-red-100";
                    return (
                      <div key={group} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <h3 className="font-semibold text-slate-700 text-sm mb-3 capitalize flex items-center gap-2">
                          {groupIcon} {group} ({list.length})
                        </h3>
                        <div className="space-y-1.5">
                          {list.map((c, i) => (
                            <div key={i} className={`flex items-center justify-between text-sm p-2.5 rounded-xl border ${groupCx}`}>
                              <span className="text-slate-700 font-medium">{c.email}</span>
                              <span className="text-slate-500 font-semibold text-xs">ATS: {c.atsScore}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* SECTION: Insights                                        */}
          {/* ════════════════════════════════════════════════════════ */}
          {activeSection === "insights" && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">📊</div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg">HR Insights</h2>
                    <p className="text-xs text-slate-400">AI-generated overview of candidate pool quality</p>
                  </div>
                </div>
                <button onClick={() => runAI("insights")} disabled={aiLoading}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-600 text-white font-bold hover:from-indigo-700 hover:to-teal-700 disabled:opacity-50 transition-all shadow-lg">
                  {aiLoading ? <><Spinner /> Running…</> : "📊 Generate Insights"}
                </button>
              </div>

              {insights && (
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h3 className="font-semibold text-slate-700 text-sm mb-3">Pool Overview</h3>
                    <StatRow label="Total Candidates" value={insights.total_candidates} />
                    <StatRow label="Avg ATS Score"    value={`${insights.average_ats_score.toFixed(1)} / 100`} />
                    {insights.recommendations.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">💡 Recommendations</p>
                        <ul className="space-y-1.5">
                          {insights.recommendations.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 p-2 bg-amber-50 rounded-xl border border-amber-100">
                              <span className="text-amber-500 shrink-0 mt-0.5">→</span> {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h3 className="font-semibold text-slate-700 text-sm mb-3">Top Skills in Pool</h3>
                    {insights.top_skills.length === 0 ? (
                      <p className="text-sm text-slate-400">No skill data.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {insights.top_skills.slice(0, 8).map(({ skill, count }) => {
                          const max = insights.top_skills[0].count;
                          return (
                            <div key={skill} className="flex items-center gap-3">
                              <span className="text-xs text-slate-500 w-24 truncate">{skill}</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-indigo-500 transition-all duration-700"
                                  style={{ width: `${(count / max) * 100}%` }} />
                              </div>
                              <span className="text-xs text-slate-400 w-4 text-right font-semibold">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {Object.keys(insights.role_distribution).length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:col-span-2">
                      <h3 className="font-semibold text-slate-700 text-sm mb-3">Role Distribution</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(insights.role_distribution).map(([role, count]) => (
                          <div key={role} className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-100 rounded-full text-sm">
                            <span className="font-medium text-teal-700">{role}</span>
                            <span className="text-xs text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded-full font-bold">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* SECTION: Clustering                                      */}
          {/* ════════════════════════════════════════════════════════ */}
          {activeSection === "cluster" && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">🔵</div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg">Candidate Clustering</h2>
                    <p className="text-xs text-slate-400">K-means clustering groups candidates by ATS, experience, and skills</p>
                  </div>
                </div>
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-500 mb-2">
                    Clusters: <span className="text-indigo-600 font-black">{nClusters}</span>
                  </label>
                  <input type="range" min={2} max={6} value={nClusters}
                    onChange={(e) => setNClusters(Number(e.target.value))}
                    className="w-48 accent-indigo-500" />
                </div>
                <button onClick={() => runAI("cluster")} disabled={aiLoading}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-600 text-white font-bold hover:from-indigo-700 hover:to-teal-700 disabled:opacity-50 transition-all shadow-lg">
                  {aiLoading ? <><Spinner /> Running…</> : "🔵 Run Clustering"}
                </button>
              </div>

              {clusters && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    {clusters.total_clusters} cluster{clusters.total_clusters !== 1 ? "s" : ""} identified
                  </p>
                  {clusters.cluster_summary.map((summary) => {
                    const members = clusters.clusters[summary.cluster_name] || [];
                    return (
                      <div key={summary.cluster_name} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm capitalize">
                              {summary.cluster_name.replace("_", " ")}
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 font-semibold">
                                {summary.size} candidates
                              </span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">{summary.description}</p>
                          </div>
                          <div className="text-right text-xs text-slate-400 space-y-1 shrink-0 ml-4">
                            <p>Avg ATS <span className="font-bold text-slate-700">{summary.avg_ats_score.toFixed(1)}</span></p>
                            <p>Avg Exp <span className="font-bold text-slate-700">{summary.avg_experience.toFixed(1)}y</span></p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {members.slice(0, 5).map((c: any, i: number) => (
                            <span key={i} className="text-xs px-2.5 py-1 bg-teal-50 border border-teal-100 rounded-full text-teal-700 font-medium">
                              {c.email}
                            </span>
                          ))}
                          {members.length > 5 && (
                            <span className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-slate-400">
                              +{members.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Stats strip ───────────────────────────────────────── */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { n: String(candidates.length) || "—", label: "Candidates in pool" },
              { n: String(candidates.filter((c) => (c.atsScore ?? 0) >= 70).length), label: "Shortlisted"         },
              { n: candidates.length
                  ? `${(candidates.reduce((s, c) => s + (c.atsScore ?? 0), 0) / candidates.length).toFixed(0)}`
                  : "—",                                                             label: "Avg ATS score"        },
              { n: "5",                                                              label: "AI tools available"   },
            ].map(({ n, label }) => (
              <div key={label} className="text-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-2xl font-black text-teal-600">{n}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}