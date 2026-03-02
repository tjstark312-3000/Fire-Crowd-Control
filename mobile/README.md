# React Native ONNX Integration

This folder is the React Native handoff for realtime crowd control inference.

## Model path

Training now copies the exported ONNX file to:

- `mobile/assets/models/crowd_model_stride8.onnx`

## Install runtime

In your React Native app:

```bash
npm install onnxruntime-react-native
```

## Metro config

Ensure `.onnx` is treated as an asset (example in `mobile/metro.config.js`).

## Usage

Use `mobile/src/services/crowdOnnx.ts` to:

1. Create an ONNX session
2. Convert camera RGBA frames to normalized CHW tensor input
3. Run inference and get:
   - `crowdCount`
   - `densityMap`
   - output map height and width

## Kaggle GPU training command

Run in Kaggle GPU runtime (from repo root in `/kaggle/working/...`):

```bash
python backend/scripts/train_csrnet.py \
  --device cuda \
  --epochs 300 \
  --part A \
  --dataset-slug hosammhmdali/shanghai-tech-dataset-part-a-and-part-b \
  --output-dir backend/models/checkpoints \
  --onnx-path backend/models/crowd_model_stride8.onnx \
  --react-native-model-path mobile/assets/models/crowd_model_stride8.onnx
```

This writes:

- epoch checkpoints: `backend/models/checkpoints/csrnet_epoch_XXXX.pt`
- last checkpoint: `backend/models/checkpoints/csrnet_last.pt`
- best checkpoint: `backend/models/checkpoints/csrnet_best.pt`
- ONNX: `backend/models/crowd_model_stride8.onnx`
- copied mobile ONNX: `mobile/assets/models/crowd_model_stride8.onnx`
