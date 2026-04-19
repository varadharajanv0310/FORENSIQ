import React, { useEffect, useRef, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { resolveAssetUrl } from '../services/api.js';
import { ErrorBanner } from './FX.jsx';

// Pagination-aware forensics panel. All heatmap, ELA, and bounding-box
// data is pulled directly from result.pages[currentPage] — navigating
// pages mutates only the local state.currentPage value via context and
// never fires a network request.
//
// FIX 4: the blend slider state is lifted into AnalysisContext so the
// keyboard shortcut hook (Shift+↑ / ] / Shift+↓ / [) can drive it.
// Bounding-box coordinates are recomputed on every container resize via
// a ResizeObserver so the overlay stays aligned when the grid reflows.
export default function ForensicsViewer() {
  const {
    result, status, file, error, retry, currentPage, setCurrentPage,
    blend, setBlend, overlay, setOverlay,
  } = useAnalysis();
  const [imgDims, setImgDims] = useState({ naturalW: 0, naturalH: 0, renderedW: 0, renderedH: 0 });
  const [boxesAnimated, setBoxesAnimated] = useState(0); // index-inclusive
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  const pages = Array.isArray(result?.pages) && result.pages.length > 0 ? result.pages : null;
  const totalPages = pages ? pages.length : 1;
  const safeIndex = pages ? Math.min(Math.max(0, currentPage || 0), totalPages - 1) : 0;
  const activePage = pages ? pages[safeIndex] : null;

  const originalUrl = activePage?.original_url || result?.original_url || '';
  const gradcamUrl = activePage?.gradcam_url || result?.gradcam_url || '';
  const elaHeatmapUrl =
    activePage?.ela_heatmap_url ||
    result?.signals?.ela?.heatmap_url ||
    '';
  const boundingBoxes = activePage?.bounding_boxes || result?.bounding_boxes || [];

  // Reset bounding-box reveal whenever the active page changes so each
  // page's boxes animate in fresh after the scan bar completes.
  useEffect(() => {
    setBoxesAnimated(0);
    if (!activePage || !boundingBoxes.length) return;
    const delays = boundingBoxes.map((_, i) => 900 + i * 300);
    const timeouts = delays.map((d, i) =>
      setTimeout(() => setBoxesAnimated((n) => Math.max(n, i + 1)), d)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [safeIndex, activePage?.gradcam_url, boundingBoxes.length]);

  const measure = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgDims({
      naturalW: img.naturalWidth || 0,
      naturalH: img.naturalHeight || 0,
      renderedW: img.clientWidth || 0,
      renderedH: img.clientHeight || 0,
    });
  };

  // FIX 4: ResizeObserver on the viewer container recomputes the SVG
  // coordinate system whenever the layout changes (window resize, nav
  // tabs wrapping on narrow viewports, parent grid reflowing, etc).
  // Falls back to a plain window resize listener for very old browsers.
  useEffect(() => {
    measure();
    const onWinResize = () => measure();
    window.addEventListener('resize', onWinResize);

    let ro;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', onWinResize);
      if (ro) ro.disconnect();
    };
  }, [originalUrl]);

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
  const multiPage = totalPages > 1;
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < totalPages - 1;
  const goPrev = () => hasPrev && setCurrentPage(safeIndex - 1);
  const goNext = () => hasNext && setCurrentPage(safeIndex + 1);

  const activeOverlayUrl = overlay === 'ela' ? elaHeatmapUrl : gradcamUrl;

  return (
    <div className="doc-viewer fade-up" id="forensics-viewer-root">
      <div className="doc-header">
        <div>
          <div className="doc-title">{file?.name || result.filename || 'document'}</div>
          <div className="doc-title">
            <small>
              SHA-256 · {result.sha256 ? result.sha256.slice(0, 4) + '…' + result.sha256.slice(-4) : '—'} · {pageInfo.size_kb ? `${pageInfo.size_kb} KB` : '—'} · {pageInfo.format || '—'}
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            border: '1px solid var(--border-soft)', borderRadius: 8,
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
          }}>
            <button
              type="button"
              onClick={() => setOverlay('gradcam')}
              style={{
                background: overlay === 'gradcam' ? 'rgba(198,40,40,0.22)' : 'transparent',
                color: overlay === 'gradcam' ? '#FF8A80' : 'var(--text-faint)',
                border: 'none', padding: '4px 10px', cursor: 'pointer',
                borderRadius: 4, letterSpacing: '0.14em',
              }}>GRADCAM</button>
            <button
              type="button"
              onClick={() => setOverlay('ela')}
              style={{
                background: overlay === 'ela' ? 'rgba(79,195,247,0.22)' : 'transparent',
                color: overlay === 'ela' ? '#4FC3F7' : 'var(--text-faint)',
                border: 'none', padding: '4px 10px', cursor: 'pointer',
                borderRadius: 4, letterSpacing: '0.14em',
              }}>ELA</button>
          </div>
          <span className="badge badge-cyan"><span className="dot dot-live" /> READY</span>
          {multiPage ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px',
              border: '1px solid var(--border-soft)',
              borderRadius: 8,
            }}>
              <button
                type="button"
                aria-label="Previous page"
                onClick={goPrev}
                disabled={!hasPrev}
                style={{
                  background: 'transparent',
                  color: hasPrev ? 'var(--text)' : 'var(--text-faint)',
                  border: 'none',
                  padding: '2px 8px',
                  cursor: hasPrev ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--mono)',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >‹</button>
              <span style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
              }}>
                PAGE {safeIndex + 1} OF {totalPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                onClick={goNext}
                disabled={!hasNext}
                style={{
                  background: 'transparent',
                  color: hasNext ? 'var(--text)' : 'var(--text-faint)',
                  border: 'none',
                  padding: '2px 8px',
                  cursor: hasNext ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--mono)',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >›</button>
            </div>
          ) : (
            <span className="badge">PAGE {pageInfo.current_page || 1} / {pageInfo.total_pages || 1}</span>
          )}
        </div>
      </div>

      <div ref={containerRef}
           className="doc-compare"
           style={{ position: 'relative', aspectRatio: '3 / 2' }}>
        <div className="doc-labels">
          <span className="badge badge-cyan">ORIGINAL</span>
          <span className={`badge ${overlay === 'ela' ? 'badge-cyan' : 'badge-red'}`}>
            {overlay === 'ela' ? 'ELA RESIDUAL' : 'GRADCAM HEATMAP'}
          </span>
        </div>

        <div className="doc-layer doc-original">
          {originalUrl
            ? <img
                ref={imgRef}
                key={`orig-${originalUrl}`}
                src={resolveAssetUrl(originalUrl)}
                alt={`Original document page ${safeIndex + 1}`}
                className="doc-img"
                onLoad={measure} />
            : <div className="skeleton skel-block" style={{ width: '70%', height: '80%' }} />}
        </div>
        <div className="doc-layer doc-heatmap"
             style={{ clipPath: `inset(0 0 0 ${blend}%)`, background: 'transparent' }}>
          {activeOverlayUrl
            ? <img
                key={`ovl-${activeOverlayUrl}`}
                src={resolveAssetUrl(activeOverlayUrl)}
                alt={`${overlay === 'ela' ? 'ELA residual' : 'GradCAM'} heatmap for page ${safeIndex + 1}`}
                className="doc-img" />
            : <div className="skeleton skel-block" style={{ width: '70%', height: '80%' }} />}
        </div>

        {/* Bounding-box overlay — always on top, visible in both views.
            The SVG uses viewBox in natural-image space, so even as the
            container reflows via ResizeObserver the box positions stay
            correct without an explicit recompute. */}
        {imgDims.naturalW > 0 && imgDims.renderedW > 0 && boundingBoxes.length > 0 && (
          <svg
            key={`bx-${safeIndex}-${imgDims.renderedW}x${imgDims.renderedH}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0, top: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
              zIndex: 5,
            }}
            viewBox={`0 0 ${imgDims.naturalW} ${imgDims.naturalH}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {boundingBoxes.slice(0, 3).map((b, i) => {
              const visible = i < boxesAnimated;
              const conf = Math.round((b.confidence || 0) * 100);
              const tagHeight = Math.max(28, imgDims.naturalH * 0.035);
              const tagWidth = Math.max(180, imgDims.naturalW * 0.18);
              const fontSize = Math.max(14, imgDims.naturalH * 0.018);
              return (
                <g key={`${safeIndex}-${i}`}
                   style={{
                     opacity: visible ? 1 : 0,
                     transition: 'opacity 0.35s ease, transform 0.35s ease',
                     transform: visible ? 'translate(0,0)' : 'translate(0, 6px)',
                   }}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.width}
                    height={b.height}
                    fill="rgba(198,40,40,0.04)"
                    stroke="#FF2D2D"
                    strokeWidth={Math.max(2, imgDims.naturalW * 0.0025)}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(198,40,40,0.85))' }}
                  />
                  <g>
                    <rect
                      x={b.x}
                      y={b.y - tagHeight}
                      width={tagWidth}
                      height={tagHeight}
                      fill="#080B14"
                      stroke="#FF2D2D"
                      strokeWidth={Math.max(1, imgDims.naturalW * 0.0015)}
                    />
                    <text
                      x={b.x + 10}
                      y={b.y - tagHeight * 0.3}
                      fill="#FF8A80"
                      fontFamily="ui-monospace, 'IBM Plex Mono', 'Fira Code', monospace"
                      fontSize={fontSize}
                      fontWeight={600}
                      letterSpacing="1.5"
                    >
                      {b.label?.toUpperCase() || `REGION ${String.fromCharCode(65 + i)}`} · {conf}%
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        <div className="divider-handle" style={{ left: `${blend}%`, zIndex: 6 }} />
        <div className="scan-bar" />
      </div>

      <div className="blend-slider">
        <label>BLEND</label>
        <input type="range" min="0" max="100" value={blend}
               onChange={e => setBlend(+e.target.value)} />
        <span className="blend-val">{blend}%</span>
      </div>
    </div>
  );
}
