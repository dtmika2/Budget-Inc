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
 * Annual budget vote (spec §4.7, phase 11 sliders, phase 16 hand and zones): a slider per category of this
 * year's hand (re-rollable for PC), presets that set the sliders, coalition red lines, each category's safe
 * band with the advisor's hint for both sides, and a live preview. Never shows chapter names or codes.
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
  const redLines = useStore((s) => s.sim?.state.budgetVoteRedLines ?? [], (a, b) => a.length === b.length);
  const { minSteps, maxSteps, stepPct } = config.budgetVote.sliders;
  const items = shownItems(sim);
  const rerollCost = budgetRerollCost(sim);

  const [presetId, setPresetId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders>(() => presetSliders(sim, null));
  const preview = useMemo(() => sim.previewVote(sliders, presetId), [sim, sliders, presetId]);
  const zones = useMemo(() => Object.fromEntries(items.map((it) => [it.id, sim.previewBudgetZones(it.id)])), [sim, items]);
  const redLineOf = (id: string) => redLines.find((r) => r.item === id);
  const budgetPledges = pledgesForBudget(sim);

  const choosePreset = (id: string) => {
    setPresetId(id);
    setSliders(presetSliders(sim, id));
  };
  const setSlider = (id: string, v: number) => {
    const next = { ...sliders, [id]: v };
    setSliders(next);
    // a preset stays selected only while the sliders still match it
    setPresetId(presetId && sameSliders(sim, next, presetSliders(sim, presetId)) ? presetId : null);
  };
  const reset = () => {
    setPresetId(null);
    setSliders(presetSliders(sim, null));
  };

  const fail = Object.entries(config.budgetVote.failEffects)
    .map(([k, v]) => `${t(`resource.short.${k}`)} ${fmtSigned(v)}`)
    .join(', ');
  const preset = sim.data.budgetVote.find((o) => o.id === presetId);
  const outside = items.filter((it) => zoneOf(it, sliders[it.id] ?? 0) !== 'safe').length;

  return (
    <div className="modal-backdrop">
      <section className="modal modal--vote" role="dialog" aria-modal="true" aria-labelledby="vote-title">
        <header className="modal__head">
          <div>
            <h2 id="vote-title" className="h-display">
              {t('budgetVote.title')}
            </h2>
            <p className="modal__sub">{t('budgetVote.subtitle')}</p>
            <p className="modal__note">{t('budgetVote.mandatory', { pct: config.budgetVote.mandatoryGrowthPct })}</p>
            <p className="modal__note">{t('budgetVote.handNote', { n: items.length })}</p>
          </div>
          <button className="btn btn--reroll budget__reroll" disabled={pc < rerollCost} onClick={() => store.dispatch({ kind: 'rerollBudget' })}>
            {t('budgetVote.reroll')} <small>{t('draft.rerollCost', { n: rerollCost })}</small>
          </button>
        </header>

        <div className="presets" role="group" aria-label={t('budgetVote.presets')}>
          <span className="presets__label">{t('budgetVote.presets')}</span>
          {sim.data.budgetVote.map((o) => (
            <button
              key={o.id}
              className={`btn btn--preset${presetId === o.id ? ' is-active' : ''}`}
              aria-pressed={presetId === o.id}
              title={t(o.description)}
              onClick={() => choosePreset(o.id)}
            >
              {t(o.label)}
            </button>
          ))}
          <button className="btn btn--ghost btn--preset" onClick={reset}>
            {t('budgetVote.reset')}
          </button>
        </div>

        <div className="budget">
          <ul className="sliders">
            {items.map((it) => {
              const v = sliders[it.id] ?? 0;
              const rl = redLineOf(it.id);
              const crossed = preview.violations.includes(it.id);
              const zone = zoneOf(it, v);
              return (
                <li key={it.id} className={`slider slider--${zone}${crossed ? ' slider--crossed' : ''}${v !== 0 ? ' slider--moved' : ''}`}>
                  <div className="slider__head">
                    <label htmlFor={`sl-${it.id}`} className="slider__label">
                      {t(it.label)}
                      {it.core && <span className="slider__core">{t('budgetVote.core')}</span>}
                    </label>
                    {rl && (
                      <span className={`slider__lock${crossed ? ' is-crossed' : ''}`} title={t('budgetVote.redLine', { pct: rl.maxCutSteps * stepPct })}>
                        <span aria-hidden="true">{'🔒'}</span> {t('budgetVote.redLineShort', { pct: rl.maxCutSteps * stepPct })}
                      </span>
                    )}
                    {budgetPledges
                      .filter((p) => p.item === it.id)
                      .map((p) => (
                        <span key={p.pledge.id} className="slider__pledge">
                          {t('pledge.badgeBudget', {
                            region: t(`region.short.${p.pledge.region}`),
                            dir: t(p.minSteps > 0 ? 'pledge.raise' : 'pledge.cut'),
                            pct: Math.abs(p.minSteps) * stepPct,
                          })}
                        </span>
                      ))}
                    <output className="slider__value" htmlFor={`sl-${it.id}`}>
                      {v === 0 ? '0 %' : `${fmtSigned(v * stepPct)} %`}
                    </output>
                  </div>
                  <div className="slider__track">
                    <SafeBand item={it} />
                    <input
                      id={`sl-${it.id}`}
                      type="range"
                      min={minSteps}
                      max={maxSteps}
                      step={1}
                      value={v}
                      onChange={(e) => setSlider(it.id, Number(e.target.value))}
                      aria-valuetext={`${fmtSigned(v * stepPct)} %`}
                    />
                  </div>
                  <div className="slider__scale" aria-hidden="true">
                    <span>{t('budgetVote.cut')}</span>
                    <span>{t('budgetVote.safe', { min: fmtSigned(it.band.min * stepPct), max: fmtSigned(it.band.max * stepPct) })}</span>
                    <span>{t('budgetVote.raise')}</span>
                  </div>
                  {it.advisor && (
                    <div className="advisor">
                      <p className="advisor__who">{t('budgetVote.advisor')}</p>
                      {(['cut', 'overspend'] as const).map((side) => (
                        <div key={side} className={`advisor__side advisor__side--${side}${zone === side ? ' is-active' : ''}`}>
                          <p className="advisor__text">
                            <b>{t(side === 'cut' ? 'budgetVote.below' : 'budgetVote.above', { pct: fmtSigned((side === 'cut' ? it.band.min : it.band.max) * stepPct) })}</b>{' '}
                            {t(it.advisor![side])}
                          </p>
                          <RangeChips preview={zones[it.id][side]} compact groupRegions={2} />
                          {zones[it.id][side].pass !== 0 && (
                            <span className="advisor__pass">{t('budgetVote.zonePass', { v: fmtSigned(Math.round(zones[it.id][side].pass * 100)) })}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <aside className="budget__preview memo memo--vote" aria-live="polite">
            <h3 className="memo__title">{t(preset ? preset.label : 'budgetVote.custom')}</h3>
            {preset && <p className="memo__desc">{t(preset.description)}</p>}
            <RangeChips preview={preview} all groupRegions={4} />
            {outside > 0 && <p className="budget__warn">{t('budgetVote.outsideBand', { n: outside })}</p>}
            {preview.violations.length > 0 && (
              <p className="budget__warn">
                {t('budgetVote.redLineCrossed', {
                  n: preview.violations.length,
                  pct: Math.round(config.budgetVote.redLines.passPenalty * 100 * preview.violations.length),
                })}
              </p>
            )}
            <p className="vote-chance">
              {t('budgetVote.passChance')}: <b>{pct(preview.passChance)}</b>
            </p>
            <button className="btn btn--stamp memo__pick" onClick={() => store.dispatch({ kind: 'voteBudget', sliders, presetId })}>
              {t('budgetVote.submit')}
            </button>
            <p className="budget__fail">{t('budgetVote.failNote', { effects: fail })}</p>
          </aside>
        </div>

        <div className="budget__bar" aria-hidden="true">
          <span className="budget__bar-stat">
            {t('resource.short.finances')} <b>{preview.resources.finances ? fmtSigned(preview.resources.finances.min) : '0'}</b>
          </span>
          <span className="budget__bar-stat">
            {t('budgetVote.passShort')} <b>{pct(preview.passChance)}</b>
          </span>
          <button className="btn btn--stamp" tabIndex={-1} onClick={() => store.dispatch({ kind: 'voteBudget', sliders, presetId })}>
            {t('budgetVote.submitShort')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** The safe band drawn under the slider track (positions as % of the slider range). */
function SafeBand({ item }: { item: BudgetItem }) {
  const { minSteps, maxSteps } = config.budgetVote.sliders;
  const at = (s: number) => ((s - minSteps) / (maxSteps - minSteps)) * 100;
  return <span className="slider__band" style={{ left: `${at(item.band.min)}%`, width: `${at(item.band.max) - at(item.band.min)}%` }} aria-hidden="true" />;
}
