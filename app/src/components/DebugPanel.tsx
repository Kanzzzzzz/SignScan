import { useEffect, useState } from 'react';
import { useEngine, useEngineState, useFrame } from '../hooks/useEngine';
import type { Stage, StageSummary } from '../lib/metrics';
import { fmtMs } from '../lib/format';
import { Stat } from './Readouts';

/** FPS, per-stage timing (mean/p95), handedness and score: the O1/O4 readout. */
export function DebugPanel() {
  const engine = useEngine();
  const st = useEngineState();
  const f = useFrame();
  const [summary, setSummary] = useState<Record<Stage, StageSummary>>(engine.timer.summary());

  useEffect(() => {
    const id = setInterval(() => setSummary(engine.timer.summary()), 500);
    return () => clearInterval(id);
  }, [engine]);

  return (
    <section aria-labelledby="debug-h" className="card p-4">
      <h2 id="debug-h" className="eyebrow mb-3">
        Debug
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="FPS" value={f.fps.toFixed(1)} />
        <Stat
          label="Detect"
          value={fmtMs(f.timings.detect)}
          hint={`mean ${fmtMs(summary.detect.mean)} · p95 ${fmtMs(summary.detect.p95)}`}
        />
        <Stat
          label="Classify"
          value={fmtMs(f.timings.infer)}
          hint={`mean ${fmtMs(summary.infer.mean)} · p95 ${fmtMs(summary.infer.p95)}`}
        />
        <Stat
          label="Total / frame"
          value={fmtMs(f.timings.total)}
          hint={`mean ${fmtMs(summary.total.mean)} · p95 ${fmtMs(summary.total.p95)}`}
        />
        <Stat label="Hand" value={f.hand ? f.hand.handedness : 'none'} />
        <Stat label="Hand score" value={f.hand ? f.hand.score.toFixed(3) : '-'} />
        <Stat label="Delegate" value={st.delegate ?? '-'} />
        <Stat label="Resolution" value={f.width ? `${f.width}×${f.height}` : '-'} />
        <Stat label="Model" value={st.model} />
      </div>
    </section>
  );
}
