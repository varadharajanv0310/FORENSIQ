import React, { useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import HeroSection from './components/HeroSection.jsx';
import UploadZone from './components/UploadZone.jsx';
import ProcessingLog from './components/ProcessingLog.jsx';
import ForensicsViewer from './components/ForensicsViewer.jsx';
import VerdictCard from './components/VerdictCard.jsx';
import ConfidenceTimeline from './components/ConfidenceTimeline.jsx';
import MultiSignalReport from './components/MultiSignalReport.jsx';
import BatchResultsTable from './components/BatchResultsTable.jsx';
import ConfidenceHistory from './components/ConfidenceHistory.jsx';
import VerdictProceedAction from './components/VerdictProceedAction.jsx';
import BatchDocumentSelector from './components/BatchDocumentSelector.jsx';
import AdversarialPanel from './components/AdversarialPanel.jsx';
import RegionalLanguagePanel from './components/RegionalLanguagePanel.jsx';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.jsx';
import { Backdrop, ErrorBanner } from './components/FX.jsx';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext.jsx';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts.js';

function AnalysisBlock() {
  const { status, error, retry } = useAnalysis();
  return (
    <div className="analysis">
      <ProcessingLog />
      <div className="analysis-main">
        <UploadZone />
        {status === 'error' && <ErrorBanner message={error} onRetry={retry} />}
        <ForensicsViewer />
        <BatchResultsTable />
        {/* Prominent CTA between analysis + verdict — only renders
            once a successful result is available. */}
        <VerdictProceedAction />
      </div>
      <ConfidenceTimeline />
    </div>
  );
}

function VerdictBlock() {
  const { result, file } = useAnalysis();
  const ts = new Date().toUTCString().replace(/ GMT/, ' UTC');
  return (
    <div className="verdict-wrap" id="verdict-anchor">
      <div className="horizon-glow red" style={{ bottom: '-400px', opacity: 0.55 }} />
      <div className="container">
        <div className="section-header">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, color: '#FF8A80' }}>
              VERDICT · {result?.session_id || 'SESSION'}
            </div>
            <h2>Document integrity report</h2>
            <p className="sub">
              Generated {ts}{result?.elapsed_ms ? ` · ${(result.elapsed_ms / 1000).toFixed(2)}s end-to-end` : ''} · {file?.name || 'no document loaded'}
            </p>
          </div>
          <div className="section-header-meta">
            <span className="dot dot-live" /> LIVE
            <span className="kbd">⌘ P</span> EXPORT PDF
          </div>
        </div>

        {/* FIX 6: per-document chip row — hidden when batch count < 2 */}
        <BatchDocumentSelector />

        <VerdictCard />
        <ConfidenceHistory />
        <div style={{ height: 24 }} />
        <MultiSignalReport />
      </div>
    </div>
  );
}

// FIX 3: merged analysis + verdict into a single scrollable container.
// - When status !== 'success' we still show the analysis block so the
//   user has a page to interact with during loading/error.
// - When status === 'success' we render VerdictBlock immediately below,
//   with an anchor so the "PROCEED" button can smooth-scroll to it.
// - Whichever screen the user is on ('analysis' or 'verdict') renders
//   the same unified layout; the 'verdict' screen just auto-scrolls to
//   the anchor on mount so the Navbar tab still feels like it took the
//   user somewhere.
function UnifiedScreen() {
  const { screen, status } = useAnalysis();

  useEffect(() => {
    if (screen !== 'verdict') return;
    if (status !== 'success') return;
    // Run after paint so the anchor node definitely exists.
    const t = setTimeout(() => {
      const anchor = document.getElementById('verdict-anchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    return () => clearTimeout(t);
  }, [screen, status]);

  return (
    <>
      <AnalysisBlock />
      {status === 'success' && <VerdictBlock />}
    </>
  );
}

function AppInner() {
  const { screen, setScreen } = useAnalysis();

  // FIX 5: wire global + analysis + verdict keyboard shortcuts.
  useKeyboardShortcuts();

  return (
    <div className="app">
      <Backdrop />
      <Navbar />

      {screen === 'landing'  && <HeroSection onEnterApp={() => setScreen('analysis')} />}
      {(screen === 'analysis' || screen === 'verdict') && <UnifiedScreen />}
      {screen === 'stress'   && <AdversarialPanel />}
      {screen === 'regional' && <RegionalLanguagePanel />}

      <KeyboardShortcutsModal />
    </div>
  );
}

export default function App() {
  return (
    <AnalysisProvider>
      <AppInner />
    </AnalysisProvider>
  );
}
