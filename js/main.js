// Entry point.
import * as App from './app.js';
import { Tour } from './tour.js';

App.init();
const tour = new Tour();
window.__tour = tour; // used by automated tests

document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'start-tour') { e.preventDefault(); tour.start(0); }
  if (b.dataset.action === 'resume-tour') { e.preventDefault(); tour.start(App.store.get('tourStep', 0)); }
});

// Warm up Sam's artwork in the background so the tour starts quickly.
const warm = () => App.loadSam().then(m => m.preload?.()).catch(() => {});
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 1200);
