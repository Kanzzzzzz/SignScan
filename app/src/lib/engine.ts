/**
 * The run-time pipeline (PLAN.md 4.1), shared by every page:
 * camera -> HandTracker -> features -> Classifier -> Stabilizer -> listeners.
 * The camera keeps running while the user moves between pages.
 */

import { CameraError, listCameras, openCamera, stopStream } from './camera';
import { Classifier, ModelMissingError, topK, type ModelMeta } from './classifier';
import { normalizeLandmarks } from './features';
import { HandTracker, type Delegate, type HandDetection } from './handTracker';
import { FpsMeter, StageTimer } from './metrics';
import { cropHandPhoto } from './references';
import {
  Stabilizer,
  type Prediction,
  type StableState,
  type StabilizerOptions,
} from './stabilizer';

export interface FrameTimings {
  detect: number;
  feature: number;
  infer: number;
  total: number;
}

export interface FrameResult {
  t: number;
  hand: HandDetection | null;
  features: Float32Array | null;
  probs: Float32Array | null;
  top: Prediction[];
  stable: StableState;
  timings: FrameTimings;
  fps: number;
  width: number;
  height: number;
}

export type CameraStatus = 'idle' | 'starting' | 'running' | 'error';
export type ModelStatus = 'loading' | 'ready' | 'missing' | 'error';

export interface EngineState {
  camera: CameraStatus;
  cameraError: string | null;
  trackerReady: boolean;
  delegate: Delegate | null;
  model: ModelStatus;
  modelError: string | null;
  labels: string[];
  meta: ModelMeta | null;
  stream: MediaStream | null;
  cameras: MediaDeviceInfo[];
  deviceId: string;
}

type Listener<T> = (v: T) => void;

const EMPTY_FRAME: FrameResult = {
  t: 0,
  hand: null,
  features: null,
  probs: null,
  top: [],
  stable: { kind: 'nohand' },
  timings: { detect: NaN, feature: NaN, infer: NaN, total: NaN },
  fps: 0,
  width: 0,
  height: 0,
};

export class RecognitionEngine {
  private state: EngineState = {
    camera: 'idle',
    cameraError: null,
    trackerReady: false,
    delegate: null,
    model: 'loading',
    modelError: null,
    labels: [],
    meta: null,
    stream: null,
    cameras: [],
    deviceId: '',
  };
  private frame: FrameResult = EMPTY_FRAME;
  private stateListeners = new Set<Listener<EngineState>>();
  private frameListeners = new Set<Listener<FrameResult>>();

  private video: HTMLVideoElement | null = null;
  private tracker: HandTracker | null = null;
  private classifier: Classifier | null = null;
  private stabilizer = new Stabilizer();
  private fpsMeter = new FpsMeter();
  readonly timer = new StageTimer();
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private lastTs = 0;
  private startToken = 0;

  // ---- subscriptions (useSyncExternalStore-compatible) ----
  getState = (): EngineState => this.state;
  getFrame = (): FrameResult => this.frame;
  subscribeState = (l: () => void) => {
    this.stateListeners.add(l);
    return () => {
      this.stateListeners.delete(l);
    };
  };
  subscribeFrame = (l: Listener<FrameResult>) => {
    this.frameListeners.add(l);
    return () => {
      this.frameListeners.delete(l);
    };
  };

  private setState(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.stateListeners.forEach((l) => l(this.state));
  }

  // ---- model ----
  async loadModel(): Promise<void> {
    this.setState({ model: 'loading', modelError: null });
    try {
      this.classifier = await Classifier.load();
      this.setState({ model: 'ready', labels: this.classifier.labels, meta: this.classifier.meta });
    } catch (err) {
      this.classifier = null;
      if (err instanceof ModelMissingError) this.setState({ model: 'missing', labels: [] });
      else this.setState({ model: 'error', modelError: (err as Error).message, labels: [] });
    }
    this.stabilizer.reset();
  }

  setStabilizerOptions(opts: Partial<StabilizerOptions>) {
    this.stabilizer.setOptions(opts);
  }

  // ---- camera ----
  async refreshCameras() {
    try {
      this.setState({ cameras: await listCameras() });
    } catch {
      /* ignore */
    }
  }

  async start(deviceId = this.state.deviceId): Promise<void> {
    const token = ++this.startToken;
    this.stopLoop();
    stopStream(this.state.stream);
    this.setState({ camera: 'starting', cameraError: null, stream: null, deviceId });
    try {
      if (!this.tracker) {
        this.tracker = await HandTracker.create();
        this.setState({ trackerReady: true, delegate: this.tracker.delegate });
      }
      const stream = await openCamera({ deviceId: deviceId || undefined });
      if (token !== this.startToken) {
        stopStream(stream);
        return;
      }
      const video = this.ensureVideo();
      video.srcObject = stream;
      await video.play();
      this.setState({ camera: 'running', stream });
      this.refreshCameras();
      this.stabilizer.reset();
      this.fpsMeter.reset();
      this.running = true;
      this.lastVideoTime = -1;
      this.raf = requestAnimationFrame(this.step);
    } catch (err) {
      if (token !== this.startToken) return;
      const msg =
        err instanceof CameraError
          ? err.message
          : `Could not start hand tracking: ${(err as Error)?.message ?? String(err)}`;
      this.setState({ camera: 'error', cameraError: msg, stream: null });
    }
  }

  /** JPEG crop of the hand in the current frame (mirrored like the preview), or null. */
  async snapshotHand(): Promise<Blob | null> {
    const v = this.video;
    const hand = this.frame.hand;
    if (!v || !hand || !v.videoWidth || this.state.camera !== 'running') return null;
    return cropHandPhoto(v, hand.landmarks, v.videoWidth, v.videoHeight);
  }

  stop(): void {
    this.startToken++;
    this.stopLoop();
    stopStream(this.state.stream);
    if (this.video) this.video.srcObject = null;
    this.frame = EMPTY_FRAME;
    this.frameListeners.forEach((l) => l(this.frame));
    this.setState({ camera: 'idle', stream: null });
  }

  private stopLoop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private ensureVideo(): HTMLVideoElement {
    if (this.video) return this.video;
    // Processing video: in the DOM (some browsers won't decode detached videos) but invisible.
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute('aria-hidden', 'true');
    Object.assign(v.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      left: '0',
      top: '0',
    });
    document.body.appendChild(v);
    this.video = v;
    return v;
  }

  private step = async () => {
    if (!this.running) return;
    const video = this.video;
    if (
      video &&
      this.tracker &&
      video.readyState >= 2 &&
      video.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = video.currentTime;
      try {
        await this.process(video, this.tracker);
      } catch (err) {
        console.error('frame processing failed', err);
      }
    }
    if (this.running) this.raf = requestAnimationFrame(this.step);
  };

  private async process(video: HTMLVideoElement, tracker: HandTracker) {
    const t0 = performance.now();
    const ts = Math.max(t0, this.lastTs + 1);
    this.lastTs = ts;
    const hand = tracker.detect(video, ts);
    const t1 = performance.now();

    const width = video.videoWidth;
    const height = video.videoHeight;
    let features: Float32Array | null = null;
    let probs: Float32Array | null = null;
    let top: Prediction[] = [];
    let t2 = t1;
    let t3 = t1;
    if (hand) {
      features = normalizeLandmarks(hand.landmarks, hand.handedness, width, height);
      t2 = performance.now();
      if (this.classifier) {
        probs = await this.classifier.predict(features);
        top = topK(probs, this.classifier.labels, 3);
      }
      t3 = performance.now();
    }

    let stable: StableState;
    if (!this.classifier) stable = hand ? { kind: 'unsure', best: null } : { kind: 'nohand' };
    else stable = this.stabilizer.push(hand ? (top[0] ?? null) : null);

    const timings: FrameTimings = {
      detect: t1 - t0,
      feature: hand ? t2 - t1 : NaN,
      infer: hand && this.classifier ? t3 - t2 : NaN,
      total: t3 - t0,
    };
    this.timer.record('detect', timings.detect);
    if (hand) this.timer.record('feature', timings.feature);
    if (hand && this.classifier) this.timer.record('infer', timings.infer);
    this.timer.record('total', timings.total);

    this.frame = {
      t: t0,
      hand,
      features,
      probs,
      top,
      stable,
      timings,
      fps: this.fpsMeter.tick(t0),
      width,
      height,
    };
    this.frameListeners.forEach((l) => l(this.frame));
  }
}
