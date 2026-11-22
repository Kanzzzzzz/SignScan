/**
 * Practice reference photos: the team's own FSL hand-shape photos (docs/decisions.md G11).
 * Stored in this browser (IndexedDB). Under `npm run dev` they are also written to
 * app/public/references/<LETTER>.jpg so they ship with the app.
 */

import { tx } from './db';
import type { Point3 } from './features';

export interface ReferenceRecord {
  letter: string;
  blob: Blob;
  createdAt: number;
  source: 'camera' | 'upload';
}

export const PHOTO_SIZE = 480;

export const getReference = (letter: string) =>
  tx<ReferenceRecord | undefined>('references', 'readonly', (s) => s.get(letter));
export const deleteReference = (letter: string) =>
  tx('references', 'readwrite', (s) => s.delete(letter)).then(() => undefined);
export const saveReference = (r: ReferenceRecord) =>
  tx('references', 'readwrite', (s) => s.put(r)).then(() => undefined);

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/**
 * Square crop around the hand (pixels of the raw frame), padded on each side and clamped to the
 * image. `landmarks` are MediaPipe normalized coordinates.
 */
export function handCropRect(
  landmarks: readonly Point3[],
  width: number,
  height: number,
  pad = 0.35,
): Rect {
  const xs = landmarks.map((p) => p[0] * width);
  const ys = landmarks.map((p) => p[1] * height);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let size = Math.max(maxX - minX, maxY - minY) * (1 + 2 * pad);
  size = Math.min(Math.max(size, 64), width, height);
  const x = Math.min(Math.max(cx - size / 2, 0), width - size);
  const y = Math.min(Math.max(cy - size / 2, 0), height - size);
  return { x, y, size };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, fail) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : fail(new Error('Could not encode photo'))),
      'image/jpeg',
      0.88,
    ),
  );
}

/** Crop the hand out of a video frame, mirrored like the on-screen preview. */
export function cropHandPhoto(
  source: CanvasImageSource,
  landmarks: readonly Point3[],
  width: number,
  height: number,
): Promise<Blob> {
  const r = handCropRect(landmarks, width, height);
  const c = document.createElement('canvas');
  c.width = c.height = PHOTO_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.translate(PHOTO_SIZE, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, r.x, r.y, r.size, r.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvasToJpeg(c);
}

/** Center-crop an uploaded image to a square JPEG. */
export async function normalizeUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const bmp = await createImageBitmap(file);
  const size = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = PHOTO_SIZE;
  c.getContext('2d')!.drawImage(
    bmp,
    (bmp.width - size) / 2,
    (bmp.height - size) / 2,
    size,
    size,
    0,
    0,
    PHOTO_SIZE,
    PHOTO_SIZE,
  );
  bmp.close();
  return canvasToJpeg(c);
}

// ---- dev only: write into app/public/references so photos ship with the app ----

const DEV = import.meta.env.DEV;
const HEADERS = { 'X-SignScan': '1' };

export async function publishReference(letter: string, blob: Blob): Promise<boolean> {
  if (!DEV) return false;
  try {
    const res = await fetch(`/__signscan/reference/${encodeURIComponent(letter)}`, {
      method: 'PUT',
      headers: { ...HEADERS, 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unpublishReference(letter: string): Promise<void> {
  if (!DEV) return;
  await fetch(`/__signscan/reference/${encodeURIComponent(letter)}`, {
    method: 'DELETE',
    headers: HEADERS,
  }).catch(() => undefined);
}

/** Fired with `detail = letter` whenever a letter's photo is added or removed. */
export const referenceEvents = new EventTarget();
const changed = (letter: string) =>
  referenceEvents.dispatchEvent(new CustomEvent('change', { detail: letter }));

/** Save locally and (in dev) into the app's public folder. */
export async function storeReference(
  letter: string,
  blob: Blob,
  source: ReferenceRecord['source'],
): Promise<void> {
  await saveReference({ letter, blob, createdAt: Date.now(), source });
  await publishReference(letter, blob);
  changed(letter);
}

export async function removeReference(letter: string): Promise<void> {
  await deleteReference(letter);
  await unpublishReference(letter);
  changed(letter);
}

/** True if the letter has a photo, either saved in this browser or shipped with the app. */
export async function hasReference(letter: string, shippedUrl: string): Promise<boolean> {
  if (await getReference(letter).catch(() => undefined)) return true;
  try {
    const res = await fetch(shippedUrl, { method: 'HEAD', cache: 'no-cache' });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}
