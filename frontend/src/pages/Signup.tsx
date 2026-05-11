// src/pages/Signup.tsx
import React, { useState } from "react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

type SignupRole = "FRESHER" | "STUDENT" | "HR" | "OTHER";

export default function Signup() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<SignupRole>("FRESHER");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSuccess(null);

    if (password !== confirm) {
      setErr("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await API.post("/auth/signup", { username, email, phone, password, role });
      setSuccess("Account created! Redirecting to login…");
      setTimeout(() => nav("/login"), 2000);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Signup failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-sm transition";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 md:p-10">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white font-bold text-sm">
            AI
          </div>
          <span className="font-bold text-slate-800">Resume Screener</span>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 mb-1">Create account</h2>
        <p className="text-slate-500 text-sm mb-6">Join thousands boosting their careers</p>

        {err && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
            <span>⚠️</span> {err}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl flex items-center gap-2">
            <span>✅</span> {success}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          <input className={inputCls} placeholder="Username" value={username}
            onChange={(e) => setUsername(e.target.value)} required />

          <input type="email" className={inputCls} placeholder="Email address" value={email}
            onChange={(e) => setEmail(e.target.value)} required />

          <input type="tel" className={inputCls} placeholder="Phone number (optional)"
            value={phone} onChange={(e) => setPhone(e.target.value)} />

          <select className={inputCls} value={role}
            onChange={(e) => setRole(e.target.value as SignupRole)}>
            <option value="FRESHER">Fresher</option>
            <option value="STUDENT">Student</option>
            <option value="HR">HR / Recruiter</option>
            <option value="OTHER">Other</option>
          </select>

          <input type="password" className={inputCls} placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />

          <input type="password" className={inputCls} placeholder="Confirm password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold text-sm hover:from-teal-700 hover:to-teal-600 disabled:opacity-50 transition-all shadow-lg shadow-teal-100"
          >
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <p className="text-sm text-center text-slate-500 mt-5">
          Already have an account?{" "}
          <button
            onClick={() => nav("/login")}
            className="text-teal-600 font-semibold hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
