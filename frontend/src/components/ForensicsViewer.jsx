import React from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import ComparativeSlider from './ComparativeSlider.jsx';
import { ErrorBanner } from './FX.jsx';

export default function ForensicsViewer() {
  const { result, status, file, error, retry } = useAnalysis();

  if (status === 'error') {
    return (
      <div className="doc-viewer">
        <div className="doc-header">
          <div>
            <div className="doc-title">Analysis failed</div>
            <div className="doc-title"><small>{file?.name || 'no document'}</small></div>
          </div>
          <span className="badge badge-red">ERROR</span>
        </div>
        <div style={{ padding: 20 }}>
          <ErrorBanner message={error} onRetry={retry} />
        </div>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="doc-viewer">
        <div className="doc-header">
          <div>
            <div className="doc-title">Forensics Viewer</div>
            <div className="doc-title"><small>No document loaded · upload one to begin</small></div>
          </div>
          <span className="badge">IDLE</span>
        </div>
        <div className="doc-compare">
          <div className="empty-state">
            <div className="empty-icon">↑</div>
            <div>Awaiting document</div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'loading' || !result) {
    return (
      <div className="doc-viewer">
        <div className="doc-header">
          <div>
            <div className="doc-title">{file?.name || 'Analyzing…'}</div>
            <div className="doc-title"><small>Running ELA · CNN · GradCAM · Metadata</small></div>
          </div>
          <span className="badge badge-purple"><span className="dot dot-live" /> ANALYZING</span>
        </div>
        <div className="doc-compare">
          <div style={{ position: 'absolute', inset: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton skel-block" style={{ width: '70%', height: '80%' }} />
          </div>
          <div className="scan-bar" />
        </div>
      </div>
    );
  }

  const pageInfo = result.page_info || {};
  return (
    <div className="doc-viewer fade-up">
      <div className="doc-header">
        <div>
          <div className="doc-title">{file?.name || result.filename || 'document'}</div>
          <div className="doc-title">
            <small>
              SHA-256 · {result.sha256 ? result.sha256.slice(0, 4) + '…' + result.sha256.slice(-4) : '—'} · {pageInfo.size_kb ? `${pageInfo.size_kb} KB` : '—'} · {pageInfo.format || '—'}
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-cyan"><span className="dot dot-live" /> READY</span>
          <span className="badge">PAGE {pageInfo.current_page || 1} / {pageInfo.total_pages || 1}</span>
        </div>
      </div>

      <ComparativeSlider
        originalUrl={result.original_url}
        heatmapUrl={result.gradcam_url} />
    </div>
  );
}
