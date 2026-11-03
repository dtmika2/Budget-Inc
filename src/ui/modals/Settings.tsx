import { useState } from 'react';
import { config } from '@/config';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';

/** Default speed, reduced motion, reset tutorial (spec §12.3). Stored in localStorage. */
export function SettingsPanel() {
  const store = getStore();
  const settings = useStore((s) => s.ui.settings);
  const [resetDone, setResetDone] = useState(false);
  return (
    <div className="settings">
      <label className="settings__row">
        <span>{t('settings.defaultSpeed')}</span>
        <select value={settings.defaultSpeed} onChange={(e) => store.setSettings({ defaultSpeed: Number(e.target.value) })}>
          {config.time.speeds.map((n) => (
            <option key={n} value={n}>
              {`${n}×`}
            </option>
          ))}
        </select>
      </label>
      <label className="settings__row">
        <span>{t('settings.reducedMotion')}</span>
        <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => store.setSettings({ reducedMotion: e.target.checked })} />
      </label>
      <div className="settings__row">
        <button
          className="btn"
          onClick={() => {
            store.resetTutorial();
            setResetDone(true);
          }}
        >
          {t('settings.resetTutorial')}
        </button>
        {resetDone && <span className="settings__note">{t('settings.tutorialReset')}</span>}
      </div>
    </div>
  );
}

export function SettingsModal() {
  const store = getStore();
  return (
    <div className="modal-backdrop">
      <section className="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title" className="h-display">
          {t('settings.title')}
        </h2>
        <SettingsPanel />
        <button className="btn" onClick={() => store.openModal('pause')}>
          {t('common.back')}
        </button>
      </section>
    </div>
  );
}
