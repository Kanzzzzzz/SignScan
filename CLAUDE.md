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
- No camera frames or landmarks leave the device in the app. No analytics, no external calls at run time except loading the app's own static files. Only exception: the dev-only helper (`app/scripts/trainer-plugin.ts`, active under `vite` dev only) receives Collect landmarks for one-click training, and Practice reference photos (hand crops the user explicitly takes or allows), from the browser on the same machine. It must never exist in production builds.
- Accessibility: keyboard operable, WCAG AA contrast, no information conveyed by sound or color alone.
- Keep the MediaPipe model and WASM files served locally (public/), so the app works offline.
- When an open decision in docs/decisions.md affects your work, use the documented default and note it in your summary. Don't silently change a decision.
- Small, focused commits. Update docs/objectives_traceability.md when a phase deliverable lands.

## Without uv / pnpm
Both packages also work with plain pip and npm:
- ML: `cd ml && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"` then `.venv/Scripts/python -m pytest` (use `.venv/bin/python` on macOS/Linux).
- App: `cd app && npm install && npm run dev | npm test | npm run lint | npm run build`.
