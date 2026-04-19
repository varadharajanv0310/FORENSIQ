import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeDocument, applyAdversarial, fileToBase64, runOcr } from '../services/api.js';

const AnalysisContext = createContext(null);

const PIPELINE_STEPS = [
  { id: 'INIT',   label: 'Loading document' },
  { id: 'PARSE',  label: 'Parsing structure' },
  { id: 'META',   label: 'Extracting metadata' },
  { id: 'ELA',    label: 'Error-level analysis' },
  { id: 'CNN',    label: 'EfficientNet inference' },
  { id: 'GRAD',   label: 'GradCAM heatmap' },
  { id: 'OCR',    label: 'OCR + script detection' },
  { id: 'FONT',   label: 'Font consistency' },
  { id: 'ENSMBL', label: 'Weighted ensemble' },
  { id: 'DONE',   label: 'Verdict ready' },
];

const INITIAL_SCREEN = (() => {
  try { return localStorage.getItem('forensiq.screen') || 'landing'; }
  catch (e) { return 'landing'; }
})();

export function AnalysisProvider({ children }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [error, setError] = useState(null);
  const [stepIndex, setStepIndex] = useState(-1);
  // Current page index (0-based) for multi-page PDFs. Purely a view-state
  // value — changing it never fires /analyze, it just re-selects which
  // entry from result.pages the Forensics Viewer + Timeline render.
  const [currentPage, setCurrentPage] = useState(0);

  // Session-scoped history for the confidence-history chart. One entry
  // per successful /analyze. Resets only on page reload.
  const [history, setHistory] = useState([]);

  // Batch-mode state for multi-file upload.
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState([]); // [{ id, filename, status, result?, error? }]
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, running: false });
  // id of the row currently loaded into the viewer — drives the chip
  // selector's "selected" highlight and the per-document verdict switcher.
  const [activeBatchId, setActiveBatchId] = useState(null);

  // Navigation state — lives in context so UploadZone, the keyboard
  // shortcut hook, and the proceed-to-verdict button can all steer it
  // without lifting callbacks through three layers of props.
  const [screen, setScreenRaw] = useState(INITIAL_SCREEN);
  const [hasSeenAnalysis, setHasSeenAnalysis] = useState(false);
  const [hasSeenVerdict, setHasSeenVerdict] = useState(false);

  // Shared view-state for keyboard shortcuts + UI widgets.
  const [blend, setBlend] = useState(50);                 // 0–100, GradCAM opacity on ForensicsViewer
  const [overlay, setOverlay] = useState('gradcam');      // 'gradcam' | 'ela'
  const [terminalMinimized, setTerminalMinimized] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const lastFileRef = useRef(null);
  const lastBase64Ref = useRef(null);
  const lastFilenameRef = useRef(null);
  const lastAttackRef = useRef(null); // { operation, intensity }
  const batchFilesRef = useRef([]);
  const historyIdRef = useRef(0);

  // Persist screen selection so F5 doesn't always bounce the user back
  // to the hero page.
  useEffect(() => {
    try { localStorage.setItem('forensiq.screen', screen); } catch (e) { /* noop */ }
  }, [screen]);

  const setScreen = useCallback((next) => {
    if (next === 'analysis') setHasSeenAnalysis(true);
    if (next === 'verdict')  setHasSeenVerdict(true);
    setScreenRaw(next);
  }, []);

  const toggleTerminal = useCallback(() => setTerminalMinimized((v) => !v), []);
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);

  const adjustBlend = useCallback((delta) => {
    setBlend((prev) => Math.max(0, Math.min(100, prev + delta)));
  }, []);

  const animateSteps = useCallback((apiPromise) => {
    let cancelled = false;
    setStepIndex(0);
    let current = 0;
    const total = PIPELINE_STEPS.length;
    const interval = setInterval(() => {
      current += 1;
      if (current >= total - 1) {
        clearInterval(interval);
        return;
      }
      if (!cancelled) setStepIndex(current);
    }, 800);

    apiPromise.finally(() => {
      clearInterval(interval);
      if (!cancelled) setStepIndex(total - 1);
    });

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const pushHistoryEntry = useCallback((data, sourceFile) => {
    if (!data) return;
    historyIdRef.current += 1;
    const entry = {
      id: historyIdRef.current,
      filename: sourceFile?.name || data.filename || 'document',
      verdict: data.verdict || 'GENUINE',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      timestamp: new Date().toISOString(),
    };
    setHistory((prev) => [...prev, entry]);
  }, []);

  const runAnalyze = useCallback(async (chosenFile) => {
    if (!chosenFile) return;
    // FIX 2: flip the screen state BEFORE we start awaiting the analyze
    // promise so ProcessingLog becomes visible immediately.
    setScreen('analysis');
    setFile(chosenFile);
    setStatus('loading');
    setError(null);
    setResult(null);
    setBaseline(null);
    setCurrentPage(0);
    setActiveBatchId(null);
    lastFileRef.current = chosenFile;
    lastFilenameRef.current = chosenFile.name || null;
    try {
      lastBase64Ref.current = await fileToBase64(chosenFile);
    } catch (e) {
      lastBase64Ref.current = null;
    }
    const p = analyzeDocument(chosenFile);
    animateSteps(p);
    try {
      const data = await p;
      setResult(data);
      setBaseline(data);
      setStatus('success');
      pushHistoryEntry(data, chosenFile);
    } catch (e) {
      setError(e.message || 'Analysis failed');
      setStatus('error');
      setStepIndex(-1);
    }
  }, [animateSteps, pushHistoryEntry, setScreen]);

  const runAdversarial = useCallback(async (operation, intensity) => {
    if (!lastBase64Ref.current) {
      setError('No source document loaded');
      setStatus('error');
      return;
    }
    lastAttackRef.current = { operation, intensity };
    setStatus('loading');
    setError(null);
    const p = applyAdversarial(
      lastBase64Ref.current,
      operation,
      intensity,
      lastFilenameRef.current,
    );
    animateSteps(p);
    try {
      const data = await p;
      setResult(data);
      setStatus('success');
    } catch (e) {
      setError(e.message || 'Adversarial run failed');
      setStatus('error');
      setStepIndex(-1);
    }
  }, [animateSteps]);

  const runRegionalOcr = useCallback(async () => {
    if (!lastBase64Ref.current) {
      setError('No source document loaded');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const data = await runOcr(lastBase64Ref.current, lastFilenameRef.current);
      // Splice the fresh regional_language onto the existing result so the
      // rest of the dashboard (ELA, CNN, GradCAM, etc.) stays intact.
      setResult((prev) => prev ? { ...prev, regional_language: data.regional_language } : prev);
      setStatus('success');
    } catch (e) {
      setError(e.message || 'OCR failed');
      setStatus('error');
    }
  }, []);

  // Tab-scoped retries. Each one re-runs ONLY its own endpoint using the
  // file already cached in state, so the other tabs' results survive.
  const retry = useCallback(() => {
    if (lastFileRef.current) runAnalyze(lastFileRef.current);
  }, [runAnalyze]);

  const retryStress = useCallback(() => {
    const attack = lastAttackRef.current;
    if (attack) {
      runAdversarial(attack.operation, attack.intensity);
    } else if (lastFileRef.current) {
      // No prior attack to retry — fall back to re-analyzing so the
      // baseline comes back online; a stress run needs a baseline first.
      runAnalyze(lastFileRef.current);
    }
  }, [runAdversarial, runAnalyze]);

  const retryRegional = useCallback(() => {
    runRegionalOcr();
  }, [runRegionalOcr]);

  // Batch pipeline: analyze 2–10 files sequentially, update a row-by-row
  // results table, and push each successful result into the session
  // history. The currently-selected "active" document in the rest of the
  // UI is the most recently analyzed successful file once the batch
  // finishes (per FIX 6).
  const runBatch = useCallback(async (files) => {
    const list = Array.from(files || []).slice(0, 10);
    if (list.length < 2) return; // batch mode requires at least 2 files
    // FIX 2: transition to the analysis screen up-front so the user
    // sees the batch table + processing log rather than the hero.
    setScreen('analysis');
    const initial = list.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      filename: f.name || `file_${i + 1}`,
      status: 'pending',
      result: null,
      error: null,
      size: f.size || 0,
      startedAt: null,
      finishedAt: null,
    }));
    batchFilesRef.current = list;
    setBatchResults(initial);
    setActiveBatchId(null);
    setBatchProgress({ current: 0, total: list.length, running: true });
    setError(null);

    // Show the spinner on the main panel for the first file.
    setStatus('loading');
    setResult(null);
    setBaseline(null);
    setCurrentPage(0);

    let firstOk = null;
    let lastOk = null;
    for (let i = 0; i < list.length; i += 1) {
      const f = list[i];
      setBatchProgress({ current: i + 1, total: list.length, running: true });
      const startedAt = Date.now();
      setBatchResults((prev) => prev.map((row, idx) =>
        idx === i ? { ...row, status: 'analyzing', startedAt } : row
      ));
      try {
        const data = await analyzeDocument(f);
        const rowId = initial[i].id;
        const finishedAt = Date.now();
        setBatchResults((prev) => prev.map((row, idx) =>
          idx === i ? { ...row, status: 'done', result: data, finishedAt } : row
        ));
        pushHistoryEntry(data, f);
        lastOk = { file: f, data, id: rowId };
        if (firstOk === null) {
          firstOk = lastOk;
          // Load the first success immediately so the viewer stops
          // showing the spinner for the rest of the batch.
          setFile(f);
          setResult(data);
          setBaseline(data);
          setActiveBatchId(rowId);
          lastFileRef.current = f;
          lastFilenameRef.current = f.name || null;
          try { lastBase64Ref.current = await fileToBase64(f); } catch (_) { lastBase64Ref.current = null; }
          setStatus('success');
        }
      } catch (e) {
        const finishedAt = Date.now();
        setBatchResults((prev) => prev.map((row, idx) =>
          idx === i ? { ...row, status: 'error', error: e.message || 'Analysis failed', finishedAt } : row
        ));
      }
    }
    setBatchProgress((prev) => ({ ...prev, running: false }));
    // FIX 6: swap the active document to the LAST successful result
    // once the batch finishes — "most recently analyzed" is the default.
    if (lastOk && lastOk.id !== firstOk?.id) {
      setFile(lastOk.file);
      setResult(lastOk.data);
      setBaseline(lastOk.data);
      setActiveBatchId(lastOk.id);
      lastFileRef.current = lastOk.file;
      lastFilenameRef.current = lastOk.file.name || null;
      try { lastBase64Ref.current = await fileToBase64(lastOk.file); } catch (_) { lastBase64Ref.current = null; }
      setCurrentPage(0);
      setStatus('success');
    }
    if (firstOk === null) {
      setError('All batch documents failed');
      setStatus('error');
    }
  }, [pushHistoryEntry, setScreen]);

  const loadBatchResult = useCallback(async (id) => {
    const rows = batchResults;
    const row = rows.find((r) => r.id === id);
    if (!row || row.status !== 'done' || !row.result) return;
    const idx = rows.findIndex((r) => r.id === id);
    const sourceFile = idx >= 0 ? batchFilesRef.current[idx] : null;
    setResult(row.result);
    setBaseline(row.result);
    setStatus('success');
    setError(null);
    setCurrentPage(0);
    setActiveBatchId(id);
    if (sourceFile) {
      setFile(sourceFile);
      lastFileRef.current = sourceFile;
      lastFilenameRef.current = sourceFile.name || null;
      try { lastBase64Ref.current = await fileToBase64(sourceFile); } catch (_) { lastBase64Ref.current = null; }
    }
  }, [batchResults]);

  // Keyboard-accessible sibling navigation across batch chips.
  const shiftBatchSelection = useCallback((delta) => {
    const doneRows = batchResults.filter((r) => r.status === 'done' && r.result);
    if (doneRows.length === 0) return;
    const currentIdx = activeBatchId
      ? doneRows.findIndex((r) => r.id === activeBatchId)
      : 0;
    const nextIdx = Math.max(0, Math.min(doneRows.length - 1, (currentIdx < 0 ? 0 : currentIdx) + delta));
    const next = doneRows[nextIdx];
    if (next && next.id !== activeBatchId) loadBatchResult(next.id);
  }, [batchResults, activeBatchId, loadBatchResult]);

  const clearBatch = useCallback(() => {
    setBatchResults([]);
    setBatchProgress({ current: 0, total: 0, running: false });
    setActiveBatchId(null);
    batchFilesRef.current = [];
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setBaseline(null);
    setStatus('idle');
    setError(null);
    setStepIndex(-1);
    setCurrentPage(0);
    setActiveBatchId(null);
    lastFileRef.current = null;
    lastBase64Ref.current = null;
    lastFilenameRef.current = null;
    lastAttackRef.current = null;
  }, []);

  const value = useMemo(() => ({
    file, result, baseline, status, error, stepIndex,
    currentPage, setCurrentPage,
    history,
    batchMode, setBatchMode,
    batchResults, batchProgress, activeBatchId,
    runBatch, loadBatchResult, clearBatch, shiftBatchSelection,
    steps: PIPELINE_STEPS,
    runAnalyze, runAdversarial, runRegionalOcr,
    retry, retryStress, retryRegional,
    reset,
    // navigation
    screen, setScreen, hasSeenAnalysis, hasSeenVerdict,
    setHasSeenAnalysis, setHasSeenVerdict,
    // shared UI state
    blend, setBlend, adjustBlend,
    overlay, setOverlay,
    terminalMinimized, toggleTerminal,
    showShortcuts, toggleShortcuts,
  }), [file, result, baseline, status, error, stepIndex, currentPage,
      history, batchMode, batchResults, batchProgress, activeBatchId,
      runBatch, loadBatchResult, clearBatch, shiftBatchSelection,
      runAnalyze, runAdversarial, runRegionalOcr,
      retry, retryStress, retryRegional, reset,
      screen, setScreen, hasSeenAnalysis, hasSeenVerdict,
      blend, adjustBlend, overlay,
      terminalMinimized, toggleTerminal,
      showShortcuts, toggleShortcuts]);

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return ctx;
}
