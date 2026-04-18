"""Error-Level Analysis (ELA) module.

Computes pixel-level residuals by re-encoding the input image at a known
JPEG quality and measuring the absolute pixel delta. Forged or composited
regions typically exhibit higher residuals than their surroundings because
they carry a different compression history. The module also slices the
residual map into 10 horizontal strips and returns per-strip means, which
feed the confidence timeline shown in the UI.
"""
from __future__ import annotations

import io
import os
import uuid
from typing import Dict, List

import numpy as np
from PIL import Image, ImageChops

ELA_QUALITY = 95
AMPLIFY = 10.0
NUM_STRIPS = 10


def compute_ela(image_path: str, heatmap_dir: str) -> Dict:
    """Run ELA on ``image_path`` and save a visualisation into ``heatmap_dir``.

    Returns a dict with keys: ``score``, ``confidence``, ``regional_scores``,
    ``heatmap_path``, ``heatmap_url``.
    """
    os.makedirs(heatmap_dir, exist_ok=True)
    original = Image.open(image_path).convert("RGB")

    buf = io.BytesIO()
    original.save(buf, "JPEG", quality=ELA_QUALITY)
    buf.seek(0)
    resaved = Image.open(buf).convert("RGB")

    diff = ImageChops.difference(original, resaved)
    ela_array = np.asarray(diff, dtype=np.float32) * AMPLIFY
    ela_array = np.clip(ela_array, 0, 255).astype(np.uint8)

    gray = ela_array.mean(axis=2)

    h, w = gray.shape
    strip_h = max(1, h // NUM_STRIPS)
    regional: List[float] = []
    for i in range(NUM_STRIPS):
        y0 = i * strip_h
        y1 = h if i == NUM_STRIPS - 1 else (i + 1) * strip_h
        strip = gray[y0:y1, :]
        mean = float(strip.mean()) / 255.0 if strip.size else 0.0
        regional.append(mean)

    overall = float(np.mean(regional)) if regional else 0.0
    overall = min(1.0, overall * 3.0)

    variance = float(np.var(regional)) if regional else 0.0
    confidence = min(1.0, 0.55 + variance * 30.0)

    heatmap_id = f"ela_{uuid.uuid4().hex[:12]}.png"
    heatmap_path = os.path.join(heatmap_dir, heatmap_id)
    Image.fromarray(ela_array).save(heatmap_path, "PNG")

    return {
        "score": overall,
        "confidence": confidence,
        "regional_scores": regional,
        "heatmap_path": heatmap_path,
        "heatmap_url": f"/static/heatmaps/{heatmap_id}",
    }
