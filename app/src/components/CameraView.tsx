import { useEffect, useRef } from 'react';
import {
  useEngine,
  useEngineState,
  useFrame,
  useFrameListener,
  useSettings,
} from '../hooks/useEngine';
import type { FrameResult } from '../lib/engine';
import { HAND_CONNECTIONS } from '../lib/handTracker';

function drawOverlay(canvas: HTMLCanvasElement | null, f: FrameResult, show: boolean) {
  if (!canvas) return;
  if (f.width && (canvas.width !== f.width || canvas.height !== f.height)) {
    canvas.width = f.width;
    canvas.height = f.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!show || !f.hand) return;
  const w = canvas.width;
  const h = canvas.height;
  const pts = f.hand.landmarks.map(([x, y]) => [x * w, y * h] as const);
  const unit = Math.max(2, w / 220);
  ctx.lineCap = 'round';
  // dark halo first, then light stroke: visible on any background
  for (const [color, width] of [
    ['rgba(0,0,0,0.55)', unit * 2.2],
    ['#7ff0dc', unit],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
    }
    ctx.stroke();
  }
  pts.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(x, y, i === 0 ? unit * 2.2 : unit * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = unit * 0.8;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
  });
}

function HandChip() {
  const f = useFrame();
  const st = useEngineState();
  if (st.camera !== 'running') return null;
  return (
    <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white tabular">
      {f.hand
        ? `${f.hand.handedness} hand · ${(f.hand.score * 100).toFixed(0)}%`
        : 'No hand in view'}
      <span className="ml-2 opacity-80">{f.fps.toFixed(0)} FPS</span>
    </div>
  );
}

export function CameraView({ className = '' }: { className?: string }) {
  const engine = useEngine();
  const st = useEngineState();
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = st.stream;
    if (st.stream) v.play().catch(() => undefined);
  }, [st.stream]);

  useFrameListener((f) => drawOverlay(canvasRef.current, f, settings.showLandmarks));

  return (
    <div className={className}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-video">
        {/* Preview is mirrored like a selfie; the landmarker gets the raw frame (feature_spec.md). */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Camera preview, mirrored"
          className="absolute inset-0 h-full w-full -scale-x-100 object-contain"
        />
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain"
        />
        {st.camera !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {st.camera === 'starting' ? (
              <p role="status" className="text-sm">
                Starting the camera and hand tracker…
              </p>
            ) : (
              <>
                {st.camera === 'error' && (
                  <p role="alert" className="max-w-sm rounded-lg bg-black/60 p-3 text-sm">
                    {st.cameraError}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => engine.start(settings.deviceId)}
                >
                  {st.camera === 'error' ? 'Try again' : 'Start camera'}
                </button>
                <p className="max-w-xs text-xs text-white/75">
                  Video is processed on this device and never uploaded.
                </p>
              </>
            )}
          </div>
        )}
        <HandChip />
        {st.camera === 'running' && (
          <button
            type="button"
            onClick={() => engine.stop()}
            className="absolute top-2 right-2 min-h-9 rounded-md bg-black/60 px-3 text-xs font-semibold text-white hover:bg-black/80"
          >
            Stop camera
          </button>
        )}
      </div>
    </div>
  );
}
