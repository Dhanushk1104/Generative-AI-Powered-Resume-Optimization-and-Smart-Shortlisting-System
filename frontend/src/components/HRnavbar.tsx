// src/components/HRNavbar.tsx
// ─── HR Navbar — identical layout & CSS to Navbar.tsx, HR-specific links ──────
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import API from "../api/api";

export default function HRNavbar() {
  const auth = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!auth.token) return null;

  const displayName  = auth.username || "HR User";
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const role         = auth.role || "";
  const isAdmin      = role === "ADMIN";

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account?")) return;
    try {
      await API.delete("/auth/delete");
      auth.logout();
      nav("/login");
    } catch {
      alert("Failed to delete account");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // ── Identical NavLink component to Navbar.tsx ──────────────────
  const NavLink = ({ to, label, icon }: { to: string; label: string; icon: string }) => (
    <button
      onClick={() => nav(to)}
      className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group ${
        isActive(to)
          ? "text-teal-600 bg-teal-50"
          : "text-slate-600 hover:text-teal-700 hover:bg-slate-50"
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
      {isActive(to) && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-500" />
      )}
    </button>
  );

  return (
    // ── Identical header wrapper to Navbar.tsx ─────────────────────
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo — same as Navbar.tsx, home = /hr-home ────────── */}
          <button
             onClick={() => alert("Thank You For Choosing US!")}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-md group-hover:shadow-teal-200 transition-shadow">
              <span className="text-white text-sm font-bold">AI</span>
            </div>
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-800 tracking-tight">
                HR Bulk Upload & Smart Shortlisting System
              </span>
              <span className="text-[10px] text-slate-400 tracking-widest uppercase">
                HR Panel
              </span>
            </div>
          </button>

          {/* ── HR Nav Links ───────────────────────────────────────── */}
          <nav className="flex items-center gap-1">
            <NavLink to="/hr-home" label="Upload"       icon="📤" />
            <NavLink to="/hr"      label="HR Dashboard" icon="👥" />
            {isAdmin && (
              <NavLink to="/admin" label="Admin"        icon="⚙️" />
            )}
          </nav>

          {/* ── Role Badge + Profile — identical to Navbar.tsx ─────── */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-teal-50 text-teal-700 border border-teal-100">
              {role}
            </span>

            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {avatarLetter}
                </div>
                <span className="hidden md:block text-sm font-medium text-slate-700">
                  {displayName}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showProfile ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProfile && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-top-2 duration-150">
                  {/* Gradient header — identical to Navbar.tsx */}
                  <div className="px-4 py-3 bg-gradient-to-r from-teal-50 to-indigo-50 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{role.toLowerCase()}</p>
                  </div>
                  <div className="py-1">
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                      onClick={() => { nav("/edit-profile"); setShowProfile(false); }}
                    >
                      <span>✏️</span> Edit Profile
                    </button>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                      onClick={() => { auth.logout(); nav("/login"); setShowProfile(false); }}
                    >
                      <span>🚪</span> Logout
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                      onClick={handleDelete}
                    >
                      <span>🗑️</span> Delete Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}