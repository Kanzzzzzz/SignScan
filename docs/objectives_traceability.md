# Objectives traceability

Objective → code → test → result. Update the **Result** column as phases finish.

| Obj. | Deliverable | Code | Tests / checks | Status | Result |
|---|---|---|---|---|---|
| **O1** Real-time hand detection and tracking | MediaPipe wrapper, landmark overlay, FPS + per-stage timing, Python live demo | `app/src/lib/handTracker.ts`, `camera.ts`, `metrics.ts`, `engine.ts`, `components/CameraView.tsx`, `components/DebugPanel.tsx`, `ml/scripts/live_demo.py` | `app/tests/utils.test.ts` (metrics); headless browser smoke test (fake camera) | **Built** | Headless Edge, fake camera, GPU delegate: ~58 FPS. _Measure on a real mid-range laptop with a hand in view._ |
| **O1** Feature contract | Normalization in Python and TS, shared golden fixtures | `ml/signscan_ml/features.py`, `app/src/lib/features.ts`, `shared/feature_spec.md`, `shared/fixtures/` | `ml/tests/test_features.py`, `app/tests/features.test.ts` (same 6 fixtures) | **Built** | Both suites pass on the same fixtures |
| **O2** Data collection | Collect page (signer code, conditions, bursts, review, JSONL export), image-dataset extractor, dataset builder | `app/src/pages/CollectPage.tsx`, `lib/collectStore.ts`, `ml/scripts/extract_landmarks.py`, `ml/scripts/build_dataset.py`, `ml/signscan_ml/dataset.py` | `ml/tests/test_pipeline.py` (validation, filtering, dedupe, signer split) | **Built** | _Pilot dataset not yet recorded_ |
| **O2** One-click training | Train / Auto-train on the Collect page → local dev server → `pipeline.py` → model hot-loaded | `app/scripts/trainer-plugin.ts`, `app/src/components/TrainPanel.tsx`, `ml/signscan_ml/pipeline.py`, `ml/scripts/pipeline.py` | `test_pipeline.py::test_run_pipeline_*`; headless browser E2E (seeded bursts → Train → "Model ready" in ~20 s) | **Built** | First model trained on signer 101: letters A–D (153 samples, 1 burst each) |
| **O2** CNN classifier | 1D-CNN + MLP baseline, augmentation, training, evaluation, ONNX export with parity | `ml/signscan_ml/models.py`, `augment.py`, `train.py`, `evaluate.py`, `export.py`, `ml/scripts/*.py` | `test_pipeline.py::test_train_and_export_end_to_end` (synthetic data: train → evaluate → export → parity) | **Built, untrained** | _Needs real data_ |
| **O3** Real-time text interface | Recognize page (letter, confidence, top 3), Communicate page (text buffer, hold-to-commit, space/backspace/clear/copy, TTS) | `app/src/pages/RecognizePage.tsx`, `CommunicatePage.tsx`, `lib/stabilizer.ts`, `lib/classifier.ts` | `app/tests/stabilizer.test.ts`; browser smoke test loads an ONNX model ("Model ready") | **Built** | _Fingerspell-your-name test pending a trained model_ |
| **P5 / O5** Practice | Target letter, reference photo, hold-to-pass, hints for confusable pairs, 4 modes, per-letter progress, CSV export | `app/src/pages/PracticePage.tsx`, `lib/hints.ts`, `lib/storage.ts` | `app/tests/utils.test.ts` (progress, weakest-first, hints) | **Built** | _Reference photos to be added (G11)_ |
| **O4** Evaluation | Evaluate page (scripted letter × condition sessions, per-frame CSV, latency mean/p95), offline metrics, per-condition accuracy, confusion matrix | `app/src/pages/EvaluatePage.tsx`, `ml/signscan_ml/evaluate.py`, `ml/scripts/evaluate.py` | `test_pipeline.py` (metrics + confusion matrix written) | **Built** | _Run per `docs/evaluation_protocol.md`_ |
| **O5** Accessible, no special hardware | Webcam only; runs in the browser; offline (service worker, local WASM + models); keyboard operable; AA contrast; reduced motion | `app/public/sw.js`, `app/src/main.tsx`, `app/src/index.css` | Smoke test: service worker activates | **Built** | _Test on Chrome, Edge, Firefox and Android; test offline_ |

## Not built (by decision)

- J/Z trajectory rule (G3 stretch)
- Educator accounts or a server (G10)
- Image-based MobileNet comparison (optional, Chapter 4 only)
- Playwright end-to-end test in CI. Today's browser check is a manual headless smoke test.
