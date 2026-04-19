import React, { useEffect, useRef } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

function hms() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

export default function ProcessingLog() {
  const {
    steps, stepIndex, status, file, result, error,
    terminalMinimized, toggleTerminal,
  } = useAnalysis();
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current && !terminalMinimized) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [stepIndex, status, terminalMinimized]);

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

  const currentStep = stepIndex >= 0 ? steps[stepIndex]?.label : null;
  const miniLine = status === 'loading' && currentStep
    ? `${currentStep}…`
    : status === 'success'
      ? `VERDICT → ${result?.verdict || 'READY'}`
      : status === 'error'
        ? 'PIPELINE FAILED'
        : 'IDLE · awaiting document';

  return (
    <div className={`terminal ${terminalMinimized ? 'minimized' : ''}`}>
      <div className="terminal-header"
           onClick={toggleTerminal}
           role="button"
           tabIndex={0}
           aria-label={terminalMinimized ? 'Expand terminal' : 'Minimize terminal'}
           onKeyDown={(e) => {
             if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTerminal(); }
           }}
           style={{ cursor: 'pointer' }}>
        <div className="terminal-title">
          FORENSIQ · PIPELINE {terminalMinimized ? '· COMPACT' : ''}
        </div>
        <div className="terminal-lights"><span /><span /><span /></div>
      </div>

      {terminalMinimized ? (
        <div className="terminal-mini">
          <span className="terminal-mini-dot" data-status={status} />
          <span className="terminal-mini-text">{miniLine}</span>
          <span className="terminal-mini-hint">tap to expand</span>
        </div>
      ) : (
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
      )}
    </div>
  );
}
