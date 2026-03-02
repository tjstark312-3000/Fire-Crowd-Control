import { FormEvent, useEffect, useState } from 'react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useAppContext } from '../context/AppContext';
import { Camera } from '../types';

const INITIAL_FORM = {
  name: '',
  stream_url: 'sim://sample',
  enabled: true,
  target_fps: 2,
  alert_threshold: 120,
};

export function SettingsPage(): JSX.Element {
  const {
    cameras,
    refreshCameras,
    addCamera,
    patchCamera,
    removeCamera,
    simulatedMode,
    setSimulatedMode,
  } = useAppContext();

  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void refreshCameras();
  }, [refreshCameras]);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await addCamera({
        name: form.name.trim(),
        stream_url: form.stream_url.trim(),
        enabled: form.enabled,
        target_fps: Number(form.target_fps),
        alert_threshold: Number(form.alert_threshold),
      });
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add camera');
    } finally {
      setPending(false);
    }
  };

  const updateField = async (camera: Camera, patch: Partial<Camera>) => {
    setPending(true);
    setError(null);
    try {
      await patchCamera(camera.id, {
        name: patch.name,
        stream_url: patch.stream_url,
        enabled: patch.enabled,
        target_fps: patch.target_fps,
        alert_threshold: patch.alert_threshold,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update camera');
    } finally {
      setPending(false);
    }
  };

  const onDelete = async (cameraId: string) => {
    setPending(true);
    setError(null);
    try {
      await removeCamera(cameraId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete camera');
    } finally {
      setPending(false);
    }
  };

  const useMacCameraPreset = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name.trim() ? prev.name : 'MacBook Camera',
      stream_url: 'device://0',
      enabled: true,
    }));
  };

  const useSimPreset = () => {
    setForm((prev) => ({
      ...prev,
      stream_url: 'sim://sample',
    }));
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="col-span-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">System Settings</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Toggle simulated mode and manage camera configurations.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            Simulated Mode
            <Switch checked={simulatedMode} onCheckedChange={setSimulatedMode} />
          </label>
        </div>
      </section>

      <section className="col-span-12 lg:col-span-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Add Camera</h3>
        <p className="mb-3 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Use `device://0` for your Mac webcam, or `sim://sample` for demo mode with `backend/data/sample.mp4`.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={useMacCameraPreset}>
            Use Mac Camera
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={useSimPreset}>
            Use Sample Feed
          </Button>
        </div>

        <form onSubmit={onCreate} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">Name</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Canal Walk North"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">Stream URL</span>
            <Input
              value={form.stream_url}
              onChange={(e) => setForm((prev) => ({ ...prev, stream_url: e.target.value }))}
              placeholder="device://0 or rtsp://... or https://... or sim://sample"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">Target FPS (1-5)</span>
              <Input
                type="number"
                min={1}
                max={5}
                step={1}
                value={form.target_fps}
                onChange={(e) => setForm((prev) => ({ ...prev, target_fps: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">Alert Threshold</span>
              <Input
                type="number"
                min={1}
                max={10000}
                value={form.alert_threshold}
                onChange={(e) => setForm((prev) => ({ ...prev, alert_threshold: Number(e.target.value) }))}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))} />
            Enable analytics
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Add Camera'}
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </section>

      <section className="col-span-12 lg:col-span-7 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Camera Configuration</h3>
        <div className="space-y-3">
          {cameras.map((camera) => (
            <div key={camera.id} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{camera.name}</strong>
                <Button type="button" variant="danger" size="sm" onClick={() => void onDelete(camera.id)}>
                  Remove
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs text-[hsl(var(--muted-foreground))]">
                  Target FPS
                  <Input
                    key={`${camera.id}-fps-${camera.target_fps}`}
                    type="number"
                    defaultValue={camera.target_fps}
                    min={1}
                    max={5}
                    step={1}
                    className="mt-1"
                    onBlur={(e) => void updateField(camera, { target_fps: Number(e.target.value) })}
                  />
                </label>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">
                  Alert Threshold
                  <Input
                    key={`${camera.id}-threshold-${camera.alert_threshold}`}
                    type="number"
                    defaultValue={camera.alert_threshold}
                    min={1}
                    max={10000}
                    className="mt-1"
                    onBlur={(e) => void updateField(camera, { alert_threshold: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="mt-3 inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <Switch checked={camera.enabled} onCheckedChange={(checked) => void updateField(camera, { enabled: checked })} />
                Analytics enabled
              </label>
            </div>
          ))}

          {cameras.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">No cameras configured.</p>}
        </div>
      </section>
    </div>
  );
}
