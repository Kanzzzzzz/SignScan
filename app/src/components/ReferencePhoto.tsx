import { useEffect, useRef, useState } from 'react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import { referenceImageUrl } from '../lib/assets';
import {
  getReference,
  normalizeUpload,
  referenceEvents,
  removeReference,
  storeReference,
} from '../lib/references';

type Source = 'loading' | 'local' | 'shipped' | 'none';

/**
 * Photo URL for a letter: the approved image shipped in public/references first (from the FSL
 * chart, docs/assets/fsl_alphabet_chart.png), then a photo saved in this browser.
 */
function useReference(letter: string): { url: string | null; source: Source } {
  const [state, setState] = useState<{ url: string | null; source: Source }>({
    url: null,
    source: 'loading',
  });
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    let bust = '';
    const loadLocal = async () => {
      const rec = await getReference(letter).catch(() => undefined);
      if (!alive) return;
      if (!rec) return setState({ url: null, source: 'none' });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(rec.blob);
      setState({ url: objectUrl, source: 'local' });
    };
    const load = () => {
      const shipped = referenceImageUrl(letter) + bust;
      const img = new Image();
      img.onload = () => alive && setState({ url: shipped, source: 'shipped' });
      img.onerror = () => loadLocal();
      img.src = shipped;
    };
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== letter) return;
      bust = `?v=${Date.now()}`;
      load();
    };
    load();
    referenceEvents.addEventListener('change', onChange);
    return () => {
      alive = false;
      referenceEvents.removeEventListener('change', onChange);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [letter]);
  return state;
}

export function ReferencePhoto({ letter, size = 'lg' }: { letter: string; size?: 'lg' | 'sm' }) {
  const { url, source } = useReference(letter);
  if (url) {
    return (
      <img
        src={url}
        alt={`Reference hand shape for the FSL letter ${letter}`}
        className="aspect-square w-full rounded-xl bg-surface-2 object-cover"
      />
    );
  }
  return (
    <div
      className={`grid aspect-square w-full place-items-center rounded-xl border border-dashed border-line bg-surface-2 text-center text-muted ${
        size === 'lg' ? 'p-4 text-xs' : 'p-1 text-[10px]'
      }`}
    >
      {source === 'loading' ? '' : size === 'lg' ? 'No reference photo yet' : 'no photo'}
    </div>
  );
}

/** Capture (with countdown), upload or remove the reference photo for one letter. */
export function ReferenceControls({ letter }: { letter: string }) {
  const engine = useEngine();
  const st = useEngineState();
  const { source } = useReference(letter);
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMsg('');
    return () => clearInterval(timer.current ?? undefined);
  }, [letter]);

  const capture = () => {
    setMsg('');
    let n = 3;
    setCount(n);
    clearInterval(timer.current ?? undefined);
    timer.current = setInterval(async () => {
      n -= 1;
      setCount(n);
      if (n > 0) return;
      clearInterval(timer.current ?? undefined);
      const blob = await engine.snapshotHand();
      if (!blob) {
        setMsg('No hand in view. Show the hand shape to the camera and try again.');
        return;
      }
      await storeReference(letter, blob, 'camera');
      setMsg(`Saved the photo for ${letter}.`);
    }, 1000);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await storeReference(letter, await normalizeUpload(file), 'upload');
      setMsg(`Saved the photo for ${letter}.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  // Approved chart images are fixed; regenerate them with ml/scripts/slice_reference_chart.py.
  if (source === 'shipped') {
    return <p className="text-xs text-muted">From the approved FSL alphabet chart.</p>;
  }
  if (source === 'loading') return null;
  const canRemove = source === 'local';

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn min-h-9 px-3 text-xs"
          onClick={capture}
          disabled={st.camera !== 'running' || count > 0}
          title={st.camera !== 'running' ? 'Start the camera first' : undefined}
        >
          {count > 0 ? `Hold the sign… ${count}` : source === 'none' ? 'Take photo' : 'Retake'}
        </button>
        <button
          type="button"
          className="btn min-h-9 px-3 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          Upload
        </button>
        {canRemove && (
          <button
            type="button"
            className="btn btn-danger min-h-9 px-3 text-xs"
            onClick={async () => {
              await removeReference(letter);
              setMsg(`Removed the photo for ${letter}.`);
            }}
          >
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={`Upload a reference photo for ${letter}`}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <p role="status" aria-live="polite" className="mt-1 min-h-4 text-xs text-muted">
        {msg}
      </p>
    </div>
  );
}
