import { AnalyticsEvent, Camera, CameraCreatePayload, CameraUpdatePayload } from '../types';
import { makeUuid } from '../lib/id';

const nowIso = (): string => new Date().toISOString();

let mockCameras: Camera[] = [
  {
    id: 'mock-cam-1',
    name: 'Old Town Entry',
    stream_url: 'sim://sample',
    enabled: true,
    target_fps: 2,
    alert_threshold: 95,
    status: 'online',
    last_latency_ms: 0,
    last_processed_fps: 2,
    last_crowd_count: 0,
    last_update_ts: nowIso(),
    preview_url: '',
  },
  {
    id: 'mock-cam-2',
    name: 'Civic Center Plaza',
    stream_url: 'sim://sample',
    enabled: true,
    target_fps: 3,
    alert_threshold: 140,
    status: 'online',
    last_latency_ms: 0,
    last_processed_fps: 3,
    last_crowd_count: 0,
    last_update_ts: nowIso(),
    preview_url: '',
  },
  {
    id: 'mock-cam-3',
    name: 'Waterfront South',
    stream_url: 'sim://sample',
    enabled: false,
    target_fps: 1,
    alert_threshold: 70,
    status: 'offline',
    last_latency_ms: 0,
    last_processed_fps: 0,
    last_crowd_count: 0,
    last_update_ts: nowIso(),
    preview_url: '',
  },
];

const walkByCamera = new Map<string, number>();

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function makeOverlayBase64(width: number, height: number, intensity: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }

  ctx.clearRect(0, 0, width, height);

  const blobs = Math.max(2, Math.round(intensity / 45));
  for (let i = 0; i < blobs; i += 1) {
    const x = randomBetween(0.15, 0.85) * width;
    const y = randomBetween(0.2, 0.85) * height;
    const radius = randomBetween(70, 160);

    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(255, 68, 0, 0.42)');
    g.addColorStop(0.45, 'rgba(255, 182, 0, 0.28)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.replace('data:image/png;base64,', '');
}

export function listMockCameras(): Camera[] {
  return [...mockCameras];
}

export function addMockCamera(payload: CameraCreatePayload): Camera {
  const camera: Camera = {
    id: `mock-cam-${makeUuid().slice(0, 8)}`,
    ...payload,
    status: payload.enabled ? 'online' : 'offline',
    last_latency_ms: 0,
    last_processed_fps: payload.target_fps,
    last_crowd_count: 0,
    last_update_ts: nowIso(),
    preview_url: '',
  };
  mockCameras = [...mockCameras, camera];
  return camera;
}

export function patchMockCamera(cameraId: string, payload: CameraUpdatePayload): Camera {
  const idx = mockCameras.findIndex((c) => c.id === cameraId);
  if (idx < 0) {
    throw new Error('Camera not found');
  }
  const updated = {
    ...mockCameras[idx],
    ...payload,
  };
  if (payload.enabled === false) {
    updated.status = 'offline';
  }
  mockCameras = mockCameras.map((c) => (c.id === cameraId ? updated : c));
  return updated;
}

export function removeMockCamera(cameraId: string): void {
  mockCameras = mockCameras.filter((camera) => camera.id !== cameraId);
  walkByCamera.delete(cameraId);
}

export function generateMockEvent(camera: Camera): AnalyticsEvent {
  const baseline = walkByCamera.get(camera.id) ?? randomBetween(20, 150);
  const drift = randomBetween(-8, 10);
  const next = Math.max(0, baseline + drift);
  walkByCamera.set(camera.id, next);

  const status = camera.enabled ? 'online' : 'offline';
  const count = status === 'online' ? next : 0;
  const fps = status === 'online' ? randomBetween(Math.max(0.8, camera.target_fps - 0.5), camera.target_fps + 0.6) : 0;

  return {
    camera_id: camera.id,
    ts: nowIso(),
    status,
    processed_fps: Number(fps.toFixed(2)),
    latency_ms: status === 'online' ? Number(randomBetween(35, 180).toFixed(2)) : 0,
    crowd_count: Number(count.toFixed(2)),
    density_overlay_png_base64: status === 'online' ? makeOverlayBase64(960, 540, count) : '',
    message: status === 'offline' ? 'Camera disabled in mock mode' : null,
  };
}
