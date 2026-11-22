/**
 * Client for the dev-only local trainer (app/scripts/trainer-plugin.ts).
 * In production builds this never makes a request: training is only offered under `npm run dev`.
 */

export interface TrainResult {
  run_id: string;
  samples: number;
  signers: string[];
  letters_trained: string[];
  letters_missing: string[];
  val: { n?: number; accuracy?: number; macro_f1?: number };
  test: { n?: number; accuracy?: number; macro_f1?: number };
  parity_passed: boolean;
}

export interface TrainerStatus {
  available: boolean;
  python: string | null;
  running: boolean;
  step: string;
  log: string[];
  result: TrainResult | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  runId: number;
}

const BASE = '/__signscan';
const HEADERS = { 'X-SignScan': '1' };

export const trainerSupported = import.meta.env.DEV;

export async function getTrainerStatus(): Promise<TrainerStatus | null> {
  if (!trainerSupported) return null;
  try {
    const res = await fetch(`${BASE}/status`, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as TrainerStatus;
  } catch {
    return null;
  }
}

export async function startTraining(jsonl: string): Promise<void> {
  if (!trainerSupported)
    throw new Error('Training from the app is only available under npm run dev.');
  const res = await fetch(`${BASE}/train`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-ndjson' },
    body: jsonl,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Training could not start (HTTP ${res.status}).`);
  }
}

export async function cancelTraining(): Promise<void> {
  if (!trainerSupported) return;
  await fetch(`${BASE}/cancel`, { method: 'POST', headers: HEADERS }).catch(() => undefined);
}
