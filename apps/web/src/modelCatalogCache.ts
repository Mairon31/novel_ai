/**
 * Session model cache, adapted from Urakatsu's recentSearches/recentDetails
 * interaction pattern (web/src/components/ModelsPage.tsx).
 *
 * Original: Copyright (c) 2026 Urakatsu contributors — MIT License.
 * Source: https://github.com/karrot0/Urakatsu
 * Upstream revision: 165bf592716019b8487249bf7ca3ff3b708a23e7
 *
 * Changes: key by role/query/sort/context, bound cache size, time-to-live,
 * and omit persistence of hardware/device data outside the running session.
 * The MIT license notice is preserved in docs/THIRD_PARTY_NOTICES.md.
 */
import type { CatalogEntry, ModelDetail, ModelRole } from './types';

type Entry<T> = { value: T; savedAt: number };
const searches = new Map<string, Entry<CatalogEntry[]>>();
const details = new Map<string, Entry<ModelDetail>>();
const SEARCH_TTL_MS = 100_000;
const DETAIL_TTL_MS = 25_000;
const LIMIT = 24;

function read<T>(map: Map<string, Entry<T>>, key: string, maxAge: number): T | null {
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() - item.savedAt > maxAge) {
    map.delete(key);
    return null;
  }
  return item.value;
}
function write<T>(map: Map<string, Entry<T>>, key: string, value: T) {
  map.delete(key);
  map.set(key, { value, savedAt: Date.now() });
  while (map.size > LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}
export function searchCacheKey(query: string, role: ModelRole, sort: string) {
  return role + '\u0000' + sort + '\u0000' + query.trim().toLocaleLowerCase();
}
export function readModelSearch(key: string) {
  return read(searches, key, SEARCH_TTL_MS);
}
export function writeModelSearch(key: string, results: CatalogEntry[]) {
  write(searches, key, results);
}
export function detailCacheKey(repo: string, context: number) {
  return repo + '\u0000' + context;
}
export function readModelDetails(repo: string, context: number) {
  return read(details, detailCacheKey(repo, context), DETAIL_TTL_MS);
}
export function writeModelDetails(info: ModelDetail, context: number) {
  write(details, detailCacheKey(info.repo_id, context), info);
}
