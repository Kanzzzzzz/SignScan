import { useEffect, useState } from 'react';

export const ROUTES = [
  { path: 'recognize', label: 'Recognize' },
  { path: 'communicate', label: 'Communicate' },
  { path: 'practice', label: 'Practice' },
  { path: 'collect', label: 'Collect' },
  { path: 'evaluate', label: 'Evaluate' },
  { path: 'settings', label: 'Settings' },
  { path: 'about', label: 'About' },
] as const;

export type RoutePath = (typeof ROUTES)[number]['path'];

function current(): RoutePath {
  const p = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES.find((r) => r.path === p)?.path ?? 'recognize') as RoutePath;
}

export function useHashRoute(): RoutePath {
  const [route, setRoute] = useState<RoutePath>(current);
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
