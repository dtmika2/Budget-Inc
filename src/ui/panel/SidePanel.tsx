/** Left panel / mobile drawer (spec §10.4): anger meters, active effects, decision history. */
import { memo, useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import type { GroupId, LogEntry } from '@core/types';
import { GROUP_IDS } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';
import { Floaters } from '../popups/Floaters';
import { getStore, useStore } from '../store';
import { DeltaList } from '../popups/DeltaList';

const AngerMeter = memo(function AngerMeter({ g }: { g: GroupId }) {
  const value = useStore((s) => Math.round((s.sim?.state.anger[g] ?? 0) * 10) / 10);
  // trend: compare with the weekly snapshot 7 days earlier
  const trend = useStore((s) => {
    const tr = s.sim?.state.trend ?? [];
    if (tr.length < 2) return 0;
    const d = tr[tr.length - 1].anger[g] - tr[tr.length - 2].anger[g];
    return Math.abs(d) >= config.anger.trendThreshold ? Math.sign(d) : 0;
  });
  const hot = value >= config.anger.pulseAt;
  const critical = value >= config.anger.warnAt;
  return (
    <li className={`meter${hot ? ' meter--hot' : ''}${critical ? ' meter--critical' : ''}`}>
      <span className="meter__name">{t(`group.${g}`)}</span>
      <span className="meter__bar" aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
      <span className="meter__value">{fmt(value)}</span>
      <span className={`trend trend--${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}`} aria-label={trend > 0 ? t('panel.trendUp') : trend < 0 ? t('panel.trendDown') : ''}>
        {trend > 0 ? '▲' : trend < 0 ? '▼' : ''}
      </span>
      <Floaters k={`anger.${g}`} />
    </li>
  );
});

function targetLabel(target: string): string {
  return target.startsWith('anger.') ? t(`group.${target.slice(6)}`) : t(`resource.short.${target}`);
}

function originLabel(origin: string): string {
  const sim = getStore().sim!;
  const [kind, id] = origin.split(':');
  if (kind === 'policy') return t(sim.cardById.get(id)?.title ?? id);
  if (kind === 'compromise') return t(sim.compromiseById.get(id)?.title ?? id);
  if (kind === 'chaos') return t(sim.eventById.get(id)?.text ?? id);
  if (kind === 'ability') return t(sim.leaderDef.ability.name);
  if (kind === 'upgrade') return t(`upgrade.${id}.name`);
  if (kind === 'budget_vote') return t(sim.data.budgetVote.find((o) => o.id === id)?.label ?? 'budgetVote.title');
  return origin;
}

function ActiveEffects() {
  const effects = useStore((s) => {
    const st = s.sim?.state;
    if (!st) return [] as string[];
    const out: string[] = [];
    for (const o of st.ongoing) out.push(`o|${o.key}|${o.origin}|${o.target}|${o.perDay}|${o.daysLeft}|${o.label ?? ''}`);
    for (const m of st.modifiers) if (m.daysLeft !== undefined) out.push(`m|${m.origin}|${m.target}|${m.value}|${m.daysLeft}`);
    for (const id of ['finances', 'support', 'prestige'] as const) if (st.zeroPenalties[id]) out.push(`z|${id}`);
    if (st.financeModAccum < 0) out.push(`i|${st.financeModAccum.toFixed(1)}`);
    for (const e of s.sim!.data.endings) if (!e.built && st.anger[e.group] >= e.threshold) out.push(`s|${e.group}|${e.standInPenalty.target}|${e.standInPenalty.perDay}`);
    return out;
  });
  const owned = useStore((s) => (s.sim ? [...s.sim.state.ownedUpgrades] : []));
  if (!effects.length && !owned.length) return <p className="panel__empty">{t('panel.noEffects')}</p>;
  return (
    <ul className="effects">
      {effects.map((e) => {
        const p = e.split('|');
        if (p[0] === 'o')
          return (
            <li key={e}>
              <b>{p[6] ? t(p[6]) : originLabel(p[2])}</b>
              <span>
                {targetLabel(p[3])} {t('common.perDay', { v: fmtSigned(Number(p[4]), 2) })}
              </span>
              <em>{t('common.days', { n: p[5] })}</em>
            </li>
          );
        if (p[0] === 'm')
          return (
            <li key={e}>
              <b>{originLabel(p[1])}</b>
              <span>{t('panel.modifier')}</span>
              <em>{t('common.days', { n: p[4] })}</em>
            </li>
          );
        if (p[0] === 'z')
          return (
            <li key={e} className="effects__bad">
              <b>{t(`penalty.${p[1]}`)}</b>
              <span>{t(`resource.${p[1]}`)} = 0</span>
            </li>
          );
        if (p[0] === 'i')
          return (
            <li key={e} className="effects__bad">
              <b>{t('penalty.prestige')}</b>
              <span>
                {t('resource.short.finances')} {fmtSigned(Number(p[1]), 1)}
              </span>
              <em>{t('panel.permanent')}</em>
            </li>
          );
        return (
          <li key={e} className="effects__bad">
            <b>
              {t('penalty.standIn')}: {t(`group.${p[1]}`)}
            </b>
            <span>
              {targetLabel(p[2])} {t('common.perDay', { v: fmtSigned(Number(p[3]), 2) })}
            </span>
          </li>
        );
      })}
      {owned.map((id) => (
        <li key={id} className="effects__good">
          <b>{t(`upgrade.${id}.name`)}</b>
          <span>{t(`upgrade.${id}.desc`)}</span>
          <em>{t('panel.permanent')}</em>
        </li>
      ))}
    </ul>
  );
}

const HISTORY_TYPES = new Set(['policy_picked', 'compromise_made', 'chaos_fired', 'event_response', 'budget_vote', 'ability_used', 'upgrade_bought', 'opportunity_collected']);

export function historyTitle(e: LogEntry): { kind: string; name: string } {
  const sim = getStore().sim!;
  switch (e.type) {
    case 'policy_picked':
      return { kind: t('history.policy'), name: t(sim.cardById.get(String(e.cardId))?.title ?? '') };
    case 'compromise_made':
      return { kind: t('history.compromise'), name: t(sim.compromiseById.get(String(e.cardId))?.title ?? '') };
    case 'chaos_fired':
      return { kind: t('history.chaos'), name: t(sim.eventById.get(String(e.eventId))?.text ?? '') };
    case 'event_response': {
      const opt = sim.eventById.get(String(e.eventId))?.responses?.options.find((o) => o.id === e.responseId);
      return { kind: t('history.response'), name: `${opt ? t(opt.label) : ''}${e.timedOut ? ` (${t('history.timedOut')})` : ''}` };
    }
    case 'budget_vote': {
      const opt = sim.data.budgetVote.find((o) => o.id === e.optionId);
      return { kind: t('history.budget'), name: `${opt ? t(opt.label) : ''}: ${e.passed ? t('history.passed') : t('history.failed')}` };
    }
    case 'ability_used':
      return { kind: t('history.ability'), name: t(sim.leaderDef.ability.name) };
    case 'upgrade_bought':
      return { kind: t('history.upgrade'), name: t(`upgrade.${e.nodeId}.name`) };
    case 'opportunity_collected':
      return { kind: t('history.opportunity'), name: t(sim.data.opportunities.find((o) => o.id === e.opportunityId)?.text ?? '') };
    default:
      return { kind: e.type, name: '' };
  }
}

function History() {
  const count = useStore((s) => s.sim?.state.log.length ?? 0);
  const entries = useStore(
    (s) => (s.sim ? s.sim.state.log.filter((e) => HISTORY_TYPES.has(e.type)) : []),
    (a, b) => a.length === b.length,
  );
  void count;
  if (!entries.length) return <p className="panel__empty">{t('panel.noHistory')}</p>;
  return (
    <ol className="history" reversed>
      {[...entries].reverse().map((e, i) => {
        const { kind, name } = historyTitle(e);
        return (
          <li key={entries.length - i}>
            <span className="history__when">Q{e.quarter}</span>
            <span className="history__kind">{kind}</span>
            <span className="history__name">{name}</span>
            {e.deltas && <DeltaList deltas={e.deltas} />}
          </li>
        );
      })}
    </ol>
  );
}

export function SidePanel() {
  const store = getStore();
  const open = useStore((s) => s.ui.drawerOpen);
  const [tab, setTab] = useState<'effects' | 'history'>('effects');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  return (
    <>
      {open && <div className="drawer-scrim" onClick={() => store.setUi({ drawerOpen: false })} />}
      <aside ref={ref} tabIndex={-1} className={`panel${open ? ' is-open' : ''}`} data-tut-target="panel">
        <button className="panel__close btn-icon" onClick={() => store.setUi({ drawerOpen: false })} aria-label={t('common.close')}>
          {'✕'}
        </button>
        <h2 className="panel__h">{t('panel.groups')}</h2>
        <ul className="meters">
          {GROUP_IDS.map((g) => (
            <AngerMeter key={g} g={g} />
          ))}
        </ul>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'effects'} className={tab === 'effects' ? 'is-on' : ''} onClick={() => setTab('effects')}>
            {t('panel.effects')}
          </button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'is-on' : ''} onClick={() => setTab('history')}>
            {t('panel.history')}
          </button>
        </div>
        <div className="panel__scroll">{tab === 'effects' ? <ActiveEffects /> : <History />}</div>
      </aside>
    </>
  );
}
