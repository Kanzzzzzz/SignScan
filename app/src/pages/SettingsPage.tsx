import { useEngine, useEngineState, useSettings } from '../hooks/useEngine';

function Slider(props: {
  id: string;
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={props.id}>
          {props.label}
        </label>
        <span className="font-mono text-sm tabular">{props.format(props.value)}</span>
      </div>
      <input
        id={props.id}
        type="range"
        className="w-full accent-[var(--accent)]"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-describedby={`${props.id}-help`}
      />
      <p id={`${props.id}-help`} className="text-xs text-muted">
        {props.help}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const engine = useEngine();
  const st = useEngineState();
  const { settings, update, reset } = useSettings();

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <section aria-labelledby="cam-h" className="card p-5">
        <h2 id="cam-h" className="eyebrow mb-3">
          Camera
        </h2>
        <label className="label" htmlFor="device">
          Camera device
        </label>
        <select
          id="device"
          className="field"
          value={settings.deviceId}
          onChange={(e) => {
            update({ deviceId: e.target.value });
            if (st.camera === 'running') engine.start(e.target.value);
          }}
        >
          <option value="">Default (front camera)</option>
          {st.cameras.map((c, i) => (
            <option key={c.deviceId || i} value={c.deviceId}>
              {c.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Camera names appear after you allow camera access once.
        </p>
      </section>

      <section aria-labelledby="rec-h" className="card grid gap-5 p-5">
        <h2 id="rec-h" className="eyebrow">
          Recognition
        </h2>
        <Slider
          id="threshold"
          label="Confidence threshold (θ)"
          help="A frame's prediction counts only above this confidence. Higher means fewer mistakes but slower to respond."
          value={settings.threshold}
          min={0.3}
          max={0.99}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update({ threshold: v })}
        />
        <Slider
          id="window"
          label="Smoothing window"
          help="Number of recent frames that vote on the letter. Larger is steadier but slower."
          value={settings.window}
          min={3}
          max={20}
          step={1}
          format={(v) => `${v} frames`}
          onChange={(v) => update({ window: v })}
        />
        <Slider
          id="agree"
          label="Agreement needed"
          help="Share of the window that must agree before a letter is shown."
          value={settings.minAgree}
          min={0.3}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update({ minAgree: v })}
        />
      </section>

      <section aria-labelledby="com-h" className="card grid gap-5 p-5">
        <h2 id="com-h" className="eyebrow">
          Communicate mode
        </h2>
        <Slider
          id="hold"
          label="Hold to type"
          help="How long a letter must stay steady before it is typed."
          value={settings.holdMs}
          min={300}
          max={2000}
          step={50}
          format={(v) => `${(v / 1000).toFixed(2)} s`}
          onChange={(v) => update({ holdMs: v })}
        />
        <Slider
          id="space"
          label="Pause for a space"
          help="How long with no hand in view before a space is added."
          value={settings.spaceMs}
          min={600}
          max={4000}
          step={100}
          format={(v) => `${(v / 1000).toFixed(1)} s`}
          onChange={(v) => update({ spaceMs: v })}
        />
      </section>

      <div>
        <button type="button" className="btn" onClick={reset}>
          Restore defaults
        </button>
      </div>
    </div>
  );
}
