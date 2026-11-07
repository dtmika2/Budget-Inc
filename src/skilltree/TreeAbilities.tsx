/**
 * The owned active abilities of the skill tree, as a row of buttons above the leader's abilities. An ability
 * without a target is used right away; one that needs a kraj or a group opens its card in the tree, which
 * has the picker and the preview.
 */
import { canUseUpgradeAction, treesFor, upgradeCooldownLeft } from '@core/upgrades';
import type { Simulation } from '@core/simulation';
import type { UpgradeNode } from '@core/types';
import { t } from '@i18n/index';
import { HoverCard, type HoverInfo } from '@ui/HoverCard';
import { RangeChips } from '@ui/modals/RangeChips';
import { getStore, useStore } from '@ui/store';
import { quadrantOf } from './nodeText';
import { BoltIcon } from './UpgradeTree';
import './skilltree.css';

const ownedActives = (sim: Simulation): UpgradeNode[] =>
  treesFor(sim)
    .flatMap((tree) => tree.nodes)
    .filter((n) => n.active && sim.state.ownedUpgrades.includes(n.id));

export function TreeAbilities() {
  const store = getStore();
  const ids = useStore((s) => (s.sim ? ownedActives(s.sim).map((n) => n.id) : []));
  const sim = store.sim;
  if (!sim || ids.length === 0) return null;
  return (
    <section className="tree-abilities" aria-label={t('upgrades.yourActives')}>
      {ownedActives(sim).map((n) => (
        <TreeAbility key={n.id} node={n} />
      ))}
    </section>
  );
}

function TreeAbility({ node }: { node: UpgradeNode }) {
  const store = getStore();
  const sim = store.sim!;
  const a = node.active!;
  // re-render when what the button shows changes
  const left = useStore((s) => (s.sim ? upgradeCooldownLeft(s.sim, node.id) : 0));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  useStore((s) => s.sim?.state.phase);
  const pcCost = Math.max(0, -(a.bundle.pc ?? 0));
  const needsTarget = a.target !== null;
  const usable = needsTarget || canUseUpgradeAction(sim, node.id) === null;
  const status = left > 0 ? t('upgrades.readyIn', { d: left }) : pcCost > pc ? t('upgrades.dock.noPc') : t('upgrades.ready');
  const click = () => {
    if (needsTarget) {
      store.setUi({ treeFocus: node.id });
      store.openModal('upgrades');
    } else {
      store.dispatch({ kind: 'useUpgradeAction', nodeId: node.id });
    }
  };
  const info: HoverInfo = {
    title: t(node.name),
    desc: t(node.description),
    status,
    extra: needsTarget ? undefined : (
      <div className="tree-ability__fx">
        <RangeChips preview={sim.previewUpgradeAction(node.id)} compact />
      </div>
    ),
    hint: usable ? t(needsTarget ? 'upgrades.dock.pick' : 'upgrades.dock.use') : undefined,
  };
  const ready = left === 0 && pcCost <= pc;
  return (
    <HoverCard info={info} className="hc--ability">
      <button className={`btn btn--ability ability-btn tree-ability tree-ability--${quadrantOf(node)}${ready ? ' is-ready' : ''}`} disabled={!usable} onClick={click}>
        <span className="tree-ability__icon" aria-hidden="true">
          <BoltIcon />
        </span>
        <span className="ability-btn__text">
          <span className="ability-btn__name">{t(node.name)}</span>
          <small>{status}</small>
        </span>
      </button>
    </HoverCard>
  );
}
