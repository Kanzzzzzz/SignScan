import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from '../components/CameraView';
import { ModelNotice } from '../components/ModelNotice';
import { Stat } from '../components/Readouts';
import { fmtMs } from '../lib/format';
import { useEngine, useEngineState, useFrameListener } from '../hooks/useEngine';
import type { Conditions } from '../lib/collectStore';
import { downloadText, timestampForFile, toCsv, type Row } from '../lib/csv';
import { STAGES, type Stage, type StageSummary } from '../lib/metrics';

const COND_OPTIONS: Record<keyof Conditions, string[]> = {
  lighting: ['normal', 'bright', 'dim', 'backlit'],
  background: ['plain', 'cluttered'],
  distance: ['near', 'far'],
  orientation: ['frontal', 'yaw', 'roll'],
};

const STAGE_LABEL: Record<Stage, string> = {
  detect: 'Hand detection',
  feature: 'Feature extraction',
  infer: 'Classification',
  total: 'Total per frame',
};

interface LetterResult {
  letter: string;
  frames: number;
  handFrames: number;
  correct: number;
  stableCorrect: number;
  timeToStableMs: number | null;
}

type Phase =
  { kind: 'idle' } | { kind: 'countdown'; n: number } | { kind: 'capture' } | { kind: 'done' };

function LivePerformance() {
  const engine = useEngine();
  const st = useEngineState();
  const [sum, setSum] = useState<Record<Stage, StageSummary>>(engine.timer.summary());
  const [fps, setFps] = useState(0);
  useFrameListener((f) => setFps((x) => (Math.abs(x - f.fps) > 0.5 ? f.fps : x)));
  useEffect(() => {
    const id = setInterval(() => setSum(engine.timer.summary()), 500);
    return () => clearInterval(id);
  }, [engine]);

  const exportSummary = () => {
    const rows: Row[] = STAGES.map((s) => ({
      stage: s,
      mean_ms: +sum[s].mean.toFixed(3),
      p95_ms: +sum[s].p95.toFixed(3),
      n: sum[s].n,
    }));
    rows.push({ stage: 'fps', mean_ms: +fps.toFixed(2) });
    rows.push({ stage: 'device', mean_ms: null, n: navigator.hardwareConcurrency });
    const meta = `# delegate=${st.delegate} ua="${navigator.userAgent}"\n`;
    downloadText(`signscan-latency-${timestampForFile()}.csv`, meta + toCsv(rows), 'text/csv');
  };

  return (
    <section aria-labelledby="perf-h" className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="perf-h" className="eyebrow">
          Processing speed (last 600 frames)
        </h2>
        <span className="text-xs text-muted">targets: ≥ 20 FPS, ≤ 50 ms per frame</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="FPS"
          value={fps.toFixed(1)}
          hint={fps >= 20 ? 'meets target' : 'below target'}
        />
        {STAGES.map((s) => (
          <Stat
            key={s}
            label={STAGE_LABEL[s]}
            value={fmtMs(sum[s].mean)}
            hint={`p95 ${fmtMs(sum[s].p95)} · n=${sum[s].n}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {st.delegate ? `MediaPipe on ${st.delegate}. ` : ''}
        {navigator.hardwareConcurrency} CPU threads. Record the laptop model, browser and camera
        resolution with your results.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn" onClick={() => engine.timer.reset()}>
          Reset
        </button>
        <button type="button" className="btn" onClick={exportSummary}>
          Export CSV
        </button>
      </div>
    </section>
  );
}

export function EvaluatePage() {
  const st = useEngineState();
  const labels = st.labels;
  const [signer, setSigner] = useState('');
  const [cond, setCond] = useState<Conditions>({
    lighting: 'normal',
    background: 'plain',
    distance: 'near',
    orientation: 'frontal',
  });
  const [framesPerLetter, setFramesPerLetter] = useState(30);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<LetterResult[]>([]);
  const [captured, setCaptured] = useState(0);
  const rows = useRef<Row[]>([]);
  const cur = useRef<{ start: number; frames: number; res: LetterResult } | null>(null);
  const sessionId = useRef('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => clearInterval(timer.current ?? undefined), []);

  const ready = st.model === 'ready' && st.camera === 'running';
  const letter = labels[idx];

  const countdownThen = (i: number) => {
    if (i >= labels.length) {
      setPhase({ kind: 'done' });
      return;
    }
    setIdx(i);
    let n = 3;
    setPhase({ kind: 'countdown', n });
    clearInterval(timer.current ?? undefined);
    timer.current = setInterval(() => {
      n -= 1;
      if (n > 0) return setPhase({ kind: 'countdown', n });
      clearInterval(timer.current ?? undefined);
      cur.current = {
        start: performance.now(),
        frames: 0,
        res: {
          letter: labels[i],
          frames: 0,
          handFrames: 0,
          correct: 0,
          stableCorrect: 0,
          timeToStableMs: null,
        },
      };
      setCaptured(0);
      setPhase({ kind: 'capture' });
    }, 1000);
  };

  const start = () => {
    rows.current = [];
    sessionId.current = timestampForFile();
    setResults([]);
    countdownThen(0);
  };

  const endLetter = (i: number) => {
    const c = cur.current;
    cur.current = null;
    if (c) setResults((r) => [...r, c.res]);
    countdownThen(i + 1);
  };

  useFrameListener((f) => {
    const c = cur.current;
    if (!c || phase.kind !== 'capture') return;
    const target = c.res.letter;
    const pred = f.top[0];
    const stable = f.stable.kind === 'letter' ? f.stable.letter : '';
    c.res.frames += 1;
    if (f.hand) c.res.handFrames += 1;
    if (pred?.label === target && f.hand) c.res.correct += 1;
    if (stable === target) {
      c.res.stableCorrect += 1;
      c.res.timeToStableMs ??= f.t - c.start;
    }
    rows.current.push({
      session_id: sessionId.current,
      signer_id: signer.trim(),
      target,
      frame: c.res.frames,
      hand_detected: !!f.hand,
      handedness: f.hand?.handedness ?? '',
      hand_score: f.hand ? +f.hand.score.toFixed(4) : '',
      predicted: f.hand ? (pred?.label ?? '') : '',
      confidence: f.hand && pred ? +pred.confidence.toFixed(4) : '',
      stable,
      detect_ms: +f.timings.detect.toFixed(3),
      feature_ms: Number.isFinite(f.timings.feature) ? +f.timings.feature.toFixed(3) : '',
      infer_ms: Number.isFinite(f.timings.infer) ? +f.timings.infer.toFixed(3) : '',
      total_ms: +f.timings.total.toFixed(3),
      fps: +f.fps.toFixed(2),
      ...cond,
      width: f.width,
      height: f.height,
      delegate: st.delegate ?? '',
    });
    setCaptured(c.res.frames);
    if (c.res.frames >= framesPerLetter) endLetter(idx);
  });

  const totals = useMemo(() => {
    const hand = results.reduce((a, r) => a + r.handFrames, 0);
    const correct = results.reduce((a, r) => a + r.correct, 0);
    const tts = results.map((r) => r.timeToStableMs).filter((x): x is number => x !== null);
    return {
      accuracy: hand ? correct / hand : 0,
      timeToStable: tts.length ? tts.reduce((a, b) => a + b, 0) / tts.length : NaN,
      reached: tts.length,
    };
  }, [results]);

  const exportRows = () =>
    downloadText(
      `signscan-eval-${sessionId.current}-${cond.lighting}-${cond.orientation}.csv`,
      toCsv(rows.current),
      'text/csv',
    );
  const exportSummary = () =>
    downloadText(
      `signscan-eval-summary-${sessionId.current}.csv`,
      toCsv(
        results.map((r) => ({
          signer_id: signer.trim(),
          ...cond,
          letter: r.letter,
          frames: r.frames,
          hand_frames: r.handFrames,
          frame_accuracy: r.handFrames ? +(r.correct / r.handFrames).toFixed(4) : '',
          stable_correct_frames: r.stableCorrect,
          time_to_stable_ms: r.timeToStableMs !== null ? Math.round(r.timeToStableMs) : '',
        })),
      ),
      'text/csv',
    );

  const busy = phase.kind === 'countdown' || phase.kind === 'capture';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <CameraView />
          {busy && letter && (
            <div className="pointer-events-none absolute top-3 left-3 rounded-xl bg-black/70 px-4 py-2 text-white">
              <div className="text-xs uppercase opacity-80">
                {phase.kind === 'countdown' ? `Get ready · ${phase.n}` : 'Capturing'}
              </div>
              <div className="font-display text-6xl leading-none font-bold">{letter}</div>
            </div>
          )}
        </div>
        <LivePerformance />
      </div>

      <div className="flex flex-col gap-4">
        <ModelNotice compact />
        <section aria-labelledby="sess-h" className="card p-4">
          <h2 id="sess-h" className="eyebrow mb-1">
            Scripted accuracy session
          </h2>
          <p className="mb-3 text-sm text-muted">
            Signs every letter under one test condition and logs each frame&apos;s prediction,
            confidence and timing. Repeat for each condition in{' '}
            <code>docs/evaluation_protocol.md</code>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-signer">
                Signer code
              </label>
              <input
                id="ev-signer"
                className="field"
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                placeholder="e.g. T03"
                disabled={busy}
              />
            </div>
            <div>
              <label className="label" htmlFor="ev-frames">
                Frames per letter
              </label>
              <input
                id="ev-frames"
                type="number"
                min={5}
                max={300}
                className="field"
                value={framesPerLetter}
                onChange={(e) => setFramesPerLetter(Math.max(5, Number(e.target.value) || 30))}
                disabled={busy}
              />
            </div>
            {(Object.keys(COND_OPTIONS) as (keyof Conditions)[]).map((k) => (
              <div key={k}>
                <label className="label capitalize" htmlFor={`ev-${k}`}>
                  {k}
                </label>
                <select
                  id={`ev-${k}`}
                  className="field"
                  value={cond[k]}
                  disabled={busy}
                  onChange={(e) => setCond((c) => ({ ...c, [k]: e.target.value }))}
                >
                  {COND_OPTIONS[k].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!busy ? (
              <button type="button" className="btn btn-primary" disabled={!ready} onClick={start}>
                {phase.kind === 'done' ? 'Run again' : 'Start session'}
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => endLetter(idx)}>
                  Skip letter
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    clearInterval(timer.current ?? undefined);
                    cur.current = null;
                    setPhase({ kind: 'done' });
                  }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
          {!ready && (
            <p className="mt-2 text-xs text-muted">Needs the camera running and a trained model.</p>
          )}
          {busy && (
            <p role="status" className="mt-3 text-sm">
              Letter {idx + 1} of {labels.length}: {letter} · {captured}/{framesPerLetter} frames
            </p>
          )}
        </section>

        {results.length > 0 && (
          <section aria-labelledby="res-h" className="card p-4">
            <h2 id="res-h" className="eyebrow mb-3">
              Results
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Frame accuracy" value={`${(totals.accuracy * 100).toFixed(1)}%`} />
              <Stat
                label="Mean time to stable"
                value={
                  Number.isFinite(totals.timeToStable)
                    ? `${(totals.timeToStable / 1000).toFixed(2)} s`
                    : '-'
                }
                hint="target ≤ 1 s"
              />
              <Stat label="Letters reached" value={`${totals.reached}/${results.length}`} />
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <table className="w-full text-sm tabular">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1">Letter</th>
                    <th>Accuracy</th>
                    <th>Time to stable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((r) => (
                    <tr key={r.letter}>
                      <td className="py-1 font-display font-bold">{r.letter}</td>
                      <td>
                        {r.handFrames
                          ? `${((r.correct / r.handFrames) * 100).toFixed(0)}%`
                          : 'no hand'}
                      </td>
                      <td>
                        {r.timeToStableMs !== null
                          ? `${(r.timeToStableMs / 1000).toFixed(2)} s`
                          : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={exportRows}>
                Export frames CSV
              </button>
              <button type="button" className="btn" onClick={exportSummary}>
                Export summary CSV
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Analyse with <code>python ml/scripts/evaluate.py --app-csv &lt;file&gt;</code>.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
