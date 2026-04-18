import React, { useMemo } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

const SIGNAL_LABELS = {
  ela: 'ELA',
  cnn: 'CNN',
  font: 'FONT',
  metadata: 'META',
};

function highestSignal(result) {
  const signals = result?.signals;
  if (!signals) return '—';
  let bestKey = null;
  let bestScore = -Infinity;
  for (const [key, sig] of Object.entries(signals)) {
    const s = (sig?.score || 0) * (sig?.confidence || 1);
    if (s > bestScore) {
      bestScore = s;
      bestKey = key;
    }
  }
  return SIGNAL_LABELS[bestKey] || (bestKey ? bestKey.toUpperCase() : '—');
}

function verdictBadge(verdict) {
  if (verdict === 'GENUINE') return { cls: 'badge-green', color: '#A5D6A7' };
  if (verdict === 'SUSPICIOUS') return { cls: 'badge-amber', color: '#FFD180' };
  if (verdict === 'FORGED') return { cls: 'badge-red', color: '#FF8A80' };
  return { cls: '', color: 'var(--text-dim)' };
}

function statusLabel(row) {
  if (row.status === 'pending')   return { label: 'QUEUED',    color: 'var(--text-faint)' };
  if (row.status === 'analyzing') return { label: 'ANALYZING', color: '#B39DFF' };
  if (row.status === 'done')      return { label: 'DONE',      color: '#A5D6A7' };
  if (row.status === 'error')     return { label: 'FAILED',    color: '#FF8A80' };
  return { label: row.status?.toUpperCase?.() || '—', color: 'var(--text-dim)' };
}

export default function BatchResultsTable({ onRowClick }) {
  const { batchResults, batchProgress, loadBatchResult, clearBatch } = useAnalysis();

  const rows = batchResults;
  const done = useMemo(() => rows.filter((r) => r.status === 'done').length, [rows]);
  const failed = useMemo(() => rows.filter((r) => r.status === 'error').length, [rows]);

  if (!rows || rows.length === 0) return null;

  const handleRowClick = async (row) => {
    if (row.status !== 'done') return;
    await loadBatchResult(row.id);
    if (onRowClick) onRowClick(row);
  };

  return (
    <div className="fade-up" style={{
      marginTop: 18,
      border: '1px solid var(--border-soft)',
      borderRadius: 14,
      background: 'rgba(8,11,20,0.72)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px',
        borderBottom: '1px solid var(--border-soft)',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
            color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 4,
          }}>BATCH RESULTS</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text)',
            letterSpacing: '0.04em',
          }}>
            {batchProgress?.running
              ? `ANALYZING ${batchProgress.current} OF ${batchProgress.total} DOCUMENTS…`
              : `${done} OF ${rows.length} COMPLETE${failed > 0 ? ` · ${failed} FAILED` : ''}`}
          </div>
        </div>
        <button type="button"
                onClick={clearBatch}
                style={{
                  background: 'transparent',
                  color: 'var(--text-faint)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 8, padding: '6px 12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}>CLEAR</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: 'var(--mono)', fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
              {['FILENAME', 'VERDICT', 'CONFIDENCE', 'HIGHEST SIGNAL', 'STATUS'].map((h) => (
                <th key={h}
                    style={{
                      textAlign: 'left', padding: '10px 14px',
                      color: 'var(--text-faint)', letterSpacing: '0.14em',
                      fontSize: 10, fontWeight: 500,
                      borderBottom: '1px solid var(--border-soft)',
                    }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const result = row.result;
              const v = verdictBadge(result?.verdict);
              const s = statusLabel(row);
              const conf = result ? `${(result.confidence * 100).toFixed(1)}%` : '—';
              const sig = result ? highestSignal(result) : '—';
              const clickable = row.status === 'done';
              return (
                <tr key={row.id}
                    onClick={() => handleRowClick(row)}
                    className="fade-up"
                    style={{
                      animationDelay: `${i * 60}ms`,
                      cursor: clickable ? 'pointer' : 'default',
                      borderBottom: '1px solid var(--border-soft)',
                      background: clickable ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                    onMouseEnter={(e) => {
                      if (clickable) e.currentTarget.style.background = 'rgba(79,195,247,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = clickable ? 'transparent' : 'rgba(255,255,255,0.01)';
                    }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.filename}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {result
                      ? <span className={`badge ${v.cls}`}>{result.verdict}</span>
                      : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: v.color }}>{conf}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>{sig}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      color: s.color,
                      letterSpacing: '0.14em', fontSize: 10,
                    }}>{s.label}</span>
                    {row.status === 'error' && row.error && (
                      <span style={{ color: 'var(--text-faint)', marginLeft: 10, fontSize: 10 }}>
                        {row.error.slice(0, 60)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
