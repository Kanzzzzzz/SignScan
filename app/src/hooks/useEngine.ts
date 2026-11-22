import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { FrameResult } from '../lib/engine';
import { EngineContext, SettingsContext } from './contexts';

export function useEngine() {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('useEngine must be used inside <AppProviders>');
  return engine;
}

export function useEngineState() {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribeState, engine.getState);
}

/** Re-renders on every processed frame. Use in small components. */
export function useFrame() {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribeFrame, engine.getFrame);
}

/** Calls `cb` on every frame without re-rendering (canvas drawing, recording). */
export function useFrameListener(cb: (f: FrameResult) => void) {
  const engine = useEngine();
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => engine.subscribeFrame((f) => ref.current(f)), [engine]);
}

export function useSettings() {
  const v = useContext(SettingsContext);
  if (!v) throw new Error('useSettings must be used inside <AppProviders>');
  return v;
}
