/** Settings and practice progress, stored on this device only. */

import { DEFAULT_COMPOSER, DEFAULT_STABILIZER } from './stabilizer';

export interface Settings {
  threshold: number;
  window: number;
  minAgree: number;
  holdMs: number;
  spaceMs: number;
  showLandmarks: boolean;
  showTop3: boolean;
  showDebug: boolean;
  speak: boolean;
  deviceId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: DEFAULT_STABILIZER.threshold,
  window: DEFAULT_STABILIZER.window,
  minAgree: DEFAULT_STABILIZER.minAgree,
  holdMs: DEFAULT_COMPOSER.holdMs,
  spaceMs: DEFAULT_COMPOSER.spaceMs,
  showLandmarks: true,
  showTop3: true,
  showDebug: false,
  speak: false,
  deviceId: '',
};

const SETTINGS_KEY = 'signscan.settings.v1';
const PROGRESS_KEY = 'signscan.progress.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota): settings just won't persist */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export interface LetterProgress {
  attempts: number;
  successes: number;
  totalTimeMs: number; // summed time-to-correct over successes
  lastPracticed: number;
}

export type Progress = Record<string, LetterProgress>;

export function loadProgress(): Progress {
  return read<Progress>(PROGRESS_KEY) ?? {};
}

export function saveProgress(p: Progress): void {
  write(PROGRESS_KEY, p);
}

export function recordAttempt(
  p: Progress,
  letter: string,
  success: boolean,
  timeMs: number,
  now = Date.now(),
): Progress {
  const cur = p[letter] ?? { attempts: 0, successes: 0, totalTimeMs: 0, lastPracticed: 0 };
  return {
    ...p,
    [letter]: {
      attempts: cur.attempts + 1,
      successes: cur.successes + (success ? 1 : 0),
      totalTimeMs: cur.totalTimeMs + (success ? timeMs : 0),
      lastPracticed: now,
    },
  };
}

/** Letters ordered weakest first: lowest success rate, then slowest, then least practiced. */
export function weakestFirst(letters: readonly string[], p: Progress): string[] {
  const score = (l: string) => {
    const s = p[l];
    if (!s || s.attempts === 0) return { rate: -1, time: 0 }; // never tried: first
    return {
      rate: s.successes / s.attempts,
      time: s.successes ? s.totalTimeMs / s.successes : 1e9,
    };
  };
  return [...letters].sort((a, b) => {
    const sa = score(a),
      sb = score(b);
    return sa.rate - sb.rate || sb.time - sa.time;
  });
}
