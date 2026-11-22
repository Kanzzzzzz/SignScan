/** Temporal smoothing (sliding-window majority vote + confidence gate) and hold-to-commit text. */

export interface Prediction {
  label: string;
  confidence: number;
}

export type StableState =
  | { kind: 'nohand' }
  | { kind: 'unsure'; best: Prediction | null }
  | { kind: 'letter'; letter: string; confidence: number };

export interface StabilizerOptions {
  /** Frames in the voting window. */
  window: number;
  /** Per-frame confidence a prediction needs to count as a vote. */
  threshold: number;
  /** Fraction of the window that must agree on one letter. */
  minAgree: number;
}

export const DEFAULT_STABILIZER: StabilizerOptions = { window: 8, threshold: 0.7, minAgree: 0.6 };

export class Stabilizer {
  private buf: (Prediction | null)[] = [];

  constructor(private opts: StabilizerOptions = DEFAULT_STABILIZER) {}

  setOptions(opts: Partial<StabilizerOptions>): void {
    this.opts = { ...this.opts, ...opts };
    if (this.buf.length > this.opts.window) this.buf = this.buf.slice(-this.opts.window);
  }

  reset(): void {
    this.buf = [];
  }

  /** Push the top prediction for one frame (null = no hand). */
  push(pred: Prediction | null): StableState {
    this.buf.push(pred);
    if (this.buf.length > this.opts.window) this.buf.shift();

    const noHand = this.buf.filter((p) => p === null).length;
    if (pred === null && noHand * 2 >= this.buf.length) return { kind: 'nohand' };

    const votes = new Map<string, { n: number; conf: number }>();
    for (const p of this.buf) {
      if (!p || p.confidence < this.opts.threshold) continue;
      const v = votes.get(p.label) ?? { n: 0, conf: 0 };
      v.n += 1;
      v.conf += p.confidence;
      votes.set(p.label, v);
    }
    let best: [string, { n: number; conf: number }] | null = null;
    for (const entry of votes) if (!best || entry[1].n > best[1].n) best = entry;

    const needed = Math.ceil(this.opts.window * this.opts.minAgree);
    if (best && best[1].n >= needed) {
      return { kind: 'letter', letter: best[0], confidence: best[1].conf / best[1].n };
    }
    return { kind: 'unsure', best: pred };
  }
}

export interface ComposerOptions {
  /** How long a stable letter must be held before it is typed. */
  holdMs: number;
  /** How long with no hand before a space is added. */
  spaceMs: number;
}

export const DEFAULT_COMPOSER: ComposerOptions = { holdMs: 800, spaceMs: 1500 };

export interface ComposerUpdate {
  /** Letter currently being held, if any. */
  holding: string | null;
  /** 0..1 progress toward committing `holding`. */
  progress: number;
  /** What was appended on this update ('' if nothing). */
  committed: string;
}

/**
 * Turns a stream of stable states into text. A held letter is typed once; to type the same
 * letter twice, relax the hand (or drop it) between the two. A pause with no hand adds a space.
 */
export class TextComposer {
  text = '';
  private candidate: string | null = null;
  private since = 0;
  private committedCurrent = false;
  private noHandSince: number | null = null;
  private spaceAdded = false;

  constructor(private opts: ComposerOptions = DEFAULT_COMPOSER) {}

  setOptions(opts: Partial<ComposerOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  update(state: StableState, now: number): ComposerUpdate {
    let committed = '';
    if (state.kind === 'nohand') {
      this.candidate = null;
      this.committedCurrent = false;
      if (this.noHandSince === null) this.noHandSince = now;
      if (
        !this.spaceAdded &&
        this.text.length > 0 &&
        !this.text.endsWith(' ') &&
        now - this.noHandSince >= this.opts.spaceMs
      ) {
        this.text += ' ';
        committed = ' ';
        this.spaceAdded = true;
      }
      return { holding: null, progress: 0, committed };
    }
    this.noHandSince = null;
    this.spaceAdded = false;

    if (state.kind === 'unsure') {
      this.candidate = null;
      this.committedCurrent = false;
      return { holding: null, progress: 0, committed };
    }

    if (state.letter !== this.candidate) {
      this.candidate = state.letter;
      this.since = now;
      this.committedCurrent = false;
    }
    const held = now - this.since;
    if (!this.committedCurrent && held >= this.opts.holdMs) {
      this.text += state.letter;
      committed = state.letter;
      this.committedCurrent = true;
    }
    return {
      holding: this.candidate,
      progress: this.committedCurrent ? 1 : Math.min(1, held / this.opts.holdMs),
      committed,
    };
  }

  addSpace(): void {
    if (this.text.length && !this.text.endsWith(' ')) this.text += ' ';
  }

  backspace(): void {
    this.text = this.text.slice(0, -1);
  }

  clear(): void {
    this.text = '';
    this.candidate = null;
    this.committedCurrent = false;
  }
}
