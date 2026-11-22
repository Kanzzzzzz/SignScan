import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from '../components/CameraView';
import { TrainPanel, type TrainPanelHandle } from '../components/TrainPanel';
import { useEngineState, useFrameListener } from '../hooks/useEngine';
import {
  addBurst,
  clearBursts,
  deleteBurst,
  listBursts,
  newId,
  type Burst,
  type Conditions,
  type Sample,
} from '../lib/collectStore';
import { downloadText, timestampForFile, toJsonl } from '../lib/csv';
import { FEATURE_VERSION } from '../lib/features';
import { LABELS } from '../lib/labels';

const SAMPLE_HZ = 10;
const BURST_SECONDS = 5;
const COUNTDOWN_S = 3;
const MIN_SCORE = 0.7;

const CONDITION_OPTIONS: Record<keyof Conditions, string[]> = {
  lighting: ['normal', 'bright', 'dim', 'backlit'],
  background: ['plain', 'cluttered'],
  distance: ['near', 'far'],
  orientation: ['frontal', 'yaw', 'roll'],
};

type Phase = { kind: 'idle' } | { kind: 'countdown'; n: number } | { kind: 'recording' };

const META_KEY = 'signscan.collect.meta.v1';
function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function CollectPage() {
  const st = useEngineState();
  const saved = useMemo(loadMeta, []);
  const [signer, setSigner] = useState<string>(saved.signer ?? '');
  const [session, setSession] = useState<string>(saved.session ?? 's1');
  const [cond, setCond] = useState<Conditions>(
    saved.cond ?? {
      lighting: 'normal',
      background: 'plain',
      distance: 'near',
      orientation: 'frontal',
    },
  );
  const [letter, setLetter] = useState<string>(LABELS[0]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [captured, setCaptured] = useState(0);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const rec = useRef<{ samples: Sample[]; lastAt: number; endAt: number; burstId: string } | null>(
    null,
  );
  const trainer = useRef<TrainPanelHandle>(null);

  const refresh = useCallback(async () => {
    try {
      setBursts(await listBursts());
    } catch (e) {
      setStoreError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ signer, session, cond }));
    } catch {
      /* ignore */
    }
  }, [signer, session, cond]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bursts) {
      if (b.signer_id !== signer.trim()) continue;
      c[b.label] = (c[b.label] ?? 0) + b.samples.length;
    }
    return c;
  }, [bursts, signer]);

  const validSigner = /^[A-Za-z0-9_-]{1,32}$/.test(signer.trim());
  const canRecord = st.camera === 'running' && validSigner && phase.kind === 'idle';

  const finishBurst = useCallback(async () => {
    const r = rec.current;
    rec.current = null;
    setPhase({ kind: 'idle' });
    if (!r || r.samples.length === 0) {
      setMessage('Nothing was recorded: no hand was detected. Check the lighting and try again.');
      return;
    }
    const b: Burst = {
      id: r.burstId,
      label: r.samples[0].label,
      signer_id: r.samples[0].signer_id,
      session: r.samples[0].session,
      conditions: r.samples[0].conditions,
      createdAt: Date.now(),
      samples: r.samples,
    };
    try {
      await addBurst(b);
      setMessage(`Saved ${b.samples.length} samples of ${b.label}.`);
      await refresh();
      trainer.current?.onNewRecording();
    } catch (e) {
      setStoreError((e as Error).message);
    }
  }, [refresh]);

  const record = () => {
    if (!canRecord) return;
    setMessage('');
    let n = COUNTDOWN_S;
    setPhase({ kind: 'countdown', n });
    const id = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setPhase({ kind: 'countdown', n });
        return;
      }
      clearInterval(id);
      const now = performance.now();
      rec.current = {
        samples: [],
        lastAt: 0,
        endAt: now + BURST_SECONDS * 1000,
        burstId: `${signer.trim()}-${letter}-${newId().slice(0, 8)}`,
      };
      setCaptured(0);
      setPhase({ kind: 'recording' });
    }, 1000);
  };

  useFrameListener((f) => {
    const r = rec.current;
    if (!r) return;
    if (f.t >= r.endAt) {
      finishBurst();
      return;
    }
    if (!f.hand || f.hand.score < MIN_SCORE) return;
    if (f.t - r.lastAt < 1000 / SAMPLE_HZ) return;
    r.lastAt = f.t;
    r.samples.push({
      label: letter,
      signer_id: signer.trim(),
      session: session.trim() || 's1',
      burst_id: r.burstId,
      conditions: { ...cond },
      landmarks: f.hand.landmarks.map(
        (p) => p.map((v) => +v.toFixed(6)) as [number, number, number],
      ),
      handedness: f.hand.handedness,
      handedness_score: +f.hand.score.toFixed(4),
      image_width: f.width,
      image_height: f.height,
      ts: Date.now(),
      feature_version: FEATURE_VERSION,
    });
    setCaptured(r.samples.length);
  });

  const exportJsonl = (onlySigner: boolean) => {
    const selected = onlySigner ? bursts.filter((b) => b.signer_id === signer.trim()) : bursts;
    const samples = selected.flatMap((b) => b.samples);
    if (!samples.length) return;
    const who = onlySigner ? signer.trim() : 'all';
    downloadText(
      `signscan-${who}-${timestampForFile()}.jsonl`,
      toJsonl(samples),
      'application/x-ndjson',
    );
  };

  const totalForSigner = Object.values(counts).reduce((a, b) => a + b, 0);
  const target = SAMPLE_HZ * BURST_SECONDS * 4; // ~4 bursts per letter per signer

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <CameraView />
          {phase.kind !== 'idle' && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl ring-4 ring-danger ring-inset"
              aria-hidden="true"
            >
              <div className="rounded-2xl bg-black/65 px-6 py-4 text-center text-white">
                {phase.kind === 'countdown' ? (
                  <div className="font-display text-7xl font-bold">{phase.n}</div>
                ) : (
                  <>
                    <div className="text-sm font-semibold tracking-wide uppercase">
                      ● Recording {letter}
                    </div>
                    <div className="font-mono text-3xl tabular">{captured}</div>
                    <div className="text-xs opacity-80">
                      Vary the angle slightly, move closer and farther
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
          {phase.kind === 'countdown'
            ? `Get ready to sign ${letter}…`
            : phase.kind === 'recording'
              ? `Recording ${letter}: ${captured} samples`
              : message}
        </p>
        {storeError && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {storeError}
          </p>
        )}

        <section aria-labelledby="letters-h" className="card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="letters-h" className="eyebrow">
              Letter, with samples so far for {validSigner ? signer.trim() : 'this signer'}
            </h2>
            <span className="text-xs text-muted tabular">{totalForSigner} total</span>
          </div>
          <div
            className="grid grid-cols-6 gap-1.5 sm:grid-cols-8"
            role="radiogroup"
            aria-label="Letter to record"
          >
            {LABELS.map((l) => {
              const n = counts[l] ?? 0;
              const done = n >= target;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={letter === l}
                  onClick={() => setLetter(l)}
                  disabled={phase.kind !== 'idle'}
                  className={`rounded-lg border p-1.5 text-center transition-colors ${
                    letter === l ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'
                  }`}
                >
                  <div className="font-display text-xl font-bold">{l}</div>
                  <div
                    className={`text-[11px] tabular ${done ? 'font-semibold text-ok' : 'text-muted'}`}
                  >
                    {n}
                    {done ? ' ✓' : ''}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            A ✓ means at least {target} samples (about 4 bursts) for that letter.
          </p>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section aria-labelledby="who-h" className="card p-4">
          <h2 id="who-h" className="eyebrow mb-3">
            Session
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="signer">
                Signer code
              </label>
              <input
                id="signer"
                className="field"
                placeholder="e.g. S01"
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                aria-invalid={signer !== '' && !validSigner}
                aria-describedby="signer-help"
              />
            </div>
            <div>
              <label className="label" htmlFor="session">
                Session
              </label>
              <input
                id="session"
                className="field"
                value={session}
                onChange={(e) => setSession(e.target.value)}
              />
            </div>
          </div>
          <p id="signer-help" className="mt-1 text-xs text-muted">
            Use an anonymous code, never a name. Letters, numbers, - and _ only.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(Object.keys(CONDITION_OPTIONS) as (keyof Conditions)[]).map((k) => (
              <div key={k}>
                <label className="label capitalize" htmlFor={`c-${k}`}>
                  {k}
                </label>
                <select
                  id={`c-${k}`}
                  className="field"
                  value={cond[k]}
                  onChange={(e) => setCond((c) => ({ ...c, [k]: e.target.value }))}
                >
                  {CONDITION_OPTIONS[k].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary mt-4 w-full text-base"
            onClick={record}
            disabled={!canRecord}
          >
            {phase.kind === 'idle' ? `Record ${letter} (${BURST_SECONDS} s)` : 'Recording…'}
          </button>
          {!canRecord && phase.kind === 'idle' && (
            <p className="mt-2 text-xs text-muted">
              {st.camera !== 'running' ? 'Start the camera first. ' : ''}
              {!validSigner ? 'Enter a signer code.' : ''}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Records {SAMPLE_HZ} samples a second, only while a hand is detected with score ≥{' '}
            {MIN_SCORE}. Only the 21 landmark points are kept. No images or video.
          </p>
        </section>

        <TrainPanel ref={trainer} bursts={bursts} />

        <section aria-labelledby="bursts-h" className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="bursts-h" className="eyebrow">
              Recorded bursts
            </h2>
            <span className="text-xs text-muted">{bursts.length} on this device</span>
          </div>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {bursts.length === 0 && (
              <li className="py-3 text-sm text-muted">Nothing recorded yet.</li>
            )}
            {bursts.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="w-7 font-display text-xl font-bold">{b.label}</span>
                <span className="flex-1 text-xs text-muted">
                  {b.signer_id} · {b.session} · {b.samples.length} samples · {b.conditions.lighting}
                  , {b.conditions.background}, {b.conditions.distance}
                  <br />
                  {new Date(b.createdAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="btn min-h-9 px-3 text-xs"
                  aria-label={`Delete burst ${b.label} from ${new Date(b.createdAt).toLocaleTimeString()}`}
                  onClick={async () => {
                    await deleteBurst(b.id);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => exportJsonl(true)}
              disabled={!totalForSigner}
            >
              Export this signer (JSONL)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => exportJsonl(false)}
              disabled={!bursts.length}
            >
              Export all
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!bursts.length}
              onClick={async () => {
                if (
                  confirm(
                    'Delete ALL recorded bursts on this device? Export first if you need them.',
                  )
                ) {
                  await clearBursts();
                  refresh();
                }
              }}
            >
              Delete all
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Exporting is optional: use it to back up recordings or to combine data from several
            computers in <code>data/raw/</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
