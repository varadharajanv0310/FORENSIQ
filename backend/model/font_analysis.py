"""Font-consistency analysis via MSER blob detection + KMeans clustering.

Detects text-like regions with OpenCV's MSER detector, computes per-region
geometric features, clusters the majority population with KMeans, and
flags regions whose area deviates more than 2 standard deviations from
the majority cluster. This is a lightweight replacement for a trained
font-identifier — it catches the most common copy/paste forgery signal
(a region whose font metrics clearly disagree with its neighbours).
"""
from __future__ import annotations

from typing import Dict, List

import cv2
import numpy as np
from sklearn.cluster import KMeans


def analyze_fonts(image_path: str) -> Dict:
    img = cv2.imread(image_path)
    if img is None:
        return {
            "score": 0.0,
            "confidence": 0.0,
            "flagged_regions": [],
            "total_regions": 0,
        }

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mser = cv2.MSER_create()
    mser.setMinArea(40)
    mser.setMaxArea(int(0.05 * gray.shape[0] * gray.shape[1]))

    regions, _ = mser.detectRegions(gray)
    # Cap regions to prevent KMeans stall on complex images (e.g. dense
    # forms with thousands of blobs). 500 regions is more than enough for
    # font-consistency scoring; the ratio-based score is largely scale-invariant.
    regions = list(regions)[:500]
    total = len(regions)
    if total == 0:
        return {
            "score": 0.0,
            "confidence": 0.1,
            "flagged_regions": [],
            "total_regions": 0,
        }

    features: List[List[float]] = []
    boxes: List[Dict] = []
    for pts in regions:
        x, y, w, h = cv2.boundingRect(pts)
        if w == 0 or h == 0:
            continue
        aspect = w / float(h)
        area = float(w * h)
        mask = np.zeros(gray.shape, dtype=np.uint8)
        cv2.drawContours(mask, [pts], -1, 255, -1)
        mean_intensity = float(cv2.mean(gray, mask=mask)[0])
        features.append([area, aspect, mean_intensity])
        boxes.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h),
                       "area": area, "aspect": aspect,
                       "mean_intensity": mean_intensity})

    if len(features) < 3:
        return {
            "score": 0.0,
            "confidence": 0.15,
            "flagged_regions": [],
            "total_regions": len(features),
        }

    feats = np.asarray(features, dtype=np.float32)
    n_clusters = min(3, len(features))
    try:
        km = KMeans(n_clusters=n_clusters, n_init=5, random_state=42)
        labels = km.fit_predict(feats)
    except Exception:
        return {
            "score": 0.0,
            "confidence": 0.15,
            "flagged_regions": [],
            "total_regions": len(features),
        }

    counts = np.bincount(labels, minlength=n_clusters)
    majority = int(np.argmax(counts))
    majority_mask = labels == majority

    majority_area = feats[majority_mask, 0]
    if majority_area.size < 2:
        return {
            "score": 0.0,
            "confidence": 0.2,
            "flagged_regions": [],
            "total_regions": len(features),
        }

    mean_a = float(majority_area.mean())
    std_a = float(majority_area.std()) or 1.0

    flagged: List[Dict] = []
    for box, feat in zip(boxes, feats):
        z = abs(feat[0] - mean_a) / std_a
        if z > 2.0:
            entry = dict(box)
            entry["z_score"] = float(z)
            flagged.append(entry)

    flagged.sort(key=lambda r: r["z_score"], reverse=True)
    flagged = flagged[:32]

    total_regions = len(features)
    score = float(len(flagged)) / float(total_regions) if total_regions else 0.0
    score = min(1.0, score * 4.0)
    confidence = min(1.0, 0.4 + (len(flagged) > 0) * 0.35 + min(0.2, total_regions / 400.0))

    return {
        "score": score,
        "confidence": confidence,
        "flagged_regions": flagged,
        "total_regions": total_regions,
    }
