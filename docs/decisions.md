# Decisions (G1–G11)

Open questions from PLAN.md Section 2. Each row shows the **default the code currently uses**.
When the team decides, fill in *Decision* and *Date* and note what changed. Don't change a
default silently.

| # | Question | Current default (in code) | Where it lives | Decision | Date |
|---|---|---|---|---|---|
| G1 | FSL or ASL alphabet? | **FSL**, labels to be verified by a Deaf signer or SPED/FSL teacher | `shared/labels.json` → `"alphabet"` | **FSL**, per the study's Chapter 1–2 (Filipino Sign Language background, RA 11106). Letter shapes still need checking by an FSL signer. ASL data is allowed only for letters the consultant confirms are identical in FSL. | 2026-11-22 |
| G2 | Ñ and NG: classes? static? | **Not included**: 26 Latin letters minus J/Z | `shared/labels.json` | _open_ | |
| G3 | J and Z (motion letters) | **Excluded** → 24 static classes. Stretch: fingertip-trajectory rule (not built) | `shared/labels.json` | _open_ | |
| G4 | Platform | **Web app** (Vite + React + TS), on-device inference. Python OpenCV demo kept as a sanity check | `app/`, `ml/scripts/live_demo.py` | _open_ | |
| G5 | What "CNN" means | **1D-CNN over 21 landmarks** (main) + **MLP baseline**. No image CNN in the app | `ml/signscan_ml/models.py` | _open_ | |
| G6 | Dataset size, consent | ≥ 10 signers, ≥ 200 samples/letter/signer, signed consent, **landmarks only** | `docs/data_collection_protocol.md` | _open_ | |
| G7 | One hand or two? Left-handers? | One dominant hand. **Left hands mirrored** to right-hand space | `features.py` / `features.ts` | _open_ | |
| G8 | Output form | Big live letter **and** a text buffer (hold-to-commit, space, backspace) | Recognize + Communicate pages | _open_ | |
| G9 | Evaluation targets | Macro-F1 ≥ 0.90 (normal light), ≥ 0.80 dim/backlit, ≥ 20 FPS, ≤ 50 ms/frame, ≤ 1 s to stable letter. Usability: SUS (to confirm) | `docs/evaluation_protocol.md` | _open_ | |
| G10 | Educator monitoring | **Out of scope for v1**. Progress on the device + "Export CSV for teacher" | Practice page | _open_ | |
| G11 | Reference images | Team's own photos in `app/public/references/<L>.jpg`, captured in the app (Take photo / Upload / auto-save on first correct sign) | Practice page | **Team-approved FSL alphabet chart** (`docs/assets/fsl_alphabet_chart.png`, approval confirmed by the team), cut into `A.jpg`…`Z.jpg` by `ml/scripts/slice_reference_chart.py`. Chart images take priority; in-app photos only for letters with no chart image. | 2026-11-22 |

## Implementation notes and assumptions

These choices were made while building and aren't covered by G1–G11:

- **Tooling:** the plan names `uv` and `pnpm`. Both packages work with them, and also with plain
  `pip` + `venv` and `npm` (a `package-lock.json` is committed, and CI uses `npm ci`).
- **Python version:** `requires-python >= 3.11`. CI pins 3.11 (`ml/.python-version`). Local
  development was verified on 3.13.
- **Handedness rule:** MediaPipe reports handedness as if the frame were a mirrored selfie.
  SignScan always processes raw frames (only the preview is mirrored), so the label is swapped
  (`true_handedness` / `trueHandedness`). Recorded data stores the signer's actual hand.
- **Stabilizer defaults:** window 8 frames, θ = 0.7, 60% of the window must agree.
  Communicate mode: hold 0.8 s to type, 1.5 s with no hand for a space. All adjustable in Settings.
- **Practice pass rule:** the stable letter equals the target with confidence ≥ θ for 1 s.
  A hint appears after 6 s.
- **Augmentation:** rotation ±15°, scale ±10%, jitter σ = 0.02, mirror p = 0.1 (covers
  handedness misdetection), landmark dropout p = 0.05.
- **One-click training (2026-11-22, requested by the team):** under `npm run dev`, the Collect page's
  **Train model** button (or **Auto-train**) sends recordings to the local dev server. It runs
  `ml/scripts/pipeline.py` (build → train → export) and loads the new model automatically. Data stays
  on the computer, and production builds don't include this.
- **Small datasets:** batch size shrinks to give at least ~8 steps per epoch, and early stopping never
  triggers before epoch 30. With a single signer there are no validation signers, so the reported score
  is on training data and isn't a real accuracy figure.
- **ONNX model output** includes the softmax (`probs`), so the app doesn't need its own.
