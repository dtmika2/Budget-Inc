/**
 * Everything the catastrophes workspace shows during a game, mounted by Game.tsx through `PopupStack`:
 * news / response pop-ups, special-card warnings and the open special card.
 */
import { PopupStack as NewsStack } from './PopupStack';
import { SpecialCard } from './SpecialCard';
import { SpecialWarnings } from './SpecialWarnings';

export function PopupStack() {
  return (
    <>
      <NewsStack />
      <SpecialWarnings />
      <SpecialCard />
    </>
  );
}
