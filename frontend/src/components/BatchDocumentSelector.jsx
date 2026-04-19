import React, { useEffect, useRef } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

// FIX 6: horizontal chip row at the top of the Verdict screen. Each
// chip loads that document's full results into every downstream panel
// (VerdictCard, MultiSignalReport, ForensicsViewer, ConfidenceTimeline,
// bounding boxes, RegionalLanguagePanel) via the existing
// loadBatchResult() context action — no re-analysis is triggered.
//
// Keyboard: when a chip is focused, ArrowLeft / ArrowRight shift the
// selection to the prev/next DONE row (failed rows are skipped).

function verdictColor(v) {
  if (v === 'GENUINE') return '#4CAF50';
  if (v === 'SUSPICIOUS') return '#F57F17';
  if (v === 'FORGED') return '#C62828';
  return '#4FC3F7';
}

function truncate(name, n = 26) {
  if (!name) return '—';
  if (name.length <= n) return name;
  return name.slice(0, n - 1) + '…';
}

export default function BatchDocumentSelector() {
  const { batchResults, activeBatchId, loadBatchResult, shiftBatchSelection } = useAnalysis();
  const chipRefs = useRef({});

  const doneRows = batchResults.filter((r) => r.status === 'done' && r.result);
  if (doneRows.length < 2) return null;

  // Keep the selected chip scrolled into view when selection changes
  // from outside the selector (e.g. BatchResultsTable row click).
  useEffect(() => {
    if (!activeBatchId) return;
    const el = chipRefs.current[activeBatchId];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeBatchId]);

  const onChipKey = (e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); shiftBatchSelection(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); shiftBatchSelection(1); }
  };

  return (
    <div className="batch-doc-selector fade-up" role="tablist"
         aria-label="Batch document selector">
      <div className="batch-doc-selector-label">
        BATCH RESULTS — SELECT DOCUMENT · {doneRows.length} ANALYZED
      </div>
      <div className="batch-doc-selector-track">
        {doneRows.map((row, i) => {
          const verdict = row.result?.verdict || 'UNKNOWN';
          const col = verdictColor(verdict);
          const isActive = row.id === activeBatchId;
          const confidence = typeof row.result?.confidence === 'number'
            ? `${(row.result.confidence * 100).toFixed(0)}%`
            : '—';
          return (
            <button
              key={row.id}
              ref={(el) => { if (el) chipRefs.current[row.id] = el; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-verdict={verdict}
              className={`batch-doc-chip ${isActive ? 'active' : ''}`}
              onClick={() => loadBatchResult(row.id)}
              onKeyDown={onChipKey}
              style={{
                '--chip-accent': col,
                animationDelay: `${i * 60}ms`,
              }}>
              <span className="batch-doc-chip-rail" />
              <span className="batch-doc-chip-inner">
                <span className="batch-doc-chip-filename">{truncate(row.filename)}</span>
                <span className="batch-doc-chip-meta">
                  <span className="batch-doc-chip-verdict" style={{ color: col }}>
                    {verdict}
                  </span>
                  <span className="batch-doc-chip-conf">{confidence}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
