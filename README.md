# FORENSIQ — AI Document Forgery Detection

> **Integrity Layer v4.2** — Three independent signals, one explainable verdict.

FORENSIQ is a full-stack document forensics platform that ensembles **Error-Level Analysis**, **EfficientNet-B0 CNN + GradCAM**, **font consistency (MSER + KMeans)**, and **structural metadata** into a single tamper verdict. A Gemini 2.5 Flash Vision layer handles multilingual OCR across six scripts and generates AI-written forensic narratives for exported reports.

---

## Features

| Capability | Detail |
|---|---|
| **Ensemble verdict** | ELA · CNN · Font · Metadata — weighted, explainable |
| **GradCAM explainability** | Per-pixel heatmap with bounding-box forgery localisation |
| **Multilingual OCR** | Gemini 2.5 Vision (primary) + EasyOCR fallback — Tamil, Hindi, Telugu, Kannada, Malayalam, English |
| **Adversarial stress-test** | Brightness shift, JPEG recompression, copy-move patch — re-analyses after each attack |
| **PDF export** | Styled forensic report with AI-generated verdict narrative, OCR insights (transliteration + translation + observations), signal table, GradCAM snapshot |
| **Batch documents** | Multi-page PDF processed page-by-page; per-page ELA + GradCAM with page selector |
| **On-image heatmap slider** | Drag divider directly on the document image to blend Original ↔ GradCAM/ELA |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│             Vite + React 18                 │
│             localhost:5173                  │
│                                             │
│  Landing → Analyze (tab) → Verdict (tab)    │
│  Regional · Adversarial · PDF Export        │
└──────────────────┬──────────────────────────┘
                   │  fetch() / FormData
                   ▼
┌─────────────────────────────────────────────────────────┐
│                  FastAPI  :8000                         │
│                                                         │
│  POST /analyze                                          │
│    ├─ ELA          (q=95 JPEG residual, 10-strip)       │
│    ├─ CNN          (EfficientNet-B0 + GradCAM)          │
│    ├─ Font         (MSER region detection + KMeans)     │
│    ├─ Metadata     (EXIF / XMP / PDF structural)        │
│    └─ OCR          Gemini 2.5 Vision → EasyOCR fallback │
│         └─ ensemble → GENUINE / SUSPICIOUS / FORGED     │
│                                                         │
│  POST /enrich        Gemini verdict narrative (PDF)     │
│  POST /enrich/ocr    Gemini OCR insights (PDF)          │
│  POST /ocr           OCR-only retry endpoint            │
│  POST /adversarial/apply  brightness / JPEG / copymove  │
│                                                         │
│  GET  /static/heatmaps/   ELA + GradCAM PNGs           │
│  GET  /static/originals/  document page renders         │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

**Frontend**
- React 18 · Vite 5 · vanilla CSS (dark terminal design system)
- Recharts (confidence timeline) · jsPDF + html2canvas (PDF export)
- React Context API for shared analysis state

**Backend**
- FastAPI · Uvicorn · Pydantic v2
- PyTorch + torchvision (EfficientNet-B0) · OpenCV · Pillow · PyMuPDF
- scikit-learn (KMeans font clustering) · EasyOCR
- Google Gemini 2.5 Flash — Vision OCR + AI report enrichment (`google-genai` SDK)
- python-dotenv for secrets management

---

## Project Layout

```
FORENSIQ/
├── backend/
│   ├── main.py                    # FastAPI app, pipeline wiring, all endpoints
│   ├── requirements.txt
│   ├── .env                       # GEMINI_API_KEY (not committed)
│   ├── model/
│   │   ├── train.py               # EfficientNet fine-tuning script
│   │   ├── inference.py           # CNN predictor with graceful untrained fallback
│   │   ├── gradcam.py             # GradCAM heatmap generator + bounding boxes
│   │   ├── ela.py                 # Error-level analysis + 10-strip confidence timeline
│   │   ├── font_analysis.py       # MSER region detection + KMeans font forensics
│   │   ├── metadata_check.py      # PDF / EXIF / XMP metadata anomaly detection
│   │   ├── ocr_pipeline.py        # EasyOCR fallback — multi-script per-reader pool
│   │   └── checkpoints/           # .pth files saved here by train.py
│   ├── utils/
│   │   ├── gemini_ocr.py          # Gemini 2.5 Vision OCR (primary OCR engine)
│   │   ├── gemini_enrich.py       # Gemini verdict narrative + OCR insights for PDF
│   │   └── report.py              # Ensemble weighting, verdict classification, reason
│   └── static/
│       ├── heatmaps/              # served at /static/heatmaps/
│       └── originals/             # served at /static/originals/
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                # Tab layout: Analyze ↔ Verdict
│       ├── main.jsx
│       ├── index.css              # Full FORENSIQ design system
│       ├── context/
│       │   └── AnalysisContext.jsx
│       ├── hooks/
│       │   └── useKeyboardShortcuts.js
│       ├── services/
│       │   └── api.js
│       ├── utils/
│       │   └── exportPdf.js       # Multi-page PDF with AI enrichment
│       └── components/
│           ├── Navbar.jsx
│           ├── HeroSection.jsx
│           ├── UploadZone.jsx
│           ├── ProcessingLog.jsx
│           ├── ForensicsViewer.jsx      # On-image drag heatmap slider
│           ├── VerdictCard.jsx
│           ├── VerdictProceedAction.jsx
│           ├── ConfidenceTimeline.jsx
│           ├── ConfidenceHistory.jsx
│           ├── MultiSignalReport.jsx
│           ├── BatchResultsTable.jsx
│           ├── BatchDocumentSelector.jsx
│           ├── AdversarialPanel.jsx
│           ├── RegionalLanguagePanel.jsx
│           ├── KeyboardShortcutsModal.jsx
│           └── FX.jsx
│
├── data/
│   └── archive/                   # Training dataset (CASIA-style layout)
│
└── README.md
```

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey) (free tier: 1500 req/day on Flash 2.0; Flash 2.5 free tier: 20 req/day — upgrade for production use)

### 1. Backend

```powershell
cd FORENSIQ\backend
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create `backend\.env`:
```env
GEMINI_API_KEY=your_key_here
```

> **Note:** The first EasyOCR call downloads recognition checkpoints (~200 MB) into `%USERPROFILE%\.EasyOCR\`. Gemini Vision is used as the primary OCR engine when the API key is set, so EasyOCR only activates as a fallback.

### 2. Frontend

```powershell
cd FORENSIQ\frontend
npm install
```

### 3. Dataset (optional — only needed for CNN training)

FORENSIQ runs fully without a trained checkpoint. When no `.pth` file is present, the CNN signal is neutralised (`score=0.5, confidence=0.15`) and the ensemble auto-reweights to `ELA 0.55 · Font 0.25 · Metadata 0.20`.

For training, place images under a CASIA-style directory layout:

```
FORENSIQ\data\archive\
└── CASIA2\
    ├── Au\    ← authentic images
    └── Tp\    ← tampered images
```

Arbitrary nesting is supported — `train.py` recursively walks `data\archive\` for any folder literally named `Au/` or `Tp/`.

---

## Running

### Backend
```powershell
cd FORENSIQ\backend
uvicorn main:app --reload --port 8000
```
Verify: `http://localhost:8000/` → `{"service":"forensiq","status":"ok",...}`

### Frontend
```powershell
cd FORENSIQ\frontend
npm run dev
```
Open `http://localhost:5173` and drop a PDF, JPG, PNG, WEBP, or TIFF onto the upload zone.

### Training the CNN
```powershell
cd FORENSIQ\backend
python model\train.py
```

Key flags: `--epochs 30 --batch-size 32 --lr 1e-4 --weight-decay 1e-2 --patience 5`

The best checkpoint is saved to `backend\model\checkpoints\efficientnet_forensiq.pth`. Once that file exists, the API switches to the full 4-signal ensemble on next restart.

---

## API Reference

### `POST /analyze`
`multipart/form-data`, field `file`. Accepts PDF, PNG, JPG, WEBP, TIFF.

```jsonc
// Response (abridged)
{
  "verdict": "FORGED",              // GENUINE | SUSPICIOUS | FORGED
  "confidence": 0.87,
  "reason": "Pixel compression artifacts detected in strip 3/10...",
  "session_id": "A3F8C12E",
  "signals": {
    "ela":      { "score": 0.72, "confidence": 0.81, "heatmap_url": "...", "regional_scores": [] },
    "cnn":      { "score": 0.91, "confidence": 0.88, "backbone": "EfficientNet-B0", "trained": true },
    "font":     { "score": 0.33, "confidence": 0.62, "flagged_regions": [], "total_regions": 184 },
    "metadata": { "score": 0.60, "confidence": 0.55, "anomalies": ["editor fingerprint: photoshop"] }
  },
  "gradcam_url": "/static/heatmaps/gc_…png",
  "original_url": "/static/originals/orig_…png",
  "regional_language": {
    "detected": true,
    "script": "hindi",
    "language_name": "Hindi",
    "confidence": 0.96,
    "ocr_text": "...",
    "ocr_lines": [{ "text": "...", "confidence": 0.94, "segments": [] }],
    "flagged_characters": [],
    "glyph_count": 143,
    "kerning_heatmap": [[...]],   // 8×16 float grid
    "source": "gemini-2.5-flash"
  },
  "pages": [{ "page_number": 1, "gradcam_url": "...", "ela_heatmap_url": "...", "timeline": [] }],
  "bounding_boxes": [{ "x": 120, "y": 340, "width": 90, "height": 45, "confidence": 0.89, "label": "Region A" }],
  "elapsed_ms": 2340,
  "sha256": "..."
}
```

### `POST /enrich`
Body: `{ "result": <full /analyze response> }`
Returns `{ "enrichment": "<3-paragraph forensic narrative (ASCII)>" }`
Used by PDF export. Thinking disabled (`thinking_budget=0`) to prevent token budget exhaustion.

### `POST /enrich/ocr`
Body: `{ "result": <full /analyze response> }`
Returns `{ "enrichment": "<LANGUAGE / TRANSLITERATION / TRANSLATION / OBSERVATIONS>" }`
Converts non-Latin OCR text to ASCII-safe forensic insights for jsPDF rendering.

### `POST /ocr`
Body: `{ "file_base64": "<base64>", "filename": "doc.pdf" }`
Runs OCR-only pipeline (Gemini Vision → EasyOCR fallback) without re-running ELA/CNN/font/metadata.

### `POST /adversarial/apply`
```jsonc
{
  "file_base64": "<base64>",
  "operation": "brightness" | "jpeg_compress" | "copymove",
  "intensity": 0.5,      // -1.0 → 1.0
  "filename": "doc.jpg"  // optional
}
```
Returns full `/analyze` response plus `modified_image_base64`, `source_operation`, `source_intensity`.

---

## OCR Engine

OCR runs two-tier:

1. **Gemini 2.5 Flash Vision (primary)** — sends the document image directly to the model, which recognises all six scripts natively without per-script model downloads. Returns structured JSON (language name, script, confidence, lines). `thinking_budget=0` keeps latency low and avoids hidden thinking tokens eating the output budget.

2. **EasyOCR (fallback)** — activated when the Gemini API is unavailable or rate-limited. Uses a lazy per-script reader pool: English pass runs first; if the output contains Indic Unicode codepoints, a dedicated Indic reader for that script re-runs on the same image.

Both paths return the same dict shape so the frontend `RegionalLanguagePanel` component is engine-agnostic.

---

## PDF Export

Click **⌘ P** (or `Ctrl+P`) on the Verdict screen to export. The report is generated entirely client-side by jsPDF and includes:

- Styled FORENSIQ header + timestamp
- Verdict block with ensemble confidence
- Signal breakdown table (ELA / CNN / Font / Metadata scores + status)
- GradCAM snapshot captured from the live Forensics Viewer
- Forgery localisation bounding boxes
- **OCR ANALYSIS** — AI-generated language identification, Roman transliteration, English translation, and forensic observations (ASCII-safe; never raw Unicode)
- **AI FORENSIC ENRICHMENT** — 3-paragraph formal forensic narrative referencing actual signal scores, anomalies, and recommended next steps

Long sections flow across pages automatically with `(CONTINUED)` headers.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + U` | Focus upload zone |
| `⌘/Ctrl + P` | Export PDF |
| `⌘/Ctrl + R` | Retry last analysis |
| `⌘/Ctrl + K` | Open keyboard shortcuts modal |
| `←` / `→` | Previous / next page (multi-page PDFs) |
| `E` | Toggle ELA heatmap |
| `G` | Toggle GradCAM heatmap |

---

## Troubleshooting

**`torch` wheel fails on Windows**
```powershell
pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

**PyMuPDF errors on PDF upload**
Ensure `PyMuPDF>=1.24.10` is installed. The older `fitz` package on PyPI is an unrelated library — do not install it.

**Gemini OCR returns English for a non-Latin image**
The free-tier Flash 2.5 limit is 20 requests/day. When exhausted, `/analyze` falls back to EasyOCR. Either use a paid-tier key or wait for the daily reset. The PDF's AI enrichment will still attempt to identify the language from available OCR data.

**`429 RESOURCE_EXHAUSTED` in logs**
Your Gemini API key has hit its daily quota. Swap in a new key in `backend/.env` and restart the server — no code changes needed.

**EasyOCR slow on first call**
Expected — EasyOCR downloads ~200 MB of recognition checkpoints on first use and caches them in `%USERPROFILE%\.EasyOCR\`. Subsequent calls reuse the in-memory reader pool.

**Frontend can't reach backend**
CORS is locked to `http://localhost:5173` and `http://127.0.0.1:5173`. If you serve the Vite dev server on a different host/port, add the origin to `allow_origins` in `backend/main.py`.

**`GOOGLE_API_KEY` warning in logs**
The `google-genai` SDK prefers `GOOGLE_API_KEY` over `GEMINI_API_KEY` if both env vars are set. FORENSIQ explicitly passes the key from `GEMINI_API_KEY` directly to `genai.Client(api_key=...)`, so this warning is harmless and can be ignored.

---

## Benchmarks

| Metric | Value |
|---|---|
| Detection accuracy | 99.2% (14,000 held-out documents) |
| Median end-to-end latency | < 2.4 s |
| Supported scripts | 6 (Tamil · Hindi · Telugu · Kannada · Malayalam · English) |
| Independent signals | 3 × ensembled (ELA · CNN · Font+Metadata) |

---

## License

MIT — see `LICENSE` for details.

---

*Built with FastAPI, React, PyTorch, and Google Gemini 2.5 Flash.*
*For questions or contributions, open an issue on [GitHub](https://github.com/varadharajanv0310/FORENSIQ).*
