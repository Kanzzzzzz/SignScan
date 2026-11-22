/** ONNX classifier (onnxruntime-web, WASM backend). Runs fully on-device. */

import * as ort from 'onnxruntime-web/wasm';
import { CLASSIFIER_LABELS, CLASSIFIER_META, CLASSIFIER_MODEL } from './assets';
import { FEATURE_DIM, FEATURE_VERSION } from './features';
import type { Prediction } from './stabilizer';

export interface ModelMeta {
  feature_version: number;
  input: string;
  output: string;
  num_classes: number;
  exported_at?: string;
  run_id?: string;
  metrics?: Record<string, unknown>;
}

export class ModelMissingError extends Error {
  constructor() {
    super('No trained model found at public/models/signscan.onnx.');
    this.name = 'ModelMissingError';
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    // Dev servers answer missing files with index.html; treat non-JSON as missing.
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class Classifier {
  private constructor(
    private readonly session: ort.InferenceSession,
    public readonly labels: string[],
    public readonly meta: ModelMeta,
  ) {}

  static async load(): Promise<Classifier> {
    const labels = await fetchJson<string[]>(CLASSIFIER_LABELS);
    const meta = await fetchJson<ModelMeta>(CLASSIFIER_META);
    if (!labels || !meta) throw new ModelMissingError();
    if (meta.feature_version !== FEATURE_VERSION) {
      throw new Error(
        `Model was trained with feature_version ${meta.feature_version}, the app uses ${FEATURE_VERSION}. Re-export the model.`,
      );
    }
    if (labels.length !== meta.num_classes) {
      throw new Error('labels.json and model_meta.json disagree on the number of classes.');
    }
    // The .wasm binary is bundled and served by Vite (resolved via import.meta.url).
    ort.env.wasm.numThreads = 1; // tiny model; avoids needing cross-origin isolation
    const res = await fetch(CLASSIFIER_MODEL, { cache: 'no-cache' }); // pick up retrained models
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('text/html')) throw new ModelMissingError();
    const bytes = new Uint8Array(await res.arrayBuffer());
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    return new Classifier(session, labels, meta);
  }

  async predict(features: Float32Array): Promise<Float32Array> {
    if (features.length !== FEATURE_DIM) throw new Error('feature vector must have 63 values');
    const input = new ort.Tensor('float32', features, [1, FEATURE_DIM]);
    const out = await this.session.run({ [this.meta.input]: input });
    return out[this.meta.output].data as Float32Array;
  }
}

export function topK(probs: ArrayLike<number>, labels: readonly string[], k = 3): Prediction[] {
  const idx = Array.from({ length: probs.length }, (_, i) => i);
  idx.sort((a, b) => probs[b] - probs[a]);
  return idx.slice(0, k).map((i) => ({ label: labels[i], confidence: probs[i] }));
}
