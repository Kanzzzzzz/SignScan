import { describe, expect, it } from 'vitest';
import { topK } from '../src/lib/classifier';
import { toCsv, toJsonl } from '../src/lib/csv';
import { hintFor } from '../src/lib/hints';
import { LABELS } from '../src/lib/labels';
import { FpsMeter, StageTimer, mean, percentile } from '../src/lib/metrics';
import { recordAttempt, weakestFirst } from '../src/lib/storage';

describe('metrics', () => {
  it('computes percentiles with interpolation', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([0, 10], 95)).toBeCloseTo(9.5);
    expect(percentile([], 95)).toBeNaN();
    expect(mean([2, 4])).toBe(3);
  });

  it('measures FPS over a sliding window', () => {
    const m = new FpsMeter(1000);
    for (let t = 0; t <= 1000; t += 40) m.tick(t);
    expect(m.fps).toBeCloseTo(25, 0);
  });

  it('summarizes stages', () => {
    const t = new StageTimer(3);
    [5, 10, 15, 20].forEach((v) => t.record('detect', v));
    const s = t.summary();
    expect(s.detect.n).toBe(3);
    expect(s.detect.mean).toBe(15);
    expect(s.detect.last).toBe(20);
    expect(s.infer.n).toBe(0);
  });
});

describe('csv', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv([
      { a: 'x,y', b: 'he said "hi"', c: 1.5 },
      { a: 'line\nbreak', c: NaN },
    ]);
    expect(csv).toBe('a,b,c\n"x,y","he said ""hi""",1.5\n"line\nbreak",,\n');
  });

  it('writes JSONL', () => {
    expect(toJsonl([{ a: 1 }, { b: 2 }])).toBe('{"a":1}\n{"b":2}\n');
    expect(toJsonl([])).toBe('');
  });
});

describe('labels', () => {
  it('come from shared/labels.json: 24 static letters', () => {
    expect(LABELS).toHaveLength(24);
    expect(LABELS).not.toContain('J');
    expect(LABELS).not.toContain('Z');
  });
});

describe('practice progress', () => {
  it('records attempts and orders weakest first', () => {
    let p = recordAttempt({}, 'A', true, 1000, 1);
    p = recordAttempt(p, 'A', true, 3000, 2);
    p = recordAttempt(p, 'B', false, 0, 3);
    p = recordAttempt(p, 'C', true, 500, 4);
    expect(p.A).toMatchObject({ attempts: 2, successes: 2, totalTimeMs: 4000 });
    // D never tried, B 0%, then A (slower) before C
    expect(weakestFirst(['A', 'B', 'C', 'D'], p)).toEqual(['D', 'B', 'A', 'C']);
  });
});

describe('topK and hints', () => {
  it('returns the highest probabilities in order', () => {
    expect(topK([0.1, 0.7, 0.2], ['A', 'B', 'C'], 2)).toEqual([
      { label: 'B', confidence: 0.7 },
      { label: 'C', confidence: 0.2 },
    ]);
  });

  it('gives a specific hint for confusable pairs in either order', () => {
    expect(hintFor('M', 'N')).toContain('Looks like N');
    expect(hintFor('M', 'N')).toContain('fingers');
    expect(hintFor('C', 'O')).toContain('circle');
    expect(hintFor('B', 'Y')).toContain('reference for B');
  });
});
