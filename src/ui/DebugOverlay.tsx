/**
 * Developer overlay (?debug=1, spec §9.3): chapter totals, revPct/expPct, balance, finance terms, seed,
 * phase — so G2 (data drives Finances) can be verified. Developer-facing, so labels are English and only
 * chapter CODES are shown.
 */
import { budgetTerm, originalTotals, totals } from '@core/budget';
import { useStore } from './store';

const bn = (n: number) => (n / 1e9).toFixed(1);

export function DebugOverlay() {
  useStore((s) => s.sim?.state.version ?? 0);
  const sim = useStore((s) => s.sim, (a, b) => a === b);
  if (!sim) return null;
  const s = sim.state;
  const tot = totals(sim.data.budget, s.budget);
  const { balance0, E0 } = originalTotals(sim.data.budget);
  const term = budgetTerm(sim.data.budget, s.budget, sim.cfg.finances.scale);
  return (
    <aside className="debug">
      <p>
        seed <b>{s.seed}</b> · phase <b>{s.phase}</b> · Q{s.quarter} d{s.day} · tick {s.tickCount} · source {sim.data.budget.source}
      </p>
      <p>
        finances = start {sim.leaderDef.start.finances} + budget {term.toFixed(2)} + extra {s.financesExtra.toFixed(2)} + isolation{' '}
        {s.financeModAccum.toFixed(2)} = <b>{s.resources.finances.toFixed(2)}</b>
      </p>
      <p>
        balance0 {bn(balance0)} bn · balance {bn(tot.balance)} bn · E0 {bn(E0)} bn · P {(s.projection.P * 100).toFixed(1)} % (S {s.projection.S.toFixed(1)}, T{' '}
        {s.projection.T.toFixed(1)})
      </p>
      <table>
        <thead>
          <tr>
            <th>code</th>
            <th>rev bn</th>
            <th>revPct</th>
            <th>exp bn</th>
            <th>expPct</th>
          </tr>
        </thead>
        <tbody>
          {tot.chapters.map((c) => (
            <tr key={c.code}>
              <td>{c.code}</td>
              <td>{bn(c.revenue)}</td>
              <td>{c.revPct.toFixed(2)}</td>
              <td>{bn(c.expenditure)}</td>
              <td>{c.expPct.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
