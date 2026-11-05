import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/config';
import { keptPreset, type MetricKey } from '@core/budgetAdvice';
import { budgetRerollCost, presetSliders, shownItems, type Sliders } from '@core/budgetVote';
import { pledgesForBudget } from '@core/demands';
import type { PreviewRanges } from '@core/effects';
import type { Range } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { mid, pct } from '../../format';
import { getStore, useStore } from '../../store';
import { EffectLanes, metricId } from '../EffectLanes';
import { areaName, Chip, metricName, stepText } from './adviceText';
import { BudgetCommentary } from './BudgetCommentary';
import { BudgetSliders } from './BudgetSliders';
import { ChamberEstimate } from './ChamberEstimate';

/** What the player inspects: a slider step (hover / keyboard), an impact row, or nothing. */
export type Focus = { kind: 'step'; item: string; to: number } | { kind: 'metric'; metric: MetricKey } | null;

/** Per-metric difference a - b as exact ranges (the share of one slider in a preview). */
function diffPreview(a: PreviewRanges, b: PreviewRanges): PreviewRanges {
  const d = <K extends string>(x: Partial<Record<K, Range>>, y: Partial<Record<K, Range>>) => {
    const out: Partial<Record<K, Range>> = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)]) as Set<K>) {
      const v = mid(x[k] ?? zero) - mid(y[k] ?? zero);
      if (Math.abs(v) >= 1e-9) out[k] = { min: v, max: v };
    }
    return out;
  };
  return { resources: d(a.resources, b.resources), anger: d(a.anger, b.anger), regions: d(a.regions, b.regions), ongoing: [], pc: 0 };
}
const zero = { min: 0, max: 0 };

/**
 * Annual budget vote (phase 23): sliders on the left; a small chamber estimate and the advisor's live
 * commentary in the middle; the policy-card impact lanes on the right. Hovering a step previews it
 * everywhere (ghost knob, seats, lanes, commentary) without changing anything; a click sets it.
 */
export function BudgetScreen() {
  const store = getStore();
  const sim = store.sim!;
  // re-render when coalition or PC change (pass chance and the re-roll button depend on them)
  useStore((s) => Math.round(s.sim?.state.resources.coalition ?? 0));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const redLines = useStore(
    (s) => s.sim?.state.budgetVoteRedLines ?? [],
    (a, b) => a.length === b.length,
  );
  const items = shownItems(sim);
  const rerollCost = budgetRerollCost(sim);

  const [presetId, setPresetId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders>(() => presetSliders(sim, null));
  const [focus, setFocusNow] = useState<Focus>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  // pointer hover settles before the commentary changes (no flicker while sweeping across the steps);
  // keyboard focus applies at once
  const setFocus = (f: Focus, now = false) => {
    clearTimeout(timer.current);
    if (now) setFocusNow(f);
    else timer.current = setTimeout(() => setFocusNow(f), config.budgetAdvice.hoverDelayMs);
  };

  const apply = (next: Sliders, pid: string | null) => {
    clearTimeout(timer.current);
    setSliders(next);
    setPresetId(keptPreset(sim, next, pid));
    setFocusNow(null);
  };
  const setOne = (item: string, v: number) => {
    const next = { ...sliders, [item]: v };
    clearTimeout(timer.current);
    setSliders(next);
    setPresetId(keptPreset(sim, next, presetId));
    setFocusNow({ kind: 'step', item, to: v });
  };
  const choosePreset = (id: string | null) => apply(presetSliders(sim, id), id);
  const submit = () => store.dispatch({ kind: 'voteBudget', sliders, presetId });
  const failText = Object.entries(config.budgetVote.failEffects)
    .map(([k, v]) => `${t(`resource.short.${k}`)} ${fmtSigned(v ?? 0)}`)
    .join(', ');

  const preview = useMemo(() => sim.previewVote(sliders, presetId), [sim, sliders, presetId]);
  // the inspected step: its preview (shown in the lanes and seats) and its slider's share (outlined)
  const inspected = useMemo(() => {
    if (focus?.kind !== 'step' || focus.to === (sliders[focus.item] ?? 0)) return null;
    const next = { ...sliders, [focus.item]: focus.to };
    const after = sim.previewVote(next, keptPreset(sim, next, presetId));
    const without = { ...next, [focus.item]: 0 };
    const share = diffPreview(after, sim.previewVote(without, keptPreset(sim, without, presetId)));
    const highlight = new Set<string>();
    for (const [k, r] of Object.entries(share.resources)) if (r) highlight.add(`resource:${k}`);
    for (const [k, r] of Object.entries(share.anger)) if (r) highlight.add(`group:${k}`);
    for (const [k, r] of Object.entries(share.regions)) if (r) highlight.add(`kraj:${k}`);
    return { after, share, highlight };
  }, [sim, sliders, presetId, focus]);
  const shown = inspected?.after ?? preview;
  const fin = mid(shown.resources.finances ?? zero);

  const budgetPledges = pledgesForBudget(sim);
  const pledged = new Set(budgetPledges.map((p) => p.item));
  const chips = (
    <>
      {redLines.map((r) => (
        <Chip
          key={`rl-${r.item}`}
          text={t('budgetVote.chamber.redLine', { area: areaName(sim, r.item), pct: r.maxCutSteps * config.budgetVote.sliders.stepPct })}
          tone={shown.violations.includes(r.item) ? 'bad' : 'none'}
        />
      ))}
      {budgetPledges.map((p, i) => (
        <Chip key={`pl-${i}`} text={t('budgetVote.chamber.pledge', { area: areaName(sim, p.item), region: t(`region.short.${p.pledge.region}`) })} tone="none" />
      ))}
    </>
  );
  const focusLabel =
    focus?.kind === 'step' && inspected
      ? `${areaName(sim, focus.item)} ${stepText(focus.to)}`
      : focus?.kind === 'metric'
        ? metricName(focus.metric)
        : null;

  return (
    <div className="modal-backdrop">
      <section className="modal modal--budget bscreen" role="dialog" aria-modal="true" aria-labelledby="vote-title">
        <header className="bscreen__head">
          <div className="bscreen__title">
            <h2 id="vote-title" className="h-display">
              {t('budgetVote.title')}
            </h2>
            <p className="modal__sub">{t('budgetVote.lead', { pct: config.budgetVote.mandatoryGrowthPct })}</p>
          </div>
          <div className="bscreen__kpis" aria-live="polite">
            <Kpi label={t('budgetVote.passShort')} value={pct(preview.passChance)} tone={preview.passChance >= 0.6 ? 'good' : preview.passChance >= 0.4 ? 'warn' : 'bad'} />
            <Kpi
              label={t('resource.short.finances')}
              value={Math.abs(mid(preview.resources.finances ?? zero)) < 0.05 ? '0' : fmtSigned(mid(preview.resources.finances ?? zero), 1)}
              tone={mid(preview.resources.finances ?? zero) > 0 ? 'good' : mid(preview.resources.finances ?? zero) < 0 ? 'bad' : 'neutral'}
            />
            <button className="btn btn--stamp bscreen__submit" onClick={submit} title={t('budgetVote.failNote', { effects: failText })}>
              {t('budgetVote.submit')}
            </button>
          </div>
        </header>

        <div className="bscreen__tools">
          <span className="bscreen__tools-label">{t('budgetVote.presets')}</span>
          {sim.data.budgetVote.map((o) => (
            <button key={o.id} className={`chip-btn${presetId === o.id ? ' is-on' : ''}`} aria-pressed={presetId === o.id} title={t(o.description)} onClick={() => choosePreset(o.id)}>
              {t(o.label)}
            </button>
          ))}
          <button className="chip-btn chip-btn--ghost" onClick={() => choosePreset(null)}>
            {t('budgetVote.reset')}
          </button>
          <button className="chip-btn chip-btn--reroll" disabled={pc < rerollCost} onClick={() => store.dispatch({ kind: 'rerollBudget' })} title={t('budgetVote.rerollHint')}>
            {t('budgetVote.reroll')} · {t('draft.rerollCost', { n: rerollCost })}
          </button>
        </div>

        <div className="bscreen__cols">
          <div className="bpanel bscreen__left">
            <p className="bpanel__head">
              <span>{t('budgetVote.areas')}</span>
              <span>{t('budgetVote.stepNote', { pct: config.budgetVote.sliders.stepPct })}</span>
            </p>
            <BudgetSliders
              items={items}
              sliders={sliders}
              focus={focus}
              redLines={redLines}
              violations={shown.violations}
              pledged={pledged}
              onFocus={setFocus}
              onSet={setOne}
            />
          </div>

          <div className="bscreen__mid">
            <div className="bpanel bscreen__chamber">
              <ChamberEstimate chance={preview.passChance} next={inspected ? inspected.after.passChance : null} chips={chips} />
            </div>
            <div className="bpanel bpanel--gold">
              <BudgetCommentary sim={sim} sliders={sliders} presetId={presetId} focus={focus} />
            </div>
          </div>

          <aside className="memo bscreen__impact" onPointerLeave={() => setFocus(null)}>
            <p className="bscreen__impact-head">
              <span>{t('budgetVote.summary')}</span>
              <small>{focusLabel ? t('budgetVote.impactFocus', { what: focusLabel }) : t('budgetVote.impactAll')}</small>
            </p>
            <EffectLanes
              preview={shown}
              highlight={inspected?.highlight}
              part={inspected?.share}
              selected={focus?.kind === 'metric' ? metricId(focus.metric) : undefined}
              onRowHover={(m) => setFocus({ kind: 'metric', metric: m })}
            />
            <p className="lanes__foot">
              <span>{t('budgetVote.passShort')}</span>
              <b>{pct(shown.passChance)}</b>
              {Math.abs(fin) >= 0.05 && <span>{`${t('resource.short.finances')} ${fmtSigned(fin, 1)}`}</span>}
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className={`kpi kpi--${tone}`}>
      <span className="kpi__label">{label}</span>
      <b className="kpi__value">{value}</b>
    </div>
  );
}
