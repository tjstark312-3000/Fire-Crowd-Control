import { useMemo, useState } from 'react';

import { AlertsPanel } from '../components/AlertsPanel';
import { CameraTile } from '../components/CameraTile';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useAppContext } from '../context/AppContext';

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-3">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TileSkeleton(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))]">
      <div className="aspect-video animate-pulse bg-[hsl(var(--panel-3))]" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-2/3 animate-pulse rounded bg-[hsl(var(--panel-3))]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[hsl(var(--panel-3))]" />
        <div className="h-9 animate-pulse rounded bg-[hsl(var(--panel-3))]" />
      </div>
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const { cameras, latestByCamera, historyByCamera, alerts, dismissAlert, clearAlerts, bootstrapping } = useAppContext();
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [alertingOnly, setAlertingOnly] = useState(false);
  const [pausedByCamera, setPausedByCamera] = useState<Record<string, boolean>>({});

  const alertCameraIds = useMemo(() => new Set(alerts.map((item) => item.camera_id)), [alerts]);

  const filteredCameras = useMemo(() => {
    return cameras.filter((camera) => {
      const matchesSearch = !search || `${camera.name} ${camera.stream_url}`.toLowerCase().includes(search.toLowerCase());
      const matchesOnline = onlineOnly ? camera.status === 'online' : true;
      const matchesAlerting = alertingOnly ? alertCameraIds.has(camera.id) : true;
      return matchesSearch && matchesOnline && matchesAlerting;
    });
  }, [alertCameraIds, alertingOnly, cameras, onlineOnly, search]);

  const onlineCount = cameras.filter((camera) => camera.status === 'online').length;
  const totalCrowd = cameras.reduce((sum, camera) => sum + (latestByCamera[camera.id]?.crowd_count ?? camera.last_crowd_count ?? 0), 0);
  const avgLatency =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + (latestByCamera[camera.id]?.latency_ms ?? camera.last_latency_ms ?? 0), 0) / cameras.length
      : 0;

  const recentUpdates = useMemo(() => {
    return cameras
      .map((camera) => ({
        id: camera.id,
        name: camera.name,
        status: latestByCamera[camera.id]?.status ?? camera.status,
        count: latestByCamera[camera.id]?.crowd_count ?? camera.last_crowd_count ?? 0,
        ts: latestByCamera[camera.id]?.ts ?? camera.last_update_ts,
      }))
      .sort((a, b) => new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime())
      .slice(0, 8);
  }, [cameras, latestByCamera]);

  const togglePause = (cameraId: string) => {
    setPausedByCamera((prev) => ({
      ...prev,
      [cameraId]: !prev[cameraId],
    }));
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Online cameras" value={`${onlineCount}/${cameras.length || 0}`} />
        <StatCard label="Total crowd" value={totalCrowd.toFixed(1)} />
        <StatCard label="Average latency" value={`${avgLatency.toFixed(1)} ms`} />
        <StatCard label="Active alerts" value={String(alerts.length)} />
      </section>

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cameras"
            className="min-w-[260px] flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            Online only
            <Switch checked={onlineOnly} onCheckedChange={setOnlineOnly} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            Alerting only
            <Switch checked={alertingOnly} onCheckedChange={setAlertingOnly} />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cameras</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{filteredCameras.length} shown</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {bootstrapping && cameras.length === 0 && (
              <>
                <TileSkeleton />
                <TileSkeleton />
                <TileSkeleton />
              </>
            )}

            {!bootstrapping && filteredCameras.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No cameras match current filters.
              </div>
            )}

            {filteredCameras.map((camera) => (
              <CameraTile
                key={camera.id}
                camera={camera}
                latest={latestByCamera[camera.id]}
                history={historyByCamera[camera.id] ?? []}
                paused={Boolean(pausedByCamera[camera.id])}
                onTogglePause={togglePause}
              />
            ))}
          </div>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <AlertsPanel alerts={alerts} onDismiss={dismissAlert} onClear={clearAlerts} />

          <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent updates</h3>
            </div>
            <div className="space-y-1.5">
              {recentUpdates.map((item) => (
                <div key={item.id} className="rounded border border-[hsl(var(--border))] px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="font-mono text-[hsl(var(--muted-foreground))]">{item.count.toFixed(1)}</p>
                  </div>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    {item.status} {item.ts ? `• ${new Date(item.ts).toLocaleTimeString()}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
