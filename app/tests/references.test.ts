import { describe, expect, it } from 'vitest';
import type { Point3 } from '../src/lib/features';
import { handCropRect } from '../src/lib/references';

const hand = (xs: number[], ys: number[]): Point3[] =>
  Array.from({ length: 21 }, (_, i) => [xs[i % xs.length], ys[i % ys.length], 0]);

describe('handCropRect', () => {
  it('makes a padded square centered on the hand', () => {
    // hand spans x 0.4..0.6 (256..384 px) and y 0.4..0.6 (192..288 px) in a 640x480 frame
    const r = handCropRect(hand([0.4, 0.6], [0.4, 0.6]), 640, 480, 0.25);
    expect(r.size).toBeCloseTo(128 * 1.5);
    expect(r.x + r.size / 2).toBeCloseTo(320);
    expect(r.y + r.size / 2).toBeCloseTo(240);
  });

  it('stays inside the frame near the edges', () => {
    const r = handCropRect(hand([0.0, 0.1], [0.9, 1.0]), 640, 480);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.size).toBeLessThanOrEqual(640);
    expect(r.y + r.size).toBeLessThanOrEqual(480);
  });

  it('never exceeds the frame for a very large hand', () => {
    const r = handCropRect(hand([0, 1], [0, 1]), 640, 480);
    expect(r.size).toBe(480);
  });
});
