Drop your ONNX model here:

- `backend/models/crowd_model_stride8.onnx`

Training helper outputs:

- Best checkpoint: `backend/models/checkpoints/csrnet_best.pt`
- Last checkpoint: `backend/models/checkpoints/csrnet_last.pt`
- Per-epoch checkpoints: `backend/models/checkpoints/csrnet_epoch_XXXX.pt`
- React Native copy target: `mobile/assets/models/crowd_model_stride8.onnx`

If this file is missing or cannot be loaded, the backend automatically falls back to the DummyEngine.
