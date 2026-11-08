import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Sparkles, Users, X } from 'lucide-react';
import { api } from './api';
import type { GeneratedStoryDraft, Story } from './types';

interface Props {
  onCreated: (story: Story) => void;
  onCancel: () => void;
}

export function AssistantStoryWizard({ onCreated, onCancel }: Props) {
  const { t, i18n } = useTranslation();
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
        setError(t('feedback.wizardDraftChanged'));
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

  return <section className="creator-ai-wizard" aria-label={t('uiField.assistantStoryWizard.aIStoryAssistant')}>
    <div className="creator-ai-header">
      <div>
        <span className="overline"><Sparkles size={15}/> {t('wizard.label')}</span>
        <h2>{t('wizard.title')}</h2>
        <p>{t('wizard.intro')}</p>
      </div>
      <button className="secondary-button" onClick={onCancel} disabled={!!busy}
        type="button"><X size={16}/> {t('wizard.close')}</button>
    </div>
    <div className="creator-ai-fields">
      <label>{t('wizard.idea')}
        <textarea aria-label={t('uiField.assistantStoryWizard.storyIdea')} rows={5} maxLength={2500}
          placeholder={t('wizard.ideaPlaceholder')}
          value={idea} onChange={e => { setIdea(e.target.value); reset(); }}/>
      </label>
      <div className="creator-ai-row">
        <label>{t('wizard.protagonist')}
          <input aria-label={t('uiField.assistantStoryWizard.aIStoryProtagonist')} maxLength={60}
            value={protagonist} onChange={e => { setProtagonist(e.target.value); reset(); }}/>
        </label>
        <label>{t('wizard.genre')}
          <input aria-label={t('uiField.assistantStoryWizard.aIStoryGenre')} maxLength={80}
            value={genre} placeholder={t('wizard.genrePlaceholder')}
            onChange={e => { setGenre(e.target.value); reset(); }}/>
        </label>
        <label>{t('wizard.tone')}
          <input aria-label={t('uiField.assistantStoryWizard.aIStoryTone')} maxLength={120}
            value={tone} placeholder={t('wizard.tonePlaceholder')}
            onChange={e => { setTone(e.target.value); reset(); }}/>
        </label>
      </div>
      <div className="creator-ai-actions">
        <button className="primary-button" type="button"
          onClick={() => void generate()}
          disabled={!!busy || idea.trim().length < 30 || !protagonist.trim()}>
          {busy === 'draft' ? <LoaderCircle size={16} className="rotating"/> :
            <Sparkles size={16}/>}
          {t(busy === 'draft' ? 'wizard.generatingProposal' : 'wizard.generateProposal')}
        </button>
        <small>{t('wizard.modelHint')}</small>
      </div>
    </div>

    {error && <p role="alert" className="narrative-error">{error}</p>}
    {draft && <div className="creator-ai-preview" aria-label={t('uiField.assistantStoryWizard.generatedWorldReview')}>
      <div className="creator-ai-preview-head">
        <span className="overline"><Check size={14}/> {t('wizard.completed')}</span>
        <h3>{t('wizard.review')}</h3>
        <small>{t('wizardUi.modelUnsaved', { model })}</small>
      </div>
      <label>{t('wizard.draftTitle')}
        <input aria-label={t('uiField.assistantStoryWizard.editableGeneratedTitle')} maxLength={100} value={draft.title}
          onChange={e => updateDraft({ ...draft, title: e.target.value })}/>
      </label>
      <label>{t('wizard.publicSynopsis')}
        <textarea aria-label={t('uiField.assistantStoryWizard.editableGeneratedSynopsis')} rows={3} maxLength={250}
          value={draft.synopsis} onChange={e =>
            updateDraft({ ...draft, synopsis: e.target.value })}/>
      </label>
      <div className="creator-ai-row">
        <label>{t('wizard.worldProtagonist')}
          <input aria-label={t('uiField.assistantStoryWizard.draftProtagonist')} maxLength={60}
            value={draft.protagonist_name} onChange={e =>
              updateDraft({ ...draft, protagonist_name: e.target.value })}/>
        </label>
        <label>{t('wizard.worldGenre')}
          <input aria-label={t('uiField.assistantStoryWizard.editableGeneratedGenre')} maxLength={80}
            value={draft.genre} onChange={e =>
              updateDraft({ ...draft, genre: e.target.value })}/>
        </label>
        <label>{t('wizard.tags')}
          <input aria-label={t('uiField.assistantStoryWizard.editableGeneratedTags')}
            value={tagsText} onChange={e => {
              const value = e.target.value;
              setTagsText(value);
              updateDraft({ ...draft, tags: value.split(',')
                .map(tag => tag.trim()).filter(Boolean) });
            }}/>
        </label>
      </div>
      <div className="creator-ai-reading">
        <label><BookOpen size={16}/> {t('wizard.visibleWorld')}
          <textarea aria-label={t('uiField.assistantStoryWizard.editablePublicPlot')} rows={5}
            maxLength={4000} value={draft.player_plot}
            onChange={e => updateDraft({ ...draft, player_plot: e.target.value })}/>
        </label>
        <label>{t('wizard.privatePlot')}
          <textarea aria-label={t('uiField.assistantStoryWizard.editableGeneratedPrivatePlot')} rows={6}
            maxLength={12000} value={draft.ai_plot}
            onChange={e => updateDraft({ ...draft, ai_plot: e.target.value })}/>
        </label>
        <label>{t('wizard.guidelines')}
          <textarea aria-label={t('uiField.assistantStoryWizard.editableGeneratedGuidelines')} rows={3}
            maxLength={4000} value={draft.guidelines}
            onChange={e => updateDraft({ ...draft, guidelines: e.target.value })}/>
        </label>
        <label>{t('wizard.reminder')}
          <textarea aria-label={t('uiField.assistantStoryWizard.editableGeneratedReminder')} rows={2}
            maxLength={1200} value={draft.reminder}
            onChange={e => updateDraft({ ...draft, reminder: e.target.value })}/>
        </label>
      </div>
      <div className="creator-ai-review-grid">
        <div>
          <h4><Users size={15}/> {t('wizard.characterCount', { amount: draft.characters.length })}</h4>
          {draft.characters.map((npc, index) => <details key={index}
            className="creator-ai-editable-item">
            <summary>{npc.name || t('wizard.characterNumber', { number: index + 1 })} · {t('wizard.editProfile')}</summary>
            <label>{t('wizard.name')}
              <input aria-label={t('wizard.npcNameIndexed', { number: index + 1 })}
                maxLength={80} value={npc.name}
                onChange={e => editCharacter(index, 'name', e.target.value)}/>
            </label>
            <label>{t('wizard.description')}
              <textarea aria-label={t('wizard.npcDescriptionIndexed', { number: index + 1 })}
                rows={3} maxLength={3000} value={npc.description}
                onChange={e => editCharacter(index, 'description', e.target.value)}/>
            </label>
            <label>{t('wizard.personality')}
              <textarea aria-label={t('wizard.npcPersonalityIndexed', { number: index + 1 })}
                rows={2} maxLength={1500} value={npc.personality}
                onChange={e => editCharacter(index, 'personality', e.target.value)}/>
            </label>
            <label>{t('wizard.dialogue')}
              <textarea aria-label={t('wizard.npcDialogueIndexed', { number: index + 1 })}
                rows={3} maxLength={3000} value={npc.dialogue_examples}
                onChange={e => editCharacter(index, 'dialogue_examples', e.target.value)}/>
            </label>
          </details>)}
        </div>
        <div>
          <h4>{t('wizard.loreCount', { amount: draft.lore.length })}</h4>
          {draft.lore.map((entry, index) => <details key={index}
            className="creator-ai-editable-item">
            <summary>{entry.title || t('wizard.entryNumber', { number: index + 1 })} · {t('wizard.editLore')}</summary>
            <label>{t('wizard.entryTitle')}
              <input aria-label={t('wizard.loreTitleIndexed', { number: index + 1 })}
                maxLength={100} value={entry.title}
                onChange={e => editLore(index, 'title', e.target.value)}/>
            </label>
            <label>{t('wizard.entryContent')}
              <textarea aria-label={t('wizard.loreContentIndexed', { number: index + 1 })}
                rows={4} maxLength={3500} value={entry.content}
                onChange={e => editLore(index, 'content', e.target.value)}/>
            </label>
            <label>{t('wizard.triggers')}
              <input aria-label={t('wizard.loreTriggersIndexed', { number: index + 1 })}
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
      <h4>{t('wizard.threeOpenings')}</h4>
      <div className="creator-ai-openings">
        {draft.openings.map((opening, index) => <label key={index}>
          {t('wizard.openingIndexed', { number: index + 1 })}
          <textarea aria-label={t('wizard.generatedOpeningIndexed', { number: index + 1 })}
            rows={4} maxLength={3000} value={opening}
            onChange={e => editOpening(index, e.target.value)}/>
        </label>)}
      </div>
      <div className="creator-ai-regenerate">
        <h4><Sparkles size={16}/> {t('wizard.regenerate')}</h4>
        <p>{t('wizard.regenerateHint')}</p>
        <label>{t('wizard.section')}
          <select aria-label={t('uiField.assistantStoryWizard.sectionToRegenerate')} value={regenerationSection}
            disabled={!!busy} onChange={e => setRegenerationSection(
              e.target.value as 'plot' | 'openings' | 'characters' | 'lore')}>
            <option value="plot">{t('wizard.plotGuidelines')}</option>
            <option value="openings">{t('wizard.threeOpeningsOption')}</option>
            <option value="characters">{t('wizard.fourCharacters')}</option>
            <option value="lore">{t('wizard.threeLore')}</option>
          </select>
        </label>
        <label>{t('wizard.refinement')}
          <textarea aria-label={t('uiField.assistantStoryWizard.regenerationInstructions')} rows={2} maxLength={1000}
            value={regenerationInstruction}
            onChange={e => setRegenerationInstruction(e.target.value)}
            placeholder={t('uiField.assistantStoryWizard.forExampleScenesWithMoreTensionAndMeaningfulChoices')}/>
        </label>
        <button type="button" className="secondary-button" disabled={!!busy}
          onClick={() => void regenerate()}>
          {busy === 'regenerate' ? <LoaderCircle size={16} className="rotating"/> :
            <Sparkles size={16}/>}
          {t(busy === 'regenerate' ? 'wizard.regenerating' : 'wizard.regenerateSection')}
        </button>
        {previousDraft && <div className="creator-ai-undo">
          <p role="status">{t('wizard.regenerationComplete', { section: lastRegenerated })}</p>
          <button type="button" className="secondary-button"
            disabled={!!busy} onClick={undoRegeneration}>
            {t('wizard.restore')}
          </button>
        </div>}
        {generationBudget && <small aria-label={t('uiField.assistantStoryWizard.estimatedGenerationBudget')}>
          {t('wizard.generationBudget', { characters: generationBudget.context_characters.toLocaleString(i18n.language),
            input: generationBudget.input_tokens_estimate.toLocaleString(i18n.language),
            output: generationBudget.max_output_tokens.toLocaleString(i18n.language) })}
        </small>}
      </div>
      <p className="creator-ai-private-note">{t('wizard.privateDataHint')}</p>
      <button className="primary-button" type="button" disabled={!!busy ||
        draft.title.trim().length < 2 || draft.synopsis.trim().length < 25}
        onClick={() => void install()}>
        {busy === 'install' ? <LoaderCircle size={16} className="rotating"/> :
          <Check size={16}/>}
        {t(busy === 'install' ? 'wizard.savingWorld' : 'wizard.createFromDraft')}
      </button>
    </div>}
  </section>;
}
