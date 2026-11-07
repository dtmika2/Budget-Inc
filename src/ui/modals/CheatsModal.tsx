import { useState, type FormEvent } from 'react';
import { cheatReward, normalizeCheat } from '@core/cheats';
import { t } from '@i18n/index';
import { getStore } from '../store';

/** The pause menu's Podvody window: type a cheat code and it takes effect at once. */
export function CheatsModal() {
  const store = getStore();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const reward = cheatReward(store.sim!.cfg, code);
    if (reward && store.dispatch({ kind: 'cheat', code: normalizeCheat(code) })) {
      setResult({ ok: true, text: t('cheats.applied', { reward: t('common.pc', { n: reward.pc }) }) });
      setCode('');
    } else {
      setResult({ ok: false, text: t('cheats.unknown') });
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="cheats-title">
        <h2 id="cheats-title" className="h-display">
          {t('cheats.title')}
        </h2>
        <form className="cheats__form" onSubmit={submit}>
          <input
            id="cheat-code"
            className="cheats__input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label={t('cheats.label')}
            placeholder={t('cheats.label')}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <button className="btn btn--stamp" type="submit" disabled={code.trim() === ''}>
            {t('cheats.apply')}
          </button>
        </form>
        {result && (
          <p className={`cheats__result cheats__result--${result.ok ? 'ok' : 'bad'}`} role="status">
            {result.text}
          </p>
        )}
        <p className="cheats__note">{t('cheats.note')}</p>
        <button className="btn" onClick={() => store.openModal('pause')}>
          {t('common.back')}
        </button>
      </section>
    </div>
  );
}
