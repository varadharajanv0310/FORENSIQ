import React from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

// 3-tier locking (FIX 1):
//   tier 0 — always accessible (landing, analysis)
//   tier 1 — requires a successful result AND the user has visited
//            the analysis tab at least once (verdict)
//   tier 2 — requires the user has visited the verdict tab at least
//            once (stress, regional)
const SCREENS = [
  { id: 'landing',  label: '01 · Hero',     tier: 0 },
  { id: 'analysis', label: '02 · Analyze',  tier: 0 },
  { id: 'verdict',  label: '03 · Verdict',  tier: 1, lockedMsg: 'Complete analysis first to unlock Verdict' },
  { id: 'stress',   label: '04 · Stress',   tier: 2, lockedMsg: 'Review Verdict first to unlock Stress Test' },
  { id: 'regional', label: '05 · Regional', tier: 2, lockedMsg: 'Review Verdict first to unlock Regional Forensics' },
];

function LockGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
         style={{ opacity: 0.75, marginRight: 4, verticalAlign: 'middle' }}>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar() {
  const { screen, setScreen, result, hasSeenAnalysis, hasSeenVerdict, status } = useAnalysis();

  const tabAllowed = (tab) => {
    if (tab.tier === 0) return true;
    if (tab.tier === 1) return !!result && hasSeenAnalysis && status === 'success';
    if (tab.tier === 2) return hasSeenVerdict;
    return true;
  };

  const handleClick = (tab) => {
    if (!tabAllowed(tab)) return;
    setScreen(tab.id);
  };

  return (
    <nav className="nav">
      <div className="logo">
        <span className="logo-mark" />
        FORENSIQ
      </div>
      <div className="nav-tabs">
        {SCREENS.map((s) => {
          const allowed = tabAllowed(s);
          const isActive = screen === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`nav-tab ${isActive ? 'active' : ''} ${allowed ? '' : 'locked'}`}
              onClick={() => handleClick(s)}
              disabled={!allowed}
              aria-disabled={!allowed}
              title={allowed ? undefined : s.lockedMsg}
              data-tooltip={allowed ? undefined : s.lockedMsg}
            >
              {!allowed && <LockGlyph />}
              {s.label}
            </button>
          );
        })}
      </div>
      <button className="cta" onClick={() => setScreen('analysis')}>
        <span className="dot dot-live" /> Analyze Document
      </button>
    </nav>
  );
}

export { SCREENS };
