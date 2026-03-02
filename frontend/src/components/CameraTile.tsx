import { Camera as CameraIcon, Eye, EyeOff, Pause, Play, ScanSearch, VideoOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

import { AnalyticsEvent, Camera as CameraType, CountPoint } from '../types';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const FALLBACK_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

interface CameraTileProps {
  camera: CameraType;
  latest?: AnalyticsEvent;
  history: CountPoint[];
  paused: boolean;
  onTogglePause: (cameraId: string) => void;
}

function statusVariant(status: CameraType['status']): 'success' | 'muted' | 'danger' {
  if (status === 'online') {
    return 'success';
  }
  if (status === 'error') {
    return 'danger';
  }
  return 'muted';
}

export function CameraTile({ camera, latest, history, paused, onTogglePause }: CameraTileProps): JSX.Element {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [frozenEvent, setFrozenEvent] = useState<AnalyticsEvent | undefined>(latest);
  const [frozenHistory, setFrozenHistory] = useState<CountPoint[]>(history);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!paused && latest) {
      setFrozenEvent(latest);
    }
  }, [latest, paused]);

  useEffect(() => {
    if (!paused) {
      setFrozenHistory(history);
    }
  }, [history, paused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (camera.enabled) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [camera.enabled]);

  const event = paused ? frozenEvent ?? latest : latest;
  const sparkHistory = (paused ? frozenHistory : history).slice(-60);

  const crowdCount = event?.crowd_count ?? camera.last_crowd_count ?? 0;
  const fps = event?.processed_fps ?? camera.last_processed_fps ?? 0;
  const latency = event?.latency_ms ?? camera.last_latency_ms ?? 0;

  const isLive =
    !paused &&
    camera.status === 'online' &&
    !!event?.ts &&
    clock - new Date(event.ts).getTime() < 5000 &&
    camera.enabled;

  const sparkData = useMemo(
    () => sparkHistory.map((point, index) => ({ t: index, value: Number(point.crowd_count.toFixed(2)) })),
    [sparkHistory],
  );

  const resolvedSrc = camera.preview_url || FALLBACK_VIDEO;
  const frameSrc = event?.frame_jpeg_base64 ? `data:image/jpeg;base64,${event.frame_jpeg_base64}` : null;
  const showFramePreview = Boolean(frameSrc);

  useEffect(() => {
    if (showFramePreview) {
      setVideoError(false);
    }
  }, [showFramePreview]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    const resizeCanvas = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = parseFloat(canvas.style.width || '0') || canvas.width;
    const height = parseFloat(canvas.style.height || '0') || canvas.height;

    context.clearRect(0, 0, width, height);

    if (!overlayEnabled || !event?.density_overlay_png_base64) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = 0.62;
      context.drawImage(image, 0, 0, width, height);
      context.globalAlpha = 1;
    };
    image.src = `data:image/png;base64,${event.density_overlay_png_base64}`;
  }, [overlayEnabled, event?.density_overlay_png_base64]);

  const snapshotFrame = () => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1280;
    exportCanvas.height = 720;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    if (camera.enabled && video && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, exportCanvas.width, exportCanvas.height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, exportCanvas.width, exportCanvas.height);
      gradient.addColorStop(0, '#060606');
      gradient.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '700 46px system-ui';
      ctx.fillText('SIMULATED FRAME', 48, 86);
      ctx.font = '400 28px system-ui';
      ctx.fillText(new Date().toLocaleString(), 48, 132);
    }

    if (overlayEnabled && overlay) {
      ctx.drawImage(overlay, 0, 0, exportCanvas.width, exportCanvas.height);
    }

    const link = document.createElement('a');
    link.href = exportCanvas.toDataURL('image/png');
    link.download = `${camera.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.png`;
    link.click();
  };

  return (
    <article className="group rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))] transition-colors duration-150">
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-black">
        <video
          ref={videoRef}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-150',
            showFramePreview ? 'opacity-0' : camera.enabled ? 'opacity-100' : 'opacity-40',
          )}
          src={resolvedSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoError(false)}
          onError={() => {
            if (!showFramePreview) {
              setVideoError(true);
            }
          }}
        />
        {showFramePreview && <img src={frameSrc ?? ''} alt={`${camera.name} latest frame`} className="absolute inset-0 h-full w-full object-cover" />}

        {!camera.enabled && (
          <div className="absolute inset-0 grid place-items-center bg-[#101010]">
            <div className="text-center text-white/80">
              <VideoOff className="mx-auto mb-2 h-6 w-6" />
              <p className="text-xs">Simulated frame</p>
            </div>
          </div>
        )}

        <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 transform-gpu" />

        {videoError && !showFramePreview && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-3 text-center text-xs text-white/80">
            Live stream unavailable.
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
              isLive ? 'border-emerald-500/40 text-emerald-200' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'animate-pulse bg-emerald-300' : 'bg-[hsl(var(--muted-foreground))]')} />
            {paused ? 'Paused' : isLive ? 'Live' : 'Idle'}
          </span>
          <Badge variant={statusVariant(camera.status)}>{camera.status}</Badge>
        </div>

        <button
          type="button"
          onClick={() => setOverlayEnabled((prev) => !prev)}
          className="absolute right-2 top-2 rounded border border-[hsl(var(--border))] bg-black/40 p-1.5 text-white/80"
          aria-label={overlayEnabled ? 'Hide density overlay' : 'Show density overlay'}
        >
          {overlayEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <div className="absolute inset-x-0 bottom-0 flex translate-y-1 items-center justify-end gap-1 p-2 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/camera/${camera.id}`)} className="pointer-events-auto">
            <ScanSearch className="mr-1 h-3.5 w-3.5" />
            Detail
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onTogglePause(camera.id)} className="pointer-events-auto">
            {paused ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="secondary" onClick={snapshotFrame} className="pointer-events-auto">
            <CameraIcon className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{camera.name}</h3>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{camera.stream_url}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Crowd</p>
            <p className="font-mono text-2xl font-semibold">{crowdCount.toFixed(1)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-[hsl(var(--border))] px-2 py-1.5">
            <p className="text-[hsl(var(--muted-foreground))]">FPS</p>
            <p className="font-mono">{fps.toFixed(2)}</p>
          </div>
          <div className="rounded border border-[hsl(var(--border))] px-2 py-1.5">
            <p className="text-[hsl(var(--muted-foreground))]">Latency</p>
            <p className="font-mono">{latency.toFixed(1)} ms</p>
          </div>
        </div>

        <div className="h-11 rounded border border-[hsl(var(--border))] px-1 py-1">
          {sparkData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-[11px] text-[hsl(var(--muted-foreground))]">No data yet</div>
          )}
        </div>
      </div>
    </article>
  );
}
