// src/pages/EditProfile.tsx
import React, { useEffect, useState } from "react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

interface MeResponse {
  username: string;
  email: string;
  phone: string;
  role: string;
}

export default function EditProfile() {
  const nav = useNavigate();
  const auth = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [original, setOriginal] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    API.get<MeResponse>("/auth/me")
      .then((res) => {
        setUsername(res.data.username);
        setEmail(res.data.email);
        setPhone(res.data.phone || "");
        setRole(res.data.role);
        setOriginal(res.data);
      })
      .catch(() => setError("Failed to load profile"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!original) return;

    if (password && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const payload: any = {};
    if (username !== original.username) payload.username = username;
    if (email !== original.email) payload.email = email;
    if (phone !== original.phone) payload.phone = phone;
    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      setError("No changes detected");
      return;
    }

    setLoading(true);
    try {
      await API.put("/auth/update", payload);
      if (payload.email || payload.password) {
        auth.logout();
        nav("/login");
        return;
      }
      setMessage("Profile updated successfully");
      setPassword("");
      setConfirmPassword("");
      setOriginal({ ...original, ...payload });
    } catch {
      setError("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-sm transition";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/20 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg border border-slate-100 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-600 text-white flex items-center justify-center font-bold text-lg">
            {username.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit Profile</h2>
            <p className="text-xs text-slate-400">{role}</p>
          </div>
        </div>

        {message && (
          <div className="mb-5 p-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl flex items-center gap-2">
            <span>✅</span> {message}
          </div>
        )}
        {error && (
          <div className="mb-5 p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username">
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Email" hint="Changing email requires re-login">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Role">
            <input className={`${inputCls} bg-slate-100 cursor-not-allowed`} value={role} disabled />
          </Field>
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-3">Change password (leave blank to keep current)</p>
            <div className="space-y-3">
              <Field label="New Password">
                <input type="password" className={inputCls} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="Confirm Password">
                <input type="password" className={inputCls} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold text-sm hover:from-teal-700 hover:to-teal-600 disabled:opacity-50 transition-all shadow-md mt-2"
          >
            {loading ? "Updating…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
