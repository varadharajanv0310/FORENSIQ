import React, { useEffect, useState } from 'react';
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

// Analyze / Verdict are now two distinct tab views rather than one
// long scrollable page. The active tab is driven by local state but
// stays in sync with the shared `screen` value so that Navbar
// navigation and VerdictProceedAction both work without changes.
function UnifiedScreen() {
  const { screen, setScreen, status } = useAnalysis();
  const [activeTab, setActiveTab] = useState('analyze');

  // Sync tab when screen is changed externally (Navbar, VerdictProceedAction).
  useEffect(() => {
    if (screen === 'verdict' && status === 'success') {
      setActiveTab('verdict');
    } else if (screen === 'analysis') {
      setActiveTab('analyze');
    }
  }, [screen, status]);

  const switchToVerdict = () => {
    if (status !== 'success') return;
    setActiveTab('verdict');
    setScreen('verdict');
  };

  const switchToAnalyze = () => {
    setActiveTab('analyze');
    setScreen('analysis');
  };

  return (
    <>
      {/* ── Inline tab bar ── */}
      <div className="analysis-tab-bar">
        <div className="analysis-tabs">
          <button
            type="button"
            className={`analysis-tab${activeTab === 'analyze' ? ' active' : ''}`}
            onClick={switchToAnalyze}
          >
            ◈ ANALYZE
          </button>
          <button
            type="button"
            className={`analysis-tab${activeTab === 'verdict' ? ' active' : ''}${status !== 'success' ? ' locked' : ''}`}
            onClick={switchToVerdict}
            disabled={status !== 'success'}
            title={status !== 'success' ? 'Run an analysis first to unlock the verdict' : undefined}
          >
            ◉ VERDICT{status !== 'success' ? ' · LOCKED' : ''}
          </button>
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'analyze' && <AnalysisBlock />}
      {activeTab === 'verdict' && status === 'success' && (
        <>
          <div className="verdict-back-wrap">
            <button type="button" className="verdict-back-btn" onClick={switchToAnalyze}>
              ← BACK TO ANALYZE
            </button>
          </div>
          <VerdictBlock />
        </>
      )}
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
