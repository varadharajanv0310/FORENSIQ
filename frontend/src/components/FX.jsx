import React from 'react';

export function HeroWaves() {
  return (
    <svg className="hero-waves-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="hw-g1" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%"   stopColor="#7C4DFF" stopOpacity="0" />
          <stop offset="40%"  stopColor="#7C4DFF" stopOpacity="0.7" />
          <stop offset="70%"  stopColor="#4FC3F7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hw-g2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#F57F17" stopOpacity="0" />
          <stop offset="50%"  stopColor="#F57F17" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#C62828" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 18 }).map((_, i) => {
        const y = 560 + i * 3;
        const skew = i * 2;
        return (
          <path key={`o-${i}`}
                d={`M ${-50 + skew} ${y} Q 400 ${y - 30} 800 ${y - 8} T 1650 ${y - 20}`}
                stroke="url(#hw-g2)" strokeWidth="0.8" fill="none" opacity={0.6 - i * 0.02} />
        );
      })}
      {Array.from({ length: 32 }).map((_, i) => {
        const yBase = 480 + Math.sin(i * 0.4) * 40;
        const amp = 120 + i * 2;
        const d = `M -50 ${yBase}
                   C 250 ${yBase - amp * 0.6}, 500 ${yBase + amp * 0.8}, 800 ${yBase - amp * 0.3}
                   S 1300 ${yBase + amp * 0.9}, 1650 ${yBase - amp * 0.2}`;
        return (
          <path key={`r-${i}`} d={d} stroke="url(#hw-g1)"
                strokeWidth={0.5 + (i / 32) * 0.8}
                fill="none" opacity={0.15 + (i / 32) * 0.5}
                style={{ transform: `translateY(${(i - 16) * 4}px)` }} />
        );
      })}
      {Array.from({ length: 10 }).map((_, i) => {
        const y = 150 + i * 12;
        return (
          <path key={`u-${i}`}
                d={`M -50 ${y} Q 400 ${y + 30} 800 ${y + 10} T 1650 ${y + 20}`}
                stroke="url(#hw-g1)" strokeWidth="0.4" fill="none"
                opacity={0.12 + i * 0.015} />
        );
      })}
    </svg>
  );
}

export function StressWaves() {
  return (
    <svg viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
      <defs>
        <linearGradient id="sw-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#C62828" stopOpacity="0" />
          <stop offset="50%"  stopColor="#C62828" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F57F17" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 24 }).map((_, i) => {
        const yBase = 380 + Math.sin(i * 0.3) * 30;
        const amp = 80 + i * 3;
        const d = `M -50 ${yBase} C 300 ${yBase - amp}, 600 ${yBase + amp}, 900 ${yBase - amp * 0.5} S 1400 ${yBase + amp}, 1650 ${yBase - amp * 0.3}`;
        return <path key={i} d={d} stroke="url(#sw-g)" strokeWidth={0.6 + i * 0.03} fill="none" opacity={0.1 + i * 0.03} />;
      })}
    </svg>
  );
}

export function OrbMesh({ tone = 'red' }) {
  const color = tone === 'red' ? '#FF8A80' : tone === 'green' ? '#A5D6A7' : tone === 'amber' ? '#FFD180' : '#B39DFF';
  return (
    <svg className="orb-mesh" viewBox="-140 -140 280 280"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const rx = Math.abs(Math.cos((i / 12) * Math.PI)) * 120;
        return <ellipse key={`lon-${i}`} cx="0" cy="0" rx={rx} ry="120" fill="none" stroke={color} strokeWidth="0.5" opacity="0.35" />;
      })}
      {Array.from({ length: 9 }).map((_, i) => {
        const y = -120 + i * 30;
        const rx = Math.sqrt(Math.max(0, 120 * 120 - y * y));
        return <ellipse key={`lat-${i}`} cx="0" cy={y} rx={rx} ry={rx * 0.18} fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />;
      })}
      <circle cx="0" cy="0" r="130" fill="none" stroke={color} strokeWidth="0.6" opacity="0.3" strokeDasharray="2 4" />
    </svg>
  );
}

export function Backdrop() {
  return (
    <>
      <div className="starfield" />
      <div className="dotgrid" />
    </>
  );
}

export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="error-banner fade-up">
      <div className="err-msg">{message || 'Something went wrong.'}</div>
      {onRetry && <button className="retry-btn" onClick={onRetry}>RETRY</button>}
    </div>
  );
}
