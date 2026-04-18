import React from 'react';
import { HeroWaves } from './FX.jsx';
import UploadZone from './UploadZone.jsx';

export default function HeroSection({ onEnterApp }) {
  return (
    <div className="hero">
      <div className="horizon-glow" />
      <HeroWaves />

      <div className="container">
        <div className="hero-inner">
          <div className="eyebrow">INTEGRITY LAYER v4.2 · LIVE</div>
          <h1>FORENSIQ</h1>
          <h2>
            <span style={{ color: 'var(--text-dim)' }}>AI-powered </span>
            <span className="grad-text">document forgery detection</span>
          </h2>
          <p className="hero-sub">
            Three independent signals — error-level analysis, CNN inference, and metadata forensics —
            ensembled into a single explainable verdict. Built for banks, border control,
            and the documents that can't afford to be wrong.
          </p>
          <div className="hero-actions">
            <button className="cta" onClick={onEnterApp}>
              <span>Analyze Document</span>
              <span style={{ fontFamily: 'var(--mono)' }}>→</span>
            </button>
            <button className="cta cta-ghost" onClick={onEnterApp}>View Demo Report</button>
          </div>

          <div className="hero-upload">
            <UploadZone onUploaded={onEnterApp} compact />
          </div>

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">DETECTION ACCURACY</div>
              <div className="stat-value">99.2<span className="unit">%</span></div>
              <div className="stat-desc">Benchmarked on 14,000 held-out tampered and genuine documents across five scripts.</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">INDEPENDENT SIGNALS</div>
              <div className="stat-value">3<span className="unit"> × ensembled</span></div>
              <div className="stat-desc">ELA, EfficientNet-B0 with GradCAM, and structural metadata — each weighted, each explainable.</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">REGIONAL SCRIPTS</div>
              <div className="stat-value">6<span className="unit"> supported</span></div>
              <div className="stat-desc">Tamil, Hindi, Telugu, Kannada, Malayalam, English — glyph-level metric checks.</div>
            </div>
          </div>

          <div className="feature-strip">
            <div className="feature-strip-item"><span>&lt; 2.4 s</span><span>MEDIAN LATENCY</span></div>
            <div className="feature-strip-item"><span>SOC 2 II</span><span>COMPLIANT</span></div>
            <div className="feature-strip-item"><span>ON-PREM</span><span>DEPLOYABLE</span></div>
            <div className="feature-strip-item"><span>GRADCAM</span><span>EXPLAINABILITY</span></div>
            <div className="feature-strip-item"><span>ISO 27001</span><span>CERTIFIED</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
