import type { GeneratedStoryDraft } from './types';

/** Private, browser-local recovery point. Not synced or transmitted to the API. */
export const CREATOR_DRAFT_STORAGE_KEY = 'noble-ai-creator-draft-v1';
const VERSION = 1;
const MAX_LENGTH = 500_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export type RegenerationSection = 'plot' | 'openings' | 'characters' | 'lore';
export type GenerationBudgetEstimate = {
  context_characters: number; input_tokens_estimate: number;
  max_output_tokens: number; estimate_only: boolean;
};
export type CreatorDraftSnapshot = {
  idea: string; protagonist: string; genre: string; tone: string;
  draft: GeneratedStoryDraft | null;
  tagsText: string; loreKeysText: Record<number, string>;
  model: string; regenerationInstruction: string;
  regenerationSection: RegenerationSection;
  previousDraft: GeneratedStoryDraft | null;
  lastRegenerated: string;
  generationBudget: GenerationBudgetEstimate | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function string(value: unknown, max = 20_000): value is string {
  return typeof value === 'string' && value.length <= max;
}
function strings(value: unknown, maxItems: number, maxItemLength = 20_000): value is string[] {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every(item => string(item, maxItemLength));
}
function validDraft(value: unknown): value is GeneratedStoryDraft {
  const draft = record(value);
  if (!draft) return false;
  if (!['title', 'synopsis', 'player_plot', 'ai_plot', 'guidelines', 'reminder',
        'genre', 'protagonist_name'].every(key => string(draft[key]))) return false;
  if (!strings(draft.tags, 12) || !strings(draft.openings, 6)) return false;
  if (!Array.isArray(draft.characters) || draft.characters.length > 30 ||
      !draft.characters.every(item => {
        const obj = record(item);
        return obj && ['name', 'description', 'personality', 'dialogue_examples']
          .every(key => string(obj[key]));
      })) return false;
  return Array.isArray(draft.lore) && draft.lore.length <= 60 &&
    draft.lore.every(item => {
      const obj = record(item);
      return obj && string(obj.title) && string(obj.content) && strings(obj.keys, 20);
    });
}
function validBudget(value: unknown): value is GenerationBudgetEstimate {
  const data = record(value);
  return !!data && ['context_characters', 'input_tokens_estimate', 'max_output_tokens']
    .every(key => typeof data[key] === 'number' && Number.isFinite(data[key]) &&
      (data[key] as number) >= 0) && typeof data.estimate_only === 'boolean';
}
function validSnapshot(value: unknown): value is CreatorDraftSnapshot {
  const item = record(value);
  if (!item) return false;
  if (!['idea', 'protagonist', 'genre', 'tone', 'tagsText', 'model',
        'regenerationInstruction', 'lastRegenerated']
    .every(key => string(item[key]))) return false;
  if (!['plot', 'openings', 'characters', 'lore'].includes(String(item.regenerationSection)))
    return false;
  if (item.draft !== null && !validDraft(item.draft)) return false;
  if (item.previousDraft !== null && !validDraft(item.previousDraft)) return false;
  const keys = record(item.loreKeysText);
  if (!keys || Object.keys(keys).length > 60 ||
      Object.entries(keys).some(([key, val]) => !/^(0|[1-9][0-9]{0,2})$/.test(key) ||
        !string(val))) return false;
  return item.generationBudget === null || validBudget(item.generationBudget);
}

/** Reject malformed, expired and incompatible recovery data rather than guessing. */
export function readCreatorDraft(): CreatorDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CREATOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > MAX_LENGTH) {
      clearCreatorDraft();
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const wrapper = record(parsed);
    if (!wrapper || wrapper.version !== VERSION ||
        typeof wrapper.savedAt !== 'number' || !Number.isFinite(wrapper.savedAt) ||
        wrapper.savedAt > Date.now() || Date.now() - wrapper.savedAt > MAX_AGE_MS ||
        !validSnapshot(wrapper.state)) {
      clearCreatorDraft();
      return null;
    }
    return wrapper.state;
  } catch {
    clearCreatorDraft();
    return null;
  }
}
export function clearCreatorDraft(): void {
  try { window.localStorage.removeItem(CREATOR_DRAFT_STORAGE_KEY); } catch { /* Restricted storage. */ }
}
export function saveCreatorDraft(state: CreatorDraftSnapshot): void {
  try {
    // Avoid writing an empty document back after explicit discard.
    if (!state.idea.trim() && !state.draft && state.protagonist === 'Alex' &&
        !state.genre.trim() && !state.tone.trim()) {
      clearCreatorDraft();
      return;
    }
    const raw = JSON.stringify({ version: VERSION, savedAt: Date.now(), state });
    if (raw.length <= MAX_LENGTH) window.localStorage.setItem(CREATOR_DRAFT_STORAGE_KEY, raw);
  } catch { /* Full or disabled browser storage must never block authoring. */ }
}
