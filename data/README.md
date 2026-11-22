# data/ (git-ignored)

- `raw/` JSONL files exported from the app's **Collect** page or produced by `ml/scripts/extract_landmarks.py`
- `interim/` anything in between
- `processed/` output of `ml/scripts/build_dataset.py` (`dataset.parquet` + `splits.json`)

Nothing in this folder except this README is committed. Store landmarks only, never video.
See `docs/data_collection_protocol.md`.
