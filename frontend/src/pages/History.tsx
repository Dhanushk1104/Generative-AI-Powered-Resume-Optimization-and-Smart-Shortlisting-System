// src/pages/History.tsx
import { useEffect, useState, useMemo } from "react";
import API from "../api/api";
import { useAuth } from "../auth/AuthProvider";

interface HistoryRecord {
  id: number;
  createdAt: string;
  atsScore: number | null;
  jdMatchScore: number | null;
  recommendedRole: string | null;
  filename?: string;
  errorMessage?: string | null; // ← new: backend error reason when scoring failed
}

// ══════════════════════════════════════════════════════════════════════════
// MINI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const last = data[data.length - 1];
  const color = last >= 80 ? "#10b981" : last >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts.join(" ")} fill="none" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <circle
        cx={pts[pts.length - 1].split(",")[0]}
        cy={pts[pts.length - 1].split(",")[1]}
        r="3" fill={color} />
    </svg>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80
    ? "text-green-700 bg-green-50 border-green-200"
    : score >= 60
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }} />
      </div>
      <span className="font-semibold text-sm text-slate-700">{value}</span>
    </div>
  );
}

// ── Smart "Not Scored" badge — shows the actual reason from backend ──
function NotScoredBadge({ errorMessage }: { errorMessage?: string | null }) {
  // Classify the backend error into a user-friendly reason + icon
  const { icon, label, hint, badgeColor } = useMemo(() => {
    const msg = (errorMessage || "").toLowerCase();

    if (msg.includes("scanned") || msg.includes("image-based") || msg.includes("image-only")) {
      return {
        icon: "🖼️",
        label: "Scanned PDF",
        hint: "This PDF contains images, not text. Convert to a text-based PDF.",
        badgeColor: "border-orange-200 bg-orange-50 text-orange-600",
      };
    }
    if (msg.includes("password") || msg.includes("encrypted")) {
      return {
        icon: "🔒",
        label: "Encrypted PDF",
        hint: "Remove the password from the PDF before uploading.",
        badgeColor: "border-yellow-200 bg-yellow-50 text-yellow-700",
      };
    }
    if (msg.includes(".doc") || msg.includes("legacy")) {
      return {
        icon: "📄",
        label: "Old .doc Format",
        hint: "Convert your file to .docx or .pdf and re-upload.",
        badgeColor: "border-blue-200 bg-blue-50 text-blue-600",
      };
    }
    if (msg.includes("unsupported") || msg.includes("format")) {
      return {
        icon: "⚠️",
        label: "Wrong Format",
        hint: "Only PDF and DOCX files are supported.",
        badgeColor: "border-red-200 bg-red-50 text-red-600",
      };
    }
    if (msg.includes("empty") || msg.includes("blank")) {
      return {
        icon: "📭",
        label: "Empty File",
        hint: "The uploaded file appears to be empty.",
        badgeColor: "border-slate-200 bg-slate-50 text-slate-500",
      };
    }
    if (msg.includes("too large") || msg.includes("size")) {
      return {
        icon: "📦",
        label: "File Too Large",
        hint: "Maximum allowed file size is 10 MB.",
        badgeColor: "border-purple-200 bg-purple-50 text-purple-600",
      };
    }
    // Generic fallback
    return {
      icon: "❓",
      label: "Not Scored",
      hint: "Scan did not complete. Try re-uploading the file.",
      badgeColor: "border-slate-200 bg-slate-50 text-slate-400",
    };
  }, [errorMessage]);

  return (
    <div className="flex flex-col gap-1 group/badge relative">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-default ${badgeColor}`}>
        <span className="text-[11px]">{icon}</span>
        {label}
      </span>
      {/* Tooltip with full hint */}
      <div className="absolute left-0 top-full mt-1.5 z-20 hidden group-hover/badge:flex
        w-52 px-3 py-2 rounded-xl bg-slate-800 text-white text-[11px] leading-relaxed
        shadow-xl pointer-events-none">
        {hint}
        <div className="absolute -top-1.5 left-4 w-3 h-3 bg-slate-800 rotate-45 rounded-sm" />
      </div>
    </div>
  );
}

// ── Confirm modal ──
function ConfirmModal({ message, onConfirm, onCancel }:
  { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-3xl mx-auto mb-4">🗑️</div>
        <p className="font-bold text-slate-800 text-lg mb-1">Are you sure?</p>
        <p className="text-slate-500 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel}
            className="px-5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition shadow">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ──
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border text-sm font-semibold animate-fade-in
      ${type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
      <span>{type === "success" ? "✅" : "❌"}</span>
      {message}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

type SortKey = "date" | "ats" | "jd";
type FilterKey = "all" | "excellent" | "good" | "needs-work" | "unscored";

// Maps each unscored error type to a readable filter label
function classifyError(msg?: string | null): "scanned" | "encrypted" | "format" | "empty" | "size" | "unknown" {
  const m = (msg || "").toLowerCase();
  if (m.includes("scanned") || m.includes("image")) return "scanned";
  if (m.includes("password") || m.includes("encrypted")) return "encrypted";
  if (m.includes("doc") || m.includes("unsupported") || m.includes("format")) return "format";
  if (m.includes("empty") || m.includes("blank")) return "empty";
  if (m.includes("large") || m.includes("size")) return "size";
  return "unknown";
}

export default function History() {
  const auth = useAuth();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ username: string; email: string; role: string } | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<number | "selected" | "all" | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      API.get<HistoryRecord[]>("/history").then((r) => r.data),
      API.get<{ username: string; email: string; role: string }>("/auth/me").then((r) => r.data),
    ])
      .then(([hist, prof]) => { setHistory(hist); setProfile(prof); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Stats ──
  const stats = useMemo(() => {
    if (!history.length) return null;
    const scored = history.filter((h) => h.atsScore != null);
    const scores = scored.map((h) => h.atsScore as number);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const best = scores.length ? Math.max(...scores) : null;
    const excellent = scored.filter((h) => (h.atsScore as number) >= 80).length;
    const unscored = history.filter((h) => h.atsScore == null);

    // Break down unscored by reason
    const unscoredReasons = unscored.reduce<Record<string, number>>((acc, h) => {
      const key = classifyError(h.errorMessage);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      avg, best, total: history.length, excellent,
      trend: scores.slice(-8),
      unscoredCount: unscored.length,
      unscoredReasons,
    };
  }, [history]);

  // ── Filtered + sorted list ──
  const displayed = useMemo(() => {
    let list = [...history];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((h) =>
        h.recommendedRole?.toLowerCase().includes(q) ||
        h.filename?.toLowerCase().includes(q) ||
        String(h.atsScore).includes(q)
      );
    }
    if (filter === "excellent")  list = list.filter((h) => (h.atsScore ?? -1) >= 80);
    else if (filter === "good")  list = list.filter((h) => (h.atsScore ?? -1) >= 60 && (h.atsScore ?? -1) < 80);
    else if (filter === "needs-work") list = list.filter((h) => h.atsScore != null && h.atsScore < 60);
    else if (filter === "unscored")   list = list.filter((h) => h.atsScore == null);

    list.sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "ats") { va = a.atsScore ?? -1; vb = b.atsScore ?? -1; }
      else if (sortKey === "jd") { va = a.jdMatchScore ?? -1; vb = b.jdMatchScore ?? -1; }
      else { va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [history, search, filter, sortKey, sortAsc]);

  // ── Selection ──
  const allSelected = displayed.length > 0 && displayed.every((h) => selected.has(h.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(displayed.map((h) => h.id)));
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // ── Delete ──
  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setDeleting(true);
    try {
      if (deleteTarget === "all") {
        await API.delete("/history");
        setHistory([]); setSelected(new Set());
        showToast("All history deleted", "success");
      } else if (deleteTarget === "selected") {
        await Promise.all([...selected].map((id) => API.delete(`/history/${id}`)));
        setHistory((prev) => prev.filter((h) => !selected.has(h.id)));
        setSelected(new Set());
        showToast(`${selected.size} record${selected.size > 1 ? "s" : ""} deleted`, "success");
      } else {
        await API.delete(`/history/${deleteTarget}`);
        setHistory((prev) => prev.filter((h) => h.id !== deleteTarget));
        setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget as number); return n; });
        showToast("Record deleted", "success");
      }
    } catch {
      showToast("Failed to delete. Please try again.", "error");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Export CSV ──
  const exportCsv = () => {
    const rows = [
      ["ID", "Date", "ATS Score", "JD Match %", "Suggested Role", "Filename", "Error"],
      ...history.map((h) => [
        h.id,
        new Date(h.createdAt).toLocaleString(),
        h.atsScore ?? "Not Scored",
        h.jdMatchScore != null ? h.jdMatchScore.toFixed(1) : "",
        h.recommendedRole ?? "",
        h.filename ?? "",
        h.errorMessage ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "resume_history.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const deleteModalMessage =
    deleteTarget === "all"
      ? `This will permanently delete all ${history.length} scan records.`
      : deleteTarget === "selected"
      ? `This will permanently delete ${selected.size} selected record${selected.size > 1 ? "s" : ""}.`
      : "This will permanently delete this scan record.";

  // ── Unscored banner reason summary ──
  const unscoredBannerDetail = useMemo(() => {
    if (!stats?.unscoredReasons) return null;
    const parts: string[] = [];
    const r = stats.unscoredReasons;
    if (r.scanned)   parts.push(`${r.scanned} scanned PDF${r.scanned > 1 ? "s" : ""}`);
    if (r.encrypted) parts.push(`${r.encrypted} password-protected`);
    if (r.format)    parts.push(`${r.format} wrong format`);
    if (r.empty)     parts.push(`${r.empty} empty file${r.empty > 1 ? "s" : ""}`);
    if (r.size)      parts.push(`${r.size} too large`);
    if (r.unknown)   parts.push(`${r.unknown} unknown error${r.unknown > 1 ? "s" : ""}`);
    return parts.length ? parts.join(", ") : null;
  }, [stats]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/20">
      {deleteTarget !== null && (
        <ConfirmModal message={deleteModalMessage} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Profile & History</h1>
            <p className="text-slate-500 mt-1">Your account and previous resume scans</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={!history.length}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
              ⬇ Export CSV
            </button>
            {history.length > 0 && (
              <button onClick={() => setDeleteTarget("all")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-100 transition shadow-sm">
                🗑 Clear All
              </button>
            )}
          </div>
        </div>

        {/* ── Profile Card ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow">
              {(profile?.username || auth.username || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-slate-800">{profile?.username || auth.username || "—"}</p>
              <p className="text-sm text-slate-500">{profile?.email || "—"}</p>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100 text-[10px] font-bold uppercase tracking-wider">
                {profile?.role || auth.role || "—"}
              </span>
            </div>
            {stats && stats.trend.length >= 2 && (
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">ATS Trend</p>
                <Sparkline data={stats.trend} />
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Strip ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Scans",   value: stats.total,                                  icon: "📄", color: "text-indigo-600" },
              { label: "Avg ATS Score", value: stats.avg  != null ? `${stats.avg}`  : "—",  icon: "📊", color: "text-teal-600"   },
              { label: "Best Score",    value: stats.best != null ? `${stats.best}` : "—",  icon: "🏆", color: "text-amber-600"  },
              { label: "Excellent",     value: stats.excellent,                              icon: "✅", color: "text-green-600"  },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                <p className="text-2xl mb-1">{icon}</p>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Unscored banner — now shows breakdown of WHY they failed ── */}
        {stats && stats.unscoredCount > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="flex items-start gap-3 px-5 py-3.5">
              <span className="text-lg mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">
                  {stats.unscoredCount} record{stats.unscoredCount > 1 ? "s" : ""} couldn't be scored
                </p>
                {unscoredBannerDetail && (
                  <p className="text-xs text-amber-700 mt-0.5">{unscoredBannerDetail}</p>
                )}
                <p className="text-xs text-amber-600 mt-1">
                  Hover the badge in the ATS Score column to see the exact reason, then fix and re-upload.
                </p>
              </div>
              <button onClick={() => setFilter("unscored")}
                className="text-xs font-bold text-amber-700 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap mt-0.5">
                View unscored
              </button>
            </div>

            {/* Reason pills */}
            {unscoredBannerDetail && (
              <div className="flex flex-wrap gap-2 px-5 pb-3.5">
                {stats.unscoredReasons.scanned   ? <ReasonPill icon="🖼️" label="Scanned PDF" tip="Convert to text-based PDF"    color="bg-orange-100 text-orange-700" count={stats.unscoredReasons.scanned}   /> : null}
                {stats.unscoredReasons.encrypted ? <ReasonPill icon="🔒" label="Encrypted"   tip="Remove PDF password"          color="bg-yellow-100 text-yellow-700" count={stats.unscoredReasons.encrypted} /> : null}
                {stats.unscoredReasons.format    ? <ReasonPill icon="⚠️" label="Wrong Format" tip="Use PDF or DOCX only"        color="bg-red-100 text-red-700"       count={stats.unscoredReasons.format}    /> : null}
                {stats.unscoredReasons.empty     ? <ReasonPill icon="📭" label="Empty File"   tip="File had no content"         color="bg-slate-100 text-slate-600"   count={stats.unscoredReasons.empty}     /> : null}
                {stats.unscoredReasons.size      ? <ReasonPill icon="📦" label="Too Large"    tip="Max file size is 10 MB"      color="bg-purple-100 text-purple-700" count={stats.unscoredReasons.size}      /> : null}
                {stats.unscoredReasons.unknown   ? <ReasonPill icon="❓" label="Unknown"      tip="Re-upload to retry"          color="bg-slate-100 text-slate-500"   count={stats.unscoredReasons.unknown}   /> : null}
              </div>
            )}
          </div>
        )}

        {/* ── Scan History Table ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-slate-800 mr-auto">Previous Scans</h2>
            <span className="text-xs text-slate-400">{history.length} records</span>

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input type="text" placeholder="Search role, file…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 w-40" />
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "excellent", "good", "needs-work", "unscored"] as FilterKey[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition
                    ${filter === f
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-700"}`}>
                  {f === "all" ? "All"
                    : f === "excellent"  ? "🟢 80+"
                    : f === "good"       ? "🟡 60–79"
                    : f === "needs-work" ? "🔴 <60"
                    : `⚪ Unscored${stats?.unscoredCount ? ` (${stats.unscoredCount})` : ""}`}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
              <span className="text-xs font-semibold text-indigo-700">{selected.size} selected</span>
              <button onClick={() => setDeleteTarget("selected")}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition shadow">
                🗑 Delete Selected
              </button>
              <button onClick={() => setSelected(new Set())}
                className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">
                Clear selection
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Loading history…</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-4xl mb-3">📂</p>
              <p className="text-slate-500 font-medium">No scans yet</p>
              <p className="text-sm text-slate-400 mt-1">Upload a resume to get started</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-slate-500 font-medium">No results found</p>
              <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="rounded border-slate-300 accent-teal-600 cursor-pointer" />
                    </th>
                    <th className="text-left px-5 py-3 font-semibold cursor-pointer hover:text-teal-600 select-none"
                      onClick={() => handleSort("date")}>Date & Time{sortIcon("date")}</th>
                    <th className="text-left px-5 py-3 font-semibold cursor-pointer hover:text-teal-600 select-none"
                      onClick={() => handleSort("ats")}>ATS Score{sortIcon("ats")}</th>
                    <th className="text-left px-5 py-3 font-semibold cursor-pointer hover:text-teal-600 select-none"
                      onClick={() => handleSort("jd")}>JD Match{sortIcon("jd")}</th>
                    <th className="text-left px-5 py-3 font-semibold">Suggested Role</th>
                    <th className="text-left px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayed.map((h) => {
                    const ats = h.atsScore ?? 0;
                    const barColor = ats >= 80 ? "bg-green-500" : ats >= 60 ? "bg-amber-500" : "bg-red-500";
                    const isChecked = selected.has(h.id);
                    return (
                      <tr key={h.id}
                        className={`transition-colors group ${isChecked ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}>

                        {/* Checkbox */}
                        <td className="px-5 py-3.5">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(h.id)}
                            className="rounded border-slate-300 accent-teal-600 cursor-pointer" />
                        </td>

                        {/* Date */}
                        <td className="px-5 py-3.5">
                          <div className="text-sm text-slate-700 font-medium">
                            {new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(h.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {h.filename && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[120px]" title={h.filename}>
                              📎 {h.filename}
                            </div>
                          )}
                        </td>

                        {/* ATS Score */}
                        <td className="px-5 py-3.5">
                          {h.atsScore != null ? (
                            <div className="space-y-1">
                              <MiniBar value={h.atsScore} color={barColor} />
                              <ScoreBadge score={h.atsScore} />
                            </div>
                          ) : (
                            // Pass the backend errorMessage so badge shows the real reason
                            <NotScoredBadge errorMessage={h.errorMessage} />
                          )}
                        </td>

                        {/* JD Match */}
                        <td className="px-5 py-3.5 text-sm text-slate-500">
                          {h.jdMatchScore != null ? (
                            <span className="font-semibold text-indigo-600">{h.jdMatchScore.toFixed(1)}%</span>
                          ) : (
                            <span className="text-xs text-slate-300 font-medium">—</span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-5 py-3.5">
                          {h.recommendedRole ? (
                            <span className="inline-block px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                              🎯 {h.recommendedRole}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300 font-medium">—</span>
                          )}
                        </td>

                        {/* Delete */}
                        <td className="px-5 py-3.5">
                          <button onClick={() => setDeleteTarget(h.id)} disabled={deleting}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:cursor-not-allowed"
                            title="Delete this record">
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Showing {displayed.length} of {history.length} records</span>
                {selected.size > 0 && (
                  <span className="text-indigo-500 font-semibold">{selected.size} selected</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease; }
      `}</style>
    </div>
  );
}

// ── Small helper pill used in the unscored banner ──
function ReasonPill({ icon, label, tip, color, count }:
  { icon: string; label: string; tip: string; color: string; count: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${color}`}
      title={tip}>
      {icon} {count > 1 ? `${count}×` : ""} {label}
    </span>
  );
}
