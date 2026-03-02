from __future__ import annotations

import argparse
import json
import math
import random
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import cv2
import numpy as np
import torch
import torch.nn as nn
from scipy.io import loadmat
from scipy.spatial import KDTree
from torch.utils.data import DataLoader, Dataset
from torchvision import models
from tqdm import tqdm

DATASET_SLUG = "hosammhmdali/shanghai-tech-dataset-part-a-and-part-b"
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

BACKEND_DILATIONS: dict[str, list[int]] = {
    "A": [1, 1, 1, 1, 1, 1],
    "B": [2, 2, 2, 2, 2, 2],
    "C": [2, 2, 2, 4, 4, 4],
    "D": [4, 4, 4, 4, 4, 4],
}


@dataclass(frozen=True)
class Sample:
    image_path: Path
    gt_path: Path


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def resolve_device(device_arg: str) -> torch.device:
    if device_arg == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    device = torch.device(device_arg)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available.")
    if device.type == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is not available.")
    return device


def download_dataset_kagglehub(dataset_slug: str) -> Path:
    try:
        import kagglehub
    except Exception as exc:
        raise RuntimeError(
            "kagglehub is required for automatic dataset download. "
            "Install it or pass --dataset-root."
        ) from exc

    dataset_path = Path(kagglehub.dataset_download(dataset_slug))
    print(f"Path to dataset files: {dataset_path}")
    return dataset_path


def find_part_root(dataset_root: Path, part: str) -> Path:
    part_upper = part.upper()
    part_lower = part.lower()
    search_names = [
        f"part_{part_upper}_final",
        f"part_{part_lower}_final",
        f"part_{part_upper}",
        f"part_{part_lower}",
    ]
    direct_candidates = [
        dataset_root,
        dataset_root / "ShanghaiTech",
        dataset_root / "shanghai_tech",
        dataset_root / "shanghaitech",
    ]
    for base in direct_candidates:
        for name in search_names:
            candidate = base / name
            if candidate.exists():
                return candidate

    for name in search_names:
        matches = list(dataset_root.rglob(name))
        if matches:
            return matches[0]

    raise FileNotFoundError(
        f"Could not locate ShanghaiTech part {part_upper} directory under {dataset_root}."
    )


def _normalized_stem(path_like: Path | str) -> str:
    stem = Path(path_like).stem.lower()
    for prefix in ("gt_", "img_", "image_"):
        if stem.startswith(prefix):
            stem = stem[len(prefix) :]
    return re.sub(r"[^a-z0-9]+", "", stem)


def _numeric_key(path_like: Path | str) -> tuple[int, ...] | None:
    tokens = re.findall(r"\d+", Path(path_like).stem)
    if not tokens:
        return None
    return tuple(int(token) for token in tokens)


def collect_samples(part_root: Path, split: str) -> list[Sample]:
    split_root = part_root / f"{split}_data"
    image_dir_candidates = ["images", "image", "imgs"]
    gt_dir_candidates = ["ground-truth", "ground_truth", "groundtruth", "gt", "annotations"]

    image_dir = next((split_root / name for name in image_dir_candidates if (split_root / name).exists()), None)
    gt_dir = next((split_root / name for name in gt_dir_candidates if (split_root / name).exists()), None)
    if image_dir is None or gt_dir is None:
        raise FileNotFoundError(
            "Expected dataset folders were not found.\n"
            f"- split root: {split_root}\n"
            f"- image dir candidates: {image_dir_candidates}\n"
            f"- gt dir candidates: {gt_dir_candidates}"
        )

    image_paths = sorted(
        [
            *image_dir.rglob("*.jpg"),
            *image_dir.rglob("*.jpeg"),
            *image_dir.rglob("*.png"),
            *image_dir.rglob("*.JPG"),
            *image_dir.rglob("*.JPEG"),
            *image_dir.rglob("*.PNG"),
        ]
    )
    gt_mat_paths = sorted(gt_dir.rglob("*.mat"))
    gt_exact_map = {path.stem.lower(): path for path in gt_mat_paths}
    gt_norm_map: dict[str, list[Path]] = {}
    gt_num_map: dict[tuple[int, ...], list[Path]] = {}
    for gt_path in gt_mat_paths:
        gt_norm_map.setdefault(_normalized_stem(gt_path), []).append(gt_path)
        num_key = _numeric_key(gt_path)
        if num_key is not None:
            gt_num_map.setdefault(num_key, []).append(gt_path)

    samples: list[Sample] = []
    unmatched: list[Path] = []
    used_gt_paths: set[Path] = set()

    def pick_unused(candidates: list[Path], stem_lower: str) -> Path | None:
        available = [path for path in candidates if path not in used_gt_paths]
        if not available:
            return None
        preferred = [path for path in available if stem_lower in path.stem.lower()]
        return preferred[0] if preferred else available[0]

    for image_path in image_paths:
        image_stem = image_path.stem
        stem_lower = image_stem.lower()

        gt_candidate: Path | None = None
        for key in (f"gt_{stem_lower}", stem_lower):
            candidate = gt_exact_map.get(key)
            if candidate is not None and candidate not in used_gt_paths:
                gt_candidate = candidate
                break

        if gt_candidate is None:
            norm_key = _normalized_stem(image_path)
            norm_matches = gt_norm_map.get(norm_key, [])
            gt_candidate = pick_unused(norm_matches, stem_lower)

        if gt_candidate is None:
            num_key = _numeric_key(image_path)
            if num_key is not None:
                num_matches = gt_num_map.get(num_key, [])
                gt_candidate = pick_unused(num_matches, stem_lower)

        if gt_candidate is None:
            unmatched.append(image_path)
            continue

        used_gt_paths.add(gt_candidate)
        samples.append(Sample(image_path=image_path, gt_path=gt_candidate))

    if not samples:
        if len(image_paths) == len(gt_mat_paths) and len(image_paths) > 0:
            image_sorted = sorted(
                image_paths,
                key=lambda path: (_numeric_key(path) or (10**9,), _normalized_stem(path)),
            )
            gt_sorted = sorted(
                gt_mat_paths,
                key=lambda path: (_numeric_key(path) or (10**9,), _normalized_stem(path)),
            )
            print(
                "Warning: no direct filename matches; using deterministic order-based pairing."
            )
            return [Sample(image_path=img, gt_path=gt) for img, gt in zip(image_sorted, gt_sorted)]

        image_preview = [path.name for path in image_paths[:5]]
        gt_preview = [path.name for path in gt_mat_paths[:5]]
        raise RuntimeError(
            f"No (image, annotation) pairs found in {image_dir}. "
            f"images_found={len(image_paths)}, mats_found={len(gt_mat_paths)}, "
            f"image_preview={image_preview}, gt_preview={gt_preview}"
        )
    if unmatched:
        print(
            f"Warning: skipped {len(unmatched)} images with no matching .mat files in {gt_dir}."
        )
    return samples


def extract_points_from_mat(mat_obj: Any) -> np.ndarray | None:
    if isinstance(mat_obj, np.ndarray):
        if mat_obj.dtype == object:
            for item in mat_obj.flat:
                points = extract_points_from_mat(item)
                if points is not None:
                    return points
            return None
        if np.issubdtype(mat_obj.dtype, np.number):
            arr = np.asarray(mat_obj, dtype=np.float32)
            if arr.ndim == 2 and arr.shape[1] == 2:
                return arr
            if arr.ndim == 3 and arr.shape[-1] == 2:
                return arr.reshape(-1, 2)
        return None

    if isinstance(mat_obj, (list, tuple)):
        for item in mat_obj:
            points = extract_points_from_mat(item)
            if points is not None:
                return points
    return None


def load_head_points(gt_path: Path) -> np.ndarray:
    mat_data = loadmat(str(gt_path))
    preferred_keys = ["image_info", "annPoints", "points", "point"]
    for key in preferred_keys:
        if key in mat_data:
            points = extract_points_from_mat(mat_data[key])
            if points is not None:
                return points.astype(np.float32)

    for value in mat_data.values():
        points = extract_points_from_mat(value)
        if points is not None:
            return points.astype(np.float32)

    raise ValueError(f"Could not parse points from {gt_path}")


def compute_adaptive_sigmas(
    points: np.ndarray,
    beta: float = 0.3,
    k_neighbors: int = 3,
    sparse_fallback_sigma: float = 15.0,
) -> np.ndarray:
    n_points = len(points)
    if n_points == 0:
        return np.empty((0,), dtype=np.float32)
    if n_points == 1:
        return np.array([sparse_fallback_sigma], dtype=np.float32)

    k_query = min(k_neighbors + 1, n_points)
    tree = KDTree(points, leafsize=1024)
    distances, _ = tree.query(points, k=k_query)
    if distances.ndim == 1:
        distances = distances[:, None]
    nn_distances = distances[:, 1:]
    sigma = beta * np.mean(nn_distances, axis=1)
    sigma = np.clip(sigma, 1.0, 30.0)
    return sigma.astype(np.float32)


def add_gaussian(density: np.ndarray, x: float, y: float, sigma: float) -> None:
    h, w = density.shape
    sigma = float(max(0.5, sigma))
    radius = int(3.0 * sigma)
    x_int = int(round(x))
    y_int = int(round(y))

    x0 = max(0, x_int - radius)
    y0 = max(0, y_int - radius)
    x1 = min(w, x_int + radius + 1)
    y1 = min(h, y_int + radius + 1)
    if x0 >= x1 or y0 >= y1:
        return

    ys = np.arange(y0, y1, dtype=np.float32) - y
    xs = np.arange(x0, x1, dtype=np.float32) - x
    yy, xx = np.meshgrid(ys, xs, indexing="ij")
    kernel = np.exp(-0.5 * (xx * xx + yy * yy) / (sigma * sigma))
    kernel_sum = float(kernel.sum())
    if kernel_sum > 0:
        kernel = kernel / kernel_sum
    density[y0:y1, x0:x1] += kernel.astype(np.float32)


def generate_density_map(
    image_h: int,
    image_w: int,
    points: np.ndarray,
    part: str,
    fixed_sigma: float,
    beta: float,
    k_neighbors: int,
) -> np.ndarray:
    density = np.zeros((image_h, image_w), dtype=np.float32)
    if len(points) == 0:
        return density

    clipped_points = points.copy()
    clipped_points[:, 0] = np.clip(clipped_points[:, 0], 0, image_w - 1)
    clipped_points[:, 1] = np.clip(clipped_points[:, 1], 0, image_h - 1)

    part = part.upper()
    if part == "B":
        sigmas = np.full((len(clipped_points),), fixed_sigma, dtype=np.float32)
    else:
        sigmas = compute_adaptive_sigmas(
            clipped_points, beta=beta, k_neighbors=k_neighbors, sparse_fallback_sigma=fixed_sigma
        )

    for idx, (x, y) in enumerate(clipped_points):
        add_gaussian(density, x=float(x), y=float(y), sigma=float(sigmas[idx]))
    return density


def downsample_density_map(density: np.ndarray, downsample: int) -> np.ndarray:
    if downsample <= 1:
        return density.astype(np.float32)

    h, w = density.shape
    h_out = max(1, h // downsample)
    w_out = max(1, w // downsample)
    resized = cv2.resize(density, (w_out, h_out), interpolation=cv2.INTER_CUBIC)
    scale = float(h * w) / float(h_out * w_out)
    return (resized * scale).astype(np.float32)


class ShanghaiTechDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        samples: Sequence[Sample],
        part: str,
        split: str,
        downsample: int = 8,
        fixed_sigma: float = 15.0,
        beta: float = 0.3,
        k_neighbors: int = 3,
        random_hflip: bool = True,
    ) -> None:
        self.samples = list(samples)
        self.part = part.upper()
        self.split = split.lower()
        self.is_train = self.split == "train"
        self.downsample = downsample
        self.fixed_sigma = fixed_sigma
        self.beta = beta
        self.k_neighbors = k_neighbors
        self.random_hflip = random_hflip
        self.points_cache: list[np.ndarray] = [load_head_points(sample.gt_path) for sample in self.samples]

    def __len__(self) -> int:
        return len(self.samples)

    def _sample_patch(self, width: int, height: int) -> tuple[int, int, int, int]:
        if not self.is_train:
            return 0, 0, width, height

        patch_w = max(1, width // 2)
        patch_h = max(1, height // 2)
        max_x = max(0, width - patch_w)
        max_y = max(0, height - patch_h)

        fixed_quarters = [
            (0, 0),
            (max_x, 0),
            (0, max_y),
            (max_x, max_y),
        ]
        pick = random.randint(0, 8)
        if pick < 4:
            x0, y0 = fixed_quarters[pick]
        else:
            x0 = random.randint(0, max_x) if max_x > 0 else 0
            y0 = random.randint(0, max_y) if max_y > 0 else 0
        return x0, y0, patch_w, patch_h

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[index]
        points = self.points_cache[index].copy()

        image_bgr = cv2.imread(str(sample.image_path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            raise RuntimeError(f"Failed to read image: {sample.image_path}")
        image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        x0, y0, crop_w, crop_h = self._sample_patch(width=w, height=h)
        x1, y1 = x0 + crop_w, y0 + crop_h
        image = image[y0:y1, x0:x1]

        if len(points) > 0:
            inside = (
                (points[:, 0] >= x0)
                & (points[:, 0] < x1)
                & (points[:, 1] >= y0)
                & (points[:, 1] < y1)
            )
            points = points[inside]
            if len(points) > 0:
                points[:, 0] -= x0
                points[:, 1] -= y0

        if self.is_train and self.random_hflip and random.random() < 0.5:
            image = np.ascontiguousarray(np.fliplr(image))
            if len(points) > 0:
                points[:, 0] = (image.shape[1] - 1) - points[:, 0]

        image_h, image_w = image.shape[:2]
        density = generate_density_map(
            image_h=image_h,
            image_w=image_w,
            points=points,
            part=self.part,
            fixed_sigma=self.fixed_sigma,
            beta=self.beta,
            k_neighbors=self.k_neighbors,
        )
        density = downsample_density_map(density, downsample=self.downsample)

        image = image.astype(np.float32) / 255.0
        image = (image - IMAGENET_MEAN) / IMAGENET_STD
        image = np.transpose(image, (2, 0, 1))

        image_tensor = torch.from_numpy(image).float()
        density_tensor = torch.from_numpy(density).unsqueeze(0).float()
        return image_tensor, density_tensor


def make_frontend() -> nn.Sequential:
    cfg: list[int | str] = [64, 64, "M", 128, 128, "M", 256, 256, 256, "M", 512, 512, 512]
    layers: list[nn.Module] = []
    in_channels = 3
    for item in cfg:
        if item == "M":
            layers.append(nn.MaxPool2d(kernel_size=2, stride=2))
            continue
        out_channels = int(item)
        layers.append(nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1))
        layers.append(nn.ReLU(inplace=True))
        in_channels = out_channels
    return nn.Sequential(*layers)


def make_backend(dilations: Sequence[int]) -> nn.Sequential:
    out_channels = [512, 512, 512, 256, 128, 64]
    layers: list[nn.Module] = []
    in_channels = 512
    for out_ch, dilation in zip(out_channels, dilations, strict=True):
        layers.append(
            nn.Conv2d(
                in_channels,
                out_ch,
                kernel_size=3,
                padding=int(dilation),
                dilation=int(dilation),
            )
        )
        layers.append(nn.ReLU(inplace=True))
        in_channels = out_ch
    return nn.Sequential(*layers)


class CSRNet(nn.Module):
    def __init__(self, variant: str = "B", pretrained_frontend: bool = True) -> None:
        super().__init__()
        variant = variant.upper()
        if variant not in BACKEND_DILATIONS:
            raise ValueError(f"Unsupported CSRNet variant: {variant}")

        self.variant = variant
        self.frontend = make_frontend()
        self.backend = make_backend(BACKEND_DILATIONS[variant])
        self.output_layer = nn.Conv2d(64, 1, kernel_size=1)
        self._initialize_weights()
        if pretrained_frontend:
            self._load_vgg_frontend_weights()

    def _initialize_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Conv2d):
                nn.init.normal_(module.weight, std=0.01)
                if module.bias is not None:
                    nn.init.constant_(module.bias, 0)

    def _load_vgg_frontend_weights(self) -> None:
        try:
            vgg16 = models.vgg16(weights=models.VGG16_Weights.IMAGENET1K_V1)
        except Exception as exc:
            print(f"Warning: could not load pretrained VGG-16 weights ({exc}). Training from scratch.")
            return

        src_convs = [layer for layer in vgg16.features if isinstance(layer, nn.Conv2d)]
        dst_convs = [layer for layer in self.frontend if isinstance(layer, nn.Conv2d)]
        for src, dst in zip(src_convs, dst_convs, strict=False):
            if src.weight.shape == dst.weight.shape:
                dst.weight.data.copy_(src.weight.data)
            if src.bias is not None and dst.bias is not None and src.bias.shape == dst.bias.shape:
                dst.bias.data.copy_(src.bias.data)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.frontend(x)
        x = self.backend(x)
        x = self.output_layer(x)
        return x


def run_train_epoch(
    model: nn.Module,
    loader: DataLoader[tuple[torch.Tensor, torch.Tensor]],
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0
    total_items = 0

    progress = tqdm(loader, desc="train", leave=False)
    for images, targets in progress:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)

        predictions = model(images)
        if predictions.shape != targets.shape:
            raise RuntimeError(
                f"Prediction/target mismatch: pred={tuple(predictions.shape)} target={tuple(targets.shape)}"
            )

        loss = 0.5 * torch.mean((predictions - targets) ** 2)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

        batch_size = images.size(0)
        total_loss += loss.item() * batch_size
        total_items += batch_size
        progress.set_postfix(loss=f"{loss.item():.4f}")

    return total_loss / max(total_items, 1)


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader[tuple[torch.Tensor, torch.Tensor]],
    device: torch.device,
) -> tuple[float, float, float]:
    model.eval()
    total_loss = 0.0
    total_mae = 0.0
    total_mse = 0.0
    total_items = 0

    progress = tqdm(loader, desc="val", leave=False)
    for images, targets in progress:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)

        predictions = model(images)
        if predictions.shape != targets.shape:
            raise RuntimeError(
                f"Prediction/target mismatch: pred={tuple(predictions.shape)} target={tuple(targets.shape)}"
            )

        loss = 0.5 * torch.mean((predictions - targets) ** 2)
        pred_counts = predictions.flatten(start_dim=1).sum(dim=1)
        gt_counts = targets.flatten(start_dim=1).sum(dim=1)
        diff = pred_counts - gt_counts

        batch_size = images.size(0)
        total_loss += loss.item() * batch_size
        total_mae += torch.sum(torch.abs(diff)).item()
        total_mse += torch.sum(diff * diff).item()
        total_items += batch_size

    mean_loss = total_loss / max(total_items, 1)
    mae = total_mae / max(total_items, 1)
    rmse = math.sqrt(total_mse / max(total_items, 1))
    return mean_loss, mae, rmse


def export_onnx(
    model: nn.Module,
    output_path: Path,
    input_h: int,
    input_w: int,
    dynamic_axes: bool,
    opset: int,
) -> None:
    model.eval()
    dummy = torch.randn(1, 3, input_h, input_w)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    dyn_axes: dict[str, dict[int, str]] | None = None
    if dynamic_axes:
        dyn_axes = {
            "input": {0: "batch", 2: "height", 3: "width"},
            "density": {0: "batch", 2: "height_out", 3: "width_out"},
        }

    torch.onnx.export(
        model,
        dummy,
        str(output_path),
        input_names=["input"],
        output_names=["density"],
        dynamic_axes=dyn_axes,
        opset_version=opset,
    )


def build_arg_parser(
    default_output_dir: Path,
    default_onnx_path: Path,
    default_react_native_onnx_path: Path,
) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train CSRNet (arXiv:1802.10062) on ShanghaiTech using the best architecture (Model B)."
    )
    parser.add_argument("--dataset-root", type=Path, default=None, help="Path to ShanghaiTech dataset root.")
    parser.add_argument("--dataset-slug", type=str, default=DATASET_SLUG, help="KaggleHub dataset slug.")
    parser.add_argument("--part", type=str, default="A", choices=["A", "B"], help="ShanghaiTech dataset part.")

    parser.add_argument(
        "--variant",
        type=str,
        default="B",
        choices=["A", "B", "C", "D"],
        help="CSRNet architecture variant from the paper. B is the best-performing option.",
    )
    parser.add_argument("--epochs", type=int, default=300)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--optimizer", type=str, default="adam", choices=["adam", "sgd"])
    parser.add_argument("--sgd-momentum", type=float, default=0.95)
    parser.add_argument("--downsample", type=int, default=8, help="Output stride of density map.")
    parser.add_argument("--fixed-sigma", type=float, default=15.0)
    parser.add_argument("--adaptive-beta", type=float, default=0.3)
    parser.add_argument("--adaptive-k", type=int, default=3)
    parser.add_argument("--no-pretrained-frontend", action="store_true")
    parser.add_argument("--no-hflip", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", type=str, default="auto", help="auto, cpu, cuda, or mps.")

    parser.add_argument("--output-dir", type=Path, default=default_output_dir)
    parser.add_argument("--checkpoint-name", type=str, default="csrnet_best.pt")
    parser.add_argument(
        "--save-epoch-checkpoints",
        dest="save_epoch_checkpoints",
        action="store_true",
        help="Save a checkpoint for every epoch using --epoch-checkpoint-prefix.",
    )
    parser.add_argument(
        "--no-save-epoch-checkpoints",
        dest="save_epoch_checkpoints",
        action="store_false",
        help="Disable saving per-epoch checkpoints.",
    )
    parser.set_defaults(save_epoch_checkpoints=True)
    parser.add_argument("--epoch-checkpoint-prefix", type=str, default="csrnet_epoch")
    parser.add_argument(
        "--export-onnx",
        dest="export_onnx",
        action="store_true",
        help="Export ONNX from the best checkpoint when training completes.",
    )
    parser.add_argument(
        "--no-export-onnx",
        dest="export_onnx",
        action="store_false",
        help="Disable ONNX export.",
    )
    parser.set_defaults(export_onnx=True)
    parser.add_argument("--onnx-path", type=Path, default=default_onnx_path)
    parser.add_argument("--onnx-input-h", type=int, default=512)
    parser.add_argument("--onnx-input-w", type=int, default=512)
    parser.add_argument("--onnx-opset", type=int, default=17)
    parser.add_argument("--onnx-dynamic-axes", action="store_true")
    parser.add_argument(
        "--copy-onnx-to-react-native",
        dest="copy_onnx_to_react_native",
        action="store_true",
        help="Copy exported ONNX model into React Native app assets.",
    )
    parser.add_argument(
        "--no-copy-onnx-to-react-native",
        dest="copy_onnx_to_react_native",
        action="store_false",
        help="Do not copy the exported ONNX model to React Native assets.",
    )
    parser.set_defaults(copy_onnx_to_react_native=True)
    parser.add_argument(
        "--react-native-model-path",
        type=Path,
        default=default_react_native_onnx_path,
        help="Destination ONNX model path inside the React Native project.",
    )
    return parser


def main() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    default_output_dir = backend_root / "models" / "checkpoints"
    default_onnx_path = backend_root / "models" / "crowd_model_stride8.onnx"
    default_react_native_onnx_path = (
        backend_root.parent / "mobile" / "assets" / "models" / "crowd_model_stride8.onnx"
    )
    args = build_arg_parser(
        default_output_dir=default_output_dir,
        default_onnx_path=default_onnx_path,
        default_react_native_onnx_path=default_react_native_onnx_path,
    ).parse_args()

    if args.batch_size != 1:
        raise ValueError(
            "This trainer currently supports --batch-size 1 because ShanghaiTech images "
            "and paper-style patches have variable resolutions."
        )

    set_seed(args.seed)
    device = resolve_device(args.device)

    dataset_root = args.dataset_root
    if dataset_root is None:
        dataset_root = download_dataset_kagglehub(args.dataset_slug)
    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset root does not exist: {dataset_root}")

    part_root = find_part_root(dataset_root, args.part)
    train_samples = collect_samples(part_root, split="train")
    val_samples = collect_samples(part_root, split="test")

    print(f"Dataset root: {dataset_root}")
    print(f"Part root: {part_root}")
    print(f"Train images: {len(train_samples)}")
    print(f"Val images: {len(val_samples)}")
    print(f"Device: {device}")

    train_dataset = ShanghaiTechDataset(
        train_samples,
        part=args.part,
        split="train",
        downsample=args.downsample,
        fixed_sigma=args.fixed_sigma,
        beta=args.adaptive_beta,
        k_neighbors=args.adaptive_k,
        random_hflip=not args.no_hflip,
    )
    val_dataset = ShanghaiTechDataset(
        val_samples,
        part=args.part,
        split="test",
        downsample=args.downsample,
        fixed_sigma=args.fixed_sigma,
        beta=args.adaptive_beta,
        k_neighbors=args.adaptive_k,
        random_hflip=False,
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=args.workers > 0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=1,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=args.workers > 0,
    )

    model = CSRNet(variant=args.variant, pretrained_frontend=not args.no_pretrained_frontend)
    model = model.to(device)

    if args.optimizer == "sgd":
        optimizer: torch.optim.Optimizer = torch.optim.SGD(
            model.parameters(),
            lr=args.lr,
            momentum=args.sgd_momentum,
            weight_decay=args.weight_decay,
        )
    else:
        optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    milestones = sorted({max(1, args.epochs // 2), max(1, int(args.epochs * 0.8))})
    scheduler = torch.optim.lr_scheduler.MultiStepLR(optimizer, milestones=milestones, gamma=0.1)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    best_ckpt_path = args.output_dir / args.checkpoint_name
    latest_ckpt_path = args.output_dir / "csrnet_last.pt"
    metrics_path = args.output_dir / "metrics.json"

    best_mae = float("inf")
    history: list[dict[str, float | int]] = []
    for epoch in range(1, args.epochs + 1):
        print(f"\nEpoch {epoch}/{args.epochs} (lr={optimizer.param_groups[0]['lr']:.2e})")
        train_loss = run_train_epoch(model, train_loader, optimizer, device)
        val_loss, val_mae, val_rmse = evaluate(model, val_loader, device)
        scheduler.step()

        epoch_metrics = {
            "epoch": epoch,
            "train_loss": float(train_loss),
            "val_loss": float(val_loss),
            "val_mae": float(val_mae),
            "val_rmse": float(val_rmse),
            "lr": float(optimizer.param_groups[0]["lr"]),
        }
        history.append(epoch_metrics)
        print(
            "train_loss={train_loss:.6f} val_loss={val_loss:.6f} "
            "val_mae={val_mae:.4f} val_rmse={val_rmse:.4f}".format(
                train_loss=train_loss,
                val_loss=val_loss,
                val_mae=val_mae,
                val_rmse=val_rmse,
            )
        )

        is_best = val_mae < best_mae
        if is_best:
            best_mae = val_mae

        checkpoint = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "metrics": epoch_metrics,
            "is_best": is_best,
            "best_mae_so_far": float(best_mae),
            "args": vars(args),
        }
        if args.save_epoch_checkpoints:
            epoch_ckpt_path = args.output_dir / f"{args.epoch_checkpoint_prefix}_{epoch:04d}.pt"
            torch.save(checkpoint, epoch_ckpt_path)

        torch.save(checkpoint, latest_ckpt_path)

        if is_best:
            torch.save(checkpoint, best_ckpt_path)
            print(f"Saved new best checkpoint: {best_ckpt_path} (MAE={best_mae:.4f})")

        with metrics_path.open("w", encoding="utf-8") as f:
            json.dump({"best_mae": best_mae, "history": history}, f, indent=2)

    print(f"\nBest validation MAE: {best_mae:.4f}")
    print(f"Best checkpoint: {best_ckpt_path}")
    print(f"Last checkpoint: {latest_ckpt_path}")

    if args.export_onnx:
        if not best_ckpt_path.exists():
            raise FileNotFoundError(f"Best checkpoint not found: {best_ckpt_path}")
        best_checkpoint = torch.load(best_ckpt_path, map_location="cpu")
        model.load_state_dict(best_checkpoint["model_state_dict"])
        model.cpu()
        export_onnx(
            model=model,
            output_path=args.onnx_path,
            input_h=args.onnx_input_h,
            input_w=args.onnx_input_w,
            dynamic_axes=args.onnx_dynamic_axes,
            opset=args.onnx_opset,
        )
        print(f"Exported ONNX model to: {args.onnx_path}")
        if args.copy_onnx_to_react_native:
            args.react_native_model_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(args.onnx_path, args.react_native_model_path)
            print(f"Copied ONNX model to React Native path: {args.react_native_model_path}")


if __name__ == "__main__":
    main()
