import { abilityOf, condemnTargets, type CondemnTarget } from '@core/abilities';
import { templateOf } from '@core/demands';
import { regionEventTemplate } from '@core/regionEvents';
import type { Simulation } from '@core/simulation';
import { GROUP_IDS } from '@core/types';
import { fmt, t } from '@i18n/index';
import { AbilityIcon } from '../abilityIcons';
import { getStore, useStore } from '../store';
import { RangeChips } from './RangeChips';

/**
 * Target picker of an ability with an action (phase 17): Durazne odsouzeni lists everything currently
 * happening that can be cancelled; STB lists the interest groups with their anger now and after halving;
 * a regionTarget ability (Tramvaj do kazdeho kraje) lists the kraje with their support now and after.
 */

const PICK_TEXT = {
  cancelEvent: ['ability.pick.condemn', 'ability.pick.condemnNote'],
  halveAnger: ['ability.pick.stb', 'ability.pick.stbNote'],
  regionTarget: ['ability.pick.region', 'ability.pick.regionNote'],
} as const;
export function AbilityPicker() {
  const store = getStore();
  const sim = store.sim!;
  const id = useStore((s) => s.ui.abilityPick);
  // re-render when the cancellable items change
  useStore((s) => (s.sim ? condemnTargets(s.sim).map((c) => c.target).join() : ''));
  const a = id ? abilityOf(sim, id) : undefined;
  const close = () => store.setUi({ modal: null, abilityPick: null });
  if (!a) return null;
  const choose = (target: string) => {
    store.dispatch({ kind: 'useAbility', abilityId: a.id, target });
    close();
  };
  const leader = sim.leaderDef;
  const items = a.action === 'cancelEvent' ? condemnTargets(sim) : [];
  const [sub, note] = PICK_TEXT[a.action ?? 'cancelEvent'];
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal ability-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ability-title"
        onClick={(e) => e.stopPropagation()}
        style={{ ['--party' as string]: leader.color, ['--party-light' as string]: leader.colorLight }}
      >
        <header className="modal__head ability-picker__head">
          <AbilityIcon icon={a.icon} size={56} />
          <div>
            <h2 id="ability-title" className="h-display">
              {t(a.name)}
            </h2>
            <p className="modal__sub">{t(sub)}</p>
            <p className="modal__note">{t(note)}</p>
          </div>
        </header>

        {a.action === 'cancelEvent' && (
          <ul className="ability-picker__list">
            {items.length === 0 && <li className="rs-empty">{t('ability.pick.none')}</li>}
            {items.map((c) => (
              <li key={c.target}>
                <button className="ability-picker__item" onClick={() => choose(c.target)}>
                  <span className="ability-picker__kind">{t(`ability.pick.${c.kind}`)}</span>
                  <b>{itemLabel(sim, c)}</b>
                  {c.region && <span className="ability-picker__region">{t(`region.${c.region}`)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {a.action === 'halveAnger' && (
          <ul className="ability-picker__list">
            {GROUP_IDS.map((g) => (
              <li key={g}>
                <button className="ability-picker__item" onClick={() => choose(g)}>
                  <b>{t(`group.${g}`)}</b>
                  <span className="ability-picker__anger">
                    {t('ability.pick.angerNow', { now: fmt(sim.state.anger[g]), after: fmt(sim.state.anger[g] / 2) })}
                  </span>
                  <RangeChips preview={sim.previewAbility(a.id, g)} compact />
                </button>
              </li>
            ))}
          </ul>
        )}

        {a.action === 'regionTarget' && (
          <ul className="ability-picker__list ability-picker__list--regions">
            {sim.data.regions.regions.map((r) => {
              const now = sim.state.projection.regionSupport[r.code] ?? 0;
              const shift = sim.previewAbility(a.id, r.code).regions[r.code]?.min ?? 0;
              return (
                <li key={r.code}>
                  <button className="ability-picker__item" onClick={() => choose(r.code)}>
                    <b>{t(`region.short.${r.code}`)}</b>
                    <span className="ability-picker__anger">{t('ability.pick.angerNow', { now: fmt(now), after: fmt(now + shift) })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button className="btn btn--ghost" onClick={close}>
          {t('ability.pick.cancel')}
        </button>
      </section>
    </div>
  );
}

/** What an open item is, in the player's words. */
function itemLabel(sim: Simulation, c: CondemnTarget): string {
  if (c.kind === 'regionEvent') return t(regionEventTemplate(sim, c.ref).title);
  if (c.kind === 'demand') return t(templateOf(sim, c.ref).text);
  if (c.kind === 'response') return t(sim.eventById.get(c.ref)?.text ?? c.ref);
  return c.ref.includes('.') ? t(c.ref) : c.ref;
}
