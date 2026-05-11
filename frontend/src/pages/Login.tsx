// src/pages/Login.tsx
import React, { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  // const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
  e.preventDefault();
  setErr(null);
  setLoading(true);

  try {
    await auth.login(email, password);

    const role = localStorage.getItem("role");

    // ✅ CORRECT ROLE-BASED REDIRECT
    if (role === "ADMIN") {
      nav("/admin", { replace: true });
    } else if (role === "HR") {
      nav("/hr-home", { replace: true });  // 🔥 FIXED
    } else {
      nav("/home", { replace: true });     // 🔥 FIXED
    }

  } catch (e: any) {
    setErr(e?.response?.data?.error || "Login failed. Check your credentials.");
  } finally {
    setLoading(false);
  }
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl flex rounded-3xl overflow-hidden shadow-2xl">

        {/* LEFT PANEL */}
        <div className="hidden md:flex w-1/2 flex-col justify-between bg-gradient-to-br from-teal-600 via-teal-700 to-slate-800 p-10 text-white">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg">
                AI
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">Resume Optimization & Smart Shortlisting System
</p>
                <p className="text-xs text-teal-200 tracking-widest uppercase">GEN AI Powered</p>
              </div>
            </div>

            <h1 className="text-4xl font-bold mb-4 leading-tight">
              Land your<br />
              <span className="text-teal-300">dream job</span><br />
              faster.
            </h1>

            <p className="text-teal-100/80 text-sm leading-relaxed">
              AI-powered resume analysis, ATS scoring, and intelligent enhancement to maximise your chances.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: "🎯", label: "ATS Score Analysis" },
              { icon: "✨", label: "AI Resume Enhancement" },
              { icon: "📊", label: "Career Insights Dashboard" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-teal-100">
                <span className="text-base">{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-full md:w-1/2 bg-white p-8 md:p-10 flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account</p>

          {err && (
            <div className="mb-5 p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
              <span>⚠️</span> {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Email
              </label>

              { /* Changed from email to text so admin login works */}
              <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-sm transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com or admin"
                  required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-sm transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold text-sm hover:from-teal-700 hover:to-teal-600 disabled:opacity-50 transition-all shadow-lg shadow-teal-100 mt-2"
            >
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>

          <p className="text-sm text-center text-slate-500 mt-6">
            New here?{" "}
            <button
              type="button"
              onClick={() => nav("/signup")}
              className="text-teal-600 font-semibold hover:underline"
            >
              Create an account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}