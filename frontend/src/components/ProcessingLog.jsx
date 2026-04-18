import React, { useEffect, useRef } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

function hms() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

export default function ProcessingLog() {
  const { steps, stepIndex, status, file, result, error } = useAnalysis();
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [stepIndex, status]);

  const lines = [];
  const t = hms();
  const shown = status === 'idle' ? 0 : Math.max(stepIndex + 1, 0);

  steps.slice(0, shown).forEach((s, i) => {
    const isCurrent = i === stepIndex && status === 'loading';
    const isDone    = i < stepIndex || status === 'success';
    const isErr     = status === 'error' && i === stepIndex;
    const dotClass  = isErr ? 'err' : isCurrent ? 'active' : isDone ? 'done' : '';
    lines.push({ tag: s.id, label: s.label, dotClass, kind: isErr ? 'warn' : isDone ? 'ok' : '' });
  });

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">FORENSIQ · PIPELINE</div>
        <div className="terminal-lights"><span /><span /><span /></div>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        <div className="log-line"><span className="muted">$ forensiq analyze --signals=ela,cnn,meta,font,ocr</span></div>
        <div className="log-line"><span className="muted"># file: {file?.name || 'n/a'} · size: {file ? (file.size / 1024).toFixed(1) + 'KB' : '0KB'}</span></div>
        <div style={{ height: 8 }} />

        {status === 'idle' && (
          <div className="log-line"><span className="muted">{t} </span><span>Waiting for document upload…</span></div>
        )}

        {lines.map((l, i) => (
          <div key={i} className="log-line">
            <span className="muted">{t} </span>
            <span className={`step-dot ${l.dotClass}`} />
            <span className="tag">[{l.tag}]</span>{' '}
            <span className={l.kind}>{l.label}</span>
          </div>
        ))}

        {status === 'success' && result && (
          <>
            <div style={{ height: 6 }} />
            <div className="log-line"><span className="muted">{t} </span><span className="tag">[DONE]</span> <span className="ok">Verdict → {result.verdict} @ {(result.confidence * 100).toFixed(1)}%</span></div>
          </>
        )}

        {status === 'error' && (
          <div className="log-line"><span className="muted">{t} </span><span className="tag">[FAIL]</span> <span className="warn">{error}</span></div>
        )}

        {status === 'loading' && (
          <div className="log-line">
            <span className="muted">_ </span>
            <span style={{ background: 'var(--cyan)', width: 7, height: 12, display: 'inline-block', animation: 'pulse 1s infinite', verticalAlign: 'middle' }} />
          </div>
        )}
      </div>
    </div>
  );
}
