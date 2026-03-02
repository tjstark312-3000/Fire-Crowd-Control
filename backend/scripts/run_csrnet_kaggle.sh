#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DATASET_ARG=()
if [[ -n "${DATASET_ROOT:-}" ]]; then
  DATASET_ARG=(--dataset-root "$DATASET_ROOT")
fi

python backend/scripts/train_csrnet.py \
  --device cuda \
  --epochs "${EPOCHS:-300}" \
  --part "${PART:-A}" \
  --output-dir backend/models/checkpoints \
  --onnx-path backend/models/crowd_model_stride8.onnx \
  --react-native-model-path mobile/assets/models/crowd_model_stride8.onnx \
  "${DATASET_ARG[@]}" \
  "$@"
