import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, BookOpen, Camera, Check, ChevronRight, Cpu, Eye, Feather,
  Image, LoaderCircle, MessageSquareText, Palette, Send, Settings2, Volume2, Square,
  Sparkles, UploadCloud, UserRound, X, GitBranch, RotateCcw, Download, EyeOff, History,
} from 'lucide-react';
import { api } from './api';
import type { Story, StoryTurn, WorkspacePreferences, SpeechVoices, VisualState, VisualCharacterDraft, ScenePlan, ScenePlanInput, ScenePresentation, LorebookTurnSnapshot, WorldTurnSnapshot, EpisodicSearch, VisualDirectorPreview, VisualDirectorIntent } from './types';

type Tab = 'summary' | 'history' | 'gallery' | 'reader';
const tabs: Tab[] = ['summary', 'history', 'gallery', 'reader'];

function NarrativeText({ text }: { text: string }) {
  return <>{text.split(/(«[^»]+»|“[^”]+”|"[^"\n]+")/g).map((piece, i) => (
    piece.startsWith('«') || piece.startsWith('“') ||
    (piece.startsWith('"') && piece.endsWith('"')) ?
      <span className="noble-reader-quote" key={i}>{piece}</span> :
      <span key={i}>{piece}</span>
  ))}</>;
}

interface Props {
  active: Story | null;
  turns: StoryTurn[];
  mode: StoryTurn['mode'];
  draft: string;
  streamText: string;
  generating: boolean;
  generationMessage: string;
  onCancel: () => void;
  onFork: (turnId: string) => void;
  notice: string;
  error: string;
  setDraft: (next: string) => void;
  setMode: (next: StoryTurn['mode']) => void;
  onSubmit: (continueOnly: boolean) => void;
  onCreate: () => void;
  onSettings: () => void;
  onUpdateStory: (next: Story) => void;
}

export function VisualReader({
  active, turns, mode, draft, streamText, generating, generationMessage, onCancel, onFork,
  notice, error, setDraft, setMode, onSubmit, onCreate, onSettings, onUpdateStory,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('summary');
  const [rewindTurn, setRewindTurn] = useState<StoryTurn | null>(null);
  const [rewindPreview, setRewindPreview] = useState<{
    lore: LorebookTurnSnapshot | null;
    world: WorldTurnSnapshot | null;
  } | null>(null);
  const [rewindLoading, setRewindLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogQuery, setBacklogQuery] = useState('');
  const [hudHidden, setHudHidden] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [readerError, setReaderError] = useState('');
  const [playerPlot, setPlayerPlot] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResults, setMemoryResults] = useState<EpisodicSearch | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState('');
  useEffect(() => {
    if (!active || !rewindTurn) {
      setRewindPreview(null);
      return;
    }
    let alive = true;
    setRewindLoading(true);
    setRewindPreview(null);
    void Promise.allSettled([
      api.lorebookTurnSnapshot(active.id, rewindTurn.id),
      api.worldTurnSnapshot(active.id, rewindTurn.id),
    ]).then(([lore, world]) => {
      if (!alive) return;
      setRewindPreview({
        lore: lore.status === 'fulfilled' ? lore.value : null,
        world: world.status === 'fulfilled' ? world.value : null,
      });
    }).finally(() => { if (alive) setRewindLoading(false); });
    return () => { alive = false; };
  }, [active?.id, rewindTurn?.id]);
  const [sceneMedia, setSceneMedia] = useState<{
    storyId: string; data: ScenePresentation;
  } | null>(null);
  const [backgroundFrame, setBackgroundFrame] = useState<{
    storyId: string | null; current: string | null; previous: string | null;
  }>({ storyId: null, current: null, previous: null });
  const [visual, setVisual] = useState<VisualState | null>(null);
  const [sceneLocation, setSceneLocation] = useState('');
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [characterReferenceId, setCharacterReferenceId] = useState('');
  const [visualBusy, setVisualBusy] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [directorIntent, setDirectorIntent] = useState<VisualDirectorIntent>('auto');
  const [directorPreview, setDirectorPreview] = useState<VisualDirectorPreview | null>(null);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [directorError, setDirectorError] = useState('');
  const directorRequest = useRef(0);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [character, setCharacter] = useState<VisualCharacterDraft>({
    name: '', appearance: '', outfit: '', distinguishing_features: '',
  });
  const [elapsed, setElapsed] = useState(0);
  const [imagePrompt, setImagePrompt] = useState(active?.premise || '');
  const [imageSeed, setImageSeed] = useState('');
  const [referenceAssetId, setReferenceAssetId] = useState('');
  const [denoise, setDenoise] = useState(0.62);
  const [allowLowVram, setAllowLowVram] = useState(false);
  const [applyCharacterLoras, setApplyCharacterLoras] = useState(false);
  const [loraStatus, setLoraStatus] = useState<{
    online: boolean; loras: string[]; error: string | null;
  } | null>(null);
  const [checkingLoras, setCheckingLoras] = useState(false);
  const [illustrationNotice, setIllustrationNotice] = useState('');
  const [illustrating, setIllustrating] = useState(false);
  const [imageMode, setImageMode] = useState<'scene' | 'manual' | 'off'>('manual');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [voiceId, setVoiceId] = useState('');
  const [playingTurn, setPlayingTurn] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const mediaRevision = useRef(0);
  const visualLoadRevision = useRef(0);
  const [name, setName] = useState(active?.protagonist_name || 'Protagonist');
  const [canon, setCanon] = useState(active?.canon || '');
  const [shortcuts, setShortcuts] = useState(true);
  const pendingReaderShortcut = useRef<WorkspacePreferences['reader_layout'] | null>(null);
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setName(active?.protagonist_name || 'Protagonist'); }, [active?.id, active?.protagonist_name]);
  useEffect(() => { setCanon(active?.canon || ''); }, [active?.id, active?.canon]);
  useEffect(() => {
    setBacklogOpen(false);
    setBacklogQuery('');
    setHudHidden(false);
  }, [active?.id]);
  useEffect(() => {
    setPlayerPlot('');
    setMemoryQuery('');
    setMemoryResults(null);
    setMemoryError('');
    if (!active) return;
    let live=true;
    api.creatorBlueprint(active.id).then(data => {
      if (live) setPlayerPlot(data.player_plot || '');
    }).catch(() => { /* Older histories still use their original premise. */ });
    return () => { live=false; };
  }, [active?.id]);
  useEffect(() => {
    if (!active) { setSceneMedia(null); return; }
    let current = true;
    api.scenePresentation(active.id).then(data => {
      if (current) setSceneMedia({ storyId: active.id, data });
    }).catch(() => { /* Reader stays usable without optional creator imagery. */ });
    return () => { current = false; };
  }, [active?.id, turns.length]);
  const currentSceneMedia = sceneMedia && sceneMedia.storyId === active?.id
    ? sceneMedia.data : null;
  const backgroundSource = currentSceneMedia?.background?.url || active?.scene_image_url || null;
  useEffect(() => {
    const storyId = active?.id || null;
    setBackgroundFrame(previous => {
      if (previous.storyId !== storyId)
        return { storyId, current: backgroundSource, previous: null };
      if (previous.current === backgroundSource) return previous;
      return { storyId, current: backgroundSource, previous: previous.current };
    });
    const timer = window.setTimeout(() => setBackgroundFrame(previous =>
      previous.storyId === storyId && previous.current === backgroundSource
        ? { ...previous, previous: null }
        : previous), 560);
    return () => window.clearTimeout(timer);
  }, [active?.id, backgroundSource]);
  useEffect(() => {
    setImagePrompt(active?.premise || '');
    setReferenceAssetId('');
    setApplyCharacterLoras(false);
    setLoraStatus(null);
    setIllustrationNotice('');
    directorRequest.current += 1;
    setDirectorPreview(null);
    setDirectorError('');
    setDirectorIntent('auto');
  }, [active?.id]);
  useEffect(() => {
    if (!active) { setVisual(null); return; }
    let live = true;
    const revision = ++visualLoadRevision.current;
    setVisual(null); setScenePlan(null); setPreviewPrompt('');
    Promise.all([api.visualState(active.id), api.scenePlan(active.id)])
      .then(([current, plan]) => {
        if (!live || revision !== visualLoadRevision.current) return;
        setVisual(current);
        setSceneLocation(current.current_scene.location);
        setScenePlan(plan);
      }).catch(() => { /* gallery remains optional and doesn't block reading */ });
    return () => { live = false; };
  }, [active?.id, turns.length]);
  useEffect(() => {
    if (!generating) { setElapsed(0); return; }
    const start = Date.now();
    const handle = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(handle);
  }, [generating]);
  useEffect(() => {
    let live = true;
    Promise.all([api.settings(), api.speechVoices(), api.speechPreferences()])
      .then(([settings, voiceList, speechPrefs]) => {
      if (!live) return;
      setImageMode(settings.image_mode); setVoiceEnabled(settings.tts_enabled);
      setVoices(voiceList);
      const saved = voiceList.voices.some(v => v.id === speechPrefs.default_voice_id)
        ? speechPrefs.default_voice_id : '';
      setVoiceId(previous => previous || saved || voiceList.voices[0]?.id || '');
    }).catch(() => { /* reader remains usable offline */ });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    return () => {
      // Invalidates pending speech requests when story or voice changes.
      mediaRevision.current += 1;
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audio.current = null; audioUrl.current = null;
    };
  }, [active?.id, voiceId]);
  useEffect(() => {
    let live = true;
    api.workspacePreferences().then(p => {
      if (!live) return;
      setPrefs(p); setShortcuts(p.shortcuts_enabled);
      document.documentElement.dataset.nobleAccent = p.accent;
      document.documentElement.dataset.nobleReaderLayout = p.reader_layout;
      document.documentElement.style.setProperty('--noble-reader-scale', String(p.font_scale / 100));
    }).catch(() => { /* reader works without settings */ });
    return () => { live = false; };
  }, []);
  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [turns.length, streamText]);
  useEffect(() => {
    if (!shortcuts) return;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        if (backlogOpen) { event.preventDefault(); setBacklogOpen(false); }
        else if (hudHidden) { event.preventDefault(); setHudHidden(false); }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault(); setBacklogOpen(open => !open);
      } else if (key === 'h') {
        event.preventDefault(); setHudHidden(hidden => !hidden);
      } else if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        const next = key === '1' ? 'immersive' : key === '2' ? 'classic' : 'chat';
        if (updating) pendingReaderShortcut.current = next;
        else void changeReaderLayout(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts, backlogOpen, hudHidden, updating, prefs]);

  useEffect(() => {
    // Mobile E2E surfaced a legitimate race: Alt+3 updates preferences
    // asynchronously; an immediate Alt+1 was silently ignored while saving.
    // Keep the last requested shortcut and apply it after the current save.
    if (updating || !prefs || !pendingReaderShortcut.current) return;
    const next = pendingReaderShortcut.current;
    pendingReaderShortcut.current = null;
    void changeReaderLayout(next);
  }, [updating, prefs]);

  async function saveCanon() {
    if (!active) return;
    setUpdating(true); setReaderError('');
    try { onUpdateStory(await api.updateStoryCanon(active.id, canon)); }
    catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
  }

  async function saveName() {
    if (!active || !name.trim()) return;
    setUpdating(true); setReaderError('');
    try { onUpdateStory(await api.renameProtagonist(active.id, name.trim())); }
    catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
  }
  async function upload(file: File | undefined) {
    if (!active || !file) return;
    setUpdating(true); setReaderError('');
    try {
      onUpdateStory(await api.uploadSceneImage(active.id, file));
      await refreshVisual(active.id);
      setDirectorPreview(null);
      setTab('gallery');
    }
    catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
  }
  async function refreshVisual(storyId: string) {
    const next = await api.visualState(storyId);
    visualLoadRevision.current += 1;
    setVisual(next);
    setSceneLocation(next.current_scene.location);
    setScenePlan(await api.scenePlan(storyId));
  }
  async function saveSceneLocation() {
    if (!active || sceneLocation.trim().length < 2) return;
    setVisualBusy(true); setReaderError('');
    try {
      const next = await api.setSceneLocation(active.id, sceneLocation.trim());
      visualLoadRevision.current += 1;
      setVisual(next); setSceneLocation(next.current_scene.location);
      setScenePlan(await api.scenePlan(active.id));
      setDirectorPreview(null);
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }
  async function chooseArtwork(assetId: string) {
    if (!active) return;
    setVisualBusy(true); setReaderError('');
    try {
      const next = await api.chooseSceneImage(active.id, assetId);
      setVisual(next);
      onUpdateStory({
        ...active, scene_image_url: '/api/v1/stories/' + active.id + '/scene-image?v=' + Date.now(),
      });
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }
  function editVisualCharacter(person: VisualState['characters'][number]) {
    setEditingCharacterId(person.id);
    setCharacterReferenceId(person.reference_asset_id || '');
    setCharacter({ name: person.name, appearance: person.appearance,
      outfit: person.outfit, distinguishing_features: person.distinguishing_features });
  }
  async function saveCharacter() {
    if (!active || !character.name.trim() || character.appearance.trim().length < 12) return;
    setVisualBusy(true); setReaderError('');
    try {
      await api.saveVisualCharacter(active.id, character, editingCharacterId || undefined);
      await refreshVisual(active.id);
      setEditingCharacterId(null);
      setCharacterReferenceId('');
      setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }
  async function saveCharacterReference() {
    if (!active || !editingCharacterId) return;
    setVisualBusy(true); setReaderError('');
    try {
      await api.setCharacterReference(active.id, editingCharacterId,
        characterReferenceId || null);
      await refreshVisual(active.id);
      setPreviewPrompt('');
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }

  async function saveComposition() {
    if (!active || !scenePlan) return;
    setVisualBusy(true); setReaderError('');
    try {
      const plan: ScenePlanInput = {
        shot: scenePlan.shot, lighting: scenePlan.lighting,
        mood: scenePlan.mood, direction: scenePlan.direction,
        visible_character_ids: scenePlan.visible_character_ids,
        reference_character_id: scenePlan.reference_character_id,
      };
      const saved = await api.saveScenePlan(active.id, plan);
      setScenePlan(saved);
      setPreviewPrompt('');
      setDirectorPreview(null);
      setIllustrationNotice(t('feedback.readerSceneSaved'));
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }

  async function inspectVisualDirector() {
    if (!active) return;
    const sequence = ++directorRequest.current;
    setDirectorBusy(true); setDirectorError('');
    try {
      const preview = await api.previewVisualDirector(active.id, directorIntent);
      if (directorRequest.current === sequence) setDirectorPreview(preview);
    } catch (exc) {
      if (directorRequest.current === sequence) setDirectorError((exc as Error).message);
    } finally { if (directorRequest.current === sequence) setDirectorBusy(false); }
  }
  async function registerDirectorBackground(assetId: string) {
    if (!active || !directorPreview) return;
    const sequence = ++directorRequest.current;
    setDirectorBusy(true); setDirectorError('');
    try {
      const preview = await api.registerVisualBackground(
        active.id, assetId, directorPreview.cache_key);
      if (directorRequest.current === sequence) setDirectorPreview(preview);
    } catch (exc) {
      if (directorRequest.current === sequence) setDirectorError((exc as Error).message);
    } finally { if (directorRequest.current === sequence) setDirectorBusy(false); }
  }
  async function reuseDirectorBackground() {
    if (!active || !directorPreview?.background_asset_id) return;
    const story = active;
    const sequence = ++directorRequest.current;
    setDirectorBusy(true); setDirectorError('');
    try {
      await api.applyVisualBackground(
        story.id, directorPreview.background_asset_id, directorPreview.cache_key);
      if (directorRequest.current !== sequence) return;
      await refreshVisual(story.id);
      onUpdateStory({
        ...story, scene_image_url: '/api/v1/stories/' + story.id + '/scene-image?v=' + Date.now(),
      });
      setIllustrationNotice(t('feedback.readerBackgroundReused'));
    } catch (exc) {
      if (directorRequest.current === sequence) setDirectorError((exc as Error).message);
    } finally { if (directorRequest.current === sequence) setDirectorBusy(false); }
  }
  function toggleVisibleCharacter(id: string, present: boolean) {
    setScenePlan(plan => plan ? {
      ...plan,
      visible_character_ids: present
        ? [...plan.visible_character_ids, id]
        : plan.visible_character_ids.filter(personId => personId !== id),
      reference_character_id: !present && plan.reference_character_id === id
        ? null : plan.reference_character_id,
    } : plan);
  }

  async function previewIllustrationPrompt() {
    if (!active || imagePrompt.trim().length < 8) return;
    setVisualBusy(true); setReaderError('');
    try {
      const result = await api.previewScenePlan(active.id, imagePrompt.trim());
      setPreviewPrompt(result.prompt);
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }

  async function checkInstalledLoras() {
    setCheckingLoras(true); setReaderError('');
    try {
      setLoraStatus(await api.imageLoras());
    } catch (e) { setReaderError((e as Error).message); setLoraStatus(null); }
    finally { setCheckingLoras(false); }
  }

  async function illustrateScene() {
    if (!active || !imagePrompt.trim() || illustrating) return;
    setIllustrating(true); setReaderError(''); setIllustrationNotice('');
    const requestedStoryId = active.id;
    const revision = mediaRevision.current;
    try {
      const seed = imageSeed.trim() ? Number(imageSeed) : undefined;
      if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0))
        throw new Error(t('feedback.readerSeedError'));
      const result = await api.illustrate(requestedStoryId, imagePrompt.trim(), seed,
        referenceAssetId || undefined, referenceAssetId ? denoise : undefined,
        allowLowVram, applyCharacterLoras);
      const loraInfo = result.applied_loras?.length
        ? t('feedback.readerLorasApplied', { names: result.applied_loras.map(lora => lora.lora_name).join(', ') })
        : '';
      setIllustrationNotice(t(result.cached ? 'feedback.readerRestored' : 'feedback.readerImageSaved') + loraInfo);
      // Force refreshing a previous scene despite using a stable asset path.
      const story = result.story;
      onUpdateStory({ ...story, scene_image_url: story.scene_image_url ?
        story.scene_image_url + '?v=' + Date.now() : null });
      if (revision === mediaRevision.current) { await refreshVisual(requestedStoryId); setTab('gallery'); }
    } catch (e) { setReaderError((e as Error).message); }
    finally { setIllustrating(false); }
  }

  async function listen(turn: StoryTurn) {
    if (playingTurn === turn.id && audio.current) {
      audio.current.pause();
      audio.current = null; setPlayingTurn(null);
      return;
    }
    if (!active || !voiceId || synthesizing) return;
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    setPlayingTurn(null); setSynthesizing(true); setReaderError('');
    const revision = mediaRevision.current;
    try {
      const file = await api.requestSpeech(active.id, turn.id, voiceId);
      if (revision !== mediaRevision.current) return;
      const url = URL.createObjectURL(file);
      audioUrl.current = url;
      const next = new Audio(url);
      audio.current = next;
      next.onended = () => { if (audio.current === next) setPlayingTurn(null); };
      await next.play();
      setPlayingTurn(turn.id);
    } catch (e) { setReaderError((e as Error).message); }
    finally { setSynthesizing(false); }
  }

  async function changeReaderLayout(mode: WorkspacePreferences['reader_layout']) {
    if (!prefs) return;
    setUpdating(true); setReaderError('');
    try {
      const p = await api.patchWorkspacePreferences({ reader_layout: mode });
      setPrefs(p);
      document.documentElement.dataset.nobleReaderLayout = p.reader_layout;
    } catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
  }
  async function findStoryMemory() {
    if (!active || memoryQuery.trim().length < 2) return;
    setMemoryBusy(true);
    setMemoryError('');
    setMemoryResults(null);
    try {
      setMemoryResults(await api.searchStoryMemory(active.id, memoryQuery.trim()));
    } catch (exc) { setMemoryError((exc as Error).message); }
    finally { setMemoryBusy(false); }
  }
  function focusTurn(turn: StoryTurn) {
    document.getElementById('noble-turn-' + turn.id)?.scrollIntoView({
      behavior: 'smooth', block: 'center',
    });
    setInspectorOpen(false);
  }
  const inputLabel = t(mode === 'say' ? 'reader.inputSay' :
    mode === 'story' ? 'reader.inputStory' : 'reader.inputDo');

  if (!active) return <div className="story-start-screen noble-reader-empty">
    <div className="story-start-icon"><BookOpen size={34}/></div>
    <h2>{t('reader.emptyTitle')}</h2>
    <p>{t('reader.emptyHint')}</p>
    <button className="primary-button" onClick={onCreate}><Sparkles size={17}/> {t('reader.firstStory')}</button>
  </div>;

  const displayedBackground = backgroundSource;
  const visibleBackground = backgroundFrame.storyId === active.id
    ? backgroundFrame : { current: displayedBackground, previous: null };
  const readerMode = prefs?.reader_layout || 'immersive';
  const matches = backlogQuery.trim().toLocaleLowerCase();
  const backlogItems = [...turns].reverse().filter(turn =>
    !matches || (turn.input_text + '\\n' + turn.assistant_text).toLocaleLowerCase().includes(matches));
  return <div className={'noble-reader-layout ' + (hudHidden ? 'is-hud-hidden' : '')}
    data-reader-mode={readerMode}>
    <button className="noble-hud-switch" type="button"
      aria-label={t(hudHidden ? 'reader.showInterface' : 'reader.hideInterface')}
      title={t(hudHidden ? 'reader.showInterfaceHotkey' : 'reader.hideInterfaceHotkey')}
      onClick={() => setHudHidden(hidden => !hidden)}>
      {hudHidden ? <Eye size={17}/> : <EyeOff size={17}/>}
    </button>
    <aside className={'noble-scene-panel ' + (displayedBackground ? 'has-art' : '')}>
      <div className="noble-scene-art">
        {visibleBackground.previous && <div
          className="noble-scene-background is-previous" aria-hidden="true"
          style={{ backgroundImage: 'url("' + visibleBackground.previous + '")' }}/>}
        {visibleBackground.current && <div key={visibleBackground.current}
          className="noble-scene-background is-current" aria-hidden="true"
          style={{ backgroundImage: 'url("' + visibleBackground.current + '")' }}/>} 
        <div className="noble-scene-wash"/>
        {Boolean(currentSceneMedia?.sprites.length) && <div className="noble-sprite-stage"
          data-sprite-count={currentSceneMedia?.sprites.length}>
          {currentSceneMedia?.sprites.map((sprite, index) => <img key={sprite.id}
            className={'noble-character-sprite noble-sprite-slot-' + index +
              (sprite.speaker ? ' is-speaker' : ' is-bystander')}
            data-expression={sprite.expression}
            data-pose={sprite.pose}
            data-speaker={sprite.speaker ? 'true' : 'false'}
            src={sprite.url}
            alt={t('reader.spriteAlt', { name: sprite.label, expression: sprite.expression, pose: sprite.pose })}/>)}
        </div>}
        {!displayedBackground && <div className="noble-scene-empty">
          <Image size={34}/><strong>{t('reader.sceneWorld')}</strong>
          <p>{t('reader.addIllustrationHint')}</p>
        </div>}
        {turns.length > 0 && <div className="noble-vn-subtitle" role="note"
          aria-label={t('uiField.visualReader.latestSceneNarration')}>
          <strong>{t('reader.narrator')}</strong>
          <p>{turns[turns.length - 1].assistant_text.slice(-320)}</p>
        </div>}
        <div className="noble-scene-bottom">
          <span className="overline">{t('reader.visualNovel')}</span>
          <h3>{active.title}</h3>
          {currentSceneMedia?.selection === 'caption_match' &&
            <small className="noble-visual-caption">{t('reader.creatorAssets')}</small>}
          <p><UserRound size={14}/>{active.protagonist_name}</p>
          <button className="noble-scene-upload" disabled={updating}
            onClick={() => fileRef.current?.click()}><Camera size={15}/>
            {t(active.scene_image_url ? 'reader.changeScene' : 'reader.addIllustration')}</button>
          {imageMode !== 'off' && <button className="noble-scene-upload"
            onClick={() => { setTab('gallery'); setInspectorOpen(true); }}>
            <Image size={15}/> {t('reader.illustrateAI')}</button>}
        </div>
      </div>
    </aside>

    <article className="noble-reader-main">
      <header className="noble-reader-toolbar">
        <span className="noble-reader-chapter">{t('reader.chapterOne')} <span>·</span> {active.title}</span>
        <div className="noble-reader-toolbar-actions">
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.html'}
            download="noble-story.html" title={t('uiField.visualReader.exportIllustratedStoryAsHTML')}
            aria-label={t('uiField.visualReader.exportStoryAsHTML')}><Download size={17}/></a>
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.epub'}
            download="noble-story.epub" title={t('uiField.visualReader.exportStoryAsEPUB')}
            aria-label={t('uiField.visualReader.exportStoryAsEPUB')}><BookOpen size={17}/></a>
          <button title={t('uiField.visualReader.viewBacklogAltB')} aria-label={t('uiField.visualReader.openBacklog')}
            onClick={() => setBacklogOpen(true)}><History size={17}/></button>
          <button title={t('uiField.visualReader.showStoryDetails')} aria-label={t("reader.openDetails")}
            onClick={() => setInspectorOpen(open => !open)}><Eye size={17}/></button>
          <button title={t('uiField.visualReader.configureNarrator')} aria-label={t('uiField.visualReader.configureNarrator')} onClick={onSettings}>
            <Settings2 size={18}/></button>
        </div>
      </header>
      <div className="noble-reader-prose" aria-live="polite">
        <div className="noble-reader-intro"><Sparkles size={17}/>
          <div><span>{t('reader.storyBegins')}</span><p>{playerPlot || active.premise}</p></div></div>
        {turns.map((turn, i) => <section className="noble-reading-turn"
          id={'noble-turn-' + turn.id} key={turn.id}>
          <small>{t('reader.sceneNumber', { number: String(i + 1).padStart(2, '0') })}</small>
          <div className="noble-reader-user">
            <span>{t(turn.mode === 'say' ? 'reader.youSay' : turn.mode === 'do' ? 'reader.youDo' :
              turn.mode === 'continue' ? 'reader.continueUpper' : 'reader.directionUpper')}</span>
            <p>{turn.input_text || t('reader.storyContinues')}</p>
          </div>
          <p className="noble-narration"><NarrativeText text={turn.assistant_text}/></p>
          <div className="noble-turn-caption">{turn.model}
            {voiceEnabled && <button className="noble-turn-listen"
              disabled={synthesizing || !voices?.available || !voiceId}
              onClick={() => void listen(turn)}><Volume2 size={14}/>
              {t(playingTurn === turn.id ? 'reader.stopAudio' : synthesizing ? 'reader.synthesizing' : 'reader.listen')}</button>}
          </div>
        </section>)}
        {generating && <div className="noble-reader-stream">
          <span><LoaderCircle className="rotating" size={15}/> {generationMessage} · {elapsed}s</span>
          <button className="noble-cancel-stream" onClick={onCancel}><Square size={13}/> {t('reader.stopGeneration')}</button>
          <p><NarrativeText text={streamText || t('reader.connectingEngine')}/></p></div>}
        {!generating && turns.length === 0 && <div className="noble-reader-empty-turn">
          <Feather size={26}/><strong>{t('reader.firstPageBlank')}</strong>
          <p>{t('reader.firstTurnHint', { name: active.protagonist_name })}</p>
        </div>}
        <div ref={tail}/>
      </div>
      <footer className="noble-reader-compose">
        {notice && <p className="story-notice"><Check size={15}/>{notice}</p>}
        {(error || readerError) && <div role="alert" className="story-error">
          {error || readerError} <button onClick={onSettings}>{t('reader.reviewSettings')} <ArrowRight size={13}/></button></div>}
        <div className="noble-reader-mode">
          <span>{t('reader.composeHint', { name: active.protagonist_name })}</span>
          <select value={mode} disabled={generating} aria-label={t('uiField.visualReader.narrationMode')}
            onChange={e => setMode(e.target.value as StoryTurn['mode'])}>
            <option value="do">{t('reader.act')}</option><option value="say">{t('reader.speak')}</option>
            <option value="story">{t('reader.narrate')}</option>
          </select>
        </div>
        <textarea aria-label={t('uiField.visualReader.yourInputInTheStory')} value={draft}
          onChange={e => setDraft(e.target.value)} disabled={generating}
          rows={3} maxLength={3000} placeholder={inputLabel}
          onKeyDown={e => {
            if (!shortcuts || generating || e.nativeEvent.isComposing) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault(); onSubmit(false);
            } else if (e.altKey && e.key === 'Enter') {
              e.preventDefault(); onSubmit(true);
            }
          }}/>
        <div className="noble-reader-actions">
          <div className="noble-reader-action-hint">
            <MessageSquareText size={15}/> {t('reader.dialogueSaved')}
          </div>
          <button className="secondary-button" disabled={generating}
            onClick={() => onSubmit(true)}><Sparkles size={15}/> {t('reader.continue')}</button>
          <button className="primary-button" disabled={generating || !draft.trim()}
            onClick={() => onSubmit(false)}>
            {generating ? <LoaderCircle className="rotating" size={15}/> : <Send size={15}/>}
            {generating ? t('reader.generating') : t('reader.send')}</button>
        </div>
      </footer>
    </article>

    <aside className={'noble-reader-inspector ' + (inspectorOpen ? 'is-open' : '')}>
      <header className="noble-inspector-header"><div><span className="overline">{t('reader.myStory')}</span>
        <h3>{active.title}</h3></div>
        <button aria-label={t("reader.closeDetails")} onClick={() => setInspectorOpen(false)}>
          <X size={18}/></button></header>
      <nav className="noble-inspector-tabs" aria-label={t('uiField.visualReader.visualNovelPanel')}>
        {tabs.map(item => <button key={item}
          className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>
          {t(item === 'reader' ? 'reader.uiUx' : 'reader.' + item)}</button>)}
      </nav>
      <div className="noble-inspector-body">
        {tab === 'summary' && <>
          <h4>{t('reader.summary')}</h4><p>{active.premise}</p>
          <h4>{t('library.protagonist')}</h4>
          <div className="noble-protagonist-card">
            <div className="noble-protagonist-avatar">{active.protagonist_name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{active.protagonist_name}</strong><small>{t('reader.playerCharacter')}</small></div>
          </div>
          <label className="noble-inspector-field">{t('reader.characterName')}
            <input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label>
          <button className="secondary-button" disabled={updating || !name.trim() || name.trim() === active.protagonist_name}
            onClick={() => void saveName()}><Check size={15}/> {t('reader.saveName')}</button>
          <h4>{t('reader.canonTitle')}</h4>
          <p>{t('reader.canonHint')}</p>
          <label className="noble-inspector-field">{t('reader.confirmedRules')}
            <textarea aria-label={t('uiField.visualReader.storyCanon')} rows={6} maxLength={5000}
              value={canon} onChange={e => setCanon(e.target.value)}
              placeholder={t('uiField.visualReader.exampleAiraKnowsTheCastlesSecretNobodyElseKnowsYet')}/></label>
          <button className="secondary-button" disabled={updating || canon === (active.canon || '')}
            onClick={() => void saveCanon()}><Check size={15}/> {t("reader.saveCanon")}</button>
          <h4>{t('reader.status')}</h4>
          <p>{t('reader.savedScenesStatus', { amount: turns.length,
            model: turns.at(-1)?.model || t('reader.notStarted') })}</p>
          <h4>{t('reader.visualProfiles')}</h4>
          <p>{t('reader.visualProfilesHint')}</p>
          {visual?.characters.map(person =>
            <button className="noble-character-entry" key={person.id}
              onClick={() => editVisualCharacter(person)} title={t('uiField.visualReader.editVisualProfile')}>
              <span>{person.name}</span><small>{t('reader.revisionEdit', { number: person.revision })}</small>
            </button>)}
          <label className="noble-inspector-field">{t('reader.characterName')}
            <input value={character.name} maxLength={80} aria-label={t('uiField.visualReader.visualName')}
              onChange={e => setCharacter(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="noble-inspector-field">{t('reader.appearance')}
            <textarea value={character.appearance} maxLength={1500} rows={4}
              aria-label={t('uiField.visualReader.visualAppearance')} placeholder={t('uiField.visualReader.hairEyesApparentAgeSilhouetteSpecies')}
              onChange={e => setCharacter(x => ({ ...x, appearance: e.target.value }))}/></label>
          <label className="noble-inspector-field">{t('reader.outfit')}
            <input value={character.outfit} maxLength={650} aria-label={t('uiField.visualReader.visualOutfit')}
              onChange={e => setCharacter(x => ({ ...x, outfit: e.target.value }))}/></label>
          <label className="noble-inspector-field">{t('reader.distinctive')}
            <input value={character.distinguishing_features} maxLength={650} aria-label={t('uiField.visualReader.visualTraits')}
              onChange={e => setCharacter(x => ({ ...x, distinguishing_features: e.target.value }))}/></label>
          <button className="secondary-button"
            disabled={visualBusy || character.appearance.trim().length < 12 || !character.name.trim()}
            onClick={() => void saveCharacter()}>
            <Check size={15}/>{t(editingCharacterId ? 'reader.saveVisual' : 'reader.addVisual')}
          </button>
          {editingCharacterId && <div className="noble-prompt-preview">
            <strong>{t('reader.identityImage')}</strong>
            <p>{t('reader.referenceHint')}</p>
            <label className="noble-inspector-field">{t('reader.savedReference')}
              <select aria-label={t('uiField.visualReader.characterReference')} value={characterReferenceId}
                onChange={e => setCharacterReferenceId(e.target.value)}>
                <option value="">{t('reader.noImageAssigned')}</option>
                {visual?.assets.map(asset => <option key={asset.id} value={asset.id}>
                  {t(asset.origin === 'comfyui' ? 'reader.generated' : 'reader.imported')} · {asset.id.slice(0, 8)}
                </option>)}
              </select>
            </label>
            {characterReferenceId && visual?.assets.some(asset => asset.id === characterReferenceId) &&
              <img className="noble-character-reference-preview"
                src={visual.assets.find(asset => asset.id === characterReferenceId)?.url}
                alt={t('reader.characterReferenceAlt', { name: character.name })}/>}
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveCharacterReference()}>{t('reader.saveReference')}</button>
          </div>}
          {editingCharacterId && <button className="secondary-button" onClick={() => {
            setEditingCharacterId(null);
            setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
          }}>{t('reader.cancelEditing')}</button>}

          {active.origin_story_id && <p className="noble-inspector-hint">
            {t('reader.branchHint')}
          </p>}
        </>}
        {tab === 'history' && <>
          <h4>{t('reader.memorySearch')}</h4>
          <p className="noble-inspector-hint">{t('reader.historySearchHint')}</p>
          <label className="noble-inspector-field">{t('reader.memorySearch')}
            <input aria-label={t('uiField.visualReader.searchStoryMemories')} value={memoryQuery}
              maxLength={500} placeholder={t('uiField.visualReader.medallionLibraryPromise')}
              onChange={e => { setMemoryQuery(e.target.value); setMemoryResults(null); }}/>
          </label>
          <button className="secondary-button" disabled={memoryBusy || memoryQuery.trim().length < 2}
            onClick={() => void findStoryMemory()}>
            {memoryBusy ? <LoaderCircle size={15} className="rotating"/> : <BookOpen size={15}/>}
            {t("reader.searchMemory")}
          </button>
          {memoryError && <p role="alert" className="narrative-error">{memoryError}</p>}
          {memoryResults && <div role="status" className="creator-hint">
            <strong>{t("reader.memoriesFound", { count: memoryResults.episodes.length })}</strong>
            <p>{t(memoryResults.fts5 ? 'reader.indexFTS' : 'reader.indexLexical')}
              · {t('reader.playerOnly')}</p>
            {memoryResults.episodes.map(entry => <div className="noble-inspector-turn" key={entry.turn_id}>
              <p>{entry.input_text}</p>
              {turns.some(turn => turn.id === entry.turn_id) &&
                <button className="secondary-button" onClick={() => {
                  const turn = turns.find(turn => turn.id === entry.turn_id);
                  if (turn) focusTurn(turn);
                }}>{t('reader.viewScene')}</button>}
            </div>)}
          </div>}
          <h4>{t('reader.sceneHistory')}</h4>
          {turns.length ? turns.map((turn, i) =>
            <div key={turn.id} className="noble-inspector-turn">
              <button className="noble-inspector-turn-jump" onClick={() => focusTurn(turn)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{turn.input_text || t('reader.autoContinuation')}</strong><ChevronRight size={15}/>
              </button>
              <button className="noble-inspector-branch" disabled={generating || updating}
                title={t('uiField.visualReader.safelyRewindWithoutChangingTheOriginalStory')}
                onClick={() => setRewindTurn(turn)}><RotateCcw size={14}/> {t('reader.rewind')}</button>
            </div>) : <p>{t('reader.noScenes')}</p>}
        </>}
        {tab === 'gallery' && <>
          <h4>{t('reader.sceneLocation')}</h4>
          {visual && <p className="noble-inspector-hint">
            {t(visual.current_scene.detection === 'heuristic' ? 'reader.locationHeuristic' : 'reader.locationVerified')}
            {' '}{t('reader.registeredScenes', { amount: visual.scenes.length })}
          </p>}
          <label className="noble-inspector-field">{t('reader.currentLocation')}
            <input aria-label={t('uiField.visualReader.currentLocation')} value={sceneLocation} maxLength={120}
              onChange={e => setSceneLocation(e.target.value)}/></label>
          <button className="secondary-button" disabled={visualBusy || sceneLocation.trim().length < 2}
            onClick={() => void saveSceneLocation()}><Check size={15}/> {t('reader.confirmScene')}</button>
          <h4>{t('reader.illustrationPlan')}</h4>
          <p className="noble-inspector-hint">{t('reader.illustrationPlanHint')}</p>
          {scenePlan && <>
            <label className="noble-inspector-field">{t('reader.shotType')}
              <select aria-label={t('uiField.visualReader.sceneShot')} value={scenePlan.shot}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, shot: e.target.value as ScenePlan['shot'],
                } : plan)}>
                <option value="wide">{t('reader.wide')}</option>
                <option value="medium">{t('reader.medium')}</option>
                <option value="closeup">{t('reader.closeup')}</option>
              </select>
            </label>
            <label className="noble-inspector-field">{t('reader.lighting')}
              <select aria-label={t('uiField.visualReader.sceneLighting')} value={scenePlan.lighting}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, lighting: e.target.value as ScenePlan['lighting'],
                } : plan)}>
                <option value="natural">{t('reader.natural')}</option>
                <option value="sunset">{t('reader.sunset')}</option>
                <option value="night">{t('reader.night')}</option>
                <option value="interior">{t('reader.interior')}</option>
                <option value="dramatic">{t('reader.dramatic')}</option>
              </select>
            </label>
            <label className="noble-inspector-field">{t('reader.mood')}
              <input aria-label={t('uiField.visualReader.visualMood')} maxLength={160} value={scenePlan.mood}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, mood: e.target.value,
                } : plan)}/></label>
            <label className="noble-inspector-field">{t('reader.composition')}
              <textarea aria-label={t('uiField.visualReader.sceneDirection')} rows={3} maxLength={900}
                value={scenePlan.direction}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, direction: e.target.value,
                } : plan)}/></label>
            <p className="noble-inspector-hint">{t('reader.visibleCharacters')}</p>
            {visual?.characters.map(person => <label key={person.id}
                className="noble-inspector-field noble-cast-choice">
              <input type="checkbox" aria-label={t('reader.visibleCharacterLabel', { name: person.name })}
                disabled={!scenePlan.visible_character_ids.includes(person.id) &&
                  scenePlan.visible_character_ids.length >= 6}
                checked={scenePlan.visible_character_ids.includes(person.id)}
                onChange={e => toggleVisibleCharacter(person.id, e.target.checked)}/>
              {person.name}
            </label>)}
            <label className="noble-inspector-field">{t('reader.referenceCharacter')}
              <select aria-label={t('uiField.visualReader.visualFocus')} value={scenePlan.reference_character_id || ''}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, reference_character_id: e.target.value || null,
                } : plan)}>
                <option value="">{t('reader.noAutomaticRef')}</option>
                {visual?.characters.filter(person =>
                  scenePlan.visible_character_ids.includes(person.id)).map(person =>
                  <option key={person.id} value={person.id}>
                    {person.name}{' · ' + t(person.reference_asset_id ? 'readerUi.imageAssigned' : 'readerUi.textOnly')}
                  </option>)}
              </select>
            </label>
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveComposition()}>
              <Check size={15}/> {t('reader.saveScenePlan')}
            </button>
          </>}
          <h4>{t('reader.visualDirector')}</h4>
          <p className="noble-inspector-hint">{t('reader.directorHint')}</p>
          <label className="noble-inspector-field">{t('reader.visualChange')}
            <select aria-label={t('uiField.visualReader.visualDirectorIntent')} value={directorIntent}
              onChange={event => {
                setDirectorIntent(event.target.value as VisualDirectorIntent);
                setDirectorPreview(null);
              }}>
              <option value="auto">{t('reader.sameScene')}</option>
              <option value="background">{t('reader.findBackground')}</option>
              <option value="emotion">{t('reader.changeExpression')}</option>
              <option value="event">{t('reader.specialEvent')}</option>
            </select>
          </label>
          <button className="secondary-button" disabled={directorBusy}
            onClick={() => void inspectVisualDirector()}>
            <Palette size={16}/> {t(directorBusy ? 'reader.evaluating' : 'reader.evaluateDirector')}
          </button>
          {directorError && <p className="narrative-error" role="alert">{directorError}</p>}
          {directorPreview && <div className="noble-director-result" role="status">
            <strong>{t(({
              REUSE_BACKGROUND: 'reader.actionReuse',
              UPDATE_SPRITE_EMOTION: 'reader.actionEmotion',
              GENERATE_NEW_BACKGROUND: 'reader.actionBackground',
              GENERATE_EVENT_CG: 'reader.actionEvent',
            } as const)[directorPreview.action])}</strong>
            <p>{t(({
              REUSE_BACKGROUND: 'reader.directorReasonReused',
              UPDATE_SPRITE_EMOTION: 'reader.directorReasonEmotion',
              GENERATE_NEW_BACKGROUND: 'reader.directorReasonNew',
              GENERATE_EVENT_CG: 'reader.directorReasonEvent',
            } as const)[directorPreview.action])}</p>
            <small>{t('reader.visualContext', {
              location: directorPreview.context.location || t('reader.noLocation'),
              time: directorPreview.context.time_of_day || t('reader.timeUnconfirmed'),
              weather: directorPreview.context.weather || t('reader.weatherUnconfirmed'),
              shot: directorPreview.context.shot, lighting: directorPreview.context.lighting,
            })}</small>
            {directorPreview.background_cached && directorPreview.background_asset_id &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void reuseDirectorBackground()}>
                <Image size={16}/> {t('reader.reuseBackground')}
              </button>}
            {!directorPreview.background_cached && visual?.selected_asset_id &&
              visual.assets.some(asset => asset.id === visual.selected_asset_id &&
                asset.origin === 'manual') &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void registerDirectorBackground(visual.selected_asset_id!)}>
                <Check size={16}/> {t('reader.registerBackground')}
              </button>}
            <p className="noble-inspector-hint">{t('reader.directorNote')}</p>
          </div>}
          <h4>{t('reader.versionedGallery', { count: visual?.assets.length || 0 })}</h4>
          {active.scene_image_url ? <img className="noble-gallery-image"
            src={active.scene_image_url} alt={t('reader.imageAlt', { title: active.title })}/> :
            <p>{t('reader.emptyGallery')}</p>}
          {!!visual?.assets.length && <div className="noble-version-gallery">
            {visual.assets.map(asset => <div key={asset.id} className={'noble-art-version ' +
              (asset.selected ? 'is-selected' : '')}>
              <img src={asset.url} loading="lazy"
                alt={t('reader.imageVersionAlt', { version: asset.id.slice(0, 8) })}/>
              <small>{asset.origin === 'comfyui' ? 'ComfyUI' : t('reader.imported')}
                {asset.seed != null ? ' · ' + t('reader.seedLabel', { seed: asset.seed }) : ''}</small>
              {!!asset.render_details?.loras?.length && <small>
                {t('readerUi.lorasLabel')} {asset.render_details.loras.map(lora =>
                  lora.lora_name + ' (' + lora.strength + ')').join(', ')}
              </small>}
              <button disabled={visualBusy || asset.selected}
                onClick={() => void chooseArtwork(asset.id)}>
                {t(asset.selected ? 'reader.inUse' : 'reader.useVersion')}</button>
            </div>)}
          </div>}
          <button className="secondary-button" disabled={updating}
            onClick={() => fileRef.current?.click()}><UploadCloud size={16}/> {t('reader.importIllustration')}</button>
          {imageMode !== 'off' && <>
            <label className="noble-inspector-field">{t('reader.describeScene')}
              <textarea rows={4} minLength={8} maxLength={2400}
                value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
                placeholder={t('uiField.visualReader.charactersLocationLightingExpressionAndVisualStyle')}/></label>
            <label className="noble-inspector-field">{t('reader.referenceImage')}
              <select aria-label={t('uiField.visualReader.visualReference')} value={referenceAssetId}
                onChange={e => setReferenceAssetId(e.target.value)}>
                <option value="">{t('reader.noReference')}</option>
                {visual?.assets.map(asset =>
                  <option key={asset.id} value={asset.id}>
                    {asset.origin === 'comfyui' ? t('reader.aiIllustrationLabel') : t('reader.imported')}
                    {' · '}{asset.id.slice(0, 8)}
                    {asset.selected ? ' ' + t('reader.currentVersion') : ''}
                  </option>)}
              </select>
            </label>
            {referenceAssetId && <>
              <label className="noble-inspector-field">
                {t('readerUi.referenceTransform', { percentage: Math.round(denoise * 100) })}
                <input aria-label={t('uiField.visualReader.transformationStrength')} type="range"
                  min={0.2} max={0.95} step={0.05} value={denoise}
                  onChange={e => setDenoise(Number(e.target.value))}/>
              </label>
              <p className="noble-inspector-hint">
                {t('readerUi.referenceTransformHint')}
              </p>
            </>}
            <label className="noble-inspector-field">{t('reader.imageSeed')}
              <input aria-label={t('uiField.visualReader.imageSeed')} type="number" min={0} step={1}
                value={imageSeed} onChange={e => setImageSeed(e.target.value)}
                placeholder={t('uiField.visualReader.randomIfLeftBlank')}/></label>
            <button className="secondary-button" disabled={visualBusy || imagePrompt.trim().length < 8}
              onClick={() => void previewIllustrationPrompt()}>{t('reader.completePrompt')}</button>
            {previewPrompt && <div className="noble-prompt-preview">
              <strong>{t('reader.comfyPrompt')}</strong><p>{previewPrompt}</p>
            </div>}
            <div className="noble-inspector-field">
              <label>
                <input type="checkbox" aria-label={t('uiField.visualReader.applyCharacterLoRAs')}
                  checked={applyCharacterLoras}
                  onChange={e => setApplyCharacterLoras(e.target.checked)}/>
                {' '}{t('readerUi.applyCharacterLoras')}
              </label>
              <p className="noble-inspector-hint">
                {t('reader.loraHint')}
              </p>
              <button className="secondary-button" disabled={checkingLoras || illustrating}
                onClick={() => void checkInstalledLoras()}>
                {t(checkingLoras ? 'reader.checkingComfy' : 'reader.viewLoras')}
              </button>
              {loraStatus && <p className="noble-inspector-hint" role="status">
                {loraStatus.online
                  ? t(loraStatus.loras.length === 1 ? 'reader.loraAvailableSingle' : 'reader.lorasAvailable', { amount: loraStatus.loras.length,
                    names: loraStatus.loras.length ? ': ' + loraStatus.loras.slice(0, 6).join(', ') +
                      (loraStatus.loras.length > 6 ? '…' : '') : '.' })
                  : t('reader.lorasUnavailable', { error: loraStatus.error || t('app.offline') })}
              </p>}
            </div>
            <label className="noble-inspector-field">
              <span>{t('reader.lowVram')}</span>
              <input type="checkbox" checked={allowLowVram}
                onChange={e => setAllowLowVram(e.target.checked)}/>
            </label>
            <button className="primary-button" disabled={illustrating || imagePrompt.trim().length < 8}
              onClick={() => void illustrateScene()}>
              {illustrating ? <LoaderCircle className="rotating" size={16}/> : <Image size={16}/>}
              {t(illustrating ? 'reader.comfyGenerating' : 'reader.illustrateComfy')}</button>
          </>}
          {illustrationNotice && <p role="status" className="narrative-saved">{illustrationNotice}</p>}
          <p className="noble-inspector-hint">{t('reader.imageHint')}</p>
        </>}
        {tab === 'reader' && <>
          <h4>{t('reader.layout')}</h4>
          <p>{t('reader.layoutHint')}</p>
          {prefs && <div className="noble-reader-layout-options">
            <button className={prefs.reader_layout === 'immersive' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'immersive'}
              disabled={updating} onClick={() => void changeReaderLayout('immersive')}>
              <Palette size={17}/> VN</button>
            <button className={prefs.reader_layout === 'classic' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'classic'}
              disabled={updating} onClick={() => void changeReaderLayout('classic')}>
              <BookOpen size={17}/> {t('reader.book')}</button>
            <button className={prefs.reader_layout === 'chat' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'chat'}
              disabled={updating} onClick={() => void changeReaderLayout('chat')}>
              <MessageSquareText size={17}/> {t('reader.chat')}</button>
          </div>}
          <p className="noble-inspector-hint">{t('reader.shortcutsHint')}</p>
          <button className="secondary-button" onClick={() => setBacklogOpen(true)}>
            <History size={16}/> {t('reader.backlog')}
          </button>
          {voiceEnabled && <label className="noble-inspector-field">{t('reader.voice')}
            <select value={voiceId} disabled={synthesizing} onChange={e => setVoiceId(e.target.value)}>
              {voices?.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </label>}
          <p className="noble-inspector-hint">{voiceEnabled ?
            (voices?.available && voices.voices.length ? t('reader.voiceOnDemand') :
              t('reader.voiceInstallHint')) : t('reader.voiceDisabled')}</p>
          <button className="secondary-button" onClick={onSettings}><Cpu size={16}/> {t('common.settings')}</button>
        </>}
      </div>
    </aside>
    {inspectorOpen && <button className="noble-inspector-backdrop"
      aria-label={t('uiField.visualReader.closeDetailsPanel')} onClick={() => setInspectorOpen(false)}/>}
    {backlogOpen && <div className="noble-backlog-scrim">
      <section className="noble-backlog-dialog" role="dialog" aria-modal="true"
        aria-label={t('uiField.visualReader.storyBacklog')}>
        <header className="noble-backlog-heading">
          <div><span className="overline"><History size={15}/> {t('reader.readingHistory')}</span>
            <h2>{t('reader.storyBacklog')}</h2>
            <p>{t('readerUi.loadedScenes', { amount: turns.length })}</p></div>
          <button className="icon-button" aria-label={t('uiField.visualReader.closeBacklog')}
            onClick={() => setBacklogOpen(false)}><X size={19}/></button>
        </header>
        <label className="noble-backlog-search">{t('reader.searchLoaded')}
          <input type="search" aria-label={t('uiField.visualReader.searchBacklog')} maxLength={150}
            value={backlogQuery} onChange={event => setBacklogQuery(event.target.value)}
            placeholder={t('uiField.visualReader.playerActionDialogueOrNarration')}/>
        </label>
        <div className="noble-backlog-entries">
          {backlogItems.map(turn => <article key={turn.id} className="noble-backlog-entry">
            <div><strong>{t(turn.mode === 'say' ? 'readerUi.backlogDialogue' :
              turn.mode === 'do' ? 'readerUi.backlogAction' :
              turn.mode === 'story' ? 'readerUi.backlogDirection' : 'readerUi.backlogContinuation')}
              {' · '}{active.protagonist_name}</strong>
              <button className="secondary-button" onClick={() => {
                setBacklogOpen(false); focusTurn(turn);
              }}>{t('reader.goToScene')}</button></div>
            {turn.input_text && <p className="noble-backlog-player">{turn.input_text}</p>}
            <p className="noble-backlog-narrator"><NarrativeText text={turn.assistant_text}/></p>
          </article>)}
          {!backlogItems.length && <p className="noble-backlog-empty">
            {turns.length ? t('reader.noMatches') : t('reader.noSavedScenes')}
          </p>}
        </div>
      </section>
    </div>}
    {rewindTurn && <div className="noble-rewind-scrim" role="presentation">
      <section className="noble-rewind-dialog" role="dialog"
        aria-modal="true" aria-label={t('uiField.visualReader.confirmRewind')}>
        <div className="noble-rewind-header">
          <div><span className="overline"><RotateCcw size={15}/> {t('reader.timeline')}</span>
            <h2>{t('reader.returnPoint')}</h2></div>
          <button className="icon-button" aria-label={t('uiField.visualReader.cancelRewind')}
            onClick={() => setRewindTurn(null)}><X size={19}/></button>
        </div>
        <p>{t('reader.rewindHint')}</p>
        <div className="noble-rewind-selected">
          <strong>{t('readerUi.turnNumber', { number: turns.findIndex(turn => turn.id === rewindTurn.id) + 1 })}</strong>
          <p>{rewindTurn.input_text || rewindTurn.assistant_text.slice(0, 180)}</p>
          <small>{t('readerUi.laterTurns', { amount: Math.max(0,
            turns.length - turns.findIndex(turn => turn.id === rewindTurn.id) - 1) })}</small>
        </div>
        <div className="noble-rewind-checkpoint" role="status">
          {rewindLoading || !rewindPreview ?
            <span><LoaderCircle className="rotating" size={15}/> {t('reader.snapshots')}</span> :
            <>
              <div><BookOpen size={15}/>
                {rewindPreview.lore ?
                  t('reader.historicalLore', { amount: rewindPreview.lore.entries.length,
                    unit: t(rewindPreview.lore.entries.length === 1 ? 'reader.loreEntry' : 'reader.loreEntries') }) :
                  t('reader.historicalLoreMissing')}
              </div>
              <div><GitBranch size={15}/>
                {rewindPreview.world ?
                  t('reader.worldStateAt', { location: rewindPreview.world.state.location || t('reader.noConfirmedLocation') }) :
                  t('reader.historicalWorldMissing')}
              </div>
            </>}
        </div>
        <div className="noble-rewind-actions">
          <button className="secondary-button" onClick={() => setRewindTurn(null)}>
            {t('reader.stayHere')}
          </button>
          <button className="primary-button" disabled={rewindLoading || generating || updating}
            onClick={() => {
              const selected = rewindTurn.id;
              setRewindTurn(null);
              setInspectorOpen(false);
              onFork(selected);
            }}><GitBranch size={16}/> {t('reader.createBranch')}</button>
        </div>
      </section>
    </div>}
    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
      aria-label={t('uiField.visualReader.uploadSceneIllustration')} onChange={e => {
        const file = e.target.files?.[0];
        void upload(file);
        e.target.value = '';
      }}/>
  </div>;
}
