import type { StoryTurn } from './types';

/** Browser-only, per-story recovery for unfinished player input. */
const PREFIX = 'noble-ai-reader-draft-v1:';
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed = new Set(['say', 'do', 'think', 'observe', 'interact', 'story']);
export type ComposerDraft = {
  text: string;
  mode: Exclude<StoryTurn['mode'], 'continue'>;
};

function key(storyId: string): string | null {
  return UUID.test(storyId) ? PREFIX + storyId.toLowerCase() : null;
}

export function clearReaderDraft(storyId: string): void {
  const id = key(storyId);
  if (!id) return;
  try { window.localStorage.removeItem(id); } catch { /* Storage may be blocked. */ }
}

/** Reject stale, malformed or future-dated records without executing anything. */
export function readReaderDraft(storyId: string): ComposerDraft | null {
  const id = key(storyId);
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(id);
    if (!raw) return null;
    if (raw.length > 8_000) {
      clearReaderDraft(storyId);
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      clearReaderDraft(storyId);
      return null;
    }
    const data = parsed as Record<string, unknown>;
    if (data.version !== 1 || typeof data.savedAt !== 'number' ||
        !Number.isFinite(data.savedAt) ||
        data.savedAt > Date.now() || Date.now() - data.savedAt > MAX_AGE ||
        typeof data.text !== 'string' || data.text.length > 3_000 ||
        typeof data.mode !== 'string' || !allowed.has(data.mode)) {
      clearReaderDraft(storyId);
      return null;
    }
    return { text: data.text, mode: data.mode as ComposerDraft['mode'] };
  } catch {
    clearReaderDraft(storyId);
    return null;
  }
}

export function saveReaderDraft(storyId: string, draft: ComposerDraft): void {
  const id = key(storyId);
  if (!id || draft.text.length > 3_000 || !allowed.has(draft.mode)) return;
  if (!draft.text && draft.mode === 'do') {
    clearReaderDraft(storyId);
    return;
  }
  try {
    window.localStorage.setItem(id, JSON.stringify({
      version: 1, savedAt: Date.now(), text: draft.text, mode: draft.mode,
    }));
  } catch { /* Full, private or restricted storage must not block storytelling. */ }
}
