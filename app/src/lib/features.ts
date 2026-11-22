/**
 * Landmark normalization. Mirrors ml/signscan_ml/features.py exactly; see shared/feature_spec.md.
 * Change both files together, bump FEATURE_VERSION and regenerate shared/fixtures.
 */

export const FEATURE_VERSION = 1;
export const FEATURE_DIM = 63;
const EPS = 1e-6;

export type Handedness = 'Left' | 'Right';
export type Point3 = [number, number, number];

export interface LandmarkLike {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe labels handedness as if the image were a mirrored selfie. SignScan feeds raw
 * (unmirrored) frames, so the label is swapped to get the signer's actual hand.
 */
export function trueHandedness(mediapipeLabel: string, frameMirrored = false): Handedness {
  const label = mediapipeLabel.trim().toLowerCase();
  if (label !== 'left' && label !== 'right') {
    throw new Error(`Unknown handedness label: ${mediapipeLabel}`);
  }
  const asIs: Handedness = label === 'left' ? 'Left' : 'Right';
  if (frameMirrored) return asIs;
  return asIs === 'Left' ? 'Right' : 'Left';
}

export function toPoints(landmarks: readonly LandmarkLike[]): Point3[] {
  return landmarks.map((p) => [p.x, p.y, p.z]);
}

/** 21 raw MediaPipe landmarks -> 63-d feature vector (FEATURE_VERSION 1). */
export function normalizeLandmarks(
  landmarks: readonly (readonly number[])[],
  handedness: Handedness,
  imageWidth: number,
  imageHeight: number,
): Float32Array {
  if (landmarks.length !== 21) throw new Error(`expected 21 landmarks, got ${landmarks.length}`);
  if (!(imageWidth > 0 && imageHeight > 0)) throw new Error('image size must be positive');
  if (handedness !== 'Left' && handedness !== 'Right') {
    throw new Error(`handedness must be 'Left' or 'Right', got ${String(handedness)}`);
  }
  const aspect = imageWidth / imageHeight;
  const pts = new Float64Array(63);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    // 1. aspect ratio, 2. mirror left hands into right-hand space
    let x = p[0] * aspect;
    if (handedness === 'Left') x = -x;
    pts[i * 3] = x;
    pts[i * 3 + 1] = p[1];
    pts[i * 3 + 2] = p[2];
  }
  // 3. translate: wrist to origin
  const wx = pts[0],
    wy = pts[1],
    wz = pts[2];
  for (let i = 0; i < 21; i++) {
    pts[i * 3] -= wx;
    pts[i * 3 + 1] -= wy;
    pts[i * 3 + 2] -= wz;
  }
  // 4. scale by wrist -> middle-MCP distance, with fallbacks
  const norm = (i: number) => Math.hypot(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  let scale = norm(9);
  if (scale < EPS) {
    scale = 0;
    for (let i = 0; i < 21; i++) scale = Math.max(scale, norm(i));
  }
  const out = new Float32Array(63);
  if (scale < EPS) return out;
  // 5. no rotation normalization, 6. flatten in landmark order
  for (let k = 0; k < 63; k++) out[k] = pts[k] / scale;
  return out;
}
