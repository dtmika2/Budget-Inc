import { t } from '@i18n/index';
import { getStore } from '../store';

export function DataError() {
  const load = getStore().load;
  const errors = load.ok ? [] : load.errors;
  return (
    <main className="screen screen--paper">
      <section className="paper-sheet">
        <h1 className="h-display">{t('dataError.title')}</h1>
        <p>{t('dataError.body')}</p>
        <ol className="error-list">
          {errors.map((e, i) => (
            <li key={i}>
              <strong>{t(`dataError.${e.code}`)}</strong>
              <code>
                {e.file}
                {e.path ? ` › ${e.path}` : ''}: {e.detail}
              </code>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
