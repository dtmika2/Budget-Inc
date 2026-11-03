import { useEffect } from 'react';
import { DataError } from './screens/DataError';
import { FinalScreen } from './screens/FinalScreen';
import { Game } from './screens/Game';
import { HowToPlay } from './screens/HowToPlay';
import { LeaderSelect } from './screens/LeaderSelect';
import { MainMenu } from './screens/MainMenu';
import { SettingsScreen } from './screens/SettingsScreen';
import { getStore, useStore } from './store';

/** Window-level listeners: auto-pause on blur / hidden tab, mobile breakpoint, leave-page warning. */
function useGlobalListeners() {
  useEffect(() => {
    const store = getStore();
    const blur = () => store.setUi({ blurred: true });
    const focus = () => store.setUi({ blurred: false });
    const vis = () => store.setUi({ blurred: document.hidden });
    const mq = matchMedia('(max-width: 760px)');
    const onMq = () => store.setUi({ isMobile: mq.matches });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.ui.screen === 'game' && store.sim && !store.sim.isOver) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', vis);
    mq.addEventListener('change', onMq);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', vis);
      mq.removeEventListener('change', onMq);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
}

export function App() {
  useGlobalListeners();
  const screen = useStore((s) => s.ui.screen);
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', reduced);
  }, [reduced]);

  switch (screen) {
    case 'dataError':
      return <DataError />;
    case 'menu':
      return <MainMenu />;
    case 'howto':
      return <HowToPlay />;
    case 'settings':
      return <SettingsScreen />;
    case 'select':
      return <LeaderSelect />;
    case 'game':
      return <Game />;
    case 'final':
      return <FinalScreen />;
  }
}
