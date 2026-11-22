/** MediaPipe Hand Landmarker wrapper: VIDEO mode, one hand, GPU delegate with CPU fallback. */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND_LANDMARKER_MODEL, MEDIAPIPE_WASM_DIR } from './assets';
import { toPoints, trueHandedness, type Handedness, type Point3 } from './features';

export interface HandDetection {
  /** 21 raw normalized image landmarks [x, y, z] of the unmirrored frame. */
  landmarks: Point3[];
  /** The signer's actual hand (MediaPipe's label corrected for the raw frame). */
  handedness: Handedness;
  score: number;
}

export type Delegate = 'GPU' | 'CPU';

export class HandTracker {
  private constructor(
    private readonly landmarker: HandLandmarker,
    public readonly delegate: Delegate,
  ) {}

  static async create(): Promise<HandTracker> {
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_DIR);
    const make = (delegate: Delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return new HandTracker(await make('GPU'), 'GPU');
    } catch (gpuErr) {
      console.warn('GPU delegate unavailable, falling back to CPU', gpuErr);
      return new HandTracker(await make('CPU'), 'CPU');
    }
  }

  /** `timestampMs` must increase monotonically between calls. */
  detect(video: HTMLVideoElement, timestampMs: number): HandDetection | null {
    const res = this.landmarker.detectForVideo(video, timestampMs);
    const lms = res.landmarks?.[0];
    if (!lms || lms.length !== 21) return null;
    const cat = res.handedness?.[0]?.[0] ?? res.handednesses?.[0]?.[0];
    if (!cat) return null;
    return {
      landmarks: toPoints(lms),
      handedness: trueHandedness(cat.categoryName),
      score: cat.score,
    };
  }

  close(): void {
    this.landmarker.close();
  }
}

/** MediaPipe hand topology, for drawing. */
export const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]; // prettier-ignore
