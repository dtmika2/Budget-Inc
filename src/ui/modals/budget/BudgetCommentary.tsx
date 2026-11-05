import { useMemo } from 'react';
import { config } from '@/config';
import { explainMetric, explainStep, metricValue, suggestMoves, summarizeBudget, type AdviceReason, type MetricKey, type Suggestion, type VotePreview } from '@core/budgetAdvice';
import type { Sliders } from '@core/budgetVote';
import type { Simulation } from '@core/simulation';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { mid, pct } from '../../format';
import { areaName, Chip, isGood, metricName, MetricChips, reasonGood, reasonText, stepText, suggestionTitle } from './adviceText';
import type { Focus } from './BudgetScreen';

interface Props {
  sim: Simulation;
  sliders: Sliders;
  presetId: string | null;
  focus: Focus;
  compact: boolean;
  onCompact: (v: boolean) => void;
  onApply: (sliders: Sliders, presetId: string | null) => void;
}

/**
 * Middle column, lower part: the advisor's commentary on whatever the player inspects (a slider step, an
 * impact row, or nothing = the whole budget). Always an explanation (why) and recommendations with an
 * apply button. Compact mode swaps the explanation for a before / after table.
 */
export function BudgetCommentary({ sim, sliders, presetId, focus, compact, onCompact, onApply }: Props) {
  const view = useMemo(() => build(sim, sliders, presetId, focus), [sim, sliders, presetId, focus]);
  const recs = compact ? view.recs.slice(0, 1) : view.recs;
  return (
    <section className="bcomment" aria-live="polite">
      <p className="bpanel__head">
        <span>{t('budgetVote.advice.title')}</span>
        <span className="bcomment__modes" role="group" aria-label={t('budgetVote.mode.label')}>
          <button className={`chip-btn${compact ? '' : ' is-on'}`} aria-pressed={!compact} onClick={() => onCompact(false)}>
            {t('budgetVote.mode.full')}
          </button>
          <button className={`chip-btn${compact ? ' is-on' : ''}`} aria-pressed={compact} onClick={() => onCompact(true)}>
            {t('budgetVote.mode.compact')}
          </button>
        </span>
      </p>
      <div className="bcomment__who">
        <span className="bcomment__avatar" aria-hidden="true" />
        <span>
          <b>{t('budgetVote.advisor')}</b>
          <small>{view.about}</small>
        </span>
        {view.ctx && <span className="bcomment__ctx">{view.ctx}</span>}
      </div>
      {view.quote && <p className="bcomment__quote">{view.quote}</p>}

      <div className={`bcomment__cols${compact ? ' is-compact' : ''}`}>
        <div className="bcomment__sec">
          <h4>{t(compact && view.table ? 'budgetVote.compare.title' : 'budgetVote.advice.why')}</h4>
          {compact && view.table ? (
            <CompareTable rows={view.table} />
          ) : (
            <ul className="bcomment__why">
              {view.why.map((w, i) => (
                <li key={i} className={w.tone ? `is-${w.tone}` : undefined}>
                  {w.text}
                  {w.chips}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bcomment__sec">
          <h4>{t('budgetVote.advice.recommend')}</h4>
          {recs.length === 0 && <p className="bcomment__none">{t('budgetVote.advice.noBetter')}</p>}
          {recs.map((r, i) => (
            <div key={r.key} className={`brec${i === 0 ? ' is-best' : ''}`}>
              <b className="brec__title">
                {r.title}
                {i === 0 && <span className="brec__badge">{t('budgetVote.advice.best')}</span>}
              </b>
              <button className="btn brec__apply" onClick={() => onApply(r.sliders, r.presetId)}>
                {t('budgetVote.advice.apply')}
              </button>
              {r.note && <span className="brec__note">{r.note}</span>}
              <span className="bchips brec__fx">{r.chips}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="bcomment__foot">
        <span>{t('budgetVote.advice.ranges')}</span>
        <span>{t('budgetVote.failNote', { effects: failText() })}</span>
      </p>
    </section>
  );
}

interface Why {
  text: string;
  tone?: 'good' | 'bad';
  chips?: React.ReactNode;
}
interface Rec {
  key: string;
  title: string;
  note?: string;
  chips: React.ReactNode;
  sliders: Sliders;
  presetId: string | null;
}
interface Row {
  label: string;
  now: string;
  after: string;
  good: boolean | null;
}
interface View {
  about: string;
  ctx?: string;
  quote?: string;
  why: Why[];
  table?: Row[];
  recs: Rec[];
}

const failText = () =>
  Object.entries(config.budgetVote.failEffects)
    .map(([k, v]) => `${t(`resource.short.${k}`)} ${fmtSigned(v)}`)
    .join(', ');

/** Explanation lines from reasons: sentences for events, one chip row for metric changes. */
function whyFrom(sim: Simulation, reasons: AdviceReason[]): Why[] {
  const out: Why[] = reasons.filter((r) => r.kind !== 'metric').map((r) => ({ text: reasonText(sim, r), tone: reasonGood(r) ? 'good' : 'bad' }));
  if (reasons.some((r) => r.kind === 'metric')) out.push({ text: t('budgetVote.advice.effects'), chips: <MetricChips reasons={reasons} /> });
  return out;
}

function recFrom(sim: Simulation, s: Suggestion, focusItem?: string): Rec {
  const firstEvent = s.reasons.find((r) => r.kind !== 'metric' && r.kind !== 'pass');
  return {
    key: `${s.kind}.${s.item ?? s.presetId ?? ''}.${s.dir ?? ''}`,
    title: suggestionTitle(sim, s, focusItem),
    note: firstEvent ? reasonText(sim, firstEvent) : undefined,
    chips: (
      <>
        {Math.abs(s.pass) >= 0.005 && <Chip text={t('budgetVote.advice.passChip', { v: fmtSigned(s.pass * 100) })} tone={s.pass > 0 ? 'good' : 'bad'} />}
        {Math.abs(s.finances) >= 0.05 && <Chip text={`${t('resource.short.finances')} ${fmtSigned(s.finances, 1)}`} tone={s.finances > 0 ? 'good' : 'bad'} />}
        {Math.abs(s.support) >= 0.05 && <Chip text={`${t('resource.short.support')} ${fmtSigned(s.support, 1)}`} tone={s.support > 0 ? 'good' : 'bad'} />}
      </>
    ),
    sliders: s.sliders,
    presetId: s.presetId,
  };
}

/** Before / after rows for compact mode: pass chance, the four resources, changed groups and top kraje. */
function compareRows(before: VotePreview, after: VotePreview): Row[] {
  const now = pct(before.passChance);
  const next = pct(after.passChance);
  const rows: Row[] = [{ label: t('budgetVote.passShort'), now, after: next, good: now === next ? null : after.passChance > before.passChance }];
  const keys: MetricKey[] = [
    ...RESOURCE_IDS.map((id) => ({ kind: 'resource', id }) as MetricKey),
    ...GROUP_IDS.filter((g) => before.anger[g] || after.anger[g]).map((id) => ({ kind: 'group', id }) as MetricKey),
    ...[...new Set([...Object.keys(before.regions), ...Object.keys(after.regions)])]
      .sort((a, b) => Math.abs(mid(after.regions[b] ?? zero)) - Math.abs(mid(after.regions[a] ?? zero)))
      .slice(0, 3)
      .map((id) => ({ kind: 'kraj', id }) as MetricKey),
  ];
  for (const m of keys) {
    const a = metricValue(before, m);
    const b = metricValue(after, m);
    rows.push({
      label: m.kind === 'group' ? t('budgetVote.compare.anger', { name: metricName(m) }) : metricName(m),
      now: num1(a),
      after: num1(b),
      good: Math.abs(b - a) < 0.05 ? null : isGood(m, b - a),
    });
  }
  return rows;
}
const zero = { min: 0, max: 0 };
/** One decimal, signed; a plain 0 when it rounds to nothing. */
const num1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : fmtSigned(v, 1));

function CompareTable({ rows }: { rows: Row[] }) {
  return (
    <table className="bcompare">
      <thead>
        <tr>
          <th />
          <th>{t('budgetVote.compare.now')}</th>
          <th>{t('budgetVote.compare.after')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{r.now}</td>
            <td className="num">{r.after}</td>
            <td className={`verdict${r.good === null ? '' : r.good ? ' is-good' : ' is-bad'}`}>
              {r.good === null ? '' : t(r.good ? 'budgetVote.compare.better' : 'budgetVote.compare.worse')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function build(sim: Simulation, sliders: Sliders, presetId: string | null, focus: Focus): View {
  const item = focus?.kind === 'step' ? sim.data.budgetItems.find((i) => i.id === focus.item) : undefined;
  // a slider step (or a focused slider at its own value)
  if (focus?.kind === 'step' && item) {
    const from = sliders[item.id] ?? 0;
    const name = t(item.label);
    const band = { min: fmtSigned(item.band.min * config.budgetVote.sliders.stepPct), max: fmtSigned(item.band.max * config.budgetVote.sliders.stepPct) };
    if (focus.to === from) {
      const recs = suggestMoves(sim, sliders, presetId).map((s) => recFrom(sim, s));
      return {
        about: t('budgetVote.advice.aboutArea', { area: name }),
        ctx: `${name} ${stepText(from)}`,
        why: [{ text: t('budgetVote.advice.band', { area: name, ...band }) }, { text: t('budgetVote.advice.hoverHint') }],
        recs,
      };
    }
    const adv = explainStep(sim, sliders, presetId, item.id, focus.to);
    const entered = adv.reasons.find((r) => r.kind === 'zoneEnter' && r.item === item.id);
    const quote = entered && entered.kind === 'zoneEnter' && item.advisor ? t(item.advisor[entered.zone]) : undefined;
    const recs = suggestMoves(sim, adv.sliders, adv.presetId, { sliders, presetId }).map((s) => recFrom(sim, s, item.id));
    return {
      about: t('budgetVote.advice.aboutArea', { area: name }),
      ctx: `${name} ${stepText(from)} → ${stepText(focus.to)}`,
      quote,
      why: [{ text: t('budgetVote.advice.band', { area: name, ...band }) }, ...whyFrom(sim, adv.reasons)],
      table: compareRows(adv.before, adv.after),
      recs,
    };
  }
  // an impact row
  if (focus?.kind === 'metric') {
    const m = focus.metric;
    const e = explainMetric(sim, sliders, presetId, m);
    const why: Why[] = e.parts.map((p) => ({ text: t('budgetVote.advice.part', { area: areaName(sim, p.item), v: fmtSigned(p.delta, 1) }), tone: isGood(m, p.delta) ? 'good' : 'bad' }));
    if (Math.abs(e.rest) >= 0.05) why.push({ text: t('budgetVote.advice.partRest', { v: fmtSigned(e.rest, 1) }), tone: isGood(m, e.rest) ? 'good' : 'bad' });
    if (why.length === 0) why.push({ text: t('budgetVote.advice.partNone') });
    const recs: Rec[] = [];
    if (e.tip) {
      const s = { ...sliders, [e.tip.item]: (sliders[e.tip.item] ?? 0) + e.tip.dir };
      recs.push({
        key: 'tip',
        title: t(e.tip.dir > 0 ? 'budgetVote.advice.raise' : 'budgetVote.advice.cut', { area: areaName(sim, e.tip.item), v: stepText(s[e.tip.item]) }),
        note: t('budgetVote.advice.tipNote', { name: metricName(m) }),
        chips: <Chip text={`${metricName(m)} ${fmtSigned(e.tip.delta, 1)}`} tone="good" />,
        sliders: s,
        presetId: null,
      });
    }
    return {
      about: t('budgetVote.advice.aboutMetric', { name: metricName(m) }),
      ctx: `${metricName(m)} ${num1(e.total)}`,
      why,
      recs,
    };
  }
  // nothing inspected: the whole budget
  const sum = summarizeBudget(sim, sliders, presetId);
  const why: Why[] = sum.risks.map((r) => ({ text: reasonText(sim, r), tone: 'bad' }));
  if (why.length === 0) why.push({ text: t('budgetVote.advice.noRisk'), tone: 'good' });
  why.push({ text: t('budgetVote.advice.hoverHint') });
  return {
    about: t('budgetVote.advice.aboutAll'),
    ctx: t('budgetVote.advice.chance', { v: pct(sum.passChance) }),
    why,
    recs: suggestMoves(sim, sliders, presetId).map((s) => recFrom(sim, s)),
  };
}
