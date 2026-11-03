import type { DifficultyId, LeaderDef } from '@core/types';
import { DIFFICULTY_IDS, GROUP_IDS, LEANING_IDS, RESOURCE_IDS } from '@core/types';
import { fmt, t } from '@i18n/index';
import { initials } from '../format';
import { LeaderSprite } from '../LeaderSprite';
import { bestScore } from '../persist';
import { getStore, useStore } from '../store';

function LeaderCard({ leader, selected, difficulty }: { leader: LeaderDef; selected: boolean; difficulty: DifficultyId }) {
  const store = getStore();
  const best = bestScore(leader.id, difficulty);
  const total = LEANING_IDS.reduce((s, l) => s + leader.leaningWeights[l], 0);
  const top = [...LEANING_IDS].sort((a, b) => leader.leaningWeights[b] - leader.leaningWeights[a]).slice(0, 3);
  return (
    <button
      className={`leader-card${selected ? ' is-selected' : ''}`}
      style={{ ['--party' as string]: leader.color }}
      aria-pressed={selected}
      onClick={() => store.setUi({ setup: { ...store.ui.setup, leader: leader.id } })}
    >
      <div className="leader-card__head">
        <LeaderSprite sprite={leader.sprite} color={leader.color} scale={5} initials={initials(leader)} animate={selected} />
        <div>
          <h2 className="leader-card__name">{t(leader.name)}</h2>
          <p className="leader-card__party">{t(leader.party)}</p>
          <p className="leader-card__profile">{t(leader.profile)}</p>
        </div>
      </div>
      <dl className="leader-card__stats">
        <dt>{t('leaderSelect.startValues')}</dt>
        {RESOURCE_IDS.map((r) => (
          <dd key={r} className="mini-stat">
            <span>{t(`resource.short.${r}`)}</span>
            <span className="mini-bar">
              <span style={{ width: `${leader.start[r]}%` }} />
            </span>
            <b>{leader.start[r]}</b>
          </dd>
        ))}
        <dt>{t('leaderSelect.startAnger')}</dt>
        {GROUP_IDS.map((g) => (
          <dd key={g} className="mini-stat mini-stat--anger">
            <span>{t(`group.${g}`)}</span>
            <span className="mini-bar">
              <span style={{ width: `${leader.startAnger[g]}%` }} />
            </span>
            <b>{leader.startAnger[g]}</b>
          </dd>
        ))}
      </dl>
      <div className="leader-card__ability">
        <h3>{t('leaderSelect.ability')}</h3>
        <p>
          <b>{t(leader.ability.name)}</b> {t(leader.ability.description)}
        </p>
      </div>
      <p className="leader-card__leanings">
        {t('leaderSelect.leanings')}: {top.map((l) => `${t(`leaning.${l}`)} ${fmt((leader.leaningWeights[l] / total) * 100)} %`).join(', ')}
      </p>
      <p className="leader-card__best">{best === null ? t('leaderSelect.noBest') : t('leaderSelect.bestScore', { score: best })}</p>
    </button>
  );
}

export function LeaderSelect() {
  const store = getStore();
  const setup = useStore((s) => s.ui.setup);
  const leaders = store.data!.leaders;
  return (
    <main className="screen select">
      <header className="select__header">
        <button className="btn btn--small" onClick={() => store.go('menu')}>
          {t('common.back')}
        </button>
        <h1 className="h-display">{t('leaderSelect.title')}</h1>
      </header>
      <div className="select__leaders">
        {leaders.map((l) => (
          <LeaderCard key={l.id} leader={l} selected={setup.leader === l.id} difficulty={setup.difficulty} />
        ))}
      </div>
      <fieldset className="select__difficulty">
        <legend>{t('leaderSelect.difficulty')}</legend>
        {DIFFICULTY_IDS.map((d) => (
          <label key={d} className={`diff-option${setup.difficulty === d ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="difficulty"
              value={d}
              checked={setup.difficulty === d}
              onChange={() => store.setUi({ setup: { ...setup, difficulty: d } })}
            />
            <b>{t(`difficulty.${d}`)}</b>
            <span>{t(`difficulty.${d}.desc`)}</span>
          </label>
        ))}
      </fieldset>
      <button className="btn btn--stamp btn--big select__start" onClick={() => store.startRun(setup.leader, setup.difficulty)}>
        {t('leaderSelect.start')}
      </button>
    </main>
  );
}
