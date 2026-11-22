/** URLs of the app's own static files (served from public/, so everything works offline). */

const base = import.meta.env.BASE_URL;

export const assetUrl = (path: string) => `${base}${path.replace(/^\//, '')}`;

export const MEDIAPIPE_WASM_DIR = assetUrl('mediapipe/wasm');
export const HAND_LANDMARKER_MODEL = assetUrl('models/hand_landmarker.task');
export const CLASSIFIER_MODEL = assetUrl('models/signscan.onnx');
export const CLASSIFIER_LABELS = assetUrl('models/labels.json');
export const CLASSIFIER_META = assetUrl('models/model_meta.json');
export const referenceImageUrl = (letter: string) => assetUrl(`references/${letter}.jpg`);
