/** IndexedDB storage for recorded landmark bursts (Collect page). Landmarks only, never video. */

import { tx } from './db';
import type { Handedness, Point3 } from './features';

export interface Conditions {
  lighting: string;
  background: string;
  distance: string;
  orientation: string;
}

/** One JSONL line, matching ml/signscan_ml/dataset.py. */
export interface Sample {
  label: string;
  signer_id: string;
  session: string;
  burst_id: string;
  conditions: Conditions;
  landmarks: Point3[];
  handedness: Handedness;
  handedness_score: number;
  image_width: number;
  image_height: number;
  ts: number;
  feature_version: number;
}

export interface Burst {
  id: string;
  label: string;
  signer_id: string;
  session: string;
  conditions: Conditions;
  createdAt: number;
  samples: Sample[];
}

export const addBurst = (b: Burst) =>
  tx('bursts', 'readwrite', (s) => s.put(b)).then(() => undefined);
export const deleteBurst = (id: string) =>
  tx('bursts', 'readwrite', (s) => s.delete(id)).then(() => undefined);
export const clearBursts = () => tx('bursts', 'readwrite', (s) => s.clear()).then(() => undefined);
export const listBursts = () =>
  tx<Burst[]>('bursts', 'readonly', (s) => s.getAll() as IDBRequest<Burst[]>).then((all) =>
    all.sort((a, b) => b.createdAt - a.createdAt),
  );

export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
