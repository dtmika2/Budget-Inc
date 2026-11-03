import { t } from '@i18n/index';
import { initials } from '../format';
import { LeaderSprite } from '../LeaderSprite';
import { getStore, useStore } from '../store';

/** Leader portrait with the once-a-year ability button and its charge state (spec §12.1). */
export function LeaderDock() {
  const store = getStore();
  const sim = store.sim!;
  const leader = sim.leaderDef;
  const charges = useStore((s) => s.sim?.state.abilityCharges ?? 0);
  const phase = useStore((s) => s.sim?.state.phase);
  const usable = charges > 0 && (phase === 'running' || phase === 'draft');
  return (
    <div className="dock" style={{ ['--party' as string]: leader.color }}>
      <LeaderSprite sprite={leader.sprite} color={leader.color} scale={3} initials={initials(leader)} />
      <div className="dock__info">
        <b className="dock__name">{t(leader.name)}</b>
        <button
          className={`btn btn--ability${usable ? ' is-ready' : ''}`}
          disabled={!usable}
          onClick={() => store.dispatch({ kind: 'useAbility' })}
          title={t(leader.ability.description)}
        >
          <span>{t(leader.ability.name)}</span>
          <small>{charges > 0 ? t('ability.ready') : t('ability.spent')}</small>
        </button>
      </div>
    </div>
  );
}
