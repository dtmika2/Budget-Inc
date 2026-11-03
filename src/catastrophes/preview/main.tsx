/**
 * Preview page for special cards (special.html, catastrophes workspace): the real game screen, paused,
 * with a panel that opens any special card on demand. `?card=<id>` opens that card first,
 * `?leader=<id>` picks the leader. Nothing here is part of the game itself.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/latin-ext-500.css';
import '@fontsource/pixelify-sans/latin-ext-700.css';
import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import '@fontsource/silkscreen/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '../../ui/styles/global.css';
import { loadBundledData } from '../../data/browser';
import { App } from '../../ui/App';
import { initStore } from '../../ui/store';
import { PreviewPanel, openPreviewCard } from './PreviewPanel';
import './preview.css';

const params = new URLSearchParams(location.search);
const store = initStore(loadBundledData());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PreviewPanel />
  </StrictMode>,
);

// a running game, paused, past the first policy draft and without the tutorial
if (store.data) {
  const leaders = store.data.leaders.map((l) => l.id);
  const leader = params.get('leader') ?? '';
  store.startRun(leaders.includes(leader) ? leader : leaders[0]);
  const sim = store.sim!;
  if (sim.state.draft) store.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft.hand[0] });
  store.setUi({ tutorial: null, tutorialQueue: [], userPaused: true });
  const first = params.get('card') ?? store.data.specialCards[0]?.id;
  if (first) window.setTimeout(() => openPreviewCard(first), 400);
}
