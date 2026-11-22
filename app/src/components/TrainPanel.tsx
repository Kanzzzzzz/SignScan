import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEngine } from '../hooks/useEngine';
import { listBursts, type Burst } from '../lib/collectStore';
import { toJsonl } from '../lib/csv';
import { LABELS } from '../lib/labels';
import {
  cancelTraining,
  getTrainerStatus,
  startTraining,
  trainerSupported,
  type TrainerStatus,
} from '../lib/trainer';

const AUTO_KEY = 'signscan.autotrain.v1';
const MIN_LETTERS = 2;

export interface TrainPanelHandle {
  /** Called after each saved recording; trains if auto-train is on. */
  onNewRecording: () => void;
}

const pct = (v?: number) => (v === undefined ? '-' : `${Math.round(v * 100)}%`);

export const TrainPanel = forwardRef<TrainPanelHandle, { bursts: Burst[] }>(function TrainPanel(
  { bursts },
  ref,
) {
  const engine = useEngine();
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [elapsed, setElapsed] = useState(0);
  const pending = useRef(false); // a recording arrived while training: retrain afterwards
  const lastLoadedRun = useRef(0);

  const letters = new Set(bursts.map((b) => b.label));
  const samples = bursts.reduce((a, b) => a + b.samples.length, 0);
  const signers = new Set(bursts.map((b) => b.signer_id));
  const missing = LABELS.filter((l) => !letters.has(l));
  const enoughData = letters.size >= MIN_LETTERS;

  const refresh = useCallback(async () => {
    const s = await getTrainerStatus();
    setStatus(s);
    setChecked(true);
    return s;
  }, []);

  // When a run has finished successfully, load its model into the app (once per run).
  const loadIfFinished = useCallback(
    async (s: TrainerStatus | null) => {
      if (!s || s.running || !s.result || s.error || s.runId === lastLoadedRun.current) return;
      lastLoadedRun.current = s.runId;
      await engine.loadModel();
    },
    [engine],
  );

  const train = useCallback(async () => {
    setStartError(null);
    try {
      // Read from IndexedDB, not props, so a burst saved a moment ago is always included.
      const all = (await listBursts()).flatMap((b) => b.samples);
      if (new Set(all.map((s) => s.label)).size < MIN_LETTERS) return;
      await startTraining(toJsonl(all));
      await loadIfFinished(await refresh());
    } catch (e) {
      setStartError((e as Error).message);
    }
  }, [refresh, loadIfFinished]);

  useEffect(() => {
    // On page load, remember the last finished run so it isn't reloaded needlessly.
    refresh().then((s) => {
      if (s && !s.running) lastLoadedRun.current = s.runId;
    });
  }, [refresh]);

  // Poll while training; when it finishes, load the new model and handle queued retrains.
  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(async () => {
      const s = await refresh();
      if (s && !s.running) {
        await loadIfFinished(s);
        if (pending.current) {
          pending.current = false;
          train();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status?.running, refresh, loadIfFinished, train]);

  useEffect(() => {
    if (!status?.running || !status.startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - (status.startedAt ?? Date.now())), 500);
    return () => clearInterval(id);
  }, [status?.running, status?.startedAt]);

  useImperativeHandle(ref, () => ({
    onNewRecording: () => {
      if (!auto || !status?.available) return;
      if (status.running) pending.current = true;
      else train();
    },
  }));

  const toggleAuto = (v: boolean) => {
    setAuto(v);
    try {
      localStorage.setItem(AUTO_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // Production build or dev server without the plugin: explain the manual route.
  if (!trainerSupported || (checked && !status)) {
    return (
      <section aria-labelledby="train-h" className="card p-4">
        <h2 id="train-h" className="eyebrow mb-2">
          Train the model
        </h2>
        <p className="text-sm text-muted">
          One-click training works when the app runs with <code>npm run dev</code> on your computer.
          Otherwise, export the JSONL into <code>data/raw/</code> and run{' '}
          <code>python ml/scripts/pipeline.py</code>.
        </p>
      </section>
    );
  }

  const result = status?.result;
  const running = !!status?.running;

  return (
    <section aria-labelledby="train-h" className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="train-h" className="eyebrow">
          Train the model
        </h2>
        <span className="text-xs text-muted tabular">
          {letters.size}/{LABELS.length} letters · {samples} samples · {signers.size} signer
          {signers.size === 1 ? '' : 's'}
        </span>
      </div>

      {status && !status.python && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          Python environment not found. Set it up once: <code>cd ml</code>, then{' '}
          <code>python -m venv .venv</code> and{' '}
          <code>.venv/Scripts/python -m pip install -e &quot;.[dev]&quot;</code>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <button type="button" className="btn btn-danger" onClick={() => cancelTraining()}>
            Cancel training
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!enoughData || !status?.python}
            onClick={train}
          >
            {result ? 'Retrain model' : 'Train model'}
          </button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={auto}
            onChange={(e) => toggleAuto(e.target.checked)}
          />
          Auto-train after each recording
        </label>
      </div>

      {!enoughData && (
        <p className="mt-2 text-xs text-muted">
          Record at least {MIN_LETTERS} different letters to train. The more letters and the more
          people, the better.
        </p>
      )}

      <div aria-live="polite" className="mt-3 text-sm">
        {running && (
          <p>
            <span className="font-semibold">Training… </span>
            {status?.step} · {Math.round(elapsed / 1000)} s
          </p>
        )}
        {!running && status?.error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-danger">
            {status.error}
          </p>
        )}
        {startError && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-danger">
            {startError}
          </p>
        )}
        {!running && result && !status?.error && (
          <div className="rounded-lg bg-ok-soft p-3">
            <p className="font-semibold text-ok">✓ Model trained and loaded</p>
            <p className="mt-1">
              {result.letters_trained.length} letters from {result.samples} samples.
              {result.val?.n ? ` Validation accuracy ${pct(result.val.accuracy)}.` : ''}
              {result.test?.n
                ? ` Accuracy on unseen signers ${pct(result.test.accuracy)}.`
                : ' Record 3+ different people to measure accuracy on unseen signers.'}
            </p>
            <p className="mt-1">
              Try it on{' '}
              <a className="font-semibold underline" href="#/recognize">
                Recognize
              </a>
              .
            </p>
          </div>
        )}
      </div>

      {missing.length > 0 && enoughData && (
        <p className="mt-2 text-xs text-muted">
          Not recorded yet (won&apos;t be recognized): {missing.join(' ')}
        </p>
      )}

      {status && status.log.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">Training log</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-[11px] whitespace-pre-wrap">
            {status.log.slice(-40).join('\n')}
          </pre>
        </details>
      )}
    </section>
  );
});
