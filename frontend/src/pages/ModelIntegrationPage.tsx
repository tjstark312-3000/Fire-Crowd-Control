export function ModelIntegrationPage(): JSX.Element {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5">
      <h2 className="mb-2 text-lg font-semibold">Model Integration (ONNX Runtime)</h2>
      <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
        The backend uses ONNX Runtime for `crowd_model_stride8.onnx` inference and falls back to `DummyEngine` only when ONNX loading fails.
      </p>

      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Install backend dependencies (`pip install -r requirements.txt`) so ONNX Runtime is available.</li>
        <li>Export your PyTorch crowd density model to ONNX with output shape `[1,1,H,W]` (or `[1,H,W]`).</li>
        <li>
          Copy model to:
          <code className="ml-1 rounded bg-[hsl(var(--panel-2))] px-1.5 py-0.5">backend/models/crowd_model_stride8.onnx</code>
        </li>
        <li>Restart backend service. It auto-detects ONNX and switches inference engines.</li>
        <li>
          Add a local camera with
          <code className="ml-1 rounded bg-[hsl(var(--panel-2))] px-1.5 py-0.5">device://0</code>
          in Settings to test live detection from your Mac webcam.
        </li>
        <li>Verify in camera detail view: crowd count and density overlay should update in real-time.</li>
      </ol>

      <div className="mt-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
        If ONNX loading fails, backend logs the fallback and keeps processing with DummyEngine to preserve uptime.
      </div>
    </div>
  );
}
