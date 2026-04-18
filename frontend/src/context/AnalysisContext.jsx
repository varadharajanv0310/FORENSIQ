import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
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

  const lastFileRef = useRef(null);
  const lastBase64Ref = useRef(null);
  const lastFilenameRef = useRef(null);
  const lastAttackRef = useRef(null); // { operation, intensity }
  const batchFilesRef = useRef([]);
  const historyIdRef = useRef(0);

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
    setFile(chosenFile);
    setStatus('loading');
    setError(null);
    setResult(null);
    setBaseline(null);
    setCurrentPage(0);
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
  }, [animateSteps, pushHistoryEntry]);

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
  // UI is the first successful file until the user clicks a row.
  const runBatch = useCallback(async (files) => {
    const list = Array.from(files || []).slice(0, 10);
    if (list.length < 2) return; // batch mode requires at least 2 files
    const initial = list.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      filename: f.name || `file_${i + 1}`,
      status: 'pending',
      result: null,
      error: null,
    }));
    batchFilesRef.current = list;
    setBatchResults(initial);
    setBatchProgress({ current: 0, total: list.length, running: true });
    setError(null);

    // Show the spinner on the main panel for the first file.
    setStatus('loading');
    setResult(null);
    setBaseline(null);
    setCurrentPage(0);

    let firstOk = null;
    for (let i = 0; i < list.length; i += 1) {
      const f = list[i];
      setBatchProgress({ current: i + 1, total: list.length, running: true });
      setBatchResults((prev) => prev.map((row, idx) =>
        idx === i ? { ...row, status: 'analyzing' } : row
      ));
      try {
        const data = await analyzeDocument(f);
        setBatchResults((prev) => prev.map((row, idx) =>
          idx === i ? { ...row, status: 'done', result: data } : row
        ));
        pushHistoryEntry(data, f);
        if (firstOk === null) {
          firstOk = { file: f, data };
          setFile(f);
          setResult(data);
          setBaseline(data);
          lastFileRef.current = f;
          lastFilenameRef.current = f.name || null;
          try { lastBase64Ref.current = await fileToBase64(f); } catch (_) { lastBase64Ref.current = null; }
          setStatus('success');
        }
      } catch (e) {
        setBatchResults((prev) => prev.map((row, idx) =>
          idx === i ? { ...row, status: 'error', error: e.message || 'Analysis failed' } : row
        ));
      }
    }
    setBatchProgress((prev) => ({ ...prev, running: false }));
    if (firstOk === null) {
      setError('All batch documents failed');
      setStatus('error');
    }
  }, [pushHistoryEntry]);

  const loadBatchResult = useCallback(async (id) => {
    const row = batchResults.find((r) => r.id === id);
    if (!row || row.status !== 'done' || !row.result) return;
    const idx = batchResults.findIndex((r) => r.id === id);
    const sourceFile = idx >= 0 ? batchFilesRef.current[idx] : null;
    setResult(row.result);
    setBaseline(row.result);
    setStatus('success');
    setError(null);
    setCurrentPage(0);
    if (sourceFile) {
      setFile(sourceFile);
      lastFileRef.current = sourceFile;
      lastFilenameRef.current = sourceFile.name || null;
      try { lastBase64Ref.current = await fileToBase64(sourceFile); } catch (_) { lastBase64Ref.current = null; }
    }
  }, [batchResults]);

  const clearBatch = useCallback(() => {
    setBatchResults([]);
    setBatchProgress({ current: 0, total: 0, running: false });
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
    batchResults, batchProgress,
    runBatch, loadBatchResult, clearBatch,
    steps: PIPELINE_STEPS,
    runAnalyze, runAdversarial, runRegionalOcr,
    retry, retryStress, retryRegional,
    reset,
  }), [file, result, baseline, status, error, stepIndex, currentPage,
      history, batchMode, batchResults, batchProgress,
      runBatch, loadBatchResult, clearBatch,
      runAnalyze, runAdversarial, runRegionalOcr,
      retry, retryStress, retryRegional, reset]);

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return ctx;
}
