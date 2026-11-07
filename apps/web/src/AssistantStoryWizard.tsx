import { useRef, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Sparkles, Users, X } from 'lucide-react';
import { api } from './api';
import type { GeneratedStoryDraft, Story } from './types';

interface Props {
  onCreated: (story: Story) => void;
  onCancel: () => void;
}

export function AssistantStoryWizard({ onCreated, onCancel }: Props) {
  const [idea, setIdea] = useState('');
  const [protagonist, setProtagonist] = useState('Alex');
  const [genre, setGenre] = useState('');
  const [tone, setTone] = useState('');
  const [draft, setDraft] = useState<GeneratedStoryDraft | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [loreKeysText, setLoreKeysText] = useState<Record<number, string>>({});
  const [model, setModel] = useState('');
  const [regenerationInstruction, setRegenerationInstruction] = useState('');
  const [regenerationSection, setRegenerationSection] =
    useState<'plot' | 'openings' | 'characters' | 'lore'>('openings');
  const [previousDraft, setPreviousDraft] = useState<GeneratedStoryDraft | null>(null);
  const [lastRegenerated, setLastRegenerated] = useState('');
  const [generationBudget, setGenerationBudget] = useState<{
    context_characters: number; input_tokens_estimate: number;
    max_output_tokens: number; estimate_only: boolean;
  } | null>(null);
  const revisionRef = useRef(0);
  const [busy, setBusy] = useState<'draft' | 'install' | 'regenerate' | null>(null);
  const [error, setError] = useState('');

  function updateDraft(next: Parameters<typeof setDraft>[0]) {
    revisionRef.current += 1;
    setDraft(next);
  }
  function syncDerived(next: GeneratedStoryDraft) {
    setTagsText(next.tags.join(', '));
    setLoreKeysText(Object.fromEntries(next.lore.map(
      (entry, index) => [index, entry.keys.join(', ')])));
  }
  const reset = () => {
    updateDraft(null);
    setPreviousDraft(null);
    setLastRegenerated('');
    setGenerationBudget(null);
    setTagsText(''); setLoreKeysText({}); setError('');
  };
  function editCharacter(index: number,
                         field: keyof GeneratedStoryDraft['characters'][number], value: string) {
    updateDraft(current => current && ({
      ...current,
      characters: current.characters.map((npc, i) =>
        i === index ? { ...npc, [field]: value } : npc),
    }));
  }
  function editLore(index: number, field: 'title' | 'content' | 'keys',
                    value: string) {
    updateDraft(current => current && ({
      ...current,
      lore: current.lore.map((entry, i) => i === index ? {
        ...entry, [field]: field === 'keys'
          ? value.split(',').map(key => key.trim()).filter(Boolean) : value,
      } : entry),
    }));
  }
  function editOpening(index: number, value: string) {
    updateDraft(current => current && ({
      ...current,
      openings: current.openings.map((text, i) => i === index ? value : text),
    }));
  }
  async function generate() {
    if (busy || idea.trim().length < 30 || !protagonist.trim()) return;
    setBusy('draft'); setError(''); updateDraft(null); setPreviousDraft(null); setLastRegenerated(''); setGenerationBudget(null);
    try {
      const result = await api.draftStoryWithAI({
        idea: idea.trim(), protagonist_name: protagonist.trim(),
        genre: genre.trim(), tone: tone.trim(),
      });
      updateDraft(result.draft);
      syncDerived(result.draft);
      setModel(result.model);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function regenerate() {
    if (!draft || busy) return;
    const revisionAtStart = revisionRef.current;
    setBusy('regenerate'); setError('');
    try {
      const result = await api.regenerateAIDraft({
        draft, section: regenerationSection,
        instruction: regenerationInstruction.trim(),
      });
      if (revisionRef.current !== revisionAtStart) {
        setError('The draft changed during the request. The result was not applied to protect your edits.');
        return;
      }
      setPreviousDraft(draft);
      updateDraft(result.draft);
      syncDerived(result.draft);
      setLastRegenerated(regenerationSection);
      setGenerationBudget(result.generation_budget ?? null);
      setModel(result.model);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function undoRegeneration() {
    if (!previousDraft || busy) return;
    updateDraft(previousDraft);
    syncDerived(previousDraft);
    setPreviousDraft(null);
    setLastRegenerated('');
    setGenerationBudget(null);
    setError('');
  }
  async function install() {
    if (!draft || busy) return;
    setBusy('install'); setError('');
    try {
      const result = await api.installAIDraft(draft);
      onCreated(result.story);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <section className="creator-ai-wizard" aria-label="Asistente IA de historias">
    <div className="creator-ai-header">
      <div>
        <span className="overline"><Sparkles size={15}/> AI-ASSISTED CREATION</span>
        <h2>Build a world with AI</h2>
        <p>Generate a playable story foundation with public plot, private narrator secrets, four characters, three Lorebook entries, and three openings. Review and edit everything before saving it.</p>
      </div>
      <button className="secondary-button" onClick={onCancel} disabled={!!busy}
        type="button"><X size={16}/> Close</button>
    </div>
    <div className="creator-ai-fields">
      <label>Story idea
        <textarea aria-label="Story idea" rows={5} maxLength={2500}
          placeholder="Describe the conflict, world rules, choices, and characters you have in mind..."
          value={idea} onChange={e => { setIdea(e.target.value); reset(); }}/>
      </label>
      <div className="creator-ai-row">
        <label>Protagonist
          <input aria-label="AI story protagonist" maxLength={60}
            value={protagonist} onChange={e => { setProtagonist(e.target.value); reset(); }}/>
        </label>
        <label>Genre (optional)
          <input aria-label="AI story genre" maxLength={80}
            value={genre} placeholder="Mystery, fantasy, romance..."
            onChange={e => { setGenre(e.target.value); reset(); }}/>
        </label>
        <label>Tone (optional)
          <input aria-label="AI story tone" maxLength={120}
            value={tone} placeholder="Suspenseful, melancholic..."
            onChange={e => { setTone(e.target.value); reset(); }}/>
        </label>
      </div>
      <div className="creator-ai-actions">
        <button className="primary-button" type="button"
          onClick={() => void generate()}
          disabled={!!busy || idea.trim().length < 30 || !protagonist.trim()}>
          {busy === 'draft' ? <LoaderCircle size={16} className="rotating"/> :
            <Sparkles size={16}/>}
          {busy === 'draft' ? 'Generating plot, cast, and Lorebook...' : 'Generate proposal'}
        </button>
        <small>Uses the narrator configured in Settings. Draft generation does not download additional models or save a story. Illustrations and voices can be added afterward.</small>
      </div>
    </div>

    {error && <p role="alert" className="narrative-error">{error}</p>}
    {draft && <div className="creator-ai-preview" aria-label="Generated world review">
      <div className="creator-ai-preview-head">
        <span className="overline"><Check size={14}/> THREE STAGES COMPLETE</span>
        <h3>Review your world before creating it</h3>
        <small>Model: {model} · not saved yet</small>
      </div>
      <label>Draft title
        <input aria-label="Editable generated title" maxLength={100} value={draft.title}
          onChange={e => updateDraft({ ...draft, title: e.target.value })}/>
      </label>
      <label>Public synopsis
        <textarea aria-label="Editable generated synopsis" rows={3} maxLength={250}
          value={draft.synopsis} onChange={e =>
            updateDraft({ ...draft, synopsis: e.target.value })}/>
      </label>
      <div className="creator-ai-row">
        <label>World protagonist
          <input aria-label="Draft protagonist" maxLength={60}
            value={draft.protagonist_name} onChange={e =>
              updateDraft({ ...draft, protagonist_name: e.target.value })}/>
        </label>
        <label>World genre
          <input aria-label="Editable generated genre" maxLength={80}
            value={draft.genre} onChange={e =>
              updateDraft({ ...draft, genre: e.target.value })}/>
        </label>
        <label>Tags (comma-separated)
          <input aria-label="Editable generated tags"
            value={tagsText} onChange={e => {
              const value = e.target.value;
              setTagsText(value);
              updateDraft({ ...draft, tags: value.split(',')
                .map(tag => tag.trim()).filter(Boolean) });
            }}/>
        </label>
      </div>
      <div className="creator-ai-reading">
        <label><BookOpen size={16}/> Player-visible world
          <textarea aria-label="Editable public plot" rows={5}
            maxLength={4000} value={draft.player_plot}
            onChange={e => updateDraft({ ...draft, player_plot: e.target.value })}/>
        </label>
        <label>Private narrator plot
          <textarea aria-label="Editable generated private plot" rows={6}
            maxLength={12000} value={draft.ai_plot}
            onChange={e => updateDraft({ ...draft, ai_plot: e.target.value })}/>
        </label>
        <label>Narrator guidelines
          <textarea aria-label="Editable generated guidelines" rows={3}
            maxLength={4000} value={draft.guidelines}
            onChange={e => updateDraft({ ...draft, guidelines: e.target.value })}/>
        </label>
        <label>Continuity reminder
          <textarea aria-label="Editable generated reminder" rows={2}
            maxLength={1200} value={draft.reminder}
            onChange={e => updateDraft({ ...draft, reminder: e.target.value })}/>
        </label>
      </div>
      <div className="creator-ai-review-grid">
        <div>
          <h4><Users size={15}/> Characters ({draft.characters.length})</h4>
          {draft.characters.map((npc, index) => <details key={index}
            className="creator-ai-editable-item">
            <summary>{npc.name || 'Character ' + (index + 1)} · Edit profile</summary>
            <label>Name
              <input aria-label={'NPC name ' + (index + 1)}
                maxLength={80} value={npc.name}
                onChange={e => editCharacter(index, 'name', e.target.value)}/>
            </label>
            <label>Description
              <textarea aria-label={'NPC description ' + (index + 1)}
                rows={3} maxLength={3000} value={npc.description}
                onChange={e => editCharacter(index, 'description', e.target.value)}/>
            </label>
            <label>Personality
              <textarea aria-label={'NPC personality ' + (index + 1)}
                rows={2} maxLength={1500} value={npc.personality}
                onChange={e => editCharacter(index, 'personality', e.target.value)}/>
            </label>
            <label>Dialogue examples
              <textarea aria-label={'NPC dialogue ' + (index + 1)}
                rows={3} maxLength={3000} value={npc.dialogue_examples}
                onChange={e => editCharacter(index, 'dialogue_examples', e.target.value)}/>
            </label>
          </details>)}
        </div>
        <div>
          <h4>Lorebook ({draft.lore.length})</h4>
          {draft.lore.map((entry, index) => <details key={index}
            className="creator-ai-editable-item">
            <summary>{entry.title || 'Entrada ' + (index + 1)} · Edit lore</summary>
            <label>Title
              <input aria-label={'Lorebook title ' + (index + 1)}
                maxLength={100} value={entry.title}
                onChange={e => editLore(index, 'title', e.target.value)}/>
            </label>
            <label>Content
              <textarea aria-label={'Lorebook content ' + (index + 1)}
                rows={4} maxLength={3500} value={entry.content}
                onChange={e => editLore(index, 'content', e.target.value)}/>
            </label>
            <label>Triggers (comma-separated)
              <input aria-label={'Lorebook triggers ' + (index + 1)}
                value={loreKeysText[index] ?? entry.keys.join(', ')}
                onChange={e => {
                  const value = e.target.value;
                  setLoreKeysText(previous => ({ ...previous, [index]: value }));
                  editLore(index, 'keys', value);
                }}/>
            </label>
          </details>)}
        </div>
      </div>
      <h4>Three possible openings</h4>
      <div className="creator-ai-openings">
        {draft.openings.map((opening, index) => <label key={index}>
          Inicio {index + 1}
          <textarea aria-label={'Generated opening ' + (index + 1)}
            rows={4} maxLength={3000} value={opening}
            onChange={e => editOpening(index, e.target.value)}/>
        </label>)}
      </div>
      <div className="creator-ai-regenerate">
        <h4><Sparkles size={16}/> Regenerate one section</h4>
        <p>Keep the rest of the draft, including your manual edits.
          Review the new version before installing it.</p>
        <label>Section
          <select aria-label="Section to regenerate" value={regenerationSection}
            disabled={!!busy} onChange={e => setRegenerationSection(
              e.target.value as 'plot' | 'openings' | 'characters' | 'lore')}>
            <option value="plot">Main plot and guidelines</option>
            <option value="openings">Three openings</option>
            <option value="characters">Four characters</option>
            <option value="lore">Three Lorebook entries</option>
          </select>
        </label>
        <label>Refinement instructions (optional)
          <textarea aria-label="Regeneration instructions" rows={2} maxLength={1000}
            value={regenerationInstruction}
            onChange={e => setRegenerationInstruction(e.target.value)}
            placeholder="For example: scenes with more tension and meaningful choices."/>
        </label>
        <button type="button" className="secondary-button" disabled={!!busy}
          onClick={() => void regenerate()}>
          {busy === 'regenerate' ? <LoaderCircle size={16} className="rotating"/> :
            <Sparkles size={16}/>}
          {busy === 'regenerate' ? 'Regenerating...' : 'Regenerate section'}
        </button>
        {previousDraft && <div className="creator-ai-undo">
          <p role="status">Regeneration complete ({lastRegenerated}).
            You can restore the previous version of the entire draft.</p>
          <button type="button" className="secondary-button"
            disabled={!!busy} onClick={undoRegeneration}>
            Restore previous version
          </button>
        </div>}
        {generationBudget && <small aria-label="Estimated generation budget">
          Context: {generationBudget.context_characters.toLocaleString()} characters, approximately {generationBudget.input_tokens_estimate.toLocaleString()} input tokens, and up to {generationBudget.max_output_tokens.toLocaleString()} output tokens. These are estimates, not provider-measured usage.
        </small>}
      </div>
      <p className="creator-ai-private-note">These data remain in your local library.
        You can edit every field later in Creator Studio.
        No cover, image, or speech asset has been generated.</p>
      <button className="primary-button" type="button" disabled={!!busy ||
        draft.title.trim().length < 2 || draft.synopsis.trim().length < 25}
        onClick={() => void install()}>
        {busy === 'install' ? <LoaderCircle size={16} className="rotating"/> :
          <Check size={16}/>}
        {busy === 'install' ? 'Saving world...' : 'Create story from this draft'}
      </button>
    </div>}
  </section>;
}
