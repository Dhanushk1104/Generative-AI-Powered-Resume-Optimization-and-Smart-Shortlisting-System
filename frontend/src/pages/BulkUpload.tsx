// src/pages/BulkUpload.tsx
import { useState } from "react";
import API from "../api/api";

interface UploadResult {
  filename: string;
  email: string;
  name: string;
  atsScore: number | null;
  recommendedRole: string;
  status: "UPLOADED" | "FAILED";
  error?: string;
}

const BulkUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [results,   setResults]   = useState<UploadResult[]>([]);
  const [summary,   setSummary]   = useState<{ uploaded: number; failed: number } | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState(false);

  /* ── Send files to /api/hr/bulk-upload with HR Bearer token ─── */
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
        errors?: string[];
      }>("/hr/bulk-upload", form, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setResults(resp.data.results || []);
      setSummary({ uploaded: Number(resp.data.uploaded), failed: Number(resp.data.failed) });
    } catch (e: any) {
      const msg = e?.response?.data?.error || "Bulk upload failed. Please try again.";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  /* ── Decision helpers ───────────────────────────────────────── */
  const getDecision = (r: UploadResult) => {
    if (r.status === "FAILED") return "FAILED";
    const s = r.atsScore ?? 0;
    return s >= 70 ? "SHORTLISTED" : s >= 60 ? "PENDING" : "REJECTED";
  };

  const scoreBg = (s: number | null) =>
    s == null ? "bg-slate-200" : s >= 80 ? "bg-green-500" : s >= 60 ? "bg-amber-500" : "bg-red-400";

  const scoreColor = (s: number | null) =>
    s == null ? "text-slate-400" : s >= 80 ? "text-green-600" : s >= 60 ? "text-amber-600" : "text-red-500";

  const decisionCx: Record<string, string> = {
    SHORTLISTED: "bg-green-100 text-green-700 border-green-200",
    PENDING:     "bg-amber-100 text-amber-700 border-amber-200",
    REJECTED:    "bg-red-100 text-red-700 border-red-200",
    FAILED:      "bg-slate-100 text-slate-500 border-slate-200",
  };

  /* ── Export shortlisted candidates to CSV ───────────────────── */
  const exportCSV = () => {
    const shortlisted = results.filter(
      (r) => r.status === "UPLOADED" && (r.atsScore ?? 0) >= 70
    );
    const header = "Filename,Email,Name,ATS Score,Recommended Role,Status";
    const rows   = shortlisted.map(
      (r) => `"${r.filename}","${r.email}","${r.name}",${r.atsScore},"${r.recommendedRole}","SHORTLISTED"`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "shortlisted_candidates.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold mb-3">
            <span>📤</span> HR Bulk Upload
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Resume Upload</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload multiple PDF/DOCX resumes — AI analyses each one and populates the HR dashboard
          </p>
        </div>

        {/* Drop Zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-3xl p-14 cursor-pointer transition-all ${
            dragOver
              ? "border-indigo-400 bg-indigo-50"
              : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">
            {uploading ? "⏳" : "📂"}
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
            type="file" multiple accept=".pdf,.docx"
            className="hidden"
            onChange={handleInputChange}
            disabled={uploading}
          />
        </label>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700 flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Upload summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Processed", value: summary.uploaded + summary.failed, color: "bg-slate-50 border-slate-200 text-slate-700" },
              { label: "✅ Analysed",     value: summary.uploaded,                  color: "bg-green-50 border-green-200 text-green-700" },
              { label: "❌ Failed",       value: summary.failed,                    color: "bg-red-50 border-red-100 text-red-700"       },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
                <p className="text-3xl font-black">{value}</p>
                <p className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-70">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Shortlisting summary cards */}
        {results.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Shortlisted (≥70)", value: results.filter((r) => (r.atsScore ?? 0) >= 70 && r.status !== "FAILED").length, color: "bg-green-50 border-green-200 text-green-700" },
              { label: "Pending (60–69)",   value: results.filter((r) => { const s = r.atsScore ?? 0; return s >= 60 && s < 70 && r.status !== "FAILED"; }).length, color: "bg-amber-50 border-amber-200 text-amber-700" },
              { label: "Rejected (<60)",    value: results.filter((r) => (r.atsScore ?? 0) < 60 && r.status !== "FAILED").length, color: "bg-red-50 border-red-100 text-red-700" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
                <p className="text-2xl font-black">{value}</p>
                <p className="text-xs font-semibold uppercase tracking-wider mt-1 opacity-70">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">Analysis Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {results.filter((r) => (r.atsScore ?? 0) >= 70 && r.status !== "FAILED").length} candidates qualify for shortlisting (ATS ≥ 70)
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
                    <th className="text-left px-5 py-3 font-semibold">Suggested Role</th>
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
                            <span className="text-sm text-slate-700 font-medium max-w-[160px] truncate" title={r.filename}>
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
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${scoreBg(r.atsScore)}`}
                                  style={{ width: `${score}%` }} />
                              </div>
                              <span className={`text-sm font-black ${scoreColor(r.atsScore)}`}>{score}</span>
                            </div>
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
        )}
      </div>
    </div>
  );
};

export default BulkUpload;