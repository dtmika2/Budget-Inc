import { useMemo, useState } from 'react';
import { config } from '@/config';
import { budgetRerollCost, presetSliders, sameSliders, shownItems, zoneOf, type Sliders } from '@core/budgetVote';
import { pledgesForBudget } from '@core/demands';
import type { BudgetItem } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { pct } from '../format';
import { getStore, useStore } from '../store';
import { RangeChips } from './RangeChips';

/**
 * Annual budget vote (spec §4.7; phase 11 sliders, phase 16 hand and zones, phase 18 calm layout).
 * The key numbers sit on top (pass chance, Finances change, re-roll); below, one compact row per category
 * with a -/+ stepper and a status tag; the advisor explains only the selected row, next to a short
 * summary of everything the vote does. Never shows chapter names or codes.
 */
export function BudgetVoteModal() {
  // a re-roll changes the hand: remount so the sliders start from zero for the new categories
  const hand = useStore((s) => (s.sim?.state.budgetVoteItems ?? []).join(','));
  return <VoteBody key={hand} />;
}

function VoteBody() {
  const store = getStore();
  const sim = store.sim!;
  // re-render when coalition or PC change (pass chance and the re-roll button depend on them)
  useStore((s) => Math.round(s.sim?.state.resources.coalition ?? 0));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const redLines = useStore(
    (s) => s.sim?.state.budgetVoteRedLines ?? [],
    (a, b) => a.length === b.length,
  );
  const { minSteps, maxSteps, stepPct } = config.budgetVote.sliders;
  const items = shownItems(sim);
  const rerollCost = budgetRerollCost(sim);

  const [presetId, setPresetId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders>(() => presetSliders(sim, null));
  const [selected, setSelected] = useState(items[0]?.id ?? '');
  const preview = useMemo(() => sim.previewVote(sliders, presetId), [sim, sliders, presetId]);
  const budgetPledges = pledgesForBudget(sim);

  const set = (next: Sliders) => {
    setSliders(next);
    // a preset stays selected only while the sliders still match it
    setPresetId(presetId && sameSliders(sim, next, presetSliders(sim, presetId)) ? presetId : null);
  };
  const step = (id: string, d: number) => {
    setSelected(id);
    set({ ...sliders, [id]: Math.min(maxSteps, Math.max(minSteps, (sliders[id] ?? 0) + d)) });
  };
  const choosePreset = (id: string | null) => {
    setPresetId(id);
    setSliders(presetSliders(sim, id));
  };
  const submit = () => store.dispatch({ kind: 'voteBudget', sliders, presetId });

  const fin = preview.resources.finances?.min ?? 0;
  const outside = items.filter((it) => zoneOf(it, sliders[it.id] ?? 0) !== 'safe').length;
  const item = items.find((it) => it.id === selected) ?? items[0];
  const fail = Object.entries(config.budgetVote.failEffects)
    .map(([k, v]) => `${t(`resource.short.${k}`)} ${fmtSigned(v)}`)
    .join(', ');
  // the summary without Finances (shown big above) and without the empty resources
  const rest = { ...preview, resources: { ...preview.resources, finances: undefined } };

  return (
    <div className="modal-backdrop">
      <section className="modal modal--vote vote" role="dialog" aria-modal="true" aria-labelledby="vote-title">
        <header className="vote__head">
          <div className="vote__title">
            <h2 id="vote-title" className="h-display">
              {t('budgetVote.title')}
            </h2>
            <p className="modal__sub">{t('budgetVote.lead', { pct: config.budgetVote.mandatoryGrowthPct })}</p>
          </div>
          <div className="vote__kpis" aria-live="polite">
            <Kpi
              label={t('budgetVote.passShort')}
              value={pct(preview.passChance)}
              tone={preview.passChance >= 0.6 ? 'good' : preview.passChance >= 0.4 ? 'warn' : 'bad'}
            />
            <Kpi label={t('resource.short.finances')} value={fin === 0 ? '0' : fmtSigned(fin)} tone={fin > 0 ? 'good' : fin < 0 ? 'bad' : 'neutral'} />
            <button className="btn btn--stamp vote__submit" onClick={submit}>
              {t('budgetVote.submit')}
            </button>
          </div>
        </header>

        <div className="vote__tools">
          <span className="vote__tools-label">{t('budgetVote.presets')}</span>
          {sim.data.budgetVote.map((o) => (
            <button
              key={o.id}
              className={`chip-btn${presetId === o.id ? ' is-on' : ''}`}
              aria-pressed={presetId === o.id}
              title={t(o.description)}
              onClick={() => choosePreset(o.id)}
            >
              {t(o.label)}
            </button>
          ))}
          <button className="chip-btn chip-btn--ghost" onClick={() => choosePreset(null)}>
            {t('budgetVote.reset')}
          </button>
          <button
            className="chip-btn chip-btn--reroll"
            disabled={pc < rerollCost}
            onClick={() => store.dispatch({ kind: 'rerollBudget' })}
            title={t('budgetVote.rerollHint')}
          >
            {'↻'} {t('budgetVote.reroll')} · {t('draft.rerollCost', { n: rerollCost })}
          </button>
        </div>

        <div className="vote__body">
          <div className="vote__main">
            <ul className="vote__rows" aria-label={t('budgetVote.areas')}>
              {items.map((it) => {
                const v = sliders[it.id] ?? 0;
                const zone = zoneOf(it, v);
                const rl = redLines.find((r) => r.item === it.id);
                const crossed = preview.violations.includes(it.id);
                const pledges = budgetPledges.filter((p) => p.item === it.id);
                return (
                  <li key={it.id} className={`vrow vrow--${zone}${selected === it.id ? ' is-selected' : ''}`} onClick={() => setSelected(it.id)}>
                    <span className="vrow__name">
                      {t(it.label)}
                      {it.core && <span className="vrow__core">{t('budgetVote.core')}</span>}
                      {rl && (
                        <span className={`vrow__icon${crossed ? ' is-bad' : ''}`} title={t('budgetVote.redLine', { pct: rl.maxCutSteps * stepPct })}>
                          {'🔒'}
                        </span>
                      )}
                      {pledges.length > 0 && (
                        <span
                          className="vrow__icon"
                          title={pledges
                            .map((p) =>
                              t('pledge.badgeBudget', {
                                region: t(`region.short.${p.pledge.region}`),
                                dir: t(p.minSteps > 0 ? 'pledge.raise' : 'pledge.cut'),
                                pct: Math.abs(p.minSteps) * stepPct,
                              }),
                            )
                            .join('\n')}
                        >
                          {'⏳'}
                        </span>
                      )}
                    </span>
                    <span className="vrow__stepper">
                      <button
                        className="vrow__btn"
                        disabled={v <= minSteps}
                        onClick={(e) => (e.stopPropagation(), step(it.id, -1))}
                        aria-label={`${t(it.label)}: ${t('budgetVote.cut')}`}
                      >
                        {'−'}
                      </button>
                      <output className="vrow__value" aria-live="polite">
                        {v === 0 ? '0 %' : `${fmtSigned(v * stepPct)} %`}
                      </output>
                      <button
                        className="vrow__btn"
                        disabled={v >= maxSteps}
                        onClick={(e) => (e.stopPropagation(), step(it.id, 1))}
                        aria-label={`${t(it.label)}: ${t('budgetVote.raise')}`}
                      >
                        {'+'}
                      </button>
                    </span>
                    <span className={`vrow__tag vrow__tag--${zone}`}>{t(`budgetVote.zone.${zone}`)}</span>
                  </li>
                );
              })}
            </ul>

            <section className="vote__summary memo">
              <h3 className="memo__title">{t('budgetVote.summary')}</h3>
              <RangeChips preview={rest} compact groupRegions={3} />
              {outside > 0 && <p className="vote__warn">{t('budgetVote.outsideBand', { n: outside })}</p>}
              {preview.violations.length > 0 && (
                <p className="vote__warn">
                  {t('budgetVote.redLineCrossed', {
                    n: preview.violations.length,
                    pct: Math.round(config.budgetVote.redLines.passPenalty * 100 * preview.violations.length),
                  })}
                </p>
              )}
              <p className="vote__fail">{t('budgetVote.failNote', { effects: fail })}</p>
            </section>
          </div>

          <aside className="vote__side">{item && <Advisor item={item} steps={sliders[item.id] ?? 0} />}</aside>
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

/** What the advisor says about the selected category: its safe band and both sides past it. */
function Advisor({ item, steps }: { item: BudgetItem; steps: number }) {
  const sim = getStore().sim!;
  const { stepPct } = config.budgetVote.sliders;
  const zones = useMemo(() => sim.previewBudgetZones(item.id), [sim, item.id]);
  const zone = zoneOf(item, steps);
  return (
    <section className="advisor-card" aria-live="polite">
      <p className="advisor-card__who">{t('budgetVote.advisor')}</p>
      <h3 className="advisor-card__title">{t(item.label)}</h3>
      <p className="advisor-card__band">{t('budgetVote.safe', { min: fmtSigned(item.band.min * stepPct), max: fmtSigned(item.band.max * stepPct) })}</p>
      {item.advisor &&
        (['cut', 'overspend'] as const).map((side) => (
          <div key={side} className={`advisor-card__side${zone === side ? ' is-active' : ''}`}>
            <p className="advisor-card__text">
              <b>
                {t(side === 'cut' ? 'budgetVote.below' : 'budgetVote.above', { pct: fmtSigned((side === 'cut' ? item.band.min : item.band.max) * stepPct) })}
              </b>{' '}
              {t(item.advisor![side])}
            </p>
            <RangeChips preview={zones[side]} compact groupRegions={1} />
            {zones[side].pass !== 0 && <p className="advisor-card__pass">{t('budgetVote.zonePass', { v: fmtSigned(Math.round(zones[side].pass * 100)) })}</p>}
          </div>
        ))}
    </section>
  );
}
