import { canUseAbility, condemnTargets } from '@core/abilities';
import type { AbilityDef } from '@core/types';
import { t } from '@i18n/index';
import { AbilityIcon } from '../abilityIcons';
import { initials } from '../format';
import { LeaderSprite } from '../LeaderSprite';
import { HoverCard, type HoverInfo } from '../HoverCard';
import { getStore, useStore } from '../store';

/** Leader portrait with the three once-per-game ability buttons (spec §12.1, phase 17). */
export function LeaderDock() {
  const store = getStore();
  const leader = store.sim!.leaderDef;
  return (
    <div className="dock" style={{ ['--party' as string]: leader.color, ['--party-light' as string]: leader.colorLight }}>
      <LeaderSprite sprite={leader.sprite} color={leader.color} scale={3} initials={initials(leader)} />
      <div className="dock__info">
        <b className="dock__name">{t(leader.name)}</b>
        <div className="abilities">
          {leader.abilities.map((a) => (
            <AbilityButton key={a.id} a={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AbilityButton({ a }: { a: AbilityDef }) {
  const store = getStore();
  const used = useStore((s) => s.sim?.state.abilitiesUsed.includes(a.id) ?? false);
  const phase = useStore((s) => s.sim?.state.phase);
  // re-render when the set of cancellable items changes (Durazne odsouzeni)
  const targets = useStore((s) => (s.sim && a.action === 'cancelEvent' ? condemnTargets(s.sim).length : 0));
  const monthsLeft = useStore((s) => (s.sim ? activeMonths(s.sim.state, a.id, s.sim.cfg.abilities.monthDays) : 0));
  const sim = store.sim!;
  const open = phase === 'running' || phase === 'draft';
  const usable = !used && open && (a.action !== 'cancelEvent' || targets > 0);
  const status = used
    ? monthsLeft > 0
      ? t('ability.active', { n: monthsLeft })
      : t('ability.spent')
    : a.action === 'cancelEvent' && targets === 0
      ? t('ability.pick.none')
      : t('ability.ready');
  const click = () => {
    if (a.action) store.setUi({ modal: 'ability', abilityPick: a.id });
    else if (!canUseAbility(sim, a.id)) store.dispatch({ kind: 'useAbility', abilityId: a.id });
  };
  const info: HoverInfo = {
    icon: <AbilityIcon icon={a.icon} size={36} />,
    title: t(a.name),
    accent: sim.leaderDef.colorLight,
    desc: t(a.description),
    status: status,
    hint: usable ? t(a.action ? 'hover.ability.pick' : 'hover.ability.use') : undefined,
  };
  return (
    <HoverCard info={info} className="hc--ability">
      <button
        className={`btn btn--ability ability-btn${usable ? ' is-ready' : ''}${used ? ' is-used' : ''}${monthsLeft > 0 ? ' is-active' : ''}`}
        disabled={!usable}
        onClick={click}
      >
        <AbilityIcon icon={a.icon} size={40} />
        <span className="ability-btn__text">
          <span className="ability-btn__name">{t(a.name)}</span>
          <small>{status}</small>
        </span>
      </button>
    </HoverCard>
  );
}

/** Months an ability's effects still run (its longest modifier or its remaining pulses). */
function activeMonths(
  state: {
    modifiers: { origin: string; daysLeft?: number }[];
    schedule: { kind: string; absDay: number; payload: Record<string, string | number> }[];
    quarter: number;
    day: number;
  },
  id: string,
  monthDays: number,
): number {
  const mods = state.modifiers.filter((m) => m.origin === `ability:${id}` && m.daysLeft !== undefined).map((m) => m.daysLeft!);
  const pulses = state.schedule.filter((e) => e.kind === 'abilityPulse' && e.payload.abilityId === id).length;
  return Math.max(Math.ceil(Math.max(0, ...mods) / monthDays), pulses);
}
