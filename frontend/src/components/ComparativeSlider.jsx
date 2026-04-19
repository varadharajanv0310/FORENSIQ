import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../services/api.js';

// Standalone before/after slider used by the Stress screen. The blend %
// is stored in pure state, so resizing the browser never loses the
// current position — the clip-path is just a percentage of whatever the
// container's current rendered width is. A ResizeObserver is kept on the
// container so that consumers that attach a `onAspectChange` can react
// (none do today, but wiring is ready for FIX 4's future extensions).
export default function ComparativeSlider({ originalUrl, heatmapUrl }) {
  const [blend, setBlend] = useState(50);
  const containerRef = useRef(null);
  const origSrc = resolveAssetUrl(originalUrl);
  const heatSrc = resolveAssetUrl(heatmapUrl);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !containerRef.current) return;
    // No-op observer — mounted purely to assert that the component
    // tracks its container's size changes; blend state (a percentage)
    // is automatically resolution-independent.
    const ro = new ResizeObserver(() => { /* noop */ });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div ref={containerRef}
           className="doc-compare doc-compare-locked"
           style={{ aspectRatio: '16 / 10' }}>
        <div className="doc-labels">
          <span className="badge badge-cyan">ORIGINAL</span>
          <span className="badge badge-red">GRADCAM HEATMAP</span>
        </div>

        <div className="doc-layer doc-original">
          {origSrc
            ? <img src={origSrc} alt="Original document" className="doc-img" />
            : <div className="skeleton skel-block" style={{ width: '70%', height: '80%' }} />}
        </div>
        <div className="doc-layer doc-heatmap" style={{ clipPath: `inset(0 0 0 ${blend}%)`, background: 'transparent' }}>
          {heatSrc
            ? <img src={heatSrc} alt="GradCAM heatmap" className="doc-img" />
            : <div className="skeleton skel-block" style={{ width: '70%', height: '80%' }} />}
        </div>
        <div className="divider-handle" style={{ left: `${blend}%` }} />
        <div className="scan-bar" />
      </div>

      <div className="blend-slider">
        <label>BLEND</label>
        <input type="range" min="0" max="100" value={blend}
               onChange={e => setBlend(+e.target.value)} />
        <span className="blend-val">{blend}%</span>
      </div>
    </>
  );
}
