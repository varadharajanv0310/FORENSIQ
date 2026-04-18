import React from 'react';

const SCREENS = [
  { id: 'landing',  label: '01 · Hero' },
  { id: 'analysis', label: '02 · Analyze' },
  { id: 'verdict',  label: '03 · Verdict' },
  { id: 'stress',   label: '04 · Stress' },
  { id: 'regional', label: '05 · Regional' },
];

export default function Navbar({ screen, setScreen }) {
  return (
    <nav className="nav">
      <div className="logo">
        <span className="logo-mark" />
        FORENSIQ
      </div>
      <div className="nav-tabs">
        {SCREENS.map(s => (
          <button key={s.id}
                  className={`nav-tab ${screen === s.id ? 'active' : ''}`}
                  onClick={() => setScreen(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <button className="cta" onClick={() => setScreen('analysis')}>
        <span className="dot dot-live" /> Analyze Document
      </button>
    </nav>
  );
}

export { SCREENS };
