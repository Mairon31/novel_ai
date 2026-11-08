import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setNotice(t('feedback.creatorStoryCreated'));
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
      setNotice(t('feedback.creatorSaved'));
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
      setNotice(t('feedback.creatorCharacterSaved'));
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
      setNotice(t('feedback.creatorExpressionsImported', { count: result.count }));
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
        throw new Error(t('creator.invalidSpriteSeed'));
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
        setNotice(t('feedback.creatorDraftCreated'));
      }
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  const spriteExpressions: Array<{ id: SpriteExpression; label: string }> = [
    { id: 'neutral', label: t('creator.expressionNeutral') },
    { id: 'joy', label: t('creator.expressionJoy') },
    { id: 'anger', label: t('creator.expressionAnger') },
    { id: 'sadness', label: t('creator.expressionSadness') },
    { id: 'surprise', label: t('creator.expressionSurprise') },
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
        setDraftProgress(t('feedback.creatorGeneratingSprite', {
          label: entry.label, current: index + 1, total: chosen.length,
        }));
        current = await api.generateSpriteExpression(storyId, draft.id, entry.id);
        if (storyGuard.current === storyId) {
          setAlignmentConfirmed(prev => ({ ...prev, [draft.id]: false }));
          setSpriteDrafts(prev => prev.map(item => item.id === draft.id ? current : item));
        }
      }
      if (storyGuard.current === storyId) {
        setNotice(t('feedback.creatorDraftUpdated'));
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
        setNotice(t('feedback.creatorSpritesApproved', { count: result.count }));
      }
    } catch (exc) { if (storyGuard.current === storyId) setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function discardSprites(draft: SpriteDraft) {
    if (!active || working || !window.confirm(t('feedback.creatorDiscardConfirm'))) return;
    const storyId = active.id;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.discardSpriteDraft(storyId, draft.id);
      if (storyGuard.current === storyId) {
        setSpriteDrafts(prev => prev.filter(item => item.id !== draft.id));
        setNotice(t('feedback.creatorDraftDiscarded'));
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
      setNotice(t('feedback.creatorLoreSaved'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function removeLorebook(entry: LorebookEntry) {
    if (!active || working || !window.confirm(t('creator.loreDeleteConfirm'))) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.deleteLorebookEntry(active.id, entry.id);
      setLorebookEntries((await api.lorebookEntries(active.id)).entries);
      if (editingLorebook === entry.id) resetLorebookEditor();
      setLorePreview(null);
      setNotice(t('feedback.creatorLoreDeleted'));
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
      setNotice(t(assetId ? 'feedback.creatorCoverSelected' : 'feedback.creatorCoverRemoved'));
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
        if (!mediaFile) throw new Error(t('feedback.creatorSelectImage'));
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
      setNotice(t(mediaKind === 'cover' && !editingAsset ? 'feedback.creatorCoverSaved' : 'feedback.creatorAssetSaved'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }
  async function deleteMediaAsset(asset: CreatorMediaAsset) {
    if (!active || !window.confirm(t('feedback.creatorDeleteAssetConfirm'))) return;
    setWorking(true); setError('');
    try {
      await api.deleteCreatorAsset(active.id, asset.id);
      if (active.cover_asset_id === asset.id) {
        rememberStory({ ...active, cover_asset_id: null, cover_image_url: null });
      }
      setAssets((await api.creatorAssets(active.id)).assets);
      if (editingAsset === asset.id) resetMediaEditor();
      setNotice(t('feedback.creatorAssetDeleted'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function startOpening(index: number) {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.startCreatorOpening(active.id, index);
      setNotice(t('feedback.creatorOpeningSaved'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  return <section className="creator-studio" aria-label={t('uiField.creatorStudio.storyCreationStudio')}>
    <div className="creator-heading">
      <button className="creator-return" onClick={onOpenLibrary}>
        <ArrowLeft size={16}/> {t("nav.inicio")}
      </button>
      <span className="overline"><Feather size={15}/> NOBLE CREATOR STUDIO</span>
      <h1>{t("creator.title")}</h1>
      <p>{t("creator.description")}</p>
    </div>

    <div className="creator-layout">
      <aside className="creator-projects" aria-label={t('uiField.creatorStudio.storiesToCreate')}>
        <div className="creator-projects-head">
          <div><span className="overline">{t("creator.yourWorlds")}</span><strong>{t("creator.projects")}</strong></div>
          <button title={t("creator.newProject")} aria-label={t("creator.createProject")} onClick={() => setCreateNew(true)}>
            <Plus size={18}/>
          </button>
        </div>
        {loading && !active && <p className="creator-placeholder"><LoaderCircle size={15} className="rotating"/> {t("common.loading")}</p>}
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
          {t("creator.noStories")}</p>}
        <button className="creator-new" onClick={() => {
          setActive(null); setAssistantVisible(true);
        }}><Sparkles size={17}/> {t("creator.createWithAI")}</button>
        <button className="creator-new" onClick={() => setCreateNew(true)}>
          <Plus size={17}/> {t("creator.newProject")}
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
          <Sparkles size={40}/><h2>{t("creator.selectToEdit")}</h2>
          <p>{t("creator.selectDescription")}</p>
          <button className="primary-button" onClick={() => setCreateNew(true)}>
            <Plus size={16}/> {t("creator.createStory")}
          </button>
        </div> : <>
          <div className="creator-editor-title">
            <div><span className="overline">{t("creator.editing")}</span>
              <h2>{active.title}</h2>
              <small>{t('creatorUi.playerControls', { name: active.protagonist_name || t('creatorUi.protagonistField') })}</small></div>
            <button className="secondary-button" onClick={onOpenLibrary}>
              <BookOpen size={15}/> {t("creator.goLibrary")}
            </button>
          </div>
          <nav className="creator-editor-tabs" aria-label={t('uiField.creatorStudio.creatorTools')}>
            <button className={section === 'story' ? 'selected' : ''}
              onClick={() => setSection('story')}><FileText size={17}/> {t("creator.plot")}</button>
            <button className={section === 'cast' ? 'selected' : ''}
              onClick={() => setSection('cast')}><Users size={17}/> {t("creator.characters", { count: characters.length })}</button>
            <button className={section === 'lorebook' ? 'selected' : ''}
              onClick={() => setSection('lorebook')}><BookKey size={17}/> {t("creator.lorebook", { count: lorebookEntries.length })}</button>
            <button className={section === 'world' ? 'selected' : ''}
              onClick={() => setSection('world')}><Globe2 size={17}/> {t("creator.world")}</button>
            <button className={section === 'openings' ? 'selected' : ''}
              onClick={() => setSection('openings')}><Feather size={17}/> {t("creator.openings")}</button>
            <button className={section === 'media' ? 'selected' : ''}
              onClick={() => setSection('media')}><ImageIcon size={17}/> {t("creator.images", { count: assets.length })}</button>
          </nav>

          {loading ? <div className="loading"><LoaderCircle className="rotating" size={17}/> {t('creator.contentLoading')}</div> :
            section === 'world' ? <WorldStateEditor
              storyId={active.id} characters={characters}/> :
            section === 'media' ? <div className="creator-fields creator-media-library">
              <div className="creator-section-intro">
                <h3>{t('creator.covers')}</h3>
                <p>{t('creator.coversHint')}</p>
              </div>
              <div className="creator-cover-preview" aria-label={t('uiField.creatorStudio.currentEditorialCover')}>
                <div className="creator-cover-preview-art">
                  {active.cover_image_url ?
                    <img src={active.cover_image_url} alt={t('creator.coverAlt', { title: active.title })}/> :
                    <BookOpen size={42} aria-hidden="true"/>}
                </div>
                <div className="creator-cover-preview-copy">
                  <span className="overline">{t('creator.storyCover')}</span>
                  <strong>{t(active.cover_image_url ? 'creator.coverCustom' : 'creator.coverNone')}</strong>
                  <p>{t('creator.coverHint')}</p>
                  {active.cover_asset_id && <button className="secondary-button" disabled={working}
                    onClick={() => void chooseCover(null)}>{t('creator.removeCover')}</button>}
                </div>
              </div>
              <div className="creator-media-grid">
                {assets.map(asset => <article className="creator-media-card" key={asset.id}>
                  <div className={'creator-media-thumbnail ' + asset.kind}>
                    <img src={asset.url} loading="lazy" alt={t('creator.imageAlt', { label: asset.label })}/>
                  </div>
                  <div className="creator-media-copy">
                    <small>{t(asset.kind === 'cover' ? 'creator.coverTag' :
                      asset.kind === 'background' ? 'creator.backgroundTag' : 'creator.foregroundTag')}
                      {asset.id === active.cover_asset_id ? ' · ' + t('creator.currentTag') : ''}
                      {asset.source === 'ai_reviewed' ? ' · ' + t('creator.aiReviewedTag') : ''}</small>
                    <strong>{asset.label}</strong><p>{asset.caption}</p>
                    {asset.kind === 'foreground' && <small>
                      {t('creator.expressionPose', { expression: asset.expression, pose: asset.pose })}
                    </small>}
                    <div>
                      {asset.kind === 'cover' && asset.id !== active.cover_asset_id &&
                        <button className="secondary-button" disabled={working}
                          onClick={() => void chooseCover(asset.id)}>{t('creator.useCover')}</button>}
                      <button className="secondary-button" disabled={working}
                        onClick={() => editAsset(asset)}>{t('creator.editDescription')}</button>
                      <button aria-label={t('creator.deleteImageLabel', { label: asset.label })}
                        className="creator-media-delete" disabled={working}
                        onClick={() => void deleteMediaAsset(asset)}><Trash2 size={15}/></button>
                    </div>
                  </div>
                </article>)}
                {assets.length === 0 && <div className="creator-media-empty">
                  <ImageIcon size={30}/><strong>{t('creator.emptyAssets')}</strong>
                  <p>{t('creator.importAssetHint')}</p>
                </div>}
              </div>
              <div className="creator-media-form">
                <h4>{t(editingAsset ? 'creator.editAsset' : 'creator.addAsset')}</h4>
                {!editingAsset && <div className="creator-double">
                  <label>{t('creator.assetType')}
                    <select aria-label={t('uiField.creatorStudio.visualAssetType')} value={mediaKind}
                      onChange={e => setMediaKind(e.target.value as CreatorMediaAsset['kind'])}>
                      <option value="cover">{t('creator.coverAsset')}</option>
                      <option value="background">{t('creator.backgroundAsset')}</option>
                      <option value="foreground">{t('creator.foregroundAsset')}</option>
                    </select>
                  </label>
                  {mediaKind === 'foreground' && <label>{t('creator.linkedCharacter')}
                    <select aria-label={t('uiField.creatorStudio.imageCharacter')} value={mediaCharacter}
                      onChange={e => setMediaCharacter(e.target.value)}>
                      <option value="">{t('creator.none')}</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>}
                </div>}
                {mediaKind === 'foreground' && <div className="creator-double">
                  <label>{t('creator.spriteExpression')}
                    <select aria-label={t('uiField.creatorStudio.spriteExpression')} value={mediaExpression}
                      onChange={e => setMediaExpression(e.target.value as SpriteExpression)}>
                      <option value="neutral">{t('creator.neutral')}</option>
                      <option value="joy">{t('creator.joy')}</option>
                      <option value="anger">{t('creator.anger')}</option>
                      <option value="sadness">{t('creator.sadness')}</option>
                      <option value="surprise">{t('creator.surprise')}</option>
                    </select>
                  </label>
                  <label>{t('creator.pose')}
                    <input aria-label={t('uiField.creatorStudio.spritePose')} maxLength={32} value={mediaPose}
                      onChange={e => setMediaPose(e.target.value)}
                      placeholder={t('uiField.creatorStudio.standingSittingWaving')}/>
                  </label>
                </div>}
                <label>{t('creator.name')}
                  <input aria-label={t('uiField.creatorStudio.imageName')} maxLength={100} value={mediaLabel}
                    placeholder={t('uiField.creatorStudio.throneRoomAiraSmiling')}
                    onChange={e => setMediaLabel(e.target.value)}/></label>
                <label>{t('creator.sceneCaption')}
                  <textarea aria-label={t('uiField.creatorStudio.imageDescription')} maxLength={220} rows={3}
                    value={mediaCaption} onChange={e => setMediaCaption(e.target.value)}
                    placeholder={t('uiField.creatorStudio.darkForestAtNightAiraSmilingInTheTavern')}/>
                  <small>{t('creator.sceneCaptionHint')}</small>
                </label>
                {!editingAsset && <label>{t('creator.fileRequirements')}
                  <input type="file" aria-label={t('uiField.creatorStudio.visualAssetFile')}
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => setMediaFile(e.target.files?.[0] || null)}/>
                  {mediaKind === 'foreground' && <small>
                    {t('creator.alphaHint')}
                  </small>}
                  {mediaKind === 'cover' && <small>
                    {t('creator.coverSavedHint')}
                  </small>}
                </label>}
                <div className="creator-actions">
                  <button className="primary-button" disabled={working || !mediaLabel.trim() ||
                    mediaCaption.trim().length < 3 ||
                    (mediaKind === 'foreground' && !/^[a-z0-9_-]{1,32}$/.test(mediaPose.trim().toLowerCase())) ||
                    (!editingAsset && !mediaFile)}
                    onClick={() => void saveMediaAsset()}><UploadCloud size={16}/>
                    {editingAsset ? t("common.save") : t("creator.importImage")}</button>
                  {editingAsset && <button className="secondary-button"
                    onClick={resetMediaEditor}>{t('creator.cancelEditing')}</button>}
                </div>
              </div>
              <div className="creator-media-form">
                <h4>{t('creator.importSheet')}</h4>
                <p>{t('creator.sheetGridHint')}</p>
                <div className="creator-double">
                  <label>{t('creator.sheetCharacter')}
                    <select aria-label={t('uiField.creatorStudio.expressionsheetCharacter')}
                      value={sheetCharacter} onChange={e => setSheetCharacter(e.target.value)}>
                      <option value="">{t('creator.selectCharacter')}</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>
                  <label>{t('creator.cellLayout')}
                    <select aria-label={t('uiField.creatorStudio.sheetLayout')} value={sheetLayout}
                      onChange={e => setSheetLayout(e.target.value as 'horizontal' | 'vertical')}>
                      <option value="horizontal">{t('creator.oneRow')}</option>
                      <option value="vertical">{t('creator.oneColumn')}</option>
                    </select>
                  </label>
                </div>
                <div className="creator-double">
                  <label>{t('creator.sceneContext')}
                    <input aria-label={t('uiField.creatorStudio.sheetContext')} maxLength={220}
                      value={sheetCaption} onChange={e => setSheetCaption(e.target.value)}
                      placeholder={t('uiField.creatorStudio.airaCastilloCristal')}/>
                  </label>
                  <label>{t('creator.sharedPose')}
                    <input aria-label={t('uiField.creatorStudio.sheetPose')} maxLength={32}
                      value={sheetPose} onChange={e => setSheetPose(e.target.value)}
                      placeholder={t('creatorUi.posePlaceholder')}/>
                  </label>
                </div>
                <label>{t('creator.sheetFile')}
                  <input type="file" aria-label={t('uiField.creatorStudio.expressionsheetFile')}
                    accept="image/png,image/webp"
                    onChange={e => setSheetFile(e.target.files?.[0] || null)}/>
                </label>
                <button className="primary-button"
                  disabled={working || !sheetCharacter || sheetCaption.trim().length < 3 ||
                    !/^[a-z0-9_-]{1,32}$/.test(sheetPose.trim().toLowerCase()) || !sheetFile}
                  onClick={() => void importSheet()}><UploadCloud size={16}/>
                  {t("creator.importExpressions")}
                </button>
              </div>
              <div className="creator-media-form">
                <h4>{t('creator.generateExpressions')}</h4>
                <p>{t('creator.spriteGenerationHint')}</p>
                <div className="creator-double">
                  <label>{t('creator.characterForAI')}
                    <select aria-label={t('uiField.creatorStudio.nPCForExpressionGeneration')} value={draftCharacter}
                      onChange={event => {
                        setDraftCharacter(event.target.value);
                        setDraftSpriteReference('');
                      }}>
                      <option value="">{t('creator.selectNPC')}</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>
                  <label>{t('creator.generatedPose')}
                    <input aria-label={t('uiField.creatorStudio.nPCGenerationPose')} maxLength={32}
                      value={draftPose} onChange={event => setDraftPose(event.target.value)}/>
                  </label>
                </div>
                <label>{t('creator.spriteCaption')}
                  <input aria-label={t('uiField.creatorStudio.aISpriteContext')} maxLength={220}
                    value={draftCaption} onChange={event => setDraftCaption(event.target.value)}
                    placeholder={t('uiField.creatorStudio.airaInTheAncientLibrary')}/>
                </label>
                <label>{t('creator.artStyle')}
                  <input aria-label={t('uiField.creatorStudio.aISpriteStyle')} maxLength={220}
                    value={draftStyle} onChange={event => setDraftStyle(event.target.value)}/>
                </label>
                <div className="creator-double">
                  <label>{t('creator.optionalSeed')}
                    <input type="number" aria-label={t('uiField.creatorStudio.aISpriteSeed')}
                      min={0} step={1} value={draftSeed}
                      onChange={event => setDraftSeed(event.target.value)}
                      placeholder={t('uiField.creatorStudio.visualDNASeed')}/>
                  </label>
                  <label>{t('creator.galleryReference')}
                    <select aria-label={t('uiField.creatorStudio.aISpriteReference')}
                      value={draftReference} onChange={event => {
                        setDraftReference(event.target.value);
                        if (event.target.value) setDraftSpriteReference('');
                      }}>
                      <option value="">{t('creator.noReference')}</option>
                      {galleryAssets.map(asset => <option value={asset.id} key={asset.id}>
                        {asset.origin === 'comfyui' ? 'ComfyUI' : 'Imported'} · {asset.id.slice(0, 8)}
                      </option>)}
                    </select>
                  </label>
                </div>
                <div className="creator-double">
                  <label>{t('creator.approvedReference')}
                    <select aria-label={t('uiField.creatorStudio.aIReferenceSprite')} value={draftSpriteReference}
                      onChange={event => {
                        setDraftSpriteReference(event.target.value);
                        if (event.target.value) setDraftReference('');
                      }}>
                      <option value="">{t('creator.noApproved')}</option>
                      {assets.filter(item => item.kind === 'foreground' &&
                        item.character_id === draftCharacter).map(item =>
                        <option value={item.id} key={item.id}>
                          {item.label} · {item.expression}
                        </option>)}
                    </select>
                  </label>
                  <label>{t('creator.referenceMode')}
                    <select aria-label={t('uiField.creatorStudio.aIReferenceMode')}
                      value={draftReferenceMode}
                      onChange={event => setDraftReferenceMode(
                        event.target.value as 'img2img' | 'ipadapter')}>
                      <option value="img2img">{t('creator.referenceImg2Img')}</option>
                      <option value="ipadapter">{t('creator.referenceIPAdapter')}</option>
                    </select>
                  </label>
                </div>
                {draftReferenceMode === 'ipadapter' && <>
                  <div className="creator-double">
                    <label>{t('creator.ipAdapterPreset')}
                      <select aria-label={t('uiField.creatorStudio.spriteIPAdapterPreset')}
                        value={draftAdapterPreset}
                        onChange={event => setDraftAdapterPreset(event.target.value)}>
                        <option value="PLUS FACE (portraits)">{t('creator.ipFace')}</option>
                        <option value="PLUS (high strength)">{t('creator.ipPlus')}</option>
                        <option value="STANDARD (medium strength)">{t('creator.ipStandard')}</option>
                      </select>
                    </label>
                    <label>{t('creator.ipAdapterStrength', { value: draftAdapterWeight.toFixed(2) })}
                      <input aria-label={t('uiField.creatorStudio.spriteIPAdapterStrength')}
                        type="number" min={0.1} max={1.5} step={0.05}
                        value={draftAdapterWeight}
                        onChange={event => setDraftAdapterWeight(Number(event.target.value))}/>
                    </label>
                  </div>
                  <button className="secondary-button" disabled={checkingAdapter || working}
                    onClick={() => void checkIdentityAdapter()}>
                    {t(checkingAdapter ? 'creator.checkingComfy' : 'creator.checkIPAdapter')}
                  </button>
                  {adapterStatus && <p className="creator-hint" role="status">
                    {adapterStatus.available
                      ? t('creator.adapterReady', { models: adapterStatus.model_count,
                        nodes: adapterStatus.clip_vision_count, presets: adapterStatus.presets.join(', ') })
                      : t('creator.adapterUnavailable', { reason: adapterStatus.error || t('creator.adapterMissing') })}
                  </p>}
                  <p className="creator-hint">
                    {t('creator.adapterDependencies')}
                  </p>
                </>}
                <div className="creator-double">
                  <label>{t('creator.backgroundRemoval')}
                    <select aria-label={t('uiField.creatorStudio.aISpriteBackgroundRemoval')}
                      value={draftCutoutMode}
                      onChange={event => setDraftCutoutMode(
                        event.target.value as NeuralCutoutMode)}>
                      <option value="chroma_green">{t('creator.greenScreen')}</option>
                      <option value="neural_rmbg2">{t('creator.rmbgMask')}</option>
                      <option value="neural_birefnet_portrait">{t('creator.birefPortraitOption')}</option>
                      <option value="neural_birefnet_matting">{t('creator.birefMattingOption')}</option>
                    </select>
                  </label>
                  <div className="creator-fields">
                    <button className="secondary-button" disabled={working || checkingMatting}
                      onClick={() => void checkMatting()}>
                      {t(checkingMatting ? 'creator.checkingWeights' : 'creator.checkCutout')}
                    </button>
                  </div>
                </div>
                {mattingStatus && <div className="creator-hint" role="status"
                    aria-label={t('uiField.creatorStudio.cutoutModelStatus')}>
                  {mattingStatus.modes.filter(item => item.mode !== 'chroma_green')
                    .map(item => <p key={item.mode}>
                      {item.model}: {item.ready ? t('creator.statusReady') : item.reason || t('creator.statusUnavailable')}
                    </p>)}
                </div>}
                <p className="creator-hint">
                  {t('creator.neuralCutoutHint')}
                </p>
                <label>
                  <input type="checkbox" aria-label={t('uiField.creatorStudio.useNPCLoRAForAISprites')}
                    checked={draftUseLora} onChange={event => setDraftUseLora(event.target.checked)}/>
                  {' '}{t('creator.applyConfiguredLora')}
                </label>
                <p className="creator-hint">
                  {t('creator.draftReliability')}
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
                  <Sparkles size={16}/> {t('creator.prepareDraft')}
                </button>
                {draftProgress && <p role="status" className="creator-hint">
                  <LoaderCircle className="rotating" size={15}/> {draftProgress}
                </p>}
                {spriteDrafts.map(draft => <section key={draft.id}
                    className="creator-sprite-draft" aria-label={t('creator.spriteDraftLabel', { name: draft.character_name })}>
                  <h4>{t('creator.spriteReadyCount', { name: draft.character_name, amount: draft.ready_count })}</h4>
                  <p className="creator-hint">{draft.checkpoint} · {t('creator.draftSeedLabel', { number: draft.seed })} ·
                    {' '}{t(draft.use_lora ? 'creator.loraEnabled' : 'creator.noLora')} · {draft.pose}
                    {' · Cutout: ' + (draft.cutout_mode === 'neural_rmbg2' ? 'RMBG 2.0'
                      : draft.cutout_mode === 'neural_birefnet_portrait' ? t('creator.neuralPortraits')
                      : draft.cutout_mode === 'neural_birefnet_matting' ? t('creator.neuralMatting')
                      : t('creator.greenScreen'))}
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
                            alt={t('creator.previewAlt', { expression: entry.label, character: draft.character_name })}
                            loading="lazy"/> : <ImageIcon size={28}/>}
                        </div>
                        <div className="creator-media-copy">
                          <strong>{entry.label}</strong>
                          <small>{t(slot.ready ? 'creator.needsReview' : 'creator.notGenerated')}</small>
                          {slot.quality && <small>
                            {t('creator.draftBgMethod', { method: slot.quality.method === 'border_chroma_key'
                              ? t('creator.cutoutMethodChroma') : slot.quality.method.startsWith('neural_')
                              ? t('creator.methodMask', { method: slot.quality.method })
                              : t('creator.cutoutMethodTransparent'),
                              percentage: Math.round(slot.quality.coverage * 100) })}
                          </small>}
                          <button className="secondary-button" disabled={working}
                            aria-label={t('creator.generateExpression', { expression: entry.label })}
                            onClick={() => void generateSprites(draft, entry.id)}>
                            {t(slot.ready ? 'creator.regenerateButton' : 'creator.generateButton')}
                          </button>
                        </div>
                      </article>;
                    })}
                  </div>
                  {!!draft.alignment_warnings?.length && <div className="creator-hint"
                      role="status" aria-label={t('uiField.creatorStudio.silhouetteWarnings')}>
                    <strong>{t('creator.framingDifferences')}</strong>
                    <p>{draft.alignment_warnings.join('; ')}</p>
                    <p>{t('creator.silhouetteHint')}</p>
                    <label>
                      <input type="checkbox"
                        aria-label={t('creator.acceptDraftDifferences', { character: draft.character_name })}
                        checked={!!alignmentConfirmed[draft.id]}
                        onChange={event => setAlignmentConfirmed(prev => ({
                          ...prev, [draft.id]: event.target.checked,
                        }))}/>
                      {' '}{t('creator.reviewedDifferences')}
                    </label>
                  </div>}
                  <div className="creator-actions">
                    <button className="secondary-button" disabled={working || draft.ready_count === 5}
                      onClick={() => void generateSprites(draft)}>
                      <Sparkles size={16}/> {t('creator.generateMissing')}
                    </button>
                    <button className="primary-button" disabled={working ||
                        draft.ready_count !== 5 ||
                        (!!draft.alignment_review_needed && !alignmentConfirmed[draft.id])}
                      onClick={() => void approveSprites(draft)}>
                      <Check size={16}/> {t('creator.approveExpressions')}
                    </button>
                    <button className="secondary-button" disabled={working}
                      onClick={() => void discardSprites(draft)}>
                      <Trash2 size={15}/> {t('creator.discardDraft')}
                    </button>
                  </div>
                </section>)}
              </div>
            </div> :
            section === 'lorebook' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>{t('creator.lorebookKnowledge')}</h3>
                <p>{t('creator.lorebookHint')}</p>
              </div>
              <div className="creator-character-list">
                {lorebookEntries.map(entry => <div className="creator-opening" key={entry.id}>
                  <div><strong>{entry.title} · {t('creator.priorityLabel', { value: entry.priority })}</strong>
                    <button className="creator-media-delete" disabled={working}
                      aria-label={t('creator.loreDeleteLabel', { title: entry.title })}
                      onClick={() => void removeLorebook(entry)}><Trash2 size={15}/></button>
                  </div>
                  <p>{entry.always_active ? t('creator.alwaysActiveStatus') :
                    t('creator.keysLabel', { keys: entry.keys.join(', ') })}
                    {entry.enabled ? '' : ' · ' + t('creator.loreDisabled')}
                    {entry.visibility === 'witnesses'
                      ? ' · ' + t('creator.loreWitnesses')
                      : ' · ' + t('creator.loreGeneral')}</p>
                  <p>{entry.content.slice(0, 170)}{entry.content.length > 170 ? '…' : ''}</p>
                  <button className="secondary-button" disabled={working}
                    onClick={() => editLorebook(entry)}>{t('creator.editEntry')}</button>
                </div>)}
                {!lorebookEntries.length && <p className="creator-placeholder">
                  {t('creator.noLoreEntries')}</p>}
              </div>
              <div className="creator-media-form">
                <h4>{t(editingLorebook ? 'creator.loreEditTitle' : 'creator.loreNewTitle')}</h4>
                <label>{t('creator.titleField')}
                  <input aria-label={t('uiField.creatorStudio.lorebookTitle')} value={lorebookDraft.title}
                    maxLength={100} onChange={e => setLorebookDraft(v => ({
                      ...v, title: e.target.value,
                    }))} placeholder={t('uiField.creatorStudio.crystalForestSecretPact')}/>
                </label>
                <label>{t('creator.factsRemember')}
                  <textarea aria-label={t('uiField.creatorStudio.lorebookContent')} rows={5} maxLength={3500}
                    value={lorebookDraft.content} onChange={e => setLorebookDraft(v => ({
                      ...v, content: e.target.value,
                    }))} placeholder={t('uiField.creatorStudio.describeWorldRulesSecretsOrCanonicalFacts')}/>
                </label>
                <div className="creator-double">
                  <label>{t('creator.primaryKeys')}
                    <input aria-label={t('uiField.creatorStudio.lorebookKeys')} value={loreKeysInput}
                      onChange={e => setLoreKeysInput(e.target.value)}
                      placeholder={t('uiField.creatorStudio.forestRuinsMap')}/>
                  </label>
                  <label>{t('creator.secondaryKeys')}
                    <input aria-label={t('uiField.creatorStudio.secondaryLorebookKeys')} value={loreSecondaryInput}
                      onChange={e => setLoreSecondaryInput(e.target.value)}
                      placeholder={t('uiField.creatorStudio.nightGuard')}/>
                  </label>
                </div>
                <div className="creator-double">
                  <label>{t('creator.priority')}
                    <input aria-label={t('uiField.creatorStudio.lorebookPriority')} type="number" min={0} max={100}
                      value={lorebookDraft.priority}
                      onChange={e => setLorebookDraft(v => ({ ...v,
                        priority: Number(e.target.value),
                      }))}/>
                  </label>
                  <label>{t('creator.secondaryActivation')}
                    <select aria-label={t('uiField.creatorStudio.lorebookSecondaryCondition')}
                      value={lorebookDraft.secondary_mode}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, secondary_mode: e.target.value as 'any'|'all',
                      }))}>
                      <option value="any">{t('creator.any')}</option>
                      <option value="all">{t('creator.all')}</option>
                    </select>
                  </label>
                </div>
                <label>{t('creator.knowledgeVisibility')}
                  <select aria-label={t('uiField.creatorStudio.lorebookVisibility')}
                    value={lorebookDraft.visibility}
                    onChange={e => setLorebookDraft(v => ({
                      ...v, visibility: e.target.value as 'world' | 'witnesses',
                      witness_character_ids: [],
                    }))}>
                    <option value="world">{t('creator.publicKnowledge')}</option>
                    <option value="witnesses">{t('creator.presentWitnesses')}</option>
                  </select>
                </label>
                {lorebookDraft.visibility === 'witnesses' && <fieldset>
                  <legend>{t('creator.witnessCharacters')}</legend>
                  {!characters.length && <p>{t('creator.createCharactersFirst')}</p>}
                  {characters.map(person => <label key={person.id} className="creator-lore-toggle">
                    <input type="checkbox" aria-label={t('creator.witnessLabel', { name: person.name })}
                      checked={lorebookDraft.witness_character_ids.includes(person.id)}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, witness_character_ids: e.target.checked
                          ? [...v.witness_character_ids, person.id]
                          : v.witness_character_ids.filter(id => id !== person.id),
                      }))}/>
                    {person.name}
                  </label>)}
                  <small>{t('creator.witnessHint')}</small>
                </fieldset>}
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.enabled}
                  onChange={e => setLorebookDraft(v => ({...v, enabled: e.target.checked}))}/>
                  {t('creator.entryEnabled')}</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.always_active}
                  onChange={e => setLorebookDraft(v => ({...v, always_active: e.target.checked}))}/>
                  {t('creator.alwaysActive')}</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.match_whole_words}
                  onChange={e => setLorebookDraft(v => ({
                    ...v, match_whole_words: e.target.checked,
                  }))}/> {t('creator.wholeWords')}</label>
                <div className="creator-actions">
                  <button className="primary-button" disabled={working ||
                    lorebookDraft.title.trim().length < 2 ||
                    lorebookDraft.content.trim().length < 10 ||
                    (lorebookDraft.visibility === 'witnesses' &&
                      !lorebookDraft.witness_character_ids.length)}
                    onClick={() => void saveLorebook()}><Save size={16}/>
                    {t(editingLorebook ? 'creator.loreUpdate' : 'creator.loreCreate')}
                  </button>
                  {editingLorebook && <button className="secondary-button"
                    onClick={resetLorebookEditor}>{t('creator.cancelEditing')}</button>}
                </div>
              </div>
              <div className="creator-media-form">
                <h4>{t('creator.checkActivation')}</h4>
                <p>{t('creatorUi.simulationHint')}</p>
                <label>{t('creator.simulateAction')}
                  <textarea rows={3} aria-label={t('uiField.creatorStudio.simulateLorebookActivation')}
                    maxLength={3000} value={loreQuery}
                    onChange={e => { setLoreQuery(e.target.value); setLorePreview(null); }}
                    placeholder={t('uiField.creatorStudio.iEnterTheForestRuins')}/>
                </label>
                <button className="secondary-button" disabled={working}
                  onClick={() => void previewLorebookActivation()}>
                  <BookKey size={16}/> {t('creator.previewLorebook')}
                </button>
                {lorePreview && <div role="status" className="creator-hint">
                  <strong>{t('creatorUi.activatedEntries', { amount: lorePreview.entries.length })}</strong>
                  <p>{t('creatorUi.budgetStatus', { used: lorePreview.used_chars, budget: lorePreview.budget_chars,
                  skipped: lorePreview.skipped_budget, hidden: lorePreview.skipped_visibility })}</p>
                  {lorePreview.entries.map(entry => <p key={entry.id}>
                    {entry.title} · priority {entry.priority}</p>)}
                  {!!lorePreview.context && <details className="creator-lorebook-preview">
                    <summary>{t('creator.exactContext')}</summary>
                    <pre>{lorePreview.context}</pre>
                  </details>}
                </div>}
              </div>
            </div> :
            section === 'story' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>{t('creator.storyIdentity')}</h3>
                <p>{t('creator.publicPrivateHint')}</p>
              </div>
              <div className="creator-double">
                <label>{t('creator.genre')}
                  <input aria-label={t('uiField.creatorStudio.storyGenre')} value={blueprint.genre}
                    maxLength={80} placeholder={t('uiField.creatorStudio.fantasyRomanceMystery')}
                    onChange={e => update('genre', e.target.value)}/>
                </label>
                <label >{t('creator.language')}
                  <select aria-label={t('uiField.creatorStudio.storyLanguage')} value={blueprint.language}
                    onChange={e => update('language', e.target.value)}>
                    <option value="es-419">{t('settings.languageEs419')}</option>
                    <option value="en">{t('settings.languageEnglish')}</option><option value="ja">{t('settings.languageJapanese')}</option>
                    <option value="ko">{t('settings.languageKorean')}</option><option value="pt-BR">{t('settings.languageBrazilianPortuguese')}</option>
                    <option value="fr">{t('settings.languageFrench')}</option>
                  </select>
                </label>
              </div>
              <label>{t('creator.synopsis')}
                <textarea rows={3} aria-label={t('uiField.creatorStudio.readerSynopsis')} maxLength={250}
                  value={blueprint.synopsis} onChange={e => update('synopsis', e.target.value)}
                  placeholder={t('uiField.creatorStudio.whatPlayersSeeWhenTheyDiscoverTheStory')}/>
              </label>
              <label>{t('creator.visiblePlot')}
                <textarea rows={5} maxLength={4000} aria-label={t('uiField.creatorStudio.visiblePlot')}
                  value={blueprint.player_plot}
                  onChange={e => update('player_plot', e.target.value)}
                  placeholder={t('uiField.creatorStudio.startingPointSituationAndExpectationsWithoutSpoilers')}/>
              </label>
              <label>{t('creator.privateContext')}
                <textarea rows={8} maxLength={12000} aria-label={t('uiField.creatorStudio.privateAIContext')}
                  value={blueprint.ai_plot}
                  onChange={e => update('ai_plot', e.target.value)}
                  placeholder={t('uiField.creatorStudio.worldRulesRelationshipsSecretsAndEventsTheNarratorShouldKnow')}/>
                <small>{t('creator.privateHint')}</small>
              </label>
              <label>{t('creator.guidelines')}
                <textarea rows={5} maxLength={4000} aria-label={t('uiField.creatorStudio.narrationGuidelines')}
                  value={blueprint.guidelines}
                  onChange={e => update('guidelines', e.target.value)}
                  placeholder={t('uiField.creatorStudio.stylePaceNPCAgencyAndContinuityDetails')}/>
              </label>
              <label>{t('creator.reminder')}
                <textarea rows={3} maxLength={1200} aria-label={t('uiField.creatorStudio.persistentReminder')}
                  value={blueprint.reminder} onChange={e => update('reminder', e.target.value)}
                  placeholder={t('uiField.creatorStudio.aShortInstructionThatMattersOnEveryTurn')}/>
              </label>
              <label>{t('creator.tags')}
                <input maxLength={500} aria-label={t('uiField.creatorStudio.storyTags')} value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)} placeholder={t('uiField.creatorStudio.isekaiAdventureMagic')}/>
              </label>
              <button className="primary-button" disabled={working} onClick={() => void saveBlueprint()}>
                <Save size={16}/>{working ? t('common.loading') : t('creator.savePlot')}
              </button>
            </div> : section === 'cast' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>{t('creator.novelCharacters')}</h3>
                <p>{t('creator.npcHint')}</p>
              </div>
              <div className="creator-character-list">
                {characters.map(person => <button key={person.id}
                  onClick={() => editCharacter(person)}>
                  <UserRound size={19}/><span><strong>{person.name}</strong>
                    <small>{person.personality || person.description}</small></span>
                  <ChevronRight size={16}/></button>)}
              </div>
              <label>{t('creator.name')}
                <input aria-label={t('uiField.creatorStudio.nPCName')} maxLength={80}
                  value={character.name} onChange={e => setCharacter(v => ({...v,name:e.target.value}))}/>
              </label>
              <label>{t('creator.visualLink')}
                <select aria-label={t('uiField.creatorStudio.nPCVisualProfile')}
                  value={character.visual_character_id || ''}
                  onChange={e => setCharacter(v => ({
                    ...v, visual_character_id: e.target.value || null,
                  }))}>
                  <option value="">{t('creator.unlinked')}</option>
                  {visualCharacters.map(visual => <option value={visual.id} key={visual.id}>
                    {visual.name}
                  </option>)}
                </select>
                <small>{t('creator.linkHint')}</small>
              </label>
              <label>{t('creator.background')}
                <textarea rows={5} maxLength={3000} aria-label={t('uiField.creatorStudio.nPCDescription')}
                  value={character.description} onChange={e => setCharacter(v => ({
                    ...v,description:e.target.value,
                  }))}/>
              </label>
              <label>{t('creator.personality')}
                <textarea rows={4} maxLength={1500} aria-label={t('uiField.creatorStudio.nPCPersonality')}
                  value={character.personality} onChange={e => setCharacter(v => ({
                    ...v,personality:e.target.value,
                  }))}/>
              </label>
              <label>{t('creator.dialogueExamples')}
                <textarea rows={4} maxLength={3000} aria-label={t('uiField.creatorStudio.dialogueExamples')}
                  value={character.dialogue_examples} onChange={e => setCharacter(v => ({
                    ...v,dialogue_examples:e.target.value,
                  }))} placeholder={t('uiField.creatorStudio.speechPatternsTypicalExpressionsAndResponses')}/>
              </label>
              <div className="creator-media-form">
                <h4>{t('creator.canonicalIdentity')}</h4>
                <p>{t('creatorUi.identityHint')}</p>
                <label>{t('creator.appearanceTags')}
                  <input aria-label={t('uiField.creatorStudio.visualTags')} maxLength={1040}
                    value={dnaTagsInput} disabled={!!editingCharacter &&
                      characters.some(npc => npc.id === editingCharacter &&
                        npc.visual_dna.tags.length > 0)}
                    onChange={e => setDnaTagsInput(e.target.value)}
                    placeholder={t('uiField.creatorStudio.blackHairGreenEyesBlueCoat')}/>
                </label>
                <div className="creator-double">
                  <label>{t('creator.visualSeed')}
                    <input type="number" min={0} max={4294967295} step={1}
                      aria-label={t('uiField.creatorStudio.visualSeed')} value={character.visual_dna.seed ?? ''}
                      disabled={!!editingCharacter && characters.some(npc =>
                        npc.id === editingCharacter && npc.visual_dna.seed !== null)}
                      onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                        ...prev.visual_dna, seed: e.target.value === '' ? null : Number(e.target.value),
                      }}))}/>
                  </label>
                  <label>{t('creator.lora')}
                    <input aria-label={t('uiField.creatorStudio.loRAVisual')} maxLength={160}
                      value={character.visual_dna.lora_name || ''}
                      onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                        ...prev.visual_dna, lora_name: e.target.value || null,
                      }}))} placeholder="character.safetensors"/>
                  </label>
                </div>
                <label>{t('creator.loraStrength')}
                  <input type="number" min={0} max={2} step={0.05}
                    aria-label={t('uiField.creatorStudio.loRAStrength')} value={character.visual_dna.lora_strength}
                    onChange={e => setCharacter(prev => ({...prev, visual_dna: {
                      ...prev.visual_dna, lora_strength: Number(e.target.value),
                    }}))}/>
                </label>
              </div>
              <div className="creator-actions">
                <button className="primary-button" disabled={working || !character.name.trim() ||
                    character.description.trim().length < 20} onClick={() => void saveCharacter()}>
                  <Save size={16}/>{editingCharacter ? t('common.edit') : t('creator.addCharacter')}
                </button>
                {editingCharacter && <button className="secondary-button" onClick={() => {
                  setEditingCharacter(null); setCharacter(blankCharacter); setDnaTagsInput('');
                }}><X size={15}/> {t('creator.cancelEditing')}</button>}
              </div>
            </div> : <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>{t('creator.differentOpenings')}</h3>
                <p>{t('creator.openingHint')} <code>{'{{user}}'}</code> {t('creator.protagonistTokenHint')}</p>
              </div>
              {blueprint.opening_scenarios.map((opening,index) =>
                <div className="creator-opening" key={index}>
                  <div><strong>{t('creator.openingNumber', { number: index + 1 })}</strong>
                    <button disabled={working} aria-label={t('creator.removeOpening', { number: index + 1 })}
                      onClick={() => update('opening_scenarios',
                        blueprint.opening_scenarios.filter((_,i)=>i!==index))}><X size={15}/></button>
                  </div>
                  <textarea aria-label={t('creator.openingText', { number: index + 1 })} rows={5}
                    maxLength={3000} value={opening}
                    onChange={e => update('opening_scenarios',
                      blueprint.opening_scenarios.map((v,i)=>i===index?e.target.value:v))}/>
                  <button className="secondary-button" disabled={working || opening.trim().length<15}
                    onClick={() => void startOpening(index)}>
                    <BookOpen size={15}/> {t('creator.useOpening')}
                  </button>
                </div>)}
              <label>{t('creator.anotherOpening')}
                <textarea rows={5} aria-label={t('uiField.creatorStudio.newOpening')} maxLength={3000}
                  value={openingDraft} onChange={e=>setOpeningDraft(e.target.value)}
                  placeholder={t('uiField.creatorStudio.describeTheOpeningSceneAsThePlayerShouldReadIt')}/>
              </label>
              <div className="creator-actions">
                <button className="secondary-button" disabled={working ||
                    blueprint.opening_scenarios.length >= 6 || openingDraft.trim().length<15}
                  onClick={() => {
                    update('opening_scenarios',[...blueprint.opening_scenarios, openingDraft.trim()]);
                    setOpeningDraft('');
                  }}><Plus size={16}/> {t('creator.addOpening')}</button>
                <button className="primary-button" disabled={working}
                  onClick={() => void saveBlueprint()}><Save size={16}/> {t('creator.saveOpenings')}</button>
              </div>
              <p className="creator-hint">{t('creator.openingSaveHint')}</p>
            </div>}
        </>}
      </div>
    </div>
    {createNew && <div className="welcome-scrim">
      <section className="welcome-panel" role="dialog" aria-modal="true" aria-label={t('uiField.creatorStudio.createStoryProject')}>
        <div className="story-create-heading"><span className="overline">{t('creator.newStory')}</span>
          <button aria-label={t('uiField.creatorStudio.closeProject')} className="icon-button"
            onClick={() => setCreateNew(false)}><X size={18}/></button></div>
        <h2>{t('creator.nextWorld')}</h2>
        <p>{t('creator.createProjectHint')}</p>
        <label className="form-label">{t('creator.titleField')}
          <input value={newTitle} maxLength={100}
            onChange={e => setNewTitle(e.target.value)}/></label>
        <label className="form-label">{t('creator.worldPremiseField')}
          <textarea rows={4} maxLength={4000} value={newPremise}
            onChange={e => setNewPremise(e.target.value)}/></label>
        <label className="form-label">{t('creatorUi.protagonistField')}
          <input value={newProtagonist} maxLength={60}
            onChange={e => setNewProtagonist(e.target.value)}/></label>
        {error && <p role="alert" className="narrative-error">{error}</p>}
        <button className="primary-button full" disabled={working || newTitle.trim().length<2 ||
          newPremise.trim().length<10 || !newProtagonist.trim()} onClick={() => void createStory()}>
          <Plus size={16}/> {t('creatorUi.createProject')}
        </button>
      </section>
    </div>}
  </section>;
}
