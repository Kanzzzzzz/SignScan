import { useEffect, type ComponentType } from 'react';
import { AppProviders } from './components/AppProviders';
import { useEngineState } from './hooks/useEngine';
import { ROUTES, useHashRoute, type RoutePath } from './hooks/useHashRoute';
import { AboutPage } from './pages/AboutPage';
import { CollectPage } from './pages/CollectPage';
import { CommunicatePage } from './pages/CommunicatePage';
import { EvaluatePage } from './pages/EvaluatePage';
import { PracticePage } from './pages/PracticePage';
import { RecognizePage } from './pages/RecognizePage';
import { SettingsPage } from './pages/SettingsPage';

const PAGES: Record<RoutePath, { title: string; lead: string; el: ComponentType }> = {
  recognize: {
    title: 'Recognize',
    lead: 'Show one hand to the camera. The letter appears as you sign.',
    el: RecognizePage,
  },
  communicate: {
    title: 'Communicate',
    lead: 'Fingerspell words. Hold each letter to type it, and lower your hand for a space.',
    el: CommunicatePage,
  },
  practice: {
    title: 'Practice',
    lead: 'Make the letter shown and get instant feedback.',
    el: PracticePage,
  },
  collect: {
    title: 'Collect data',
    lead: 'Record landmark samples per letter to train the model. Landmarks only, no video.',
    el: CollectPage,
  },
  evaluate: {
    title: 'Evaluate',
    lead: 'Measure accuracy and speed under each test condition (objective O4).',
    el: EvaluatePage,
  },
  settings: { title: 'Settings', lead: 'Camera and recognition options.', el: SettingsPage },
  about: { title: 'About', lead: 'What SignScan is, and what it is not.', el: AboutPage },
};

function ModelPill() {
  const st = useEngineState();
  const map = {
    loading: ['Loading model…', 'bg-surface-2 text-muted'],
    ready: ['Model ready', 'bg-ok-soft text-ok'],
    missing: ['Letters not trained', 'bg-warn-soft text-warn'],
    error: ['Model error', 'bg-danger-soft text-danger'],
  } as const;
  const [text, cls] = map[st.model];
  return (
    <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${cls}`}>
      {text}
    </span>
  );
}

function Shell() {
  const route = useHashRoute();
  const page = PAGES[route];
  const Page = page.el;

  useEffect(() => {
    document.title = `${page.title} · SignScan`;
  }, [page.title]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <a
            href="#/recognize"
            className="flex shrink-0 items-center gap-2 font-display text-lg font-bold"
          >
            <img src="./icon.svg" alt="" className="size-7" />
            SignScan
          </a>
          <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-1 px-1">
              {ROUTES.map((r) => (
                <li key={r.path}>
                  <a
                    href={`#/${r.path}`}
                    aria-current={route === r.path ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                      route === r.path
                        ? 'bg-accent text-accent-ink'
                        : 'text-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ModelPill />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-6 pb-16 outline-none">
        <div className="mb-5">
          <h1 className="font-display text-3xl font-bold tracking-tight">{page.title}</h1>
          <p className="mt-1 text-muted">{page.lead}</p>
        </div>
        <Page />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}
