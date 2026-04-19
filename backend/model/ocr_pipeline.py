"""OCR + regional-script forensics.

EasyOCR forbids stacking most Indic scripts in a single Reader, so we
maintain a per-script reader pool. A cheap English+Hindi pass runs first
(``hi`` shares Devanagari with many fallback fonts and coexists with
``en``); if the detected script differs, we lazily spin up a dedicated
Reader for that script and re-run. For each OCR line we compute the
median character width/height ratio and flag glyphs whose metrics
deviate more than 30% — a classic signal of heterogeneous glyph sources
stitched into a single line.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

import numpy as np

log = logging.getLogger(__name__)

SCRIPT_RANGES = {
    "tamil":     (0x0B80, 0x0BFF),
    "hindi":     (0x0900, 0x097F),
    "telugu":    (0x0C00, 0x0C7F),
    "kannada":   (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
}

# EasyOCR language code per detected script. English always pairs cleanly.
SCRIPT_TO_LANG = {
    "english":   ["en"],
    "hindi":     ["hi", "en"],
    "tamil":     ["ta", "en"],
    "telugu":    ["te", "en"],
    "kannada":   ["kn", "en"],
    "malayalam": ["ml", "en"],
}

DEVIATION_THRESHOLD = 0.30

_READERS: Dict[str, object] = {}


def _reader_for(script: str):
    """Lazy, per-script EasyOCR Reader. Falls back to English on init failure."""
    langs = SCRIPT_TO_LANG.get(script, ["en"])
    key = "+".join(langs)
    if key in _READERS:
        return _READERS[key]
    import easyocr
    try:
        reader = easyocr.Reader(langs, gpu=False, verbose=False)
    except Exception as exc:  # noqa: BLE001
        log.warning("EasyOCR init failed for %s (%s); falling back to English.", key, exc)
        if "en" not in _READERS:
            _READERS["en"] = easyocr.Reader(["en"], gpu=False, verbose=False)
        reader = _READERS["en"]
    _READERS[key] = reader
    return reader


def detect_script(text: str) -> str:
    if not text:
        return "english"
    counts: Dict[str, int] = {k: 0 for k in SCRIPT_RANGES}
    total = 0
    for ch in text:
        cp = ord(ch)
        if ch.isspace() or not ch.isprintable():
            continue
        total += 1
        for name, (lo, hi) in SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                counts[name] += 1
                break
    if total == 0:
        return "english"
    dominant = max(counts.items(), key=lambda kv: kv[1])
    if dominant[1] / total > 0.2:
        return dominant[0]
    return "english"


def _char_box_width(bbox, idx: int, total: int) -> float:
    x_coords = [p[0] for p in bbox]
    min_x, max_x = min(x_coords), max(x_coords)
    width = (max_x - min_x) / max(1, total)
    return float(width)


def _char_box_height(bbox) -> float:
    y_coords = [p[1] for p in bbox]
    return float(max(y_coords) - min(y_coords))


def run_ocr(image_path: str) -> Dict:
    # Pass 1: English reader (always available) to get some text and
    # sniff the dominant Unicode script from the raw characters.
    try:
        first = _reader_for("english")
    except Exception as exc:  # noqa: BLE001
        log.exception("OCR init failed")
        return _empty_result(error=f"OCR init failed: {exc}")

    try:
        raw = first.readtext(image_path)
    except Exception as exc:  # noqa: BLE001
        log.exception("OCR pass 1 failed on %s", image_path)
        return _empty_result(error=f"OCR failed: {exc}")

    # Cap lines to prevent CPU hang on dense documents (e.g. full-page scans
    # with hundreds of text regions). 50 lines is sufficient for forensic
    # glyph-metric analysis and keeps processing under ~3 s.
    raw = raw[:50]

    first_text = " ".join([r[1] for r in raw]) if raw else ""
    script = detect_script(first_text)

    # Pass 2: if a non-English Indic script was detected, re-run with the
    # dedicated script reader so glyphs are actually recognized rather
    # than mangled through the English model.
    if script != "english":
        try:
            specific = _reader_for(script)
            raw2 = specific.readtext(image_path)
            if raw2:
                raw = raw2[:50]  # apply same cap to pass 2
        except Exception as exc:  # noqa: BLE001
            log.warning("OCR pass 2 for %s failed: %s", script, exc)

    full_text = " ".join([r[1] for r in raw]) if raw else ""
    script = detect_script(full_text) if full_text else script

    ocr_lines: List[Dict] = []
    flagged_characters: List[Dict] = []
    kerning_rows: List[List[float]] = []
    glyph_counter = 0

    for line_idx, (bbox, text, conf) in enumerate(raw):
        text = text or ""
        if not text.strip():
            continue
        length = len(text)
        if length == 0:
            continue
        total_w = _char_box_width(bbox, 0, 1)
        line_h = max(1.0, _char_box_height(bbox))
        per_char_w = total_w / length

        ratios = []
        for i, ch in enumerate(text):
            ratio = (per_char_w / line_h) if line_h > 0 else 0.0
            ratios.append(ratio)

        median = float(np.median(ratios)) if ratios else 0.0
        segments = []
        row_heat: List[float] = []
        for i, ch in enumerate(text):
            r = ratios[i] if i < len(ratios) else 0.0
            deviation = abs(r - median) / median if median > 0 else 0.0
            is_flag = deviation > DEVIATION_THRESHOLD and length > 1
            if is_flag:
                flagged_characters.append({
                    "index": glyph_counter,
                    "char": ch,
                    "line": line_idx,
                    "deviation": float(deviation),
                    "reason": f"metric drift {deviation*100:.0f}%",
                })
            segments.append({
                "text": ch,
                "flagged": bool(is_flag),
                "reason": f"metric drift {deviation*100:.0f}%" if is_flag else "",
            })
            row_heat.append(min(1.0, deviation))
            glyph_counter += 1
        if row_heat:
            kerning_rows.append(row_heat)

        ocr_lines.append({
            "text": text,
            "confidence": float(conf),
            "segments": segments,
        })

    heat = _pad_heatmap(kerning_rows, rows=8, cols=16)

    return {
        "detected": script != "english",
        "script": script,
        "confidence": float(np.mean([ln["confidence"] for ln in ocr_lines])) if ocr_lines else 0.0,
        "ocr_text": full_text,
        "ocr_lines": ocr_lines,
        "flagged_characters": flagged_characters,
        "glyph_count": glyph_counter,
        "kerning_heatmap": heat,
    }


def _pad_heatmap(rows_data: List[List[float]], rows: int = 8, cols: int = 16) -> List[List[float]]:
    grid = np.zeros((rows, cols), dtype=np.float32)
    if not rows_data:
        return grid.tolist()
    for r_i in range(min(rows, len(rows_data))):
        row = rows_data[r_i]
        if not row:
            continue
        arr = np.array(row, dtype=np.float32)
        if arr.size == 0:
            continue
        xp = np.linspace(0, 1, arr.size)
        xq = np.linspace(0, 1, cols)
        grid[r_i] = np.interp(xq, xp, arr)
    return grid.tolist()


def _empty_result(error: Optional[str] = None) -> Dict:
    return {
        "detected": False,
        "script": "english",
        "confidence": 0.0,
        "ocr_text": "",
        "ocr_lines": [],
        "flagged_characters": [],
        "glyph_count": 0,
        "kerning_heatmap": [[0.0] * 16 for _ in range(8)],
        "error": error,
    }
