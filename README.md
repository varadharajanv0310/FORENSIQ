# FORENSIQ — AI Document Forgery Detection

Ensemble forensic pipeline for detecting tampered documents. Runs four
independent signals — **ELA**, **EfficientNet-B0 CNN + GradCAM**,
**font consistency (MSER + KMeans)**, and **structural metadata** —
and combines them into a single explainable verdict. Includes a
regional-script OCR engine (Tamil, Hindi, Telugu, Kannada, Malayalam,
English) and an adversarial stress-test mode.

## Architecture

```
                            +----------------------+
                            |     Vite + React     |
                            |    (localhost:5173)  |
                            +----------+-----------+
                                       |
                           fetch() JSON | FormData
                                       v
+--------------------------------------+-----------------------------+
|                           FastAPI  (8000)                         |
|                                                                   |
|  POST /analyze ----+                                              |
|                    v                                              |
|    +--------+  +----------+  +---------+  +----------+  +------+  |
|    |  ELA   |  |  CNN +   |  |  FONT   |  |  META    |  | OCR  |  |
|    |  q=95  |  | GradCAM  |  | MSER+KM |  | EXIF/XMP |  |EasyOCR| |
|    +---+----+  +----+-----+  +----+----+  +-----+----+  +---+--+  |
|        |            |             |             |           |     |
|        +------------+------+------+-------------+-----------+     |
|                            v                                      |
|                  +-------------------+                            |
|                  | ensemble + verdict|                            |
|                  | GENUINE / SUSP /  |                            |
|                  |     FORGED        |                            |
|                  +---------+---------+                            |
|                            |                                      |
|   POST /adversarial/apply  |   static/heatmaps/  static/originals/|
|        (brightness, JPEG,  |                                      |
|         copy-move)         |                                      |
+----------------------------+--------------------------------------+
```

## Tech stack

- **Frontend**: Vite, React 18, vanilla CSS (dark forensics terminal theme).
- **Backend**: FastAPI, Uvicorn, Pydantic v2.
- **ML / CV**: PyTorch + torchvision (EfficientNet-B0), OpenCV, Pillow,
  PyMuPDF, scikit-learn (KMeans), EasyOCR.
- **Explainability**: GradCAM hooked onto `features.8` of EfficientNet-B0.

## Project layout

```
D:\FORENSIQ\
├── backend\
│   ├── main.py                      # FastAPI app + pipeline wiring
│   ├── requirements.txt
│   ├── model\
│   │   ├── train.py                 # EfficientNet fine-tuning script
│   │   ├── inference.py             # CNN predictor (graceful fallback)
│   │   ├── gradcam.py               # Heatmap generator
│   │   ├── ela.py                   # Error-level analysis + 10-strip timeline
│   │   ├── font_analysis.py         # MSER + KMeans font forensics
│   │   ├── metadata_check.py        # PDF + EXIF metadata forensics
│   │   ├── ocr_pipeline.py          # EasyOCR + Indic script analysis
│   │   └── checkpoints\             # saved .pth files land here
│   ├── utils\
│   │   └── report.py                # Ensemble weighting + verdict reason
│   └── static\
│       ├── heatmaps\                # served under /static/heatmaps/
│       └── originals\               # served under /static/originals/
├── frontend\
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src\
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css                # full FORENSIQ design system
│       ├── context\AnalysisContext.jsx
│       ├── services\api.js
│       └── components\
│           ├── Navbar.jsx
│           ├── HeroSection.jsx
│           ├── UploadZone.jsx
│           ├── ProcessingLog.jsx
│           ├── ForensicsViewer.jsx
│           ├── ComparativeSlider.jsx
│           ├── VerdictCard.jsx
│           ├── ConfidenceTimeline.jsx
│           ├── MultiSignalReport.jsx
│           ├── AdversarialPanel.jsx
│           ├── RegionalLanguagePanel.jsx
│           └── FX.jsx
├── data\
│   └── archive\                     # dataset lives here (see below)
└── README.md
```

## Setup (Windows)

### 1. Backend

```powershell
cd D:\FORENSIQ\backend
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

The first EasyOCR invocation downloads detection + recognition
checkpoints (\~200 MB) into `%USERPROFILE%\.EasyOCR\`.

### 2. Frontend

```powershell
cd D:\FORENSIQ\frontend
npm install
```

### 3. Dataset (optional, only needed for training)

Place authentic and tampered images under the canonical CASIA-style
layout. The training script walks `D:\FORENSIQ\data\archive\` and
picks up any folder literally named `Au/` (authentic) or `Tp/`
(tampered), so an extracted CASIA/CoMoFoD-style zip is ready to go:

```
D:\FORENSIQ\data\archive\
├── CASIA2\
│   ├── Au\         <- authentic images here
│   └── Tp\         <- tampered images here
└── ...             <- arbitrary nesting is fine
```

The system runs end-to-end **without** a trained checkpoint: the CNN
signal is neutralised (score 0.5 / confidence 0.15) and the ensemble
auto-reweights to `ELA 0.55 · Font 0.25 · Metadata 0.20`.

## Running

### Backend

```powershell
cd D:\FORENSIQ\backend
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/ to confirm `{"service":"forensiq","status":"ok", ...}`.

### Frontend

```powershell
cd D:\FORENSIQ\frontend
npm run dev
```

Open http://localhost:5173 and drop a PDF, JPG, PNG, or TIFF onto the
upload zone on the Hero or Analyze screen.

### Training

```powershell
cd D:\FORENSIQ\backend
python model\train.py
```

Useful flags: `--epochs 30`, `--batch-size 32`, `--lr 1e-4`,
`--weight-decay 1e-2`, `--patience 5`. The best checkpoint is written
to `backend\model\checkpoints\efficientnet_forensiq.pth`; as soon as
that file exists the API boot-up switches to the full 4-signal
ensemble.

## Endpoints

### `POST /analyze`

- `multipart/form-data`, field name `file`.
- Accepts PDF, PNG, JPG, TIFF.

Response (abridged):

```json
{
  "verdict": "FORGED",
  "confidence": 0.87,
  "reason": "Pixel compression artifacts detected in strip 3/10 — 78% confidence of tampering",
  "signals": {
    "ela":      { "score": 0.72, "confidence": 0.81, "heatmap_url": "/static/heatmaps/ela_…png", "regional_scores": [...] },
    "cnn":      { "score": 0.91, "confidence": 0.88, "backbone": "EfficientNet-B0 (fine-tuned)", "trained": true },
    "font":     { "score": 0.33, "confidence": 0.62, "flagged_regions": [...], "total_regions": 184 },
    "metadata": { "score": 0.60, "confidence": 0.55, "anomalies": ["editor fingerprint in metadata: photoshop"], "source": "pdf" }
  },
  "gradcam_url": "/static/heatmaps/gc_…png",
  "original_url": "/static/originals/orig_…png",
  "regional_language": {
    "detected": true,
    "script": "tamil",
    "confidence": 0.96,
    "ocr_text": "...",
    "flagged_characters": [...],
    "ocr_lines": [...]
  },
  "timeline": [
    { "region": 1, "y_start": 0.0, "y_end": 0.1, "confidence": 0.12, "status": "clean" },
    ...
  ]
}
```

### `POST /adversarial/apply`

Body:

```json
{
  "file_base64": "<base64 of raw bytes>",
  "operation": "brightness" | "jpeg_compress" | "copymove",
  "intensity": 0.0
}
```

Returns the same schema as `/analyze`, plus `modified_image_base64`,
`source_operation`, and `source_intensity`.

## Troubleshooting

- **`torch` wheel doesn't install on Windows**: install the CPU wheel
  explicitly with
  `pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cpu`
  then re-run `pip install -r requirements.txt`.
- **PyMuPDF errors on PDF upload**: make sure `PyMuPDF==1.24.10` is
  installed (not the older `fitz` package, which is a different
  library).
- **EasyOCR slow on first call**: that's the weight download on the
  first request. Subsequent calls reuse the in-memory reader.
- **Frontend can't reach backend**: CORS is locked to
  `http://localhost:5173` and `http://127.0.0.1:5173`. If you serve
  the Vite dev server elsewhere, add the origin to
  `allow_origins` in `backend\main.py`.
