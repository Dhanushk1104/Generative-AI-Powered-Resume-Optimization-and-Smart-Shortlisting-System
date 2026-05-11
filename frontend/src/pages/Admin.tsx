// src/pages/Admin.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import API from "../api/api";

// ─── Types — matched exactly to your MySQL users table ───────────────────────
// Columns: id, email, password, role, created_at, username, phone_number
// Extra columns your backend should add (ALTER TABLE or virtual): restriction, blocked_until, block_reason

type RestrictionType = "none" | "temp_block" | "perm_block";

type User = {
  id: number;                        // MySQL: id (int, PK)
  email: string;                     // MySQL: email
  role: string;                      // MySQL: role (USER/FRESHER/STUDENT/HR…)
  created_at: string;                // MySQL: created_at
  username: string | null;           // MySQL: username (nullable)
  phone_number: string | null;       // MySQL: phone_number (nullable)
  restriction: RestrictionType;      // MySQL: restriction (add column, default 'none')
  blocked_until: string | null;      // MySQL: blocked_until (datetime, nullable)
  block_reason: string | null;       // MySQL: block_reason (varchar, nullable)
};

type Stats = {
  totalScans: number;
  roles: Record<string, number>;     // role → count from your users table
  totalUsers: number;
};

type ActivityItem = {
  id: number | string;
  action: string;
  user: string;
  time: string;
  type: "scan" | "login" | "export" | "alert";
};

type ModalState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; user: User }
  | { kind: "delete"; user: User }
  | { kind: "view"; user: User }
  | { kind: "restrict"; user: User };

type Toast = { id: number; msg: string; ok: boolean };

// ─── Role colours — extended to match YOUR actual roles ──────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  USER:     { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  ADMIN:    { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  FRESHER:  { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  STUDENT:  { bg: "#fefce8", text: "#ca8a04", border: "#fde68a" },
  HR:       { bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff" },
  MANAGER:  { bg: "#fff7ed", text: "#ea580c", border: "#fed7aa" },
  STAFF:    { bg: "#f0f9ff", text: "#0284c7", border: "#bae6fd" },
};

const RESTRICTION_CFG = {
  none:       { label: "Active",     color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓"  },
  temp_block: { label: "Temp Block", color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "⏸" },
  perm_block: { label: "Perm Block", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "⊘" },
};

const TYPE_CFG = {
  scan:   { icon: "◎", color: "#0d9488", bg: "#f0fdfa" },
  login:  { icon: "◈", color: "#4f46e5", bg: "#eef2ff" },
  export: { icon: "▣", color: "#d97706", bg: "#fffbeb" },
  alert:  { icon: "⚠", color: "#dc2626", bg: "#fef2f2" },
};

const TEMP_DURATIONS = [
  { label: "1 Hour",  hours: 1   },
  { label: "6 Hours", hours: 6   },
  { label: "1 Day",   hours: 24  },
  { label: "3 Days",  hours: 72  },
  { label: "7 Days",  hours: 168 },
  { label: "30 Days", hours: 720 },
];

// All roles in your system
const ALL_ROLES = ["USER", "FRESHER", "STUDENT", "HR", "MANAGER", "STAFF", "ADMIN"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeLeft(iso: string): string {
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return "Expired";
  const h = Math.floor(d / 3600000);
  const m = Math.floor((d % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

function displayName(u: User): string {
  return u.username || u.email.split("@")[0];
}

let _tid = 0;

// ─── Small UI primitives ──────────────────────────────────────────────────────
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ display:"inline-block", position:"relative", width:8, height:8, flexShrink:0 }}>
      <span style={{ position:"absolute", inset:0, borderRadius:"50%", background:color, animation:"adm-ping 1.5s ease-in-out infinite", opacity:0.4 }} />
      <span style={{ position:"absolute", inset:1, borderRadius:"50%", background:color }} />
    </span>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let cur = 0;
    const step = Math.max(1, Math.ceil(value / 40));
    const t = setInterval(() => {
      cur += step;
      if (cur >= value) { setN(value); clearInterval(t); } else setN(cur);
    }, 20);
    return () => clearInterval(t);
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_COLORS[role?.toUpperCase()] ?? { bg:"#f1f5f9", text:"#475569", border:"#cbd5e1" };
  return (
    <span style={{ fontSize:10, padding:"3px 10px", borderRadius:100, fontWeight:700,
      background:cfg.bg, color:cfg.text, border:`1px solid ${cfg.border}`, whiteSpace:"nowrap" }}>
      {role}
    </span>
  );
}

function Spinner({ size = 18 }: { size?: number }) {
  return <span style={{ width:size, height:size, border:"2px solid #e2e8f0", borderTopColor:"#0d9488", borderRadius:"50%", animation:"adm-spin 0.7s linear infinite", display:"inline-block", flexShrink:0 }} />;
}

function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id:number) => void }) {
  return (
    <div style={{ position:"fixed", bottom:28, right:24, zIndex:9999, display:"flex", flexDirection:"column", gap:10 }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 18px", background:"#fff", border:`1px solid ${t.ok?"#bbf7d0":"#fecaca"}`, borderRadius:14, cursor:"pointer", animation:"adm-fadeUp 0.25s ease both", boxShadow:`0 4px 20px ${t.ok?"#16a34a18":"#dc262618"}`, fontSize:13, color:t.ok?"#16a34a":"#dc2626", minWidth:280, fontFamily:"inherit" }}>
          <span>{t.ok ? "✓" : "✕"}</span><span style={{ fontWeight:600 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({ onClose, children, width = 480 }: { onClose:() => void; children:React.ReactNode; width?: number }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(15,23,42,0.45)", backdropFilter:"blur(4px)" }} />
      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:width, background:"#fff", border:"1px solid #e2e8f0", borderRadius:24, padding:32, animation:"adm-fadeUp 0.22s ease both", boxShadow:"0 20px 60px rgba(0,0,0,0.13)", maxHeight:"90vh", overflowY:"auto" }}>
        {children}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10,
  padding:"10px 14px", color:"#0f172a", fontSize:13, fontFamily:"inherit",
  outline:"none", boxSizing:"border-box", transition:"border-color 0.2s",
};

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:11, color:"#64748b", fontWeight:600, display:"block", marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Add/Edit user form ───────────────────────────────────────────────────────
function UserForm({ initial, onSubmit, onClose, loading }: {
  initial: Partial<User>;
  onSubmit: (d: Partial<User>) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<Partial<User>>({
    email:"", username:"", phone_number:"", role:"USER", ...initial
  });
  const upd = (k: keyof User) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Field label="Email Address">
        <input style={inp} value={form.email ?? ""} onChange={upd("email")} placeholder="user@example.com" type="email" />
      </Field>
      <Field label="Username">
        <input style={inp} value={form.username ?? ""} onChange={upd("username")} placeholder="johndoe (optional)" />
      </Field>
      <Field label="Phone Number">
        <input style={inp} value={form.phone_number ?? ""} onChange={upd("phone_number")} placeholder="9876543210 (optional)" />
      </Field>
      <Field label="Role">
        <select style={{ ...inp, cursor:"pointer" }} value={form.role ?? "USER"} onChange={upd("role")}>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      {!initial.id && (
        <Field label="Password">
          <input style={inp} type="password" placeholder="Temporary password" onChange={upd("phone_number")} />
        </Field>
      )}
      <div style={{ display:"flex", gap:10, marginTop:24 }}>
        <button onClick={onClose} style={{ flex:1, padding:"11px 0", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>Cancel</button>
        <button onClick={() => onSubmit(form)} disabled={loading} style={{ flex:2, padding:"11px 0", borderRadius:10, background:"linear-gradient(135deg,#0d9488,#4f46e5)", border:"none", color:"#fff", cursor:loading?"not-allowed":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, opacity:loading?0.6:1 }}>
          {loading ? "Saving…" : "Save User"}
        </button>
      </div>
    </>
  );
}

// ─── Restrict modal ───────────────────────────────────────────────────────────
function RestrictModal({ user, onClose, onApply, loading }: {
  user: User;
  onClose: () => void;
  onApply: (type: RestrictionType, hours?: number, reason?: string) => void;
  loading: boolean;
}) {
  const [type, setType] = useState<RestrictionType>(
    user.restriction === "none" ? "temp_block" : user.restriction
  );
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState(user.block_reason ?? "");
  const blocked = user.restriction !== "none";

  return (
    <>
      {/* User card */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, padding:"14px 16px", background:"#f8fafc", borderRadius:14, border:"1px solid #e2e8f0" }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:16, flexShrink:0 }}>
          {displayName(user).charAt(0).toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontWeight:700, color:"#0f172a", fontSize:14 }}>{displayName(user)}</p>
          <p style={{ margin:"2px 0 0", fontSize:12, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email} · {user.role}</p>
        </div>
        <span style={{ fontSize:10, padding:"3px 10px", borderRadius:100, fontWeight:700, background:RESTRICTION_CFG[user.restriction].bg, color:RESTRICTION_CFG[user.restriction].color, border:`1px solid ${RESTRICTION_CFG[user.restriction].border}`, whiteSpace:"nowrap" }}>
          {RESTRICTION_CFG[user.restriction].icon} {RESTRICTION_CFG[user.restriction].label}
        </span>
      </div>

      {/* Unblock shortcut */}
      {blocked && (
        <div style={{ marginBottom:20, padding:"14px 16px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:14 }}>
          <p style={{ margin:"0 0 4px", fontWeight:700, color:"#16a34a", fontSize:13 }}>✓ Remove Restriction</p>
          <p style={{ margin:"0 0 12px", fontSize:12, color:"#4b5563" }}>
            Restore full access immediately.
            {user.restriction === "temp_block" && user.blocked_until &&
              ` (Currently blocked for ${timeLeft(user.blocked_until)})`}
          </p>
          <button onClick={() => onApply("none")} disabled={loading} style={{ padding:"8px 20px", borderRadius:8, background:"#16a34a", border:"none", color:"#fff", cursor:loading?"not-allowed":"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700 }}>
            {loading ? "Unblocking…" : "Unblock Now"}
          </button>
        </div>
      )}

      <div style={{ borderTop:blocked?"1px solid #e2e8f0":"none", paddingTop:blocked?20:0 }}>
        <p style={{ margin:"0 0 14px", fontWeight:700, color:"#0f172a", fontSize:14 }}>
          {blocked ? "Change or Extend Restriction" : "Apply Restriction"}
        </p>

        {/* Type cards */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
          {(["temp_block","perm_block"] as const).map(t => {
            const cfg = RESTRICTION_CFG[t];
            const sel = type === t;
            return (
              <button key={t} onClick={() => setType(t)} style={{ padding:"14px 12px", borderRadius:14, border:`2px solid ${sel?cfg.border:"#e2e8f0"}`, background:sel?cfg.bg:"#f8fafc", cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{cfg.icon}</div>
                <p style={{ margin:"0 0 3px", fontWeight:700, fontSize:13, color:sel?cfg.color:"#374151" }}>{cfg.label}</p>
                <p style={{ margin:0, fontSize:10, color:"#9ca3af" }}>
                  {t==="temp_block" ? "Auto-expires after chosen duration" : "Indefinite — requires manual unblock"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Duration */}
        {type === "temp_block" && (
          <Field label="Block Duration">
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
              {TEMP_DURATIONS.map(d => (
                <button key={d.hours} onClick={() => setHours(d.hours)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${hours===d.hours?"#0d9488":"#e2e8f0"}`, background:hours===d.hours?"#f0fdfa":"#f8fafc", color:hours===d.hours?"#0d9488":"#374151", fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit" }}>
                  {d.label}
                </button>
              ))}
            </div>
            <p style={{ margin:0, fontSize:11, color:"#64748b" }}>
              Auto-unblocks: <strong>{new Date(Date.now() + hours*3600000).toLocaleString()}</strong>
            </p>
          </Field>
        )}

        <Field label="Reason (optional)">
          <input style={inp} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Suspicious activity, Policy violation…" />
        </Field>

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px 0", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>Cancel</button>
          <button onClick={() => onApply(type, type==="temp_block"?hours:undefined, reason||undefined)} disabled={loading}
            style={{ flex:2, padding:"11px 0", borderRadius:10, background:type==="perm_block"?"linear-gradient(135deg,#dc2626,#b91c1c)":"linear-gradient(135deg,#d97706,#b45309)", border:"none", color:"#fff", cursor:loading?"not-allowed":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, opacity:loading?0.6:1 }}>
            {loading ? "Applying…" : `Apply ${RESTRICTION_CFG[type].label}`}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Admin() {
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [users,    setUsers]    = useState<User[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [loadingStats,    setLoadingStats]    = useState(true);
  const [loadingUsers,    setLoadingUsers]    = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const [activeTab, setActiveTab] = useState<"overview"|"users"|"logs">("overview");
  const [modal,    setModal]    = useState<ModalState>({ kind:"none" });
  const [mutating, setMutating] = useState(false);
  const [toasts,   setToasts]   = useState<Toast[]>([]);

  // Filters
  const [search,         setSearch]         = useState("");
  const [roleFilter,     setRoleFilter]     = useState("All");
  const [restrictFilter, setRestrictFilter] = useState("All");
  const [logFilter,      setLogFilter]      = useState("All");
  const [sortBy,         setSortBy]         = useState<"email"|"role"|"created_at">("email");

  const tickRef = useRef(0);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const toast = useCallback((msg: string, ok = true) => {
    const id = ++_tid;
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // ── Fetch helpers ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await API.get<Stats>("/admin/stats");
      setStats(res.data);
    } catch { toast("Failed to load stats", false); }
    finally  { setLoadingStats(false); }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      // GET /admin/users → returns your MySQL users rows
      // Backend should SELECT id,email,role,created_at,username,phone_number,
      //   COALESCE(restriction,'none') as restriction, blocked_until, block_reason
      const res = await API.get<User[]>("/admin/users");
      setUsers(res.data.map(u => ({
        ...u,
        restriction: u.restriction ?? "none",
        blocked_until: u.blocked_until ?? null,
        block_reason: u.block_reason ?? null,
      })));
    } catch { toast("Failed to load users", false); }
    finally  { setLoadingUsers(false); }
  }, [toast]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await API.get<ActivityItem[]>("/admin/activity");
      setActivity(res.data);
    } catch {}
    finally { setLoadingActivity(false); }
  }, []);

  useEffect(() => {
    fetchStats(); fetchUsers(); fetchActivity();
    const iv = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current % 15 === 0) { fetchStats(); fetchActivity(); }
    }, 2000);
    return () => clearInterval(iv);
  }, [fetchStats, fetchUsers, fetchActivity]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const handleAddUser = async (data: Partial<User>) => {
    setMutating(true);
    try {
      const res = await API.post<User>("/admin/users", data);
      setUsers(u => [{ restriction:"none", blocked_until:null, block_reason:null, ...res.data }, ...u]);
      setModal({ kind:"none" });
      toast(`User ${res.data.email} created`);
      fetchStats();
    } catch { toast("Failed to create user", false); }
    finally { setMutating(false); }
  };

  const handleEditUser = async (data: Partial<User>) => {
    if (modal.kind !== "edit") return;
    setMutating(true);
    try {
      const res = await API.put<User>(`/admin/users/${modal.user.id}`, data);
      setUsers(u => u.map(x => x.id === modal.user.id ? { ...x, ...res.data } : x));
      setModal({ kind:"none" });
      toast("User updated");
    } catch { toast("Update failed", false); }
    finally { setMutating(false); }
  };

  const handleDeleteUser = async () => {
    if (modal.kind !== "delete") return;
    setMutating(true);
    try {
      await API.delete(`/admin/users/${modal.user.id}`);
      setUsers(u => u.filter(x => x.id !== modal.user.id));
      setModal({ kind:"none" });
      toast("User removed");
      fetchStats();
    } catch { toast("Delete failed", false); }
    finally { setMutating(false); }
  };

  // ── Restriction ──────────────────────────────────────────────────────────────
  // PATCH /admin/users/:id/restriction
  // Body: { restriction, blocked_until, block_reason }
  // Backend: UPDATE users SET restriction=?, blocked_until=?, block_reason=? WHERE id=?
  const handleApplyRestriction = async (type: RestrictionType, hrs?: number, reason?: string) => {
    if (modal.kind !== "restrict") return;
    setMutating(true);
    const { id, email } = modal.user;
    try {
      const payload: Record<string,any> = {
        restriction: type,
        block_reason: reason ?? null,
        blocked_until: type === "temp_block" && hrs
          ? new Date(Date.now() + hrs * 3600000).toISOString().slice(0,19).replace("T"," ")
          : null,
      };
      const res = await API.patch<User>(`/admin/users/${id}/restriction`, payload);
      setUsers(u => u.map(x => x.id === id ? { ...x, ...res.data } : x));
      setModal({ kind:"none" });
      if (type === "none")       toast(`${displayName(modal.user)} unblocked`);
      else if (type === "temp_block") toast(`${displayName(modal.user)} blocked for ${hrs}h`);
      else                       toast(`${displayName(modal.user)} permanently blocked`, false);
    } catch { toast("Restriction update failed", false); }
    finally { setMutating(false); }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────────
  const filteredUsers = users
    .filter(u => {
      const name  = displayName(u).toLowerCase();
      const email = u.email.toLowerCase();
      const q     = search.toLowerCase();
      const matchSearch   = !q || name.includes(q) || email.includes(q) || String(u.id).includes(q);
      const matchRole     = roleFilter     === "All" || u.role === roleFilter;
      const matchRestrict =
        restrictFilter === "All"        ? true :
        restrictFilter === "Blocked"    ? u.restriction !== "none" :
        restrictFilter === "Clear"      ? u.restriction === "none" :
        u.restriction === restrictFilter;
      return matchSearch && matchRole && matchRestrict;
    })
    .sort((a, b) => {
      if (sortBy === "role")       return a.role.localeCompare(b.role);
      if (sortBy === "created_at") return b.created_at.localeCompare(a.created_at);
      return a.email.localeCompare(b.email);
    });

  const filteredActivity = logFilter === "All"
    ? activity
    : activity.filter(a => a.type === logFilter.toLowerCase() as any);

  const blockedCount = users.filter(u => u.restriction !== "none").length;

  // Distinct roles from actual data
  const distinctRoles = Array.from(new Set(users.map(u => u.role))).sort();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes adm-ping   { 0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(2.2);opacity:0} }
        @keyframes adm-fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none} }
        @keyframes adm-spin   { to{transform:rotate(360deg)} }
        .adm-tab { background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;padding:8px 18px;border-radius:8px;transition:all .2s;font-family:inherit;color:#64748b; }
        .adm-tab.on { background:linear-gradient(135deg,#0d9488,#4f46e5);color:#fff;box-shadow:0 2px 8px rgba(13,148,136,.3); }
        .adm-tab:not(.on):hover { background:#f1f5f9;color:#0f172a; }
        .adm-btn { background:#fff;border:1px solid #e2e8f0;color:#374151;border-radius:10px;padding:8px 14px;font-size:12px;cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-weight:600; }
        .adm-btn:hover        { border-color:#0d9488;color:#0d9488;background:#f0fdfa; }
        .adm-btn.danger:hover { border-color:#dc2626;color:#dc2626;background:#fef2f2; }
        .adm-btn.primary      { background:linear-gradient(135deg,#0d9488,#4f46e5);border:none;color:#fff;box-shadow:0 2px 8px rgba(13,148,136,.25); }
        .adm-btn.primary:hover{ box-shadow:0 4px 14px rgba(13,148,136,.4);transform:translateY(-1px); }
        .adm-btn.warn         { border-color:#f59e0b;color:#d97706;background:#fffbeb; }
        .adm-btn.warn:hover   { background:#fef3c7; }
        .adm-urow { border-bottom:1px solid #f1f5f9;transition:background .1s; }
        .adm-urow:hover { background:#f8fafc; }
        .adm-urow.temp-row  { background:#fffbeb; }
        .adm-urow.temp-row:hover { background:#fef3c7; }
        .adm-urow.perm-row  { background:#fef2f2; }
        .adm-urow.perm-row:hover { background:#fee2e2; }
        .adm-th { padding:10px 14px;text-align:left;font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.8px;white-space:nowrap; }
        .adm-td { padding:11px 14px; }
        .adm-sort { cursor:pointer;user-select:none; }
        .adm-sort:hover { color:#0d9488 !important; }
        .adm-card { background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:24px;animation:adm-fadeUp .35s ease both;box-shadow:0 2px 12px rgba(0,0,0,.04); }
        .adm-inp:focus { border-color:#0d9488 !important;box-shadow:0 0 0 3px rgba(13,148,136,.08) !important; }
      `}</style>

      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#f8fafc 0%,#fff 55%,rgba(240,253,250,.4) 100%)", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color:"#0f172a" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"40px 24px" }}>

          {/* ── Header ── */}
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:36, flexWrap:"wrap", gap:16 }}>
            <div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"4px 14px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:100, marginBottom:12 }}>
                <PulsingDot color="#dc2626" />
                <span style={{ fontSize:10, fontWeight:700, color:"#dc2626", letterSpacing:1, textTransform:"uppercase" }}>Admin Access Only</span>
              </div>
              <h1 style={{ fontSize:28, fontWeight:800, color:"#0f172a", margin:0, letterSpacing:-.5 }}>
                Admin Console
                <span style={{ background:"linear-gradient(135deg,#0d9488,#4f46e5)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}> ⚙</span>
              </h1>
              <p style={{ fontSize:12, color:"#94a3b8", margin:"6px 0 0", fontWeight:500 }}>
                {new Date().toLocaleString()}
              </p>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"8px 16px" }}>
              <PulsingDot color="#22c55e" />
              <span style={{ fontSize:12, fontWeight:600, color:"#16a34a" }}>All Systems Nominal</span>
            </div>
          </div>

          {/* ── KPI strip ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))", gap:14, marginBottom:28 }}>
            {[
              { label:"Total Users",   val:users.length,       icon:"👥", grad:"#4f46e5,#7c3aed", sub:`${users.filter(u=>u.restriction==="none").length} unrestricted` },
              { label:"Total Scans",   val:stats?.totalScans??0,icon:"📊", grad:"#0d9488,#0891b2", sub:"all time" },
              { label:"Roles in DB",   val:distinctRoles.length,icon:"🏷", grad:"#d97706,#ea580c", sub:distinctRoles.slice(0,3).join(", ") },
              { label:"Blocked Users", val:blockedCount,        icon:"🚫", grad:"#dc2626,#be123c", sub:`${users.filter(u=>u.restriction==="temp_block").length} temp · ${users.filter(u=>u.restriction==="perm_block").length} perm` },
            ].map((kpi,i) => (
              <div key={i} className="adm-card" style={{ animationDelay:`${i*.07}s`, padding:"18px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${kpi.grad})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>{kpi.icon}</div>
                  {loadingStats||loadingUsers
                    ? <Spinner size={14} />
                    : <span style={{ fontSize:9, fontWeight:700, color:"#94a3b8", border:"1px solid #e2e8f0", borderRadius:4, padding:"2px 6px", background:"#f8fafc" }}>LIVE</span>}
                </div>
                <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", marginBottom:2 }}>
                  {loadingStats||loadingUsers ? <Spinner /> : <AnimatedNumber value={kpi.val} />}
                </div>
                <div style={{ fontSize:12, color:"#374151", fontWeight:600 }}>{kpi.label}</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:"flex", gap:4, marginBottom:24, background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:12, padding:4, width:"fit-content" }}>
            {(["overview","users","logs"] as const).map(tab => (
              <button key={tab} className={`adm-tab ${activeTab===tab?"on":""}`} onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase()+tab.slice(1)}
              </button>
            ))}
          </div>

          {/* ══ OVERVIEW ══ */}
          {activeTab === "overview" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

              {/* Role breakdown from live DB data */}
              <div className="adm-card" style={{ animationDelay:".05s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>🏷</div>
                  <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:"#0f172a" }}>Role Distribution (Live DB)</h2>
                </div>
                {loadingUsers
                  ? <div style={{ display:"flex", justifyContent:"center", paddingTop:20 }}><Spinner /></div>
                  : distinctRoles.length === 0
                    ? <p style={{ fontSize:13, color:"#94a3b8" }}>No users in database</p>
                    : (
                      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                        {distinctRoles.map(role => {
                          const count = users.filter(u => u.role === role).length;
                          const pct   = Math.round((count / users.length) * 100);
                          return (
                            <div key={role}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                                <RoleBadge role={role} />
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <span style={{ fontSize:11, color:"#94a3b8" }}>{pct}%</span>
                                  <span style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>{count}</span>
                                </div>
                              </div>
                              <div style={{ height:6, background:"#f1f5f9", borderRadius:10, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#0d9488,#4f46e5)", borderRadius:10, transition:"width 1.2s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                }
              </div>

              {/* Restriction summary */}
              <div className="adm-card" style={{ animationDelay:".1s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#dc2626,#b91c1c)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>🚫</div>
                  <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:"#0f172a" }}>Restriction Summary</h2>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {(["none","temp_block","perm_block"] as const).map(r => {
                    const count = users.filter(u => u.restriction === r).length;
                    const cfg   = RESTRICTION_CFG[r];
                    return (
                      <div key={r} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:12 }}>
                        <span style={{ fontSize:18 }}>{cfg.icon}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight:700, color:cfg.color }}>{cfg.label}</p>
                          <p style={{ margin:"2px 0 0", fontSize:11, color:"#6b7280" }}>
                            {r==="none"?"Full access":r==="temp_block"?"Auto-expires on set date":"Manual unblock only"}
                          </p>
                        </div>
                        <span style={{ fontSize:22, fontWeight:800, color:cfg.color }}>{loadingUsers?"–":count}</span>
                        {r !== "none" && count > 0 && (
                          <button className="adm-btn" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => { setRestrictFilter(r); setActiveTab("users"); }}>View</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick actions */}
              <div className="adm-card" style={{ animationDelay:".15s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>⚡</div>
                  <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:"#0f172a" }}>Quick Actions</h2>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[
                    { icon:"➕", label:"Add New User",     desc:"Invite to system",   fn:() => { setActiveTab("users"); setModal({ kind:"add" }); } },
                    { icon:"⬇", label:"Export Users CSV",  desc:"All DB users",       fn:() => toast("Export started") },
                    { icon:"🔄", label:"Refresh All Data",  desc:"Re-fetch from DB",   fn:() => { fetchStats(); fetchUsers(); fetchActivity(); toast("Refreshed"); } },
                    { icon:"📋", label:"View Audit Log",    desc:"Security events",    fn:() => setActiveTab("logs") },
                  ].map(a => (
                    <button key={a.label} className="adm-btn" style={{ width:"100%", justifyContent:"flex-start", padding:"11px 14px" }} onClick={a.fn}>
                      <span style={{ fontSize:15 }}>{a.icon}</span>
                      <span style={{ flex:1, textAlign:"left" }}>{a.label}</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>{a.desc}</span>
                      <span style={{ fontSize:11, color:"#cbd5e1" }}>→</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live activity */}
              <div className="adm-card" style={{ animationDelay:".2s" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>🔴</div>
                    <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:"#0f172a" }}>Live Activity</h2>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:100, padding:"4px 10px" }}>
                    <PulsingDot color="#22c55e" />
                    <span style={{ fontSize:10, fontWeight:700, color:"#16a34a" }}>LIVE</span>
                  </div>
                </div>
                {loadingActivity
                  ? <div style={{ display:"flex", justifyContent:"center", paddingTop:16 }}><Spinner /></div>
                  : activity.length === 0
                    ? <p style={{ fontSize:13, color:"#94a3b8" }}>No recent activity</p>
                    : (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {activity.slice(0,6).map((item,i) => {
                          const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.scan;
                          return (
                            <div key={`${item.id}-${i}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:cfg.bg, borderRadius:10, border:"1px solid #f1f5f9", animation:`adm-fadeUp .3s ease ${i*.04}s both` }}>
                              <span style={{ fontSize:14, color:cfg.color }}>{cfg.icon}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.action}</div>
                                <div style={{ fontSize:11, color:"#94a3b8" }}>{item.user}</div>
                              </div>
                              <span style={{ fontSize:10, color:"#94a3b8", whiteSpace:"nowrap" }}>{item.time}</span>
                            </div>
                          );
                        })}
                      </div>
                    )
                }
              </div>
            </div>
          )}

          {/* ══ USERS ══ */}
          {activeTab === "users" && (
            <div className="adm-card">
              {/* Toolbar */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  {/* Search */}
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#94a3b8", pointerEvents:"none" }}>🔍</span>
                    <input className="adm-inp" style={{ ...inp, paddingLeft:34, width:220, fontSize:12 }}
                      placeholder="Search email, username, ID…" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  {/* Role — built from actual DB data */}
                  <select style={{ ...inp, width:145, fontSize:12, cursor:"pointer" }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="All">All Roles</option>
                    {distinctRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {/* Restriction */}
                  <select style={{ ...inp, width:165, fontSize:12, cursor:"pointer" }} value={restrictFilter} onChange={e => setRestrictFilter(e.target.value)}>
                    <option value="All">All Users</option>
                    <option value="Clear">No Restrictions</option>
                    <option value="Blocked">Any Block</option>
                    <option value="temp_block">Temp Blocked</option>
                    <option value="perm_block">Perm Blocked</option>
                  </select>
                  {/* Sort */}
                  <select style={{ ...inp, width:160, fontSize:12, cursor:"pointer" }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                    <option value="email">Sort: Email</option>
                    <option value="role">Sort: Role</option>
                    <option value="created_at">Sort: Newest</option>
                  </select>
                </div>
                <button className="adm-btn primary" onClick={() => setModal({ kind:"add" })}>➕ Add User</button>
              </div>

              {/* Count + legend */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#64748b", fontWeight:500 }}>{filteredUsers.length} of {users.length} users</span>
                  {loadingUsers && <Spinner size={14} />}
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {[
                    { label:"Temp Blocked", color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
                    { label:"Perm Blocked", color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
                  ].map(l => (
                    <span key={l.label} style={{ fontSize:10, padding:"3px 10px", borderRadius:100, fontWeight:600, background:l.bg, color:l.color, border:`1px solid ${l.border}` }}>{l.label}</span>
                  ))}
                </div>
              </div>

              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ borderBottom:"2px solid #f1f5f9" }}>
                      {[
                        { l:"ID",           k:null },
                        { l:"User",         k:"email" },
                        { l:"Phone",        k:null },
                        { l:"Role",         k:"role" },
                        { l:"Restriction",  k:null },
                        { l:"Block Info",   k:null },
                        { l:"Joined",       k:"created_at" },
                        { l:"Actions",      k:null },
                      ].map(({ l, k }) => (
                        <th key={l} className={`adm-th${k?" adm-sort":""}`}
                          style={{ color:sortBy===k?"#0d9488":undefined }}
                          onClick={() => k && setSortBy(k as any)}>
                          {l}{sortBy===k?" ↑":""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => {
                      const resCfg = RESTRICTION_CFG[u.restriction];
                      const rowCls = u.restriction==="perm_block" ? "adm-urow perm-row"
                                   : u.restriction==="temp_block" ? "adm-urow temp-row"
                                   : "adm-urow";
                      const name = displayName(u);
                      return (
                        <tr key={u.id} className={rowCls}>
                          {/* ID */}
                          <td className="adm-td" style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>#{u.id}</td>
                          {/* User */}
                          <td className="adm-td" style={{ cursor:"pointer" }} onClick={() => setModal({ kind:"view", user:u })}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:34, height:34, borderRadius:10, background:u.restriction==="perm_block"?"#f1f5f9":u.restriction==="temp_block"?"#fef3c7":"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:u.restriction!=="none"?resCfg.color:"#fff", fontWeight:800, fontSize:13, flexShrink:0 }}>
                                {u.restriction!=="none" ? resCfg.icon : name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p style={{ margin:0, fontSize:13, fontWeight:700, color:u.restriction==="perm_block"?"#9ca3af":"#0f172a", textDecoration:u.restriction==="perm_block"?"line-through":"none" }}>{name}</p>
                                <p style={{ margin:"2px 0 0", fontSize:11, color:"#94a3b8" }}>{u.email}</p>
                              </div>
                            </div>
                          </td>
                          {/* Phone */}
                          <td className="adm-td" style={{ fontSize:11, color:"#64748b" }}>{u.phone_number ?? <span style={{ color:"#cbd5e1" }}>—</span>}</td>
                          {/* Role */}
                          <td className="adm-td"><RoleBadge role={u.role} /></td>
                          {/* Restriction badge */}
                          <td className="adm-td">
                            <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:100, background:resCfg.bg, color:resCfg.color, border:`1px solid ${resCfg.border}` }}>
                              {resCfg.icon} {resCfg.label}
                            </span>
                          </td>
                          {/* Block info */}
                          <td className="adm-td" style={{ fontSize:11, maxWidth:170 }}>
                            {u.restriction==="temp_block" && u.blocked_until ? (
                              <div>
                                <span style={{ fontWeight:600, color:"#d97706" }}>⏱ {timeLeft(u.blocked_until)} left</span>
                                {u.block_reason && <p style={{ margin:"2px 0 0", fontSize:10, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.block_reason}</p>}
                              </div>
                            ) : u.restriction==="perm_block" ? (
                              <div>
                                <span style={{ fontWeight:600, color:"#dc2626" }}>Permanent</span>
                                {u.block_reason && <p style={{ margin:"2px 0 0", fontSize:10, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.block_reason}</p>}
                              </div>
                            ) : <span style={{ color:"#cbd5e1" }}>—</span>}
                          </td>
                          {/* Joined */}
                          <td className="adm-td" style={{ fontSize:11, color:"#94a3b8", whiteSpace:"nowrap" }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                          </td>
                          {/* Actions */}
                          <td className="adm-td">
                            <div style={{ display:"flex", gap:5 }}>
                              <button className="adm-btn" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => setModal({ kind:"edit", user:u })}>Edit</button>
                              <button className={`adm-btn ${u.restriction!=="none"?"warn":""}`} style={{ padding:"4px 10px", fontSize:10 }} onClick={() => setModal({ kind:"restrict", user:u })}>
                                {u.restriction!=="none" ? "⚠ Blocked" : "🔒 Block"}
                              </button>
                              <button className="adm-btn danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => setModal({ kind:"delete", user:u })}>Del</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length===0 && !loadingUsers && (
                      <tr><td colSpan={8} style={{ padding:"40px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
                        {users.length===0 ? "No users found in database — check /admin/users API endpoint" : "No users match your filters"}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ LOGS ══ */}
          {activeTab === "logs" && (
            <div className="adm-card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>📋</div>
                  <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:"#0f172a" }}>Audit Log</h2>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {["All","Scan","Login","Export","Alert"].map(f => (
                    <button key={f} className="adm-btn" style={{ padding:"4px 12px", fontSize:11, background:logFilter===f?"#f0fdfa":undefined, borderColor:logFilter===f?"#0d9488":undefined, color:logFilter===f?"#0d9488":undefined }}
                      onClick={() => setLogFilter(f)}>{f}</button>
                  ))}
                </div>
              </div>
              {loadingActivity
                ? <div style={{ display:"flex", justifyContent:"center", padding:"36px 0" }}><Spinner /></div>
                : (
                  <div style={{ background:"#f8fafc", borderRadius:14, border:"1px solid #e2e8f0", maxHeight:540, overflowY:"auto" }}>
                    {filteredActivity.length===0
                      ? <p style={{ textAlign:"center", color:"#94a3b8", padding:"36px 0", fontSize:13 }}>No events</p>
                      : filteredActivity.map((item,i) => {
                          const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.scan;
                          const ts = item.time?.includes("ago") ? new Date(Date.now()-i*90000).toLocaleString() : item.time;
                          return (
                            <div key={`${item.id}-${i}`} style={{ display:"flex", gap:14, alignItems:"center", borderBottom:"1px solid #f1f5f9", padding:"11px 18px", transition:"background .1s" }}
                              onMouseEnter={e => (e.currentTarget.style.background="#fff")}
                              onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                              <div style={{ width:28, height:28, borderRadius:8, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:cfg.color, flexShrink:0 }}>{cfg.icon}</div>
                              <span style={{ color:"#94a3b8", fontSize:11, minWidth:155, flexShrink:0 }}>{ts}</span>
                              <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:100, background:cfg.bg, color:cfg.color, flexShrink:0 }}>{item.type.toUpperCase()}</span>
                              <span style={{ color:"#374151", fontSize:12, fontWeight:500, flex:1 }}>{item.action}</span>
                              <span style={{ color:"#94a3b8", fontSize:11, marginLeft:"auto", flexShrink:0 }}>{item.user}</span>
                            </div>
                          );
                        })
                    }
                  </div>
                )
              }
            </div>
          )}
        </div>

        {/* ══ MODALS ══ */}
        {modal.kind==="add" && (
          <Modal onClose={() => setModal({ kind:"none" })}>
            <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:24 }}>➕ Add New User</h3>
            <UserForm initial={{}} onSubmit={handleAddUser} onClose={() => setModal({ kind:"none" })} loading={mutating} />
          </Modal>
        )}

        {modal.kind==="edit" && (
          <Modal onClose={() => setModal({ kind:"none" })}>
            <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:24 }}>✏️ Edit — {displayName(modal.user)}</h3>
            <UserForm initial={modal.user} onSubmit={handleEditUser} onClose={() => setModal({ kind:"none" })} loading={mutating} />
          </Modal>
        )}

        {modal.kind==="view" && (
          <Modal onClose={() => setModal({ kind:"none" })}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
              <div style={{ width:52, height:52, borderRadius:14, background:"linear-gradient(135deg,#0d9488,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:22 }}>
                {displayName(modal.user).charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>{displayName(modal.user)}</h3>
                <p style={{ margin:"3px 0 0", fontSize:12, color:"#64748b" }}>{modal.user.email}</p>
              </div>
            </div>
            {[
              { l:"User ID",       v:`#${modal.user.id}` },
              { l:"Email",         v:modal.user.email },
              { l:"Username",      v:modal.user.username ?? "—" },
              { l:"Phone",         v:modal.user.phone_number ?? "—" },
              { l:"Role",          v:modal.user.role },
              { l:"Restriction",   v:RESTRICTION_CFG[modal.user.restriction].label },
              { l:"Block Reason",  v:modal.user.block_reason ?? "—" },
              { l:"Blocked Until", v:modal.user.blocked_until ? new Date(modal.user.blocked_until).toLocaleString() : "—" },
              { l:"Joined",        v:modal.user.created_at ? new Date(modal.user.created_at).toLocaleString() : "—" },
            ].map(row => (
              <div key={row.l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f1f5f9" }}>
                <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:.5 }}>{row.l}</span>
                <span style={{ fontSize:12, color:"#0f172a", fontWeight:700, maxWidth:280, textAlign:"right" }}>{row.v}</span>
              </div>
            ))}
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button className="adm-btn" style={{ flex:1, justifyContent:"center" }} onClick={() => setModal({ kind:"edit", user:modal.user })}>Edit</button>
              <button className="adm-btn warn" style={{ flex:1, justifyContent:"center" }} onClick={() => setModal({ kind:"restrict", user:modal.user })}>🔒 Restrict</button>
              <button className="adm-btn danger" style={{ flex:1, justifyContent:"center" }} onClick={() => setModal({ kind:"delete", user:modal.user })}>Remove</button>
            </div>
          </Modal>
        )}

        {modal.kind==="restrict" && (
          <Modal onClose={() => setModal({ kind:"none" })} width={520}>
            <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:20 }}>🔒 Manage Access — {displayName(modal.user)}</h3>
            <RestrictModal user={modal.user} onClose={() => setModal({ kind:"none" })} onApply={handleApplyRestriction} loading={mutating} />
          </Modal>
        )}

        {modal.kind==="delete" && (
          <Modal onClose={() => setModal({ kind:"none" })}>
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ width:56, height:56, borderRadius:16, background:"#fef2f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, margin:"0 auto 16px" }}>🗑️</div>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:6 }}>Remove User</h3>
              <p style={{ fontSize:13, color:"#64748b", margin:0 }}>This will DELETE the row from your MySQL users table.</p>
            </div>
            <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:14, padding:"16px 18px", marginBottom:24 }}>
              <p style={{ margin:0, fontWeight:700, color:"#0f172a", fontSize:14 }}>#{modal.user.id} · {displayName(modal.user)}</p>
              <p style={{ margin:"4px 0 0", fontSize:12, color:"#64748b" }}>{modal.user.email} · {modal.user.role}</p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal({ kind:"none" })} style={{ flex:1, padding:"11px 0", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>Cancel</button>
              <button onClick={handleDeleteUser} disabled={mutating} style={{ flex:2, padding:"11px 0", borderRadius:10, background:mutating?"#f8fafc":"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none", color:mutating?"#94a3b8":"#fff", cursor:mutating?"not-allowed":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700 }}>
                {mutating ? "Deleting…" : "Delete from Database"}
              </button>
            </div>
          </Modal>
        )}

        <ToastList toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      </div>
    </>
  );
}