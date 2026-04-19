import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const dragActiveRef = useRef(false);

  // ── FIX 2: drag-on-image blend handle ────────────────────────────────
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    dragActiveRef.current = true;
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!dragActiveRef.current || !containerRef.current) return;
    if (e.cancelable) e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setBlend(Math.round(pct));
  }, [setBlend]);

  const handleDragEnd = useCallback(() => {
    dragActiveRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);
  // ─────────────────────────────────────────────────────────────────────

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
            <div className="doc-title"><small>Running ELA · CNN · GradCAM · Metadata · OCR</small></div>
          </div>
          <span className="badge badge-purple"><span className="dot dot-live" /> ANALYZING</span>
        </div>
        {/* FIX 4 — explicit analyzing placeholder replaces generic skeleton */}
        <div className="doc-compare heatmap-analyzing-wrap" style={{ position: 'relative', aspectRatio: '3 / 2' }}>
          <div className="heatmap-scan-line" />
          <div className="heatmap-analyzing-content">
            <div className="heatmap-analyzing-title">ANALYZING DOCUMENT</div>
            <div className="heatmap-analyzing-sub">PLEASE WAIT…</div>
            <div className="heatmap-analyzing-dots">
              <span /><span /><span />
            </div>
          </div>
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
              // Label geometry now scales with the BOX size (not just the
              // image size). Small regions on low-res documents no longer
              // get dwarfed by oversized "REGION A" labels — the tag is
              // capped so it never exceeds the bounding box itself by more
              // than ~40%, and font size shrinks on tight boxes.
              const labelText = `${(b.label || `REGION ${String.fromCharCode(65 + i)}`).toUpperCase()} ${conf}%`;
              const diag = Math.sqrt(imgDims.naturalW * imgDims.naturalW + imgDims.naturalH * imgDims.naturalH);
              const fontSize = Math.max(8, Math.min(diag * 0.010, b.height * 0.55));
              const tagHeight = Math.max(11, fontSize * 1.35);
              const estTextWidth = labelText.length * fontSize * 0.55;
              const tagWidth = Math.min(
                Math.max(estTextWidth + 10, b.width),
                imgDims.naturalW * 0.30,
              );
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
                    strokeWidth={Math.max(1, Math.min(3, imgDims.naturalW * 0.0018))}
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
                      strokeWidth={Math.max(0.75, Math.min(2, imgDims.naturalW * 0.0012))}
                    />
                    <text
                      x={b.x + tagHeight * 0.35}
                      y={b.y - tagHeight * 0.28}
                      fill="#FF8A80"
                      fontFamily="ui-monospace, 'IBM Plex Mono', 'Fira Code', monospace"
                      fontSize={fontSize}
                      fontWeight={600}
                      letterSpacing="1"
                    >
                      {labelText}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        {/* FIX 2 — draggable handle; inline style overrides pointer-events:none from CSS */}
        <div
          className="divider-handle"
          style={{ left: `${blend}%`, zIndex: 6, pointerEvents: 'auto', cursor: 'col-resize' }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          aria-label="Drag to adjust heatmap blend"
          role="slider"
          aria-valuenow={blend}
          aria-valuemin={2}
          aria-valuemax={98}
        />
        <div className="scan-bar" />
      </div>
      {/* FIX 2 — bottom slider removed; blend is now controlled by dragging the on-image handle */}
    </div>
  );
}
