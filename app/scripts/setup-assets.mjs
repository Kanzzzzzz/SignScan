// Copies MediaPipe WASM into public/ and downloads the hand landmarker model, so the app serves
// everything itself and works offline. Safe to run repeatedly. (onnxruntime-web's .wasm is
// bundled by Vite automatically.)
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const nm = join(root, 'node_modules');

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

function copyIfChanged(src, dst) {
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) return false;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  return true;
}

// 1. MediaPipe tasks-vision WASM
const mpSrc = join(nm, '@mediapipe', 'tasks-vision', 'wasm');
let copied = 0;
for (const f of readdirSync(mpSrc)) copied += copyIfChanged(join(mpSrc, f), join(pub, 'mediapipe', 'wasm', f));
if (copied) console.log(`[setup] copied ${copied} WASM file(s) into public/`);

// 2. Hand landmarker model
const modelPath = join(pub, 'models', 'hand_landmarker.task');
if (!existsSync(modelPath)) {
  try {
    console.log('[setup] downloading hand_landmarker.task ...');
    const res = await fetch(HAND_MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelPath), { recursive: true });
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[setup] saved public/models/hand_landmarker.task');
  } catch (err) {
    console.warn(
      `[setup] could not download the hand model (${err.message}).\n` +
        `        Download it manually from\n        ${HAND_MODEL_URL}\n        into app/public/models/`,
    );
  }
}
