import React from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

function toneFor(status) {
  if (status === 'suspicious' || status === 'forged') return 'red';
  if (status === 'warning' || status === 'amber') return 'amber';
  return 'green';
}

function toneColor(t, alpha = 1) {
  if (t === 'red')   return `rgba(198, 40, 40, ${alpha})`;
  if (t === 'amber') return `rgba(245, 127, 23, ${alpha})`;
  return `rgba(76, 175, 80, ${alpha})`;
}

export default function ConfidenceTimeline() {
  const { result, status } = useAnalysis();

  if (status === 'loading' || (!result && status !== 'idle')) {
    return (
      <div className="conf-strip">
        <h4>CONFIDENCE TIMELINE</h4>
        <div className="conf-bands">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="conf-band" style={{ background: 'transparent' }}>
              <span className="conf-band-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="skeleton skel-line" style={{ width: '90%', height: 6 }} />
              <span className="conf-band-val">—</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status === 'idle' || !result?.timeline) {
    return (
      <div className="conf-strip">
        <h4>CONFIDENCE TIMELINE</h4>
        <div className="empty-state" style={{ minHeight: 180 }}>
          <div>No timeline yet</div>
        </div>
      </div>
    );
  }

  const bands = result.timeline;

  return (
    <div className="conf-strip fade-up">
      <h4>CONFIDENCE TIMELINE</h4>
      <div className="conf-bands">
        {bands.map((b, i) => {
          const tone = toneFor(b.status);
          const val = Math.round(b.confidence * 100);
          return (
            <div key={i} className="conf-band">
              <span className="conf-band-num">{String(b.region ?? (i + 1)).padStart(2, '0')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  strip y {(b.y_start * 100).toFixed(0)}–{(b.y_end * 100).toFixed(0)}%
                </span>
                <div className="conf-band-fill" style={{
                  width: `${val}%`,
                  background: `linear-gradient(90deg, ${toneColor(tone, 0.9)}, ${toneColor(tone, 0.3)})`,
                  boxShadow: `0 0 8px ${toneColor(tone, 0.4)}`
                }} />
              </div>
              <span className="conf-band-val">{val}</span>
              <div className="conf-band-tip">
                {b.status.toUpperCase()} · {val}% confidence
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)',
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
        {bands.length} / {bands.length} STRIPS · ENSEMBLE READY
      </div>
    </div>
  );
}
