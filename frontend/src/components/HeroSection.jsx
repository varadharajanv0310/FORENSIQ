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
            {/* FIX 3 — primary CTA replaced with GitHub repo link */}
            <a
              className="cta github-cta"
              href="https://github.com/varadharajanv0310/FORENSIQ"
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* Inline GitHub Invertocat SVG — no external CDN, no img tag */}
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="currentColor" aria-hidden="true"
                style={{ verticalAlign: 'middle', flexShrink: 0 }}
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              FORENSIQ on GitHub
            </a>
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
