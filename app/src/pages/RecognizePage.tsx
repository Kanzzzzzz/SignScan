import { CameraView } from '../components/CameraView';
import { DebugPanel } from '../components/DebugPanel';
import { ModelNotice } from '../components/ModelNotice';
import { ConfidenceBar, LetterDisplay, TopK } from '../components/Readouts';
import { useEngineState, useFrame, useSettings } from '../hooks/useEngine';

function LivePanel() {
  const f = useFrame();
  const st = useEngineState();
  const { settings } = useSettings();
  const ready = st.model === 'ready';
  const conf = f.stable.kind === 'letter' ? f.stable.confidence : (f.top[0]?.confidence ?? 0);
  return (
    <div className="card flex flex-col gap-5 p-5">
      <LetterDisplay state={f.stable} modelReady={ready} />
      {ready && <ConfidenceBar value={f.hand ? conf : 0} />}
      {ready && settings.showTop3 && (
        <div>
          <h2 className="eyebrow mb-2">Top 3 this frame</h2>
          <TopK items={f.hand ? f.top : []} />
        </div>
      )}
    </div>
  );
}

export function RecognizePage() {
  const { settings, update } = useSettings();
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <CameraView />
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={settings.showLandmarks}
              onChange={(e) => update({ showLandmarks: e.target.checked })}
            />
            Landmarks
          </label>
          <label className="btn cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={settings.showTop3}
              onChange={(e) => update({ showTop3: e.target.checked })}
            />
            Top 3
          </label>
          <label className="btn cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={settings.showDebug}
              onChange={(e) => update({ showDebug: e.target.checked })}
            />
            Debug
          </label>
        </div>
        {settings.showDebug && <DebugPanel />}
      </div>
      <div className="flex flex-col gap-4">
        <LivePanel />
        <ModelNotice />
      </div>
    </div>
  );
}
