import { useEffect, useMemo, useRef, useState } from 'react';

interface VideoOverlayProps {
  src?: string | null;
  overlayBase64?: string;
  frameJpegBase64?: string | null;
  opacity: number;
  overlayEnabled?: boolean;
}

const FALLBACK_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export function VideoOverlay({
  src,
  overlayBase64,
  frameJpegBase64,
  opacity,
  overlayEnabled = true,
}: VideoOverlayProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasVideoError, setHasVideoError] = useState(false);

  const resolvedSrc = useMemo(() => src || FALLBACK_VIDEO, [src]);
  const frameSrc = useMemo(
    () => (frameJpegBase64 ? `data:image/jpeg;base64,${frameJpegBase64}` : null),
    [frameJpegBase64],
  );
  const showFramePreview = Boolean(frameSrc);

  useEffect(() => {
    if (showFramePreview) {
      setHasVideoError(false);
    }
  }, [showFramePreview]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const resize = () => {
      const rect = video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(video);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const width = parseFloat(canvas.style.width || '0') || canvas.width;
    const height = parseFloat(canvas.style.height || '0') || canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!overlayEnabled || !overlayBase64) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
      ctx.drawImage(img, 0, 0, width, height);
      ctx.globalAlpha = 1;
    };
    img.src = `data:image/png;base64,${overlayBase64}`;
  }, [overlayBase64, opacity, overlayEnabled]);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className={showFramePreview ? 'aspect-video w-full object-cover opacity-0' : 'aspect-video w-full object-cover'}
          src={resolvedSrc}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setHasVideoError(false)}
          onError={() => {
            if (!showFramePreview) {
              setHasVideoError(true);
            }
          }}
        />
        {showFramePreview && <img src={frameSrc ?? ''} alt="Latest camera frame" className="absolute inset-0 h-full w-full object-cover" />}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

        {hasVideoError && !showFramePreview && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 text-xs text-white/80">
            Live stream unavailable. Showing telemetry only.
          </div>
        )}
      </div>
    </div>
  );
}
