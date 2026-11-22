# Feature specification (FEATURE_VERSION = 1)

The landmark → feature transform is implemented twice and must stay identical:

- Python: `ml/signscan_ml/features.py`
- TypeScript: `app/src/lib/features.ts`

Both test suites run against the same golden vectors in `shared/fixtures/*.json`.
If you change anything here, change both implementations, bump `FEATURE_VERSION`
(in both files and in `shared/labels.json`), and regenerate the fixtures with
`python ml/scripts/make_fixtures.py`.

## Input

| Field | Meaning |
|---|---|
| `landmarks` | 21 points `[x, y, z]` straight from MediaPipe Hand Landmarker (`landmarks`, not `worldLandmarks`). `x`, `y` are normalized to `[0, 1]` by image width and height; `z` is relative depth on roughly the same scale as `x`. |
| `handedness` | The signer's **actual** hand, `"Right"` or `"Left"` (see the handedness rule below). |
| `image_width`, `image_height` | Size in pixels of the frame given to the landmarker. |

## Handedness rule

MediaPipe labels handedness as if the input image were mirrored (a selfie view).
SignScan always gives the landmarker the **raw, unmirrored** camera frame. Only the
on-screen preview is mirrored, using CSS. So MediaPipe's label is the opposite of the
signer's real hand:

```
actual_hand = "Right" if mediapipe_label == "Left" else "Left"   # raw (unmirrored) frame
actual_hand = mediapipe_label                                     # frame already mirrored
```

Helpers: `true_handedness()` (Python) and `trueHandedness()` (TypeScript).
Recorded datasets store `actual_hand` in the `handedness` field.

## Transform

1. **Aspect:** `x ← x · (image_width / image_height)`. `y` and `z` are unchanged.
2. **Mirror:** if `handedness == "Left"`, `x ← −x`. A left hand then sits in the same
   space as a right hand, so one model serves both.
3. **Translate:** subtract landmark 0 (wrist) from every point.
4. **Scale:** divide every coordinate by `s = ‖p9 − p0‖` (3D Euclidean distance from the
   wrist to the middle-finger MCP, measured after steps 1–3). If `s < 1e-6`, use
   `s = max_i ‖p_i‖` instead. If that is also `< 1e-6`, the output is all zeros.
5. **No rotation normalization.** Some letters differ mainly in hand orientation, so
   orientation stays in the features on purpose.
6. **Flatten** in landmark order: `[x0, y0, z0, x1, y1, z1, …, x20, y20, z20]` (63 floats).

## Invariants the tests check

- Moving the hand around the frame (translation) doesn't change the features.
- Resizing the hand uniformly (scale) doesn't change the features.
- A left hand that is the exact mirror image of a right hand gives the same features.
- A rotated hand gives **different** features.
- Landmark 0 is always `(0, 0, 0)`, and `‖feature point 9‖ = 1` (unless the fallback applies).

## Fixture format

```json
{
  "name": "right_hand",
  "description": "…",
  "input": { "landmarks": [[x, y, z], …21], "handedness": "Right", "image_width": 640, "image_height": 480 },
  "expected": [63 floats]
}
```

Implementations must match `expected` to within an absolute tolerance of `1e-5`.
