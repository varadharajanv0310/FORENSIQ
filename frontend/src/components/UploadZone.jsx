import React, { useCallback, useRef, useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext.jsx';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';
const MAX_BYTES = 50 * 1024 * 1024;

export default function UploadZone({ onUploaded, compact = false }) {
  const { runAnalyze, status, file } = useAnalysis();
  const [drag, setDrag] = useState(false);
  const [localErr, setLocalErr] = useState(null);
  const inputRef = useRef(null);

  const pick = () => inputRef.current?.click();

  const handleFile = useCallback(async (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setLocalErr('File exceeds 50 MB limit');
      return;
    }
    setLocalErr(null);
    await runAnalyze(f);
    if (onUploaded) onUploaded();
  }, [runAnalyze, onUploaded]);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const uploading = status === 'loading';
  const zoneClass = [
    'upload-zone',
    drag ? 'drag-over' : '',
    uploading ? 'uploading' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
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
              {uploading
                ? `Analyzing ${file?.name || 'document'}…`
                : file
                  ? `Drop another document — last: ${file.name}`
                  : 'Drop a document to analyze'}
            </div>
            <div className="upload-sub">PDF · JPG · PNG · TIFF · max 50 MB · E2E encrypted</div>
          </div>
        </div>
        {!compact && (
          <span className="upload-ext">
            {uploading ? 'PROCESSING…' : 'CLICK OR DROP'}
          </span>
        )}
        <input ref={inputRef}
               type="file"
               accept={ACCEPTED}
               onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {localErr && (
        <div className="error-banner" style={{ marginTop: 10 }}>
          <div className="err-msg">{localErr}</div>
        </div>
      )}
    </>
  );
}
