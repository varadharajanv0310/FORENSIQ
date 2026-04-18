"""Structural metadata forensics for PDFs and images.

Uses PyMuPDF for PDF metadata extraction and Pillow's EXIF reader for
images. Flags are raised for common post-hoc editing fingerprints such
as a modification date that precedes the creation date, unexpected
producer strings (Adobe Photoshop, GIMP, etc), missing authors on
official documents, or DateTime / DateTimeOriginal drift beyond the
allowed threshold.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from PIL import Image, ExifTags

try:
    import fitz  # type: ignore
except Exception:  # noqa: BLE001
    fitz = None

SUSPICIOUS_SOFTWARE = [
    "photoshop", "gimp", "inkscape", "affinity",
    "pixlr", "coreldraw", "paint.net", "krita",
]

TIMESTAMP_DRIFT_SECONDS = 60


def _parse_pdf_date(value: Optional[str]):
    if not value:
        return None
    raw = str(value)
    if raw.startswith("D:"):
        raw = raw[2:]
    raw = raw.replace("'", "").replace("Z", "")
    try:
        from datetime import datetime
        return datetime.strptime(raw[:14], "%Y%m%d%H%M%S")
    except Exception:  # noqa: BLE001
        return None


def _parse_exif_date(value: Optional[str]):
    if not value:
        return None
    try:
        from datetime import datetime
        return datetime.strptime(str(value), "%Y:%m:%d %H:%M:%S")
    except Exception:  # noqa: BLE001
        return None


def check_pdf(pdf_path: str) -> Dict:
    if fitz is None:
        return {"source": "pdf", "anomalies": ["PyMuPDF unavailable"], "score": 0.0, "confidence": 0.1, "metadata": {}}
    anomalies: List[str] = []
    meta: Dict = {}
    try:
        doc = fitz.open(pdf_path)
        meta = dict(doc.metadata or {})
        doc.close()
    except Exception as exc:  # noqa: BLE001
        return {"source": "pdf", "anomalies": [f"metadata read failed: {exc}"],
                "score": 0.5, "confidence": 0.3, "metadata": {}}

    creation = _parse_pdf_date(meta.get("creationDate"))
    modification = _parse_pdf_date(meta.get("modDate"))
    producer = str(meta.get("producer", "")).lower()
    creator = str(meta.get("creator", "")).lower()
    author = str(meta.get("author", "")).strip()

    if creation and modification and modification < creation:
        anomalies.append(f"modification date {modification} precedes creation {creation}")

    for tag in SUSPICIOUS_SOFTWARE:
        if tag in producer or tag in creator:
            anomalies.append(f"editor fingerprint in metadata: {tag}")
            break

    if not author:
        anomalies.append("empty author field on PDF")

    return _score(anomalies, meta, source="pdf")


def check_image(image_path: str) -> Dict:
    anomalies: List[str] = []
    meta: Dict = {}
    try:
        img = Image.open(image_path)
        raw_exif = img._getexif() or {}
        for k, v in raw_exif.items():
            name = ExifTags.TAGS.get(k, str(k))
            meta[name] = str(v)
    except Exception:  # noqa: BLE001
        raw_exif = {}

    software = str(meta.get("Software", "")).lower()
    for tag in SUSPICIOUS_SOFTWARE:
        if tag in software:
            anomalies.append(f"Software tag reveals editor: {software}")
            break
    if "Software" in meta and not any(t in software for t in SUSPICIOUS_SOFTWARE):
        anomalies.append(f"Software tag present: {meta['Software']}")

    for gkey in ("GPSInfo",):
        if gkey in meta and "None" in meta[gkey]:
            anomalies.append("GPS tags present but partially empty")

    dt = _parse_exif_date(meta.get("DateTime"))
    dto = _parse_exif_date(meta.get("DateTimeOriginal"))
    if dt and dto:
        drift = abs((dt - dto).total_seconds())
        if drift > TIMESTAMP_DRIFT_SECONDS:
            anomalies.append(f"DateTime differs from DateTimeOriginal by {drift:.0f}s")

    return _score(anomalies, meta, source="image")


def _score(anomalies: List[str], meta: Dict, source: str) -> Dict:
    n = len(anomalies)
    score = min(1.0, n * 0.3)
    confidence = min(1.0, 0.35 + n * 0.15 + (0.1 if meta else 0.0))
    return {
        "source": source,
        "anomalies": anomalies,
        "metadata": meta,
        "score": score,
        "confidence": confidence,
    }


def check_metadata(file_path: str, is_pdf: bool) -> Dict:
    return check_pdf(file_path) if is_pdf else check_image(file_path)
