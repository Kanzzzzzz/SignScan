import type { StableState } from './stabilizer';

export function stateText(s: StableState): string {
  if (s.kind === 'letter') return `Letter ${s.letter}`;
  if (s.kind === 'nohand') return 'No hand';
  return 'Unsure';
}

export const fmtMs = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} ms` : '-');
