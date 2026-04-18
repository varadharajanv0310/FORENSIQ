"""EfficientNet-B0 inference wrapper for forgery classification.

Loads a fine-tuned EfficientNet-B0 checkpoint (if present) and produces a
forged-probability score for an input image. If the checkpoint is missing
the module still runs end-to-end using the pretrained ImageNet weights,
but the score defaults to 0.5 and ``trained=False`` is returned so that
the ensemble can reweight itself to rely on ELA/Font/Metadata only.
"""
from __future__ import annotations

import os
from typing import Dict, Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights

CHECKPOINT_PATH = os.path.join(
    os.path.dirname(__file__), "checkpoints", "efficientnet_forensiq.pth"
)

_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_MODEL: Optional[nn.Module] = None
_TRAINED: bool = False
_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _build_model() -> nn.Module:
    model = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, 2)
    return model


def load_model() -> nn.Module:
    """Load the model once and cache it in-process."""
    global _MODEL, _TRAINED
    if _MODEL is not None:
        return _MODEL

    model = _build_model()
    if os.path.isfile(CHECKPOINT_PATH):
        try:
            state = torch.load(CHECKPOINT_PATH, map_location=_DEVICE)
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            model.load_state_dict(state, strict=False)
            _TRAINED = True
        except Exception as exc:  # noqa: BLE001
            print(f"[inference] Failed to load checkpoint: {exc}; using pretrained only.")
            _TRAINED = False
    else:
        _TRAINED = False

    model.to(_DEVICE)
    model.eval()
    _MODEL = model
    return model


def is_trained() -> bool:
    load_model()
    return _TRAINED


def preprocess(image_path: str) -> torch.Tensor:
    img = Image.open(image_path).convert("RGB")
    tensor = _TRANSFORM(img).unsqueeze(0).to(_DEVICE)
    return tensor


def predict(image_path: str) -> Dict:
    """Return classifier output for ``image_path``.

    When no fine-tuned checkpoint exists we deliberately return a neutral
    0.5 score and a low confidence so the ensemble reweights and the
    system still runs end-to-end on ELA+Font+Metadata.
    """
    model = load_model()
    trained = is_trained()

    if not trained:
        return {
            "score": 0.5,
            "confidence": 0.15,
            "trained": False,
            "backbone": "EfficientNet-B0 (pretrained, untuned)",
        }

    with torch.no_grad():
        tensor = preprocess(image_path)
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

    forged_prob = float(probs[1])
    confidence = float(np.abs(probs[1] - probs[0]) + 0.5)
    confidence = min(1.0, confidence)

    return {
        "score": forged_prob,
        "confidence": confidence,
        "trained": True,
        "backbone": "EfficientNet-B0 (fine-tuned)",
    }
