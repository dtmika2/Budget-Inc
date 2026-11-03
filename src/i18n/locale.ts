/**
 * The Czech locale is split so separate workspaces can edit their texts without merge conflicts:
 * - locales/cs.json            UI chrome and game content (shared)
 * - locales/skilltree.cs.json  skill tree texts and tree-screen UI chrome (see SKILLTREE.md)
 * - locales/regions.cs.json    region names, traits, parties, demographics, map and region screen (see REGIONS.md)
 * - locales/events.cs.json     chaos / catastrophe event texts and the response pop-up (see CATASTROPHES.md)
 * A key must live in exactly one of them (checked by tests/i18n.test.ts). Node scripts read the same
 * files through LOCALE_FILES in ./files.ts.
 */
import main from '../../locales/cs.json';
import skilltree from '../../locales/skilltree.cs.json';
import regions from '../../locales/regions.cs.json';
import events from '../../locales/events.cs.json';

export const LOCALE_PARTS: Record<string, Record<string, string>> = { main, skilltree, regions, events };

export const CS: Record<string, string> = Object.assign({}, ...Object.values(LOCALE_PARTS));
