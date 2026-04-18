import React, { useEffect, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { OrbMesh, ErrorBanner } from './FX.jsx';
import { exportReportPdf } from '../utils/exportPdf.js';

function useCountUp(target, duration = 1400, enabled = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!enabled) { setVal(0); return; }
    let raf; const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return val;
}

const VERDICT_STYLES = {
  GENUINE:    { cls: 'genuine',    badge: 'badge-green', tone: 'green',  overall: 'CLEAN', severity: 'LOW SEVERITY' },
  SUSPICIOUS: { cls: 'suspicious', badge: 'badge-amber', tone: 'amber',  overall: 'WARNING', severity: 'MEDIUM SEVERITY' },
  FORGED:     { cls: '',           badge: 'badge-red',   tone: 'red',    overall: 'CRITICAL', severity: 'HIGH SEVERITY' },
};

export default function VerdictCard() {
  const { result, status, file, error, retry } = useAnalysis();
  const confidence = result ? result.confidence * 100 : 0;
  const animatedPct = useCountUp(confidence, 1400, status === 'success' && !!result);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!result || exporting) return;
    setExporting(true);
    try { await exportReportPdf(result); }
    catch (e) { /* eslint-disable-next-line no-console */ console.warn('PDF export failed', e); }
    finally { setExporting(false); }
  };

  if (status === 'error') {
    return <ErrorBanner message={error} onRetry={retry} />;
  }

  if (status !== 'success' || !result) {
    return (
      <div className="verdict-hero">
        <div className="verdict-card">
          <div className="verdict-meta">
            <div className="skeleton skel-line" style={{ width: 120 }} />
            <div className="skeleton skel-line" style={{ width: 140 }} />
          </div>
          <div className="skeleton skel-line" style={{ width: 140 }} />
          <div className="skeleton skel-verdict-word" style={{ marginTop: 20, marginBottom: 16 }} />
          <div className="skeleton skel-line" style={{ width: '85%' }} />
          <div className="skeleton skel-line" style={{ width: '70%' }} />
        </div>
        <div className="orb-card">
          <div className="skeleton skel-orb" />
        </div>
      </div>
    );
  }

  const style = VERDICT_STYLES[result.verdict] || VERDICT_STYLES.FORGED;
  const signalCount = result.signals ? Object.keys(result.signals).length : 0;
  const agreeing = result.signals
    ? Object.values(result.signals).filter(s => (s?.score || 0) > 0.4).length
    : 0;

  return (
    <div className="verdict-hero fade-up">
      <div className={`verdict-card ${style.cls}`}>
        <div className="verdict-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge ${style.badge}`}>{style.overall}</span>
          <span className="badge">{style.severity}</span>
          {file?.name && <span className="badge">{file.name}</span>}
          <button type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    color: exporting ? 'var(--text-faint)' : 'var(--cyan)',
                    border: '1px solid rgba(79,195,247,0.45)',
                    borderRadius: 8,
                    padding: '6px 14px',
                    cursor: exporting ? 'wait' : 'pointer',
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    boxShadow: exporting ? 'none' : '0 0 12px rgba(79,195,247,0.18)',
                    transition: 'all 150ms ease',
                  }}>
            {exporting ? 'EXPORTING…' : '↓ EXPORT REPORT'}
          </button>
        </div>
        <div className="verdict-label">VERDICT</div>
        <div className="verdict-word">{result.verdict}</div>
        <div className="verdict-reason">
          &gt; {result.reason}
        </div>
        <div className="verdict-confidence">
          <div className="confidence-num">{animatedPct.toFixed(1)}<span className="pct">%</span></div>
          <div className="confidence-caption">
            ensemble confidence · {agreeing} of {signalCount} signals flagged
          </div>
        </div>
      </div>

      <div className="orb-card">
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${
            style.tone === 'red' ? 'rgba(198,40,40,0.18)' :
            style.tone === 'amber' ? 'rgba(245,127,23,0.18)' :
            'rgba(76,175,80,0.18)'
          }, transparent 60%)`,
          pointerEvents: 'none'
        }} />
        <div className="orb-wrap">
          <div className={`orb-core ${style.cls}`} />
          <OrbMesh tone={style.tone} />
          <div style={{ position: 'absolute', inset: '-8px', borderRadius: '50%',
                        border: `1px dashed ${
                          style.tone === 'red' ? 'rgba(198,40,40,0.35)' :
                          style.tone === 'amber' ? 'rgba(245,127,23,0.35)' :
                          'rgba(76,175,80,0.35)'
                        }`,
                        animation: 'orb-spin 60s linear infinite reverse' }} />
        </div>
        <div className="orb-caption">OVERALL INTEGRITY · {style.overall}</div>
      </div>
    </div>
  );
}
