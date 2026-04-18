"""OCR + regional-script forensics.

Runs EasyOCR across six scripts (English, Tamil, Hindi, Telugu, Kannada,
Malayalam), detects the dominant script from Unicode code-point ranges,
and for each line computes the median character width/height ratio.
Characters whose metrics deviate more than 30% from the line median are
flagged — a classic signal of heterogeneous glyph sources stitched into
a single line.
"""
from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np

SCRIPT_RANGES = {
    "tamil":     (0x0B80, 0x0BFF),
    "hindi":     (0x0900, 0x097F),
    "telugu":    (0x0C00, 0x0C7F),
    "kannada":   (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
}

LANGS = ["en", "ta", "hi", "te", "kn", "ml"]
DEVIATION_THRESHOLD = 0.30

_READER = None


def _get_reader():
    global _READER
    if _READER is None:
        import easyocr
        _READER = easyocr.Reader(LANGS, gpu=False, verbose=False)
    return _READER


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
    try:
        reader = _get_reader()
    except Exception as exc:  # noqa: BLE001
        return _empty_result(error=f"OCR init failed: {exc}")

    try:
        raw = reader.readtext(image_path)
    except Exception as exc:  # noqa: BLE001
        return _empty_result(error=f"OCR failed: {exc}")

    full_text = " ".join([r[1] for r in raw]) if raw else ""
    script = detect_script(full_text)

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
