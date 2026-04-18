"""GradCAM visualisation for the EfficientNet-B0 forgery classifier.

Hooks into the final convolutional block (``features.8``), back-propagates
the gradient of the forged-class logit with respect to the feature maps,
computes the standard GradCAM weighting and blends the resulting heatmap
over the original image.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Dict

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from .inference import _DEVICE, _TRANSFORM, load_model

log = logging.getLogger(__name__)


def _forward_hook(state):
    def hook(_module, _inp, out):
        state["activations"] = out.detach()
    return hook


def _backward_hook(state):
    def hook(_module, _grad_in, grad_out):
        state["gradients"] = grad_out[0].detach()
    return hook


def _top_boxes_from_cam(cam_np: np.ndarray, top_k: int = 3, grid: int = 8):
    """Slice the normalized CAM into a ``grid`` × ``grid`` mesh, rank cells
    by mean activation, and expand the top-K back to pixel-space bounding
    boxes. Returns a list of ``{label, confidence, x, y, width, height}``.
    """
    h, w = cam_np.shape[:2]
    if h == 0 or w == 0:
        return []
    cell_h = max(1, h // grid)
    cell_w = max(1, w // grid)
    cells = []  # (mean, row, col)
    for r in range(grid):
        y0 = r * cell_h
        y1 = h if r == grid - 1 else (r + 1) * cell_h
        for c in range(grid):
            x0 = c * cell_w
            x1 = w if c == grid - 1 else (c + 1) * cell_w
            patch = cam_np[y0:y1, x0:x1]
            if patch.size == 0:
                continue
            cells.append((float(patch.mean()), r, c))
    cells.sort(key=lambda t: t[0], reverse=True)

    labels = ["Region A", "Region B", "Region C", "Region D", "Region E"]
    boxes = []
    for i, (mean_act, r, c) in enumerate(cells[:top_k]):
        y0 = r * cell_h
        y1 = h if r == grid - 1 else (r + 1) * cell_h
        x0 = c * cell_w
        x1 = w if c == grid - 1 else (c + 1) * cell_w
        boxes.append({
            "label": labels[i] if i < len(labels) else f"Region {i + 1}",
            "confidence": float(max(0.0, min(1.0, mean_act))),
            "x": int(x0),
            "y": int(y0),
            "width": int(x1 - x0),
            "height": int(y1 - y0),
        })
    return boxes


def generate_gradcam(image_path: str, heatmap_dir: str, target_class: int = 1) -> Dict:
    """Generate a GradCAM blend for ``image_path`` and save it as PNG.

    Returns a dict with ``heatmap_path``, ``heatmap_url``, and
    ``bounding_boxes`` (top-3 activation regions in pixel space).
    """
    os.makedirs(heatmap_dir, exist_ok=True)
    model = load_model()

    original = Image.open(image_path).convert("RGB")
    orig_np = np.array(original)
    h_orig, w_orig = orig_np.shape[:2]

    input_tensor = _TRANSFORM(original).unsqueeze(0).to(_DEVICE).requires_grad_(True)

    state: Dict = {}
    target_layer = model.features[-1]  # features.8 for EfficientNet-B0
    fwd = target_layer.register_forward_hook(_forward_hook(state))
    bwd = target_layer.register_full_backward_hook(_backward_hook(state))

    try:
        model.zero_grad()
        logits = model(input_tensor)
        num_classes = logits.shape[1]
        tgt = min(target_class, num_classes - 1)
        score = logits[0, tgt]
        score.backward()
    finally:
        fwd.remove()
        bwd.remove()

    activations = state.get("activations")
    gradients = state.get("gradients")
    if activations is None or gradients is None:
        log.warning("WARNING: GradCAM hooks may not be attached correctly — "
                    "activations=%s gradients=%s (target layer never fired)",
                    activations is not None, gradients is not None)
        return _save_fallback(orig_np, heatmap_dir)

    weights = gradients.mean(dim=(2, 3), keepdim=True)
    cam = (weights * activations).sum(dim=1, keepdim=True)
    cam = F.relu(cam)
    cam = F.interpolate(cam, size=(h_orig, w_orig), mode="bilinear", align_corners=False)
    cam_np = cam[0, 0].cpu().numpy()
    cam_min, cam_max = float(cam_np.min()), float(cam_np.max())
    cam_range = cam_max - cam_min

    # Verification: the CAM must not be a flat map (which would mean the
    # hooks were attached but never caught a real activation/gradient
    # signal). We require >10% of full-scale dynamic range, otherwise log
    # a clear warning so the issue surfaces in stdout rather than silently
    # producing a useless heatmap.
    full_scale = max(abs(cam_max), abs(cam_min), 1e-8)
    if cam_range < 1e-8:
        log.warning("WARNING: GradCAM hooks may not be attached correctly — "
                    "activation map is uniform (min==max==%.6f). Heatmap will be blank.",
                    cam_min)
        cam_np = np.zeros_like(cam_np)
    elif cam_range / full_scale < 0.10:
        log.warning("WARNING: GradCAM hooks may not be attached correctly — "
                    "activation dynamic range is only %.2f%% of full scale "
                    "(min=%.6f max=%.6f).",
                    100.0 * cam_range / full_scale, cam_min, cam_max)
        cam_np = (cam_np - cam_min) / cam_range
    else:
        log.info("GradCAM verified: activation range [%.6f–%.6f] (dynamic range %.2f%% of full scale)",
                 cam_min, cam_max, 100.0 * cam_range / full_scale)
        cam_np = (cam_np - cam_min) / cam_range

    heatmap = cv2.applyColorMap((cam_np * 255).astype(np.uint8), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)

    # 50% original + 50% CAM colormap — never CAM-only, so the viewer can
    # still make out the document structure underneath the heatmap.
    blended = (0.5 * orig_np.astype(np.float32) + 0.5 * heatmap.astype(np.float32))
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    heatmap_id = f"gc_{uuid.uuid4().hex[:12]}.png"
    heatmap_path = os.path.join(heatmap_dir, heatmap_id)
    Image.fromarray(blended).save(heatmap_path, "PNG")

    boxes = _top_boxes_from_cam(cam_np, top_k=3, grid=8)

    return {
        "heatmap_path": heatmap_path,
        "heatmap_url": f"/static/heatmaps/{heatmap_id}",
        "bounding_boxes": boxes,
    }


def _save_fallback(orig_np: np.ndarray, heatmap_dir: str) -> Dict:
    heatmap_id = f"gc_{uuid.uuid4().hex[:12]}.png"
    heatmap_path = os.path.join(heatmap_dir, heatmap_id)
    Image.fromarray(orig_np).save(heatmap_path, "PNG")
    return {
        "heatmap_path": heatmap_path,
        "heatmap_url": f"/static/heatmaps/{heatmap_id}",
        "bounding_boxes": [],
    }
