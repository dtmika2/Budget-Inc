/**
 * The owned active abilities of the skill tree, as a row of buttons above the leader's abilities. An ability
 * without a target is used right away; one that needs a kraj or a group opens a small picker above the row,
 * and a click on a target uses it.
 */
import { useEffect, useRef, useState } from 'react';
import { canUseUpgradeAction, treesFor, upgradeCooldownLeft } from '@core/upgrades';
import type { Simulation } from '@core/simulation';
import { GROUP_IDS, type UpgradeNode } from '@core/types';
import { t } from '@i18n/index';
import { GROUP_COLOR } from '@ui/colors';
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

/** What an ability can be aimed at; [undefined] when it takes no target. */
function targetsOf(sim: Simulation, node: UpgradeNode): (string | undefined)[] {
  const target = node.active!.target;
  if (target === 'region') return sim.data.regions.regions.map((r) => r.code);
  if (target === 'group') return [...GROUP_IDS];
  return [undefined];
}

const usableNow = (sim: Simulation, node: UpgradeNode) => canUseUpgradeAction(sim, node.id, targetsOf(sim, node)[0]) === null;

export function TreeAbilities() {
  const store = getStore();
  const ids = useStore((s) => (s.sim ? ownedActives(s.sim).map((n) => n.id) : []));
  const [picking, setPicking] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  // the picker closes on Escape and on a click anywhere outside the row
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPicking(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [picking]);
  const sim = store.sim;
  if (!sim || ids.length === 0) return null;
  const nodes = ownedActives(sim);
  const picked = nodes.find((n) => n.id === picking);
  return (
    <section ref={root} className="tree-abilities" aria-label={t('upgrades.yourActives')}>
      {picked && <TargetPicker key={picked.id} node={picked} onClose={() => setPicking(null)} />}
      {nodes.map((n) => (
        <TreeAbility key={n.id} node={n} picking={picking === n.id} onPick={() => setPicking((p) => (p === n.id ? null : n.id))} />
      ))}
    </section>
  );
}

function TreeAbility({ node, picking, onPick }: { node: UpgradeNode; picking: boolean; onPick: () => void }) {
  const store = getStore();
  const sim = store.sim!;
  const a = node.active!;
  // re-render when what the button shows changes
  const left = useStore((s) => (s.sim ? upgradeCooldownLeft(s.sim, node.id) : 0));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  useStore((s) => s.sim?.state.phase);
  const pcCost = Math.max(0, -(a.bundle.pc ?? 0));
  const needsTarget = a.target !== null;
  const usable = usableNow(sim, node);
  const status = left > 0 ? t('upgrades.readyIn', { d: left }) : pcCost > pc ? t('upgrades.dock.noPc') : t('upgrades.ready');
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
    <HoverCard info={info} className="hc--ability" muted={picking}>
      <button
        className={`btn btn--ability ability-btn tree-ability tree-ability--${quadrantOf(node)}${ready ? ' is-ready' : ''}${picking ? ' is-picking' : ''}`}
        disabled={!usable}
        aria-expanded={needsTarget ? picking : undefined}
        onClick={() => (needsTarget ? onPick() : store.dispatch({ kind: 'useUpgradeAction', nodeId: node.id }))}
      >
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

/** Small picker above the row: each target with today's number, a preview of the hovered one, a click uses it. */
function TargetPicker({ node, onClose }: { node: UpgradeNode; onClose: () => void }) {
  const store = getStore();
  const sim = store.sim!;
  const isRegion = node.active!.target === 'region';
  const targets = targetsOf(sim, node) as string[];
  const [hovered, setHovered] = useState<string | null>(null);
  // the numbers beside the targets stay live, and the picker closes if the ability stops being usable
  useStore((s) => s.sim?.state.tickCount);
  const blocked = useStore((s) => (s.sim ? !usableNow(s.sim, node) : true));
  useEffect(() => {
    if (blocked) onClose();
  }, [blocked, onClose]);
  const use = (target: string) => {
    store.dispatch({ kind: 'useUpgradeAction', nodeId: node.id, target });
    onClose();
  };
  return (
    <div className="tree-picker" role="dialog" aria-label={t(node.name)}>
      <p className="tree-picker__title">{t(node.name)}</p>
      <p className="tree-picker__head">{t(isRegion ? 'upgrades.dock.pickRegion' : 'upgrades.dock.pickGroup')}</p>
      <ul className={`tree-picker__list${isRegion ? ' tree-picker__list--regions' : ''}`}>
        {targets.map((target, i) => (
          <li key={target}>
            <button
              className="tree-picker__item"
              autoFocus={i === 0}
              onClick={() => use(target)}
              onPointerEnter={() => setHovered(target)}
              onPointerLeave={() => setHovered((h) => (h === target ? null : h))}
              onFocus={() => setHovered(target)}
            >
              {!isRegion && <span className="tree-picker__key" style={{ background: GROUP_COLOR[target as keyof typeof GROUP_COLOR] }} />}
              <span className="tree-picker__name">{t(isRegion ? `region.short.${target}` : `group.${target}`)}</span>
              <b className="tree-picker__value">
                {Math.round(isRegion ? (sim.state.projection.regionSupport[target] ?? 0) : sim.state.anger[target as keyof typeof sim.state.anger])}
              </b>
            </button>
          </li>
        ))}
      </ul>
      <div className="tree-picker__preview tree-ability__fx">{hovered && <RangeChips preview={sim.previewUpgradeAction(node.id, hovered)} compact />}</div>
    </div>
  );
}
