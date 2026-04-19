import React, { useCallback, useRef, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';
const MAX_BYTES = 50 * 1024 * 1024;
const BATCH_MIN = 2;
const BATCH_MAX = 10;

export default function UploadZone({ onUploaded, compact = false }) {
  const {
    runAnalyze, runBatch, status, file,
    batchMode, setBatchMode,
    batchProgress,
  } = useAnalysis();
  const [drag, setDrag] = useState(false);
  const [localErr, setLocalErr] = useState(null);
  const inputRef = useRef(null);

  const pick = () => inputRef.current?.click();

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    // Size check
    const oversized = files.find((f) => f.size > MAX_BYTES);
    if (oversized) {
      setLocalErr(`File "${oversized.name}" exceeds 50 MB limit`);
      return;
    }
    setLocalErr(null);
    // FIX 2: fire onUploaded BEFORE awaiting the analyze/batch promise
    // so the host screen (HeroSection etc.) flips to the analysis view
    // immediately and ProcessingLog becomes visible while the first
    // network call is still in flight.
    if (onUploaded) onUploaded();
    if (batchMode) {
      if (files.length < BATCH_MIN) {
        setLocalErr(`Batch mode requires at least ${BATCH_MIN} files`);
        return;
      }
      const trimmed = files.slice(0, BATCH_MAX);
      if (files.length > BATCH_MAX) {
        setLocalErr(`Batch capped at ${BATCH_MAX} files — analyzing first ${BATCH_MAX}`);
      }
      await runBatch(trimmed);
    } else {
      await runAnalyze(files[0]);
    }
  }, [batchMode, runAnalyze, runBatch, onUploaded]);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer?.files);
  };

  const uploading = status === 'loading' || batchProgress?.running;
  const zoneClass = [
    'upload-zone',
    drag ? 'drag-over' : '',
    uploading ? 'uploading' : '',
  ].filter(Boolean).join(' ');

  const batchStatusLine = batchProgress?.total > 0
    ? `ANALYZING ${batchProgress.current} OF ${batchProgress.total} DOCUMENTS…`
    : null;

  return (
    <>
      {/* SINGLE · BATCH mode toggle — monospace pill matching the existing UI. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4,
          border: '1px solid var(--border-soft)', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
        }}>
          <button type="button"
                  onClick={() => setBatchMode(false)}
                  style={{
                    background: !batchMode ? 'rgba(79,195,247,0.16)' : 'transparent',
                    color: !batchMode ? 'var(--cyan)' : 'var(--text-faint)',
                    border: 'none', padding: '6px 14px', cursor: 'pointer',
                    borderRadius: 4, letterSpacing: '0.16em', fontWeight: 600,
                  }}>SINGLE</button>
          <button type="button"
                  onClick={() => setBatchMode(true)}
                  style={{
                    background: batchMode ? 'rgba(124,77,255,0.2)' : 'transparent',
                    color: batchMode ? '#B39DFF' : 'var(--text-faint)',
                    border: 'none', padding: '6px 14px', cursor: 'pointer',
                    borderRadius: 4, letterSpacing: '0.16em', fontWeight: 600,
                  }}>BATCH</button>
        </div>
        {batchMode && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
            color: 'var(--text-faint)', textTransform: 'uppercase',
          }}>
            DROP {BATCH_MIN}–{BATCH_MAX} DOCUMENTS · ANALYZED SEQUENTIALLY
          </span>
        )}
      </div>

      <div className={zoneClass}
           onClick={pick}
           onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
           onDragLeave={() => setDrag(false)}
           onDrop={onDrop}
           role="button"
           tabIndex={0}>
        <div className="upload-info">
          <div className="upload-icon">↑</div>
          <div>
            <div className="upload-title">
              {uploading && batchStatusLine
                ? batchStatusLine
                : uploading
                  ? `Analyzing ${file?.name || 'document'}…`
                  : batchMode
                    ? `Drop ${BATCH_MIN}–${BATCH_MAX} documents to batch-analyze`
                    : file
                      ? `Drop another document — last: ${file.name}`
                      : 'Drop a document to analyze'}
            </div>
            <div className="upload-sub">PDF · JPG · PNG · TIFF · max 50 MB · E2E encrypted</div>
          </div>
        </div>
        {!compact && (
          <span className="upload-ext">
            {uploading ? 'PROCESSING…' : batchMode ? 'CLICK OR DROP MULTIPLE' : 'CLICK OR DROP'}
          </span>
        )}
        <input ref={inputRef}
               type="file"
               accept={ACCEPTED}
               multiple={batchMode}
               onChange={(e) => handleFiles(e.target.files)} />
      </div>
      {localErr && (
        <div className="error-banner" style={{ marginTop: 10 }}>
          <div className="err-msg">{localErr}</div>
        </div>
      )}
    </>
  );
}
