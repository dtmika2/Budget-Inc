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
import { loadBundledData } from './data/browser';
import { App } from './ui/App';
import { initStore } from './ui/store';
import './ui/styles/global.css';

const store = initStore(loadBundledData());
// Developer hook for browser checks: only with ?debug=1
if (new URLSearchParams(location.search).get('debug') === '1') (window as unknown as { __budgetInc: unknown }).__budgetInc = store;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
