export type CameraStatus = 'online' | 'offline' | 'error';

export interface Camera {
  id: string;
  name: string;
  stream_url: string;
  enabled: boolean;
  target_fps: number;
  alert_threshold: number;
  status: CameraStatus;
  last_latency_ms: number | null;
  last_processed_fps: number | null;
  last_crowd_count: number | null;
  last_update_ts: string | null;
  preview_url?: string | null;
}

export interface CameraCreatePayload {
  name: string;
  stream_url: string;
  enabled: boolean;
  target_fps: number;
  alert_threshold: number;
}

export type CameraUpdatePayload = Partial<CameraCreatePayload>;

export interface AnalyticsEvent {
  camera_id: string;
  ts: string;
  status: CameraStatus;
  processed_fps: number;
  latency_ms: number;
  crowd_count: number;
  density_overlay_png_base64: string;
  frame_jpeg_base64?: string | null;
  message?: string | null;
}

export interface AlertItem {
  id: string;
  camera_id: string;
  camera_name: string;
  ts: string;
  type: 'threshold' | 'spike' | 'offline';
  severity: 'warning' | 'critical';
  message: string;
}

export interface CountPoint {
  ts: string;
  crowd_count: number;
}

export interface AlertRuleConfig {
  threshold_enabled: boolean;
  threshold_count: number;
  spike_enabled: boolean;
  spike_factor: number;
  spike_delta: number;
  offline_enabled: boolean;
}
