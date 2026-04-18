import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAnalysis } from '../context/AnalysisContext.jsx';

const VERDICT_COLOR = {
  GENUINE:    '#4CAF50',
  SUSPICIOUS: '#F57F17',
  FORGED:     '#C62828',
};

function pointColor(verdict) {
  return VERDICT_COLOR[verdict] || '#4FC3F7';
}

function CustomDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const fill = pointColor(payload?.verdict);
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={fill} stroke="#080B14" strokeWidth={1.5}
              style={{ filter: `drop-shadow(0 0 6px ${fill}88)` }} />
    </g>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const color = pointColor(p.verdict);
  const ts = p.timestamp ? new Date(p.timestamp) : null;
  return (
    <div style={{
      background: '#080B14',
      border: `1px solid ${color}66`,
      padding: '10px 14px',
      borderRadius: 10,
      fontFamily: 'var(--mono)',
      fontSize: 11,
      color: 'var(--text)',
      boxShadow: `0 0 18px ${color}33`,
      letterSpacing: '0.04em',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.16em',
        color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 6,
      }}>DOCUMENT {p.docIndex}</div>
      <div style={{ color: 'var(--text)', fontSize: 12, marginBottom: 4, maxWidth: 260,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.filename}
      </div>
      <div style={{ color, fontWeight: 600 }}>{p.verdict} · {p.y.toFixed(1)}%</div>
      {ts && (
        <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>
          {ts.toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default function ConfidenceHistory() {
  const { history } = useAnalysis();

  const data = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history.map((h, i) => ({
      docIndex: i + 1,
      x: i + 1,
      y: (h.confidence || 0) * 100,
      filename: h.filename,
      verdict: h.verdict,
      timestamp: h.timestamp,
      id: h.id,
    }));
  }, [history]);

  if (data.length < 2) return null;

  return (
    <div className="fade-up" style={{
      marginTop: 24,
      background: '#080B14',
      border: '1px solid var(--border-soft)',
      borderRadius: 14,
      padding: 20,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
            color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 4,
          }}>SESSION FORENSICS HISTORY</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)',
          }}>
            {data.length} DOCUMENT{data.length === 1 ? '' : 'S'} · ensemble confidence over time
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 14, alignItems: 'center',
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
          color: 'var(--text-faint)', textTransform: 'uppercase',
        }}>
          {Object.entries(VERDICT_COLOR).map(([k, c]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: c, boxShadow: `0 0 6px ${c}88`,
              }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="rgba(79,195,247,0.08)" strokeDasharray="2 4" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[1, Math.max(2, data.length)]}
              allowDecimals={false}
              tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fill: 'var(--text-faint)' }}
              tickLine={{ stroke: 'var(--border-soft)' }}
              axisLine={{ stroke: 'var(--border-soft)' }}
              label={{
                value: 'DOCUMENT',
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--text-faint)',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 10,
                letterSpacing: 2,
              }}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fill: 'var(--text-faint)' }}
              tickLine={{ stroke: 'var(--border-soft)' }}
              axisLine={{ stroke: 'var(--border-soft)' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(79,195,247,0.25)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="y"
              stroke="#4FC3F7"
              strokeWidth={1.5}
              dot={<CustomDot />}
              activeDot={false}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
