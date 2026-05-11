import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Certification = { name: string; provider: string; level: string };

export type SkillSuggestionsData = {
  missing_technical: string[];
  trending: string[];
  soft_skills: string[];
  certifications: Certification[];
  role_gap_analysis: string;
  source?: "llm" | "nlp_fallback";
};

// ── Config ────────────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { dot: string; badge: string; bar: string; pct: number }> = {
  Beginner:     { dot: "bg-sky-400",    badge: "text-sky-600 bg-sky-50 border-sky-200",      bar: "bg-sky-400",    pct: 33  },
  Intermediate: { dot: "bg-amber-400",  badge: "text-amber-600 bg-amber-50 border-amber-200", bar: "bg-amber-400",  pct: 66  },
  Advanced:     { dot: "bg-violet-500", badge: "text-violet-600 bg-violet-50 border-violet-200", bar: "bg-violet-500", pct: 100 },
};

const CERT_ICONS: Record<string, string> = {
  "Amazon Web Services": "☁️", "Google Cloud": "🌐", "CNCF": "⚙️",
  "Scrum Alliance": "🔄", "HashiCorp": "🏗️", "Oracle": "🗄️", "Microsoft": "🪟", default: "🎓",
};

// ── Tiny reusable atoms ───────────────────────────────────────────────────────
function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all
        ${ok ? "bg-green-50 border-green-200 text-green-600" : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300"}`}
    >
      {ok ? "✓" : "⎘"} {ok ? "Copied" : label}
    </button>
  );
}

function Chip({ label, active, color, onToggle, index }: {
  label: string; active: boolean; color: string; onToggle: () => void; index: number;
}) {
  return (
    <button
      onClick={onToggle}
      style={{ animationDelay: `${index * 0.04}s` }}
      className={`chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        border transition-all duration-150 select-none
        ${active
          ? `${color} shadow-sm scale-[1.02]`
          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300 hover:shadow-sm"
        }`}
    >
      {active && <span className="text-[9px] font-black">✓</span>}
      {label}
    </button>
  );
}

function SectionLabel({ icon, title, count, accent }: {
  icon: string; title: string; count: number; accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className={`text-sm ${accent}`}>{icon}</span>
      <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">{title}</span>
      <span className="ml-auto text-xs text-slate-300 font-medium">{count}</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="px-8 py-14 text-center max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-2xl mx-auto mb-5">
          🧠
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold tracking-wide mb-4">
          PHASE 2 — GENERATIVE AI MODULE
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">No analysis yet</h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-8">
          Complete Phase 1 first — upload your resume from the Dashboard to get your ATS score,
          then click <strong className="text-teal-600 font-semibold">Generate Skill Gap Analysis</strong> above.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
          {[
            { n: "01", icon: "📄", label: "Upload Resume",    sub: "PDF or DOCX",                phase: 1 },
            { n: "02", icon: "🔍", label: "ATS Scoring",      sub: "NLP keyword analysis",        phase: 1 },
            { n: "03", icon: "⚙️", label: "Run LLM Analysis", sub: "Click Generate above",        phase: 2 },
            { n: "04", icon: "⚡", label: "View Skill Gaps",  sub: "Results appear here",         phase: 2 },
          ].map(s => (
            <div key={s.n}
              className={`p-3 rounded-xl border text-center
                ${s.phase === 2 ? "bg-teal-50 border-teal-100" : "bg-slate-50 border-slate-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-300">{s.n}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                  ${s.phase === 2 ? "bg-teal-100 text-teal-600" : "bg-slate-100 text-slate-400"}`}>
                  P{s.phase}
                </span>
              </div>
              <div className="text-lg mb-1">{s.icon}</div>
              <p className="text-[11px] font-bold text-slate-700">{s.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SkillSuggestions({ apiData }: { apiData?: SkillSuggestionsData | null }) {

  const [basket,       setBasket]       = useState<Set<string>>(new Set());
  const [tab,          setTab]          = useState<"technical"|"trending"|"soft"|"certs">("technical");
  const [search,       setSearch]       = useState("");
  const [openCert,     setOpenCert]     = useState<number | null>(null);
  const [exportFlash,  setExportFlash]  = useState(false);
  const [savedSets,    setSavedSets]    = useState<{ label: string; skills: string[]; date: string }[]>([]);
  const [saveLabel,    setSaveLabel]    = useState("");
  const [showSave,     setShowSave]     = useState(false);

  if (!apiData) return <EmptyState />;

  const d = apiData;
  const allSkills = [...(d.missing_technical||[]), ...(d.trending||[]), ...(d.soft_skills||[])];

  const tabSkills: Record<string, string[]> = {
    technical: d.missing_technical || [],
    trending:  d.trending          || [],
    soft:      d.soft_skills       || [],
  };

  const visibleSkills = tab === "certs" ? [] : (
    search
      ? (tabSkills[tab]||[]).filter(s => s.toLowerCase().includes(search.toLowerCase()))
      : (tabSkills[tab]||[])
  );

  const toggle   = (s: string) => setBasket(p => { const n = new Set(p); n.has(s)?n.delete(s):n.add(s); return n; });
  const addAll   = (skills: string[]) => setBasket(p => { const n = new Set(p); skills.forEach(s=>n.add(s)); return n; });
  const doExport = () => { navigator.clipboard.writeText([...basket].join(", ")); setExportFlash(true); setTimeout(()=>setExportFlash(false),2000); };
  const doSave   = () => {
    if (!saveLabel.trim()) return;
    setSavedSets(p=>[...p,{ label:saveLabel, skills:[...basket], date:new Date().toLocaleDateString() }]);
    setShowSave(false); setSaveLabel("");
  };

  const gap      = Math.max(10, 100 - Math.round((basket.size / Math.max(allSkills.length,1)) * 80));
  const readiness = Math.min(95, 20  + Math.round((basket.size / Math.max(allSkills.length,1)) * 75));

  const chipColor = (s: string) =>
    (d.trending||[]).includes(s)    ? "bg-violet-100 border-violet-300 text-violet-700" :
    (d.soft_skills||[]).includes(s) ? "bg-teal-100 border-teal-300 text-teal-700"       :
                                      "bg-sky-100 border-sky-300 text-sky-700";

  const TABS = [
    { id: "technical", label: "Technical",   count: (d.missing_technical||[]).length, accent: "text-sky-500"    },
    { id: "trending",  label: "Trending",    count: (d.trending||[]).length,          accent: "text-violet-500" },
    { id: "soft",      label: "Soft Skills", count: (d.soft_skills||[]).length,       accent: "text-teal-500"   },
    { id: "certs",     label: "Certs",       count: (d.certifications||[]).length,    accent: "text-amber-500"  },
  ] as const;

  // Ring SVG
  const Ring = ({ pct, color, size=56 }: { pct:number; color:string; size?:number }) => {
    const r = size/2 - 5, circ = 2*Math.PI*r;
    return (
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1s ease"}}/>
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes chipIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .chip { animation: chipIn 0.3s ease both; }
      `}</style>

      {/* ── NLP fallback warning ─────────────────────────────────────────────── */}
      {d.source === "nlp_fallback" && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-amber-500 text-sm mt-0.5 shrink-0">⚠</span>
          <div>
            <p className="text-xs font-bold text-amber-700">LLM temporarily unavailable — NLP fallback active</p>
            <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
              Results are based on spaCy + SentenceTransformers analysis of your resume.
              The LLM (LLaMA / Mistral) will be used automatically on your next re-run.
            </p>
          </div>
        </div>
      )}

      {/* ══ TOP BAND: summary metrics ═══════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">

          {/* Title */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-indigo-400 tracking-[0.15em] uppercase">Phase 2 · Generative AI</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 leading-tight">Skill Gap Analysis</h2>
            <p className="text-xs text-slate-400 mt-0.5">LLaMA · Mistral · GPT via SentenceTransformers</p>
          </div>

          {/* Metric pills */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { icon:"🔧", val:(d.missing_technical||[]).length, label:"Missing",   cls:"text-sky-600 bg-sky-50 border-sky-100"       },
              { icon:"📈", val:(d.trending||[]).length,          label:"Trending",  cls:"text-violet-600 bg-violet-50 border-violet-100"},
              { icon:"🤝", val:(d.soft_skills||[]).length,       label:"Soft",      cls:"text-teal-600 bg-teal-50 border-teal-100"      },
              { icon:"🏆", val:(d.certifications||[]).length,    label:"Certs",     cls:"text-amber-600 bg-amber-50 border-amber-100"   },
            ].map((m,i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${m.cls}`}>
                <span>{m.icon}</span>
                <span className="text-base font-bold">{m.val}</span>
                <span className="opacity-60 font-medium">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Readiness */}
          <div className="flex items-center gap-4 pl-4 border-l border-slate-100">
            <div className="relative flex items-center justify-center">
              <Ring pct={readiness} color="#14b8a6" />
              <span className="absolute text-[11px] font-black text-slate-700"
                style={{transform:"none"}}>{readiness}%</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Readiness</p>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">{basket.size} / {allSkills.length} added</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id as any); setSearch(""); }}
              className={`flex-1 py-3.5 text-xs font-bold tracking-wide transition-all border-b-2 -mb-px
                ${tab === t.id
                  ? `border-teal-500 text-teal-600 bg-teal-50/50`
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                }`}>
              <span className={t.accent}>{["🔧","📈","🤝","🏆"][["technical","trending","soft","certs"].indexOf(t.id)]}</span>
              <span className="ml-1.5">{t.label}</span>
              <span className="ml-1 opacity-50">({t.count})</span>
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* Search — only for skill tabs */}
          {tab !== "certs" && (
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs">🔍</span>
              <input
                type="text" placeholder={`Search ${tab} skills…`}
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm
                  text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-300
                  focus:border-teal-300 transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs">✕</button>
              )}
            </div>
          )}

          {/* ── Skills panel ── */}
          {tab !== "certs" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-slate-400">
                  {search
                    ? <><strong className="text-slate-600">{visibleSkills.length}</strong> results for "<em>{search}</em>"</>
                    : <><strong className="text-slate-600">{visibleSkills.length}</strong> skills</>
                  }
                </p>
                <div className="flex gap-2">
                  <button onClick={() => addAll(visibleSkills)}
                    className="text-[11px] font-bold text-teal-600 hover:text-teal-700 px-2.5 py-1
                      rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors">
                    + Add all
                  </button>
                  <CopyBtn text={visibleSkills.join(", ")} label="Copy list" />
                </div>
              </div>

              {visibleSkills.length === 0
                ? (
                  <div className="py-12 text-center text-slate-300 text-sm">
                    {search ? `No skills match "${search}"` : "No skills in this category"}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {visibleSkills.map((s, i) => (
                      <Chip key={s} label={s} index={i}
                        active={basket.has(s)} color={chipColor(s)}
                        onToggle={() => toggle(s)} />
                    ))}
                  </div>
                )
              }
            </>
          )}

          {/* ── Certifications panel ── */}
          {tab === "certs" && (
            <div className="divide-y divide-slate-50">
              {(d.certifications||[]).length === 0 && (
                <p className="py-10 text-center text-slate-300 text-sm">No certifications returned</p>
              )}
              {(d.certifications||[]).map((cert, i) => {
                const cfg  = LEVEL_CONFIG[cert.level] || LEVEL_CONFIG["Intermediate"];
                const icon = CERT_ICONS[cert.provider] || CERT_ICONS["default"];
                const open = openCert === i;
                return (
                  <div key={i} className="py-4 first:pt-0 last:pb-0">
                    <div
                      className="flex items-center gap-4 cursor-pointer group"
                      onClick={() => setOpenCert(open ? null : i)}
                    >
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-lg shrink-0 group-hover:border-slate-200 transition-colors">
                        {icon}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-700">{cert.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.badge}`}>
                            {cert.level}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{cert.provider}</p>
                        {/* Level bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${cfg.bar} transition-all duration-700`}
                              style={{ width: `${cfg.pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-300 font-medium">{cfg.pct}%</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        <CopyBtn text={cert.name} />
                        <span className={`text-slate-300 text-xs transition-transform duration-200 ${open?"rotate-90":""}`}>›</span>
                      </div>
                    </div>

                    {/* Expanded */}
                    {open && (
                      <div className="mt-3 ml-14 p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-500 leading-relaxed mb-2">
                          The <strong className="text-slate-700">{cert.name}</strong> from {cert.provider} demonstrates
                          {cert.level === "Advanced" ? " expert-level" : cert.level === "Intermediate" ? " solid professional" : " foundational"} expertise —
                          highly valued by recruiters and a proven ATS score booster.
                        </p>
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(cert.name + " certification")}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                          Learn more ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ ROLE GAP ANALYSIS ════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-6 flex-wrap">
          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black text-slate-400 tracking-[0.12em] uppercase">LLM Role Gap Analysis</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-500 text-[9px] font-black tracking-wide">PHASE 2</span>
              <span className="text-[10px] text-slate-300">· GPT / LLaMA / Mistral</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{d.role_gap_analysis}</p>
            <div className="mt-4">
              <CopyBtn text={d.role_gap_analysis} label="Copy analysis" />
            </div>
          </div>

          {/* Gap + Readiness rings */}
          <div className="flex gap-6 shrink-0">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center">
                <Ring pct={gap} color="#f87171" size={64} />
                <span className="absolute text-[11px] font-black text-slate-700">{gap}%</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wide">Gap</p>
            </div>
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center">
                <Ring pct={readiness} color="#4ade80" size={64} />
                <span className="absolute text-[11px] font-black text-slate-700">{readiness}%</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wide">Ready</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ SKILL BASKET ═════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm">🧺</span>
            <span className="text-sm font-bold text-slate-700">My Skill Basket</span>
            <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full
              bg-teal-500 text-white text-[10px] font-black">
              {basket.size}
            </span>
          </div>

          {basket.size > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowSave(s=>!s)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-teal-200
                  bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors">
                💾 Save set
              </button>
              <button onClick={doExport}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all
                  ${exportFlash
                    ? "border-green-200 bg-green-50 text-green-600"
                    : "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                  }`}>
                {exportFlash ? "✓ Copied!" : "📤 Export"}
              </button>
              <button onClick={() => setBasket(new Set())}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200
                  bg-slate-50 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-colors">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Save input */}
        {showSave && (
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Label this set (e.g. Backend Engineer, Java Role…)"
              value={saveLabel} onChange={e=>setSaveLabel(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doSave()}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm
                text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-all"
            />
            <button onClick={doSave}
              className="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 transition-colors">
              Save
            </button>
          </div>
        )}

        {/* Basket content */}
        {basket.size === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-xl">
            <p className="text-slate-300 text-sm">Click any skill to add it here</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...basket].map((s,i) => (
              <Chip key={s} label={s} index={i} active color={chipColor(s)} onToggle={()=>toggle(s)} />
            ))}
          </div>
        )}

        {/* Saved sets */}
        {savedSets.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-2">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">Saved Sets</p>
            {savedSets.map((set,i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3
                rounded-xl border border-slate-100 bg-slate-50 hover:border-slate-200 transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-700">{set.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{set.skills.length} skills · {set.date}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setBasket(new Set(set.skills))}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-teal-200
                      bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors">
                    Restore
                  </button>
                  <CopyBtn text={set.skills.join(", ")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-400">
        <span className="shrink-0 text-teal-400">💡</span>
        Click any skill chip to add it to your basket, then use
        <strong className="text-teal-600 mx-0.5">Export</strong>
        to copy the full list into your resume's Skills section — improving your ATS score.
      </div>
    </div>
  );
}