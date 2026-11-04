/** Left panel / mobile drawer (spec §10.4): anger meters, active effects, decision history. */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/config';
import type { GroupId, LogEntry, ResourceId, TrendPoint } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { TrendChart, quarterOf, type Series } from '../charts/TrendChart';
import { GROUP_COLOR, RESOURCE_COLOR, targetColor } from '../colors';
import { fmt, fmtSigned, t } from '@i18n/index';
import { Floaters } from '../popups/Floaters';
import { HoverCard, type HoverInfo } from '../HoverCard';
import { getStore, targetOf, useStore, type PanelTab } from '../store';
import { Paged } from './Paged';
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
  const shake = useStore((s) => s.ui.floaters.filter((x) => x.key === `anger.${g}` && Math.abs(x.value) >= config.life.flashMinDelta).at(-1)?.id ?? 0);
  const hot = value >= config.anger.pulseAt;
  const critical = value >= config.anger.warnAt;
  const ending = getStore().sim?.data.endings.find((e) => e.group === g);
  const info: HoverInfo = {
    title: t(`group.${g}`),
    accent: hot ? 'var(--bad)' : 'var(--gold)',
    desc: t(`group.desc.${g}`),
    value: fmt(value),
    valueColor: critical ? 'var(--bad)' : hot ? '#e0952c' : undefined,
    status: t(critical ? 'hover.anger.critical' : hot ? 'hover.anger.hot' : 'hover.anger.calm', { n: ending?.threshold ?? 100 }),
    hint: t('hover.anger.scale'),
  };
  return (
    <HoverCard as="li" info={info} className={`meter${hot ? ' meter--hot' : ''}${critical ? ' meter--critical' : ''}`}>
      <span className="meter__name">{t(`group.${g}`)}</span>
      <span key={shake} className={`meter__bar${shake ? ' is-shaking' : ''}`} style={{ ['--grp-c' as string]: GROUP_COLOR[g] }} aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
      <span className="meter__value">{fmt(value)}</span>
      <span className={`trend trend--${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}`} aria-label={trend > 0 ? t('panel.trendUp') : trend < 0 ? t('panel.trendDown') : ''}>
        {trend > 0 ? '▲' : trend < 0 ? '▼' : ''}
      </span>
      <Floaters k={`anger.${g}`} />
    </HoverCard>
  );
});

function targetLabel(target: string): string {
  return target.startsWith('anger.') ? t(`group.${target.slice(6)}`) : t(`resource.short.${target}`);
}

export function originLabel(origin: string): string {
  const sim = getStore().sim!;
  const [kind, id] = origin.split(':');
  if (kind === 'policy') return t(sim.cardById.get(id)?.title ?? id);
  if (kind === 'compromise') return t(sim.compromiseById.get(id)?.title ?? id);
  if (kind === 'chaos') return t(sim.eventById.get(id)?.text ?? id);
  if (kind === 'ability') return t(sim.leaderDef.abilities.find((a) => a.id === id)?.name ?? id);
  if (kind === 'upgrade') return t(`upgrade.${id}.name`);
  if (kind === 'budget_vote') return t(sim.data.budgetVote.find((o) => o.id === id)?.label ?? (id === 'custom' ? 'budgetVote.custom' : 'budgetVote.title'));
  return origin;
}

interface EffectRow {
  key: string;
  name: string;
  what: string;
  when?: string;
  tone: 'good' | 'bad' | 'neutral';
  /** Resource or `anger.<group>` the effect acts on (its colour key and click target). */
  target?: string;
}

function ActiveEffects() {
  const store = getStore();
  const sig = useStore((s) => {
    const st = s.sim?.state;
    if (!st) return '';
    return [
      ...st.ongoing.map((o) => `${o.key}${o.daysLeft}`),
      ...st.modifiers.map((m) => `${m.origin}${m.target}${m.daysLeft}`),
      JSON.stringify(st.zeroPenalties),
      st.financeModAccum.toFixed(1),
      st.ownedUpgrades.join(),
      ...GROUP_IDS.map((g) => (st.anger[g] >= 100 ? g : '')),
    ].join('|');
  });
  const rows = useMemo(() => {
    void sig;
    const sim = store.sim;
    if (!sim) return [] as EffectRow[];
    const st = sim.state;
    const out: EffectRow[] = [];
    for (const o of st.ongoing)
      out.push({
        key: `o${o.key}`,
        name: o.label ? t(o.label) : originLabel(o.origin),
        what: `${targetLabel(o.target)} ${t('common.perDay', { v: fmtSigned(o.perDay, 2) })}`,
        when: t('common.days', { n: o.daysLeft }),
        tone: (o.target.startsWith('anger.') ? o.perDay < 0 : o.perDay > 0) ? 'good' : 'bad',
        target: o.target,
      });
    // one row per modifier source (an ability's or card's several modifiers read as one effect)
    const byOrigin = new Map<string, { days: number; target: string }>();
    for (const m of st.modifiers) if (m.daysLeft !== undefined) byOrigin.set(m.origin, { days: Math.max(m.daysLeft, byOrigin.get(m.origin)?.days ?? 0), target: m.target });
    for (const [origin, m] of byOrigin) out.push({ key: `m${origin}`, name: originLabel(origin), what: t('panel.modifier'), when: t('common.days', { n: m.days }), tone: 'neutral', target: m.target });
    for (const id of ['finances', 'support', 'prestige'] as const)
      if (st.zeroPenalties[id]) out.push({ key: `z${id}`, name: t(`penalty.${id}`), what: `${t(`resource.${id}`)} = 0`, tone: 'bad', target: id });
    if (st.financeModAccum < 0)
      out.push({ key: 'iso', name: t('penalty.prestige'), what: `${t('resource.short.finances')} ${fmtSigned(st.financeModAccum, 1)}`, when: t('panel.permanent'), tone: 'bad', target: 'finances' });
    for (const e of sim.data.endings)
      if (!e.built && st.anger[e.group] >= e.threshold)
        out.push({
          key: `s${e.group}`,
          name: `${t('penalty.standIn')}: ${t(`group.${e.group}`)}`,
          what: `${targetLabel(e.standInPenalty.target)} ${t('common.perDay', { v: fmtSigned(e.standInPenalty.perDay, 2) })}`,
          tone: 'bad',
          target: `anger.${e.group}`,
        });
    for (const id of st.ownedUpgrades) out.push({ key: `u${id}`, name: t(`upgrade.${id}.name`), what: t(`upgrade.${id}.desc`), when: t('panel.permanent'), tone: 'good' });
    return out;
  }, [store, sig]);
  const go = (target?: string) => {
    if (!target) return;
    const res = target.split('.')[0];
    if ((RESOURCE_IDS as readonly string[]).includes(res)) store.goTo({ kind: 'resource', id: res as ResourceId });
    else store.goTo({ kind: 'panel', tab: 'trend' });
  };
  return (
    <Paged
      items={rows}
      rowHeight={46}
      empty={t('panel.noEffects')}
      render={(r) => (
        <button className={`erow erow--${r.tone}`} style={{ ['--chip-c' as string]: r.target ? targetColor(r.target) : undefined }} onClick={() => go(r.target)} disabled={!r.target}>
          <b className="erow__name">{r.name}</b>
          <span className="erow__what">{r.what}</span>
          {r.when && <em className="erow__when">{r.when}</em>}
        </button>
      )}
    />
  );
}

const HISTORY_TYPES = new Set(['policy_picked', 'compromise_made', 'chaos_fired', 'event_response', 'budget_vote', 'ability_used', 'event_condemned', 'upgrade_bought', 'opportunity_collected', 'demand_accepted', 'demand_rejected', 'demand_ignored', 'pledge_fulfilled', 'pledge_failed']);

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
      const opt = sim.data.budgetVote.find((o) => o.id === e.presetId);
      return { kind: t('history.budget'), name: `${t(opt ? opt.label : 'budgetVote.custom')}: ${e.passed ? t('history.passed') : t('history.failed')}` };
    }
    case 'ability_used':
      return { kind: t('history.ability'), name: t(sim.leaderDef.abilities.find((a) => a.id === e.abilityId)?.name ?? '') };
    case 'event_condemned':
      return { kind: t('history.condemned'), name: t(`ability.pick.${e.kind}`) };
    case 'demand_accepted':
    case 'demand_rejected':
    case 'demand_ignored':
    case 'pledge_fulfilled':
    case 'pledge_failed': {
      const tpl = sim.data.demands.find((d) => d.id === e.templateId);
      const what = { demand_accepted: 'demandAccepted', demand_rejected: 'demandRejected', demand_ignored: 'demandIgnored', pledge_fulfilled: 'pledgeFulfilled', pledge_failed: 'pledgeFailed' }[e.type];
      return { kind: t('history.demand'), name: `${tpl ? t(tpl.text) : ''} (${t(`history.${what}`)})` };
    }
    case 'upgrade_bought':
      return { kind: t('history.upgrade'), name: t(`upgrade.${e.nodeId}.name`) };
    case 'opportunity_collected':
      return { kind: t('history.opportunity'), name: t(sim.data.opportunities.find((o) => o.id === e.opportunityId)?.text ?? '') };
    case 'mandatory_growth':
      return { kind: t('history.budget'), name: t('history.mandatoryGrowth') };
    case 'ability_pulse':
      return { kind: t('history.ability'), name: t(sim.leaderDef.abilities.find((x) => x.id === e.abilityId)?.name ?? '') };
    case 'region_event_intervened':
    case 'region_event_ignored':
      return { kind: t('history.regionEvent'), name: t(sim.data.regionEvents.find((x) => x.id === e.templateId)?.title ?? '') };
    case 'special_resolved':
      return { kind: t('history.special'), name: t(sim.data.specialCards.find((x) => x.id === e.cardId)?.title ?? '') };
    default:
      return { kind: e.type, name: '' };
  }
}

function History() {
  const store = getStore();
  const count = useStore((s) => s.sim?.state.log.length ?? 0);
  const entries = useMemo(() => {
    void count;
    return (store.sim?.state.log ?? []).filter((e) => HISTORY_TYPES.has(e.type)).reverse();
  }, [store, count]);
  return (
    <Paged
      items={entries}
      rowHeight={50}
      empty={t('panel.noHistory')}
      render={(e) => {
        const { kind, name } = historyTitle(e);
        return (
          <button className="hrow" onClick={() => store.goTo(targetOf(e))}>
            <span className="hrow__when">Q{e.quarter}</span>
            <span className="hrow__name">
              <small>{kind}</small> {name}
            </span>
            {e.deltas && <DeltaList deltas={e.deltas} />}
          </button>
        );
      }}
    />
  );
}

const RESOURCE_SERIES: Series[] = RESOURCE_IDS.map((id) => ({ id, label: '', color: RESOURCE_COLOR[id], get: (p: TrendPoint) => p.resources[id] }));
const ANGER_SERIES: Series[] = GROUP_IDS.map((g) => ({ id: g, label: '', color: GROUP_COLOR[g], get: (p: TrendPoint) => p.anger[g] }));

function Trends() {
  const [view, setView] = useState<'resources' | 'anger'>('resources');
  const points = useStore((s) => (s.sim ? s.sim.state.trend.slice() : []));
  // the chart fills the panel's free height (no scrolling): measure the box it sits in
  const box = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sim = getStore().sim!;
  const series = (view === 'resources' ? RESOURCE_SERIES : ANGER_SERIES).map((x) => ({
    ...x,
    label: view === 'resources' ? t(`resource.short.${x.id}`) : t(`group.${x.id}`),
  }));
  const labelOf = (p: TrendPoint) => {
    const [, m, d] = sim.dateOf(p.absDay).split('-').map(Number);
    return t('chart.date', { q: quarterOf(p.absDay), d, m });
  };
  return (
    <div className="trends">
      <div className="seg" role="group">
        {(['resources', 'anger'] as const).map((v) => (
          <button key={v} className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
            {t(`chart.${v}`)}
          </button>
        ))}
      </div>
      <div ref={box} className="trends__box">
        <TrendChart points={points} series={series} title={t(`chart.${view}Title`)} labelOf={labelOf} height={Math.max(120, Math.min(320, boxH - 80))} />
      </div>
    </div>
  );
}

export function SidePanel() {
  const store = getStore();
  const open = useStore((s) => s.ui.drawerOpen);
  const tab = useStore((s) => s.ui.panelTab);
  const setTab = (t: PanelTab) => store.setUi({ panelTab: t });
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
          <button role="tab" aria-selected={tab === 'trend'} className={tab === 'trend' ? 'is-on' : ''} onClick={() => setTab('trend')}>
            {t('panel.trend')}
          </button>
          <button role="tab" aria-selected={tab === 'effects'} className={tab === 'effects' ? 'is-on' : ''} onClick={() => setTab('effects')}>
            {t('panel.effects')}
          </button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'is-on' : ''} onClick={() => setTab('history')}>
            {t('panel.history')}
          </button>
        </div>
        <div className="panel__body">{tab === 'trend' ? <Trends /> : tab === 'effects' ? <ActiveEffects /> : <History />}</div>
      </aside>
    </>
  );
}
