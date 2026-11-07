/**
 * Mini-game result: what the game changed against not playing. A skippable channel compares with its skip
 * score; the regional tour cannot be skipped, so it compares with the plain deal (the neutral score).
 */
import { config } from '@/config';
import type { PreviewRanges } from '@core/effects';
import type { Range } from '@core/types';
import { GROUP_IDS, RESOURCE_IDS } from '@core/types';
import { fmtSigned, t } from '@i18n/index';
import { mid, pct, rangeText, tone } from '../format';
import { getStore } from '../store';

/** Smallest difference worth a row, in the rounding the row shows. */
const MIN_DIFF = 0.05;
const MIN_DIFF_DAILY = 0.005;

interface Row {
  key: string;
  label: string;
  base: string;
  after: string;
  diff: string;
  tone: 'good' | 'bad' | 'neutral';
}

function rangeRow(key: string, label: string, base: Range | undefined, after: Range | undefined, anger: boolean): Row | null {
  const d = (after ? mid(after) : 0) - (base ? mid(base) : 0);
  if (Math.abs(d) < MIN_DIFF) return null;
  return { key, label, base: base ? rangeText(base) : '–', after: after ? rangeText(after) : '–', diff: fmtSigned(d, 1), tone: tone(d, anger) };
}

function compareRows(base: PreviewRanges, after: PreviewRanges): Row[] {
  const rows: (Row | null)[] = [
    ...RESOURCE_IDS.map((r) => rangeRow(r, t(`resource.short.${r}`), base.resources[r], after.resources[r], false)),
    ...GROUP_IDS.map((g) => rangeRow(`anger.${g}`, t(`group.${g}`), base.anger[g], after.anger[g], true)),
    ...Object.keys(after.regions).map((c) => rangeRow(`region.${c}`, t(`region.short.${c}`), base.regions[c], after.regions[c], false)),
    // the deal keeps its ongoing effects in order, only their daily values are scaled
    ...after.ongoing.map((o, i) => {
      const d = o.perDay - (base.ongoing[i]?.perDay ?? 0);
      if (Math.abs(d) < MIN_DIFF_DAILY) return null;
      const isAnger = o.target.startsWith('anger.');
      const what = isAnger ? t(`group.${o.target.slice(6)}`) : t(`resource.short.${o.target}`);
      return { key: `ongoing.${i}`, label: t('minigame.compare.perDay', { what }), base: fmtSigned(base.ongoing[i]?.perDay ?? 0, 2), after: fmtSigned(o.perDay, 2), diff: fmtSigned(d, 2), tone: tone(d, isAnger) };
    }),
  ];
  return rows.filter((r): r is Row => r !== null);
}

/** What the channel's score is compared with. */
function baseline(channelId: string): { score: number; plain: boolean } {
  const c = config.compromise;
  return c.channels[channelId].skippable ? { score: c.skipScore, plain: false } : { score: c.neutralScore, plain: true };
}

export function CompareScore({ channelId, score }: { channelId: string; score: number }) {
  const base = baseline(channelId);
  const diff = fmtSigned(Math.round((score - base.score) * 100));
  return <p className="mg-result__base">{t(base.plain ? 'minigame.compare.scorePlain' : 'minigame.compare.scoreSkip', { pct: pct(base.score), diff })}</p>;
}

export function CompareTable({ cardId, channelId, after }: { cardId: string; channelId: string; after: PreviewRanges }) {
  const base = baseline(channelId);
  const rows = compareRows(getStore().sim!.previewCompromise(cardId, channelId, base.score), after);
  return (
    <div className="memo memo--compromise mg-result__memo mg-compare">
      <p className="mg-compare__title">{t(base.plain ? 'minigame.compare.titlePlain' : 'minigame.compare.titleSkip')}</p>
      {rows.length === 0 ? (
        <p className="mg-compare__same">{t('minigame.compare.same')}</p>
      ) : (
        <table className="mg-compare__table">
          <thead>
            <tr>
              <th scope="col">{t('minigame.compare.what')}</th>
              <th scope="col">{t(base.plain ? 'minigame.compare.basePlain' : 'minigame.compare.baseSkip')}</th>
              <th scope="col">{t('minigame.compare.after')}</th>
              <th scope="col">{t('minigame.compare.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.base}</td>
                <td>{r.after}</td>
                <td className={`mg-compare__diff mg-compare__diff--${r.tone}`}>{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
