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

  const lastFileRef = useRef(null);
  const lastBase64Ref = useRef(null);
  const lastFilenameRef = useRef(null);
  const lastAttackRef = useRef(null); // { operation, intensity }

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

  const runAnalyze = useCallback(async (chosenFile) => {
    if (!chosenFile) return;
    setFile(chosenFile);
    setStatus('loading');
    setError(null);
    setResult(null);
    setBaseline(null);
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
    } catch (e) {
      setError(e.message || 'Analysis failed');
      setStatus('error');
      setStepIndex(-1);
    }
  }, [animateSteps]);

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

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setBaseline(null);
    setStatus('idle');
    setError(null);
    setStepIndex(-1);
    lastFileRef.current = null;
    lastBase64Ref.current = null;
    lastFilenameRef.current = null;
    lastAttackRef.current = null;
  }, []);

  const value = useMemo(() => ({
    file, result, baseline, status, error, stepIndex,
    steps: PIPELINE_STEPS,
    runAnalyze, runAdversarial, runRegionalOcr,
    retry, retryStress, retryRegional,
    reset,
  }), [file, result, baseline, status, error, stepIndex,
      runAnalyze, runAdversarial, runRegionalOcr,
      retry, retryStress, retryRegional, reset]);

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return ctx;
}
