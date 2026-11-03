/**
 * Build-time only: downloads the Eurostat GISCO NUTS3 boundaries once, keeps the 14 Czech kraje,
 * projects them (equirectangular, cos(49.8deg) scaling), quantises the coordinates and writes
 * `src/regions/regionsPath.ts`. The game itself never touches the network.
 *
 * If the download fails, a SCHEMATIC PLACEHOLDER map (14 rounded blobs placed roughly by
 * geography, with correct NUTS codes) is written instead.
 *
 * Usage: npm run build:map [-- --scale 03M|10M|20M] [--schematic]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const scale = args.includes('--scale') ? args[args.indexOf('--scale') + 1] : '03M';
const forceSchematic = args.includes('--schematic');

const URL_TEMPLATE = (s: string) =>
  `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_${s}_2021_4326_LEVL_3.geojson`;
const CACHE_DIR = '.map-cache';
const CACHE_FILE = `${CACHE_DIR}/nuts3_${scale}_2021.geojson`;
const OUT_FILE = 'src/regions/regionsPath.ts';
export const ATTRIBUTION = '(c) EuroGeographics for the administrative boundaries (Eurostat GISCO, NUTS 2021)';

const VIEW_W = 1000;
const PAD = 16;
const CODES = [
  'CZ010', 'CZ020', 'CZ031', 'CZ032', 'CZ041', 'CZ042', 'CZ051',
  'CZ052', 'CZ053', 'CZ063', 'CZ064', 'CZ071', 'CZ072', 'CZ080',
];

type Pt = [number, number];
type Ring = Pt[];
type Poly = Ring[]; // [outer, ...holes]

interface Feature {
  properties: { NUTS_ID: string; CNTR_CODE: string };
  geometry: { type: 'Polygon'; coordinates: Poly } | { type: 'MultiPolygon'; coordinates: Poly[] };
}

async function loadGeoJson(): Promise<{ features: Feature[] } | null> {
  if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  try {
    const res = await fetch(URL_TEMPLATE(scale));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, text);
    return JSON.parse(text);
  } catch (err) {
    console.warn(`Map download failed (${String(err)}); writing schematic placeholder.`);
    return null;
  }
}

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(p: Pt, poly: Poly): boolean {
  if (!pointInRing(p, poly[0])) return false;
  return !poly.slice(1).some((h) => pointInRing(p, h));
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Grid-search "pole of inaccessibility": the inside point farthest from any edge. Good label spot. */
function labelPoint(polys: Poly[]): Pt {
  const main = polys.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a));
  const xs = main[0].map((p) => p[0]);
  const ys = main[0].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
  let bestD = -1;
  const N = 60;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p: Pt = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!pointInPoly(p, main)) continue;
      let d = Infinity;
      for (const ring of main) {
        for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) d = Math.min(d, segDist(p, ring[m], ring[k]));
      }
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

const q = (n: number) => Math.round(n * 10) / 10;

function ringToPath(r: Ring): string {
  const pts: Pt[] = [];
  for (const p of r) {
    const qp: Pt = [q(p[0]), q(p[1])];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== qp[0] || last[1] !== qp[1]) pts.push(qp);
  }
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join('L') + 'Z';
}

interface RegionPath {
  code: string;
  d: string;
  labelX: number;
  labelY: number;
}

function fromGeoJson(features: Feature[]): { regions: RegionPath[]; width: number; height: number } {
  const cz = features.filter((f) => f.properties.CNTR_CODE === 'CZ');
  const k = Math.cos((49.8 * Math.PI) / 180);
  const proj = (p: Pt): Pt => [p[0] * k, -p[1]];
  const projected = new Map<string, Poly[]>();
  for (const f of cz) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    projected.set(f.properties.NUTS_ID, polys.map((poly) => poly.map((ring) => ring.map(proj))));
  }
  const all = [...projected.values()].flat(3);
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const s = (VIEW_W - 2 * PAD) / (maxX - minX);
  const height = Math.round((maxY - minY) * s + 2 * PAD);
  const fit = (p: Pt): Pt => [(p[0] - minX) * s + PAD, (p[1] - minY) * s + PAD];

  const regions = CODES.map((code) => {
    const polys = projected.get(code);
    if (!polys) throw new Error(`Region ${code} missing from boundary file`);
    const fitted = polys.map((poly) => poly.map((ring) => ring.map(fit)));
    const [lx, ly] = labelPoint(fitted);
    return { code, d: fitted.flat().map(ringToPath).join(''), labelX: q(lx), labelY: q(ly) };
  });
  return { regions, width: VIEW_W, height };
}

/** Rough geographic placement (x: west to east, y: north to south) for the schematic fallback. */
const SCHEMATIC: Record<string, [number, number, number]> = {
  CZ041: [90, 190, 55], CZ042: [250, 110, 80], CZ051: [390, 80, 60], CZ052: [520, 150, 70],
  CZ032: [170, 330, 95], CZ020: [360, 260, 110], CZ010: [360, 260, 30], CZ053: [560, 270, 65],
  CZ031: [330, 470, 110], CZ063: [520, 410, 85], CZ064: [640, 520, 95], CZ071: [720, 300, 70],
  CZ072: [830, 450, 65], CZ080: [860, 270, 85],
};

function schematic(): { regions: RegionPath[]; width: number; height: number } {
  const regions = CODES.map((code) => {
    const [cx, cy, r] = SCHEMATIC[code];
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = r * (0.85 + 0.15 * Math.cos(a * 3 + cx));
      pts.push(`${q(cx + rr * Math.cos(a))} ${q(cy + rr * Math.sin(a) * 0.8)}`);
    }
    return { code, d: 'M' + pts.join('L') + 'Z', labelX: cx, labelY: cy };
  });
  return { regions, width: 1000, height: 620 };
}

async function main() {
  const gj = forceSchematic ? null : await loadGeoJson();
  const isSchematic = gj === null;
  const { regions, width, height } = isSchematic ? schematic() : fromGeoJson(gj.features);
  const header = isSchematic
    ? '// SCHEMATIC PLACEHOLDER: boundary download failed; replace by running `npm run build:map` online.\n'
    : `// Generated by scripts/build-map.ts from GISCO NUTS 2021 (1:${scale.replace(/^0/, '')}), quantised to 0.1 px.\n// ${ATTRIBUTION}\n`;
  const body =
    `${header}// Do not edit by hand.\n\n` +
    `export interface RegionPath {\n  code: string;\n  d: string;\n  labelX: number;\n  labelY: number;\n}\n\n` +
    `export const MAP_SCHEMATIC = ${isSchematic};\n` +
    `export const MAP_ATTRIBUTION = ${JSON.stringify(isSchematic ? '' : ATTRIBUTION)};\n` +
    `export const MAP_WIDTH = ${width};\nexport const MAP_HEIGHT = ${height};\n\n` +
    `export const REGION_PATHS: RegionPath[] = [\n` +
    regions.map((r) => `  { code: '${r.code}', labelX: ${r.labelX}, labelY: ${r.labelY}, d: '${r.d}' },`).join('\n') +
    `\n];\n`;
  writeFileSync(OUT_FILE, body);
  console.log(`Wrote ${OUT_FILE}: ${regions.length} regions, ${width}x${height}, ${(body.length / 1024).toFixed(1)} KB${isSchematic ? ' (SCHEMATIC)' : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
