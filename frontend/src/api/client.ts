import { Camera, CameraCreatePayload, CameraUpdatePayload } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function getApiBase(): string {
  return API_BASE;
}

export async function getCameras(): Promise<Camera[]> {
  return request<Camera[]>('/api/cameras');
}

export async function createCamera(payload: CameraCreatePayload): Promise<Camera> {
  return request<Camera>('/api/cameras', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

export async function updateCamera(cameraId: string, payload: CameraUpdatePayload): Promise<Camera> {
  return request<Camera>(`/api/cameras/${cameraId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
}

export async function deleteCamera(cameraId: string): Promise<void> {
  return request<void>(`/api/cameras/${cameraId}`, {
    method: 'DELETE',
  });
}

export async function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}
