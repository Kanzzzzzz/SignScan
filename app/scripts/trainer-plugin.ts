/**
 * Dev-only local helper (`npm run dev`).
 *   PUT/DELETE /__signscan/reference/<L> -> app/public/references/<L>.jpg (Practice photos)
 * and one-click training for the Collect page:
 *   POST /__signscan/train  (JSONL body) -> writes data/raw/app-collected.jsonl
 *                                         -> runs ml/scripts/pipeline.py with ml/.venv
 *   GET  /__signscan/status              -> progress, log tail, result
 * Everything stays on this computer. Not part of production builds (apply: 'serve').
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const MAX_BODY = 300 * 1024 * 1024;
const MAX_PHOTO = 5 * 1024 * 1024;
const LOG_LINES = 300;

interface TrainerState {
  running: boolean;
  step: string;
  log: string[];
  result: unknown;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  runId: number;
}

function findPython(repo: string): string | null {
  const candidates = [
    process.env.SIGNSCAN_PYTHON,
    join(repo, 'ml', '.venv', 'Scripts', 'python.exe'),
    join(repo, 'ml', '.venv', 'bin', 'python'),
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}

function readBody(req: IncomingMessage, max = MAX_BODY): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        fail(new Error('Upload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function signscanTrainer(): Plugin {
  let repo = '';
  let child: ChildProcess | null = null;
  const labels = (): string[] =>
    JSON.parse(readFileSync(join(repo, 'shared', 'labels.json'), 'utf8')).labels;
  const state: TrainerState = {
    running: false,
    step: '',
    log: [],
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    runId: 0,
  };

  const pushLog = (line: string) => {
    state.log.push(line);
    if (state.log.length > LOG_LINES) state.log.splice(0, state.log.length - LOG_LINES);
    const step = line.match(/^\[(\d)\/3\]\s*(.*)$/);
    if (step) state.step = `${step[1]}/3 ${step[2]}`;
    else if (/^epoch\s+\d+/.test(line)) state.step = `2/3 Training (${line.trim()})`;
    if (line.startsWith('RESULT ')) {
      try {
        state.result = JSON.parse(line.slice(7));
      } catch {
        /* ignore */
      }
    }
    if (line.startsWith('ERROR: ')) state.error = line.slice(7);
  };

  const start = (python: string) => {
    state.running = true;
    state.step = 'Starting…';
    state.log = [];
    state.result = null;
    state.error = null;
    state.startedAt = Date.now();
    state.finishedAt = null;
    state.runId += 1;
    child = spawn(python, ['-u', join('scripts', 'pipeline.py')], {
      cwd: join(repo, 'ml'),
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let partial = '';
    const onData = (buf: Buffer) => {
      const text = partial + buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      partial = lines.pop() ?? '';
      lines.filter((l) => l.trim()).forEach(pushLog);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => {
      state.error = `Could not run Python: ${err.message}`;
    });
    child.on('close', (code) => {
      if (partial.trim()) pushLog(partial);
      state.running = false;
      state.finishedAt = Date.now();
      if (code !== 0 && !state.error) state.error = `Training stopped (exit code ${code}).`;
      state.step = state.error ? 'Failed' : 'Done';
      child = null;
    });
  };

  return {
    name: 'signscan-trainer',
    apply: 'serve',
    configResolved(config) {
      repo = resolve(config.root, '..');
    },
    configureServer(server) {
      server.middlewares.use('/__signscan', async (req, res) => {
        // A custom header can't be sent cross-site without CORS approval, so other websites
        // can't trigger training on this machine.
        if (req.headers['x-signscan'] !== '1') return send(res, 403, { error: 'forbidden' });
        const python = findPython(repo);
        const url = (req.url ?? '').split('?')[0];

        if (req.method === 'GET' && url === '/status') {
          return send(res, 200, { available: true, python, ...state });
        }
        if (req.method === 'POST' && url === '/train') {
          if (state.running) return send(res, 409, { error: 'Training is already running.' });
          if (!python) {
            return send(res, 500, {
              error:
                'Python environment not found. Run once: cd ml && python -m venv .venv && ' +
                '.venv/Scripts/python -m pip install -e ".[dev]"  (or set SIGNSCAN_PYTHON).',
            });
          }
          try {
            const body = (await readBody(req)).toString('utf8');
            if (!body.trim()) return send(res, 400, { error: 'No samples to train on.' });
            const rawDir = join(repo, 'data', 'raw');
            mkdirSync(rawDir, { recursive: true });
            writeFileSync(join(rawDir, 'app-collected.jsonl'), body);
          } catch (e) {
            return send(res, 400, { error: (e as Error).message });
          }
          start(python);
          return send(res, 202, { started: true, runId: state.runId });
        }
        // Practice reference photos -> app/public/references/<LETTER>.jpg
        const ref = url.match(/^\/reference\/([^/]+)$/);
        if (ref) {
          const letter = decodeURIComponent(ref[1]);
          if (!labels().includes(letter)) return send(res, 400, { error: 'unknown letter' });
          const file = join(repo, 'app', 'public', 'references', `${letter}.jpg`);
          if (req.method === 'PUT') {
            try {
              const img = await readBody(req, MAX_PHOTO);
              // JPEG files start with FF D8 FF
              if (img.length < 3 || img[0] !== 0xff || img[1] !== 0xd8 || img[2] !== 0xff) {
                return send(res, 400, { error: 'expected a JPEG image' });
              }
              mkdirSync(dirname(file), { recursive: true });
              writeFileSync(file, img);
              return send(res, 200, { saved: `public/references/${letter}.jpg` });
            } catch (e) {
              return send(res, 400, { error: (e as Error).message });
            }
          }
          if (req.method === 'DELETE') {
            rmSync(file, { force: true });
            return send(res, 200, { deleted: true });
          }
        }
        if (req.method === 'POST' && url === '/cancel') {
          child?.kill();
          return send(res, 200, { cancelled: !!child });
        }
        return send(res, 404, { error: 'not found' });
      });
    },
  };
}
