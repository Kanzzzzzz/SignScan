import { stateText } from '../lib/format';
import type { StableState, Prediction } from '../lib/stabilizer';

export function LetterDisplay({
  state,
  modelReady,
  size = 'xl',
}: {
  state: StableState;
  modelReady: boolean;
  size?: 'xl' | 'lg';
}) {
  const big = size === 'xl' ? 'text-[9rem] sm:text-[11rem]' : 'text-7xl';
  let glyph = '–';
  let caption = 'Show one hand to the camera';
  if (!modelReady) {
    glyph = '·';
    caption = 'Your hand is tracked, but letters aren’t trained yet';
  } else if (state.kind === 'letter') {
    glyph = state.letter;
    caption = `Recognized · ${(state.confidence * 100).toFixed(0)}% confident`;
  } else if (state.kind === 'unsure') {
    glyph = '?';
    caption = state.best
      ? `Unsure: maybe ${state.best.label} (${(state.best.confidence * 100).toFixed(0)}%)`
      : 'Hold the hand shape steady';
  }
  return (
    <div className="flex flex-col items-center">
      <div
        aria-hidden="true"
        className={`font-display leading-none font-bold tracking-tight ${big} ${
          state.kind === 'letter' ? 'text-ink' : 'text-muted/60'
        }`}
      >
        {glyph}
      </div>
      <p aria-live="polite" className="mt-2 text-center text-sm text-muted">
        <span className="sr-only">{modelReady ? stateText(state) + '. ' : ''}</span>
        {caption}
      </p>
    </div>
  );
}

export function ConfidenceBar({ value, label = 'Confidence' }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular font-semibold text-ink">{pct.toFixed(0)}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TopK({ items }: { items: Prediction[] }) {
  if (!items.length) return <p className="text-sm text-muted">No predictions yet.</p>;
  return (
    <ol className="space-y-2" aria-label="Top predictions">
      {items.map((p, i) => (
        <li key={p.label} className="flex items-center gap-3">
          <span className="w-6 font-display text-xl font-bold">{p.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-muted/50'}`}
              style={{ width: `${p.confidence * 100}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs tabular text-muted">
            {(p.confidence * 100).toFixed(0)}%
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-base font-semibold tabular">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
