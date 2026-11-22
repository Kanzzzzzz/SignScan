import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RecognitionEngine } from '../lib/engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/storage';
import { EngineContext, SettingsContext } from '../hooks/contexts';

export function AppProviders({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new RecognitionEngine());
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    engine.loadModel();
    engine.refreshCameras();
    return () => engine.stop();
  }, [engine]);

  useEffect(() => {
    engine.setStabilizerOptions({
      threshold: settings.threshold,
      window: settings.window,
      minAgree: settings.minAgree,
    });
    saveSettings(settings);
  }, [engine, settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);

  return (
    <EngineContext.Provider value={engine}>
      <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
    </EngineContext.Provider>
  );
}
