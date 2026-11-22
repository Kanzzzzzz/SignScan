import { createContext } from 'react';
import type { RecognitionEngine } from '../lib/engine';
import type { Settings } from '../lib/storage';

export const EngineContext = createContext<RecognitionEngine | null>(null);

export interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const SettingsContext = createContext<SettingsValue | null>(null);
