import { useEngine, useEngineState } from '../hooks/useEngine';
import { trainerSupported } from '../lib/trainer';

/** Shown when no trained letter model is available. Hand tracking still works. */
export function ModelNotice({ compact = false }: { compact?: boolean }) {
  const st = useEngineState();
  const engine = useEngine();
  if (st.model === 'ready' || st.model === 'loading') return null;
  if (st.model === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-4 text-sm">
        <p className="font-semibold text-danger">The letter model could not be loaded</p>
        <p className="mt-1">{st.modelError}</p>
        <button type="button" className="btn mt-3" onClick={() => engine.loadModel()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-warn bg-warn-soft p-4 text-sm">
      <p className="font-semibold text-warn">Letters aren&apos;t trained yet</p>
      {!compact && (
        <p className="mt-1">
          SignScan can already see your hand (the dots and lines). To read letters it has to learn
          them from examples first.
        </p>
      )}
      {trainerSupported ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open{' '}
            <a className="font-semibold underline" href="#/collect">
              Collect
            </a>{' '}
            and record a few letters (5 seconds each).
          </li>
          <li>
            Press <strong>Train model</strong>, or tick <strong>Auto-train</strong>.
          </li>
          <li>Come back here. Letters appear automatically when training finishes.</li>
        </ol>
      ) : (
        <p className="mt-2">
          Record letters on the{' '}
          <a className="font-semibold underline" href="#/collect">
            Collect
          </a>{' '}
          page, export them to <code>data/raw/</code> and run{' '}
          <code>python ml/scripts/pipeline.py</code>. Then reload.
        </p>
      )}
    </div>
  );
}
