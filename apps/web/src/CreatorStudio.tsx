import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, ChevronRight, Feather, FileText, LoaderCircle,
  Plus, Save, Sparkles, UserRound, Users, Image as ImageIcon, UploadCloud, Trash2, X, BookKey, Globe2,
} from 'lucide-react';
import { api } from './api';
import { WorldStateEditor } from './WorldStateEditor';
import { AssistantStoryWizard } from './AssistantStoryWizard';
import type {
  Story, CreatorBlueprint, CreatorBlueprintDraft, CreatorCharacter, VisualCharacter,
  CreatorCharacterDraft, CreatorMediaAsset, SpriteExpression, SpriteDraft,
  VisualAsset, IdentityAdapterStatus, MattingStatus, NeuralCutoutMode,
  LorebookEntry, LorebookEntryDraft, LorebookPreview,
} from './types';

type Section = 'story' | 'cast' | 'lorebook' | 'world' | 'openings' | 'media';

const blankBlueprint: CreatorBlueprintDraft = {
  synopsis: '', player_plot: '', ai_plot: '', guidelines: '', reminder: '',
  opening_scenarios: [], genre: '', tags: [], language: 'es-419',
};
const blankCharacter: CreatorCharacterDraft = {
  name: '', description: '', personality: '', dialogue_examples: '',
  visual_character_id: null, voice_id: '',
  visual_dna: { tags: [], seed: null, lora_name: null, lora_strength: 0.8 },
};

const blankLorebook: LorebookEntryDraft = {
  title: '', content: '', keys: [], secondary_keys: [], secondary_mode: 'any',
  match_whole_words: true, priority: 50, enabled: true, always_active: false,
  visibility: 'world', witness_character_ids: [],
};

interface Props {
  onOpenLibrary: () => void;
  initialStoryId?: string | null;
  onStoryChange?: (id: string) => void;
}

export function CreatorStudio({ onOpenLibrary, initialStoryId, onStoryChange }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [section, setSection] = useState<Section>('story');
  const [blueprint, setBlueprint] = useState<CreatorBlueprintDraft>(blankBlueprint);
  const [characters, setCharacters] = useState<CreatorCharacter[]>([]);
  const [visualCharacters, setVisualCharacters] = useState<VisualCharacter[]>([]);
  const [lorebookEntries, setLorebookEntries] = useState<LorebookEntry[]>([]);
  const [lorebookDraft, setLorebookDraft] = useState<LorebookEntryDraft>(blankLorebook);
  const [editingLorebook, setEditingLorebook] = useState<string | null>(null);
  const [loreKeysInput, setLoreKeysInput] = useState('');
  const [loreSecondaryInput, setLoreSecondaryInput] = useState('');
  const [loreQuery, setLoreQuery] = useState('');
  const [lorePreview, setLorePreview] = useState<LorebookPreview | null>(null);
  const [character, setCharacter] = useState<CreatorCharacterDraft>(blankCharacter);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [dnaTagsInput, setDnaTagsInput] = useState('');
  const [sheetCharacter, setSheetCharacter] = useState('');
  const [sheetCaption, setSheetCaption] = useState('');
  const [sheetPose, setSheetPose] = useState('standing');
  const [sheetLayout, setSheetLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [spriteDrafts, setSpriteDrafts] = useState<SpriteDraft[]>([]);
  const [draftCharacter, setDraftCharacter] = useState('');
  const [draftStyle, setDraftStyle] = useState('clean anime visual novel art');
  const [draftCaption, setDraftCaption] = useState('');
  const [draftPose, setDraftPose] = useState('standing');
  const [draftSeed, setDraftSeed] = useState('');
  const [draftUseLora, setDraftUseLora] = useState(false);
  const [draftReference, setDraftReference] = useState('');
  const [draftSpriteReference, setDraftSpriteReference] = useState('');
  const [draftReferenceMode, setDraftReferenceMode] = useState<'img2img' | 'ipadapter'>('img2img');
  const [draftAdapterPreset, setDraftAdapterPreset] = useState('PLUS FACE (portraits)');
  const [draftAdapterWeight, setDraftAdapterWeight] = useState(0.7);
  const [adapterStatus, setAdapterStatus] = useState<IdentityAdapterStatus | null>(null);
  const [checkingAdapter, setCheckingAdapter] = useState(false);
  const [draftCutoutMode, setDraftCutoutMode] = useState<NeuralCutoutMode>('chroma_green');
  const [mattingStatus, setMattingStatus] = useState<MattingStatus | null>(null);
  const [checkingMatting, setCheckingMatting] = useState(false);
  const [alignmentConfirmed, setAlignmentConfirmed] = useState<Record<string, boolean>>({});
  const [draftProgress, setDraftProgress] = useState('');
  const [galleryAssets, setGalleryAssets] = useState<VisualAsset[]>([]);
  const storyGuard = useRef<string | null>(null);
  const [openingDraft, setOpeningDraft] = useState('');
  const [assets, setAssets] = useState<CreatorMediaAsset[]>([]);
  const [mediaKind, setMediaKind] = useState<CreatorMediaAsset['kind']>('background');
  const [mediaLabel, setMediaLabel] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaCharacter, setMediaCharacter] = useState('');
  const [mediaExpression, setMediaExpression] = useState<SpriteExpression>('neutral');
  const [mediaPose, setMediaPose] = useState('standing');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPremise, setNewPremise] = useState('');
  const [newProtagonist, setNewProtagonist] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    api.stories().then(result => {
      if (live) {
        setStories(result.stories);
        setActive(initialStoryId
          ? result.stories.find(story => story.id === initialStoryId) || null
          : null);
        setSection('story');
      }
    }).catch((exc: Error) => { if (live) setError(exc.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [initialStoryId]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    setLoading(true);
    setError(''); setNotice(''); setCharacters([]); setVisualCharacters([]); setLorebookEntries([]);
    setEditingLorebook(null); setLorebookDraft(blankLorebook);
    setLoreKeysInput(''); setLoreSecondaryInput(''); setLorePreview(null);
    setEditingCharacter(null); setCharacter(blankCharacter); setDnaTagsInput('');
    storyGuard.current = active.id;
    setAssets([]); setMediaFile(null); setSheetFile(null); setSheetCharacter('');
    setSpriteDrafts([]); setDraftCharacter(''); setDraftReference('');
    setDraftSpriteReference(''); setDraftReferenceMode('img2img');
    setAdapterStatus(null); setMattingStatus(null);
    setDraftCutoutMode('chroma_green');
    setAlignmentConfirmed({});
    setGalleryAssets([]); setDraftProgress('');
    Promise.all([api.creatorBlueprint(active.id), api.creatorCharacters(active.id),
                 api.creatorAssets(active.id), api.lorebookEntries(active.id),
                 api.visualState(active.id), api.spriteDrafts(active.id)])
      .then(([data, cast, media, lorebook, visuals, draftResult]) => {
        if (!live) return;
        const { synopsis, player_plot, ai_plot, guidelines, reminder,
          opening_scenarios, genre, tags, language } = data;
        setBlueprint({ synopsis, player_plot, ai_plot, guidelines, reminder,
          opening_scenarios, genre, tags, language });
        setTagsInput(tags.join(', '));
        setCharacters(cast.characters);
        setVisualCharacters(visuals.characters);
        setGalleryAssets(visuals.assets);
        setSpriteDrafts(draftResult.drafts);
        setAssets(media.assets);
        setLorebookEntries(lorebook.entries);
      })
      .catch((exc: Error) => { if (live) setError(exc.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active?.id]);

  function update<K extends keyof CreatorBlueprintDraft>(key: K, value: CreatorBlueprintDraft[K]) {
    setBlueprint(previous => ({ ...previous, [key]: value }));
  }

  async function createStory() {
    if (newTitle.trim().length < 2 || newPremise.trim().length < 10 ||
        !newProtagonist.trim()) return;
    setWorking(true); setError('');
    try {
      const saved = await api.createStory(newTitle.trim(), newPremise.trim(), newProtagonist.trim());
      setStories(previous => [saved, ...previous]);
      setActive(saved); setSection('story'); setCreateNew(false);
      onStoryChange?.(saved.id);
      setNewTitle(''); setNewPremise(''); setNewProtagonist('');
      setNotice('Story created. You can prepare its content before playing.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function saveBlueprint() {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const draft = { ...blueprint, tags: tagsInput.split(',').map(v => v.trim()).filter(Boolean) };
      const saved: CreatorBlueprint = await api.saveCreatorBlueprint(active.id, draft);
      setBlueprint({
        synopsis: saved.synopsis, player_plot: saved.player_plot,
        ai_plot: saved.ai_plot, guidelines: saved.guidelines,
        reminder: saved.reminder, opening_scenarios: saved.opening_scenarios,
        genre: saved.genre, tags: saved.tags, language: saved.language,
      });
      setTagsInput(saved.tags.join(', '));
      setNotice('Creator content saved. The narrator will use the private instructions.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editCharacter(value: CreatorCharacter) {
    setEditingCharacter(value.id);
    setDnaTagsInput(value.visual_dna.tags.join(', '));
    setCharacter({
      name: value.name, description: value.description,
      personality: value.personality, dialogue_examples: value.dialogue_examples,
      visual_character_id: value.visual_character_id, voice_id: value.voice_id,
      visual_dna: value.visual_dna,
    });
  }

  async function saveCharacter() {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const tags = dnaTagsInput.split(',').map(tag => tag.trim()).filter(Boolean);
      await api.saveCreatorCharacter(active.id, {
        ...character, visual_dna: { ...character.visual_dna, tags,
          lora_name: character.visual_dna.lora_name?.trim() || null },
      }, editingCharacter || undefined);
      setCharacters((await api.creatorCharacters(active.id)).characters);
      setEditingCharacter(null); setCharacter(blankCharacter); setDnaTagsInput('');
      setNotice('Character narrative profile saved.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function importSheet() {
    if (!active || !sheetCharacter || !sheetFile) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const result = await api.importCreatorExpressionSheet(active.id, sheetCharacter, {
        caption: sheetCaption.trim(), pose: sheetPose.trim(), layout: sheetLayout, file: sheetFile,
      });
      setAssets((await api.creatorAssets(active.id)).assets);
      setSheetFile(null);
      setNotice('Imported ' + result.count + ' character expressions.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function checkMatting() {
    setCheckingMatting(true); setError('');
    try { setMattingStatus(await api.mattingStatus()); }
    catch (exc) { setError((exc as Error).message); }
    finally { setCheckingMatting(false); }
  }

  async function checkIdentityAdapter() {
    setCheckingAdapter(true); setError('');
    try { setAdapterStatus(await api.identityAdapterStatus()); }
    catch (exc) { setError((exc as Error).message); }
    finally { setCheckingAdapter(false); }
  }

  async function startSpriteDraft() {
    if (!active || !draftCharacter || draftCaption.trim().length < 3) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const seed = draftSeed.trim() ? Number(draftSeed) : undefined;
      if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0))
        throw new Error('The seed must be a nonnegative safe integer.');
      const created = await api.startSpriteDraft(active.id, draftCharacter, {
        caption: draftCaption.trim(), pose: draftPose.trim(),
        style: draftStyle.trim(), seed,
        reference_asset_id: draftReference || undefined,
        reference_sprite_asset_id: draftSpriteReference || undefined,
        reference_mode: draftReferenceMode,
        ipadapter_preset: draftAdapterPreset,
        ipadapter_weight: draftAdapterWeight,
        cutout_mode: draftCutoutMode,
        use_lora: draftUseLora,
      });
      if (storyGuard.current === active.id) {
        setSpriteDrafts(prev => [created, ...prev]);
        setNotice('Draft created. Generate and review expressions before approval.');
      }
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  const spriteExpressions: Array<{ id: SpriteExpression; label: string }> = [
    { id: 'neutral', label: 'Neutral' },
    { id: 'joy', label: 'Joy' },
    { id: 'anger', label: 'Anger' },
    { id: 'sadness', label: 'Sadness' },
    { id: 'surprise', label: 'Surprise' },
  ];

  async function generateSprites(draft: SpriteDraft, expression?: SpriteExpression) {
    if (!active || working) return;
    const storyId = active.id;
    setWorking(true); setError(''); setNotice('');
    let current = draft;
    try {
      const chosen = spriteExpressions
        .filter(entry => expression === entry.id || (!expression && !current.slots[entry.id].ready));
      for (const [index, entry] of chosen.entries()) {
        if (storyGuard.current !== storyId) break;
        setDraftProgress('Generating ' + entry.label + ' (' +
          (index + 1) + '/' + chosen.length + ') via ComfyUI...');
        current = await api.generateSpriteExpression(storyId, draft.id, entry.id);
        if (storyGuard.current === storyId) {
          setAlignmentConfirmed(prev => ({ ...prev, [draft.id]: false }));
          setSpriteDrafts(prev => prev.map(item => item.id === draft.id ? current : item));
        }
      }
      if (storyGuard.current === storyId) {
        setNotice('Draft updated. Review edges, expression, and consistency before approval.');
      }
    } catch (exc) { if (storyGuard.current === storyId) setError((exc as Error).message); }
    finally { setDraftProgress(''); setWorking(false); }
  }

  async function approveSprites(draft: SpriteDraft) {
    if (!active || working || draft.ready_count !== 5 ||
        (draft.alignment_review_needed && !alignmentConfirmed[draft.id])) return;
    const storyId = active.id;
    setWorking(true); setError(''); setNotice('');
    try {
      const result = await api.approveSpriteDraft(
        storyId, draft.id, !!alignmentConfirmed[draft.id]);
      if (storyGuard.current === storyId) {
        setAssets((await api.creatorAssets(storyId)).assets);
        setSpriteDrafts(prev => prev.filter(item => item.id !== draft.id));
        setNotice('Approved ' + result.count + ' expressions. They are now available in the reader.');
      }
    } catch (exc) { if (storyGuard.current === storyId) setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function discardSprites(draft: SpriteDraft) {
    if (!active || working || !window.confirm('Discard this draft and its previews?')) return;
    const storyId = active.id;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.discardSpriteDraft(storyId, draft.id);
      if (storyGuard.current === storyId) {
        setSpriteDrafts(prev => prev.filter(item => item.id !== draft.id));
        setNotice('Draft discarded. Published sprites are unchanged.');
      }
    } catch (exc) { if (storyGuard.current === storyId) setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editLorebook(entry: LorebookEntry) {
    setEditingLorebook(entry.id);
    setLorebookDraft({
      title: entry.title, content: entry.content, keys: entry.keys,
      secondary_keys: entry.secondary_keys, secondary_mode: entry.secondary_mode,
      match_whole_words: entry.match_whole_words, priority: entry.priority,
      enabled: entry.enabled, always_active: entry.always_active,
      visibility: entry.visibility || 'world',
      witness_character_ids: entry.witness_character_ids || [],
    });
    setLoreKeysInput(entry.keys.join(', '));
    setLoreSecondaryInput(entry.secondary_keys.join(', '));
    setLorePreview(null);
  }

  function resetLorebookEditor() {
    setEditingLorebook(null); setLorebookDraft(blankLorebook);
    setLoreKeysInput(''); setLoreSecondaryInput('');
  }

  async function saveLorebook() {
    if (!active || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.saveLorebookEntry(active.id, {
        ...lorebookDraft,
        keys: loreKeysInput.split(',').map(value => value.trim()).filter(Boolean),
        secondary_keys: loreSecondaryInput.split(',').map(value => value.trim()).filter(Boolean),
      }, editingLorebook || undefined);
      setLorebookEntries((await api.lorebookEntries(active.id)).entries);
      resetLorebookEditor();
      setLorePreview(null);
      setNotice('Lorebook entry saved. It will activate when its keywords match.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function removeLorebook(entry: LorebookEntry) {
    if (!active || working || !window.confirm('Delete this Lorebook entry?')) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.deleteLorebookEntry(active.id, entry.id);
      setLorebookEntries((await api.lorebookEntries(active.id)).entries);
      if (editingLorebook === entry.id) resetLorebookEditor();
      setLorePreview(null);
      setNotice('Lorebook entry deleted.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function previewLorebookActivation() {
    if (!active) return;
    setWorking(true); setError(''); setLorePreview(null);
    try { setLorePreview(await api.previewLorebook(active.id, loreQuery)); }
    catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function rememberStory(updated: Story) {
    setActive(current => current?.id === updated.id ? updated : current);
    setStories(previous => previous.map(story => story.id === updated.id ? updated : story));
  }

  async function chooseCover(assetId: string | null) {
    if (!active || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      rememberStory(await api.setStoryCover(active.id, assetId));
      setNotice(assetId ? 'Editorial cover selected for the library.' :
        'Editorial cover removed. The story remains intact.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editAsset(asset: CreatorMediaAsset) {
    setEditingAsset(asset.id); setMediaKind(asset.kind);
    setMediaLabel(asset.label); setMediaCaption(asset.caption);
    setMediaCharacter(asset.character_id || '');
    setMediaExpression(asset.expression); setMediaPose(asset.pose);
    setMediaFile(null);
  }
  function resetMediaEditor() {
    setEditingAsset(null); setMediaLabel(''); setMediaCaption('');
    setMediaCharacter(''); setMediaExpression('neutral');
    setMediaPose('standing'); setMediaFile(null);
  }
  async function saveMediaAsset() {
    if (!active || !mediaLabel.trim() || mediaCaption.trim().length < 3) return;
    setWorking(true); setError(''); setNotice('');
    try {
      if (editingAsset) {
        await api.editCreatorAsset(active.id, editingAsset, mediaLabel.trim(),
          mediaCaption.trim(), mediaKind === 'foreground' ? mediaExpression : undefined,
          mediaKind === 'foreground' ? mediaPose.trim() : undefined);
      } else {
        if (!mediaFile) throw new Error('Select an image file.');
        const imported = await api.uploadCreatorAsset(active.id, {
          kind: mediaKind, label: mediaLabel.trim(), caption: mediaCaption.trim(),
          character_id: mediaKind === 'foreground' ? (mediaCharacter || undefined) : undefined,
          expression: mediaKind === 'foreground' ? mediaExpression : undefined,
          pose: mediaKind === 'foreground' ? mediaPose.trim() : undefined,
          file: mediaFile,
        });
        if (mediaKind === 'cover') rememberStory(await api.setStoryCover(active.id, imported.id));
      }
      setAssets((await api.creatorAssets(active.id)).assets);
      resetMediaEditor();
      setNotice(mediaKind === 'cover' && !editingAsset ?
        'Editorial cover saved and selected for the library.' :
        'Visual asset saved for selection during reading.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }
  async function deleteMediaAsset(asset: CreatorMediaAsset) {
    if (!active || !window.confirm('Delete this visual asset from the story?')) return;
    setWorking(true); setError('');
    try {
      await api.deleteCreatorAsset(active.id, asset.id);
      if (active.cover_asset_id === asset.id) {
        rememberStory({ ...active, cover_asset_id: null, cover_image_url: null });
      }
      setAssets((await api.creatorAssets(active.id)).assets);
      if (editingAsset === asset.id) resetMediaEditor();
      setNotice('Visual asset deleted.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function startOpening(index: number) {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.startCreatorOpening(active.id, index);
      setNotice('Opening saved as the first turn. Open the story from Library to continue.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  return <section className="creator-studio" aria-label="Story creation studio">
    <div className="creator-heading">
      <button className="creator-return" onClick={onOpenLibrary}>
        <ArrowLeft size={16}/> Library
      </button>
      <span className="overline"><Feather size={15}/> NOBLE CREATOR STUDIO</span>
      <h1>Build stories with purpose.</h1>
      <p>Keep player-visible information separate from the narrator's private knowledge. Design characters, world rules, openings, and tone without mixing the editor into the reader.</p>
    </div>

    <div className="creator-layout">
      <aside className="creator-projects" aria-label="Stories to create">
        <div className="creator-projects-head">
          <div><span className="overline">YOUR WORLDS</span><strong>Projects</strong></div>
          <button title="New project" aria-label="Create project" onClick={() => setCreateNew(true)}>
            <Plus size={18}/>
          </button>
        </div>
        {loading && !active && <p className="creator-placeholder"><LoaderCircle size={15} className="rotating"/> Loading...</p>}
        {stories.map(story => <button className={'creator-project ' +
          (active?.id === story.id ? 'is-selected' : '')} key={story.id}
          onClick={() => {
            setActive(story); setSection('story');
            onStoryChange?.(story.id);
          }}>
          <BookOpen size={18}/><span><strong>{story.title}</strong>
          <small>{story.protagonist_name || 'Protagonist'}</small></span><ChevronRight size={15}/>
        </button>)}
        {!stories.length && !loading && <p className="creator-placeholder">
          No stories yet. Create your first project to build its world.</p>}
        <button className="creator-new" onClick={() => {
          setActive(null); setAssistantVisible(true);
        }}><Sparkles size={17}/> Create with AI</button>
        <button className="creator-new" onClick={() => setCreateNew(true)}>
          <Plus size={17}/> New project
        </button>
      </aside>

      <div className="creator-editor">
        {error && <p className="narrative-error" role="alert">{error}</p>}
        {notice && <p className="narrative-saved" role="status"><Check size={16}/>{notice}</p>}
        {!active && assistantVisible ? <AssistantStoryWizard
          onCancel={() => setAssistantVisible(false)}
          onCreated={saved => {
            setStories(previous => [saved, ...previous]);
            setActive(saved); setSection('story'); setAssistantVisible(false);
            onStoryChange?.(saved.id);
          }}/>
        : !active ? <div className="creator-welcome">
          <Sparkles size={40}/><h2>Select a story to edit</h2>
          <p>Write the player-facing plot, private model context, character profiles, and story openings here.</p>
          <button className="primary-button" onClick={() => setCreateNew(true)}>
            <Plus size={16}/> Create new story
          </button>
        </div> : <>
          <div className="creator-editor-title">
            <div><span className="overline">EDITING PROJECT</span>
              <h2>{active.title}</h2>
              <small>The player controls {active.protagonist_name || 'Protagonist'}.</small></div>
            <button className="secondary-button" onClick={onOpenLibrary}>
              <BookOpen size={15}/> Go to Library
            </button>
          </div>
          <nav className="creator-editor-tabs" aria-label="Creator tools">
            <button className={section === 'story' ? 'selected' : ''}
              onClick={() => setSection('story')}><FileText size={17}/> Plot and context</button>
            <button className={section === 'cast' ? 'selected' : ''}
              onClick={() => setSection('cast')}><Users size={17}/> Characters ({characters.length})</button>
            <button className={section === 'lorebook' ? 'selected' : ''}
              onClick={() => setSection('lorebook')}><BookKey size={17}/> Lorebook ({lorebookEntries.length})</button>
            <button className={section === 'world' ? 'selected' : ''}
              onClick={() => setSection('world')}><Globe2 size={17}/> World state</button>
            <button className={section === 'openings' ? 'selected' : ''}
              onClick={() => setSection('openings')}><Feather size={17}/> Aperturas</button>
            <button className={section === 'media' ? 'selected' : ''}
              onClick={() => setSection('media')}><ImageIcon size={17}/> Images ({assets.length})</button>
          </nav>

          {loading ? <div className="loading"><LoaderCircle className="rotating" size={17}/> Loading content...</div> :
            section === 'world' ? <WorldStateEditor
              storyId={active.id} characters={characters}/> :
            section === 'media' ? <div className="creator-fields creator-media-library">
              <div className="creator-section-intro">
                <h3>Covers, backgrounds, and characters</h3>
                <p>Choose a fixed library cover and prepare scene backgrounds and transparent character portraits. No images are generated automatically.</p>
              </div>
              <div className="creator-cover-preview" aria-label="Current editorial cover">
                <div className="creator-cover-preview-art">
                  {active.cover_image_url ?
                    <img src={active.cover_image_url} alt={'Cover of ' + active.title}/> :
                    <BookOpen size={42} aria-hidden="true"/>}
                </div>
                <div className="creator-cover-preview-copy">
                  <span className="overline">STORY COVER</span>
                  <strong>{active.cover_image_url ? 'Custom cover' : 'No custom cover'}</strong>
                  <p>Shown in Library and story details.
                    It does not change when you continue or generate a scene.</p>
                  {active.cover_asset_id && <button className="secondary-button" disabled={working}
                    onClick={() => void chooseCover(null)}>Remove cover</button>}
                </div>
              </div>
              <div className="creator-media-grid">
                {assets.map(asset => <article className="creator-media-card" key={asset.id}>
                  <div className={'creator-media-thumbnail ' + asset.kind}>
                    <img src={asset.url} loading="lazy" alt={'Image: ' + asset.label}/>
                  </div>
                  <div className="creator-media-copy">
                    <small>{asset.kind === 'cover' ? 'COVER' :
                      asset.kind === 'background' ? 'BACKGROUND' : 'FOREGROUND'}
                      {asset.id === active.cover_asset_id ? ' · CURRENT' : ''}
                      {asset.source === 'ai_reviewed' ? ' · AI REVIEWED' : ''}</small>
                    <strong>{asset.label}</strong><p>{asset.caption}</p>
                    {asset.kind === 'foreground' && <small>
                      Expression: {asset.expression} · Pose: {asset.pose}
                    </small>}
                    <div>
                      {asset.kind === 'cover' && asset.id !== active.cover_asset_id &&
                        <button className="secondary-button" disabled={working}
                          onClick={() => void chooseCover(asset.id)}>Use as cover</button>}
                      <button className="secondary-button" disabled={working}
                        onClick={() => editAsset(asset)}>Edit description</button>
                      <button aria-label={'Delete image ' + asset.label}
                        className="creator-media-delete" disabled={working}
                        onClick={() => void deleteMediaAsset(asset)}><Trash2 size={15}/></button>
                    </div>
                  </div>
                </article>)}
                {assets.length === 0 && <div className="creator-media-empty">
                  <ImageIcon size={30}/><strong>No visual assets yet.</strong>
                  <p>Import a background or character portrait to prepare your visual novel.</p>
                </div>}
              </div>
              <div className="creator-media-form">
                <h4>{editingAsset ? 'Edit asset' : 'Add visual asset'}</h4>
                {!editingAsset && <div className="creator-double">
                  <label>Asset type
                    <select aria-label="Visual asset type" value={mediaKind}
                      onChange={e => setMediaKind(e.target.value as CreatorMediaAsset['kind'])}>
                      <option value="cover">Editorial cover</option>
                      <option value="background">Scene background</option>
                      <option value="foreground">Character / foreground</option>
                    </select>
                  </label>
                  {mediaKind === 'foreground' && <label>Linked character (optional)
                    <select aria-label="Image character" value={mediaCharacter}
                      onChange={e => setMediaCharacter(e.target.value)}>
                      <option value="">None</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>}
                </div>}
                {mediaKind === 'foreground' && <div className="creator-double">
                  <label>Sprite expression
                    <select aria-label="Sprite expression" value={mediaExpression}
                      onChange={e => setMediaExpression(e.target.value as SpriteExpression)}>
                      <option value="neutral">Neutral</option>
                      <option value="joy">Joy</option>
                      <option value="anger">Anger</option>
                      <option value="sadness">Sadness</option>
                      <option value="surprise">Surprise</option>
                    </select>
                  </label>
                  <label>Pose (identifier)
                    <input aria-label="Sprite pose" maxLength={32} value={mediaPose}
                      onChange={e => setMediaPose(e.target.value)}
                      placeholder="standing, sitting, waving..."/>
                  </label>
                </div>}
                <label>Name
                  <input aria-label="Image name" maxLength={100} value={mediaLabel}
                    placeholder="Throne room, Aira smiling..."
                    onChange={e => setMediaLabel(e.target.value)}/></label>
                <label>Caption for matching the scene
                  <textarea aria-label="Image description" maxLength={220} rows={3}
                    value={mediaCaption} onChange={e => setMediaCaption(e.target.value)}
                    placeholder="Dark forest at night, Aira smiling in the tavern..."/>
                  <small>Describe specific places and emotions. This caption is not sent to a model.</small>
                </label>
                {!editingAsset && <label>PNG, JPEG, or WebP file (up to 12 MiB)
                  <input type="file" aria-label="Visual asset file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => setMediaFile(e.target.files?.[0] || null)}/>
                  {mediaKind === 'foreground' && <small>
                    PNG transparency is preserved so characters can be layered over the background.
                  </small>}
                  {mediaKind === 'cover' && <small>
                    The cover is saved as WebP and selected automatically upon import.
                  </small>}
                </label>}
                <div className="creator-actions">
                  <button className="primary-button" disabled={working || !mediaLabel.trim() ||
                    mediaCaption.trim().length < 3 ||
                    (mediaKind === 'foreground' && !/^[a-z0-9_-]{1,32}$/.test(mediaPose.trim().toLowerCase())) ||
                    (!editingAsset && !mediaFile)}
                    onClick={() => void saveMediaAsset()}><UploadCloud size={16}/>
                    {editingAsset ? 'Save description' : 'Import image'}</button>
                  {editingAsset && <button className="secondary-button"
                    onClick={resetMediaEditor}>Cancel editing</button>}
                </div>
              </div>
              <div className="creator-media-form">
                <h4>Import expression sheet</h4>
                <p>A grid of five transparent cells in this order: neutral, joy, anger, sadness, surprise. The reader reuses each PNG without generating images when advancing.</p>
                <div className="creator-double">
                  <label>Sheet character
                    <select aria-label="Expression-sheet character"
                      value={sheetCharacter} onChange={e => setSheetCharacter(e.target.value)}>
                      <option value="">Select a character</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>
                  <label>Cell layout
                    <select aria-label="Sheet layout" value={sheetLayout}
                      onChange={e => setSheetLayout(e.target.value as 'horizontal' | 'vertical')}>
                      <option value="horizontal">One row of five</option>
                      <option value="vertical">One column of five</option>
                    </select>
                  </label>
                </div>
                <div className="creator-double">
                  <label>Scene context
                    <input aria-label="Sheet context" maxLength={220}
                      value={sheetCaption} onChange={e => setSheetCaption(e.target.value)}
                      placeholder="Aira castillo cristal"/>
                  </label>
                  <label>Shared pose
                    <input aria-label="Sheet pose" maxLength={32}
                      value={sheetPose} onChange={e => setSheetPose(e.target.value)}
                      placeholder="standing"/>
                  </label>
                </div>
                <label>Transparent PNG or WebP sheet (maximum 12 MiB)
                  <input type="file" aria-label="Expression-sheet file"
                    accept="image/png,image/webp"
                    onChange={e => setSheetFile(e.target.files?.[0] || null)}/>
                </label>
                <button className="primary-button"
                  disabled={working || !sheetCharacter || sheetCaption.trim().length < 3 ||
                    !/^[a-z0-9_-]{1,32}$/.test(sheetPose.trim().toLowerCase()) || !sheetFile}
                  onClick={() => void importSheet()}><UploadCloud size={16}/>
                  Import five expressions
                </button>
              </div>
              <div className="creator-media-form">
                <h4>Generate expressions with AI · review first</h4>
                <p>ComfyUI generates five separate portraits, one per request. Noble AI removes the background and rejects low-quality cutouts. Images remain drafts until you approve all five previews.</p>
                <div className="creator-double">
                  <label>Character for AI
                    <select aria-label="NPC for expression generation" value={draftCharacter}
                      onChange={event => {
                        setDraftCharacter(event.target.value);
                        setDraftSpriteReference('');
                      }}>
                      <option value="">Select an NPC</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>
                  <label>Generated sprite pose
                    <input aria-label="NPC generation pose" maxLength={32}
                      value={draftPose} onChange={event => setDraftPose(event.target.value)}/>
                  </label>
                </div>
                <label>Caption to match sprites during the story
                  <input aria-label="AI sprite context" maxLength={220}
                    value={draftCaption} onChange={event => setDraftCaption(event.target.value)}
                    placeholder="Aira in the ancient library"/>
                </label>
                <label>Expression art style
                  <input aria-label="AI sprite style" maxLength={220}
                    value={draftStyle} onChange={event => setDraftStyle(event.target.value)}/>
                </label>
                <div className="creator-double">
                  <label>Optional seed (defaults to NPC seed)
                    <input type="number" aria-label="AI sprite seed"
                      min={0} step={1} value={draftSeed}
                      onChange={event => setDraftSeed(event.target.value)}
                      placeholder="Visual DNA seed"/>
                  </label>
                  <label>Gallery reference (optional)
                    <select aria-label="AI sprite reference"
                      value={draftReference} onChange={event => {
                        setDraftReference(event.target.value);
                        if (event.target.value) setDraftSpriteReference('');
                      }}>
                      <option value="">No Gallery reference</option>
                      {galleryAssets.map(asset => <option value={asset.id} key={asset.id}>
                        {asset.origin === 'comfyui' ? 'ComfyUI' : 'Imported'} · {asset.id.slice(0, 8)}
                      </option>)}
                    </select>
                  </label>
                </div>
                <div className="creator-double">
                  <label>Approved sprite of the same NPC (optional)
                    <select aria-label="AI reference sprite" value={draftSpriteReference}
                      onChange={event => {
                        setDraftSpriteReference(event.target.value);
                        if (event.target.value) setDraftReference('');
                      }}>
                      <option value="">Do not use an approved sprite</option>
                      {assets.filter(item => item.kind === 'foreground' &&
                        item.character_id === draftCharacter).map(item =>
                        <option value={item.id} key={item.id}>
                          {item.label} · {item.expression}
                        </option>)}
                    </select>
                  </label>
                  <label>Reference mode
                    <select aria-label="AI reference mode"
                      value={draftReferenceMode}
                      onChange={event => setDraftReferenceMode(
                        event.target.value as 'img2img' | 'ipadapter')}>
                      <option value="img2img">img2img · preserve composition</option>
                      <option value="ipadapter">IPAdapter · guide identity</option>
                    </select>
                  </label>
                </div>
                {draftReferenceMode === 'ipadapter' && <>
                  <div className="creator-double">
                    <label>Preset IPAdapter Plus
                      <select aria-label="Sprite IPAdapter preset"
                        value={draftAdapterPreset}
                        onChange={event => setDraftAdapterPreset(event.target.value)}>
                        <option value="PLUS FACE (portraits)">PLUS FACE · portraits</option>
                        <option value="PLUS (high strength)">PLUS · high influence</option>
                        <option value="STANDARD (medium strength)">STANDARD · medium</option>
                      </select>
                    </label>
                    <label>IPAdapter strength: {draftAdapterWeight.toFixed(2)}
                      <input aria-label="Sprite IPAdapter strength"
                        type="number" min={0.1} max={1.5} step={0.05}
                        value={draftAdapterWeight}
                        onChange={event => setDraftAdapterWeight(Number(event.target.value))}/>
                    </label>
                  </div>
                  <button className="secondary-button" disabled={checkingAdapter || working}
                    onClick={() => void checkIdentityAdapter()}>
                    {checkingAdapter ? 'Checking ComfyUI...' : 'Check installed IPAdapter'}
                  </button>
                  {adapterStatus && <p className="creator-hint" role="status">
                    {adapterStatus.available
                      ? 'IPAdapter available · ' + adapterStatus.model_count + ' models and ' +
                        adapterStatus.clip_vision_count + ' CLIP Vision · ' +
                        adapterStatus.presets.join(', ')
                      : 'IPAdapter is not ready: ' + (adapterStatus.error || 'missing models or nodes')}
                  </p>}
                  <p className="creator-hint">
                    Requires IPAdapter Plus with installed UnifiedLoader and IPAdapter nodes, compatible IPAdapter and CLIP Vision models, and a selected Gallery reference or an approved sprite from the same NPC. No models are downloaded.
                  </p>
                </>}
                <div className="creator-double">
                  <label>Background removal method
                    <select aria-label="AI sprite background removal"
                      value={draftCutoutMode}
                      onChange={event => setDraftCutoutMode(
                        event.target.value as NeuralCutoutMode)}>
                      <option value="chroma_green">Green screen · fast, no extra model</option>
                      <option value="neural_rmbg2">RMBG 2.0 · neural mask</option>
                      <option value="neural_birefnet_portrait">BiRefNet Portrait · portraits</option>
                      <option value="neural_birefnet_matting">BiRefNet Matting · transparency</option>
                    </select>
                  </label>
                  <div className="creator-fields">
                    <button className="secondary-button" disabled={working || checkingMatting}
                      onClick={() => void checkMatting()}>
                      {checkingMatting ? 'Checking model weights...' :
                        'Check cutout models'}
                    </button>
                  </div>
                </div>
                {mattingStatus && <div className="creator-hint" role="status"
                    aria-label="Cutout model status">
                  {mattingStatus.modes.filter(item => item.mode !== 'chroma_green')
                    .map(item => <p key={item.mode}>
                      {item.model}: {item.ready ? 'Ready' : item.reason || 'Unavailable'}
                    </p>)}
                </div>}
                <p className="creator-hint">
                  Neural cutout uses ComfyUI-RMBG and a separate PNG mask to reconstruct transparency. Required nodes and model weights must be installed. Missing dependencies stop generation without changing existing sprites or downloading models. Review the mask before approval.
                </p>
                <label>
                  <input type="checkbox" aria-label="Use NPC LoRA for AI sprites"
                    checked={draftUseLora} onChange={event => setDraftUseLora(event.target.checked)}/>
                  {' '}Apply this NPC's configured LoRA (if installed)
                </label>
                <p className="creator-hint">
                  All five expressions share the checkpoint, seed, and style. img2img preserves composition while IPAdapter guides a new image from an identity reference; neither guarantees a consistent face. Up to three drafts per story are retained for 48 hours. The five renders run sequentially.
                </p>
                <button className="secondary-button" disabled={working || !draftCharacter ||
                    draftCaption.trim().length < 3 ||
                    !/^[a-z0-9_-]{1,32}$/.test(draftPose.trim().toLowerCase()) ||
                    (draftReferenceMode === 'ipadapter' &&
                      !draftReference && !draftSpriteReference) ||
                    (draftReferenceMode === 'ipadapter' &&
                      (!Number.isFinite(draftAdapterWeight) ||
                       draftAdapterWeight < 0.1 || draftAdapterWeight > 1.5))}
                  onClick={() => void startSpriteDraft()}>
                  <Sparkles size={16}/> Prepare five-expression draft
                </button>
                {draftProgress && <p role="status" className="creator-hint">
                  <LoaderCircle className="rotating" size={15}/> {draftProgress}
                </p>}
                {spriteDrafts.map(draft => <section key={draft.id}
                    className="creator-sprite-draft" aria-label={'Sprite draft ' + draft.character_name}>
                  <h4>{draft.character_name} · {draft.ready_count}/5 expressions</h4>
                  <p className="creator-hint">{draft.checkpoint} · Seed {draft.seed} ·
                    {' '}{draft.use_lora ? 'LoRA enabled' : 'No LoRA'} · {draft.pose}
                    {' · Cutout: ' + (draft.cutout_mode === 'neural_rmbg2' ? 'RMBG 2.0'
                      : draft.cutout_mode === 'neural_birefnet_portrait' ? 'BiRefNet portraits'
                      : draft.cutout_mode === 'neural_birefnet_matting' ? 'BiRefNet matting'
                      : 'Green screen')}
                    {draft.reference_mode === 'ipadapter'
                      ? ' · IPAdapter ' + draft.ipadapter_preset +
                        ' (' + draft.ipadapter_weight + ')' : ''}</p>
                  <div className="creator-media-grid">
                    {spriteExpressions.map(entry => {
                      const slot = draft.slots[entry.id];
                      return <article className="creator-media-card" key={entry.id}>
                        <div className="creator-media-thumbnail foreground">
                          {slot.preview_url ? <img
                            src={slot.preview_url + '?v=' + draft.updated_at}
                            alt={'Preview ' + entry.label + ' of ' + draft.character_name}
                            loading="lazy"/> : <ImageIcon size={28}/>}
                        </div>
                        <div className="creator-media-copy">
                          <strong>{entry.label}</strong>
                          <small>{slot.ready ? 'Needs review' : 'Not generated'}</small>
                          {slot.quality && <small>
                            Background: {slot.quality.method === 'border_chroma_key'
                              ? 'green-screen cutout' : slot.quality.method.startsWith('neural_')
                              ? 'mask ' + slot.quality.method
                              : 'original transparency'} ·
                            Coverage {Math.round(slot.quality.coverage * 100)}%
                          </small>}
                          <button className="secondary-button" disabled={working}
                            aria-label={'Generate expression ' + entry.label}
                            onClick={() => void generateSprites(draft, entry.id)}>
                            {slot.ready ? 'Regenerate' : 'Generate'}
                          </button>
                        </div>
                      </article>;
                    })}
                  </div>
                  {!!draft.alignment_warnings?.length && <div className="creator-hint"
                      role="status" aria-label="Silhouette warnings">
                    <strong>Significant framing differences detected</strong>
                    <p>{draft.alignment_warnings.join('; ')}</p>
                    <p>This comparison only measures the position and scale of the
                      silhouette; it does not verify facial identity. Regenerate visibly different variants or confirm that you have reviewed them.</p>
                    <label>
                      <input type="checkbox"
                        aria-label={'I accepted draft differences for ' + draft.character_name}
                        checked={!!alignmentConfirmed[draft.id]}
                        onChange={event => setAlignmentConfirmed(prev => ({
                          ...prev, [draft.id]: event.target.checked,
                        }))}/>
                      {' '}I personally reviewed and accept the differences
                    </label>
                  </div>}
                  <div className="creator-actions">
                    <button className="secondary-button" disabled={working || draft.ready_count === 5}
                      onClick={() => void generateSprites(draft)}>
                      <Sparkles size={16}/> Generate missing expressions
                    </button>
                    <button className="primary-button" disabled={working ||
                        draft.ready_count !== 5 ||
                        (!!draft.alignment_review_needed && !alignmentConfirmed[draft.id])}
                      onClick={() => void approveSprites(draft)}>
                      <Check size={16}/> Approve five expressions
                    </button>
                    <button className="secondary-button" disabled={working}
                      onClick={() => void discardSprites(draft)}>
                      <Trash2 size={15}/> Discard draft
                    </button>
                  </div>
                </section>)}
              </div>
            </div> :
            section === 'lorebook' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Lorebook · conditional knowledge</h3>
                <p>Store secrets, locations, and rules that activate when trigger words appear in player actions or recent scenes. This text is private to the narrator; each branch keeps its own copy.</p>
              </div>
              <div className="creator-character-list">
                {lorebookEntries.map(entry => <div className="creator-opening" key={entry.id}>
                  <div><strong>{entry.title} · priority {entry.priority}</strong>
                    <button className="creator-media-delete" disabled={working}
                      aria-label={'Delete Lorebook ' + entry.title}
                      onClick={() => void removeLorebook(entry)}><Trash2 size={15}/></button>
                  </div>
                  <p>{entry.always_active ? 'Always active' :
                    'Keys: ' + entry.keys.join(', ')}
                    {entry.enabled ? '' : ' · Disabled'}
                    {entry.visibility === 'witnesses'
                      ? ' · Present witness characters only'
                      : ' · General knowledge'}</p>
                  <p>{entry.content.slice(0, 170)}{entry.content.length > 170 ? '…' : ''}</p>
                  <button className="secondary-button" disabled={working}
                    onClick={() => editLorebook(entry)}>Edit entry</button>
                </div>)}
                {!lorebookEntries.length && <p className="creator-placeholder">
                  No entries yet. Add facts that should be recalled only in relevant scenes.</p>}
              </div>
              <div className="creator-media-form">
                <h4>{editingLorebook ? 'Edit Lorebook entry' : 'New Lorebook entry'}</h4>
                <label>Title
                  <input aria-label="Lorebook title" value={lorebookDraft.title}
                    maxLength={100} onChange={e => setLorebookDraft(v => ({
                      ...v, title: e.target.value,
                    }))} placeholder="Crystal forest, secret pact..."/>
                </label>
                <label>Facts the narrator should remember
                  <textarea aria-label="Lorebook content" rows={5} maxLength={3500}
                    value={lorebookDraft.content} onChange={e => setLorebookDraft(v => ({
                      ...v, content: e.target.value,
                    }))} placeholder="Describe world rules, secrets, or canonical facts."/>
                </label>
                <div className="creator-double">
                  <label>Primary keys (comma-separated)
                    <input aria-label="Lorebook keys" value={loreKeysInput}
                      onChange={e => setLoreKeysInput(e.target.value)}
                      placeholder="forest, ruins, map"/>
                  </label>
                  <label>Optional secondary keys
                    <input aria-label="Secondary Lorebook keys" value={loreSecondaryInput}
                      onChange={e => setLoreSecondaryInput(e.target.value)}
                      placeholder="night, guard"/>
                  </label>
                </div>
                <div className="creator-double">
                  <label>Priority (0–100)
                    <input aria-label="Lorebook priority" type="number" min={0} max={100}
                      value={lorebookDraft.priority}
                      onChange={e => setLorebookDraft(v => ({ ...v,
                        priority: Number(e.target.value),
                      }))}/>
                  </label>
                  <label>Secondary activation
                    <select aria-label="Lorebook secondary condition"
                      value={lorebookDraft.secondary_mode}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, secondary_mode: e.target.value as 'any'|'all',
                      }))}>
                      <option value="any">Any</option>
                      <option value="all">All</option>
                    </select>
                  </label>
                </div>
                <label>Who may know this fact
                  <select aria-label="Lorebook visibility"
                    value={lorebookDraft.visibility}
                    onChange={e => setLorebookDraft(v => ({
                      ...v, visibility: e.target.value as 'world' | 'witnesses',
                      witness_character_ids: [],
                    }))}>
                    <option value="world">Public world knowledge</option>
                    <option value="witnesses">Present witnesses only</option>
                  </select>
                </label>
                {lorebookDraft.visibility === 'witnesses' && <fieldset>
                  <legend>Characters who know this fact</legend>
                  {!characters.length && <p>Create characters in the Characters section first.</p>}
                  {characters.map(person => <label key={person.id} className="creator-lore-toggle">
                    <input type="checkbox" aria-label={'Witness ' + person.name}
                      checked={lorebookDraft.witness_character_ids.includes(person.id)}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, witness_character_ids: e.target.checked
                          ? [...v.witness_character_ids, person.id]
                          : v.witness_character_ids.filter(id => id !== person.id),
                      }))}/>
                    {person.name}
                  </label>)}
                  <small>Included in narration only when an eligible witness is present in confirmed world state. Mentioning a character does not change their presence.</small>
                </fieldset>}
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.enabled}
                  onChange={e => setLorebookDraft(v => ({...v, enabled: e.target.checked}))}/>
                  Entry enabled</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.always_active}
                  onChange={e => setLorebookDraft(v => ({...v, always_active: e.target.checked}))}/>
                  Always active (no keys)</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.match_whole_words}
                  onChange={e => setLorebookDraft(v => ({
                    ...v, match_whole_words: e.target.checked,
                  }))}/> Match whole words</label>
                <div className="creator-actions">
                  <button className="primary-button" disabled={working ||
                    lorebookDraft.title.trim().length < 2 ||
                    lorebookDraft.content.trim().length < 10 ||
                    (lorebookDraft.visibility === 'witnesses' &&
                      !lorebookDraft.witness_character_ids.length)}
                    onClick={() => void saveLorebook()}><Save size={16}/>
                    {editingLorebook ? 'Update Lorebook' : 'Create Lorebook entry'}
                  </button>
                  {editingLorebook && <button className="secondary-button"
                    onClick={resetLorebookEditor}>Cancel editing</button>}
                </div>
              </div>
              <div className="creator-media-form">
                <h4>Check activation before playing</h4>
                <p>Enter an action or phrase to preview which entries the narrator would receive and the actual character budget used (maximum 6,000 characters).
                  The preview uses character presence saved in World State.</p>
                <label>Simulate an action
                  <textarea rows={3} aria-label="Simulate Lorebook activation"
                    maxLength={3000} value={loreQuery}
                    onChange={e => { setLoreQuery(e.target.value); setLorePreview(null); }}
                    placeholder="I enter the forest ruins..."/>
                </label>
                <button className="secondary-button" disabled={working}
                  onClick={() => void previewLorebookActivation()}>
                  <BookKey size={16}/> Preview Lorebook
                </button>
                {lorePreview && <div role="status" className="creator-hint">
                  <strong>{lorePreview.entries.length} activated entries</strong>
                  <p>{lorePreview.used_chars} of {lorePreview.budget_chars} characters
                    · {lorePreview.skipped_budget} excluded by budget
                    · {lorePreview.skipped_visibility} without present witnesses</p>
                  {lorePreview.entries.map(entry => <p key={entry.id}>
                    {entry.title} · priority {entry.priority}</p>)}
                  {!!lorePreview.context && <details className="creator-lorebook-preview">
                    <summary>View exact context sent to narrator</summary>
                    <pre>{lorePreview.context}</pre>
                  </details>}
                </div>}
              </div>
            </div> :
            section === 'story' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Story identity and plot</h3>
                <p>The public description introduces the world; private plot and author guidelines are sent to the narrator, not displayed to the player.</p>
              </div>
              <div className="creator-double">
                <label>Genre
                  <input aria-label="Story genre" value={blueprint.genre}
                    maxLength={80} placeholder="Fantasy, romance, mystery..."
                    onChange={e => update('genre', e.target.value)}/>
                </label>
                <label >Language
                  <select aria-label="Story language" value={blueprint.language}
                    onChange={e => update('language', e.target.value)}>
                    <option value="es-419">Latin American Spanish</option>
                    <option value="en">English</option><option value="ja">日本語</option>
                    <option value="ko">한국어</option><option value="pt-BR">Português (Brasil)</option>
                    <option value="fr">Français</option>
                  </select>
                </label>
              </div>
              <label>Short synopsis for readers
                <textarea rows={3} aria-label="Reader synopsis" maxLength={250}
                  value={blueprint.synopsis} onChange={e => update('synopsis', e.target.value)}
                  placeholder="What players see when they discover the story."/>
              </label>
              <label>Player-facing plot
                <textarea rows={5} maxLength={4000} aria-label="Visible plot"
                  value={blueprint.player_plot}
                  onChange={e => update('player_plot', e.target.value)}
                  placeholder="Starting point, situation, and expectations without spoilers."/>
              </label>
              <label>Private AI context
                <textarea rows={8} maxLength={12000} aria-label="Private AI context"
                  value={blueprint.ai_plot}
                  onChange={e => update('ai_plot', e.target.value)}
                  placeholder="World rules, relationships, secrets, and events the narrator should know."/>
                <small>Not shown directly in the story, but it influences narration.</small>
              </label>
              <label>Narrative guidelines
                <textarea rows={5} maxLength={4000} aria-label="Narration guidelines"
                  value={blueprint.guidelines}
                  onChange={e => update('guidelines', e.target.value)}
                  placeholder="Style, pace, NPC agency, and continuity details..."/>
              </label>
              <label>Persistent reminder
                <textarea rows={3} maxLength={1200} aria-label="Persistent reminder"
                  value={blueprint.reminder} onChange={e => update('reminder', e.target.value)}
                  placeholder="A short instruction that matters on every turn."/>
              </label>
              <label>Tags (comma-separated)
                <input maxLength={500} aria-label="Story tags" value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)} placeholder="isekai, adventure, magic"/>
              </label>
              <button className="primary-button" disabled={working} onClick={() => void saveBlueprint()}>
                <Save size={16}/>{working ? 'Saving...' : 'Save plot and context'}
              </button>
            </div> : section === 'cast' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Novel characters</h3>
                <p>Define NPC personality, history, and dialogue style separately from their visual profiles.</p>
              </div>
              <div className="creator-character-list">
                {characters.map(person => <button key={person.id}
                  onClick={() => editCharacter(person)}>
                  <UserRound size={19}/><span><strong>{person.name}</strong>
                    <small>{person.personality || person.description}</small></span>
                  <ChevronRight size={16}/></button>)}
              </div>
              <label>Name
                <input aria-label="NPC name" maxLength={80}
                  value={character.name} onChange={e => setCharacter(v => ({...v,name:e.target.value}))}/>
              </label>
              <label>Linked visual profile (optional)
                <select aria-label="NPC visual profile"
                  value={character.visual_character_id || ''}
                  onChange={e => setCharacter(v => ({
                    ...v, visual_character_id: e.target.value || null,
                  }))}>
                  <option value="">Unlinked (match by name in unplanned prompts)</option>
                  {visualCharacters.map(visual => <option value={visual.id} key={visual.id}>
                    {visual.name}
                  </option>)}
                </select>
                <small>Link this NPC to a Gallery identity so their visual DNA
                  follows the selected character in scene plans.</small>
              </label>
              <label>Background and description
                <textarea rows={5} maxLength={3000} aria-label="NPC description"
                  value={character.description} onChange={e => setCharacter(v => ({
                    ...v,description:e.target.value,
                  }))}/>
              </label>
              <label>Personality and motivations
                <textarea rows={4} maxLength={1500} aria-label="NPC personality"
                  value={character.personality} onChange={e => setCharacter(v => ({
                    ...v,personality:e.target.value,
                  }))}/>
              </label>
              <label>Dialogue examples
                <textarea rows={4} maxLength={3000} aria-label="Dialogue examples"
                  value={character.dialogue_examples} onChange={e => setCharacter(v => ({
                    ...v,dialogue_examples:e.target.value,
                  }))} placeholder="Speech patterns, typical expressions, and responses."/>
              </label>
              <div className="creator-media-form">
                <h4>Canonical visual identity</h4>
                <p>Appearance tags and seeds become fixed once saved.
                  A LoRA is an optional reference to a local model file; it does not
                  run inference or download models.</p>
                <label>Appearance tags (comma-separated)
                  <input aria-label="Visual tags" maxLength={1040}
                    value={dnaTagsInput} disabled={!!editingCharacter &&
                      characters.some(npc => npc.id === editingCharacter &&
                        npc.visual_dna.tags.length > 0)}
                    onChange={e => setDnaTagsInput(e.target.value)}
                    placeholder="black hair, green eyes, blue coat"/>
                </label>
                <div className="creator-double">
                  <label>Visual seed
                    <input type="number" min={0} max={4294967295} step={1}
                      aria-label="Visual seed" value={character.visual_dna.seed ?? ''}
                      disabled={!!editingCharacter && characters.some(npc =>
                        npc.id === editingCharacter && npc.visual_dna.seed !== null)}
                      onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                        ...prev.visual_dna, seed: e.target.value === '' ? null : Number(e.target.value),
                      }}))}/>
                  </label>
                  <label>LoRA local (.safetensors)
                    <input aria-label="LoRA visual" maxLength={160}
                      value={character.visual_dna.lora_name || ''}
                      onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                        ...prev.visual_dna, lora_name: e.target.value || null,
                      }}))} placeholder="character.safetensors"/>
                  </label>
                </div>
                <label>LoRA strength (0–2)
                  <input type="number" min={0} max={2} step={0.05}
                    aria-label="LoRA strength" value={character.visual_dna.lora_strength}
                    onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                      ...prev.visual_dna, lora_strength: Number(e.target.value),
                    }}))}/>
                </label>
              </div>
              <div className="creator-actions">
                <button className="primary-button" disabled={working || !character.name.trim() ||
                    character.description.trim().length < 20} onClick={() => void saveCharacter()}>
                  <Save size={16}/>{editingCharacter ? 'Update character' : 'Add character'}
                </button>
                {editingCharacter && <button className="secondary-button" onClick={() => {
                  setEditingCharacter(null); setCharacter(blankCharacter); setDnaTagsInput('');
                }}><X size={15}/> Cancel editing</button>}
              </div>
            </div> : <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Different ways to begin</h3>
                <p>Prepare up to six opening scenes. The player can choose
                  one to begin. You can use <code>{'{{user}}'}</code> to refer to the protagonist.</p>
              </div>
              {blueprint.opening_scenarios.map((opening,index) =>
                <div className="creator-opening" key={index}>
                  <div><strong>Opening {index+1}</strong>
                    <button disabled={working} aria-label={'Remove opening '+(index+1)}
                      onClick={() => update('opening_scenarios',
                        blueprint.opening_scenarios.filter((_,i)=>i!==index))}><X size={15}/></button>
                  </div>
                  <textarea aria-label={'Opening text '+(index+1)} rows={5}
                    maxLength={3000} value={opening}
                    onChange={e => update('opening_scenarios',
                      blueprint.opening_scenarios.map((v,i)=>i===index?e.target.value:v))}/>
                  <button className="secondary-button" disabled={working || opening.trim().length<15}
                    onClick={() => void startOpening(index)}>
                    <BookOpen size={15}/> Use as story opening
                  </button>
                </div>)}
              <label>Write another opening
                <textarea rows={5} aria-label="New opening" maxLength={3000}
                  value={openingDraft} onChange={e=>setOpeningDraft(e.target.value)}
                  placeholder="Describe the opening scene as the player should read it."/>
              </label>
              <div className="creator-actions">
                <button className="secondary-button" disabled={working ||
                    blueprint.opening_scenarios.length >= 6 || openingDraft.trim().length<15}
                  onClick={() => {
                    update('opening_scenarios',[...blueprint.opening_scenarios, openingDraft.trim()]);
                    setOpeningDraft('');
                  }}><Plus size={16}/> Add opening</button>
                <button className="primary-button" disabled={working}
                  onClick={() => void saveBlueprint()}><Save size={16}/> Save openings</button>
              </div>
              <p className="creator-hint">Save the openings before selecting a starting scene.
                A story with saved turns is never overwritten automatically.</p>
            </div>}
        </>}
      </div>
    </div>
    {createNew && <div className="welcome-scrim">
      <section className="welcome-panel" role="dialog" aria-modal="true" aria-label="Create story project">
        <div className="story-create-heading"><span className="overline">NEW STORY</span>
          <button aria-label="Close project" className="icon-button"
            onClick={() => setCreateNew(false)}><X size={18}/></button></div>
        <h2>Create your next world</h2>
        <p>Create the project first. Dedicated tools are available afterward for
          plot, characters, and openings.</p>
        <label className="form-label">Title
          <input value={newTitle} maxLength={100}
            onChange={e => setNewTitle(e.target.value)}/></label>
        <label className="form-label">World premise
          <textarea rows={4} maxLength={4000} value={newPremise}
            onChange={e => setNewPremise(e.target.value)}/></label>
        <label className="form-label">Protagonist
          <input value={newProtagonist} maxLength={60}
            onChange={e => setNewProtagonist(e.target.value)}/></label>
        {error && <p role="alert" className="narrative-error">{error}</p>}
        <button className="primary-button full" disabled={working || newTitle.trim().length<2 ||
          newPremise.trim().length<10 || !newProtagonist.trim()} onClick={() => void createStory()}>
          <Plus size={16}/> Create project
        </button>
      </section>
    </div>}
  </section>;
}
