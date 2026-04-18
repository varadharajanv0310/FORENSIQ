"""Ensemble weighting, verdict thresholds, and reason generation.

The signal scores coming out of each detector are combined with a fixed
weight vector into a single ensemble_score in [0, 1]. Thresholds map
that score to one of three labels (GENUINE / SUSPICIOUS / FORGED). A
human-readable reason string is generated from the highest-confidence
contributing signal so the user gets an explainable verdict.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

TRAINED_WEIGHTS = {
    "ela":      0.35,
    "cnn":      0.40,
    "font":     0.15,
    "metadata": 0.10,
}

UNTRAINED_WEIGHTS = {
    "ela":      0.55,
    "cnn":      0.00,
    "font":     0.25,
    "metadata": 0.20,
}

VERDICT_THRESHOLDS = [
    (0.40, "GENUINE"),
    (0.70, "SUSPICIOUS"),
    (1.01, "FORGED"),
]


def select_weights(cnn_trained: bool) -> Dict[str, float]:
    return TRAINED_WEIGHTS if cnn_trained else UNTRAINED_WEIGHTS


def ensemble_score(signals: Dict[str, Dict], weights: Dict[str, float]) -> float:
    total = 0.0
    weight_sum = 0.0
    for key, w in weights.items():
        if w <= 0:
            continue
        sig = signals.get(key)
        if not sig:
            continue
        total += float(sig.get("score", 0.0)) * w
        weight_sum += w
    if weight_sum <= 0:
        return 0.0
    return total / weight_sum


def classify(score: float) -> str:
    for threshold, label in VERDICT_THRESHOLDS:
        if score < threshold:
            return label
    return "FORGED"


def _region_for_ela(ela: Dict) -> str:
    regional = ela.get("regional_scores") or []
    if not regional:
        return "page"
    peak_idx = max(range(len(regional)), key=lambda i: regional[i])
    return f"strip {peak_idx + 1}/{len(regional)}"


def generate_reason(signals: Dict[str, Dict], verdict: str, weights: Dict[str, float]) -> str:
    active = [(k, signals.get(k, {})) for k in weights if weights.get(k, 0) > 0 and k in signals]
    if verdict == "GENUINE":
        return ("No significant forgery signal detected — ELA residuals nominal, "
                "metadata clean, font metrics consistent.")

    def rank(item: Tuple[str, Dict]) -> float:
        _, sig = item
        return float(sig.get("score", 0.0)) * float(sig.get("confidence", 0.0))

    if not active:
        return "Ensemble inconclusive — insufficient signals."

    active.sort(key=rank, reverse=True)
    top_key, top_sig = active[0]
    conf_pct = int(round(float(top_sig.get("confidence", 0.0)) * 100))

    if top_key == "ela":
        region = _region_for_ela(top_sig)
        return (f"Pixel compression artifacts detected in {region} — "
                f"{conf_pct}% confidence of tampering")
    if top_key == "font":
        n = len(top_sig.get("flagged_regions", []))
        return (f"Font inconsistencies found across {n} text regions — "
                "character size variance exceeds threshold")
    if top_key == "metadata":
        anomalies = top_sig.get("anomalies", [])
        hint = anomalies[0] if anomalies else "timestamp inconsistency detected"
        return (f"Document metadata indicates modification after creation — {hint}")
    if top_key == "cnn":
        return ("Deep learning analysis flagged visual patterns consistent "
                "with image manipulation")
    return f"Ensemble flagged {top_key} signal — score {top_sig.get('score', 0.0):.2f}"


def build_timeline(ela: Dict, num_strips: int = 10) -> List[Dict]:
    regional = ela.get("regional_scores") or []
    if not regional:
        return [
            {
                "region": i + 1,
                "y_start": i / num_strips,
                "y_end": (i + 1) / num_strips,
                "confidence": 0.0,
                "status": "clean",
            }
            for i in range(num_strips)
        ]
    timeline: List[Dict] = []
    for i, val in enumerate(regional):
        conf = max(0.0, min(1.0, val * 2.5))
        if conf >= 0.65:
            status = "suspicious"
        elif conf >= 0.35:
            status = "warning"
        else:
            status = "clean"
        timeline.append({
            "region": i + 1,
            "y_start": i / len(regional),
            "y_end": (i + 1) / len(regional),
            "confidence": conf,
            "status": status,
        })
    return timeline
