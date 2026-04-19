import React, { useEffect, useState } from 'react';
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
  const { result, status, currentPage } = useAnalysis();

  // FIX 4: auto-collapse to compact mode when the viewport is short
  // (<800px tall), expandable by clicking the header.
  const [compact, setCompact] = useState(
    typeof window !== 'undefined' ? window.innerHeight < 800 : false
  );
  const [userExpanded, setUserExpanded] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (userExpanded) return; // user choice wins until they collapse again
      setCompact(window.innerHeight < 800);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [userExpanded]);

  const toggle = () => {
    setCompact((prev) => {
      const next = !prev;
      setUserExpanded(!next); // expanded ⇒ user override persists across resize
      return next;
    });
  };

  if (status === 'loading' || (!result && status !== 'idle')) {
    return (
      <div className={`conf-strip ${compact ? 'compact' : ''}`}>
        <h4 onClick={toggle} style={{ cursor: 'pointer' }}>
          CONFIDENCE TIMELINE {compact ? '· tap to expand' : ''}
        </h4>
        {!compact && (
          <div className="conf-bands">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="conf-band" style={{ background: 'transparent' }}>
                <span className="conf-band-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="skeleton skel-line" style={{ width: '90%', height: 6 }} />
                <span className="conf-band-val">—</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Prefer the active page's timeline; fall back to the top-level one
  // for legacy single-page responses.
  const pages = Array.isArray(result?.pages) && result.pages.length > 0 ? result.pages : null;
  const safeIndex = pages ? Math.min(Math.max(0, currentPage || 0), pages.length - 1) : 0;
  const activePage = pages ? pages[safeIndex] : null;
  const pageBands = activePage?.timeline;
  const bands = (pageBands && pageBands.length > 0) ? pageBands : result?.timeline;

  if (status === 'idle' || !bands) {
    return (
      <div className={`conf-strip ${compact ? 'compact' : ''}`}>
        <h4 onClick={toggle} style={{ cursor: 'pointer' }}>
          CONFIDENCE TIMELINE {compact ? '· tap to expand' : ''}
        </h4>
        {!compact && (
          <div className="empty-state" style={{ minHeight: 180 }}>
            <div>No timeline yet</div>
          </div>
        )}
      </div>
    );
  }

  const flagged = bands.filter((b) => b.status !== 'genuine' && b.status !== 'clean').length;
  const avgConf = bands.length
    ? Math.round((bands.reduce((s, b) => s + (b.confidence || 0), 0) / bands.length) * 100)
    : 0;

  return (
    <div className={`conf-strip fade-up ${compact ? 'compact' : ''}`}>
      <h4 onClick={toggle} style={{ cursor: 'pointer' }}>
        CONFIDENCE TIMELINE {compact ? '· tap to expand' : '· tap to compact'}
      </h4>
      {compact ? (
        <div className="conf-strip-mini">
          <span className="conf-mini-metric">{bands.length} STRIPS</span>
          <span className="conf-mini-metric">{avgConf}% AVG</span>
          <span className="conf-mini-metric conf-mini-flag">{flagged} FLAGGED</span>
        </div>
      ) : (
        <>
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
            {bands.length} / {bands.length} STRIPS · {pages ? `PAGE ${safeIndex + 1}/${pages.length} · ` : ''}ENSEMBLE READY
          </div>
        </>
      )}
    </div>
  );
}
