/**
 * Everything the catastrophes workspace shows during a game, mounted by Game.tsx through `PopupStack`:
 * news / response pop-ups, the event timeline and the open special card.
 */
import { PopupStack as NewsStack } from './PopupStack';
import { SpecialCard } from './SpecialCard';
import { Timeline } from './Timeline';

export function PopupStack() {
  return (
    <>
      <NewsStack />
      <Timeline />
      <SpecialCard />
    </>
  );
}
