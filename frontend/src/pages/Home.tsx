// src/pages/Home.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import UploadResume from "../components/UploadResume";
import {
  AnalyzeResp,
  RoleMatch,
  getAtsScore,
  getSkills,
  getRoleMatches,
} from "../api/aiApi";

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --white:     #ffffff;
      --off:       #f4f5f7;
      --off2:      #eceef2;
      --border:    #e1e3e8;
      --border2:   #eaecf0;
      --ink:       #0c0e14;
      --ink2:      #1a1d2e;
      --muted:     #64748b;
      --muted2:    #94a3b8;
      --teal:      #0d9488;
      --teal-d:    #0f766e;
      --teal-xl:   #f0fdfb;
      --teal-l:    #ccfbf1;
      --teal-m:    #5eead4;
      --indigo:    #4f46e5;
      --indigo-d:  #3730a3;
      --indigo-l:  #eef2ff;
      --indigo-m:  #a5b4fc;
      --violet:    #7c3aed;
      --rose:      #e11d48;
      --amber:     #d97706;
      --green:     #16a34a;
      --red:       #dc2626;
      --sh-xs: 0 1px 3px rgba(0,0,0,0.06);
      --sh-sm: 0 2px 10px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04);
      --sh-md: 0 8px 24px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05);
    }

    html, body {
      height: 100%; overflow: hidden;
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--off); color: var(--ink);
      -webkit-font-smoothing: antialiased;
    }

    .app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    /* ── TOP NAV ── */
    .topnav {
      height: 52px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px;
      background: var(--white); border-bottom: 1px solid var(--border);
      box-shadow: var(--sh-xs); z-index: 20;
    }
    .logo { display: flex; align-items: center; gap: 9px; }
    .logo-mark {
      width: 30px; height: 30px; border-radius: 9px;
      background: linear-gradient(135deg, var(--teal) 0%, var(--indigo) 100%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 14px;
      box-shadow: 0 3px 8px rgba(13,148,136,0.38);
    }
    .logo-name { font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
    .logo-name span { color: var(--teal); }
    .nav-pill {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 13px; border-radius: 100px;
      background: var(--teal-xl); border: 1px solid var(--teal-l);
    }
    .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; animation: pring 2s infinite; }
    @keyframes pring { 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.45);} 70%{box-shadow:0 0 0 6px rgba(16,185,129,0);} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0);} }
    .nav-pill-label { font-size: 11px; font-weight: 600; color: var(--teal-d); }
    .nav-right { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 32px; height: 32px; border-radius: 10px;
      background: linear-gradient(135deg, var(--teal), var(--indigo));
      display: flex; align-items: center; justify-content: center;
      color: white; font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 13px;
    }
    .nav-uname { font-size: 12px; font-weight: 700; color: var(--ink2); text-align: right; line-height: 1.3; }
    .nav-usub  { font-size: 9.5px; color: var(--muted2); text-align: right; }

    /* ── BODY ── */
    .body-grid {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 298px 1fr;
      overflow: hidden;
    }

    /* ── LEFT SIDEBAR ── */
    .sidebar {
      background: var(--white); border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow: hidden; padding: 16px 14px; gap: 10px;
    }

    /* ── RIGHT PANEL ── */
    .right-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--off); }

    /* ── TAB BAR ── */
    .tab-bar {
      flex-shrink: 0; display: flex; align-items: center;
      gap: 0; padding: 0 22px;
      background: var(--white); border-bottom: 1px solid var(--border);
      box-shadow: var(--sh-xs);
    }
    .tab-btn {
      display: flex; align-items: center; gap: 8px;
      padding: 13px 20px 12px; border: none; background: transparent; cursor: pointer;
      font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;
      color: var(--muted); border-bottom: 2.5px solid transparent; margin-bottom: -1px;
      transition: all 0.2s; position: relative; white-space: nowrap;
    }
    .tab-btn:hover:not(.tab-active) { color: var(--ink2); background: var(--off); }
    .tab-active { color: var(--teal) !important; border-bottom-color: var(--teal) !important; }
    .tab-icon-pill {
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 8px; font-size: 13px;
      transition: background 0.2s;
    }
    .tab-icon-u { background: var(--teal-xl); }
    .tab-icon-a { background: var(--indigo-l); }
    .tab-active .tab-icon-u { background: var(--teal-l); }
    .tab-active .tab-icon-a { background: var(--indigo-m); opacity: 0.6; }
    .tab-sub-badge {
      font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 100px;
      background: var(--teal-l); color: var(--teal-d); margin-left: 2px;
    }
    .tab-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); position: absolute; top: 9px; right: 7px; }

    /* ── SCROLL CONTENT ── */
    .tab-scroll {
      flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 18px 22px;
    }
    .tab-scroll::-webkit-scrollbar { width: 4px; }
    .tab-scroll::-webkit-scrollbar-track { background: transparent; }
    .tab-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

    /* ── CARDS ── */
    .card { background: var(--white); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--sh-sm); }
    .p16 { padding: 16px 18px; }

    /* ── LABELS ── */
    .sec-lbl { font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted2); }
    .sec-title { font-family: 'Outfit', sans-serif; font-size: 13.5px; font-weight: 700; color: var(--ink2); }

    /* ── UPLOAD TAB: HERO BANNER ── */
    .hero-banner {
      border-radius: 16px; overflow: hidden; position: relative;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #0f3460 100%);
      padding: 24px 26px; min-height: 130px;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .hero-grid-overlay {
      position: absolute; inset: 0; pointer-events: none;
      background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 28px 28px;
    }
    .hero-glow {
      position: absolute; width: 200px; height: 200px; border-radius: 50%;
      background: radial-gradient(circle, rgba(13,148,136,0.35) 0%, transparent 70%);
      top: -60px; right: -40px; pointer-events: none;
    }
    .hero-glow2 {
      position: absolute; width: 150px; height: 150px; border-radius: 50%;
      background: radial-gradient(circle, rgba(79,70,229,0.3) 0%, transparent 70%);
      bottom: -40px; left: 60px; pointer-events: none;
    }
    .hero-tag {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 100px;
      background: rgba(13,148,136,0.2); border: 1px solid rgba(13,148,136,0.4);
      font-size: 10px; font-weight: 600; color: #5eead4; letter-spacing: 0.05em;
      width: fit-content; margin-bottom: 10px; position: relative; z-index: 1;
    }
    .hero-title {
      font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 900;
      color: white; line-height: 1.2; letter-spacing: -0.02em;
      position: relative; z-index: 1; margin-bottom: 6px;
    }
    .hero-title span {
      background: linear-gradient(90deg, #5eead4, #818cf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .hero-sub {
      font-size: 11px; color: rgba(255,255,255,0.55); line-height: 1.6;
      position: relative; z-index: 1; max-width: 340px;
    }
    .hero-stats {
      display: flex; gap: 20px; position: relative; z-index: 1; margin-top: 14px;
    }
    .hero-stat { display: flex; flex-direction: column; gap: 2px; }
    .hero-stat-num { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 800; color: white; line-height: 1; }
    .hero-stat-lbl { font-size: 9.5px; color: rgba(255,255,255,0.45); font-weight: 500; }
    .hero-stat-div { width: 1px; background: rgba(255,255,255,0.12); align-self: stretch; }

    /* ── STEPS ── */
    .steps-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
    .step-card {
      padding: 14px 13px; border-radius: 13px;
      background: var(--white); border: 1px solid var(--border2);
      display: flex; flex-direction: column; gap: 8px;
      box-shadow: var(--sh-xs); position: relative; overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .step-card:hover { border-color: var(--teal-l); box-shadow: var(--sh-sm); }
    .step-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 13px 13px 0 0; }
    .step-num { font-size: 9px; font-weight: 800; color: var(--muted2); letter-spacing: 0.1em; }
    .step-icon-wrap {
      width: 34px; height: 34px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; font-size: 17px;
    }
    .step-title { font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
    .step-desc  { font-size: 10.5px; color: var(--muted); line-height: 1.6; }

    /* ── WHAT WE ANALYSE ── */
    .analyse-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
    .analyse-chip {
      display: flex; align-items: center; gap: 9px;
      padding: 11px 12px; border-radius: 11px;
      background: var(--off); border: 1px solid var(--border2);
      transition: all 0.2s;
    }
    .analyse-chip:hover { background: var(--white); border-color: var(--border); box-shadow: var(--sh-xs); transform: translateY(-1px); }
    .analyse-chip-icon {
      width: 32px; height: 32px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
      flex-shrink: 0;
    }
    .analyse-chip-label { font-size: 11px; font-weight: 600; color: var(--ink2); line-height: 1.4; }
    .analyse-chip-sub   { font-size: 9.5px; color: var(--muted2); font-weight: 400; }

    /* ── GAUGE + BARS ── */
    .gauge-layout { display: flex; align-items: center; gap: 20px; }
    .bars-col { flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .bar-meta { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .bar-label { font-size: 10.5px; color: var(--muted); font-weight: 500; }
    .bar-pct   { font-size: 10.5px; font-weight: 700; }
    .track { height: 5px; background: var(--off2); border-radius: 100px; overflow: hidden; }
    .fill  { height: 100%; border-radius: 100px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }

    /* ── TWO COL ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    /* ── INFO CHIPS ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 11px; }
    .info-chip {
      padding: 9px 11px; background: var(--off); border: 1px solid var(--border2);
      border-radius: 10px; transition: border-color 0.18s;
    }
    .info-chip:hover { border-color: var(--border); background: var(--white); }
    .chip-lbl { font-size: 9px; font-weight: 700; color: var(--muted2); letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 3px; }
    .chip-val { font-size: 11px; font-weight: 600; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── ROLES ── */
    .roles-col { display: flex; flex-direction: column; gap: 7px; margin-top: 11px; }
    .role-row { padding: 9px 11px; border-radius: 10px; border: 1px solid transparent; }
    .role-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .role-name { font-family: 'Outfit', sans-serif; font-size: 11.5px; font-weight: 700; }
    .role-pct  { font-size: 11px; font-weight: 700; }
    .role-track { height: 4px; background: rgba(0,0,0,0.07); border-radius: 100px; overflow: hidden; }
    .role-fill  { height: 100%; border-radius: 100px; transition: width 0.9s cubic-bezier(0.4,0,0.2,1); }

    /* ── SKILLS ── */
    .skills-wrap { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 11px; }
    .skill-chip {
      padding: 3px 10px; border-radius: 100px; font-size: 10.5px; font-weight: 500;
      background: var(--teal-xl); color: var(--teal-d); border: 1px solid var(--teal-l);
      transition: all 0.18s; cursor: default;
    }
    .skill-chip:hover { background: var(--teal); color: white; transform: translateY(-1px); }

    /* ── CTA ── */
    .cta-btn {
      width: 100%; padding: 13px 20px; border-radius: 12px; border: none;
      background: linear-gradient(135deg, var(--teal-d) 0%, var(--teal) 50%, var(--indigo) 100%);
      color: white; font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 13.5px;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
      box-shadow: 0 4px 18px rgba(13,148,136,0.32); transition: all 0.25s; letter-spacing: 0.01em;
    }
    .cta-btn:hover { transform: translateY(-1.5px); box-shadow: 0 7px 24px rgba(13,148,136,0.42); }

    /* ── SIDEBAR PREVIEW ── */
    .preview-box {
      flex: 1; min-height: 0; display: flex; flex-direction: column;
      border: 1px solid var(--border2); border-radius: 11px; overflow: hidden;
    }
    .preview-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 11px; background: var(--white); border-bottom: 1px solid var(--border2); flex-shrink: 0;
    }
    .preview-fname { font-size: 10.5px; font-weight: 600; color: var(--ink2); max-width: 115px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview-sub   { font-size: 9px; color: var(--muted2); }
    .preview-frame { flex: 1; min-height: 0; overflow: hidden; }
    .preview-frame iframe { width: 100%; height: 100%; border: none; display: block; }
    .save-btn {
      padding: 4px 9px; border-radius: 7px; background: var(--off); border: 1px solid var(--border);
      font-size: 10px; font-weight: 600; color: var(--muted); text-decoration: none; cursor: pointer; transition: all 0.18s;
    }
    .save-btn:hover { background: var(--white); color: var(--ink); }

    /* ── FEATURES ── */
    .feature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
    .feature-tile {
      padding: 11px 6px; background: var(--off); border: 1px solid var(--border2);
      border-radius: 10px; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
    }
    .feature-name { font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 700; color: var(--ink2); }
    .feature-desc { font-size: 9px; color: var(--muted2); }

    /* ── TIPS ── */
    .tips-box { padding: 10px 12px; background: var(--off); border: 1px solid var(--border2); border-radius: 11px; }
    .tips-list { display: flex; flex-direction: column; gap: 5px; margin-top: 7px; }
    .tip-item { display: flex; gap: 6px; font-size: 10.5px; color: var(--muted); line-height: 1.5; }
    .tip-arrow { color: var(--teal); font-weight: 700; flex-shrink: 0; }

    /* ── EMPTY ── */
    .empty-wrap {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; gap: 12px; padding: 52px 24px;
    }
    .empty-icon { width: 56px; height: 56px; border-radius: 18px; background: linear-gradient(135deg, var(--teal-xl), var(--indigo-l)); display: flex; align-items: center; justify-content: center; font-size: 26px; }
    .empty-title { font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 800; color: var(--ink2); }
    .empty-sub   { font-size: 11.5px; color: var(--muted); line-height: 1.75; max-width: 270px; }
    .empty-btn   {
      padding: 9px 22px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, var(--teal), var(--indigo));
      color: white; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 12px;
      cursor: pointer; box-shadow: 0 3px 14px rgba(13,148,136,0.28);
    }

    /* ── SKELETON ── */
    @keyframes shimmer { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }
    .skeleton { background: linear-gradient(90deg,#f0f0ec 25%,#e4e4dc 50%,#f0f0ec 75%); background-size:200% 100%; animation:shimmer 1.8s infinite; border-radius:6px; }

    /* ── FADE ── */
    @keyframes fadeUp { from{opacity:0;transform:translateY(9px);} to{opacity:1;transform:translateY(0);} }
    .fade-up { animation: fadeUp 0.28s ease forwards; }
  `}</style>
);

/* ── ATS Gauge ── */
function ATSGauge({ score }: { score: number }) {
  const r=52, sw=9, cx=70, cy=62;
  const circ=Math.PI*r;
  const color=score>=80?"#16a34a":score>=60?"#d97706":"#dc2626";
  const label=score>=80?"Excellent":score>=60?"Good":"Needs Work";
  const [disp,setDisp]=useState(0);
  useEffect(()=>{
    let v=0; const step=score/50;
    const t=setInterval(()=>{ v+=step; if(v>=score){setDisp(score);clearInterval(t);}else setDisp(Math.round(v)); },16);
    return ()=>clearInterval(t);
  },[score]);
  return (
    <svg width={140} height={86} viewBox="0 0 140 86">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="#f0f0ec" strokeWidth={sw} strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${(disp/100)*circ} ${circ}`}
        style={{transition:"stroke-dasharray 0.05s linear",filter:`drop-shadow(0 0 5px ${color}55)`}}/>
      {[0,25,50,75,100].map(tick=>{
        const a=Math.PI-(tick/100)*Math.PI;
        return <line key={tick}
          x1={cx+(r-5)*Math.cos(a)} y1={cy-(r-5)*Math.sin(a)}
          x2={cx+(r+2)*Math.cos(a)} y2={cy-(r+2)*Math.sin(a)}
          stroke="#d1d5db" strokeWidth={1.5}/>;
      })}
      <text x={cx} y={cy-4}  textAnchor="middle" fontSize={28} fontWeight="800" fill={color} fontFamily="Outfit,sans-serif">{disp}</text>
      <text x={cx} y={cy+10} textAnchor="middle" fontSize={8}   fill="#9ca3af" fontFamily="Plus Jakarta Sans,sans-serif" fontWeight="500">out of 100</text>
      <text x={cx} y={cy+23} textAnchor="middle" fontSize={9.5} fill={color}   fontFamily="Outfit,sans-serif" fontWeight="700">{label}</text>
    </svg>
  );
}

/* ── PDF Preview ── */
function PdfPreview({ url, fileName }: { url:string; fileName:string }) {
  return (
    <div className="preview-box">
      <div className="preview-hdr">
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:24,height:24,borderRadius:7,background:"#fff1f2",border:"1px solid #fecaca",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>📄</div>
          <div><p className="preview-fname">{fileName}</p><p className="preview-sub">PDF Preview</p></div>
        </div>
        <a href={url} download={fileName} className="save-btn">⬇ Save</a>
      </div>
      <div className="preview-frame">
        <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=1`} title="Resume PDF"/>
      </div>
    </div>
  );
}

/* ── DOCX Preview ── */
function DocxPreview({ file }: { file:File }) {
  const [html,setHtml]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState(false);
  useEffect(()=>{
    let c=false; setLoading(true); setError(false); setHtml("");
    (async()=>{ try{ const m=await import("mammoth"); const ab=await file.arrayBuffer(); const r=await m.convertToHtml({arrayBuffer:ab}); if(!c){setHtml(r.value);setLoading(false);} }catch{ if(!c){setError(true);setLoading(false);} } })();
    return ()=>{ c=true; };
  },[file]);
  return (
    <div className="preview-box">
      <div className="preview-hdr">
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:24,height:24,borderRadius:7,background:"#eef2ff",border:"1px solid #c7d2fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>📝</div>
          <div><p className="preview-fname">{file.name}</p><p className="preview-sub">DOCX Preview</p></div>
        </div>
      </div>
      <div style={{flex:1,minHeight:0,overflowY:"auto",background:"white"}}>
        {loading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8,color:"#94a3b8"}}><div style={{width:22,height:22,borderRadius:"50%",border:"3px solid #e2e8f0",borderTop:"3px solid #0d9488"}}/><p style={{fontSize:11}}>Converting…</p></div>}
        {error&&!loading&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:11,color:"#dc2626",gap:5}}>⚠️ Failed to render</div>}
        {!loading&&!error&&<div style={{padding:"12px 16px",color:"#1a1d2e",fontFamily:"Plus Jakarta Sans,sans-serif",fontSize:11,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:html}}/>}
      </div>
    </div>
  );
}

function ResumePreview({ file, pdfUrl }: { file:File; pdfUrl:string|null }) {
  if(file.type==="application/pdf"&&pdfUrl) return <PdfPreview url={pdfUrl} fileName={file.name}/>;
  if(file.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"||file.name.toLowerCase().endsWith(".docx")) return <DocxPreview file={file}/>;
  return null;
}

/* ── Roles ── */
function SuggestedRoles({ roleMatches }: { roleMatches: RoleMatch[] }) {
  const C=[
    {bar:"#0d9488",text:"#0f766e",bg:"#f0fdfb",border:"#99f6e4"},
    {bar:"#4f46e5",text:"#3730a3",bg:"#eef2ff",border:"#c7d2fe"},
    {bar:"#d97706",text:"#b45309",bg:"#fffbeb",border:"#fde68a"},
  ];
  if(!roleMatches.length) return (
    <>
      <p className="sec-lbl">🎯 Role Matches</p>
      <div className="roles-col">
        {[1,2,3].map(i=><div key={i} style={{padding:"9px 11px",borderRadius:10,background:"#f5f5f0",border:"1px solid #e8e8e2"}}><div className="skeleton" style={{height:9,width:"55%",marginBottom:6}}/><div style={{height:4,background:"#ebebeb",borderRadius:100}}><div className="skeleton" style={{height:"100%",width:`${20+i*18}%`}}/></div></div>)}
      </div>
    </>
  );
  return (
    <>
      <p className="sec-lbl">🎯 Role Matches</p>
      <div className="roles-col">
        {roleMatches.map((rm,idx)=>{ const c=C[idx%C.length]; return (
          <div key={rm.role} className="role-row" style={{background:c.bg,borderColor:c.border}}>
            <div className="role-head">
              <span className="role-name" style={{color:c.text}}>{rm.role}</span>
              <span className="role-pct"  style={{color:c.text}}>{rm.percentage}%</span>
            </div>
            <div className="role-track"><div className="role-fill" style={{width:`${rm.percentage}%`,background:c.bar}}/></div>
          </div>
        ); })}
      </div>
    </>
  );
}

function InfoChip({ icon, label, value, span2 }: { icon:string; label:string; value:string; span2?:boolean }) {
  return (
    <div className="info-chip" style={span2?{gridColumn:"span 2"}:{}}>
      <p className="chip-lbl">{icon} {label}</p>
      <p className="chip-val">{value}</p>
    </div>
  );
}

/* ── MAIN ── */
export default function Home() {
  const [activeTab,setActiveTab]=useState<"upload"|"analyze">("upload");
  const [result,setResult]=useState<AnalyzeResp|null>(null);
  const [username,setUsername]=useState("");
  const [selectedFile,setSelectedFile]=useState<File|null>(null);
  const [pdfUrl,setPdfUrl]=useState<string|null>(null);
  const pdfUrlRef=useRef<string|null>(null);
  const nav=useNavigate();

  useEffect(()=>{
    const stored=localStorage.getItem("resumeResult");
    if(stored){try{setResult(JSON.parse(stored));}catch{}}
    const su=localStorage.getItem("username")||localStorage.getItem("user")||sessionStorage.getItem("username")||sessionStorage.getItem("user")||"";
    try{const p=JSON.parse(su);setUsername(p?.name||p?.username||p?.email?.split("@")[0]||"");}catch{setUsername(su);}
    return()=>{if(pdfUrlRef.current){URL.revokeObjectURL(pdfUrlRef.current);pdfUrlRef.current=null;}};
  },[]);

  const handleSetResult=(data:AnalyzeResp|null)=>{
    if(data){localStorage.setItem("resumeResult",JSON.stringify(data));setActiveTab("analyze");}
    else{localStorage.removeItem("resumeResult");if(pdfUrlRef.current){URL.revokeObjectURL(pdfUrlRef.current);pdfUrlRef.current=null;}setPdfUrl(null);setSelectedFile(null);}
    setResult(data);
  };
  const handleFileSelected=(file:File)=>{
    if(pdfUrlRef.current){URL.revokeObjectURL(pdfUrlRef.current);pdfUrlRef.current=null;}
    setSelectedFile(file);
    if(file.type==="application/pdf"){const url=URL.createObjectURL(file);pdfUrlRef.current=url;setPdfUrl(url);}else setPdfUrl(null);
  };

  const atsScore=getAtsScore(result);
  const skills=getSkills(result);
  const profile=result?.ai_data?.profile;
  const education=result?.ai_data?.education;
  const quickTips=atsScore>=80
    ?["Resume is ATS-ready!","Tailor to specific job descriptions","Add your LinkedIn URL"]
    :atsScore>=60
    ?["Add more technical skills","Quantify your project outcomes","Include certifications"]
    :["Add a dedicated skills section","Include project experience","Ensure email & phone present"];
  const scoreBorder=atsScore>=80?"#bbf7d0":atsScore>=60?"#fde68a":"#fecaca";
  const scoreBg=atsScore>=80?"linear-gradient(145deg,#f0fdf4,#fff)":atsScore>=60?"linear-gradient(145deg,#fffbeb,#fff)":"linear-gradient(145deg,#fef2f2,#fff)";

  const ANALYSE_ITEMS=[
    {icon:"🎯",label:"ATS Score",sub:"Compatibility check",bg:"#f0fdfb",ibg:"#ccfbf1"},
    {icon:"💡",label:"60+ Skills",sub:"Technical detection",bg:"#fefce8",ibg:"#fef08a"},
    {icon:"🔍",label:"Role Match",sub:"8 categories",bg:"#eef2ff",ibg:"#c7d2fe"},
    {icon:"📧",label:"Contact Info",sub:"Auto extraction",bg:"#fff1f2",ibg:"#fecaca"},
    {icon:"🎓",label:"Education",sub:"Degree & CGPA",bg:"#fdf4ff",ibg:"#e9d5ff"},
    {icon:"📈",label:"Strengths",sub:"Metric scoring",bg:"#f0fdf4",ibg:"#bbf7d0"},
  ];

  return (
    <div className="app">
      <GlobalStyles/>

      {/* ── NAV ── */}
      <nav className="topnav">
        <div className="logo">
          <div className="logo-mark">✦</div>
          <span className="logo-name">Resume<span>AI</span></span>
        </div>
        <div className="nav-pill">
          <div className="pulse-dot"/>
          <span className="nav-pill-label">AI Engine Active</span>
        </div>
        <div className="nav-right">
          <div>
            <p className="nav-uname">{username||"User"}</p>
            <p className="nav-usub">Resume Dashboard</p>
          </div>
          <div className="avatar">{username?username.charAt(0).toUpperCase():"U"}</div>
        </div>
      </nav>

      {/* ── BODY ── */}
      <div className="body-grid">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="sidebar">
          <div style={{flexShrink:0}}>
            <p className="sec-lbl" style={{marginBottom:4}}>📄 Upload Resume</p>
            <p style={{fontSize:10,color:"var(--muted2)",lineHeight:1.6}}>PDF or DOCX · Max 10 MB · AI analysis</p>
          </div>
          <div style={{flexShrink:0}}>
            <UploadResume setResult={handleSetResult} onFileSelected={handleFileSelected}/>
          </div>
          {selectedFile ? (
            <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
              <ResumePreview file={selectedFile} pdfUrl={pdfUrl}/>
            </div>
          ) : (
            <div style={{flexShrink:0}}>
              <div className="feature-grid">
                {[{icon:"🎯",label:"ATS Score",desc:"Instant"},{icon:"💡",label:"Skills",desc:"60+ detected"},{icon:"🔍",label:"Roles",desc:"8 categories"}].map(({icon,label,desc})=>(
                  <div key={label} className="feature-tile">
                    <span style={{fontSize:20}}>{icon}</span>
                    <span className="feature-name">{label}</span>
                    <span className="feature-desc">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result&&(
            <div style={{flexShrink:0}}>
              <div className="tips-box">
                <p className="sec-lbl">⚡ Quick Tips</p>
                <div className="tips-list">
                  {quickTips.map((tip,i)=>(
                    <div key={i} className="tip-item"><span className="tip-arrow">→</span>{tip}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ── RIGHT PANEL ── */}
        <div className="right-panel">

          {/* Tab Bar */}
          <div className="tab-bar">
            <button className={`tab-btn${activeTab==="upload"?" tab-active":""}`} onClick={()=>setActiveTab("upload")}>
              <div className="tab-icon-pill tab-icon-u">📄</div>
              Upload
              <span style={{fontSize:10,color:"var(--muted2)",fontWeight:500}}>PDF · DOCX</span>
              {selectedFile&&activeTab!=="upload"&&<div className="tab-dot"/>}
            </button>
            <button className={`tab-btn${activeTab==="analyze"?" tab-active":""}`} onClick={()=>setActiveTab("analyze")}>
              <div className="tab-icon-pill tab-icon-a">📊</div>
              Analysis
              {result&&<span className="tab-sub-badge">ATS {atsScore}/100</span>}
              {result&&activeTab!=="analyze"&&<div className="tab-dot"/>}
            </button>
          </div>

          {/* Scroll Area */}
          <div className="tab-scroll">

            {/* ═══ UPLOAD TAB ═══ */}
            {activeTab==="upload"&&(
              <div className="fade-up" style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* Hero banner
                <div className="hero-banner">
                  <div className="hero-grid-overlay"/>
                  <div className="hero-glow"/>
                  <div className="hero-glow2"/>
                  <div>
                    <div className="hero-tag">
                      <span style={{fontSize:8}}>✦</span> Gen AI–Powered Platform
                    </div>
                    <p className="hero-title">
                      Land your dream job<br/>with <span>smarter resume</span> tools
                    </p>
                    <p className="hero-sub">
                      Upload your resume and get instant ATS scoring, role match analysis, and AI-powered improvement suggestions.
                    </p>
                  </div>
                  <div className="hero-stats">
                    <div className="hero-stat">
                      <span className="hero-stat-num">98%</span>
                      <span className="hero-stat-lbl">Accuracy</span>
                    </div>
                    <div className="hero-stat-div"/>
                    <div className="hero-stat">
                      <span className="hero-stat-num">60+</span>
                      <span className="hero-stat-lbl">Skills Detected</span>
                    </div>
                    <div className="hero-stat-div"/>
                    <div className="hero-stat">
                      <span className="hero-stat-num">8</span>
                      <span className="hero-stat-lbl">Role Categories</span>
                    </div>
                    <div className="hero-stat-div"/>
                    <div className="hero-stat">
                      <span className="hero-stat-num">&lt;10s</span>
                      <span className="hero-stat-lbl">Analysis Time</span>
                    </div>
                  </div>
                </div> */}

                {/* Steps */}
                {/* <div>
                  <p className="sec-title" style={{marginBottom:10}}>How it works</p>
                  <div className="steps-row">
                    {[
                      {num:"01",icon:"📤",title:"Upload",desc:"Drop your PDF or DOCX resume in the left panel",accent:"linear-gradient(90deg,#0d9488,#5eead4)",ibg:"#f0fdfb"},
                      {num:"02",icon:"🤖",title:"Analyse",desc:"AI engine scores your resume against ATS rules instantly",accent:"linear-gradient(90deg,#4f46e5,#818cf8)",ibg:"#eef2ff"},
                      {num:"03",icon:"🚀",title:"Enhance",desc:"Get role matches, skill gaps and one-click AI enhancement",accent:"linear-gradient(90deg,#7c3aed,#c084fc)",ibg:"#fdf4ff"},
                    ].map(({num,icon,title,desc,accent,ibg})=>(
                      <div key={num} className="step-card">
                        <div className="step-accent" style={{background:accent}}/>
                        <span className="step-num">{num}</span>
                        <div className="step-icon-wrap" style={{background:ibg}}>
                          <span style={{fontSize:18}}>{icon}</span>
                        </div>
                        <p className="step-title">{title}</p>
                        <p className="step-desc">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div> */}

                {/* What we analyse */}
                <div>
                  <p className="sec-title" style={{marginBottom:10}}>What we analyse</p>
                  <div className="analyse-grid">
                    {ANALYSE_ITEMS.map(({icon,label,sub,bg,ibg})=>(
                      <div key={label} className="analyse-chip" style={{background:bg}}>
                        <div className="analyse-chip-icon" style={{background:ibg}}>
                          {icon}
                        </div>
                        <div>
                          <p className="analyse-chip-label">{label}</p>
                          <p className="analyse-chip-sub">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ═══ ANALYSIS TAB ═══ */}
            {activeTab==="analyze"&&(
              <div className="fade-up" style={{display:"flex",flexDirection:"column",gap:12}}>
                {result ? (
                  <>
                    {/* ATS Score */}
                    <div className="card p16" style={{border:`1px solid ${scoreBorder}`,background:scoreBg}}>
                      <p className="sec-lbl" style={{marginBottom:12}}>📊 ATS Analysis</p>
                      <div className="gauge-layout">
                        <div style={{flexShrink:0}}>
                          <ATSGauge score={atsScore}/>
                        </div>
                        <div className="bars-col">
                          {[
                            {label:"Skills Coverage",    pct:Math.min(skills.length*10,100)},
                            {label:"Profile Completeness",pct:[profile?.email,profile?.phone,education?.degree,education?.cgpa].filter(Boolean).length*25},
                            {label:"ATS Compatibility",   pct:atsScore},
                          ].map(({label,pct})=>{
                            const c=pct>=80?"#16a34a":pct>=50?"#d97706":"#ef4444";
                            return (
                              <div key={label}>
                                <div className="bar-meta">
                                  <span className="bar-label">{label}</span>
                                  <span className="bar-pct" style={{color:c}}>{pct}%</span>
                                </div>
                                <div className="track"><div className="fill" style={{width:`${pct}%`,background:c}}/></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Profile + Roles */}
                    <div className="two-col">
                      <div className="card p16">
                        <p className="sec-lbl">👤 Detected Profile</p>
                        <div className="info-grid">
                          <InfoChip icon="💡" label="Skills Found" value={`${skills.length} skills identified`} span2/>
                          {profile?.email   &&<InfoChip icon="📧" label="Email"   value={profile.email}/>}
                          {profile?.phone   &&<InfoChip icon="📞" label="Phone"   value={profile.phone}/>}
                          {education?.degree&&<InfoChip icon="🎓" label="Degree"  value={education.degree}/>}
                          {education?.cgpa  &&<InfoChip icon="📈" label="CGPA"    value={education.cgpa}/>}
                          {education?.college&&<InfoChip icon="🏫" label="College" value={education.college} span2/>}
                        </div>
                      </div>
                      <div className="card p16">
                        <SuggestedRoles roleMatches={getRoleMatches(result)}/>
                      </div>
                    </div>

                    {/* Skills */}
                    {skills.length>0&&(
                      <div className="card p16">
                        <p className="sec-lbl">
                          💡 Matched Skills&nbsp;
                          <span style={{fontWeight:400,color:"var(--muted2)",letterSpacing:0,textTransform:"none"}}>({skills.length} found)</span>
                        </p>
                        <div className="skills-wrap">
                          {skills.map(k=><span key={k} className="skill-chip">{k}</span>)}
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <button className="cta-btn" onClick={()=>nav("/resume-enhancer",{state:{extractedText:result.extracted_text,result}})}>
                      <span>✨</span>
                      <span>Enhance My Resume with AI</span>
                      <span>→</span>
                    </button>
                  </>
                ) : (
                  <div className="card">
                    <div className="empty-wrap">
                      <div className="empty-icon">📊</div>
                      <p className="empty-title">No analysis yet</p>
                      <p className="empty-sub">Upload your resume from the <strong style={{color:"var(--teal)"}}>Upload tab</strong> — your ATS score, role matches and skill insights appear here instantly.</p>
                      <button className="empty-btn" onClick={()=>setActiveTab("upload")}>← Switch to Upload</button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}