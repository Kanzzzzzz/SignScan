/** FPS and per-stage timings for the debug panel and the O4 evaluation. */

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class FpsMeter {
  private times: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  tick(now: number): number {
    this.times.push(now);
    while (this.times.length > 1 && now - this.times[0] > this.windowMs) this.times.shift();
    return this.fps;
  }

  get fps(): number {
    if (this.times.length < 2) return 0;
    const span = this.times[this.times.length - 1] - this.times[0];
    return span > 0 ? ((this.times.length - 1) * 1000) / span : 0;
  }

  reset(): void {
    this.times = [];
  }
}

export type Stage = 'detect' | 'feature' | 'infer' | 'total';
export const STAGES: Stage[] = ['detect', 'feature', 'infer', 'total'];

export interface StageSummary {
  last: number;
  mean: number;
  p95: number;
  n: number;
}

export class StageTimer {
  private data: Record<Stage, number[]> = { detect: [], feature: [], infer: [], total: [] };
  private lastValue: Record<Stage, number> = { detect: NaN, feature: NaN, infer: NaN, total: NaN };

  constructor(private readonly capacity = 600) {}

  record(stage: Stage, ms: number): void {
    const arr = this.data[stage];
    arr.push(ms);
    if (arr.length > this.capacity) arr.shift();
    this.lastValue[stage] = ms;
  }

  summary(): Record<Stage, StageSummary> {
    const out = {} as Record<Stage, StageSummary>;
    for (const s of STAGES) {
      const arr = this.data[s];
      out[s] = {
        last: this.lastValue[s],
        mean: mean(arr),
        p95: percentile(arr, 95),
        n: arr.length,
      };
    }
    return out;
  }

  reset(): void {
    for (const s of STAGES) {
      this.data[s] = [];
      this.lastValue[s] = NaN;
    }
  }
}
