import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createCamera, deleteCamera, getCameras, updateCamera } from '../api/client';
import { useAnalyticsStream } from '../hooks/useAnalyticsStream';
import { addMockCamera, listMockCameras, patchMockCamera, removeMockCamera } from '../utils/mock';
import {
  AlertItem,
  AlertRuleConfig,
  AnalyticsEvent,
  Camera,
  CameraCreatePayload,
  CameraUpdatePayload,
  CountPoint,
} from '../types';

type ConnectionMode = 'connecting' | 'live' | 'mock';

interface AppContextValue {
  cameras: Camera[];
  latestByCamera: Record<string, AnalyticsEvent>;
  historyByCamera: Record<string, CountPoint[]>;
  eventsByCamera: Record<string, AnalyticsEvent[]>;
  alerts: AlertItem[];
  alertRules: AlertRuleConfig;
  connectionMode: ConnectionMode;
  simulatedMode: boolean;
  bootstrapping: boolean;
  refreshCameras: () => Promise<void>;
  setSimulatedMode: (enabled: boolean) => void;
  setAlertRules: (rules: AlertRuleConfig) => void;
  addCamera: (payload: CameraCreatePayload) => Promise<void>;
  patchCamera: (cameraId: string, payload: CameraUpdatePayload) => Promise<void>;
  removeCamera: (cameraId: string) => Promise<void>;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const HISTORY_WINDOW_MS = 15 * 60 * 1000;
const EVENT_LOG_LIMIT = 300;
const MAX_ALERTS = 120;
const ALERT_COOLDOWN_MS = 15000;
const SIM_MODE_KEY = 'sfd_crowd_sim_mode';

const DEFAULT_ALERT_RULES: AlertRuleConfig = {
  threshold_enabled: true,
  threshold_count: 120,
  spike_enabled: true,
  spike_factor: 1.35,
  spike_delta: 12,
  offline_enabled: true,
};

function makeAlert(
  camera: Camera,
  type: AlertItem['type'],
  severity: AlertItem['severity'],
  message: string,
  ts: string,
): AlertItem {
  return {
    id: `${camera.id}-${type}-${ts}`,
    camera_id: camera.id,
    camera_name: camera.name,
    ts,
    type,
    severity,
    message,
  };
}

function readInitialSimMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const value = window.localStorage.getItem(SIM_MODE_KEY);
  return value === '1';
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [latestByCamera, setLatestByCamera] = useState<Record<string, AnalyticsEvent>>({});
  const [historyByCamera, setHistoryByCamera] = useState<Record<string, CountPoint[]>>({});
  const [eventsByCamera, setEventsByCamera] = useState<Record<string, AnalyticsEvent[]>>({});
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('connecting');
  const [simulatedMode, setSimulatedModeState] = useState<boolean>(readInitialSimMode);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [alertRules, setAlertRulesState] = useState<AlertRuleConfig>(DEFAULT_ALERT_RULES);

  const camerasRef = useRef<Camera[]>(cameras);
  const latestRef = useRef<Record<string, AnalyticsEvent>>(latestByCamera);
  const alertRulesRef = useRef<AlertRuleConfig>(alertRules);
  const alertCooldownRef = useRef<Record<string, number>>({});

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    latestRef.current = latestByCamera;
  }, [latestByCamera]);

  useEffect(() => {
    alertRulesRef.current = alertRules;
  }, [alertRules]);

  const loadCameras = useCallback(async (forceSimulated: boolean) => {
    setBootstrapping(true);

    if (forceSimulated) {
      setCameras(listMockCameras());
      setConnectionMode('mock');
      setBootstrapping(false);
      return;
    }

    try {
      const data = await getCameras();
      setCameras(data);
      setConnectionMode('live');
    } catch {
      setCameras(listMockCameras());
      setConnectionMode('mock');
    } finally {
      setBootstrapping(false);
    }
  }, []);

  const refreshCameras = useCallback(async () => {
    await loadCameras(simulatedMode);
  }, [loadCameras, simulatedMode]);

  const setSimulatedMode = useCallback(
    (enabled: boolean) => {
      setSimulatedModeState(enabled);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIM_MODE_KEY, enabled ? '1' : '0');
      }
      void loadCameras(enabled);
    },
    [loadCameras],
  );

  const setAlertRules = useCallback((rules: AlertRuleConfig) => {
    setAlertRulesState(rules);
  }, []);

  const addCameraHandler = useCallback(
    async (payload: CameraCreatePayload) => {
      if (connectionMode === 'mock') {
        const created = addMockCamera(payload);
        setCameras((prev) => [...prev, created]);
        return;
      }

      const created = await createCamera(payload);
      setCameras((prev) => [...prev, created]);
    },
    [connectionMode],
  );

  const patchCameraHandler = useCallback(
    async (cameraId: string, payload: CameraUpdatePayload) => {
      if (connectionMode === 'mock') {
        const updated = patchMockCamera(cameraId, payload);
        setCameras((prev) => prev.map((camera) => (camera.id === cameraId ? updated : camera)));
        return;
      }

      const updated = await updateCamera(cameraId, payload);
      setCameras((prev) => prev.map((camera) => (camera.id === cameraId ? updated : camera)));
    },
    [connectionMode],
  );

  const removeCameraHandler = useCallback(
    async (cameraId: string) => {
      if (connectionMode === 'mock') {
        removeMockCamera(cameraId);
        setCameras((prev) => prev.filter((camera) => camera.id !== cameraId));
        return;
      }

      await deleteCamera(cameraId);
      setCameras((prev) => prev.filter((camera) => camera.id !== cameraId));
    },
    [connectionMode],
  );

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((item) => item.id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const shouldAllowAlert = useCallback((key: string, eventTs: number): boolean => {
    const previousTs = alertCooldownRef.current[key] ?? 0;
    if (eventTs - previousTs < ALERT_COOLDOWN_MS) {
      return false;
    }
    alertCooldownRef.current[key] = eventTs;
    return true;
  }, []);

  const onAnalyticsEvent = useCallback(
    (event: AnalyticsEvent) => {
      const eventTs = new Date(event.ts).getTime();
      const safeTs = Number.isFinite(eventTs) ? eventTs : Date.now();

      setLatestByCamera((prev) => {
        const next = {
          ...prev,
          [event.camera_id]: event,
        };
        latestRef.current = next;
        return next;
      });

      setEventsByCamera((prev) => {
        const existing = prev[event.camera_id] ?? [];
        const updated = [...existing, event].slice(-EVENT_LOG_LIMIT);
        return {
          ...prev,
          [event.camera_id]: updated,
        };
      });

      setCameras((prev) =>
        prev.map((camera) =>
          camera.id === event.camera_id
            ? {
                ...camera,
                status: event.status,
                last_crowd_count: event.crowd_count,
                last_latency_ms: event.latency_ms,
                last_processed_fps: event.processed_fps,
                last_update_ts: event.ts,
              }
            : camera,
        ),
      );

      setHistoryByCamera((prev) => {
        const existing = prev[event.camera_id] ?? [];
        const updated = [...existing, { ts: event.ts, crowd_count: event.crowd_count }].filter((point) => {
          return safeTs - new Date(point.ts).getTime() <= HISTORY_WINDOW_MS;
        });
        return {
          ...prev,
          [event.camera_id]: updated,
        };
      });

      setAlerts((prev) => {
        const camera = camerasRef.current.find((item) => item.id === event.camera_id);
        if (!camera) {
          return prev;
        }

        const rules = alertRulesRef.current;
        const previous = latestRef.current[event.camera_id];
        const nextAlerts = [...prev];

        if (rules.offline_enabled && event.status !== 'online' && shouldAllowAlert(`${camera.id}-offline`, safeTs)) {
          nextAlerts.unshift(
            makeAlert(camera, 'offline', 'critical', `${camera.name} is ${event.status.toUpperCase()}`, event.ts),
          );
        }

        if (
          rules.threshold_enabled &&
          event.crowd_count >= rules.threshold_count &&
          shouldAllowAlert(`${camera.id}-threshold`, safeTs)
        ) {
          nextAlerts.unshift(
            makeAlert(
              camera,
              'threshold',
              'warning',
              `${camera.name} crowd count ${event.crowd_count.toFixed(1)} >= threshold ${rules.threshold_count}`,
              event.ts,
            ),
          );
        }

        if (
          rules.spike_enabled &&
          previous &&
          event.crowd_count > previous.crowd_count * rules.spike_factor &&
          event.crowd_count - previous.crowd_count > rules.spike_delta &&
          shouldAllowAlert(`${camera.id}-spike`, safeTs)
        ) {
          nextAlerts.unshift(
            makeAlert(
              camera,
              'spike',
              'warning',
              `${camera.name} spike ${previous.crowd_count.toFixed(1)} -> ${event.crowd_count.toFixed(1)}`,
              event.ts,
            ),
          );
        }

        return nextAlerts.slice(0, MAX_ALERTS);
      });
    },
    [shouldAllowAlert],
  );

  useAnalyticsStream({
    cameras,
    onEvent: onAnalyticsEvent,
    onConnectionMode: setConnectionMode,
    simulatedMode,
  });

  const value = useMemo<AppContextValue>(
    () => ({
      cameras,
      latestByCamera,
      historyByCamera,
      eventsByCamera,
      alerts,
      alertRules,
      connectionMode,
      simulatedMode,
      bootstrapping,
      refreshCameras,
      setSimulatedMode,
      setAlertRules,
      addCamera: addCameraHandler,
      patchCamera: patchCameraHandler,
      removeCamera: removeCameraHandler,
      dismissAlert,
      clearAlerts,
    }),
    [
      cameras,
      latestByCamera,
      historyByCamera,
      eventsByCamera,
      alerts,
      alertRules,
      connectionMode,
      simulatedMode,
      bootstrapping,
      refreshCameras,
      setSimulatedMode,
      setAlertRules,
      addCameraHandler,
      patchCameraHandler,
      removeCameraHandler,
      dismissAlert,
      clearAlerts,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return context;
}
