import { useEffect, useRef, useState } from 'react';
import { CameraView } from '../components/CameraView';
import { ModelNotice } from '../components/ModelNotice';
import { useEngineState, useFrameListener, useSettings } from '../hooks/useEngine';
import { TextComposer } from '../lib/stabilizer';

function speak(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-PH';
  window.speechSynthesis.speak(u);
}

export function CommunicatePage() {
  const st = useEngineState();
  const { settings, update } = useSettings();
  const composer = useRef(new TextComposer());
  const [text, setText] = useState('');
  const [holding, setHolding] = useState<{ letter: string | null; progress: number }>({
    letter: null,
    progress: 0,
  });
  const [large, setLarge] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    composer.current.setOptions({ holdMs: settings.holdMs, spaceMs: settings.spaceMs });
  }, [settings.holdMs, settings.spaceMs]);

  useFrameListener((f) => {
    if (st.model !== 'ready') return;
    const u = composer.current.update(f.stable, f.t);
    if (u.committed) {
      setText(composer.current.text);
      // Speak the finished word when a space is added
      if (u.committed === ' ' && settings.speak) {
        const words = composer.current.text.trim().split(/\s+/);
        speak(words[words.length - 1] ?? '');
      }
    }
    setHolding((h) =>
      h.letter === u.holding && Math.abs(h.progress - u.progress) < 0.04
        ? h
        : { letter: u.holding, progress: u.progress },
    );
  });

  const sync = () => setText(composer.current.text);
  const actions = {
    space: () => {
      composer.current.addSpace();
      sync();
    },
    back: () => {
      composer.current.backspace();
      sync();
    },
    clear: () => {
      composer.current.clear();
      sync();
    },
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex flex-col gap-4">
        <CameraView />
        <div className="card p-4">
          <div className="flex items-center gap-4">
            <div
              className="relative grid size-20 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--accent) ${holding.progress * 360}deg, var(--surface-2) 0)`,
              }}
              aria-hidden="true"
            >
              <div className="grid size-16 place-items-center rounded-full bg-surface font-display text-4xl font-bold">
                {holding.letter ?? '·'}
              </div>
            </div>
            <p className="text-sm text-muted" aria-live="polite">
              {st.model !== 'ready'
                ? 'Waiting for a trained model.'
                : holding.letter
                  ? holding.progress >= 1
                    ? `Typed ${holding.letter}. Relax your hand to type it again.`
                    : `Holding ${holding.letter}… keep still to type it.`
                  : `Hold a letter for ${(settings.holdMs / 1000).toFixed(1)} s to type it. Lower your hand for ${(settings.spaceMs / 1000).toFixed(1)} s to add a space.`}
            </p>
          </div>
        </div>
        <ModelNotice compact />
      </div>

      <section aria-labelledby="buffer-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="buffer-h" className="eyebrow">
            Fingerspelled text
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={settings.speak}
              onChange={(e) => update({ speak: e.target.checked })}
            />
            Speak each word
          </label>
        </div>
        <output
          aria-live="polite"
          aria-label="Fingerspelled text"
          className={`card block min-h-48 p-6 font-display font-bold break-words whitespace-pre-wrap ${
            large ? 'text-6xl sm:text-8xl' : 'text-4xl sm:text-6xl'
          } leading-tight`}
        >
          {text || <span className="text-muted/50">Your words appear here</span>}
          <span className="ml-1 inline-block h-[0.9em] w-1 animate-pulse bg-accent align-middle motion-reduce:animate-none" />
        </output>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={actions.space}>
            Space
          </button>
          <button type="button" className="btn" onClick={actions.back}>
            Backspace
          </button>
          <button type="button" className="btn btn-danger" onClick={actions.clear} disabled={!text}>
            Clear
          </button>
          <button type="button" className="btn" onClick={copy} disabled={!text}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" className="btn" onClick={() => speak(text)} disabled={!text}>
            Speak all
          </button>
          <button type="button" className="btn" onClick={() => setLarge((l) => !l)}>
            {large ? 'Smaller text' : 'Larger text'}
          </button>
        </div>
      </section>
    </div>
  );
}
