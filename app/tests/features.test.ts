import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEATURE_VERSION,
  normalizeLandmarks,
  trueHandedness,
  type Handedness,
} from '../src/lib/features';

// The same golden vectors the Python tests use.
const FIXTURES_DIR = join(__dirname, '..', '..', 'shared', 'fixtures');

interface Fixture {
  name: string;
  feature_version: number;
  input: {
    landmarks: number[][];
    handedness: Handedness;
    image_width: number;
    image_height: number;
  };
  expected: number[];
}

const fixtures: Fixture[] = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf-8')));

const byName = (n: string) => fixtures.find((f) => f.name === n)!;
const compute = (fx: Fixture) =>
  normalizeLandmarks(
    fx.input.landmarks,
    fx.input.handedness,
    fx.input.image_width,
    fx.input.image_height,
  );
const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

describe('feature normalization (shared fixtures)', () => {
  it('has at least 4 fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))('%s matches expected', (_name, fx) => {
    expect(fx.feature_version).toBe(FEATURE_VERSION);
    const got = compute(fx);
    expect(got).toHaveLength(63);
    expect(maxDiff(got, fx.expected)).toBeLessThan(1e-5);
  });

  it('mirrors left hands into right-hand space', () => {
    expect(maxDiff(compute(byName('left_hand')), compute(byName('right_hand')))).toBeLessThan(1e-5);
  });

  it('is translation and scale invariant', () => {
    expect(
      maxDiff(compute(byName('scaled_translated_hand')), compute(byName('right_hand'))),
    ).toBeLessThan(1e-5);
  });

  it('keeps rotation information', () => {
    expect(maxDiff(compute(byName('rotated_hand')), compute(byName('right_hand')))).toBeGreaterThan(
      0.1,
    );
  });

  it('puts the wrist at the origin with unit wrist-to-MCP distance', () => {
    const f = compute(byName('right_hand'));
    expect([f[0], f[1], f[2]]).toEqual([0, 0, 0]);
    expect(Math.hypot(f[27], f[28], f[29])).toBeCloseTo(1, 5);
  });

  it('returns zeros for a collapsed hand', () => {
    const z = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
    expect(Array.from(normalizeLandmarks(z, 'Right', 640, 480)).every((v) => v === 0)).toBe(true);
  });

  it('rejects bad input', () => {
    expect(() => normalizeLandmarks([[0, 0, 0]], 'Right', 640, 480)).toThrow();
    expect(() =>
      normalizeLandmarks(byName('right_hand').input.landmarks, 'Right', 0, 480),
    ).toThrow();
  });
});

describe('trueHandedness', () => {
  it('swaps the MediaPipe label for raw (unmirrored) frames', () => {
    expect(trueHandedness('Left')).toBe('Right');
    expect(trueHandedness('Right')).toBe('Left');
    expect(trueHandedness('Left', true)).toBe('Left');
    expect(() => trueHandedness('Up')).toThrow();
  });
});
