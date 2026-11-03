import { t } from '@i18n/index';
import { DebugOverlay } from '../DebugOverlay';
import { LeaderDock } from '../hud/LeaderDock';
import { TopBar } from '../hud/TopBar';
import { CzMap, RegionScreen } from '@/regions';
import { BudgetVoteModal } from '../modals/BudgetVoteModal';
import { CompromiseModal } from '../modals/CompromiseModal';
import { DraftModal } from '../modals/DraftModal';
import { ElectionNight } from '../modals/ElectionNight';
import { EndingCard } from '../modals/EndingCard';
import { PauseMenu } from '../modals/PauseMenu';
import { SettingsModal } from '../modals/Settings';
import { SidePanel } from '../panel/SidePanel';
import { PopupStack } from '@/catastrophes';
import { PledgeTracker } from '../demands/PledgeTracker';
import { getStore, useStore } from '../store';
import { Tutorial } from '../tutorial/Tutorial';
import { UpgradeButton, UpgradeTree } from '@/skilltree';

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';

function PausedBadge() {
  const paused = useStore((s) => s.ui.userPaused || s.ui.blurred);
  return paused ? <div className="paused-badge">{t('hud.paused')}</div> : null;
}

export function Game() {
  const store = getStore();
  const phase = useStore((s) => s.sim?.state.phase);
  const modal = useStore((s) => s.ui.modal);
  if (!store.sim) return null;
  return (
    <div className="game">
      <TopBar />
      <div className="game__main">
        <SidePanel />
        <main className="game__stage">
          <button className="btn btn--drawer" onClick={() => store.setUi({ drawerOpen: true })} data-tut-target="panel">
            {t('hud.panel')}
          </button>
          <CzMap />
          <PledgeTracker />
          <PausedBadge />
          <div className="game__dock">
            <LeaderDock />
            <UpgradeButton />
          </div>
          <PopupStack />
        </main>
      </div>

      <RegionScreen />
      {phase === 'draft' && <DraftModal />}
      {phase === 'budgetVote' && <BudgetVoteModal />}
      {phase === 'compromise' && <CompromiseModal />}
      {phase === 'ending' && <EndingCard />}
      {phase === 'election' && <ElectionNight />}
      {modal === 'upgrades' && <UpgradeTree />}
      {(modal === 'pause' || modal === 'confirmRestart' || modal === 'confirmMenu') && <PauseMenu />}
      {modal === 'settings' && <SettingsModal />}
      <Tutorial />
      {DEBUG && <DebugOverlay />}
    </div>
  );
}
