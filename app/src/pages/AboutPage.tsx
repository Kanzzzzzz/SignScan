import { useEngineState } from '../hooks/useEngine';
import { FEATURE_VERSION } from '../lib/features';
import { ALPHABET, LABELS } from '../lib/labels';

export function AboutPage() {
  const st = useEngineState();
  const m = st.meta;
  const test = (m?.metrics as { test?: { accuracy?: number; macro_f1?: number; n?: number } })
    ?.test;
  return (
    <article className="mx-auto grid max-w-2xl gap-5 leading-relaxed">
      <section className="card p-6">
        <h2 className="font-display text-3xl font-bold">SignScan</h2>
        <p className="mt-2">
          SignScan recognizes static sign-language alphabet hand shapes from an ordinary webcam and
          shows them as text. It finds your hand with MediaPipe, reads 21 points on it, and a small
          neural network (a 1D-CNN) works out which letter the hand shape is.
        </p>
        <p className="mt-2">
          Use it to fingerspell to someone who doesn&apos;t know the alphabet, or to practise at
          your own pace and get instant feedback.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">What SignScan is not</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            It is <strong>not a replacement for a sign-language interpreter</strong>.
          </li>
          <li>
            It reads single, static letters only. It does not read words, sentences, movement,
            facial expressions or other non-manual markers.
          </li>
          <li>Letters that involve movement (J and Z) aren&apos;t recognized in this version.</li>
          <li>Accuracy depends on lighting, camera angle and how the hand is held.</li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <p className="mt-2">
          Everything runs in your browser. Camera video is <strong>never uploaded</strong> or saved.
          Practice progress and settings stay on this device. On the Collect page only the 21
          hand-landmark points are stored, never images. You decide when to export them.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Model</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Alphabet</dt>
          <dd>
            {ALPHABET}: {LABELS.length} static letters ({LABELS.join(' ')})
          </dd>
          <dt className="text-muted">Status</dt>
          <dd>{st.model === 'ready' ? 'Loaded' : st.model}</dd>
          {m && (
            <>
              <dt className="text-muted">Exported</dt>
              <dd>
                {m.exported_at} {m.run_id ? `(run ${m.run_id})` : ''}
              </dd>
              {test?.accuracy !== undefined && (
                <>
                  <dt className="text-muted">Test accuracy</dt>
                  <dd>
                    {(test.accuracy * 100).toFixed(1)}% · macro-F1{' '}
                    {((test.macro_f1 ?? 0) * 100).toFixed(1)}% (n={test.n}, unseen signers)
                  </dd>
                </>
              )}
            </>
          )}
          <dt className="text-muted">Feature version</dt>
          <dd>{FEATURE_VERSION}</dd>
          <dt className="text-muted">Hand tracking</dt>
          <dd>MediaPipe Hand Landmarker{st.delegate ? ` (${st.delegate})` : ''}</dd>
        </dl>
      </section>

      <section className="card p-6 text-sm text-muted">
        <h2 className="text-base font-semibold text-ink">Credits</h2>
        <p className="mt-2">
          A capstone project. Built with MediaPipe Tasks Vision (Apache 2.0), ONNX Runtime Web
          (MIT), PyTorch, React and Vite. Hand-shape references and letter labels are to be checked
          by a Filipino Sign Language consultant.
        </p>
      </section>
    </article>
  );
}
