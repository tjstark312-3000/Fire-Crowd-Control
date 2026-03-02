from __future__ import annotations

import argparse
import base64
import csv
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(
        description="Download a Kaggle dataset and export ONNX crowd-density heatmaps for sample images.",
    )
    parser.add_argument(
        "--dataset-slug",
        default="trainingdatapro/crowd-counting-dataset",
        help="Kaggle dataset slug.",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=repo_root / "backend" / "models" / "crowd_model_stride8.onnx",
        help="Path to ONNX model.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "kaggle_outputs" / "onnx_heatmaps",
        help="Directory where overlays/blends and manifest are written.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=30,
        help="Max number of images to process.",
    )
    parser.add_argument(
        "--max-side",
        type=int,
        default=1280,
        help="Resize each image so the larger side is at most this many pixels before inference.",
    )
    parser.add_argument(
        "--dataset-file",
        action="append",
        default=[],
        help=(
            "Optional relative file path inside dataset. "
            "Repeat to download only specific files instead of full dataset archive."
        ),
    )
    return parser.parse_args()


def find_images(dataset_root: Path) -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    images: list[Path] = []
    for path in dataset_root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in exts:
            continue
        p = str(path).lower()
        if "ground-truth" in p or "ground_truth" in p or "density" in p:
            # Avoid GT density map artifacts from some crowd datasets.
            continue
        images.append(path)
    return sorted(images)


def decode_overlay_png(overlay_png_base64: str) -> np.ndarray | None:
    if not overlay_png_base64:
        return None
    try:
        raw = base64.b64decode(overlay_png_base64)
    except Exception:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    if arr.size == 0:
        return None
    return cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)


def blend_overlay(frame_bgr: np.ndarray, overlay: np.ndarray | None) -> np.ndarray:
    if overlay is None:
        return frame_bgr

    out = frame_bgr.copy()
    resized = cv2.resize(overlay, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_LINEAR)
    if resized.ndim == 2:
        resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)

    if resized.shape[2] == 4:
        alpha = resized[:, :, 3:4].astype(np.float32) / 255.0
        color = resized[:, :, :3].astype(np.float32)
        base = out.astype(np.float32)
        blended = color * alpha + base * (1.0 - alpha)
        return np.clip(blended, 0, 255).astype(np.uint8)

    return cv2.addWeighted(out, 0.5, resized[:, :, :3], 0.5, 0.0)


def resize_for_inference(frame_bgr: np.ndarray, max_side: int) -> np.ndarray:
    if max_side <= 0:
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    largest = max(h, w)
    if largest <= max_side:
        return frame_bgr

    scale = float(max_side) / float(largest)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2.resize(frame_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)


def main() -> int:
    args = parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"
    sys.path.insert(0, str(backend_root))

    try:
        import kagglehub  # type: ignore
    except Exception as exc:
        print(f"Failed to import kagglehub: {exc}")
        print("Install with: python3 -m pip install kagglehub")
        return 1

    from app.services.analytics.onnx_engine import ONNXEngine

    if not args.model_path.exists():
        print(f"Model not found: {args.model_path}")
        return 1

    source_root: Path | None = None
    if args.dataset_file:
        print(
            f"Downloading {len(args.dataset_file)} specific files from dataset: {args.dataset_slug}",
            flush=True,
        )
        downloaded_files: list[Path] = []
        for rel_path in args.dataset_file:
            local_file = Path(kagglehub.dataset_download(args.dataset_slug, path=rel_path))
            downloaded_files.append(local_file)
        to_process = downloaded_files[: max(1, args.limit)]
    else:
        print(f"Downloading dataset: {args.dataset_slug}", flush=True)
        dataset_path = Path(kagglehub.dataset_download(args.dataset_slug))
        source_root = dataset_path
        print(f"Dataset path: {dataset_path}", flush=True)

        images = find_images(dataset_path)
        if not images:
            print("No input images found in downloaded dataset.")
            return 1
        to_process = images[: max(1, args.limit)]

    args.output_dir.mkdir(parents=True, exist_ok=True)

    engine = ONNXEngine(model_path=args.model_path)
    print(
        f"ONNX layout={engine.layout} input_shape={engine.input_shape} output_shape={engine.output_shape}",
        flush=True,
    )
    print(
        f"Processing {len(to_process)} images with max-side={args.max_side}...",
        flush=True,
    )

    rows: list[dict[str, object]] = []
    for idx, image_path in enumerate(to_process, start=1):
        frame = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if frame is None:
            continue
        infer_frame = resize_for_inference(frame, args.max_side)

        result = engine.infer(infer_frame)
        crowd_count = float(result["crowd_count"])
        density_map = np.asarray(result["density_map"], dtype=np.float32)
        overlay_b64 = str(result["overlay_png_base64"])

        if source_root is not None:
            rel_stem = image_path.relative_to(source_root).with_suffix("")
            safe_stem = str(rel_stem).replace("/", "__")
        else:
            safe_stem = image_path.stem.replace("/", "__").replace(" ", "_")
        overlay_path = args.output_dir / f"{safe_stem}.overlay.png"
        blend_path = args.output_dir / f"{safe_stem}.blend.jpg"

        overlay_img = decode_overlay_png(overlay_b64)
        if overlay_img is not None:
            cv2.imwrite(str(overlay_path), overlay_img)
        else:
            overlay_path = Path("")

        blended = blend_overlay(infer_frame, overlay_img)
        cv2.imwrite(str(blend_path), blended)

        row = {
            "index": idx,
            "image": str(image_path),
            "crowd_count": round(crowd_count, 4),
            "orig_h": int(frame.shape[0]),
            "orig_w": int(frame.shape[1]),
            "infer_h": int(infer_frame.shape[0]),
            "infer_w": int(infer_frame.shape[1]),
            "density_h": int(density_map.shape[0]),
            "density_w": int(density_map.shape[1]),
            "blend_path": str(blend_path),
            "overlay_path": str(overlay_path) if overlay_path else "",
        }
        rows.append(row)
        print(
            f"[{idx:03d}/{len(to_process):03d}] crowd={crowd_count:.2f} image={image_path.name} "
            f"orig={frame.shape[1]}x{frame.shape[0]} infer={infer_frame.shape[1]}x{infer_frame.shape[0]}",
            flush=True,
        )

    manifest_json = args.output_dir / "heatmap_manifest.json"
    manifest_csv = args.output_dir / "heatmap_manifest.csv"

    with manifest_json.open("w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2)

    with manifest_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "index",
                "image",
                "crowd_count",
                "orig_h",
                "orig_w",
                "infer_h",
                "infer_w",
                "density_h",
                "density_w",
                "blend_path",
                "overlay_path",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print("\nDone.")
    print(f"Manifest JSON: {manifest_json}")
    print(f"Manifest CSV: {manifest_csv}")
    print(f"Output directory: {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
