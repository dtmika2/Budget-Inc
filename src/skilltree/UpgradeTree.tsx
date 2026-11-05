/**
 * Upgrade tree (spec §8.3): node graph with locked / available / owned / excluded states. Pauses the
 * clock while open. Fork links carry a lock; buying a node that locks out others asks for confirmation.
 * P29: four tinted compass quadrants, a fixed side panel describing the hovered / selected box, and active
 * abilities (bolt icon) that can be used again and again with a cooldown.
 */
import { useEffect, useRef, useState } from 'react';
import { canUseUpgradeAction, isForkLink, neighboursOf, nodeStatus, rivalsOf, startNodeOf, treesFor, upgradeCooldownLeft, type NodeStatus } from '@core/upgrades';
import { GROUP_IDS } from '@core/types';
import { RangeChips } from '@ui/modals/RangeChips';
import { modifierLine, quadrantOf } from './nodeText';
import type { UpgradeNode, UpgradeTree as Tree } from '@core/types';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import './skilltree.css';

interface Edge {
  a: string;
  b: string;
  fork: boolean;
  /** Prerequisite edge into a node that needs several boxes (all of them). */
  joint: boolean;
}

/** Every drawn connection once: undirected links plus prerequisite arrows. */
function edgesOf(tree: Tree): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  const push = (a: string, b: string, joint: boolean) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ a, b, fork: isForkLink(tree, a, b), joint });
  };
  for (const n of tree.nodes) {
    for (const l of n.links) push(n.id, l, false);
    for (const r of n.requires) push(r, n.id, n.requires.length > 1);
  }
  return out;
}

/** "+" badge: the box at the end of this line needs every line leading into it. */
function JointIcon() {
  return (
    <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2.5 0h2v2.5H7v2H4.5V7h-2V4.5H0v-2h2.5z" fill="currentColor" />
    </svg>
  );
}

/** Pixel bolt: an active ability. */
function BoltIcon() {
  return (
    <svg viewBox="0 0 6 8" width="10" height="13" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M3 0h3L4 3h2L1 8l1-4H0z" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 7 8" width="14" height="16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 0h3v1h1v3H5V1H2v3H1V1h1z" fill="currentColor" />
      <path d="M0 3h7v5H0z" fill="currentColor" />
      <path d="M3 5h1v2H3z" fill="var(--ground)" />
    </svg>
  );
}

export function UpgradeTree() {
  const store = getStore();
  const sim = store.sim!;
  const owned = useStore((s) => (s.sim ? [...s.sim.state.ownedUpgrades] : []));
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const trees = treesFor(sim);
  const [treeId, setTreeId] = useState(trees[0]?.id);
  const tree = trees.find((x) => x.id === treeId) ?? trees[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');
  // re-render after using an ability (cooldowns, PC)
  useStore((s) => s.sim?.state.log.length ?? 0);
  const [confirming, setConfirming] = useState<UpgradeNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startId = tree ? startNodeOf(sim, tree) : undefined;
  // on narrow screens the tree scrolls sideways: bring the leader's start box into view
  useEffect(() => {
    const box = scrollRef.current;
    const node = startId ? box?.querySelector<HTMLElement>(`[data-node="${startId}"]`) : null;
    if (box && node) box.scrollLeft = node.offsetLeft - box.clientWidth / 2;
  }, [tree?.id, startId]);
  if (!tree) return null;

  const cols = Math.max(...tree.nodes.map((n) => n.pos.col)) + 1;
  const rows = Math.max(...tree.nodes.map((n) => n.pos.row)) + 1;
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const pct = (n: UpgradeNode) => ({
    x: ((n.pos.col + 0.5) / cols) * 100,
    y: ((n.pos.row + 0.5) / rows) * 100,
  });
  const status = new Map<string, NodeStatus>(tree.nodes.map((n) => [n.id, nodeStatus(owned, n, tree)]));
  const start = startId;
  const nameOf = (id: string) => t(byId.get(id)?.name ?? `upgrade.${id}.name`);
  const shownId = hovered ?? selected;
  const sel = shownId ? (byId.get(shownId) ?? null) : null;
  const selStatus = sel ? status.get(sel.id)! : null;
  const edges = edgesOf(tree);

  const edgeClass = (e: Edge) => {
    if (e.joint) {
      const sa = status.get(e.a);
      return `is-joint ${sa === 'owned' ? 'is-on' : sa === 'excluded' ? 'is-cut' : ''}`;
    }
    const sa = status.get(e.a);
    const sb = status.get(e.b);
    if (sa === 'excluded' || sb === 'excluded') return 'is-cut';
    if (sa === 'owned' && sb === 'owned') return 'is-on';
    if ((sa === 'owned' && sb === 'available') || (sb === 'owned' && sa === 'available')) return 'is-open';
    return '';
  };

  const meta = (n: UpgradeNode): string[] => {
    const st = status.get(n.id)!;
    const out: string[] = [];
    if (n.requires.length > 0) out.push(t('upgrades.requires', { list: n.requires.map(nameOf).join(', ') }));
    if (st === 'locked' && neighboursOf(tree, n.id).length > 0) out.push(t('upgrades.linksTo', { list: neighboursOf(tree, n.id).map(nameOf).join(', ') }));
    if (rivalsOf(tree, n.id).length > 0 && st !== 'excluded') out.push(t('upgrades.excludes', { list: rivalsOf(tree, n.id).map(nameOf).join(', ') }));
    if (st === 'excluded')
      out.push(t('upgrades.excludedBy', { list: rivalsOf(tree, n.id).filter((r) => owned.includes(r)).map(nameOf).join(', ') }));
    return out;
  };

  const buy = (node: UpgradeNode) => {
    const lockedOut = rivalsOf(tree, node.id).filter((r) => status.get(r) !== 'excluded');
    if (lockedOut.length > 0 && confirming?.id !== node.id) {
      setConfirming(node);
      return;
    }
    setConfirming(null);
    store.dispatch({ kind: 'buyUpgrade', nodeId: node.id });
  };

  const close = () => store.openModal(null);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
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
          <button className="btn-icon" onClick={close} aria-label={t('common.close')}>
            {'✕'}
          </button>
        </header>
        {trees.length > 1 && (
          <nav className="tree-tabs" role="tablist" aria-label={t('upgrades.tabsLabel')}>
            {trees.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={x.id === tree.id}
                className={`tree-tab${x.id === tree.id ? ' is-on' : ''}`}
                onClick={() => {
                  setTreeId(x.id);
                  setSelected(null);
                  setConfirming(null);
                }}
              >
                {t(x.name)}
              </button>
            ))}
          </nav>
        )}
        <div className="tree-body">
        <div className="tree-scroll" ref={scrollRef}>
          <div className={`tree-frame${tree.axes ? ' has-axes' : ''}`}>
            {tree.axes && <span className="tree-axis tree-axis--top">{t(tree.axes.top)}</span>}
            {tree.axes && <span className="tree-axis tree-axis--left">{t(tree.axes.left)}</span>}
            <div
              className="tree"
              style={{
                minWidth: cols * 58,
                minHeight: rows * 46,
                ['--cols' as string]: cols,
                ['--rows' as string]: rows,
              }}
            >
              {tree.axes &&
                (['lp', 'rp', 'lt', 'rt'] as const).map((q) => (
                  <span key={q} className={`tree-quad tree-quad--${q}`} aria-hidden="true">
                    <span className="tree-quad__label">{t(`upgrades.quadrant.${q}`)}</span>
                  </span>
                ))}
              <svg className="tree__links" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden="true">
                {tree.axes && (
                  <g className="tree__cross">
                    <line x1={0} y1={rows / 2} x2={cols} y2={rows / 2} />
                    <line x1={cols / 2} y1={0} x2={cols / 2} y2={rows} />
                  </g>
                )}
                {edges.map((e) => {
                  const a = byId.get(e.a)!.pos;
                  const b = byId.get(e.b)!.pos;
                  return <line key={`${e.a}-${e.b}`} x1={a.col + 0.5} y1={a.row + 0.5} x2={b.col + 0.5} y2={b.row + 0.5} className={edgeClass(e)} />;
                })}
              </svg>
              {edges
                .filter((e) => e.fork || e.joint)
                .map((e) => {
                  const a = pct(byId.get(e.a)!);
                  const b = pct(byId.get(e.b)!);
                  return (
                    <span
                      key={`lock-${e.a}-${e.b}`}
                      className={`tree__lock ${edgeClass(e)}`}
                      style={{
                        left: `${(a.x + b.x) / 2}%`,
                        top: `${(a.y + b.y) / 2}%`,
                      }}
                      title={t(e.joint ? 'upgrades.jointHint' : 'upgrades.forkHint')}
                    >
                      {e.joint ? <JointIcon /> : <LockIcon />}
                    </span>
                  );
                })}
              {tree.nodes.map((n) => {
                const st = status.get(n.id)!;
                const c = pct(n);
                return (
                  <button
                    key={n.id}
                    data-node={n.id}
                    className={`node node--${st} node--q-${quadrantOf(n, cols, rows)}${n.active ? ' node--active' : ''}${selected === n.id ? ' is-selected' : ''}${st === 'available' && pc >= n.cost ? ' node--affordable' : ''}${n.id === start ? ' node--start' : ''}`}
                    onPointerEnter={() => setHovered(n.id)}
                    onPointerLeave={() => setHovered(null)}
                    style={{ left: `${c.x}%`, top: `${c.y}%` }}
                    onClick={() => {
                      setSelected(n.id);
                      setConfirming(null);
                    }}
                    aria-label={`${t(n.name)}: ${t(`upgrades.${st}`)}`}
                  >
                    {n.active && (
                      <span className="node__bolt">
                        <BoltIcon />
                      </span>
                    )}
                    <span className="node__name">{t(n.name)}</span>
                    <span className="node__cost">{st === 'owned' ? '✓' : st === 'excluded' ? '✕' : n.cost}</span>
                  </button>
                );
              })}
            </div>
            {tree.axes && <span className="tree-axis tree-axis--right">{t(tree.axes.right)}</span>}
            {tree.axes && <span className="tree-axis tree-axis--bottom">{t(tree.axes.bottom)}</span>}
          </div>
        </div>
        <aside className="tree-panel" aria-live="polite">
          {sel ? (
            <NodePanel node={sel} status={selStatus!} isStart={sel.id === start} pc={pc} target={target} onTarget={setTarget} onBuy={() => buy(sel)} meta={meta(sel)} />
          ) : (
            <p className="tree-panel__hint">{t('upgrades.selectHint')}</p>
          )}
          <ActiveList tree={tree} owned={owned} onPick={(id) => setSelected(id)} />
        </aside>
        </div>
        {confirming && (
          <div className="tree-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tree-confirm-title" aria-describedby="tree-confirm-body">
            <div className="tree-confirm__box">
              <h3 id="tree-confirm-title" className="tree-confirm__title">
                <LockIcon /> {t('upgrades.confirm.title')}
              </h3>
              <p id="tree-confirm-body">
                {t('upgrades.confirm.body', {
                  name: t(confirming.name),
                  list: rivalsOf(tree, confirming.id)
                    .filter((r) => status.get(r) !== 'excluded')
                    .map(nameOf)
                    .join(', '),
                })}
              </p>
              <div className="tree-confirm__actions">
                <button className="btn" onClick={() => setConfirming(null)} autoFocus>
                  {t('upgrades.confirm.cancel')}
                </button>
                <button className="btn btn--stamp" onClick={() => buy(confirming)}>
                  {t('upgrades.confirm.ok')} ({t('common.pc', { n: confirming.cost })})
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** The fixed description panel: quadrant, kind, description, effects, price and the buy / use controls. */
function NodePanel({
  node,
  status,
  isStart,
  pc,
  target,
  onTarget,
  onBuy,
  meta,
}: {
  node: UpgradeNode;
  status: NodeStatus;
  isStart: boolean;
  pc: number;
  target: string;
  onTarget: (v: string) => void;
  onBuy: () => void;
  meta: string[];
}) {
  const store = getStore();
  const sim = store.sim!;
  const a = node.active;
  const q = quadrantOf(node);
  const regions = sim.data.regions.regions;
  const tgt =
    a?.target === 'region'
      ? regions.some((r) => r.code === target)
        ? target
        : regions[0].code
      : a?.target === 'group'
        ? (GROUP_IDS as readonly string[]).includes(target)
          ? target
          : GROUP_IDS[0]
        : undefined;
  const left = a ? upgradeCooldownLeft(sim, node.id) : 0;
  const why = a && status === 'owned' ? canUseUpgradeAction(sim, node.id, tgt) : null;
  const pcCost = a ? Math.max(0, -(a.bundle.pc ?? 0)) : 0;
  return (
    <div className={`tree-panel__node tree-panel__node--${q}`}>
      <p className="tree-panel__tags">
        <span className={`tree-panel__quad tree-panel__quad--${q}`}>{t(`upgrades.quadrant.${q}`)}</span>
        <span className={`tree-panel__kind${a ? ' is-active' : ''}`}>
          {a && <BoltIcon />} {t(a ? 'upgrades.kind.active' : 'upgrades.kind.passive')}
        </span>
      </p>
      <h3 className="tree-panel__name">{t(node.name)}</h3>
      <p className="tree-panel__desc">{t(node.description)}</p>
      {node.modifiers.length > 0 && (
        <>
          <h4 className="tree-panel__h">{t('upgrades.effects')}</h4>
          <ul className="tree-panel__fx">
            {node.modifiers.map((m, i) => (
              <li key={i}>{modifierLine(m)}</li>
            ))}
          </ul>
        </>
      )}
      {a && (
        <>
          <h4 className="tree-panel__h">{t('upgrades.activeEffects')}</h4>
          {a.target === 'region' && (
            <label className="tree-panel__pick">
              {t('upgrades.pickRegion')}
              <select value={tgt} onChange={(e) => onTarget(e.target.value)}>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {t(`region.short.${r.code}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {a.target === 'group' && (
            <div className="tree-panel__groups" role="group" aria-label={t('upgrades.pickGroup')}>
              {GROUP_IDS.map((g) => (
                <button key={g} className={`chip-btn${tgt === g ? ' is-on' : ''}`} aria-pressed={tgt === g} onClick={() => onTarget(g)}>
                  {t(`group.${g}`)}
                </button>
              ))}
            </div>
          )}
          <RangeChips preview={sim.previewUpgradeAction(node.id, tgt)} compact />
          <p className="tree-panel__meta">{t('upgrades.cooldown', { d: a.cooldownDays })}</p>
        </>
      )}
      <p className="tree-panel__meta">{isStart ? t('upgrades.start') : `${t('upgrades.cost', { n: node.cost })} · ${t(`upgrades.${status}`)}`}</p>
      {meta.map((m) => (
        <p key={m} className="tree-panel__meta">
          {m}
        </p>
      ))}
      <div className="tree-panel__actions">
        {status !== 'owned' && status !== 'excluded' && (
          <button className="btn btn--stamp" disabled={status !== 'available' || pc < node.cost} onClick={onBuy}>
            {t('upgrades.buy')} ({t('common.pc', { n: node.cost })})
          </button>
        )}
        {a && status === 'owned' && (
          <button className="btn btn--compromise" disabled={why !== null} onClick={() => store.dispatch({ kind: 'useUpgradeAction', nodeId: node.id, target: tgt })}>
            {left > 0 ? t('upgrades.readyIn', { d: left }) : t('upgrades.use')}
            {left === 0 && pcCost > 0 && ` (${t('common.pc', { n: pcCost })})`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Owned active abilities with their readiness; a click shows one in the panel. */
function ActiveList({ tree, owned, onPick }: { tree: Tree; owned: string[]; onPick: (id: string) => void }) {
  const sim = getStore().sim!;
  const actives = tree.nodes.filter((n) => n.active && owned.includes(n.id));
  return (
    <section className="tree-panel__list">
      <h4 className="tree-panel__h">{t('upgrades.yourActives')}</h4>
      {actives.length === 0 ? (
        <p className="tree-panel__meta">{t('upgrades.noActives')}</p>
      ) : (
        <ul>
          {actives.map((n) => {
            const left = upgradeCooldownLeft(sim, n.id);
            return (
              <li key={n.id}>
                <button className="tree-panel__active" onClick={() => onPick(n.id)}>
                  <BoltIcon /> {t(n.name)}
                  <span className={left === 0 ? 'is-ready' : ''}>{left === 0 ? t('upgrades.ready') : t('upgrades.readyIn', { d: left })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
