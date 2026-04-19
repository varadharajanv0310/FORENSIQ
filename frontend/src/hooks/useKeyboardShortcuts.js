import { useEffect } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';
import { exportReportPdf } from '../utils/exportPdf.js';

// Global shortcut controller (FIX 5). One effect registered on window;
// it pulls every bit of state it needs from context so there's a single
// source of truth. Shortcuts are silently ignored while the user is
// typing in an input / textarea / contenteditable field, with the
// exception of Esc which is always honored.

const isEditable = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
};

export default function useKeyboardShortcuts() {
  const ctx = useAnalysis();
  const {
    screen, setScreen,
    result, hasSeenAnalysis, hasSeenVerdict, status,
    currentPage, setCurrentPage,
    adjustBlend,
    toggleTerminal,
    showShortcuts, toggleShortcuts, setHasSeenAnalysis,
    clearBatch, reset, runAnalyze, file,
    shiftBatchSelection,
  } = ctx;

  useEffect(() => {
    const onKey = (e) => {
      const editable = isEditable(document.activeElement);

      // Esc always wins — closes the modal first, otherwise falls back
      // to returning to Landing + clearing the batch + deselecting.
      if (e.key === 'Escape') {
        if (showShortcuts) { e.preventDefault(); toggleShortcuts(); return; }
        // "return to Landing page, deselect current batch file"
        if (screen !== 'landing') {
          e.preventDefault();
          setScreen('landing');
          clearBatch();
          return;
        }
        return;
      }

      // '?' toggles the shortcut reference panel at any time. On most
      // US keyboards '?' requires Shift+/, so we accept either form.
      if (!editable && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        toggleShortcuts();
        return;
      }

      if (editable) return;

      // Ctrl+P / Cmd+P — export PDF, suppress browser print dialog.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (result && status === 'success') {
          e.preventDefault();
          exportReportPdf(result).catch(() => {});
        }
        return;
      }

      // Alt+<digit> → direct screen navigation, respecting locks.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const digit = e.key;
        if (digit === '1') { e.preventDefault(); setScreen('landing'); return; }
        if (digit === '2') { e.preventDefault(); setScreen('analysis'); return; }
        if (digit === '3') {
          if (result && hasSeenAnalysis && status === 'success') {
            e.preventDefault();
            setScreen('verdict');
          }
          return;
        }
        if (digit === '4') {
          if (hasSeenVerdict) { e.preventDefault(); setScreen('stress'); }
          return;
        }
        if (digit === '5') {
          if (hasSeenVerdict) { e.preventDefault(); setScreen('regional'); }
          return;
        }
      }

      // Analysis-phase shortcuts (only meaningful while the unified
      // Analysis+Verdict screen is visible).
      if (screen === 'analysis' || screen === 'verdict') {
        // Enter / Space — trigger analyze on a staged file.
        if ((e.key === 'Enter' || e.key === ' ') && file && status === 'idle') {
          e.preventDefault();
          runAnalyze(file);
          return;
        }

        // Blend opacity ±10% — Shift+ArrowUp/Down and ]/[ aliases.
        if ((e.shiftKey && e.key === 'ArrowUp') || e.key === ']') {
          e.preventDefault();
          adjustBlend(10);
          return;
        }
        if ((e.shiftKey && e.key === 'ArrowDown') || e.key === '[') {
          e.preventDefault();
          adjustBlend(-10);
          return;
        }

        // ArrowLeft / ArrowRight — page navigation for multi-page docs.
        const pages = Array.isArray(result?.pages) ? result.pages : null;
        if (pages && pages.length > 1) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setCurrentPage(Math.max(0, currentPage - 1));
            return;
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setCurrentPage(Math.min(pages.length - 1, currentPage + 1));
            return;
          }
        }

        // T — toggle ProcessingLog terminal.
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          toggleTerminal();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    screen, setScreen,
    result, hasSeenAnalysis, hasSeenVerdict, status,
    currentPage, setCurrentPage,
    adjustBlend, toggleTerminal,
    showShortcuts, toggleShortcuts, setHasSeenAnalysis,
    clearBatch, reset, runAnalyze, file,
    shiftBatchSelection,
  ]);
}
