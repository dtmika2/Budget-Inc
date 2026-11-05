import { useStore } from '../store';
import { BudgetScreen } from './budget/BudgetScreen';

/**
 * Annual budget vote (spec §4.7; phase 11 sliders, phase 16 hand and zones, phase 23 three-column screen
 * with live commentary). The screen lives in ./budget/. Never shows chapter names or codes.
 */
export function BudgetVoteModal() {
  // a re-roll changes the hand: remount so the sliders start from zero for the new categories
  const hand = useStore((s) => (s.sim?.state.budgetVoteItems ?? []).join(','));
  return <BudgetScreen key={hand} />;
}
