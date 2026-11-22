# SignScan

Real-time sign-language alphabet recognition from an ordinary webcam.

MediaPipe Hand Landmarker → 21 landmarks → normalized 63-d feature → 1D-CNN → stabilized letter → on-screen text.
Everything runs on the device. No video ever leaves the browser.

| Page | What it does |
|---|---|
| **Recognize** | Live letter, confidence, top-3 predictions, landmark overlay, debug panel (FPS, ms per stage) |
| **Communicate** | Fingerspell words: hold a letter to type it, lower your hand for a space; copy or speak the text |
| **Practice** | Target letter + FSL reference photo (take it in the app, upload it, or auto-save it on your first correct sign), hold to pass, hints for confusable pairs, per-letter progress, CSV export |
| **Collect** | Record landmark bursts per letter / signer / condition; review, delete, export JSONL |
| **Evaluate** | Scripted letter × condition sessions with per-frame logs; latency mean/p95 (Objective O4) |
| **Settings / About** | Camera, threshold, smoothing, hold times; model info, privacy, limitations |

See [docs/PLAN.md](docs/PLAN.md) for objectives and architecture, and [docs/decisions.md](docs/decisions.md) for open decisions and their defaults.

## Quick start

Requirements: Node 20+, Python 3.11+, a webcam.

### App

```bash
cd app
npm install        # or: pnpm install
npm run dev        # copies MediaPipe WASM, downloads hand_landmarker.task, starts Vite
```

Open the printed URL (http://localhost:5173) and press **Start camera**. Camera access needs
`localhost` or HTTPS.

Without a trained model, the app does hand tracking and data collection, and shows
"No model yet". Train one as described below.

```bash
npm test           # vitest
npm run lint       # eslint + prettier
npm run build      # production build in app/dist (static site; deploy anywhere with HTTPS)
npm run preview    # serve the build locally (enables offline support via service worker)
```

### ML

```bash
cd ml
uv sync && uv run pytest                     # with uv
# or, with plain pip:
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m pytest
```

## From recordings to a working model

**One click (recommended).** Run the app with `npm run dev` and set up `ml/.venv` once (see ML above). Then:

1. On **Collect**, enter a signer code and record a few letters (5 s each).
2. Press **Train model**, or tick **Auto-train after each recording**.
3. In about 20–60 s the new model loads into the app by itself. No export, no commands, no reload.

The button sends the recordings to the local Vite dev server on your own computer. It writes
`data/raw/app-collected.jsonl` and runs `ml/scripts/pipeline.py`. Any other `.jsonl` files in
`data/raw/` (for example from other computers, or from `extract_landmarks.py`) are included as well.

**One command:** `python scripts/pipeline.py` (in `ml/`) builds the dataset, trains and exports in one go.

**Step by step (for the report):**

1. **Collect** page: record each letter for each signer (see [data collection protocol](docs/data_collection_protocol.md)), then export JSONL into `data/raw/`.
2. Build the dataset (validates, drops low-score and duplicate frames, splits **by signer**):
   `python scripts/build_dataset.py`
3. Train the 1D-CNN (and the MLP baseline for comparison):
   `python scripts/train.py --config configs/default.yaml`
   `python scripts/train.py --config configs/default.yaml --model mlp`
4. Evaluate: `python scripts/evaluate.py --run runs/<id>` (confusion matrix, per-class and per-condition accuracy).
5. Export to the app. Only a model that passes the PyTorch ↔ ONNX parity check is written:
   `python scripts/export_onnx.py --run runs/<id>` → `app/public/models/signscan.onnx`, `labels.json`, `model_meta.json`
6. Reload the app.

Python-only sanity check with a webcam: `python scripts/live_demo.py`.

## Layout

```
shared/   labels.json (class list), feature_spec.md, fixtures/ (golden vectors for both languages)
ml/       signscan_ml package + scripts (dataset, train, evaluate, export, live demo) + tests
app/      Vite + React + TS web app (src/lib = pipeline, src/pages = screens) + tests
docs/     plan, decisions, evaluation and data-collection protocols, traceability
data/     git-ignored recordings (raw/, processed/)
```

The feature normalization exists in both `ml/signscan_ml/features.py` and
`app/src/lib/features.ts`. Both test suites check them against the same `shared/fixtures`.
If you change one, change both (see [CLAUDE.md](CLAUDE.md)).

## User manual (short)

- **Start:** open the site and press **Start camera**. Hold one hand 40–80 cm from the camera, palm toward it, in good light.
- **Reading letters:** the big letter appears once the hand shape has been steady for a few frames. "?" means the model is unsure.
- **Typing words:** on **Communicate**, hold each letter until the ring fills. To type the same letter twice, relax your hand between the two. Lower your hand for a space.
- **Practising:** pick a mode on **Practice**. If you're stuck, a hint appears after 6 seconds. Use **Export CSV for teacher** to share progress.
- **Offline:** after the first visit to a deployed (HTTPS) build, the app works without internet.

SignScan reads static alphabet letters only. It is not a replacement for a sign-language interpreter.
