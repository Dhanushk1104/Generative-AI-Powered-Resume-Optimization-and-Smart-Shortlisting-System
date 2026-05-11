// src/components/UploadResume.tsx
import { useState, useRef } from "react";
import { analyzeResume, AnalyzeResp } from "../api/aiApi";

interface Props {
  setResult: (r: AnalyzeResp) => void;
  onFileSelected?: (file: File) => void; // <-- added callback prop
}

const UploadResume = ({ setResult, onFileSelected }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setError("Only PDF and DOCX files are supported.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const upload = async () => {
    if (!file) {
      setError("Please select a resume file first.");
      return;
    }

    // Trigger the callback before API call
    onFileSelected?.(file);

    try {
      setLoading(true);
      setError(null);
      const data = await analyzeResume(file);
      setResult(data);
    } catch (e: any) {
      setError(
        e?.response?.data?.detail || "Resume analysis failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-teal-500 bg-teal-50 scale-[1.01]"
            : file
            ? "border-teal-400 bg-teal-50/50"
            : "border-slate-200 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${
          file ? "bg-teal-100" : "bg-white shadow-sm"
        }`}>
          {file ? "📄" : "📂"}
        </div>
        {file ? (
          <div className="text-center">
            <p className="font-semibold text-teal-700">{file.name}</p>
            <p className="text-sm text-slate-500 mt-1">
              {(file.size / 1024).toFixed(1)} KB · Click to change
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="font-semibold text-slate-700">
              Drop your resume here
            </p>
            <p className="text-sm text-slate-400 mt-1">
              PDF or DOCX · up to 10 MB
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Analyse Button */}
      <button
        onClick={upload}
        disabled={loading || !file}
        className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-teal-200 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Analysing Resume…
          </>
        ) : (
          <>
            <span>🔍</span> Analyse ATS Score
          </>
        )}
      </button>
    </div>
  );
};

export default UploadResume;