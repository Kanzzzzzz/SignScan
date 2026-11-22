# SignScan Implementation Plan

**Source:** `SignScan_Chapter_1_2.docx` (Chapter 1: The Problem and Its Background; Chapter 2: Review of Related Literature)
**Purpose:** A build plan that Claude Code can follow to create SignScan from an empty repository, with every piece traced back to the document's objectives.
**Status:** Draft. Section 2 lists decisions the team should confirm before or during Phase 0. Where the plan had to pick, it states the default it chose.

---

## 1. What the document asks for

### 1.1 One-sentence summary

SignScan is a **real-time, camera-only system** that detects a hand with **MediaPipe**, extracts the **21 hand landmarks**, classifies the **static hand shape** as a **sign-language alphabet letter** using a **CNN trained on the landmark data**, and **shows the letter as on-screen text**. It is meant to be both a **communication aid** and a **self-paced practice tool**.

### 1.2 Objectives → what must be built

| # | Objective (Chapter 1) | Build deliverable | Phase |
|---|---|---|---|
| O1 | Real-time hand detection and tracking module that extracts landmark data from a live camera feed | `HandTracker` module wrapping MediaPipe Hand Landmarker; landmark overlay; FPS readout | 1 |
| O2 | CNN-based model that recognizes static alphabet gestures **from extracted hand landmark data** | Data collection tool, landmark dataset, 1D-CNN classifier, training/eval scripts, exported model | 2, 3 |
| O3 | Real-time interface that turns the classified gesture into a letter shown as on-screen text | Recognition screen: live letter, confidence, stabilized text buffer (letters build words) | 4 |
| O4 | Evaluate accuracy, reliability and processing speed under varying lighting and hand orientation | Evaluation protocol, condition-tagged test set, metrics scripts, latency instrumentation, report tables | 6 |
| O5 | Accessible tool that needs no special or costly hardware | Runs on an ordinary laptop/phone webcam; no install (browser) or a single installer; offline inference; accessible UI | 4, 5, 7 |

### 1.3 Problems → features that answer them

| Problem (Statement of the Problem) | Feature that answers it |
|---|---|
| P1 No real-time feedback in static materials | Live recognition with confidence display |
| P2 Hearing people can't read fingerspelling | "Communicate" mode: fingerspelled letters accumulate into words on a large, readable display (optional text-to-speech) |
| P3 Costly hardware in existing systems | RGB webcam only, MediaPipe on-device |
| P4 Accuracy varies with lighting, orientation, background, signer | Landmark features (less sensitive to background and color than pixels), normalization, augmentation, multi-signer data, condition-tagged evaluation |
| P5 No accessible self-paced practice tool | "Practice" mode: target letter, reference image, pass/fail feedback, hints, per-letter progress |

### 1.4 Scope (in) and limitations (out), as stated

**In scope:** static alphabet hand shapes; ordinary RGB camera; real-time landmark extraction; deep-learning classification; on-screen text. Users: DHH individuals, hearing individuals, learners, educators.

**Out of scope:** words or sentences as signs, continuous or dynamic gestures, facial expressions and non-manual markers, replacing interpreters. Motion letters (**J, Z**) "may be excluded or handled separately."

### 1.5 Technology the document names (to be honored)

- **MediaPipe Hands** (21 landmarks, single RGB camera, on-device). Use the current **MediaPipe Tasks Hand Landmarker** API, which supersedes the legacy `mp.solutions.hands`.
- **CNN** classifier operating on **landmark data**, not raw pixels (O2 and Related Study 1 are explicit about this).
- **OpenCV** appears in the literature (Chapter 2, item 6) and is the natural choice for any Python-side camera capture.
- Transfer learning / fine-tuning is cited as a way to cope with small datasets (Chapter 2, items 3 and 6).
- Text-to-speech and YOLOv8 appear only in reviewed studies, not in SignScan's objectives. TTS is an optional extra here; YOLO is not used.

### 1.6 Conceptual framework (IPO) as a pipeline

```
INPUT                       PROCESS                                   OUTPUT
live camera frame  ──►  MediaPipe Hand Landmarker  ──►  21×3 landmarks
                        normalize (wrist origin, scale, mirror)  ──►  63-d feature
                        1D-CNN classifier  ──►  letter probabilities
                        temporal smoothing + confidence gate  ──►  stable letter
                        UI: letter, confidence, text buffer, practice feedback
```

---

## 2. Gaps and ambiguities the team should decide

These are not answered by Chapters 1–2. Each has a **default** the plan uses so work isn't blocked.

| # | Question | Why it matters | Default in this plan |
|---|---|---|---|
| G1 | **FSL or ASL alphabet?** The background is all about Filipino Sign Language (RA 11106), but the title says "Sign Language Alphabet" and most cited alphabet studies are ASL. | Decides the class list, reference images and who validates the data. The FSL manual alphabet is largely derived from ASL, but it has to be checked by an FSL signer, not assumed. | **FSL**, with labels verified by a Deaf signer or SPED/FSL teacher. The code keeps the label set in one config file, so switching to ASL is a config change. |
| G2 | **Ñ and NG.** The Filipino alphabet has 28 letters. Does FSL fingerspell Ñ and NG, and are they static? | They could add classes, or add more motion letters. | Confirm with the FSL consultant. Until then, the class list is the 26 Latin letters. |
| G3 | **J and Z** (and any other motion letters): exclude or "handle separately"? | Static classifier can't see motion. | **Exclude from the CNN (24 static classes).** Stretch goal in Phase 5: a small trajectory rule (track fingertip path over ~1 s, starting from the I / index-point hand shape). |
| G4 | **Platform:** web, desktop, or mobile? Not stated. | Drives the whole app stack. | **Web app** (runs in the browser on laptops and phones, no install, inference stays on the device). See 3.2 for the reasoning and the desktop fallback. |
| G5 | **What "CNN" means here.** O2 says a CNN on landmark data; Chapter 2 also cites fine-tuning pretrained *image* CNNs. These are different models. | The panel will ask why a CNN on 63 numbers. | **1D-CNN over the 21 landmarks** as the main model, with an **MLP baseline** for comparison. An image-based MobileNet transfer model is an optional extra comparison for Chapter 4, not part of the app. |
| G6 | **Dataset:** how many signers, samples per letter, any public data? Consent? | Accuracy across signers depends on signer count. Recording people falls under the Data Privacy Act (RA 10173). | ≥ **10 signers**, ≥ **200 landmark samples per letter per signer** (collected as short bursts), signed consent form. **Store landmarks only, not video**, to reduce privacy risk. |
| G7 | **One hand or two?** Left-handed signers? | Mirroring changes the feature pipeline. | One dominant hand. Left hands are mirrored to right-hand space so one model serves both. |
| G8 | **Output form:** single letter only, or letters building into words? | O3 says "on-screen text"; P2 implies spelling names. | Both: big live letter plus a **text buffer** with hold-to-commit, space and backspace. |
| G9 | **Evaluation targets and method.** Chapter 3 isn't in the file. No accuracy/FPS targets, no usability instrument named. | O4 can't be "met" without targets. | Proposed targets in 9.3. Usability: SUS or an ISO/IEC 25010 questionnaire, to be confirmed against the school's Chapter 3 template. |
| G10 | **Educator monitoring** (Significance section mentions teachers monitoring progress). Accounts and a server? | Adds a backend, auth, privacy work. | **Out of scope for v1.** Progress is stored on the device, with an "export progress (CSV)" button a teacher can collect. |
| G11 | **Reference images for practice mode.** | Copyrighted charts can't be shipped. | Team photographs its own hand-shape references (or line drawings), checked by the FSL consultant. |

---

## 3. Recommended stack

### 3.1 Summary

| Layer | Choice | Why |
|---|---|---|
| ML language | **Python 3.11** | Supported by MediaPipe, PyTorch, ONNX tooling |
| Hand landmarks (training side) | **`mediapipe` Tasks `HandLandmarker`** | Named in the document |
| Hand landmarks (app side) | **`@mediapipe/tasks-vision` `HandLandmarker`** (WASM + GPU delegate) | Same model as the Python side, runs in the browser |
| Classifier training | **PyTorch** (Keras is an acceptable alternative) | Clean native export to ONNX; small model trains on a laptop CPU |
| Model format | **ONNX** | One file used for both Python evaluation and in-browser inference, so results match |
| In-app inference | **`onnxruntime-web`** | Runs the ONNX model in the browser, WASM backend, no server |
| App | **Vite + React + TypeScript** | Simple, fast, widely documented |
| Styling | Tailwind CSS | Quick, consistent, easy to make high-contrast |
| App state / storage | React state + `localStorage` (or IndexedDB) | Practice progress and settings stay on the device |
| Testing | `pytest` (ML), `vitest` (app), Playwright (smoke test) | |
| Tooling | `uv` for Python envs, `ruff` lint/format; `pnpm`, ESLint, Prettier | |
| Hosting (optional) | Any static host (GitHub Pages, Netlify, Vercel) | It's a static site; HTTPS is required for camera access |

### 3.2 Why a web app (and the fallback)

- **O5 (accessible, no costly hardware):** opens from a link on any laptop or phone with a camera. Nothing to install in a computer lab.
- **Privacy:** camera frames never leave the device. Only the model file is downloaded.
- **Same landmark model in collection and in use:** the app's own **Collect** screen records training data, so the landmarks the model trains on come from exactly the same extractor it sees at run time.

**Fallback if the team prefers pure Python (G4):** a desktop app with OpenCV + `mediapipe` + `onnxruntime` + PySide6 (or Tkinter). The `ml/` package and the model stay identical; only `app/` is replaced. Choose this if the panel requires a desktop deliverable or nobody on the team knows TypeScript.

---

## 4. Architecture

### 4.1 Run-time pipeline (in the browser)

```
<video> (getUserMedia, 640×480, mirrored preview)
   │  requestAnimationFrame / requestVideoFrameCallback
   ▼
HandTracker            @mediapipe/tasks-vision HandLandmarker, runningMode=VIDEO, numHands=1
   │  landmarks[21] {x,y,z}, handedness, score
   ▼
FeatureExtractor       features.ts  (must match ml/signscan_ml/features.py exactly)
   │  Float32Array(63)
   ▼
Classifier             onnxruntime-web session, softmax over N classes
   │  probs[N]
   ▼
Stabilizer             sliding window (e.g. 8 frames) majority vote + confidence ≥ θ
   │  stableLetter | null
   ▼
UI modes               Recognize · Communicate (text buffer) · Practice · Collect
```

### 4.2 Feature normalization (the most important shared contract)

Implemented twice (Python and TypeScript) and locked together by shared test vectors:

1. Take the 21 image landmarks `(x, y, z)`. Multiply `x` by `width / height` so the hand isn't stretched by the video's aspect ratio.
2. **Mirror** left hands: if handedness is `Left` (after accounting for the mirrored preview), negate `x`.
3. **Translate:** subtract the wrist (landmark 0) from every point.
4. **Scale:** divide by the distance from wrist (0) to middle-finger MCP (9). Fall back to the max point norm if that is ~0.
5. **Do not normalize rotation.** Several letters differ mainly by hand orientation (in ASL, for example, H vs U, K vs P, G vs Q). Rotation stays as information. Robustness to orientation comes from augmentation and from O4 testing.
6. Flatten to 63 floats in landmark order.

`shared/feature_spec.md` documents this, and `shared/fixtures/*.json` holds raw landmarks → expected 63-d vectors. Both `pytest` and `vitest` assert against the same fixtures.

### 4.3 Model

- **Input:** `(21, 3)`, landmarks as a sequence of 21 points with 3 channels.
- **Main model (1D-CNN):** Conv1d(3→64, k=3) → BN → ReLU → Conv1d(64→128, k=3) → BN → ReLU → Conv1d(128→128, k=3) → global average pool → Dropout(0.3) → Linear(128→N). About 100k parameters; sub-millisecond inference.
- **Baseline (MLP):** 63 → 256 → 128 → N with dropout. Reported alongside the CNN in Chapter 4.
- **Augmentation (training only):** small 2D rotation (±15°), scale (±10%), Gaussian jitter on coordinates, random mirroring with label preserved, random landmark dropout. Keep rotation small so orientation-dependent letters stay distinct.
- **Loss / optimizer:** cross-entropy with label smoothing 0.05, AdamW, cosine LR schedule, early stopping on validation macro-F1.
- **Export:** `torch.onnx.export` with dynamic batch, opset 17. Save `labels.json` (index → letter) and `model_meta.json` (feature version, training date, metrics) next to it.

### 4.4 Data flow for training

```
App "Collect" mode ──► JSONL files (one sample per line: label, signer_id, session, condition tags, 21 landmarks, handedness, ts)
Optional: image datasets ──► ml/scripts/extract_landmarks.py (Python HandLandmarker) ──► same JSONL format
                         ──► ml/scripts/build_dataset.py  (validate, dedupe, split by SIGNER) ──► data/processed/*.parquet
                         ──► ml/scripts/train.py ──► runs/<timestamp>/ (checkpoint, metrics, confusion matrix)
                         ──► ml/scripts/export_onnx.py ──► app/public/models/signscan.onnx + labels.json
```

**Splits are by signer, never random by sample.** Neighbouring frames from one burst are nearly identical, so a random split leaks and inflates accuracy. Use leave-signers-out (for example 7 train / 1 val / 2 test, or k-fold by signer).

---

## 5. Repository structure

```
signscan/
├── CLAUDE.md                     # project rules for Claude Code (Section 10)
├── README.md
├── docs/
│   ├── PLAN.md                   # this file
│   ├── objectives_traceability.md# objective → code → test → result
│   ├── evaluation_protocol.md    # O4 test conditions, metrics, targets
│   ├── data_collection_protocol.md # consent, setup, per-signer script
│   └── decisions.md              # answers to G1–G11 as they're decided
├── shared/
│   ├── labels.json               # canonical class list (single source of truth)
│   ├── feature_spec.md
│   └── fixtures/                 # landmark → feature test vectors for py + ts
├── ml/
│   ├── pyproject.toml
│   ├── signscan_ml/
│   │   ├── __init__.py
│   │   ├── config.py             # paths, label set, hyperparameters
│   │   ├── features.py           # normalization (mirrors app/src/lib/features.ts)
│   │   ├── augment.py
│   │   ├── dataset.py            # JSONL/parquet loading, signer-based splits
│   │   ├── models.py             # LandmarkCNN, LandmarkMLP
│   │   ├── train.py
│   │   ├── evaluate.py           # accuracy, macro-F1, per-class, per-condition, confusion matrix
│   │   └── export.py             # ONNX export + parity check
│   ├── scripts/
│   │   ├── extract_landmarks.py  # images/video → JSONL using Python HandLandmarker
│   │   ├── build_dataset.py
│   │   ├── train.py
│   │   ├── evaluate.py
│   │   ├── export_onnx.py
│   │   └── live_demo.py          # OpenCV webcam demo (sanity check without the web app)
│   └── tests/
├── app/
│   ├── package.json
│   ├── index.html
│   ├── public/models/            # signscan.onnx, labels.json, hand_landmarker.task
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── lib/
│       │   ├── camera.ts         # getUserMedia, device picker, permissions errors
│       │   ├── handTracker.ts    # MediaPipe wrapper
│       │   ├── features.ts       # normalization (mirrors ml/signscan_ml/features.py)
│       │   ├── classifier.ts     # onnxruntime-web session
│       │   ├── stabilizer.ts     # smoothing, confidence gate, hold-to-commit
│       │   ├── metrics.ts        # per-stage timing, FPS (for O4)
│       │   └── storage.ts        # progress + settings persistence, CSV export
│       ├── components/           # CameraView, LandmarkOverlay, LetterDisplay, ConfidenceBar, TextBuffer…
│       └── pages/                # Recognize, Communicate, Practice, Collect, Evaluate, About
│   └── tests/
├── data/                         # git-ignored; raw/ interim/ processed/
└── .github/workflows/ci.yml      # ruff + pytest, eslint + vitest + build
```

`data/` and any recordings are **git-ignored**. Model files under ~5 MB can be committed; otherwise use Git LFS or a release asset.

---

## 6. Phased milestones

Each phase ends with something runnable and a short note in `docs/objectives_traceability.md`.

### Phase 0. Setup and decisions (½–1 day)
- Create the monorepo layout above, `CLAUDE.md`, README, CI.
- `ml/`: `uv` project, ruff, pytest, a passing placeholder test.
- `app/`: Vite React TS, Tailwind, ESLint, vitest, a placeholder page that builds.
- `shared/labels.json` with the default 24 static letters (A–Y without J; Z excluded).
- Write `docs/decisions.md` with G1–G11 and their current defaults.
- **Done when:** CI is green on both packages; `pnpm dev` serves a page; `pytest` passes.

### Phase 1. Hand detection and tracking module (O1)
- `camera.ts`: start/stop camera, choose device, handle denied permission and no camera with clear messages.
- `handTracker.ts`: load `hand_landmarker.task` (serve it locally from `public/models/` so it works offline), `runningMode: "VIDEO"`, `numHands: 1`, GPU delegate with CPU fallback.
- `LandmarkOverlay`: draw the 21 points and connections on a canvas over the video.
- `metrics.ts`: FPS and per-stage timings (detection ms) shown in a small debug panel.
- `features.ts` + `features.py` + shared fixtures + tests for both.
- `ml/scripts/live_demo.py`: OpenCV + Python HandLandmarker overlay (proves the Python side works too).
- **Done when:** landmarks track a moving hand smoothly at ≥ 20 FPS on a mid-range laptop; feature fixtures pass in both languages.

### Phase 2. Data collection (input to O2)
- **Collect page:** enter signer ID (anonymous code), session, condition tags (lighting: bright/normal/dim; background: plain/cluttered; distance: near/far). Pick a letter, press record: capture N frames at a fixed rate (for example 10 samples/s for 5 s) only while a hand is detected. Show a count per letter. Export JSONL.
- Countdown before each burst, a guide ("vary angle slightly, move closer/farther"), and a review list to delete bad bursts.
- `extract_landmarks.py` for any image/video datasets the team decides to use for pretraining or extra data.
- `build_dataset.py`: schema validation, drop low-score detections, report counts per letter × signer × condition, signer-based split.
- Write `docs/data_collection_protocol.md` and the consent form text.
- **Done when:** a pilot dataset (team members, ~3 signers, all letters) exists, and `build_dataset.py` prints a balanced count table.

### Phase 3. Model training (O2)
- `models.py` (CNN + MLP), `augment.py`, `train.py` with seeds, config, logging to `runs/`.
- `evaluate.py`: accuracy, macro precision/recall/F1, per-class table, confusion matrix PNG, per-condition breakdown.
- `export.py`: ONNX export plus a **parity check** (PyTorch vs onnxruntime outputs within 1e-4 on the test set).
- Optional: k-fold by signer for a more honest estimate; optional image-based MobileNetV3 transfer model on cropped hand images, as a Chapter 4 comparison only.
- **Done when:** on the pilot data, the CNN beats the MLP or matches it, and the exported ONNX gives identical predictions to PyTorch.

### Phase 4. Real-time recognition interface (O3, O5)
- `classifier.ts`: load ONNX + labels, run per frame (skip frames if inference falls behind).
- `stabilizer.ts`: window majority vote, confidence threshold θ (default 0.7), "no hand" and "unsure" states.
- **Recognize page:** camera, overlay, big current letter, confidence bar, top-3 predictions (toggle).
- **Communicate page:** letters commit to a text buffer after being held stable for ~0.8 s; a space after ~1.5 s with no hand; on-screen buttons for space, backspace, clear, copy. Large, high-contrast text readable from across a table. Optional **text-to-speech** via the browser `speechSynthesis` API.
- Accessibility: keyboard operable, visible focus, WCAG AA contrast, captions for all status, no audio-only cues, `prefers-reduced-motion` respected.
- **Done when:** a person can fingerspell their name and the text buffer shows it correctly on the pilot model.

### Phase 5. Practice and learning mode (P5, O5)
- **Practice page:** shows a target letter and the team's own reference photo. Success when the stable prediction equals the target with confidence ≥ θ for ~1 s. Then a check mark and next letter.
- Modes: in order (A→Y), random, "spell a word" (a list of common Filipino names/words using static letters only), and "weak letters" (most-missed first).
- Hints: when the user is stuck, show what the model thinks it sees ("Looks like M, check your thumb position"), using a small hand-written table of commonly confused pairs.
- Progress stored on the device: attempts, successes, average time-to-correct per letter. **Export CSV** for teachers (G10).
- Stretch: J and Z via a fingertip-trajectory rule (G3).
- **Done when:** a learner can complete a full alphabet round and see per-letter stats.

### Phase 6. Evaluation (O4)
- Collect the **final dataset** (≥ 10 signers) and a separate **condition test set** from signers not in training: lighting (bright / normal indoor / dim / backlit), orientation (frontal, ±30° yaw, ±30° roll), background (plain / cluttered), distance (≈40 cm / ≈80 cm).
- Retrain on the final dataset; report signer-independent results.
- **Evaluate page** in the app: runs a scripted session (each letter × condition), logs prediction, confidence and per-stage latency, exports CSV. This measures real-time behaviour the offline test set can't.
- `evaluate.py` produces the tables and figures for Chapter 4: overall accuracy, macro-F1, per-class accuracy, confusion matrix, accuracy per condition, latency (mean, p95) per stage, FPS, plus the test hardware spec.
- Optional usability test (SUS or ISO 25010 instrument per G9).
- **Done when:** `docs/evaluation_protocol.md` targets are each reported as met or not met, with the numbers.

### Phase 7. Polish and deployment (O5)
- Offline support (service worker caching the app, MediaPipe WASM and models), loading states, error handling for no camera or old browsers.
- About page: what SignScan is and isn't (not a replacement for interpreters), privacy note (no video leaves the device), credits.
- Deploy to a static host over HTTPS; write the user manual section of the README.
- **Done when:** the deployed link works on a laptop (Chrome, Edge, Firefox) and an Android phone, including after going offline.

---

## 7. Data plan details

- **Classes:** from `shared/labels.json`. Default 24 (A–Y minus J). Add Ñ/NG/J/Z only after G2/G3 are decided.
- **Per signer:** each letter recorded in several bursts across conditions (for example 4 bursts × 50 frames), so the model sees variety, not 200 copies of one pose.
- **Signers:** aim for variety in hand size, skin tone, age and handedness. Include at least a few fluent FSL signers so the "correct" shapes are authentic.
- **Quality control:** drop frames with detection score < 0.7; flag bursts where the model (once trained) disagrees strongly with the label for manual review.
- **Public data (optional):** image datasets of ASL letters exist (for example on Kaggle); landmarks can be extracted from them with `extract_landmarks.py` for pretraining. Only use one if G1 is ASL or the shapes are verified as identical in FSL, and check its license. FSL video datasets cited in Chapter 2 (for example the 105-sign set) cover words, not the alphabet.
- **Privacy:** consent form, anonymous signer codes, store landmarks only. Landmarks are not images and are much lower risk, which is worth stating in Chapter 3.

---

## 8. Known risks and mitigations

| Risk | Mitigation |
|---|---|
| Confusable letters with similar landmarks (for example A/E/M/N/S/T, which differ by thumb placement, and K/V, U/R) | Per-class report; more data for those letters; top-3 display; hints in practice mode; consider adding finger-angle features if the CNN plateaus |
| Optimistic accuracy from frame leakage | Signer-based splits only; report signer-independent numbers |
| Python and TypeScript features drift apart | Shared fixtures tested in both CI jobs; `feature_version` in model metadata checked at load time |
| Mirroring/handedness confusion with a mirrored preview | One documented rule in `feature_spec.md`; explicit tests for left and right hands |
| Low FPS on weak laptops | Lower camera resolution, skip frames for classification, CPU fallback; record FPS on the weakest test machine |
| Not enough FSL signers | Recruit through a SPED school or Deaf organization early; start with pilot data from the team to unblock development |

---

## 9. Evaluation protocol (O4)

### 9.1 Accuracy and reliability
- Signer-independent test set. Report accuracy, macro precision, macro recall, macro-F1, per-class accuracy, confusion matrix.
- **Per-condition** accuracy (lighting, orientation, background, distance) to answer O4 directly.
- **Reliability:** the same signers repeat the test in a second session on a different day; report the consistency (for example agreement rate between sessions).

### 9.2 Processing speed
- Per frame: detection ms, feature ms, inference ms, total ms. Report mean and p95.
- End-to-end FPS. Time from a hand shape being formed to the stable letter appearing (depends on the smoothing window).
- Report device CPU/GPU, browser, camera resolution.

### 9.3 Proposed targets (confirm with adviser)
- Signer-independent macro-F1 ≥ **0.90** on 24 static letters under normal lighting.
- Accuracy under dim and backlit conditions reported, with ≥ **0.80** as the target.
- ≥ **20 FPS** and ≤ **50 ms** mean per-frame processing on a typical school laptop.
- Time to a stable letter ≤ **1 s**.

---

## 10. CLAUDE.md (paste into the repo root)

```markdown
# SignScan

Real-time sign-language alphabet recognition from an ordinary webcam.
MediaPipe Hand Landmarker → 21 landmarks → normalized 63-d feature → 1D-CNN → stabilized letter → on-screen text.
This is a capstone project. The objectives in docs/PLAN.md (O1–O5) are the acceptance criteria.

## Layout
- `ml/` Python 3.11 package `signscan_ml` (uv, PyTorch, mediapipe, onnx, onnxruntime). Training, evaluation, ONNX export.
- `app/` Vite + React + TypeScript web app. @mediapipe/tasks-vision for landmarks, onnxruntime-web for inference. All inference on-device.
- `shared/` labels.json (single source of truth for classes), feature_spec.md, fixtures/ (golden test vectors).
- `docs/` PLAN.md, decisions.md, evaluation_protocol.md, data_collection_protocol.md, objectives_traceability.md.
- `data/` is git-ignored. Never commit recordings, personal data or large datasets.

## Commands
- ML: `cd ml && uv sync && uv run pytest && uv run ruff check . && uv run ruff format --check .`
- Train: `uv run python scripts/train.py --config configs/default.yaml`
- Export: `uv run python scripts/export_onnx.py --run runs/<id>` (writes to app/public/models/)
- App: `cd app && pnpm install && pnpm dev | pnpm test | pnpm lint | pnpm build`

## Rules
- Feature normalization exists in two places: `ml/signscan_ml/features.py` and `app/src/lib/features.ts`. Change both together, bump FEATURE_VERSION, and regenerate/extend `shared/fixtures`. Both test suites must pass on the same fixtures.
- Never normalize rotation away (some letters differ only by orientation). Mirror left hands to right-hand space.
- Classes come only from `shared/labels.json`. Don't hard-code letter lists.
- Dataset splits are by signer_id, never random by sample. Report signer-independent metrics.
- Exported ONNX must pass the parity check against PyTorch before it's copied into the app.
- No camera frames or landmarks leave the device in the app. No analytics, no external calls at run time except loading the app's own static files.
- Accessibility: keyboard operable, WCAG AA contrast, no information conveyed by sound or color alone.
- Keep the MediaPipe model and WASM files served locally (public/), so the app works offline.
- When an open decision in docs/decisions.md affects your work, use the documented default and note it in your summary. Don't silently change a decision.
- Small, focused commits. Update docs/objectives_traceability.md when a phase deliverable lands.
```

---

## 11. Kickoff prompt for Claude Code

Paste this into Claude Code in an empty repository, after copying this plan to `docs/PLAN.md`:

```text
You're starting the SignScan capstone project from an empty repository. Read docs/PLAN.md in full first; it is the source of truth (objectives O1–O5, architecture, repo layout, phases, open decisions G1–G11 with defaults).

Do Phase 0 and Phase 1 now:

Phase 0
1. Create the monorepo layout from PLAN.md Section 5 (ml/, app/, shared/, docs/, data/ git-ignored, .github/workflows/ci.yml).
2. Add CLAUDE.md using PLAN.md Section 10 verbatim.
3. ml/: uv project on Python 3.11 with mediapipe, torch, numpy, pandas, pyarrow, scikit-learn, matplotlib, onnx, onnxruntime, opencv-python, pyyaml; dev deps pytest, ruff. Package signscan_ml with config.py and a placeholder test.
4. app/: Vite + React + TypeScript with Tailwind, ESLint, Prettier, vitest; deps @mediapipe/tasks-vision and onnxruntime-web. One placeholder page.
5. shared/labels.json with the 24 static letters (A–Y without J). docs/decisions.md listing G1–G11 with their defaults.
6. CI running ruff + pytest for ml/ and lint + test + build for app/.

Phase 1 (objective O1)
7. app/src/lib/camera.ts, handTracker.ts (HandLandmarker, VIDEO mode, 1 hand, GPU with CPU fallback, model file served from public/models/), metrics.ts (FPS + per-stage ms).
8. CameraView + LandmarkOverlay components and a Recognize page showing the live overlay and a debug panel (FPS, detection ms, handedness, score).
9. Feature normalization exactly as PLAN.md Section 4.2, in both ml/signscan_ml/features.py and app/src/lib/features.ts, with shared/feature_spec.md and at least 4 fixtures in shared/fixtures/ (right hand, left hand, rotated hand, scaled/translated hand). Tests in both languages read the same fixtures.
10. ml/scripts/live_demo.py: OpenCV webcam + Python HandLandmarker overlay with FPS.

Constraints: follow CLAUDE.md. Don't start model training or the Collect page yet. If something in PLAN.md is ambiguous, use the default from decisions.md and list what you assumed at the end. Finish by running all tests, lint and the app build, and give me a short summary plus the exact commands to try it locally (including how to open the camera page).
```

**Prompts for later phases** follow the same pattern: "Read docs/PLAN.md and docs/decisions.md. Do Phase N. Done-when criteria are in the plan. Run all checks and summarize what you assumed."

---

## 12. Suggested order of work for the team (non-code)

1. Decide G1 (FSL vs ASL), G4 (web vs desktop) and G3 (J/Z) with your adviser. These change the most.
2. Contact an FSL signer or SPED teacher to validate letter shapes and help recruit signers (G1, G2, G11).
3. Prepare the consent form and data collection protocol before Phase 2.
4. Confirm the Chapter 3 template (SDLC model, evaluation instrument) so Phase 6 produces exactly the tables Chapter 4 needs.
