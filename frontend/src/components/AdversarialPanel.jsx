import React, { useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { StressWaves, ErrorBanner } from './FX.jsx';

const OPERATIONS = [
  { id: 'brightness',   name: 'Brightness Shift',     unit: 'Δ EV',   desc: 'Uniform luminance offset across the image. Weak attack — should not fool ELA residual.' },
  { id: 'jpeg_compress', name: 'JPEG Recompression',  unit: 'q-loss', desc: 'Re-encode at lower quality. Erases double-quantization artifacts ELA depends on.' },
  { id: 'copymove',     name: 'Copy-Move Injection',  unit: 'px',     desc: 'Splice a clean patch over the tampered photo region. Hardest attack — defeats ELA.' },
];

function AttackCard({ op, value, onChange }) {
  const enabled = value > 5;
  return (
    <div className={`attack-card ${enabled ? 'enabled' : ''}`}>
      <div className="attack-head">
        <div><div className="attack-name">{op.name}</div></div>
        <span className={`badge ${enabled ? 'badge-red' : ''}`}>{enabled ? 'ARMED' : 'IDLE'}</span>
      </div>
      <div className="attack-desc">{op.desc}</div>
      <div className="attack-slider">
        <label><span>INTENSITY</span><span className="val">{value}% {op.unit}</span></label>
        <input type="range" className="range-red" min="0" max="100" value={value}
               onChange={e => onChange(+e.target.value)} />
      </div>
    </div>
  );
}

function verdictTone(v) {
  if (v === 'GENUINE')    return { cls: 'green', color: '#A5D6A7', gradient: 'linear-gradient(90deg,#2E7D32,#A5D6A7)', glow: '#2E7D32' };
  if (v === 'SUSPICIOUS') return { cls: 'amber', color: '#FFD180', gradient: 'linear-gradient(90deg,#F57F17,#FFD180)', glow: '#F57F17' };
  return { cls: 'red', color: '#FF8A80', gradient: 'linear-gradient(90deg,#C62828,#FF8A80)', glow: '#C62828' };
}

export default function AdversarialPanel() {
  const { baseline, result, status, error, runAdversarial, retry } = useAnalysis();
  const [intensities, setIntensities] = useState({ brightness: 35, jpeg_compress: 60, copymove: 20 });
  const [activeOp, setActiveOp] = useState('copymove');

  const hasBase = !!baseline;
  const apply = async () => {
    const intensity = intensities[activeOp] / 100;
    await runAdversarial(activeOp, intensity);
  };
  const reset = () => setIntensities({ brightness: 0, jpeg_compress: 0, copymove: 0 });

  const baseTone = hasBase ? verdictTone(baseline.verdict) : verdictTone('FORGED');
  const afterTone = result ? verdictTone(result.verdict) : baseTone;
  const baseConf = hasBase ? baseline.confidence * 100 : 0;
  const afterConf = result ? result.confidence * 100 : 0;

  return (
    <div className="stress-wrap">
      <StressWaves />
      <div className="horizon-glow red" style={{ bottom: '-300px', opacity: 0.5 }} />
      <div className="container">
        <div className="section-header">
          <div>
            <div className="eyebrow" style={{ color: '#FF8A80', marginBottom: 10 }}>ADVERSARIAL MODE</div>
            <h2>Stress-test the detector</h2>
            <p className="sub">Simulate real-world attacks against the loaded document. If confidence survives, the signal is robust.</p>
          </div>
        </div>

        {!hasBase && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            <div className="err-msg">Upload and analyze a document first to arm the stress test.</div>
          </div>
        )}

        {status === 'error' && <div style={{ marginBottom: 20 }}><ErrorBanner message={error} onRetry={retry} /></div>}

        <div className="stress-banner">
          <div className="stress-banner-title">STRESS TEST MODE · {hasBase ? 'ACTIVE' : 'STANDBY'}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="badge badge-red">
              {Object.values(intensities).filter(v => v > 5).length} ATTACK(S) ARMED
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
              TARGET · {hasBase ? (baseline.filename || 'document') : 'none'}
            </span>
          </div>
        </div>

        <div className="attack-grid">
          {OPERATIONS.map(op => (
            <div key={op.id}
                 onClick={() => setActiveOp(op.id)}
                 style={{ cursor: 'pointer', outline: activeOp === op.id ? '2px solid rgba(198,40,40,0.6)' : 'none', borderRadius: 14 }}>
              <AttackCard op={op}
                          value={intensities[op.id]}
                          onChange={(v) => setIntensities(prev => ({ ...prev, [op.id]: v }))} />
            </div>
          ))}
        </div>

        <div className="before-after">
          <div className="ba-panel before">
            <div className="ba-label">BASELINE · PRE-ATTACK</div>
            {hasBase ? (
              <>
                <div className={`ba-verdict ${baseTone.cls}`}>{baseline.verdict}</div>
                <div className="ba-conf">{baseConf.toFixed(1)}% confidence · ensemble</div>
                <div className="ba-bar"><div className="ba-bar-fill" style={{
                  width: `${baseConf}%`, background: baseTone.gradient, boxShadow: `0 0 10px ${baseTone.glow}`
                }} /></div>
              </>
            ) : (
              <>
                <div className="skeleton skel-line" style={{ width: 180, height: 36 }} />
                <div className="skeleton skel-line" style={{ width: 220 }} />
                <div className="skeleton skel-line" style={{ width: '100%', height: 6 }} />
              </>
            )}
          </div>
          <div className="ba-arrow">→</div>
          <div className="ba-panel after">
            <div className="ba-label">POST-ATTACK · RECOMPUTED</div>
            {status === 'loading' ? (
              <>
                <div className="skeleton skel-line" style={{ width: 180, height: 36 }} />
                <div className="skeleton skel-line" style={{ width: 220 }} />
                <div className="skeleton skel-line" style={{ width: '100%', height: 6 }} />
              </>
            ) : result && result !== baseline ? (
              <>
                <div className={`ba-verdict ${afterTone.cls}`}>{result.verdict}</div>
                <div className="ba-conf">{afterConf.toFixed(1)}% confidence · post-attack ensemble</div>
                <div className="ba-bar"><div className="ba-bar-fill" style={{
                  width: `${afterConf}%`, background: afterTone.gradient, boxShadow: `0 0 10px ${afterTone.glow}`,
                  transition: 'width 0.35s'
                }} /></div>
              </>
            ) : (
              <div className="empty-state" style={{ minHeight: 120 }}>
                <div>Arm an attack and press APPLY</div>
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '24px 28px', background: 'rgba(198,40,40,0.05)',
          border: '1px solid rgba(198,40,40,0.25)', borderRadius: 14
        }}>
          <div>
            <div className="mono" style={{
              fontSize: 11, color: '#FF8A80', letterSpacing: '0.14em',
              textTransform: 'uppercase', marginBottom: 4
            }}>robustness</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {!result || result === baseline
                ? 'Awaiting attack run'
                : afterConf > 40 && result.verdict !== 'GENUINE'
                  ? 'Detector HOLDING · attack insufficient'
                  : 'Detector BROKEN · attack successful'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="cta cta-ghost" onClick={reset}>Reset attacks</button>
            <button className="cta cta-red"
                    disabled={!hasBase || status === 'loading'}
                    onClick={apply}>
              {status === 'loading' ? 'Applying…' : 'Apply & Reanalyze →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
