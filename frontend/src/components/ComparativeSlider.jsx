import React, { useState } from 'react';
import { resolveAssetUrl } from '../services/api.js';

export default function ComparativeSlider({ originalUrl, heatmapUrl }) {
  const [blend, setBlend] = useState(50);
  const origSrc = resolveAssetUrl(originalUrl);
  const heatSrc = resolveAssetUrl(heatmapUrl);

  return (
    <>
      <div className="doc-compare">
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
