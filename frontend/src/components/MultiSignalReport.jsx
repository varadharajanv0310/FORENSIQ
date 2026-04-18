import React, { useEffect, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { ErrorBanner } from './FX.jsx';

const SIGNAL_META = {
  ela:      { name: 'ELA ANALYSIS',    tone: '#4FC3F7', weight: 0.35, code: 'ELA · q=95 residual' },
  cnn:      { name: 'CNN INFERENCE',   tone: '#7C4DFF', weight: 0.40, code: 'CNN · EfficientNet-B0' },
  font:     { name: 'FONT CONSISTENCY', tone: '#F57F17', weight: 0.15, code: 'FONT · MSER + KMeans' },
  metadata: { name: 'METADATA ANOMALY', tone: '#C62828', weight: 0.10, code: 'META · EXIF/XMP' },
};

function scoreToStatus(score) {
  if (score >= 0.7) return { label: 'FORGED',    badge: 'badge-red' };
  if (score >= 0.4) return { label: 'FLAGGED',   badge: 'badge-amber' };
  return { label: 'CLEAN', badge: 'badge-green' };
}

function findings(key, signal) {
  if (!signal) return [];
  if (key === 'ela') {
    return [
      ['residual mean', (signal.score || 0).toFixed(2)],
      ['confidence',    `${Math.round((signal.confidence || 0) * 100)} %`],
      ['hot regions',   `${(signal.regional_scores || []).filter(v => v > 0.5).length} strip(s)`],
    ];
  }
  if (key === 'cnn') {
    return [
      ['forged prob',  (signal.score || 0).toFixed(2)],
      ['confidence',   `${Math.round((signal.confidence || 0) * 100)} %`],
      ['backbone',     signal.backbone || 'EfficientNet-B0'],
    ];
  }
  if (key === 'font') {
    return [
      ['flagged regions', `${(signal.flagged_regions || []).length}`],
      ['total regions',   `${signal.total_regions ?? '—'}`],
      ['confidence',      `${Math.round((signal.confidence || 0) * 100)} %`],
    ];
  }
  if (key === 'metadata') {
    return [
      ['anomalies',  `${(signal.anomalies || []).length}`],
      ['confidence', `${Math.round((signal.confidence || 0) * 100)} %`],
      ['source',     signal.source || 'exif/xmp'],
    ];
  }
  return [];
}

export default function MultiSignalReport() {
  const { result, status, error, retry } = useAnalysis();
  const [anim, setAnim] = useState(false);

  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => setAnim(true), 200);
      return () => clearTimeout(t);
    }
    setAnim(false);
  }, [status, result]);

  if (status === 'error') return <ErrorBanner message={error} onRetry={retry} />;

  if (status !== 'success' || !result) {
    return (
      <div className="signal-grid">
        {[0, 1, 2].map(i => (
          <div key={i} className="signal-card">
            <div className="signal-header">
              <div>
                <div className="skeleton skel-line" style={{ width: 120 }} />
                <div className="skeleton skel-line" style={{ width: 80, marginTop: 8 }} />
              </div>
              <div className="skeleton skel-line" style={{ width: 60, height: 18 }} />
            </div>
            <div className="skeleton skel-line" style={{ width: '100%', height: 6 }} />
            <div style={{ marginTop: 12 }}>
              <div className="skeleton skel-line" style={{ width: '70%' }} />
              <div className="skeleton skel-line" style={{ width: '60%' }} />
              <div className="skeleton skel-line" style={{ width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const signalKeys = Object.keys(result.signals || {});
  const weightsUsed = result.weights_used || {};

  return (
    <>
      <div className="signal-grid fade-up">
        {signalKeys.map((key) => {
          const meta = SIGNAL_META[key] || { name: key.toUpperCase(), tone: '#7C4DFF', code: key };
          const sig = result.signals[key];
          const scorePct = Math.round((sig?.score || 0) * 100);
          const st = scoreToStatus(sig?.score || 0);
          return (
            <div key={key} className="signal-card" style={{ '--accent-color': meta.tone }}>
              <div className="signal-header">
                <div>
                  <div className="signal-name">{meta.name}</div>
                  <div className="signal-score" style={{ color: meta.tone }}>
                    {scorePct}<span style={{ color: 'var(--text-faint)', fontSize: 18 }}>/100</span>
                  </div>
                </div>
                <span className={`badge ${st.badge}`}>{st.label}</span>
              </div>
              <div className="signal-bar">
                <div className="signal-bar-fill" style={{
                  width: anim ? `${scorePct}%` : '0%',
                  background: `linear-gradient(90deg, ${meta.tone}, ${meta.tone}88)`,
                  boxShadow: `0 0 12px ${meta.tone}66`,
                }} />
              </div>
              <div className="signal-detail">
                {findings(key, sig).map((f, j) => (
                  <div key={j} className="kv"><span>{f[0]}</span><span>{f[1]}</span></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="breakdown-card fade-up-d1">
        <div className="breakdown-title">ENSEMBLE BREAKDOWN · weighted vote</div>
        {signalKeys.map((key) => {
          const meta = SIGNAL_META[key] || { name: key.toUpperCase(), tone: '#7C4DFF', code: key };
          const sig = result.signals[key];
          const w = (weightsUsed[key] ?? meta.weight) * 100;
          const scorePct = Math.round((sig?.score || 0) * 100);
          return (
            <div key={key} className="breakdown-row">
              <div className="breakdown-label">{meta.name}<small>{meta.code}</small></div>
              <div className="breakdown-bar">
                <div className="breakdown-bar-fill" style={{
                  width: anim ? `${scorePct}%` : '0%',
                  background: `linear-gradient(90deg, ${meta.tone}, ${meta.tone}44)`,
                  boxShadow: `0 0 10px ${meta.tone}55`,
                }} />
              </div>
              <div className="breakdown-weight">W · {w.toFixed(0)}%</div>
              <div className="breakdown-contrib" style={{ color: meta.tone }}>+{((scorePct * w) / 100).toFixed(1)}</div>
            </div>
          );
        })}
        <div style={{
          marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-soft)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)',
            letterSpacing: '0.12em', textTransform: 'uppercase'
          }}>ensemble total</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 22,
            color: result.verdict === 'GENUINE' ? '#A5D6A7' :
                   result.verdict === 'SUSPICIOUS' ? '#FFD180' : '#FF8A80'
          }}>
            {(result.confidence * 100).toFixed(1)} / 100 → {result.verdict}
          </div>
        </div>
      </div>
    </>
  );
}
