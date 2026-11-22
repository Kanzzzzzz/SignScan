import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from '../components/CameraView';
import { ModelNotice } from '../components/ModelNotice';
import { ReferenceControls, ReferencePhoto } from '../components/ReferencePhoto';
import { useEngine, useEngineState, useFrameListener, useSettings } from '../hooks/useEngine';
import { referenceImageUrl } from '../lib/assets';
import { hasReference, storeReference } from '../lib/references';
import { downloadText, timestampForFile, toCsv } from '../lib/csv';
import { hintFor } from '../lib/hints';
import { LABELS } from '../lib/labels';
import {
  loadProgress,
  recordAttempt,
  saveProgress,
  weakestFirst,
  type Progress,
} from '../lib/storage';

type Mode = 'order' | 'random' | 'word' | 'weak';
const MODES: { id: Mode; label: string; help: string }[] = [
  { id: 'order', label: 'In order', help: 'Every letter, A to Y' },
  { id: 'random', label: 'Random', help: 'Every letter, shuffled' },
  { id: 'word', label: 'Spell a word', help: 'Common Filipino words and names' },
  { id: 'weak', label: 'Weak letters', help: 'Your 8 most-missed letters' },
];

// Words using static letters only (no J/Z). Filtered again against the model's labels.
const WORDS = [
  'MAHAL', 'SALAMAT', 'BAHAY', 'KAIBIGAN', 'TUBIG', 'ARAW', 'GABI', 'PUSO', 'ISDA', 'BIGAS',
  'LOLA', 'LOLO', 'KUYA', 'ATE', 'PAMILYA', 'MABUHAY', 'PILIPINAS', 'MARIA', 'ANA', 'PEDRO',
  'ROSA', 'CARLO', 'BUKAS', 'ULAN', 'SAYA',
]; // prettier-ignore

const HOLD_TO_PASS_MS = 1000;
const HINT_AFTER_MS = 6000;

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const AUTO_REF_KEY = 'signscan.autoref.v1';

function loadAutoRef(): boolean {
  try {
    return localStorage.getItem(AUTO_REF_KEY) !== '0'; // on unless turned off
  } catch {
    return true;
  }
}

function ReferenceGallery({ letters }: { letters: string[] }) {
  const [selected, setSelected] = useState(letters[0]);
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold">FSL reference photos</summary>
      <p className="mt-2 text-xs text-muted">
        Hand shapes from the approved FSL alphabet chart. Letters without a chart image can get your
        own photo: select it, sign it and press <strong>Take photo</strong>.
      </p>
      <div
        className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8"
        role="radiogroup"
        aria-label="Letter"
      >
        {letters.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={selected === l}
            onClick={() => setSelected(l)}
            className={`rounded-lg border p-1 text-center ${
              selected === l ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'
            }`}
          >
            <ReferencePhoto letter={l} size="sm" />
            <div className="mt-0.5 font-display text-sm font-bold">{l}</div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-3 flex items-start gap-3">
          <div className="w-28 shrink-0">
            <ReferencePhoto letter={selected} />
          </div>
          <div>
            <div className="font-display text-3xl font-bold">{selected}</div>
            <ReferenceControls letter={selected} />
          </div>
        </div>
      )}
    </details>
  );
}

export function PracticePage() {
  const st = useEngineState();
  const engine = useEngine();
  const { settings } = useSettings();
  const [autoRef, setAutoRef] = useState(loadAutoRef);
  const labels = useMemo(
    () => (st.labels.length ? LABELS.filter((l) => st.labels.includes(l)) : [...LABELS]),
    [st.labels],
  );
  const [mode, setMode] = useState<Mode>('order');
  const [queue, setQueue] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'active' | 'success' | 'done'>('idle');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [seen, setSeen] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [holdPct, setHoldPct] = useState(0);
  const [roundResults, setRoundResults] = useState<{ letter: string; ok: boolean; ms: number }[]>(
    [],
  );
  const startedAt = useRef(0);
  const holdStart = useRef<number | null>(null);
  // Frames keep arriving before React re-renders; make sure each letter is scored once.
  const scored = useRef(false);

  const target = phase !== 'idle' && phase !== 'done' ? queue[index] : undefined;
  const ready = st.model === 'ready';

  useEffect(() => saveProgress(progress), [progress]);

  useEffect(() => {
    if (phase !== 'active') return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [phase, index]);

  const begin = (m: Mode = mode) => {
    let q: string[];
    let w = '';
    if (m === 'order') q = labels;
    else if (m === 'random') q = shuffle(labels);
    else if (m === 'weak') q = weakestFirst(labels, progress).slice(0, 8);
    else {
      const ok = WORDS.filter((x) => [...x].every((c) => labels.includes(c)));
      w = ok[Math.floor(Math.random() * ok.length)] ?? '';
      q = [...w];
    }
    setMode(m);
    setWord(w);
    setQueue(q);
    setRoundResults([]);
    goTo(0, q.length);
  };

  const goTo = (i: number, len = queue.length) => {
    if (i >= len) {
      setPhase('done');
      return;
    }
    setIndex(i);
    setPhase('active');
    setSeen(null);
    setElapsed(0);
    setHoldPct(0);
    holdStart.current = null;
    scored.current = false;
    startedAt.current = performance.now();
  };

  const finish = (ok: boolean) => {
    if (!target || scored.current) return;
    scored.current = true;
    const ms = performance.now() - startedAt.current;
    setProgress((p) => recordAttempt(p, target, ok, ms));
    setRoundResults((r) => [...r, { letter: target, ok, ms }]);
    if (ok) {
      // First correct sign of a letter with no photo yet: keep it as the reference photo.
      if (autoRef) {
        const letter = target;
        hasReference(letter, referenceImageUrl(letter)).then(async (has) => {
          if (has) return;
          const blob = await engine.snapshotHand();
          if (blob) await storeReference(letter, blob, 'camera');
        });
      }
      setPhase('success');
      setTimeout(() => goTo(index + 1), 1100);
    } else {
      goTo(index + 1);
    }
  };

  useFrameListener((f) => {
    if (phase !== 'active' || !target || !ready) return;
    const s = f.stable;
    if (s.kind === 'letter' && s.letter === target && s.confidence >= settings.threshold) {
      holdStart.current ??= f.t;
      const pct = Math.min(1, (f.t - holdStart.current) / HOLD_TO_PASS_MS);
      setHoldPct((p) => (Math.abs(p - pct) > 0.05 || pct === 1 ? pct : p));
      if (pct >= 1) finish(true);
    } else {
      holdStart.current = null;
      setHoldPct((p) => (p === 0 ? p : 0));
      if (s.kind === 'letter' && s.letter !== target)
        setSeen((x) => (x === s.letter ? x : s.letter));
    }
  });

  const exportCsv = () => {
    const rows = labels.map((l) => {
      const p = progress[l];
      return {
        letter: l,
        attempts: p?.attempts ?? 0,
        successes: p?.successes ?? 0,
        success_rate: p?.attempts ? +(p.successes / p.attempts).toFixed(3) : '',
        avg_time_to_correct_s: p?.successes ? +(p.totalTimeMs / p.successes / 1000).toFixed(2) : '',
        last_practiced: p?.lastPracticed ? new Date(p.lastPracticed).toISOString() : '',
      };
    });
    downloadText(`signscan-progress-${timestampForFile()}.csv`, toCsv(rows), 'text/csv');
  };

  const stuck = phase === 'active' && elapsed > HINT_AFTER_MS;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <CameraView />
        {!ready && <ModelNotice />}
      </div>

      <div className="flex flex-col gap-4">
        <fieldset className="card p-4">
          <legend className="sr-only">Practice mode</legend>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => begin(m.id)}
                disabled={!ready}
                className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                  mode === m.id && phase !== 'idle'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:bg-surface-2'
                }`}
              >
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-xs text-muted">{m.help}</div>
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              checked={autoRef}
              onChange={(e) => {
                setAutoRef(e.target.checked);
                try {
                  localStorage.setItem(AUTO_REF_KEY, e.target.checked ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
            />
            <span>
              Save my own photo for letters that have no chart image
              <span className="block text-xs text-muted">
                Taken the first time you sign the letter correctly. Only the hand area is saved, on
                this computer.
              </span>
            </span>
          </label>
        </fieldset>

        {phase === 'idle' && (
          <div className="card p-6 text-center">
            <p className="text-muted">
              Pick a mode to start. Form the letter shown and hold it steady for one second.
            </p>
          </div>
        )}

        {target && (
          <section aria-labelledby="target-h" className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 id="target-h" className="eyebrow">
                {mode === 'word' ? `Spell “${word}”` : 'Make this letter'}
              </h2>
              <span className="text-xs text-muted tabular">
                {index + 1} / {queue.length}
              </span>
            </div>
            {mode === 'word' && (
              <p className="mt-2 font-display text-2xl tracking-[0.3em]" aria-hidden="true">
                {[...word].map((c, i) => (
                  <span
                    key={i}
                    className={i < index ? 'text-ok' : i === index ? 'text-ink' : 'text-muted/50'}
                  >
                    {c}
                  </span>
                ))}
              </p>
            )}
            <div className="mt-3 grid grid-cols-[1fr_1fr] items-center gap-4">
              <div className="text-center">
                <div className="font-display text-[8rem] leading-none font-bold">{target}</div>
                <div className="mx-auto mt-3 h-2 w-3/4 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-ok" style={{ width: `${holdPct * 100}%` }} />
                </div>
              </div>
              <div>
                <ReferencePhoto letter={target} />
                <div className="mt-2">
                  <ReferenceControls letter={target} />
                </div>
              </div>
            </div>
            <div aria-live="assertive" className="mt-4 min-h-12">
              {phase === 'success' ? (
                <p className="rounded-lg bg-ok-soft p-3 font-semibold text-ok">
                  ✓ Correct! {target} in {((roundResults.at(-1)?.ms ?? 0) / 1000).toFixed(1)} s
                </p>
              ) : stuck ? (
                <p className="rounded-lg bg-warn-soft p-3 text-sm">
                  <span className="font-semibold">Hint: </span>
                  {seen
                    ? hintFor(target, seen)
                    : 'Make sure your whole hand is in view and well lit, then compare with the reference.'}
                </p>
              ) : holdPct > 0 ? (
                <p className="text-sm text-ok">Good, keep holding…</p>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn" onClick={() => finish(false)}>
                Skip
              </button>
              <button type="button" className="btn" onClick={() => setPhase('idle')}>
                Stop
              </button>
            </div>
          </section>
        )}

        {phase === 'done' && (
          <section className="card p-5" aria-live="polite">
            <h2 className="text-lg font-semibold">Round complete</h2>
            <p className="mt-1 text-muted">
              {roundResults.filter((r) => r.ok).length} of {roundResults.length} correct
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {roundResults.map((r, i) => (
                <li
                  key={i}
                  className={`rounded-lg px-2 py-1 font-mono text-sm ${r.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
                >
                  {r.letter} {r.ok ? `✓ ${(r.ms / 1000).toFixed(1)}s` : '✗ skipped'}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary mt-4" onClick={() => begin()}>
              Go again
            </button>
          </section>
        )}

        <ReferenceGallery letters={[...LABELS]} />

        <ProgressTable
          labels={labels}
          progress={progress}
          onExport={exportCsv}
          onReset={() => {
            if (confirm('Delete all practice progress stored on this device?')) setProgress({});
          }}
        />
      </div>
    </div>
  );
}

function ProgressTable({
  labels,
  progress,
  onExport,
  onReset,
}: {
  labels: string[];
  progress: Progress;
  onExport: () => void;
  onReset: () => void;
}) {
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold">Your progress per letter</summary>
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {labels.map((l) => {
          const p = progress[l];
          const rate = p?.attempts ? p.successes / p.attempts : null;
          return (
            <div
              key={l}
              className="rounded-lg bg-surface-2 p-2 text-center"
              title={p ? `${p.successes}/${p.attempts} correct` : 'Not practiced yet'}
            >
              <div className="font-display text-lg font-bold">{l}</div>
              <div className="text-[11px] text-muted tabular">
                {rate === null ? '-' : `${Math.round(rate * 100)}%`}
                {p?.successes ? ` · ${(p.totalTimeMs / p.successes / 1000).toFixed(1)}s` : ''}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Success rate · average time to correct.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onExport}>
          Export CSV for teacher
        </button>
        <button type="button" className="btn btn-danger" onClick={onReset}>
          Reset progress
        </button>
      </div>
    </details>
  );
}
