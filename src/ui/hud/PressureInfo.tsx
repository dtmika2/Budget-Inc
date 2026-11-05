/**
 * Interest-group pressure in hover cards (P24): for an attribute, which groups drain it (weight and the
 * current loss per week); for a group, which attributes it drains. Anger above the threshold drains.
 */
import { config } from '@/config';
import { drainPerDay, groupTargets, resourceSources } from '@core/groupPressure';
import type { GroupId, ResourceId } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';
import { GROUP_COLOR, RESOURCE_COLOR } from '../colors';
import { useStore } from '../store';

const WEEK = 7;

/** Loss per week as text ("−0,3"), or "–" when nothing drains now. */
const weekText = (perDay: number) => (perDay * WEEK < 0.05 ? '–' : fmtSigned(-perDay * WEEK, 1));
const weightText = (w: number) => `×${fmt(w, 2)}`;

function useAnger(): Record<GroupId, number> | null {
  return useStore((s) => (s.sim ? { ...s.sim.state.anger } : null), (a, b) => !!a && !!b && Object.keys(a).every((k) => Math.round(a[k as GroupId]) === Math.round(b[k as GroupId])));
}

/** Groups that drain an attribute. */
export function ResourcePressure({ id }: { id: ResourceId }) {
  const anger = useAnger();
  const rows = resourceSources(config, id);
  if (!anger || rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + drainPerDay(config, anger, r.group, id), 0);
  return (
    <div className="press">
      <p className="press__head">{t('pressure.resourceHead', { from: config.groupPressure.from })}</p>
      <ul className="press__rows">
        {rows.map((r) => {
          const d = drainPerDay(config, anger, r.group, id);
          return (
            <li key={r.group} className={d > 0 ? 'is-active' : undefined}>
              <span className="press__key" style={{ background: GROUP_COLOR[r.group] }} />
              <span className="press__name">{t(`group.${r.group}`)}</span>
              <span className="press__w">{weightText(r.weight)}</span>
              <span className="press__v">{weekText(d)}</span>
            </li>
          );
        })}
      </ul>
      <p className="press__total">{total * WEEK >= 0.05 ? t('pressure.total', { v: weekText(total) }) : t('pressure.none')}</p>
    </div>
  );
}

/** Attributes a group drains. */
export function GroupPressure({ g }: { g: GroupId }) {
  const anger = useAnger();
  const rows = groupTargets(config, g);
  if (!anger || rows.length === 0) return null;
  return (
    <div className="press">
      <p className="press__head">{t('pressure.groupHead', { from: config.groupPressure.from })}</p>
      <ul className="press__rows">
        {rows.map((r) => {
          const d = drainPerDay(config, anger, g, r.resource);
          return (
            <li key={r.resource} className={d > 0 ? 'is-active' : undefined}>
              <span className="press__key" style={{ background: RESOURCE_COLOR[r.resource] }} />
              <span className="press__name">{t(`resource.short.${r.resource}`)}</span>
              <span className="press__w">{weightText(r.weight)}</span>
              <span className="press__v">{weekText(d)}</span>
            </li>
          );
        })}
      </ul>
      <p className="press__total">{anger[g] > config.groupPressure.from ? t('pressure.groupNow') : t('pressure.groupCalm')}</p>
    </div>
  );
}
