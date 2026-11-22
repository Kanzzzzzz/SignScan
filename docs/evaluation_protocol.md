# Evaluation protocol (Objective O4)

Targets are proposals until the adviser confirms them (decisions.md G9).

## 1. Targets

| Metric | Target | How it's measured |
|---|---|---|
| Signer-independent macro-F1, 24 static letters, normal lighting | ≥ 0.90 | `ml/scripts/evaluate.py --run runs/<id>` on test signers |
| Accuracy under dim and backlit conditions | ≥ 0.80 | per-condition table (offline) + Evaluate page sessions |
| Frame rate | ≥ 20 FPS | Evaluate page → Processing speed |
| Mean processing time per frame | ≤ 50 ms | Evaluate page → Total per frame (mean, p95) |
| Time from hand shape to stable letter | ≤ 1 s | Evaluate page → "Mean time to stable" |

## 2. Test set

- Signers who are **not** in the training data (signer-based split, never random by frame).
- Conditions (record each signer under each condition the team can manage):

| Factor | Levels |
|---|---|
| Lighting | bright · normal indoor · dim · backlit |
| Orientation | frontal · ±30° yaw · ±30° roll |
| Background | plain · cluttered |
| Distance | ≈ 40 cm (near) · ≈ 80 cm (far) |

## 3. Procedure

### 3.1 Offline accuracy (landmark test set)
1. Record the test signers on the **Collect** page, with condition tags set correctly.
2. `python scripts/build_dataset.py --test-signers T01 T02 …` keeps them out of training.
3. Train: `python scripts/train.py --config configs/default.yaml` (and `--model mlp` for the baseline).
4. `python scripts/evaluate.py --run runs/<id>` writes `eval/metrics_test.json`, `per_class_test.csv` and
   `confusion_test.png`, and prints accuracy per condition.

### 3.2 Real-time accuracy and speed (in the app)
1. Open **Evaluate**, enter the signer code, set the condition dropdowns.
2. Start the session. For each letter there's a 3 s countdown, then N frames are logged.
3. Export both CSVs. Repeat for every condition.
4. `python scripts/evaluate.py --app-csv <frames.csv>` gives accuracy per letter and per condition, plus latency mean/p95 per stage.

### 3.3 Reliability
The same signers repeat 3.2 in a second session on another day. Report agreement between
sessions (the share of letters whose correctness matches) and the change in accuracy.

### 3.4 Report with every result
Laptop/phone model, CPU, GPU, browser and version, camera resolution, MediaPipe delegate (GPU/CPU),
model run ID (About page), date.

## 4. Results table (fill in)

| Condition | n | Accuracy | Macro-F1 | Target met? |
|---|---|---|---|---|
| Normal lighting | | | | |
| Bright | | | | |
| Dim | | | | |
| Backlit | | | | |
| ±30° yaw | | | | |
| ±30° roll | | | | |
| Cluttered background | | | | |
| Far (≈ 80 cm) | | | | |

| Speed | Mean | p95 | Target met? |
|---|---|---|---|
| Detection (ms) | | | |
| Classification (ms) | | | |
| Total per frame (ms) | | | |
| FPS | | | |
| Time to stable letter (s) | | | |

## 5. Usability (optional)
System Usability Scale (SUS) or an ISO/IEC 25010 questionnaire, as the school's Chapter 3 template requires.
