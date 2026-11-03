/** Final screen (spec §4.6): outcome, score + best, final state, key decisions, JSON export, replay. */
import { config } from '@/config';
import { exportRun } from '@core/log';
import { keyDecisions } from '@core/score';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmt, t } from '@i18n/index';
import { download, initials } from '../format';
import { LeaderSprite } from '../LeaderSprite';
import { historyTitle } from '../panel/SidePanel';
import { bestScore } from '../persist';
import { DeltaList } from '../popups/DeltaList';
import { getStore, useStore } from '../store';

export function FinalScreen() {
  const store = getStore();
  const sim = store.sim;
  const newBest = useStore((s) => s.ui.newBest);
  if (!sim) return null;
  const s = sim.state;
  const best = bestScore(s.leader, s.difficulty);
  const outcome = s.outcome ?? 'loss';
  const decisions = keyDecisions(s.log, config);
  return (
    <main className={`screen final final--${outcome}`}>
      <section className="final__hero">
        <LeaderSprite sprite={sim.leaderDef.sprite} color={sim.leaderDef.color} scale={6} initials={initials(sim.leaderDef)} animate={outcome === 'win'} />
        <div>
          <p className="final__leader">
            {t(sim.leaderDef.name)} · {t(`difficulty.${s.difficulty}`)}
          </p>
          <h1 className="h-display final__outcome">{t(`final.outcome.${outcome}`)}</h1>
          <p>
            {t('final.quarters', { n: s.quartersCompleted, total: config.time.quarters })}
            {s.election && ` · ${t('final.seats', { n: s.election.G })}`}
          </p>
        </div>
        <div className="final__score">
          <span>{t('final.score')}</span>
          <b>{fmt(s.score ?? 0)}</b>
          <span>
            {t('final.best')}: {best === null ? '–' : fmt(best)}
          </span>
          {newBest && <em className="final__newbest">{t('final.newBest')}</em>}
        </div>
      </section>

      <section className="final__grid">
        <div className="final__block">
          <h2>{t('final.resources')}</h2>
          <ul className="final__list">
            {RESOURCE_IDS.map((r) => (
              <li key={r}>
                <span>{t(`resource.${r}`)}</span>
                <span className="mini-bar">
                  <span style={{ width: `${s.resources[r]}%` }} />
                </span>
                <b>{fmt(s.resources[r])}</b>
              </li>
            ))}
          </ul>
          <h2>{t('final.groups')}</h2>
          <ul className="final__list final__list--anger">
            {GROUP_IDS.map((g) => (
              <li key={g}>
                <span>{t(`group.${g}`)}</span>
                <span className="mini-bar">
                  <span style={{ width: `${s.anger[g]}%` }} />
                </span>
                <b>{fmt(s.anger[g])}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="final__block">
          <h2>{t('final.keyDecisions')}</h2>
          {decisions.length === 0 ? (
            <p>{t('final.noDecisions')}</p>
          ) : (
            <ol className="history history--final">
              {decisions.map((e, i) => {
                const { kind, name } = historyTitle(e);
                return (
                  <li key={i}>
                    <span className="history__when">Q{e.quarter}</span>
                    <span className="history__kind">{kind}</span>
                    <span className="history__name">{name}</span>
                    {e.deltas && <DeltaList deltas={e.deltas} />}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <nav className="final__actions">
        <button className="btn" onClick={() => download(`budget-inc-${s.runId}.json`, JSON.stringify(exportRun(s), null, 2))}>
          {t('final.export')}
        </button>
        <button className="btn btn--stamp btn--big" onClick={() => store.startRun(s.leader, s.difficulty)}>
          {t('final.playAgain')}
        </button>
        <button className="btn" onClick={() => store.go('menu')}>
          {t('final.mainMenu')}
        </button>
      </nav>
    </main>
  );
}
