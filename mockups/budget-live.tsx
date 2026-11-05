/**
 * Dev-only harness for the real budget vote screen (phase 23): starts a run, plays it to the first budget
 * vote with the first-card bot and shows the screen. Not part of the game build.
 *
 * URL: /mockups/budget-live.html?hover=<row>:<steps>&metric=<lane row>
 *   set    - click slider cells first, comma separated <row>:<steps>, e.g. 0:2,1:-1
 *   hover  - hover the slider cell of that row (0-based) at that step value, e.g. 1:2
 *   metric - hover that impact-lane row (0-based, in page order)
 *   tree   - `1`: open the skill tree in Q2 with 12 PK and the first active ability owned (P29)
 *   node   - with tree: select this box in the panel (e.g. c_r3pb)
 *   stop   - `draft`: stop at the first policy draft of Q2 instead (policy cards, P24)
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
import '../src/ui/styles/global.css';
import { config } from '../src/config';
import { createBot } from '../src/core/bots';
import { resolveSpecialForBot } from '../src/core/specialCards';
import { loadBundledData } from '../src/data/browser';
import { App } from '../src/ui/App';
import { initStore } from '../src/ui/store';

const params = new URLSearchParams(location.search);
const store = initStore(loadBundledData());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (store.data) {
  store.startRun(store.data.leaders[0].id);
  const sim = store.sim!;
  const bot = createBot('firstCard', 'live');
  const target = params.get('stop') === 'draft' || params.get('tree') ? 'draft' : 'budgetVote';
  for (let n = 0; n < 50000 && !(sim.state.phase === target && sim.state.quarter > 1) && !(target === 'budgetVote' && sim.state.phase === 'budgetVote'); n++) {
    if (sim.state.phase === 'running') sim.tick();
    else if (sim.state.phase === 'special') resolveSpecialForBot(sim);
    else bot.act(sim);
  }
  store.setUi({ tutorial: null, tutorialQueue: [], userPaused: true });
  if (params.get('tree')) {
    if (sim.state.draft) store.dispatch({ kind: 'pickPolicy', cardId: sim.state.draft.hand[0] });
    sim.state.pc = 12;
    // demo: own the path to an active ability (Koalicni snidane)
    for (const id of ['c_r2t', 'c_r1p', 'c_r2p', 'c_r3pb']) if (!sim.state.ownedUpgrades.includes(id)) sim.state.ownedUpgrades.push(id);
    store.openModal('upgrades');
  }

  const hoverOver = (el: Element | null | undefined) => el?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    await document.fonts.ready;
    await wait(300);
    const cellAt = (row: number, steps: number) =>
      document.querySelectorAll('.bsl__row')[row]?.querySelectorAll<HTMLButtonElement>('.bsl__cell')[steps - config.budgetVote.sliders.minSteps];
    for (const pair of (params.get('set') ?? '').split(',').filter(Boolean)) {
      const [row, steps] = pair.split(':').map(Number);
      cellAt(row, steps)?.click();
      await wait(50);
    }
    const hover = params.get('hover');
    if (hover) {
      const [row, steps] = hover.split(':').map(Number);
      hoverOver(cellAt(row, steps));
      await wait(config.budgetAdvice.hoverDelayMs + 200);
    }
    const node = params.get('node');
    if (node) document.querySelector<HTMLElement>(`[data-node="${node}"]`)?.click();
    const metric = params.get('metric');
    if (metric) hoverOver(document.querySelectorAll('.bscreen__impact .lane__row')[Number(metric)]);
    await wait(config.budgetAdvice.hoverDelayMs + 200);
    document.body.dataset.ready = '1';
  })();
}
