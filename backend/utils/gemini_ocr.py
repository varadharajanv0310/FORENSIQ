"""Gemini 2.5 Vision-based OCR for FORENSIQ regional language detection.

Replaces EasyOCR as the primary OCR engine because:

* Handles every script natively (Tamil, Hindi, Telugu, Kannada, Malayalam,
  English, plus many others) without per-script model downloads.
* Returns structured JSON we can parse directly into the same dict shape
  produced by ``model.ocr_pipeline.run_ocr`` so the frontend works unchanged.
* No 200 MB EasyOCR checkpoint download required.

``run_gemini_ocr`` never raises — on any failure it returns a dict with an
``error`` key so ``main.py`` can transparently fall back to EasyOCR.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Dict, List, Optional

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

try:
    from google import genai as _genai_new  # type: ignore
    from google.genai import types as _genai_types  # type: ignore
    GENAI_AVAILABLE = True
except ImportError:
    _genai_new = None
    _genai_types = None
    GENAI_AVAILABLE = False

# Unicode script ranges — matches ocr_pipeline.SCRIPT_RANGES so the
# downstream frontend (RegionalLanguagePanel) keeps working unchanged.
SCRIPT_RANGES = {
    "tamil":     (0x0B80, 0x0BFF),
    "hindi":     (0x0900, 0x097F),
    "telugu":    (0x0C00, 0x0C7F),
    "kannada":   (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
}

# Map Gemini free-form language names → our canonical script keys.
LANG_NAME_TO_SCRIPT = {
    "tamil":     "tamil",
    "hindi":     "hindi",
    "devanagari": "hindi",
    "telugu":    "telugu",
    "kannada":   "kannada",
    "malayalam": "malayalam",
    "english":   "english",
    "latin":     "english",
    "roman":     "english",
}

DEVIATION_THRESHOLD = 0.30

_client = None


def _get_client():
    """Build and cache the genai Client on first use. Returns None when
    the SDK is unavailable or no API key is configured."""
    global _client
    if _client is not None:
        return _client
    if not GENAI_AVAILABLE:
        return None
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return None
    try:
        _client = _genai_new.Client(api_key=key)
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini client init failed: %s", exc)
        return None
    return _client


def is_available() -> bool:
    """True when the Gemini SDK is importable and an API key is present."""
    return GENAI_AVAILABLE and bool(os.environ.get("GEMINI_API_KEY", "").strip())


def _detect_script_from_text(text: str) -> str:
    """Dominant-script detection from the extracted text (same rule as
    ocr_pipeline.detect_script so results look identical)."""
    if not text:
        return "english"
    counts: Dict[str, int] = {k: 0 for k in SCRIPT_RANGES}
    total = 0
    for ch in text:
        if ch.isspace() or not ch.isprintable():
            continue
        total += 1
        cp = ord(ch)
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


def _normalise_script(language_hint: str, full_text: str) -> str:
    """Pick a canonical script key. Prefer Unicode-range evidence from the
    extracted text; fall back to the model's language label."""
    by_text = _detect_script_from_text(full_text)
    if by_text != "english":
        return by_text
    hint = (language_hint or "").strip().lower()
    if hint in LANG_NAME_TO_SCRIPT:
        return LANG_NAME_TO_SCRIPT[hint]
    return by_text  # "english" fallback


def _extract_json_blob(raw: str) -> Optional[dict]:
    """Gemini sometimes wraps JSON in ```json fences. Strip and parse."""
    if not raw:
        return None
    raw = raw.strip()
    # Direct parse attempt.
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        pass
    # Strip ``` fences.
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:  # noqa: BLE001
            pass
    # Last-ditch: find first { … matching } at top level.
    m = re.search(r"(\{.*\})", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:  # noqa: BLE001
            return None
    return None


PROMPT = (
    "You are an OCR and language-detection engine. Analyze the attached "
    "document image and extract every legible line of text. Return ONLY a "
    "valid JSON object matching exactly this schema (no prose, no markdown):\n\n"
    "{\n"
    '  "language_name": "<primary language in English, e.g. \\"Tamil\\", \\"Hindi\\", \\"English\\">",\n'
    '  "script": "<tamil|hindi|telugu|kannada|malayalam|english|other>",\n'
    '  "confidence": <float 0.0-1.0>,\n'
    '  "full_text": "<all extracted text concatenated with single spaces>",\n'
    '  "lines": [ { "text": "<line>", "confidence": <float 0.0-1.0> }, ... ]\n'
    "}\n\n"
    "Preserve the original script characters (do NOT transliterate). If the "
    "document contains multiple scripts, pick the dominant one. Cap lines at "
    "50 entries. If no text is legible, return empty strings / arrays with "
    "confidence 0.0."
)


def _build_lines(
    gemini_lines: List[dict],
    full_text: str,
) -> (List[dict], List[dict], int, List[List[float]]):
    """Build ocr_lines + flagged_characters + kerning heatmap rows from a
    list of ``{text, confidence}`` entries coming back from Gemini.

    We don't have per-character bounding boxes from Gemini, so per-glyph
    width/height ratios are approximated by character class (wide/narrow).
    The deviation signal still surfaces heterogeneous glyph sources because
    different scripts mixed into one line produce ratio drift.
    """
    ocr_lines: List[dict] = []
    flagged_characters: List[dict] = []
    kerning_rows: List[List[float]] = []
    glyph_counter = 0

    def _char_aspect(ch: str) -> float:
        """Rough aspect-ratio proxy per character class. Real EasyOCR uses
        bbox widths; we approximate using Unicode block membership so
        cross-script mixing still yields drift."""
        cp = ord(ch)
        # Wide CJK / Indic conjuncts
        if any(lo <= cp <= hi for lo, hi in SCRIPT_RANGES.values()):
            return 0.65
        # Digits
        if ch.isdigit():
            return 0.55
        # Uppercase Latin
        if "A" <= ch <= "Z":
            return 0.70
        # Lowercase narrow letters
        if ch in "ijl|!.,:;'":
            return 0.25
        # Lowercase Latin
        if "a" <= ch <= "z":
            return 0.50
        return 0.60

    for line_idx, entry in enumerate(gemini_lines[:50]):
        text = str(entry.get("text") or "").strip()
        conf = float(entry.get("confidence") or 0.85)
        if not text:
            continue
        length = len(text)
        if length == 0:
            continue

        ratios = [_char_aspect(c) for c in text]
        median = float(np.median(ratios)) if ratios else 0.0
        segments: List[dict] = []
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
            "confidence": conf,
            "segments": segments,
        })

    return ocr_lines, flagged_characters, glyph_counter, kerning_rows


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
        "language_name": "English",
        "confidence": 0.0,
        "ocr_text": "",
        "ocr_lines": [],
        "flagged_characters": [],
        "glyph_count": 0,
        "kerning_heatmap": [[0.0] * 16 for _ in range(8)],
        "source": "gemini-2.5-flash",
        "error": error,
    }


def run_gemini_ocr(image_path: str) -> Dict:
    """Run OCR via Gemini 2.5 Flash Vision. Never raises.

    Returns the same dict shape as ``model.ocr_pipeline.run_ocr`` so the
    frontend ``RegionalLanguagePanel`` component works unchanged. Adds two
    extra keys for diagnostics:

    * ``language_name`` — human-friendly language label (e.g. "Tamil")
    * ``source`` — always ``"gemini-2.5-flash"``
    """
    client = _get_client()
    if client is None:
        return _empty_result(error="Gemini OCR unavailable — API key missing or SDK not installed.")

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini OCR could not open %s: %s", image_path, exc)
        return _empty_result(error=f"Could not open image: {exc}")

    try:
        # Thinking disabled (thinking_budget=0) so the full token budget goes
        # to the JSON response instead of being silently consumed by Gemini
        # 2.5 Flash's default reasoning mode.
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[PROMPT, img],
            config=_genai_types.GenerateContentConfig(
                max_output_tokens=4096,
                temperature=0.0,
                response_mime_type="application/json",
                thinking_config=_genai_types.ThinkingConfig(thinking_budget=0),
            ),
        )
        raw_text = (response.text or "").strip()
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini OCR request failed: %s", exc)
        return _empty_result(error=f"Gemini API call failed: {exc}")

    data = _extract_json_blob(raw_text)
    if not data or not isinstance(data, dict):
        log.warning("Gemini OCR returned non-JSON: %s", raw_text[:200])
        return _empty_result(error="Gemini returned unparsable output.")

    full_text = str(data.get("full_text") or "").strip()
    language_name = str(data.get("language_name") or "").strip() or "Unknown"
    raw_lines = data.get("lines") or []
    if not isinstance(raw_lines, list):
        raw_lines = []

    # If the model didn't supply lines but did supply full_text, fake a
    # single-line entry so the UI still has something to render.
    if not raw_lines and full_text:
        raw_lines = [{"text": full_text, "confidence": float(data.get("confidence") or 0.85)}]

    script = _normalise_script(data.get("script") or language_name, full_text)

    ocr_lines, flagged_chars, glyph_count, rows = _build_lines(raw_lines, full_text)

    if ocr_lines:
        avg_conf = float(np.mean([ln["confidence"] for ln in ocr_lines]))
    else:
        avg_conf = float(data.get("confidence") or 0.0)

    # Harmonise language_name with the detected script so the UI always
    # reports something coherent (e.g. script=tamil → "Tamil").
    canonical_name = {
        "tamil":     "Tamil",
        "hindi":     "Hindi",
        "telugu":    "Telugu",
        "kannada":   "Kannada",
        "malayalam": "Malayalam",
        "english":   "English",
    }.get(script, language_name)

    return {
        "detected": script != "english",
        "script": script,
        "language_name": canonical_name,
        "confidence": avg_conf,
        "ocr_text": full_text,
        "ocr_lines": ocr_lines,
        "flagged_characters": flagged_chars,
        "glyph_count": glyph_count,
        "kerning_heatmap": _pad_heatmap(rows, rows=8, cols=16),
        "source": "gemini-2.5-flash",
    }
