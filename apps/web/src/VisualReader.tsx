import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Camera, Check, ChevronRight, Cpu, Eye, Feather,
  Image, LoaderCircle, MessageSquareText, Palette, Send, Settings2, Volume2, Square,
  Sparkles, UploadCloud, UserRound, X, GitBranch, RotateCcw, Download, EyeOff, History,
} from 'lucide-react';
import { api } from './api';
import type { Story, StoryTurn, WorkspacePreferences, SpeechVoices, VisualState, VisualCharacterDraft, ScenePlan, ScenePlanInput, ScenePresentation, LorebookTurnSnapshot, WorldTurnSnapshot, EpisodicSearch, VisualDirectorPreview, VisualDirectorIntent } from './types';

type Tab = 'summary' | 'history' | 'gallery' | 'reader';
const tabs: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' }, { id: 'history', label: 'History' },
  { id: 'gallery', label: 'Gallery' }, { id: 'reader', label: 'UI/UX' },
];

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
      setIllustrationNotice('Scene plan saved. It will be used for future illustrations.');
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
      setIllustrationNotice('Background reused from Gallery. ComfyUI was not called.');
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
        throw new Error('Seed must be a nonnegative integer.');
      const result = await api.illustrate(requestedStoryId, imagePrompt.trim(), seed,
        referenceAssetId || undefined, referenceAssetId ? denoise : undefined,
        allowLowVram, applyCharacterLoras);
      const loraInfo = result.applied_loras?.length
        ? ' LoRAs aplicados: ' + result.applied_loras.map(lora => lora.lora_name).join(', ') + '.'
        : '';
      setIllustrationNotice((result.cached ? 'Illustration restored from cache.' :
        'New illustration saved as an independent version.') + loraInfo);
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
  const inputLabel = mode === 'say' ? 'Write what your protagonist says...' :
    mode === 'story' ? 'Direct what happens next...' :
    'Describe what your protagonist does...';

  if (!active) return <div className="story-start-screen noble-reader-empty">
    <div className="story-start-icon"><BookOpen size={34}/></div>
    <h2>A new story awaits.</h2>
    <p>Choose a world, define your protagonist and begin. Scenes and dialogue are saved to your local library.</p>
    <button className="primary-button" onClick={onCreate}><Sparkles size={17}/> Create my first story</button>
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
      aria-label={hudHidden ? 'Show reader interface' : 'Hide reader interface'}
      title={hudHidden ? 'Show interface (Alt+H)' : 'Hide interface (Alt+H)'}
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
            alt={'Present character: ' + sprite.label +
              ' · expression ' + sprite.expression + ' · pose ' + sprite.pose}/>)}
        </div>}
        {!displayedBackground && <div className="noble-scene-empty">
          <Image size={34}/><strong>Your scene, your world</strong>
          <p>Add an illustration to accompany your story.</p>
        </div>}
        {turns.length > 0 && <div className="noble-vn-subtitle" role="note"
          aria-label="Latest scene narration">
          <strong>Narrator</strong>
          <p>{turns[turns.length - 1].assistant_text.slice(-320)}</p>
        </div>}
        <div className="noble-scene-bottom">
          <span className="overline">NOBLE VISUAL NOVEL</span>
          <h3>{active.title}</h3>
          {currentSceneMedia?.selection === 'caption_match' &&
            <small className="noble-visual-caption">Creator assets matched to the scene</small>}
          <p><UserRound size={14}/>{active.protagonist_name}</p>
          <button className="noble-scene-upload" disabled={updating}
            onClick={() => fileRef.current?.click()}><Camera size={15}/>
            {active.scene_image_url ? 'Change scene' : 'Add illustration'}</button>
          {imageMode !== 'off' && <button className="noble-scene-upload"
            onClick={() => { setTab('gallery'); setInspectorOpen(true); }}>
            <Image size={15}/> Illustrate with AI</button>}
        </div>
      </div>
    </aside>

    <article className="noble-reader-main">
      <header className="noble-reader-toolbar">
        <span className="noble-reader-chapter">CHAPTER 01 <span>·</span> {active.title}</span>
        <div className="noble-reader-toolbar-actions">
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.html'}
            download="noble-story.html" title="Export illustrated story as HTML"
            aria-label="Export story as HTML"><Download size={17}/></a>
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.epub'}
            download="noble-story.epub" title="Export story as EPUB"
            aria-label="Export story as EPUB"><BookOpen size={17}/></a>
          <button title="View backlog (Alt+B)" aria-label="Open backlog"
            onClick={() => setBacklogOpen(true)}><History size={17}/></button>
          <button title="Show story details" aria-label="Open story details"
            onClick={() => setInspectorOpen(open => !open)}><Eye size={17}/></button>
          <button title="Configure narrator" aria-label="Configure narrator" onClick={onSettings}>
            <Settings2 size={18}/></button>
        </div>
      </header>
      <div className="noble-reader-prose" aria-live="polite">
        <div className="noble-reader-intro"><Sparkles size={17}/>
          <div><span>THE STORY BEGINS</span><p>{playerPlot || active.premise}</p></div></div>
        {turns.map((turn, i) => <section className="noble-reading-turn"
          id={'noble-turn-' + turn.id} key={turn.id}>
          <small>SCENE {String(i + 1).padStart(2, '0')}</small>
          <div className="noble-reader-user">
            <span>{turn.mode === 'say' ? 'YOU SAY' : turn.mode === 'do' ? 'YOU DO' :
              turn.mode === 'continue' ? 'CONTINUE' : 'DIRECTION'}</span>
            <p>{turn.input_text || 'The story continues...'}</p>
          </div>
          <p className="noble-narration"><NarrativeText text={turn.assistant_text}/></p>
          <div className="noble-turn-caption">{turn.model}
            {voiceEnabled && <button className="noble-turn-listen"
              disabled={synthesizing || !voices?.available || !voiceId}
              onClick={() => void listen(turn)}><Volume2 size={14}/>
              {playingTurn === turn.id ? 'Stop' : synthesizing ? 'Synthesizing...' : 'Listen'}</button>}
          </div>
        </section>)}
        {generating && <div className="noble-reader-stream">
          <span><LoaderCircle className="rotating" size={15}/> {generationMessage} · {elapsed}s</span>
          <button className="noble-cancel-stream" onClick={onCancel}><Square size={13}/> Stop generation</button>
          <p><NarrativeText text={streamText || 'Connecting to the engine...'}/></p></div>}
        {!generating && turns.length === 0 && <div className="noble-reader-empty-turn">
          <Feather size={26}/><strong>The first page is blank.</strong>
          <p>Speak as {active.protagonist_name}, describe your action, or select Continue.</p>
        </div>}
        <div ref={tail}/>
      </div>
      <footer className="noble-reader-compose">
        {notice && <p className="story-notice"><Check size={15}/>{notice}</p>}
        {(error || readerError) && <div role="alert" className="story-error">
          {error || readerError} <button onClick={onSettings}>Review settings <ArrowRight size={13}/></button></div>}
        <div className="noble-reader-mode">
          <span>Speak as {active.protagonist_name} or choose what happens next</span>
          <select value={mode} disabled={generating} aria-label="Narration mode"
            onChange={e => setMode(e.target.value as StoryTurn['mode'])}>
            <option value="do">Act</option><option value="say">Speak</option>
            <option value="story">Narrate</option>
          </select>
        </div>
        <textarea aria-label="Your input in the story" value={draft}
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
            <MessageSquareText size={15}/> Dialogue is saved to your story
          </div>
          <button className="secondary-button" disabled={generating}
            onClick={() => onSubmit(true)}><Sparkles size={15}/> Continue</button>
          <button className="primary-button" disabled={generating || !draft.trim()}
            onClick={() => onSubmit(false)}>
            {generating ? <LoaderCircle className="rotating" size={15}/> : <Send size={15}/>}
            {generating ? 'Generating...' : 'Send'}</button>
        </div>
      </footer>
    </article>

    <aside className={'noble-reader-inspector ' + (inspectorOpen ? 'is-open' : '')}>
      <header className="noble-inspector-header"><div><span className="overline">MY STORY</span>
        <h3>{active.title}</h3></div>
        <button aria-label="Close details" onClick={() => setInspectorOpen(false)}>
          <X size={18}/></button></header>
      <nav className="noble-inspector-tabs" aria-label="Visual novel panel">
        {tabs.map(item => <button key={item.id}
          className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>
          {item.label}</button>)}
      </nav>
      <div className="noble-inspector-body">
        {tab === 'summary' && <>
          <h4>Summary</h4><p>{active.premise}</p>
          <h4>Protagonist</h4>
          <div className="noble-protagonist-card">
            <div className="noble-protagonist-avatar">{active.protagonist_name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{active.protagonist_name}</strong><small>Player character</small></div>
          </div>
          <label className="noble-inspector-field">Character name
            <input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label>
          <button className="secondary-button" disabled={updating || !name.trim() || name.trim() === active.protagonist_name}
            onClick={() => void saveName()}><Check size={15}/> Save name</button>
          <h4>Canon and persistent memory</h4>
          <p>Characters, relationships, places, and facts the narrator should remember in future chapters.</p>
          <label className="noble-inspector-field">Confirmed rules and events
            <textarea aria-label="Story canon" rows={6} maxLength={5000}
              value={canon} onChange={e => setCanon(e.target.value)}
              placeholder="Example: Aira knows the castle's secret. Nobody else knows yet."/></label>
          <button className="secondary-button" disabled={updating || canon === (active.canon || '')}
            onClick={() => void saveCanon()}><Check size={15}/> Save canon</button>
          <h4>Status</h4>
          <p>{turns.length} saved scenes · latest model: {turns.at(-1)?.model || 'Not started'}</p>
          <h4>Visual identity profiles</h4>
          <p>Set consistent appearance and outfit details for ComfyUI prompts.</p>
          {visual?.characters.map(person =>
            <button className="noble-character-entry" key={person.id}
              onClick={() => editVisualCharacter(person)} title="Edit visual profile">
              <span>{person.name}</span><small>Revision {person.revision} · Edit</small>
            </button>)}
          <label className="noble-inspector-field">Character name
            <input value={character.name} maxLength={80} aria-label="Visual name"
              onChange={e => setCharacter(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="noble-inspector-field">Consistent appearance
            <textarea value={character.appearance} maxLength={1500} rows={4}
              aria-label="Visual appearance" placeholder="Hair, eyes, apparent age, silhouette, species..."
              onChange={e => setCharacter(x => ({ ...x, appearance: e.target.value }))}/></label>
          <label className="noble-inspector-field">Outfit
            <input value={character.outfit} maxLength={650} aria-label="Visual outfit"
              onChange={e => setCharacter(x => ({ ...x, outfit: e.target.value }))}/></label>
          <label className="noble-inspector-field">Distinctive features
            <input value={character.distinguishing_features} maxLength={650} aria-label="Visual traits"
              onChange={e => setCharacter(x => ({ ...x, distinguishing_features: e.target.value }))}/></label>
          <button className="secondary-button"
            disabled={visualBusy || character.appearance.trim().length < 12 || !character.name.trim()}
            onClick={() => void saveCharacter()}>
            <Check size={15}/>{editingCharacterId ? 'Save visual profile' : 'Add visual character'}
          </button>
          {editingCharacterId && <div className="noble-prompt-preview">
            <strong>Identity image for this character</strong>
            <p>Attach an imported or generated image. A scene plan can use it as an img2img reference when the character appears.</p>
            <label className="noble-inspector-field">Saved reference
              <select aria-label="Character reference" value={characterReferenceId}
                onChange={e => setCharacterReferenceId(e.target.value)}>
                <option value="">No image assigned</option>
                {visual?.assets.map(asset => <option key={asset.id} value={asset.id}>
                  {asset.origin === 'comfyui' ? 'Generated' : 'Imported'} · {asset.id.slice(0, 8)}
                </option>)}
              </select>
            </label>
            {characterReferenceId && visual?.assets.some(asset => asset.id === characterReferenceId) &&
              <img className="noble-character-reference-preview"
                src={visual.assets.find(asset => asset.id === characterReferenceId)?.url}
                alt={'Character visual reference for ' + character.name}/>}
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveCharacterReference()}>Save visual reference</button>
          </div>}
          {editingCharacterId && <button className="secondary-button" onClick={() => {
            setEditingCharacterId(null);
            setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
          }}>Cancel editing</button>}

          {active.origin_story_id && <p className="noble-inspector-hint">
            This story is an independent branch. Future decisions will not change the original.
          </p>}
        </>}
        {tab === 'history' && <>
          <h4>Search story memories</h4>
          <p className="noble-inspector-hint">Search older player actions beyond the recent-turn window. The results exclude private author secrets and AI-generated prose, and are limited to this branch.</p>
          <label className="noble-inspector-field">Search story memories
            <input aria-label="Search story memories" value={memoryQuery}
              maxLength={500} placeholder="medallion, library, promise..."
              onChange={e => { setMemoryQuery(e.target.value); setMemoryResults(null); }}/>
          </label>
          <button className="secondary-button" disabled={memoryBusy || memoryQuery.trim().length < 2}
            onClick={() => void findStoryMemory()}>
            {memoryBusy ? <LoaderCircle size={15} className="rotating"/> : <BookOpen size={15}/>}
            Search entire story
          </button>
          {memoryError && <p role="alert" className="narrative-error">{memoryError}</p>}
          {memoryResults && <div role="status" className="creator-hint">
            <strong>{memoryResults.episodes.length} memories found</strong>
            <p>{memoryResults.fts5 ? 'SQLite FTS5 index' : 'Local lexical search'}
              · Player input only</p>
            {memoryResults.episodes.map(entry => <div className="noble-inspector-turn" key={entry.turn_id}>
              <p>{entry.input_text}</p>
              {turns.some(turn => turn.id === entry.turn_id) &&
                <button className="secondary-button" onClick={() => {
                  const turn = turns.find(turn => turn.id === entry.turn_id);
                  if (turn) focusTurn(turn);
                }}>View scene</button>}
            </div>)}
          </div>}
          <h4>Scene history</h4>
          {turns.length ? turns.map((turn, i) =>
            <div key={turn.id} className="noble-inspector-turn">
              <button className="noble-inspector-turn-jump" onClick={() => focusTurn(turn)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{turn.input_text || 'Automatic continuation'}</strong><ChevronRight size={15}/>
              </button>
              <button className="noble-inspector-branch" disabled={generating || updating}
                title="Safely rewind without changing the original story"
                onClick={() => setRewindTurn(turn)}><RotateCcw size={14}/> Rewind here</button>
            </div>) : <p>No scenes have been generated yet.</p>}
        </>}
        {tab === 'gallery' && <>
          <h4>Scene and location</h4>
          {visual && <p className="noble-inspector-hint">
            {visual.current_scene.detection === 'heuristic' ?
              'Location change detected from text: verify the location.' :
              'Location confirmed for this story.'}
            {' '}Registered scenes: {visual.scenes.length}.
          </p>}
          <label className="noble-inspector-field">Current location
            <input aria-label="Current location" value={sceneLocation} maxLength={120}
              onChange={e => setSceneLocation(e.target.value)}/></label>
          <button className="secondary-button" disabled={visualBusy || sceneLocation.trim().length < 2}
            onClick={() => void saveSceneLocation()}><Check size={15}/> Confirm scene</button>
          <h4>Illustration plan</h4>
          <p className="noble-inspector-hint">Plan each scene before requesting
            an image. The selected cast is saved for each scene.</p>
          {scenePlan && <>
            <label className="noble-inspector-field">Shot type
              <select aria-label="Scene shot" value={scenePlan.shot}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, shot: e.target.value as ScenePlan['shot'],
                } : plan)}>
                <option value="wide">Wide</option>
                <option value="medium">Medium</option>
                <option value="closeup">Close-up</option>
              </select>
            </label>
            <label className="noble-inspector-field">Scene lighting
              <select aria-label="Scene lighting" value={scenePlan.lighting}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, lighting: e.target.value as ScenePlan['lighting'],
                } : plan)}>
                <option value="natural">Natural</option>
                <option value="sunset">Atardecer</option>
                <option value="night">Noche</option>
                <option value="interior">Interior</option>
                <option value="dramatic">Dramatic</option>
              </select>
            </label>
            <label className="noble-inspector-field">Mood
              <input aria-label="Visual mood" maxLength={160} value={scenePlan.mood}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, mood: e.target.value,
                } : plan)}/></label>
            <label className="noble-inspector-field">Composition and action
              <textarea aria-label="Scene direction" rows={3} maxLength={900}
                value={scenePlan.direction}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, direction: e.target.value,
                } : plan)}/></label>
            <p className="noble-inspector-hint">Visible characters (maximum 6)</p>
            {visual?.characters.map(person => <label key={person.id}
                className="noble-inspector-field noble-cast-choice">
              <input type="checkbox" aria-label={'Visible character ' + person.name}
                disabled={!scenePlan.visible_character_ids.includes(person.id) &&
                  scenePlan.visible_character_ids.length >= 6}
                checked={scenePlan.visible_character_ids.includes(person.id)}
                onChange={e => toggleVisibleCharacter(person.id, e.target.checked)}/>
              {person.name}
            </label>)}
            <label className="noble-inspector-field">Reference character
              <select aria-label="Visual focus" value={scenePlan.reference_character_id || ''}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, reference_character_id: e.target.value || null,
                } : plan)}>
                <option value="">No automatic reference</option>
                {visual?.characters.filter(person =>
                  scenePlan.visible_character_ids.includes(person.id)).map(person =>
                  <option key={person.id} value={person.id}>
                    {person.name}{person.reference_asset_id ? ' · image assigned' : ' · text only'}
                  </option>)}
              </select>
            </label>
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveComposition()}>
              <Check size={15}/> Save scene plan
            </button>
          </>}
          <h4>Visual director and background cache</h4>
          <p className="noble-inspector-hint">Deterministically choose whether to reuse an imported background or suggest new artwork. Context includes location, time, weather, framing, and lighting; emotions do not change the background key. Previewing never runs a model.</p>
          <label className="noble-inspector-field">Visual change type
            <select aria-label="Visual director intent" value={directorIntent}
              onChange={event => {
                setDirectorIntent(event.target.value as VisualDirectorIntent);
                setDirectorPreview(null);
              }}>
              <option value="auto">Automatic / same scene</option>
              <option value="background">Find background</option>
              <option value="emotion">Change character expression</option>
              <option value="event">Special event illustration</option>
            </select>
          </label>
          <button className="secondary-button" disabled={directorBusy}
            onClick={() => void inspectVisualDirector()}>
            <Palette size={16}/> {directorBusy ? 'Evaluating...' : 'Evaluate visual director'}
          </button>
          {directorError && <p className="narrative-error" role="alert">{directorError}</p>}
          {directorPreview && <div className="noble-director-result" role="status">
            <strong>{({
              REUSE_BACKGROUND: 'Reuse background',
              UPDATE_SPRITE_EMOTION: 'Update character expression',
              GENERATE_NEW_BACKGROUND: 'Prepare new background',
              GENERATE_EVENT_CG: 'Suggest a special event illustration',
            } as const)[directorPreview.action]}</strong>
            <p>{directorPreview.reason}</p>
            <small>Context: {directorPreview.context.location || 'no location'}
              {' · '}{directorPreview.context.time_of_day || 'time unconfirmed'}
              {' · '}{directorPreview.context.weather || 'weather unconfirmed'}
              {' · '}{directorPreview.context.shot}
              {' · '}{directorPreview.context.lighting}</small>
            {directorPreview.background_cached && directorPreview.background_asset_id &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void reuseDirectorBackground()}>
                <Image size={16}/> Reuse background without generating
              </button>}
            {!directorPreview.background_cached && visual?.selected_asset_id &&
              visual.assets.some(asset => asset.id === visual.selected_asset_id &&
                asset.origin === 'manual') &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void registerDirectorBackground(visual.selected_asset_id!)}>
                <Check size={16}/> Register manual background for this context
              </button>}
            <p className="noble-inspector-hint">The director recommends actions. Expressions and event illustrations require separate sprites or explicit generation. No image has been generated automatically. A caption-matched Creator Studio asset may take visual priority.</p>
          </div>}
          <h4>Versioned gallery ({visual?.assets.length || 0})</h4>
          {active.scene_image_url ? <img className="noble-gallery-image"
            src={active.scene_image_url} alt={'Illustration of ' + active.title}/> :
            <p>There is no illustration in this story yet.</p>}
          {!!visual?.assets.length && <div className="noble-version-gallery">
            {visual.assets.map(asset => <div key={asset.id} className={'noble-art-version ' +
              (asset.selected ? 'is-selected' : '')}>
              <img src={asset.url} loading="lazy"
                alt={'Illustration version ' + asset.id.slice(0, 8)}/>
              <small>{asset.origin === 'comfyui' ? 'ComfyUI' : 'Imported'}
                {asset.seed != null ? ' · Seed ' + asset.seed : ''}</small>
              {!!asset.render_details?.loras?.length && <small>
                LoRAs: {asset.render_details.loras.map(lora =>
                  lora.lora_name + ' (' + lora.strength + ')').join(', ')}
              </small>}
              <button disabled={visualBusy || asset.selected}
                onClick={() => void chooseArtwork(asset.id)}>
                {asset.selected ? 'In use' : 'Use this version'}</button>
            </div>)}
          </div>}
          <button className="secondary-button" disabled={updating}
            onClick={() => fileRef.current?.click()}><UploadCloud size={16}/> Import illustration</button>
          {imageMode !== 'off' && <>
            <label className="noble-inspector-field">Describe the scene to illustrate
              <textarea rows={4} minLength={8} maxLength={2400}
                value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
                placeholder="Characters, location, lighting, expression, and visual style..."/></label>
            <label className="noble-inspector-field">Reference image (optional)
              <select aria-label="Visual reference" value={referenceAssetId}
                onChange={e => setReferenceAssetId(e.target.value)}>
                <option value="">No reference · text to image</option>
                {visual?.assets.map(asset =>
                  <option key={asset.id} value={asset.id}>
                    {asset.origin === 'comfyui' ? 'AI illustration' : 'Imported'}
                    {' · '}{asset.id.slice(0, 8)}
                    {asset.selected ? ' (current)' : ''}
                  </option>)}
              </select>
            </label>
            {referenceAssetId && <>
              <label className="noble-inspector-field">
                Reference transformation · {Math.round(denoise * 100)}%
                <input aria-label="Transformation strength" type="range"
                  min={0.2} max={0.95} step={0.05} value={denoise}
                  onChange={e => setDenoise(Number(e.target.value))}/>
              </label>
              <p className="noble-inspector-hint">
                ComfyUI uses this image as an img2img starting point. Lower denoise usually preserves more composition but does not guarantee facial identity.
              </p>
            </>}
            <label className="noble-inspector-field">Seed (optional, for reproducible results)
              <input aria-label="Image seed" type="number" min={0} step={1}
                value={imageSeed} onChange={e => setImageSeed(e.target.value)}
                placeholder="Random if left blank"/></label>
            <button className="secondary-button" disabled={visualBusy || imagePrompt.trim().length < 8}
              onClick={() => void previewIllustrationPrompt()}>View complete prompt and profiles</button>
            {previewPrompt && <div className="noble-prompt-preview">
              <strong>Prompt sent to ComfyUI</strong><p>{previewPrompt}</p>
            </div>}
            <div className="noble-inspector-field">
              <label>
                <input type="checkbox" aria-label="Apply character LoRAs"
                  checked={applyCharacterLoras}
                  onChange={e => setApplyCharacterLoras(e.target.checked)}/>
                {' '}Apply LoRAs for present characters (optional)
              </label>
              <p className="noble-inspector-hint">
                Only LoRAs configured in Creator Studio and installed in ComfyUI are used, up to three. They apply to the whole model, not independent regions for each character. No models are downloaded.
              </p>
              <button className="secondary-button" disabled={checkingLoras || illustrating}
                onClick={() => void checkInstalledLoras()}>
                {checkingLoras ? 'Checking ComfyUI...' : 'View installed LoRAs'}
              </button>
              {loraStatus && <p className="noble-inspector-hint" role="status">
                {loraStatus.online
                  ? loraStatus.loras.length + ' ' +
                    (loraStatus.loras.length === 1 ? 'LoRA' : 'LoRAs') +
                    ' available in ComfyUI' +
                    (loraStatus.loras.length
                      ? ': ' + loraStatus.loras.slice(0, 6).join(', ') +
                        (loraStatus.loras.length > 6 ? '…' : '')
                      : '.')
                  : 'Could not check ComfyUI: ' + (loraStatus.error || 'offline')}
              </p>}
            </div>
            <label className="noble-inspector-field">
              <span>Ignore minimum free VRAM reserve for this request only</span>
              <input type="checkbox" checked={allowLowVram}
                onChange={e => setAllowLowVram(e.target.checked)}/>
            </label>
            <button className="primary-button" disabled={illustrating || imagePrompt.trim().length < 8}
              onClick={() => void illustrateScene()}>
              {illustrating ? <LoaderCircle className="rotating" size={16}/> : <Image size={16}/>}
              {illustrating ? 'ComfyUI is generating...' : 'Illustrate scene with ComfyUI'}</button>
          </>}
          {illustrationNotice && <p role="status" className="narrative-saved">{illustrationNotice}</p>}
          <p className="noble-inspector-hint">Illustrations are generated only when requested. Connect ComfyUI and configure a checkpoint under Settings → Images. Stories remain playable without images.</p>
        </>}
        {tab === 'reader' && <>
          <h4>Reader layout</h4>
          <p>Three views share the same saved turns. VN highlights artwork, Book prioritizes prose, and Chat separates player actions from narration. The selected view persists across restarts.</p>
          {prefs && <div className="noble-reader-layout-options">
            <button className={prefs.reader_layout === 'immersive' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'immersive'}
              disabled={updating} onClick={() => void changeReaderLayout('immersive')}>
              <Palette size={17}/> VN</button>
            <button className={prefs.reader_layout === 'classic' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'classic'}
              disabled={updating} onClick={() => void changeReaderLayout('classic')}>
              <BookOpen size={17}/> Book</button>
            <button className={prefs.reader_layout === 'chat' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'chat'}
              disabled={updating} onClick={() => void changeReaderLayout('chat')}>
              <MessageSquareText size={17}/> Chat</button>
          </div>}
          <p className="noble-inspector-hint">When focus is outside an input: Alt+1 VN, Alt+2 Book, Alt+3 Chat, Alt+B backlog, Alt+H hide interface. Esc closes the backlog or restores the interface when shortcuts are enabled.</p>
          <button className="secondary-button" onClick={() => setBacklogOpen(true)}>
            <History size={16}/> Open reading backlog
          </button>
          {voiceEnabled && <label className="noble-inspector-field">Narrator voice
            <select value={voiceId} disabled={synthesizing} onChange={e => setVoiceId(e.target.value)}>
              {voices?.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </label>}
          <p className="noble-inspector-hint">{voiceEnabled ?
            (voices?.available && voices.voices.length ? 'Piper synthesizes only when you select Listen.' :
              'Install Piper and add an ONNX voice under Settings → Voice / TTS.') :
            'Speech is disabled. Enable it under Settings → Voice / TTS.'}</p>
          <button className="secondary-button" onClick={onSettings}><Cpu size={16}/> More settings</button>
        </>}
      </div>
    </aside>
    {inspectorOpen && <button className="noble-inspector-backdrop"
      aria-label="Close details panel" onClick={() => setInspectorOpen(false)}/>}
    {backlogOpen && <div className="noble-backlog-scrim">
      <section className="noble-backlog-dialog" role="dialog" aria-modal="true"
        aria-label="Story backlog">
        <header className="noble-backlog-heading">
          <div><span className="overline"><History size={15}/> READING HISTORY</span>
            <h2>Story backlog</h2>
            <p>{turns.length} scenes loaded from this route. Turns from other branches are not mixed in.</p></div>
          <button className="icon-button" aria-label="Close backlog"
            onClick={() => setBacklogOpen(false)}><X size={19}/></button>
        </header>
        <label className="noble-backlog-search">Search loaded scenes
          <input type="search" aria-label="Search backlog" maxLength={150}
            value={backlogQuery} onChange={event => setBacklogQuery(event.target.value)}
            placeholder="Player action, dialogue, or narration..."/>
        </label>
        <div className="noble-backlog-entries">
          {backlogItems.map(turn => <article key={turn.id} className="noble-backlog-entry">
            <div><strong>{turn.mode === 'say' ? 'Dialogue' :
              turn.mode === 'do' ? 'Action' : turn.mode === 'story' ? 'Direction' : 'Continuation'}
              {' · '}{active.protagonist_name}</strong>
              <button className="secondary-button" onClick={() => {
                setBacklogOpen(false); focusTurn(turn);
              }}>Go to scene</button></div>
            {turn.input_text && <p className="noble-backlog-player">{turn.input_text}</p>}
            <p className="noble-backlog-narrator"><NarrativeText text={turn.assistant_text}/></p>
          </article>)}
          {!backlogItems.length && <p className="noble-backlog-empty">
            {turns.length ? 'No matches in the loaded scenes.' :
              'No scenes saved on this branch yet.'}
          </p>}
        </div>
      </section>
    </div>}
    {rewindTurn && <div className="noble-rewind-scrim" role="presentation">
      <section className="noble-rewind-dialog" role="dialog"
        aria-modal="true" aria-label="Confirm rewind">
        <div className="noble-rewind-header">
          <div><span className="overline"><RotateCcw size={15}/> TIMELINE</span>
            <h2>Return to this point</h2></div>
          <button className="icon-button" aria-label="Cancel rewind"
            onClick={() => setRewindTurn(null)}><X size={19}/></button>
        </div>
        <p>A <strong>separate branch</strong> will be created from the selected turn. The original story and all later turns remain intact.</p>
        <div className="noble-rewind-selected">
          <strong>Turn {turns.findIndex(t => t.id === rewindTurn.id) + 1}</strong>
          <p>{rewindTurn.input_text || rewindTurn.assistant_text.slice(0, 180)}</p>
          <small>{Math.max(0, turns.length - turns.findIndex(t => t.id === rewindTurn.id) - 1)}
            {' '}later turn(s) will remain only in the original branch.</small>
        </div>
        <div className="noble-rewind-checkpoint" role="status">
          {rewindLoading || !rewindPreview ?
            <span><LoaderCircle className="rotating" size={15}/> Checking saved snapshots...</span> :
            <>
              <div><BookOpen size={15}/>
                {rewindPreview.lore ?
                  `Historical Lorebook: ${rewindPreview.lore.entries.length} ${rewindPreview.lore.entries.length === 1 ? 'entry' : 'entries'}` :
                  'Historical Lorebook unavailable: current secrets will not be inherited'}
              </div>
              <div><GitBranch size={15}/>
                {rewindPreview.world ?
                  `World state: ${rewindPreview.world.state.location || 'no confirmed location'}` :
                  'Historical state unavailable: the state will be empty'}
              </div>
            </>}
        </div>
        <div className="noble-rewind-actions">
          <button className="secondary-button" onClick={() => setRewindTurn(null)}>
            Stay here
          </button>
          <button className="primary-button" disabled={rewindLoading || generating || updating}
            onClick={() => {
              const selected = rewindTurn.id;
              setRewindTurn(null);
              setInspectorOpen(false);
              onFork(selected);
            }}><GitBranch size={16}/> Create branch from this turn</button>
        </div>
      </section>
    </div>}
    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
      aria-label="Upload scene illustration" onChange={e => {
        const file = e.target.files?.[0];
        void upload(file);
        e.target.value = '';
      }}/>
  </div>;
}
