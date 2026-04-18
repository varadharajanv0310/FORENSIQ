"""FORENSIQ FastAPI service.

Exposes two endpoints:

* ``POST /analyze`` — accepts a PDF or image and runs the full forgery
  detection pipeline (ELA, EfficientNet inference, GradCAM, font
  analysis, metadata check, OCR + regional script forensics), then
  returns a single JSON payload with the ensemble verdict and all
  intermediate signals.
* ``POST /adversarial/apply`` — applies one of three perturbations to
  the last uploaded document (brightness, JPEG recompression, or
  copy-move patching) and re-runs the full pipeline so the UI can
  compare the detector response before and after the attack.

Heatmap PNGs are written to ``static/heatmaps/`` and served under the
``/static/`` URL prefix. CORS is enabled for the Vite dev server at
``http://localhost:5173``.
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
import random
import shutil
import time
import traceback
import uuid
from typing import Dict, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageEnhance
from pydantic import BaseModel, Field

try:
    import fitz  # type: ignore
except Exception:  # noqa: BLE001
    fitz = None

from model.ela import compute_ela
from model.font_analysis import analyze_fonts
from model.gradcam import generate_gradcam as _raw_gradcam
from model.inference import is_trained, predict as cnn_predict
from model.metadata_check import check_metadata
from model.ocr_pipeline import run_ocr
from utils.report import (
    build_timeline,
    classify,
    ensemble_score,
    generate_reason,
    select_weights,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("forensiq")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
STATIC_DIR = os.path.join(BASE_DIR, "static")
HEATMAP_DIR = os.path.join(STATIC_DIR, "heatmaps")
ORIGINALS_DIR = os.path.join(STATIC_DIR, "originals")

for path in (TEMP_DIR, STATIC_DIR, HEATMAP_DIR, ORIGINALS_DIR):
    os.makedirs(path, exist_ok=True)

app = FastAPI(title="FORENSIQ", version="1.0.0",
              description="AI document forgery detection — ensemble of ELA, CNN, font, metadata, and OCR signals.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class AdversarialRequest(BaseModel):
    file_base64: str = Field(..., description="Base64-encoded PDF or image bytes.")
    operation: str = Field(..., pattern=r"^(brightness|jpeg_compress|copymove)$")
    intensity: float = Field(0.5, ge=-1.0, le=1.0)
    filename: Optional[str] = None


@app.get("/")
def root() -> Dict:
    return {
        "service": "forensiq",
        "status": "ok",
        "cnn_trained": is_trained(),
        "version": app.version,
    }


@app.get("/health")
def health() -> Dict:
    return {"ok": True, "cnn_trained": is_trained()}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> Dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload")

    filename = file.filename or f"upload_{uuid.uuid4().hex}.bin"
    return _run_full_pipeline(data, filename)


class OcrRequest(BaseModel):
    file_base64: str = Field(..., description="Base64-encoded PDF or image bytes.")
    filename: Optional[str] = None


@app.post("/ocr")
def ocr_only(req: OcrRequest):
    """Run just the OCR / regional-script pipeline on the supplied document.
    Used by the Regional Forensics tab's retry button so it doesn't have
    to re-run the full ELA+CNN+GradCAM ensemble."""
    log.info("ocr_only start · filename=%s base64_len=%d", req.filename, len(req.file_base64 or ""))
    try:
        payload = (req.file_base64 or "").strip()
        if payload.startswith("data:"):
            comma = payload.find(",")
            if comma >= 0:
                payload = payload[comma + 1:]
        try:
            data = base64.b64decode(payload, validate=False)
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(status_code=400, content={"detail": f"Invalid base64: {exc}"})
        if not data:
            return JSONResponse(status_code=400, content={"detail": "Empty base64 payload"})

        filename = (req.filename or "").strip() or _sniff_filename(data)
        input_path = _save_upload(data, filename)
        image_path, _original_url, _page_info, _pages = _prepare_image(input_path, filename)

        ocr = run_ocr(image_path)
        return {"regional_language": ocr}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("ocr_only crashed")
        return JSONResponse(status_code=500, content={"detail": f"OCR failed: {exc}"})


@app.post("/adversarial/apply")
def adversarial_apply(req: AdversarialRequest):
    log.info("adversarial_apply start · op=%s intensity=%.3f filename=%s base64_len=%d",
             req.operation, float(req.intensity), req.filename, len(req.file_base64 or ""))
    try:
        # Step 1: decode base64 (tolerate whitespace / data URI prefix)
        payload = (req.file_base64 or "").strip()
        if payload.startswith("data:"):
            comma = payload.find(",")
            if comma >= 0:
                payload = payload[comma + 1:]
        try:
            data = base64.b64decode(payload, validate=False)
        except Exception as exc:  # noqa: BLE001
            log.exception("base64 decode failed")
            return JSONResponse(status_code=400, content={"detail": f"Invalid base64: {exc}"})
        if not data:
            return JSONResponse(status_code=400, content={"detail": "Empty base64 payload"})
        log.info("adversarial_apply decoded %d bytes", len(data))

        # Step 2: derive a sane filename so _prepare_image routes PDFs/images correctly.
        filename = (req.filename or "").strip() or _sniff_filename(data)
        log.info("adversarial_apply using filename=%s", filename)

        # Step 3: save + prepare (rasterize PDFs, validate images).
        input_path = _save_upload(data, filename)
        try:
            image_path, _original_url, page_info, _pages = _prepare_image(input_path, filename)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("prepare_image failed")
            return JSONResponse(status_code=400, content={"detail": f"Could not open document: {exc}"})

        # Step 4: apply the perturbation BEFORE re-running the pipeline.
        try:
            modified_path = _apply_attack(image_path, req.operation, float(req.intensity))
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("apply_attack failed for op=%s", req.operation)
            return JSONResponse(status_code=500, content={"detail": f"Attack '{req.operation}' failed: {exc}"})
        log.info("adversarial_apply attack produced %s", modified_path)

        modified_filename = f"adv_{os.path.basename(modified_path)}"
        with open(modified_path, "rb") as fh:
            modified_bytes = fh.read()
        modified_b64 = base64.b64encode(modified_bytes).decode("ascii")

        # Step 5: re-run the full pipeline on the attacked image.
        try:
            result = _pipeline_from_image(
                image_path=modified_path,
                original_url=_publish_original(modified_path, modified_filename),
                filename=modified_filename,
                raw_bytes=modified_bytes,
                page_info={**page_info, "format": "PNG", "size_kb": round(len(modified_bytes) / 1024, 1)},
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("pipeline failed after attack")
            return JSONResponse(status_code=500, content={"detail": f"Re-analysis failed: {exc}"})

        result["modified_image_base64"] = modified_b64
        result["source_operation"] = req.operation
        result["source_intensity"] = float(req.intensity)
        log.info("adversarial_apply done · verdict=%s conf=%.3f", result.get("verdict"), result.get("confidence", 0.0))
        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error("adversarial_apply crashed: %s\n%s", exc, traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": f"Server error: {exc}"})


def _sniff_filename(data: bytes) -> str:
    """Guess an extension from magic bytes when no filename is supplied."""
    if len(data) >= 4 and data[:4] == b"%PDF":
        return f"attacked_{uuid.uuid4().hex}.pdf"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return f"attacked_{uuid.uuid4().hex}.png"
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return f"attacked_{uuid.uuid4().hex}.jpg"
    if len(data) >= 4 and data[:4] in (b"II*\x00", b"MM\x00*"):
        return f"attacked_{uuid.uuid4().hex}.tif"
    return f"attacked_{uuid.uuid4().hex}.png"


def _run_full_pipeline(data: bytes, filename: str) -> Dict:
    input_path = _save_upload(data, filename)
    image_path, original_url, page_info, pages_assets = _prepare_image(input_path, filename)
    return _pipeline_from_image(
        image_path=image_path,
        original_url=original_url,
        filename=filename,
        raw_bytes=data,
        page_info=page_info,
        pages_assets=pages_assets,
    )


def _pipeline_from_image(image_path: str, original_url: str, filename: str,
                         raw_bytes: bytes, page_info: Dict,
                         pages_assets: Optional[list] = None) -> Dict:
    start = time.time()
    is_pdf = filename.lower().endswith(".pdf")

    if not pages_assets:
        pages_assets = [{"page_number": 1, "image_path": image_path, "original_url": original_url}]

    # Primary signals run on page 1 only — CNN / font / metadata / OCR are
    # either expensive or document-level rather than page-level.
    ela = compute_ela(image_path, HEATMAP_DIR)
    cnn = cnn_predict(image_path)
    grad = _raw_gradcam(image_path, HEATMAP_DIR)
    font = analyze_fonts(image_path)
    metadata = check_metadata(image_path if not is_pdf else filename_to_original(filename, image_path),
                              is_pdf=is_pdf)
    ocr = run_ocr(image_path)

    signals = {
        "ela":      {"score": ela["score"], "confidence": ela["confidence"],
                      "heatmap_url": ela["heatmap_url"],
                      "regional_scores": ela["regional_scores"]},
        "cnn":      {"score": cnn["score"], "confidence": cnn["confidence"],
                      "backbone": cnn.get("backbone", "EfficientNet-B0"),
                      "trained": cnn.get("trained", False)},
        "font":     {"score": font["score"], "confidence": font["confidence"],
                      "flagged_regions": font.get("flagged_regions", []),
                      "total_regions": font.get("total_regions", 0)},
        "metadata": {"score": metadata["score"], "confidence": metadata["confidence"],
                      "anomalies": metadata.get("anomalies", []),
                      "source": metadata.get("source", "")},
    }

    weights = select_weights(cnn_trained=bool(cnn.get("trained")))
    score = ensemble_score(signals, weights)
    verdict = classify(score)
    reason = generate_reason(signals, verdict, weights)
    timeline = build_timeline(ela, num_strips=10)

    # Build per-page ELA + GradCAM. Page 1 reuses the computation above so
    # we don't redo it; subsequent pages get their own ELA + GradCAM pass.
    pages: list = [{
        "page_number": pages_assets[0]["page_number"],
        "gradcam_url": grad.get("heatmap_url"),
        "ela_heatmap_url": ela.get("heatmap_url"),
        "timeline": timeline,
        "confidence": float(ela.get("score", 0.0)),
        "original_url": pages_assets[0]["original_url"],
        "bounding_boxes": grad.get("bounding_boxes", []),
    }]
    for asset in pages_assets[1:]:
        page_img = asset["image_path"]
        log.info("pipeline · processing page %d (%s)", asset["page_number"], os.path.basename(page_img))
        try:
            page_ela = compute_ela(page_img, HEATMAP_DIR)
        except Exception as exc:  # noqa: BLE001
            log.exception("page %d ELA failed", asset["page_number"])
            page_ela = {"score": 0.0, "confidence": 0.0, "regional_scores": [],
                        "heatmap_url": None}
        try:
            page_grad = _raw_gradcam(page_img, HEATMAP_DIR)
        except Exception as exc:  # noqa: BLE001
            log.exception("page %d GradCAM failed", asset["page_number"])
            page_grad = {"heatmap_url": None, "bounding_boxes": []}
        pages.append({
            "page_number": asset["page_number"],
            "gradcam_url": page_grad.get("heatmap_url"),
            "ela_heatmap_url": page_ela.get("heatmap_url"),
            "timeline": build_timeline(page_ela, num_strips=10),
            "confidence": float(page_ela.get("score", 0.0)),
            "original_url": asset["original_url"],
            "bounding_boxes": page_grad.get("bounding_boxes", []),
        })

    elapsed_ms = int((time.time() - start) * 1000)
    sha256 = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes else ""

    return {
        "filename": filename,
        "session_id": uuid.uuid4().hex[:8].upper(),
        "verdict": verdict,
        "confidence": score,
        "reason": reason,
        "signals": signals,
        "weights_used": weights,
        "gradcam_url": grad.get("heatmap_url"),
        "original_url": original_url,
        "regional_language": ocr,
        "timeline": timeline,
        "pages": pages,
        "bounding_boxes": grad.get("bounding_boxes", []),
        "elapsed_ms": elapsed_ms,
        "sha256": sha256,
        "page_info": page_info,
    }


def _save_upload(data: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower() or ".bin"
    path = os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}{ext}")
    with open(path, "wb") as fh:
        fh.write(data)
    return path


def filename_to_original(filename: str, current_path: str) -> str:
    """Locate a saved PDF alongside the extracted PNG so metadata_check can
    still inspect the PDF even when the pipeline is operating on the PNG."""
    if filename.lower().endswith(".pdf"):
        candidate = os.path.splitext(current_path)[0] + ".pdf"
        if os.path.exists(candidate):
            return candidate
        # Fall back to any PDF in temp with the matching stem.
        for p in os.listdir(TEMP_DIR):
            if p.lower().endswith(".pdf"):
                return os.path.join(TEMP_DIR, p)
    return current_path


def _prepare_image(input_path: str, filename: str):
    """Rasterize the input (PDF → PNG per page) and publish originals.

    Returns ``(image_path, original_url, page_info, pages_assets)`` where
    ``pages_assets`` is a list of ``{page_number, image_path, original_url}``
    entries (one per page for PDFs, or a single entry for images). The
    first three return values always refer to page 1 for backwards
    compatibility with the single-page pipeline.
    """
    is_pdf = filename.lower().endswith(".pdf")
    page_info: Dict = {
        "format": filename.split(".")[-1].upper() if "." in filename else "BIN",
        "current_page": 1,
        "total_pages": 1,
        "size_kb": round(os.path.getsize(input_path) / 1024, 1),
    }

    pages_assets: list = []

    if is_pdf:
        if fitz is None:
            raise HTTPException(status_code=500, detail="PyMuPDF (fitz) is not installed — cannot render PDF.")
        try:
            doc = fitz.open(input_path)
            page_info["total_pages"] = doc.page_count
            stem = os.path.splitext(input_path)[0]
            for idx in range(doc.page_count):
                page = doc.load_page(idx)
                pix = page.get_pixmap(dpi=220)
                page_png = f"{stem}_p{idx + 1}.png"
                pix.save(page_png)
                page_original_url = _publish_original(page_png, f"{filename}#p{idx + 1}")
                pages_assets.append({
                    "page_number": idx + 1,
                    "image_path": page_png,
                    "original_url": page_original_url,
                })
            doc.close()
            # Keep a side-car copy of the PDF so metadata checks can still read it.
            pdf_copy = stem + ".pdf"
            if pdf_copy != input_path:
                shutil.copy(input_path, pdf_copy)
            page_info["format"] = "PDF"
            image_path = pages_assets[0]["image_path"]
            original_url = pages_assets[0]["original_url"]
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Failed to render PDF: {exc}") from exc
    else:
        try:
            Image.open(input_path).verify()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc
        image_path = input_path
        original_url = _publish_original(image_path, filename)
        pages_assets.append({
            "page_number": 1,
            "image_path": image_path,
            "original_url": original_url,
        })

    return image_path, original_url, page_info, pages_assets


def _publish_original(image_path: str, filename: str) -> str:
    display_name = f"orig_{uuid.uuid4().hex[:12]}.png"
    out_path = os.path.join(ORIGINALS_DIR, display_name)
    try:
        Image.open(image_path).convert("RGB").save(out_path, "PNG")
    except Exception:  # noqa: BLE001
        # As last resort, byte-copy the file.
        shutil.copy(image_path, out_path)
    return f"/static/originals/{display_name}"


def _apply_attack(image_path: str, operation: str, intensity: float) -> str:
    img = Image.open(image_path).convert("RGB")
    if operation == "brightness":
        factor = 1.0 + float(intensity)
        factor = max(0.1, min(3.0, factor))
        modified = ImageEnhance.Brightness(img).enhance(factor)
    elif operation == "jpeg_compress":
        quality = int(max(5, min(100, float(intensity) * 100))) or 25
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality)
        buf.seek(0)
        modified = Image.open(buf).convert("RGB")
    elif operation == "copymove":
        modified = _copy_move(img, intensity)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown operation: {operation}")

    out_path = os.path.join(TEMP_DIR, f"adv_{uuid.uuid4().hex}.png")
    modified.save(out_path, "PNG")
    return out_path


def _copy_move(img: Image.Image, intensity: float) -> Image.Image:
    arr = np.array(img)
    h, w = arr.shape[:2]
    if h < 80 or w < 80:
        return img.copy()
    patch = 50
    sx = random.randint(0, max(1, w - patch - 1))
    sy = random.randint(0, max(1, h - patch - 1))
    offset = max(patch + 8, int(abs(intensity) * min(w, h) * 0.35))
    dx = min(w - patch - 1, sx + offset)
    dy = min(h - patch - 1, sy + offset)
    arr[dy:dy + patch, dx:dx + patch] = arr[sy:sy + patch, sx:sx + patch]
    return Image.fromarray(arr)
