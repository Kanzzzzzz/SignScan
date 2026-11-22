"""Everything in one command: build dataset -> train -> export to the app.

python scripts/pipeline.py                 # uses ../data/raw, writes ../app/public/models
python scripts/pipeline.py --model mlp     # baseline instead of the CNN

The last line of output is `RESULT {json}` (read by the app's Train button), or `ERROR: ...`.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from signscan_ml.config import APP_MODELS_DIR, PROCESSED_DIR, RAW_DIR  # noqa: E402
from signscan_ml.pipeline import PipelineError, run_pipeline  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, default=RAW_DIR)
    ap.add_argument("--processed", type=Path, default=PROCESSED_DIR)
    ap.add_argument("--out", type=Path, default=APP_MODELS_DIR)
    ap.add_argument("--config", type=Path, default=None)
    ap.add_argument("--model", choices=["cnn", "mlp"], default=None)
    ap.add_argument("--epochs", type=int, default=None)
    args = ap.parse_args()

    try:
        result = run_pipeline(
            args.raw,
            args.processed,
            args.out,
            config=args.config,
            model=args.model,
            epochs=args.epochs,
            log=lambda m: print(m, flush=True),
        )
    except PipelineError as e:
        print(f"ERROR: {e}", flush=True)
        return 2
    except Exception as e:  # noqa: BLE001 - report anything to the app
        traceback.print_exc()
        print(f"ERROR: {type(e).__name__}: {e}", flush=True)
        return 1
    print("RESULT " + json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
