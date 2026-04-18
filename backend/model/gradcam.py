"""GradCAM visualisation for the EfficientNet-B0 forgery classifier.

Hooks into the final convolutional block (``features.8``), back-propagates
the gradient of the forged-class logit with respect to the feature maps,
computes the standard GradCAM weighting and blends the resulting heatmap
over the original image.
"""
from __future__ import annotations

import os
import uuid
from typing import Dict

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from .inference import _DEVICE, _TRANSFORM, load_model


def _forward_hook(state):
    def hook(_module, _inp, out):
        state["activations"] = out.detach()
    return hook


def _backward_hook(state):
    def hook(_module, _grad_in, grad_out):
        state["gradients"] = grad_out[0].detach()
    return hook


def generate_gradcam(image_path: str, heatmap_dir: str, target_class: int = 1) -> Dict:
    """Generate a GradCAM blend for ``image_path`` and save it as PNG.

    Returns a dict with ``heatmap_path`` and ``heatmap_url``.
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
        return _save_fallback(orig_np, heatmap_dir)

    weights = gradients.mean(dim=(2, 3), keepdim=True)
    cam = (weights * activations).sum(dim=1, keepdim=True)
    cam = F.relu(cam)
    cam = F.interpolate(cam, size=(h_orig, w_orig), mode="bilinear", align_corners=False)
    cam_np = cam[0, 0].cpu().numpy()
    cam_min, cam_max = float(cam_np.min()), float(cam_np.max())
    if cam_max - cam_min < 1e-8:
        cam_np = np.zeros_like(cam_np)
    else:
        cam_np = (cam_np - cam_min) / (cam_max - cam_min)

    heatmap = cv2.applyColorMap((cam_np * 255).astype(np.uint8), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)

    blended = (0.5 * orig_np.astype(np.float32) + 0.5 * heatmap.astype(np.float32))
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    heatmap_id = f"gc_{uuid.uuid4().hex[:12]}.png"
    heatmap_path = os.path.join(heatmap_dir, heatmap_id)
    Image.fromarray(blended).save(heatmap_path, "PNG")

    return {
        "heatmap_path": heatmap_path,
        "heatmap_url": f"/static/heatmaps/{heatmap_id}",
    }


def _save_fallback(orig_np: np.ndarray, heatmap_dir: str) -> Dict:
    heatmap_id = f"gc_{uuid.uuid4().hex[:12]}.png"
    heatmap_path = os.path.join(heatmap_dir, heatmap_id)
    Image.fromarray(orig_np).save(heatmap_path, "PNG")
    return {
        "heatmap_path": heatmap_path,
        "heatmap_url": f"/static/heatmaps/{heatmap_id}",
    }
