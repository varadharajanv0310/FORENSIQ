import React, { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import HeroSection from './components/HeroSection.jsx';
import UploadZone from './components/UploadZone.jsx';
import ProcessingLog from './components/ProcessingLog.jsx';
import ForensicsViewer from './components/ForensicsViewer.jsx';
import VerdictCard from './components/VerdictCard.jsx';
import ConfidenceTimeline from './components/ConfidenceTimeline.jsx';
import MultiSignalReport from './components/MultiSignalReport.jsx';
import AdversarialPanel from './components/AdversarialPanel.jsx';
import RegionalLanguagePanel from './components/RegionalLanguagePanel.jsx';
import { Backdrop, ErrorBanner } from './components/FX.jsx';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext.jsx';

function ScreenAnalysis() {
  const { status, error, retry } = useAnalysis();
  return (
    <div className="analysis">
      <ProcessingLog />
      <div className="analysis-main">
        <UploadZone />
        {status === 'error' && <ErrorBanner message={error} onRetry={retry} />}
        <ForensicsViewer />
      </div>
      <ConfidenceTimeline />
    </div>
  );
}

function ScreenVerdict() {
  const { result, file } = useAnalysis();
  const ts = new Date().toUTCString().replace(/ GMT/, ' UTC');
  return (
    <div className="verdict-wrap">
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

        <VerdictCard />
        <div style={{ height: 24 }} />
        <MultiSignalReport />
      </div>
    </div>
  );
}

function AppInner() {
  const [screen, setScreen] = useState(() => {
    try { return localStorage.getItem('forensiq.screen') || 'landing'; } catch (e) { return 'landing'; }
  });
  useEffect(() => {
    try { localStorage.setItem('forensiq.screen', screen); } catch (e) { /* noop */ }
  }, [screen]);

  const { status } = useAnalysis();

  useEffect(() => {
    if (status === 'success' && screen === 'analysis') {
      const t = setTimeout(() => setScreen('verdict'), 900);
      return () => clearTimeout(t);
    }
  }, [status, screen]);

  return (
    <div className="app">
      <Backdrop />
      <Navbar screen={screen} setScreen={setScreen} />

      {screen === 'landing'  && <HeroSection onEnterApp={() => setScreen('analysis')} />}
      {screen === 'analysis' && <ScreenAnalysis />}
      {screen === 'verdict'  && <ScreenVerdict />}
      {screen === 'stress'   && <AdversarialPanel />}
      {screen === 'regional' && <RegionalLanguagePanel />}
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
