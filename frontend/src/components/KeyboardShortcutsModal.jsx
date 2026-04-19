import React, { useEffect } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

// FIX 5: "?" overlay reference panel. Dark glassmorphism styling,
// matches FORENSIQ's terminal aesthetic. Dismiss with Esc (handled in
// useKeyboardShortcuts) or by clicking the backdrop.

const GROUPS = [
  {
    title: 'GLOBAL',
    rows: [
      { keys: ['Alt', '1'], label: 'Landing / Hero' },
      { keys: ['Alt', '2'], label: 'Analysis' },
      { keys: ['Alt', '3'], label: 'Verdict (unlocked)' },
      { keys: ['Alt', '4'], label: 'Stress Test (unlocked)' },
      { keys: ['Alt', '5'], label: 'Regional Forensics (unlocked)' },
      { keys: ['Esc'],      label: 'Back to Landing · clear batch selection' },
      { keys: ['?'],        label: 'Toggle this shortcut reference' },
    ],
  },
  {
    title: 'ANALYSIS PHASE',
    rows: [
      { keys: ['Enter'],              label: 'Analyze staged document' },
      { keys: ['Space'],              label: 'Analyze staged document' },
      { keys: ['Shift', '↑'],         label: 'Increase GradCAM blend +10%' },
      { keys: [']'],                  label: 'Increase GradCAM blend +10%' },
      { keys: ['Shift', '↓'],         label: 'Decrease GradCAM blend −10%' },
      { keys: ['['],                  label: 'Decrease GradCAM blend −10%' },
      { keys: ['←'],                  label: 'Previous page (multi-page docs)' },
      { keys: ['→'],                  label: 'Next page (multi-page docs)' },
      { keys: ['T'],                  label: 'Minimize / expand terminal' },
    ],
  },
  {
    title: 'VERDICT + EXPORT',
    rows: [
      { keys: ['Ctrl', 'P'], label: 'Export PDF report (Cmd+P on macOS)' },
      { keys: ['Tab'],       label: 'Cycle focus through batch results table' },
      { keys: ['←', '→'],    label: 'Switch documents when chip selector is focused' },
    ],
  },
];

function Kbd({ children }) {
  return <span className="kbd kbd-big">{children}</span>;
}

export default function KeyboardShortcutsModal() {
  const { showShortcuts, toggleShortcuts } = useAnalysis();

  // Prevent the underlying page from scrolling while the modal is open.
  useEffect(() => {
    if (!showShortcuts) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showShortcuts]);

  if (!showShortcuts) return null;

  return (
    <div className="kbd-modal-backdrop"
         role="dialog"
         aria-modal="true"
         aria-label="Keyboard shortcuts"
         onClick={toggleShortcuts}>
      <div className="kbd-modal"
           onClick={(e) => e.stopPropagation()}>
        <div className="kbd-modal-header">
          <div>
            <div className="kbd-modal-eyebrow">REFERENCE · v1</div>
            <div className="kbd-modal-title">Keyboard Shortcuts</div>
          </div>
          <button type="button"
                  className="kbd-modal-close"
                  aria-label="Close"
                  onClick={toggleShortcuts}>ESC</button>
        </div>

        <div className="kbd-modal-body">
          {GROUPS.map((g) => (
            <div key={g.title} className="kbd-group">
              <div className="kbd-group-title">{g.title}</div>
              <div className="kbd-group-rows">
                {g.rows.map((r, i) => (
                  <div key={i} className="kbd-row">
                    <div className="kbd-row-keys">
                      {r.keys.map((k, j) => (
                        <React.Fragment key={j}>
                          {j > 0 && <span className="kbd-plus">+</span>}
                          <Kbd>{k}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="kbd-row-label">{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="kbd-modal-footer">
          Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to dismiss.
        </div>
      </div>
    </div>
  );
}
