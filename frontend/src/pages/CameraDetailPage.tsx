import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';

import { StatusBadge } from '../components/StatusBadge';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { VideoOverlay } from '../components/VideoOverlay';
import { Badge } from '../components/ui/badge';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';
import { useAppContext } from '../context/AppContext';

export function CameraDetailPage(): JSX.Element {
  const { cameraId } = useParams();
  const { cameras, latestByCamera, historyByCamera, eventsByCamera, alerts } = useAppContext();
  const [opacity, setOpacity] = useState(0.65);
  const [overlayEnabled, setOverlayEnabled] = useState(true);

  const camera = useMemo(() => cameras.find((item) => item.id === cameraId), [cameras, cameraId]);

  if (!camera) {
    return (
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Camera not found.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-[hsl(var(--accent))] hover:underline" to="/">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const latest = latestByCamera[camera.id];
  const history = historyByCamera[camera.id] ?? [];
  const events = (eventsByCamera[camera.id] ?? []).slice(-30).reverse();
  const cameraAlerts = alerts.filter((alert) => alert.camera_id === camera.id).slice(0, 12);

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="col-span-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{camera.name}</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{camera.stream_url}</p>
          </div>
          <StatusBadge status={camera.status} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2.5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--muted-foreground))]">Crowd Count</p>
            <p className="text-xl font-semibold">{(latest?.crowd_count ?? camera.last_crowd_count ?? 0).toFixed(1)}</p>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2.5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--muted-foreground))]">Latency</p>
            <p className="text-xl font-semibold">{(latest?.latency_ms ?? camera.last_latency_ms ?? 0).toFixed(1)} ms</p>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2.5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--muted-foreground))]">Processed FPS</p>
            <p className="text-xl font-semibold">{(latest?.processed_fps ?? camera.last_processed_fps ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2.5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--muted-foreground))]">Last Update</p>
            <p className="text-sm font-semibold">
              {latest?.ts || camera.last_update_ts ? new Date(latest?.ts || camera.last_update_ts || '').toLocaleTimeString() : 'N/A'}
            </p>
          </div>
        </div>
      </section>

      <section className="col-span-12 lg:col-span-9">
        <VideoOverlay
          src={camera.preview_url}
          overlayBase64={latest?.density_overlay_png_base64}
          frameJpegBase64={latest?.frame_jpeg_base64}
          opacity={opacity}
          overlayEnabled={overlayEnabled}
        />
      </section>

      <section className="col-span-12 lg:col-span-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Overlay Controls</h3>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between text-sm">
            Density Overlay
            <Switch checked={overlayEnabled} onCheckedChange={setOverlayEnabled} />
          </label>

          <div>
            <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">Opacity: {Math.round(opacity * 100)}%</p>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[opacity]}
              onValueChange={(value) => {
                setOpacity(value[0] ?? 0.65);
              }}
            />
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Recent Alerts</h4>
          <div className="space-y-2">
            {cameraAlerts.length === 0 && <p className="text-xs text-[hsl(var(--muted-foreground))]">No active alerts for this camera.</p>}
            {cameraAlerts.map((alert) => (
              <div key={alert.id} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2">
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant={alert.severity === 'critical' ? 'danger' : 'warning'}>{alert.type.toUpperCase()}</Badge>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{new Date(alert.ts).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="col-span-12 lg:col-span-8">
        <TimeSeriesChart points={history} />
      </section>

      <section className="col-span-12 lg:col-span-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Event Log</h3>
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {events.length === 0 && <p className="text-xs text-[hsl(var(--muted-foreground))]">No events yet.</p>}
          {events.map((event, index) => (
            <article key={`${event.ts}-${index}`} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <Badge variant={event.status === 'online' ? 'success' : event.status === 'error' ? 'danger' : 'muted'}>
                  {event.status.toUpperCase()}
                </Badge>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{new Date(event.ts).toLocaleTimeString()}</span>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Crowd {event.crowd_count.toFixed(1)} | FPS {event.processed_fps.toFixed(2)} | Latency {event.latency_ms.toFixed(1)} ms
              </p>
              {event.message && <p className="mt-1 text-xs">{event.message}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
