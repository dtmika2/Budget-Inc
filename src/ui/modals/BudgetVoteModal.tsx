import { config } from '@/config';
import { fmtSigned, t } from '@i18n/index';
import { pct } from '../format';
import { getStore, useStore } from '../store';
import { RangeChips } from './RangeChips';

/** Annual budget vote (spec §4.7): three options with honest ranges and pass chance. */
export function BudgetVoteModal() {
  const store = getStore();
  const sim = store.sim!;
  // re-render when coalition changes (pass chance depends on it)
  useStore((s) => Math.round(s.sim?.state.resources.coalition ?? 0));
  const fail = Object.entries(config.budgetVote.failEffects)
    .map(([k, v]) => `${t(`resource.short.${k}`)} ${fmtSigned(v)}`)
    .join(', ');
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
          </div>
        </header>
        <div className="carousel">
          {sim.data.budgetVote.map((o) => {
            const p = sim.previewBudgetOption(o.id);
            return (
              <article key={o.id} className="memo memo--vote">
                <h3 className="memo__title">{t(o.label)}</h3>
                <p className="memo__desc">{t(o.description)}</p>
                <RangeChips preview={p} all />
                <p className="vote-chance">
                  {t('budgetVote.passChance')}: <b>{pct(p.passChance)}</b>
                </p>
                <button className="btn btn--stamp memo__pick" onClick={() => store.dispatch({ kind: 'voteBudget', optionId: o.id })}>
                  {t('budgetVote.submit')}
                </button>
              </article>
            );
          })}
        </div>
        <p className="modal__note">{t('budgetVote.failNote', { effects: fail })}</p>
      </section>
    </div>
  );
}
