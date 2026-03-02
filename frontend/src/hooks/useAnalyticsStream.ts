import { useEffect, useRef } from 'react';

import { getApiBase } from '../api/client';
import { makeUuid } from '../lib/id';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { generateMockEvent } from '../utils/mock';
import { AnalyticsEvent, Camera } from '../types';

const FORCE_MOCK = String(import.meta.env.VITE_FORCE_MOCK ?? 'false').toLowerCase() === 'true';

type ConnectionMode = 'connecting' | 'live' | 'mock';

interface UseAnalyticsStreamProps {
  cameras: Camera[];
  onEvent: (event: AnalyticsEvent) => void;
  onConnectionMode: (mode: ConnectionMode) => void;
  simulatedMode?: boolean;
}

function toWsUrl(apiBase: string): string {
  const asWs = apiBase.replace(/^http/, 'ws');
  return `${asWs}/ws/analytics`;
}

function rowToEvent(row: Record<string, unknown>): AnalyticsEvent | null {
  const cameraId = String(row.camera_id ?? '');
  if (!cameraId) {
    return null;
  }

  const rawStatus = String(row.status ?? 'offline');
  const status: AnalyticsEvent['status'] =
    rawStatus === 'online' || rawStatus === 'error' || rawStatus === 'offline' ? rawStatus : 'offline';

  return {
    camera_id: cameraId,
    ts: String(row.ts ?? new Date().toISOString()),
    status,
    processed_fps: Number(row.processed_fps ?? 0),
    latency_ms: Number(row.latency_ms ?? 0),
    crowd_count: Number(row.crowd_count ?? 0),
    density_overlay_png_base64: String(row.density_overlay_png_base64 ?? ''),
    frame_jpeg_base64: row.frame_jpeg_base64 ? String(row.frame_jpeg_base64) : null,
    message: row.message ? String(row.message) : null,
  };
}

export function useAnalyticsStream({ cameras, onEvent, onConnectionMode, simulatedMode = false }: UseAnalyticsStreamProps): void {
  const camerasRef = useRef<Camera[]>(cameras);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    if (!camerasRef.current.length) {
      return;
    }

    let websocket: WebSocket | null = null;
    let mockTimer: number | null = null;
    let closed = false;
    let wsConnected = false;
    let supabaseSubscribed = false;
    const channelName = `analytics-${makeUuid()}`;
    const channel = hasSupabaseConfig && supabase ? supabase.channel(channelName) : null;
    const hasLocalDeviceCamera = camerasRef.current.some(
      (camera) => camera.stream_url.startsWith('device://') || camera.stream_url.startsWith('camera://'),
    );

    const startMock = () => {
      if (mockTimer !== null) {
        return;
      }
      onConnectionMode('mock');
      mockTimer = window.setInterval(() => {
        camerasRef.current
          .filter((camera) => camera.enabled)
          .forEach((camera) => onEvent(generateMockEvent(camera)));
      }, 1000);
    };

    const startWebSocket = () => {
      if (websocket || closed) {
        return;
      }
      onConnectionMode('connecting');
      try {
        websocket = new WebSocket(toWsUrl(getApiBase()));

        websocket.onopen = () => {
          wsConnected = true;
          onConnectionMode('live');
        };

        websocket.onmessage = (message) => {
          try {
            const parsed = JSON.parse(message.data) as AnalyticsEvent | { type?: string };
            if ('type' in parsed && parsed.type === 'ping') {
              return;
            }
            onEvent(parsed as AnalyticsEvent);
          } catch {
            // Keep stream resilient to malformed payloads.
          }
        };

        websocket.onerror = () => {
          if (!wsConnected && !closed) {
            startMock();
          }
        };

        websocket.onclose = () => {
          if (!closed) {
            startMock();
          }
        };
      } catch {
        startMock();
      }
    };

    if (FORCE_MOCK || simulatedMode) {
      startMock();
    } else if (hasLocalDeviceCamera) {
      // Local camera previews rely on frame snapshots sent via WS events.
      startWebSocket();
    } else if (channel) {
      onConnectionMode('connecting');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'analytics_latest' }, (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          const event = rowToEvent(row);
          if (!event) {
            return;
          }

          // Only dispatch for known cameras to avoid noise from unrelated rows.
          if (camerasRef.current.some((camera) => camera.id === event.camera_id)) {
            onEvent(event);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            supabaseSubscribed = true;
            onConnectionMode('live');
            return;
          }

          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !closed) {
            if (!supabaseSubscribed) {
              startWebSocket();
            }
          }
        });
    } else {
      startWebSocket();
    }

    return () => {
      closed = true;
      if (websocket) {
        websocket.close();
      }
      if (mockTimer !== null) {
        window.clearInterval(mockTimer);
      }
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [onConnectionMode, onEvent, cameras.length, simulatedMode]);
}
