/** Browser adapter: Vite bundles every data/**.json at build time (no runtime network calls). */
import { CS } from '../i18n/locale';
import { loadGameData, type LoadResult } from './loader';

const modules = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' });

export function loadBundledData(): LoadResult {
  const files: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(modules)) files[path.replace(/^(\.\.\/)+/, '')] = value;
  return loadGameData(files, CS);
}
