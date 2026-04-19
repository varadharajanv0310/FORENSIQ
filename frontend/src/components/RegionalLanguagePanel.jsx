import React, { useMemo, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { ErrorBanner } from './FX.jsx';

const SCRIPT_NATIVE = {
  tamil:     { native: 'தமிழ்',  name: 'Tamil' },
  hindi:     { native: 'हिन्दी',   name: 'Hindi' },
  telugu:    { native: 'తెలుగు',  name: 'Telugu' },
  kannada:   { native: 'ಕನ್ನಡ',   name: 'Kannada' },
  malayalam: { native: 'മലയാളം',  name: 'Malayalam' },
  english:   { native: 'English', name: 'English' },
};

export default function RegionalLanguagePanel() {
  const { result, status, error, retryRegional } = useAnalysis();
  const [activeScript, setActiveScript] = useState('');

  const rl = result?.regional_language;

  const charMap = useMemo(() => {
    if (!rl?.ocr_text) return [];
    const chars = Array.from(rl.ocr_text.replace(/\s+/g, ''));
    return chars.slice(0, 32);
  }, [rl]);

  const flaggedSet = useMemo(() => {
    if (!rl?.flagged_characters) return new Set();
    return new Set(rl.flagged_characters.map(c => c.index));
  }, [rl]);

  const heat = useMemo(() => {
    const src = rl?.kerning_heatmap;
    if (src && Array.isArray(src) && src.length > 0) {
      return src.flat().slice(0, 128);
    }
    return Array.from({ length: 128 }).map(() => 0);
  }, [rl]);

  if (status === 'error') {
    return (
      <div className="regional-wrap">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>REGIONAL FORENSICS</div>
              <h2>Indic script integrity</h2>
            </div>
          </div>
          <ErrorBanner message={error} onRetry={retryRegional} />
        </div>
      </div>
    );
  }

  if (status !== 'success' || !rl) {
    return (
      <div className="regional-wrap">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>REGIONAL FORENSICS · SCRIPT ENGINE</div>
              <h2>Indic script integrity</h2>
              <p className="sub">Purpose-built OCR + font-metric checks for South Asian scripts. Glyph-level, not pixel-level.</p>
            </div>
          </div>
          {status === 'idle' ? (
            <div className="empty-state" style={{ minHeight: 240 }}>
              <div className="empty-icon">↑</div>
              <div>Upload a document to run script analysis</div>
            </div>
          ) : (
            <div className="regional-grid">
              <div className="script-card">
                <div className="skeleton skel-line" style={{ width: 200, height: 42, marginBottom: 20 }} />
                <div className="skeleton skel-block" />
                <div style={{ height: 12 }} />
                <div className="skeleton skel-block" />
              </div>
              <div className="heatmap-card">
                <div className="skeleton skel-line" style={{ width: 200, marginBottom: 16 }} />
                <div className="skeleton skel-block" style={{ height: 200 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const scriptKey = (rl.script || '').toLowerCase();
  const scriptInfo = SCRIPT_NATIVE[scriptKey] || {
    native: scriptKey.toUpperCase() || '—',
    name: rl.language_name || rl.script || 'Unknown',
  };
  const flaggedCount = rl.flagged_characters?.length || 0;
  const glyphCount = rl.glyph_count || charMap.length;
  const anomalyRate = glyphCount > 0 ? ((flaggedCount / glyphCount) * 100).toFixed(1) : '0.0';

  return (
    <div className="regional-wrap">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>REGIONAL FORENSICS · SCRIPT ENGINE</div>
            <h2>Indic script integrity</h2>
            <p className="sub">Purpose-built OCR + font-metric checks for South Asian scripts. Glyph-level, not pixel-level.</p>
          </div>
          <div className="section-header-meta">
            <span className="dot dot-live" style={{ background: '#7C4DFF', boxShadow: '0 0 8px #7C4DFF' }} />
            ENGINE v2.3 · {rl.detected ? 'SCRIPT DETECTED' : 'LATIN ONLY'}
          </div>
        </div>

        {!rl.detected && (
          <div className="error-banner" style={{ marginBottom: 20, background: 'rgba(79,195,247,0.06)', borderColor: 'rgba(79,195,247,0.35)', color: 'var(--cyan)' }}>
            <div className="err-msg" style={{ color: 'var(--cyan)' }}>No regional Indic script detected. Latin/English OCR results are still shown below.</div>
          </div>
        )}

        <div className="regional-grid fade-up">
          <div className="script-card">
            <div className="script-head">
              <div>
                <div className="script-native" style={{
                  fontSize: 42, lineHeight: 1, color: 'var(--cyan)',
                  textShadow: '0 0 20px rgba(79,195,247,0.3)', marginBottom: 8
                }}>{scriptInfo.native}</div>
                <div className="script-name">{scriptInfo.name} · detected</div>
                <div className="mono" style={{
                  fontSize: 11, color: 'var(--text-faint)',
                  letterSpacing: '0.12em', marginTop: 4
                }}>
                  CONFIDENCE {((rl.confidence || 0) * 100).toFixed(1)}% · {glyphCount} GLYPHS
                </div>
              </div>
              <span className={`badge ${flaggedCount > 0 ? 'badge-red' : 'badge-green'}`}>
                {flaggedCount} ANOMAL{flaggedCount === 1 ? 'Y' : 'IES'}
              </span>
            </div>

            <div className="mono" style={{
              fontSize: 10, color: 'var(--text-faint)',
              letterSpacing: '0.14em', marginBottom: 10, textTransform: 'uppercase'
            }}>// OCR EXTRACT</div>
            <div className="ocr-block">
              {rl.ocr_lines && rl.ocr_lines.length > 0 ? rl.ocr_lines.slice(0, 8).map((line, i) => (
                <div key={i}>
                  <span className="muted">line{String(i).padStart(2, '0')} ::</span>{' '}
                  {line.segments?.map((seg, j) => (
                    <span key={j}
                          className={seg.flagged ? 'flag' : 'clean'}
                          data-reason={seg.reason || ''}>
                      {seg.text}{' '}
                    </span>
                  )) || <span className="clean">{line.text}</span>}
                </div>
              )) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  {rl.ocr_text ? rl.ocr_text.slice(0, 400) : 'No text extracted.'}
                </div>
              )}
            </div>

            <div className="mono" style={{
              fontSize: 10, color: 'var(--text-faint)',
              letterSpacing: '0.14em', marginBottom: 10, marginTop: 24, textTransform: 'uppercase'
            }}>// character map · {charMap.length} glyphs</div>
            <div className="char-map">
              {charMap.map((c, i) => {
                const cls = flaggedSet.has(i) ? 'flag' : 'ok';
                return <div key={i} className={`char-cell ${cls}`}>{c}</div>;
              })}
            </div>
            <div style={{
              display: 'flex', gap: 16, marginTop: 14,
              fontFamily: 'var(--mono)', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: 'var(--cyan)' }} /> clean
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: '#C62828' }} /> flagged · {flaggedCount}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                {anomalyRate}% anomaly rate
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="heatmap-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div className="mono" style={{
                    fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'var(--text-dim)', marginBottom: 4
                  }}>FONT SPACING HEATMAP</div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    Per-character kerning variance vs line median
                  </div>
                </div>
                <span className={`badge ${flaggedCount > 3 ? 'badge-red' : 'badge-amber'}`}>
                  PEAK σ {(Math.max(0, ...heat) * 4).toFixed(1)}
                </span>
              </div>
              <div className="heatmap-grid">
                {heat.map((v, i) => {
                  const intensity = Math.min(1, Math.max(0, v));
                  const bg = intensity > 0.6
                    ? `rgba(198, 40, 40, ${intensity})`
                    : intensity > 0.35
                      ? `rgba(245, 127, 23, ${intensity * 0.9})`
                      : `rgba(79, 195, 247, ${0.1 + intensity * 0.4})`;
                  const glow = intensity > 0.6 ? `0 0 ${intensity * 10}px rgba(198,40,40,0.6)` : 'none';
                  return <div key={i} className="heat-cell" style={{ background: bg, boxShadow: glow }} />;
                })}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginTop: 12,
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.1em'
              }}>
                <span>COL 0</span><span>COL 8</span><span>COL 16</span>
              </div>
            </div>

            <div className="scripts-supported">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="mono" style={{
                  fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)'
                }}>SCRIPT ENGINES</div>
                <span className="badge">6 of 6</span>
              </div>
              <div className="scripts-list">
                {Object.entries(SCRIPT_NATIVE).map(([id, s]) => {
                  const active = (activeScript || scriptKey) === id;
                  return (
                    <div key={id}
                         className={`script-chip ${active ? 'active' : ''}`}
                         onClick={() => setActiveScript(id)}
                         style={{ cursor: 'pointer' }}>
                      <div>
                        <div className="native">{s.native}</div>
                        <div style={{ color: 'var(--text-faint)', marginTop: 2, fontSize: 10 }}>{s.name}</div>
                      </div>
                      <span className={`dot ${active ? 'dot-live' : ''}`}
                            style={{ background: active ? 'var(--cyan)' : 'rgba(255,255,255,0.15)' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
