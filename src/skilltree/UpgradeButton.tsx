/**
 * HUD button that opens the skill tree; glints while a node of the leader's trees is affordable. Drawn in
 * the leader's colours with a pixel compass (the tree is the political compass) and the PK the player has.
 */
import { availableNodes } from '@core/upgrades';
import { t } from '@i18n/index';
import { getStore, useStore } from '@ui/store';
import './skilltree.css';

/** 12 x 12 compass: P = leader colour, L = its light shade, G = gold needle, K = outline. */
const COMPASS = [
  '....KKKK....',
  '..KKLLLLKK..',
  '.KLLLGLLLLK.',
  '.KLLLGLLLLK.',
  'KLLLLGLLLLLK',
  'KLPPPKKGGGLK',
  'KLGGGKKPPPLK',
  'KLLLLLPLLLLK',
  '.KLLLLPLLLK.',
  '.KLLLLPLLLK.',
  '..KKLLLLKK..',
  '....KKKK....',
];
const FILL: Record<string, string> = { K: '#1d1622', P: 'var(--party)', L: 'var(--party-light)', G: '#ffd24a' };

function CompassIcon() {
  const rects: { x: number; y: number; w: number; f: string }[] = [];
  COMPASS.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x] !== '.') rects.push({ x, y, w: end - x, f: FILL[row[x]] });
      x = end;
    }
  });
  return (
    <svg className="btn--upgrades__icon" viewBox="0 0 12 12" width="30" height="30" shapeRendering="crispEdges" aria-hidden="true">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.f} />
      ))}
    </svg>
  );
}

export function UpgradeButton() {
  const store = getStore();
  const leader = store.sim?.leaderDef;
  const pc = useStore((s) => s.sim?.state.pc ?? 0);
  const affordable = useStore((s) => {
    const sim = s.sim;
    if (!sim) return false;
    return availableNodes(sim).some((n) => sim.state.pc >= n.cost);
  });
  return (
    <button
      className={`btn btn--upgrades${affordable ? ' is-affordable' : ''}`}
      style={{ ['--party' as string]: leader?.color, ['--party-light' as string]: leader?.colorLight }}
      onClick={() => store.openModal('upgrades')}
      data-tut-target="upgrades"
    >
      <CompassIcon />
      <span className="btn--upgrades__label">{t('hud.upgrades')}</span>
      <span className="cost">{pc}</span>
    </button>
  );
}
