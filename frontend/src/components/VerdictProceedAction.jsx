import React from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

// FIX 3: prominent full-width CTA rendered between the forensics viewer
// and the verdict section. Clicking it:
//   1. marks hasSeenAnalysis = true (redundant but explicit per spec)
//   2. flips the active screen to 'verdict' (which flips hasSeenVerdict,
//      unlocking Stress + Regional tabs)
//   3. smooth-scrolls the document to #verdict-anchor in the unified
//      scroll container
export default function VerdictProceedAction() {
  const { status, result, setHasSeenAnalysis, setScreen } = useAnalysis();
  if (status !== 'success' || !result) return null;

  const handleProceed = () => {
    setHasSeenAnalysis(true);
    setScreen('verdict');
    // Wait for the verdict anchor to definitely exist in the DOM after
    // the screen-state flip, then scroll smoothly.
    requestAnimationFrame(() => {
      const anchor = document.getElementById('verdict-anchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="verdict-proceed-wrap">
      <button type="button"
              className="verdict-proceed-btn"
              onClick={handleProceed}>
        <span className="verdict-proceed-label">
          FORENSIC ANALYSIS COMPLETE — PROCEED TO VERDICT
        </span>
        <span className="vpb-arrow" aria-hidden="true">↓</span>
      </button>
    </div>
  );
}
