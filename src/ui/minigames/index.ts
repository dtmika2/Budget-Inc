/** Channel id -> mini-game component. A new mini-game = one component + one entry here + config. */
import type { ComponentType } from 'react';
import type { MinigameProps } from './common';
import { PressRelease } from './PressRelease';
import { RegionalTour } from './RegionalTour';
import { TvDebate } from './TvDebate';

export const MINIGAMES: Record<string, ComponentType<MinigameProps>> = {
  press: PressRelease,
  debate: TvDebate,
  tour: RegionalTour,
};
