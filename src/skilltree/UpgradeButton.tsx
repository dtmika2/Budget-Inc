/** HUD button that opens the skill tree; glints while a node of the leader's trees is affordable. */
import { availableNodes } from '@core/upgrades';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import './skilltree.css';

export function UpgradeButton() {
  const store = getStore();
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const affordable = useStore((s) => {
    const sim = s.sim;
    if (!sim) return false;
    return availableNodes(sim).some((n) => sim.state.pc >= n.cost);
  });
  return (
    <button className={`btn btn--upgrades${affordable ? ' is-affordable' : ''}`} onClick={() => store.openModal('upgrades')} data-tut-target="upgrades">
      {t('hud.upgrades')} <span className="cost">{pc}</span>
    </button>
  );
}
