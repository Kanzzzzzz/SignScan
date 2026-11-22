"""OpenCV webcam demo: Python HandLandmarker overlay + FPS, and live predictions if a model exists.

    python scripts/live_demo.py                 # landmarks only
    python scripts/live_demo.py --onnx ../app/public/models/signscan.onnx

Press q or Esc to quit.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2  # noqa: E402
import numpy as np  # noqa: E402

from signscan_ml.config import APP_MODELS_DIR  # noqa: E402
from signscan_ml.features import normalize_landmarks  # noqa: E402
from signscan_ml.landmarker import HAND_CONNECTIONS, HandTracker  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--onnx", type=Path, default=APP_MODELS_DIR / "signscan.onnx")
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=480)
    args = ap.parse_args()

    session = labels = None
    if args.onnx.exists():
        import onnxruntime as ort

        session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
        labels = json.loads((args.onnx.parent / "labels.json").read_text())
        print(f"loaded model {args.onnx} ({len(labels)} classes)")
    else:
        print("no model found; showing landmarks only")

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    if not cap.isOpened():
        print("could not open camera")
        return 1

    fps, last = 0.0, time.perf_counter()
    t_start = time.perf_counter()
    with HandTracker("video") as tracker:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            h, w = bgr.shape[:2]
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            t0 = time.perf_counter()
            res = tracker.detect(rgb, int((t0 - t_start) * 1000))
            det_ms = (time.perf_counter() - t0) * 1000
            view = cv2.flip(bgr, 1)  # mirror ONLY the preview (landmarker saw the raw frame)
            text = f"FPS {fps:4.1f}  detect {det_ms:4.1f} ms"
            if res is not None:
                pts = [(int((1 - x) * w), int(y * h)) for x, y, _ in res.landmarks]
                for a, b in HAND_CONNECTIONS:
                    cv2.line(view, pts[a], pts[b], (80, 220, 120), 2)
                for p in pts:
                    cv2.circle(view, p, 4, (255, 255, 255), -1)
                text += f"  {res.handedness} {res.score:.2f}"
                if session is not None:
                    feat = normalize_landmarks(res.landmarks, res.handedness, w, h)[None, :]
                    probs = session.run(None, {"features": feat.astype(np.float32)})[0][0]
                    k = int(probs.argmax())
                    cv2.putText(
                        view,
                        f"{labels[k]} {probs[k]:.2f}",
                        (20, h - 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        2.0,
                        (255, 255, 255),
                        4,
                    )
            cv2.putText(view, text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.imshow("SignScan live demo (q to quit)", view)
            now = time.perf_counter()
            fps = 0.9 * fps + 0.1 * (1.0 / max(1e-6, now - last))
            last = now
            if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                break
    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
