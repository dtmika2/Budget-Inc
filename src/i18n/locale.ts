/**
 * The Czech locale is split in two files so the skill tree can be edited separately from the rest:
 * - locales/cs.json            UI chrome and game content (developer)
 * - locales/skilltree.cs.json  skill tree texts and tree-screen UI chrome (skill-tree workspace, see SKILLTREE.md)
 * A key must live in exactly one of them (checked by tests/i18n.test.ts).
 */
import main from '../../locales/cs.json';
import skilltree from '../../locales/skilltree.cs.json';

export const CS: Record<string, string> = { ...(main as Record<string, string>), ...(skilltree as Record<string, string>) };
