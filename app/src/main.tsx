import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support (production builds only): cache the app, WASM and models after first visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // Cache what this first visit already downloaded (hashed JS/CSS, WASM, models).
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'cache-urls', urls: [location.href, ...urls] });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}
