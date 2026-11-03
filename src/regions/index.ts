/**
 * Regions UI (regions workspace, see REGIONS.md): the map of kraje and the full-window region screen.
 * The rest of the game imports only from here (the store reads lifeDirector / regionsPath directly to
 * avoid an import cycle), so region work does not touch shared files.
 */
import './regions.css';

export { CzMap } from './CzMap';
export { RegionScreen } from './RegionScreen';
export { LiquidDefs, LiquidRegion } from './Liquid';
export { MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from './regionsPath';
