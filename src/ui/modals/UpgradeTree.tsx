/** Upgrade tree (spec §8.3): node graph with locked / available / owned states. Pauses the clock while open. */
import { useState } from 'react';
import { nodeStatus } from '@core/upgrades';
import { t } from '@i18n/index';
import { getStore, useStore } from '../store';

const COL_W = 120;
const ROW_H = 96;
const NODE = 76;

export function UpgradeTree() {
  const store = getStore();
  const sim = store.sim!;
  const owned = useStore((s) => (s.sim ? [...s.sim.state.ownedUpgrades] : []));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const tree = sim.data.upgrades[0];
  const [selected, setSelected] = useState<string | null>(null);
  if (!tree) return null;
  const cols = Math.max(...tree.nodes.map((n) => n.pos.col)) + 1;
  const rows = Math.max(...tree.nodes.map((n) => n.pos.row)) + 1;
  const W = cols * COL_W;
  const H = rows * ROW_H;
  const center = (id: string) => {
    const n = tree.nodes.find((x) => x.id === id)!;
    return { x: n.pos.col * COL_W + COL_W / 2, y: n.pos.row * ROW_H + ROW_H / 2 };
  };
  const sel = tree.nodes.find((n) => n.id === selected) ?? null;
  const selStatus = sel ? nodeStatus(owned, sel) : null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && store.openModal(null)}>
      <section className="modal modal--tree" role="dialog" aria-modal="true" aria-labelledby="tree-title">
        <header className="modal__head">
          <div>
            <h2 id="tree-title" className="h-display">
              {t('upgrades.title')}
            </h2>
            <p className="modal__sub">
              {t(tree.name)} · {pc} {t('hud.pc')}
            </p>
          </div>
          <button className="btn-icon" onClick={() => store.openModal(null)} aria-label={t('common.close')}>
            {'✕'}
          </button>
        </header>
        <div className="tree" style={{ width: W, height: H }}>
          <svg className="tree__links" width={W} height={H} aria-hidden="true">
            {tree.nodes.flatMap((n) =>
              n.requires.map((r) => {
                const a = center(r);
                const b = center(n.id);
                const on = owned.includes(r);
                return <line key={`${r}-${n.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={on ? 'is-on' : ''} />;
              }),
            )}
          </svg>
          {tree.nodes.map((n) => {
            const st = nodeStatus(owned, n);
            const c = center(n.id);
            return (
              <button
                key={n.id}
                className={`node node--${st}${selected === n.id ? ' is-selected' : ''}${st === 'available' && pc >= n.cost ? ' node--affordable' : ''}`}
                style={{ left: c.x - NODE / 2, top: c.y - NODE / 2, width: NODE, height: NODE }}
                onClick={() => setSelected(n.id)}
                aria-label={`${t(n.name)}: ${t(`upgrades.${st}`)}`}
              >
                <span className="node__name">{t(n.name)}</span>
                <span className="node__cost">{st === 'owned' ? '✓' : n.cost}</span>
              </button>
            );
          })}
        </div>
        <div className="tree__detail">
          {sel ? (
            <>
              <h3>{t(sel.name)}</h3>
              <p>{t(sel.description)}</p>
              <p className="tree__meta">
                {t('upgrades.cost', { n: sel.cost })} · {t(`upgrades.${selStatus}`)}
                {sel.requires.length > 0 && ` · ${t('upgrades.requires', { list: sel.requires.map((r) => t(`upgrade.${r}.name`)).join(', ') })}`}
              </p>
              {selStatus !== 'owned' && (
                <button
                  className="btn btn--stamp"
                  disabled={selStatus !== 'available' || pc < sel.cost}
                  onClick={() => store.dispatch({ kind: 'buyUpgrade', nodeId: sel.id })}
                >
                  {t('upgrades.buy')} ({t('common.pc', { n: sel.cost })})
                </button>
              )}
            </>
          ) : (
            <p>{t('upgrades.selectHint')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
