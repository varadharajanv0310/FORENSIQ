"""EfficientNet-B0 fine-tuning script for FORENSIQ.

Scans ``D:\\FORENSIQ\\data\\archive`` for folders named ``Au`` (authentic)
and ``Tp`` (tampered). The images beneath those folders form the
labelled dataset. A stratified 80/10/10 split is used for
train/val/test. The classifier head of an ImageNet-pretrained
EfficientNet-B0 is replaced with ``Linear(1280, 2)`` and fine-tuned with
AdamW + cosine annealing. The best validation checkpoint is saved to
``backend/model/checkpoints/efficientnet_forensiq.pth``; if the API
finds this file it switches from the ELA+Font+Metadata fallback to the
full 4-signal ensemble.
"""
from __future__ import annotations

import argparse
import os
import random
from collections import Counter
from glob import glob
from typing import List, Tuple

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights

DEFAULT_ARCHIVE = r"D:\FORENSIQ\data\archive"
CHECKPOINT_DIR = os.path.join(os.path.dirname(__file__), "checkpoints")
CHECKPOINT_PATH = os.path.join(CHECKPOINT_DIR, "efficientnet_forensiq.pth")

IMG_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def collect_samples(root: str) -> List[Tuple[str, int]]:
    """Walk ``root`` and collect (path, label) pairs. Label 0 = Au, 1 = Tp."""
    samples: List[Tuple[str, int]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        label: int
        parent = os.path.basename(dirpath)
        if parent == "Au":
            label = 0
        elif parent == "Tp":
            label = 1
        else:
            continue
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in IMG_EXTENSIONS:
                samples.append((os.path.join(dirpath, fn), label))
    return samples


def stratified_split(samples: List[Tuple[str, int]], ratios=(0.8, 0.1, 0.1), seed=42):
    rng = random.Random(seed)
    by_label = {0: [], 1: []}
    for path, lab in samples:
        by_label[lab].append(path)
    train, val, test = [], [], []
    for lab, items in by_label.items():
        rng.shuffle(items)
        n = len(items)
        n_train = int(n * ratios[0])
        n_val = int(n * ratios[1])
        train += [(p, lab) for p in items[:n_train]]
        val += [(p, lab) for p in items[n_train:n_train + n_val]]
        test += [(p, lab) for p in items[n_train + n_val:]]
    rng.shuffle(train); rng.shuffle(val); rng.shuffle(test)
    return train, val, test


class ImageFolderList(Dataset):
    def __init__(self, items: List[Tuple[str, int]], transform):
        self.items = items
        self.transform = transform

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int):
        path, label = self.items[idx]
        img = Image.open(path).convert("RGB")
        return self.transform(img), label


def build_transforms():
    train_tf = transforms.Compose([
        transforms.Resize((240, 240)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train_tf, eval_tf


def build_model() -> nn.Module:
    model = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, 2)
    return model


def train_one_epoch(model, loader, optimizer, criterion, device):
    model.train()
    running = 0.0
    n = 0
    for x, y in loader:
        x = x.to(device, non_blocking=True); y = y.to(device, non_blocking=True)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()
        running += float(loss) * x.size(0); n += x.size(0)
    return running / max(1, n)


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    running = 0.0; n = 0
    correct = 0
    tp = fp = fn = tn = 0
    for x, y in loader:
        x = x.to(device); y = y.to(device)
        logits = model(x)
        loss = criterion(logits, y)
        running += float(loss) * x.size(0); n += x.size(0)
        preds = logits.argmax(dim=1)
        correct += int((preds == y).sum())
        tp += int(((preds == 1) & (y == 1)).sum())
        fp += int(((preds == 1) & (y == 0)).sum())
        fn += int(((preds == 0) & (y == 1)).sum())
        tn += int(((preds == 0) & (y == 0)).sum())
    acc = correct / max(1, n)
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    return running / max(1, n), acc, precision, recall, f1


def main():
    parser = argparse.ArgumentParser(description="Fine-tune EfficientNet-B0 for FORENSIQ")
    parser.add_argument("--data", default=DEFAULT_ARCHIVE)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-2)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--patience", type=int, default=5)
    args = parser.parse_args()

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    print(f"[train] scanning {args.data} for Au/ and Tp/ …")
    samples = collect_samples(args.data)
    if not samples:
        raise SystemExit(f"No samples found. Expected Au/ and Tp/ folders under {args.data}.")
    print(f"[train] found {len(samples)} images · class counts: {Counter(l for _, l in samples)}")

    train_items, val_items, test_items = stratified_split(samples)
    train_tf, eval_tf = build_transforms()
    train_ds = ImageFolderList(train_items, train_tf)
    val_ds   = ImageFolderList(val_items, eval_tf)
    test_ds  = ImageFolderList(test_items, eval_tf)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=args.num_workers, pin_memory=True)
    val_loader   = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                              num_workers=args.num_workers, pin_memory=True)
    test_loader  = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False,
                              num_workers=args.num_workers, pin_memory=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train] device: {device}")

    model = build_model().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val = float("inf")
    no_improve = 0

    for epoch in range(1, args.epochs + 1):
        train_loss = train_one_epoch(model, train_loader, optimizer, criterion, device)
        val_loss, val_acc, val_p, val_r, val_f1 = evaluate(model, val_loader, criterion, device)
        scheduler.step()
        print(f"[train] epoch {epoch:02d} · train_loss {train_loss:.4f} · "
              f"val_loss {val_loss:.4f} · val_acc {val_acc:.4f} · "
              f"P {val_p:.3f} R {val_r:.3f} F1 {val_f1:.3f}")
        if val_loss < best_val - 1e-4:
            best_val = val_loss
            no_improve = 0
            torch.save(model.state_dict(), CHECKPOINT_PATH)
            print(f"[train] ↓ best val_loss {best_val:.4f} → saved checkpoint.")
        else:
            no_improve += 1
            if no_improve >= args.patience:
                print(f"[train] early stop after {epoch} epochs (no improvement in {args.patience}).")
                break

    print(f"[train] loading best checkpoint for final test evaluation …")
    model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=device))
    _, acc, p, r, f1 = evaluate(model, test_loader, criterion, device)
    print(f"[train] TEST RESULTS · accuracy {acc:.4f} · precision {p:.4f} · "
          f"recall {r:.4f} · F1 {f1:.4f}")
    print(f"[train] checkpoint saved to {CHECKPOINT_PATH}")


if __name__ == "__main__":
    main()
