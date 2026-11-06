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
  { id: 'summary', label: 'Resumen' }, { id: 'history', label: 'Historial' },
  { id: 'gallery', label: 'Galería' }, { id: 'reader', label: 'UI/UX' },
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
  const [name, setName] = useState(active?.protagonist_name || 'Protagonista');
  const [canon, setCanon] = useState(active?.canon || '');
  const [shortcuts, setShortcuts] = useState(true);
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setName(active?.protagonist_name || 'Protagonista'); }, [active?.id, active?.protagonist_name]);
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
    Promise.all([api.settings(), api.speechVoices()]).then(([settings, voiceList]) => {
      if (!live) return;
      setImageMode(settings.image_mode); setVoiceEnabled(settings.tts_enabled);
      setVoices(voiceList);
      setVoiceId(previous => previous || voiceList.voices[0]?.id || '');
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
      } else if (!updating && (key === '1' || key === '2' || key === '3')) {
        event.preventDefault();
        void changeReaderLayout(key === '1' ? 'immersive' : key === '2' ? 'classic' : 'chat');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts, backlogOpen, hudHidden, updating, prefs]);

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
      setIllustrationNotice('Plan de escena guardado. Se utilizará para las próximas ilustraciones.');
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
      setIllustrationNotice('Fondo reutilizado desde la galería. No se ejecutó ComfyUI.');
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
        throw new Error('La semilla debe ser un número entero positivo.');
      const result = await api.illustrate(requestedStoryId, imagePrompt.trim(), seed,
        referenceAssetId || undefined, referenceAssetId ? denoise : undefined,
        allowLowVram, applyCharacterLoras);
      const loraInfo = result.applied_loras?.length
        ? ' LoRAs aplicados: ' + result.applied_loras.map(lora => lora.lora_name).join(', ') + '.'
        : '';
      setIllustrationNotice((result.cached ? 'Ilustración recuperada de la caché.' :
        'Ilustración nueva guardada como versión independiente.') + loraInfo);
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
  const inputLabel = mode === 'say' ? 'Escribe lo que dice tu protagonista...' :
    mode === 'story' ? 'Dirige lo que sucede a continuación...' :
    'Describe lo que hace tu protagonista...';

  if (!active) return <div className="story-start-screen noble-reader-empty">
    <div className="story-start-icon"><BookOpen size={34}/></div>
    <h2>Una nueva historia te espera.</h2>
    <p>Elige un mundo, define tu protagonista y comienza. Las escenas y los diálogos se guardarán en tu biblioteca local.</p>
    <button className="primary-button" onClick={onCreate}><Sparkles size={17}/> Crear mi primera historia</button>
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
      aria-label={hudHidden ? 'Mostrar interfaz del lector' : 'Ocultar interfaz del lector'}
      title={hudHidden ? 'Mostrar interfaz (Alt+H)' : 'Ocultar interfaz (Alt+H)'}
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
            alt={'Personaje presente: ' + sprite.label +
              ' · emoción ' + sprite.expression + ' · pose ' + sprite.pose}/>)}
        </div>}
        {!displayedBackground && <div className="noble-scene-empty">
          <Image size={34}/><strong>Tu escena, tu mundo</strong>
          <p>Agrega una ilustración para acompañar la lectura.</p>
        </div>}
        {turns.length > 0 && <div className="noble-vn-subtitle" role="note"
          aria-label="Última intervención de la escena">
          <strong>Narrador</strong>
          <p>{turns[turns.length - 1].assistant_text.slice(-320)}</p>
        </div>}
        <div className="noble-scene-bottom">
          <span className="overline">NOBLE VISUAL NOVEL</span>
          <h3>{active.title}</h3>
          {currentSceneMedia?.selection === 'caption_match' &&
            <small className="noble-visual-caption">Recursos del creador según la escena</small>}
          <p><UserRound size={14}/>{active.protagonist_name}</p>
          <button className="noble-scene-upload" disabled={updating}
            onClick={() => fileRef.current?.click()}><Camera size={15}/>
            {active.scene_image_url ? 'Cambiar escena' : 'Añadir ilustración'}</button>
          {imageMode !== 'off' && <button className="noble-scene-upload"
            onClick={() => { setTab('gallery'); setInspectorOpen(true); }}>
            <Image size={15}/> Ilustrar con IA</button>}
        </div>
      </div>
    </aside>

    <article className="noble-reader-main">
      <header className="noble-reader-toolbar">
        <span className="noble-reader-chapter">CAPÍTULO 01 <span>·</span> {active.title}</span>
        <div className="noble-reader-toolbar-actions">
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.html'}
            download="noble-story.html" title="Exportar historia a HTML ilustrado"
            aria-label="Exportar historia HTML"><Download size={17}/></a>
          <a href={'/api/v1/stories/' + encodeURIComponent(active.id) + '/export.epub'}
            download="noble-story.epub" title="Exportar historia EPUB compatible con lectores"
            aria-label="Exportar historia EPUB"><BookOpen size={17}/></a>
          <button title="Consultar backlog (Alt+B)" aria-label="Abrir backlog"
            onClick={() => setBacklogOpen(true)}><History size={17}/></button>
          <button title="Mostrar panel de historia" aria-label="Abrir información de historia"
            onClick={() => setInspectorOpen(open => !open)}><Eye size={17}/></button>
          <button title="Configurar narrador" aria-label="Configurar narrador" onClick={onSettings}>
            <Settings2 size={18}/></button>
        </div>
      </header>
      <div className="noble-reader-prose" aria-live="polite">
        <div className="noble-reader-intro"><Sparkles size={17}/>
          <div><span>LA HISTORIA COMIENZA</span><p>{playerPlot || active.premise}</p></div></div>
        {turns.map((turn, i) => <section className="noble-reading-turn"
          id={'noble-turn-' + turn.id} key={turn.id}>
          <small>ESCENA {String(i + 1).padStart(2, '0')}</small>
          <div className="noble-reader-user">
            <span>{turn.mode === 'say' ? 'DICES' : turn.mode === 'do' ? 'HACES' :
              turn.mode === 'continue' ? 'CONTINÚA' : 'DIRECCIÓN'}</span>
            <p>{turn.input_text || 'La historia continúa...'}</p>
          </div>
          <p className="noble-narration"><NarrativeText text={turn.assistant_text}/></p>
          <div className="noble-turn-caption">{turn.model}
            {voiceEnabled && <button className="noble-turn-listen"
              disabled={synthesizing || !voices?.available || !voiceId}
              onClick={() => void listen(turn)}><Volume2 size={14}/>
              {playingTurn === turn.id ? 'Detener' : synthesizing ? 'Sintetizando...' : 'Escuchar'}</button>}
          </div>
        </section>)}
        {generating && <div className="noble-reader-stream">
          <span><LoaderCircle className="rotating" size={15}/> {generationMessage} · {elapsed}s</span>
          <button className="noble-cancel-stream" onClick={onCancel}><Square size={13}/> Detener generación</button>
          <p><NarrativeText text={streamText || 'Conectando con el motor...'}/></p></div>}
        {!generating && turns.length === 0 && <div className="noble-reader-empty-turn">
          <Feather size={26}/><strong>La primera página está en blanco.</strong>
          <p>Habla como {active.protagonist_name}, describe lo que haces o pulsa Continuar.</p>
        </div>}
        <div ref={tail}/>
      </div>
      <footer className="noble-reader-compose">
        {notice && <p className="story-notice"><Check size={15}/>{notice}</p>}
        {(error || readerError) && <div role="alert" className="story-error">
          {error || readerError} <button onClick={onSettings}>Revisar ajustes <ArrowRight size={13}/></button></div>}
        <div className="noble-reader-mode">
          <span>Habla como {active.protagonist_name} o decide qué sucede</span>
          <select value={mode} disabled={generating} aria-label="Modo de narración"
            onChange={e => setMode(e.target.value as StoryTurn['mode'])}>
            <option value="do">Hacer</option><option value="say">Decir</option>
            <option value="story">Narrar</option>
          </select>
        </div>
        <textarea aria-label="Tu intervención en la historia" value={draft}
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
            <MessageSquareText size={15}/> Los diálogos quedan guardados en tu historia
          </div>
          <button className="secondary-button" disabled={generating}
            onClick={() => onSubmit(true)}><Sparkles size={15}/> Continuar</button>
          <button className="primary-button" disabled={generating || !draft.trim()}
            onClick={() => onSubmit(false)}>
            {generating ? <LoaderCircle className="rotating" size={15}/> : <Send size={15}/>}
            {generating ? 'Generando...' : 'Enviar'}</button>
        </div>
      </footer>
    </article>

    <aside className={'noble-reader-inspector ' + (inspectorOpen ? 'is-open' : '')}>
      <header className="noble-inspector-header"><div><span className="overline">MI HISTORIA</span>
        <h3>{active.title}</h3></div>
        <button aria-label="Cerrar información" onClick={() => setInspectorOpen(false)}>
          <X size={18}/></button></header>
      <nav className="noble-inspector-tabs" aria-label="Panel de novela visual">
        {tabs.map(item => <button key={item.id}
          className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>
          {item.label}</button>)}
      </nav>
      <div className="noble-inspector-body">
        {tab === 'summary' && <>
          <h4>Resumen</h4><p>{active.premise}</p>
          <h4>Protagonista</h4>
          <div className="noble-protagonist-card">
            <div className="noble-protagonist-avatar">{active.protagonist_name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{active.protagonist_name}</strong><small>Personaje del jugador</small></div>
          </div>
          <label className="noble-inspector-field">Nombre del personaje
            <input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label>
          <button className="secondary-button" disabled={updating || !name.trim() || name.trim() === active.protagonist_name}
            onClick={() => void saveName()}><Check size={15}/> Guardar nombre</button>
          <h4>Canon y memoria permanente</h4>
          <p>Personajes, relaciones, lugares y hechos que el narrador debe recordar en capítulos futuros.</p>
          <label className="noble-inspector-field">Reglas y acontecimientos confirmados
            <textarea aria-label="Canon de la historia" rows={6} maxLength={5000}
              value={canon} onChange={e => setCanon(e.target.value)}
              placeholder="Ejemplo: Aira conoce el secreto del castillo. Nadie más lo sabe todavía."/></label>
          <button className="secondary-button" disabled={updating || canon === (active.canon || '')}
            onClick={() => void saveCanon()}><Check size={15}/> Guardar canon</button>
          <h4>Estado</h4>
          <p>{turns.length} escenas guardadas · último modelo: {turns.at(-1)?.model || 'Sin iniciar'}</p>
          <h4>Fichas de identidad visual</h4>
          <p>Establece rasgos y vestuario para mantenerlos en cada prompt de ComfyUI.</p>
          {visual?.characters.map(person =>
            <button className="noble-character-entry" key={person.id}
              onClick={() => editVisualCharacter(person)} title="Editar ficha visual">
              <span>{person.name}</span><small>Revisión {person.revision} · Editar</small>
            </button>)}
          <label className="noble-inspector-field">Nombre del personaje
            <input value={character.name} maxLength={80} aria-label="Nombre visual"
              onChange={e => setCharacter(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="noble-inspector-field">Apariencia consistente
            <textarea value={character.appearance} maxLength={1500} rows={4}
              aria-label="Apariencia visual" placeholder="Cabello, ojos, edad aparente, silueta, especie..."
              onChange={e => setCharacter(x => ({ ...x, appearance: e.target.value }))}/></label>
          <label className="noble-inspector-field">Vestuario
            <input value={character.outfit} maxLength={650} aria-label="Vestuario visual"
              onChange={e => setCharacter(x => ({ ...x, outfit: e.target.value }))}/></label>
          <label className="noble-inspector-field">Rasgos distintivos
            <input value={character.distinguishing_features} maxLength={650} aria-label="Rasgos visuales"
              onChange={e => setCharacter(x => ({ ...x, distinguishing_features: e.target.value }))}/></label>
          <button className="secondary-button"
            disabled={visualBusy || character.appearance.trim().length < 12 || !character.name.trim()}
            onClick={() => void saveCharacter()}>
            <Check size={15}/>{editingCharacterId ? 'Guardar ficha visual' : 'Añadir personaje visual'}
          </button>
          {editingCharacterId && <div className="noble-prompt-preview">
            <strong>Imagen de identidad para este personaje</strong>
            <p>Asocia una ilustración importada o generada. El plan de escena puede usarla
              como referencia de img2img cuando el personaje aparezca.</p>
            <label className="noble-inspector-field">Referencia guardada
              <select aria-label="Referencia del personaje" value={characterReferenceId}
                onChange={e => setCharacterReferenceId(e.target.value)}>
                <option value="">Sin imagen asignada</option>
                {visual?.assets.map(asset => <option key={asset.id} value={asset.id}>
                  {asset.origin === 'comfyui' ? 'Generada' : 'Importada'} · {asset.id.slice(0, 8)}
                </option>)}
              </select>
            </label>
            {characterReferenceId && visual?.assets.some(asset => asset.id === characterReferenceId) &&
              <img className="noble-character-reference-preview"
                src={visual.assets.find(asset => asset.id === characterReferenceId)?.url}
                alt={'Referencia visual del personaje ' + character.name}/>}
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveCharacterReference()}>Guardar referencia visual</button>
          </div>}
          {editingCharacterId && <button className="secondary-button" onClick={() => {
            setEditingCharacterId(null);
            setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
          }}>Cancelar edición</button>}

          {active.origin_story_id && <p className="noble-inspector-hint">
            Esta historia es una rama independiente. Las decisiones futuras no modifican la original.
          </p>}
        </>}
        {tab === 'history' && <>
          <h4>Buscar recuerdos de la historia</h4>
          <p className="noble-inspector-hint">Busca intervenciones antiguas del jugador, incluso
            fuera de la ventana de los últimos turnos. No incluye secretos internos ni
            declaraciones generadas por la IA. La búsqueda se limita a esta rama.</p>
          <label className="noble-inspector-field">Buscar recuerdos de la historia
            <input aria-label="Buscar recuerdos de la historia" value={memoryQuery}
              maxLength={500} placeholder="medallón, biblioteca, promesa..."
              onChange={e => { setMemoryQuery(e.target.value); setMemoryResults(null); }}/>
          </label>
          <button className="secondary-button" disabled={memoryBusy || memoryQuery.trim().length < 2}
            onClick={() => void findStoryMemory()}>
            {memoryBusy ? <LoaderCircle size={15} className="rotating"/> : <BookOpen size={15}/>}
            Buscar en toda la historia
          </button>
          {memoryError && <p role="alert" className="narrative-error">{memoryError}</p>}
          {memoryResults && <div role="status" className="creator-hint">
            <strong>{memoryResults.episodes.length} recuerdos encontrados</strong>
            <p>{memoryResults.fts5 ? 'Índice SQLite FTS5' : 'Búsqueda léxica local'}
              · Solo intervenciones del jugador</p>
            {memoryResults.episodes.map(entry => <div className="noble-inspector-turn" key={entry.turn_id}>
              <p>{entry.input_text}</p>
              {turns.some(turn => turn.id === entry.turn_id) &&
                <button className="secondary-button" onClick={() => {
                  const turn = turns.find(turn => turn.id === entry.turn_id);
                  if (turn) focusTurn(turn);
                }}>Ver escena</button>}
            </div>)}
          </div>}
          <h4>Historial de escenas</h4>
          {turns.length ? turns.map((turn, i) =>
            <div key={turn.id} className="noble-inspector-turn">
              <button className="noble-inspector-turn-jump" onClick={() => focusTurn(turn)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{turn.input_text || 'Continuación automática'}</strong><ChevronRight size={15}/>
              </button>
              <button className="noble-inspector-branch" disabled={generating || updating}
                title="Rebobinar de forma segura sin modificar la historia original"
                onClick={() => setRewindTurn(turn)}><RotateCcw size={14}/> Rebobinar aquí</button>
            </div>) : <p>Todavía no se han generado escenas.</p>}
        </>}
        {tab === 'gallery' && <>
          <h4>Escena y localización</h4>
          {visual && <p className="noble-inspector-hint">
            {visual.current_scene.detection === 'heuristic' ?
              'Cambio detectado por texto: verifica que el lugar sea correcto.' :
              'Ubicación registrada para esta historia.'}
            {' '}Escenas registradas: {visual.scenes.length}.
          </p>}
          <label className="noble-inspector-field">Lugar actual
            <input aria-label="Lugar actual" value={sceneLocation} maxLength={120}
              onChange={e => setSceneLocation(e.target.value)}/></label>
          <button className="secondary-button" disabled={visualBusy || sceneLocation.trim().length < 2}
            onClick={() => void saveSceneLocation()}><Check size={15}/> Confirmar escenario</button>
          <h4>Plan de la ilustración</h4>
          <p className="noble-inspector-hint">Puedes planificar cada escena antes de solicitar
            una imagen. El reparto seleccionado se conserva por escenario.</p>
          {scenePlan && <>
            <label className="noble-inspector-field">Tipo de plano
              <select aria-label="Plano de escena" value={scenePlan.shot}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, shot: e.target.value as ScenePlan['shot'],
                } : plan)}>
                <option value="wide">General</option>
                <option value="medium">Medio</option>
                <option value="closeup">Primer plano</option>
              </select>
            </label>
            <label className="noble-inspector-field">Iluminación de escena
              <select aria-label="Luz de escena" value={scenePlan.lighting}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, lighting: e.target.value as ScenePlan['lighting'],
                } : plan)}>
                <option value="natural">Natural</option>
                <option value="sunset">Atardecer</option>
                <option value="night">Noche</option>
                <option value="interior">Interior</option>
                <option value="dramatic">Dramática</option>
              </select>
            </label>
            <label className="noble-inspector-field">Atmósfera
              <input aria-label="Atmósfera visual" maxLength={160} value={scenePlan.mood}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, mood: e.target.value,
                } : plan)}/></label>
            <label className="noble-inspector-field">Composición y acción
              <textarea aria-label="Dirección de escena" rows={3} maxLength={900}
                value={scenePlan.direction}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, direction: e.target.value,
                } : plan)}/></label>
            <p className="noble-inspector-hint">Personajes visibles (máximo 6)</p>
            {visual?.characters.map(person => <label key={person.id}
                className="noble-inspector-field noble-cast-choice">
              <input type="checkbox" aria-label={'Personaje visible ' + person.name}
                disabled={!scenePlan.visible_character_ids.includes(person.id) &&
                  scenePlan.visible_character_ids.length >= 6}
                checked={scenePlan.visible_character_ids.includes(person.id)}
                onChange={e => toggleVisibleCharacter(person.id, e.target.checked)}/>
              {person.name}
            </label>)}
            <label className="noble-inspector-field">Personaje de referencia
              <select aria-label="Foco visual" value={scenePlan.reference_character_id || ''}
                onChange={e => setScenePlan(plan => plan ? {
                  ...plan, reference_character_id: e.target.value || null,
                } : plan)}>
                <option value="">Sin referencia automática</option>
                {visual?.characters.filter(person =>
                  scenePlan.visible_character_ids.includes(person.id)).map(person =>
                  <option key={person.id} value={person.id}>
                    {person.name}{person.reference_asset_id ? ' · imagen asignada' : ' · solo texto'}
                  </option>)}
              </select>
            </label>
            <button className="secondary-button" disabled={visualBusy}
              onClick={() => void saveComposition()}>
              <Check size={15}/> Guardar plan de escena
            </button>
          </>}
          <h4>Director visual y caché de fondos</h4>
          <p className="noble-inspector-hint">Decide de forma determinista si reutilizar un
            fondo importado o recomendar arte nuevo. El contexto incluye lugar, hora,
            clima, plano y luz; la emoción no cambia la clave de fondo.
            Ninguna evaluación ejecuta modelos.</p>
          <label className="noble-inspector-field">Tipo de cambio visual
            <select aria-label="Intención visual del director" value={directorIntent}
              onChange={event => {
                setDirectorIntent(event.target.value as VisualDirectorIntent);
                setDirectorPreview(null);
              }}>
              <option value="auto">Automático / mismo escenario</option>
              <option value="background">Buscar fondo</option>
              <option value="emotion">Cambiar expresión del personaje</option>
              <option value="event">Ilustración especial de evento</option>
            </select>
          </label>
          <button className="secondary-button" disabled={directorBusy}
            onClick={() => void inspectVisualDirector()}>
            <Palette size={16}/> {directorBusy ? 'Evaluando...' : 'Evaluar director visual'}
          </button>
          {directorError && <p className="narrative-error" role="alert">{directorError}</p>}
          {directorPreview && <div className="noble-director-result" role="status">
            <strong>{({
              REUSE_BACKGROUND: 'Reutilizar fondo',
              UPDATE_SPRITE_EMOTION: 'Actualizar expresión del personaje',
              GENERATE_NEW_BACKGROUND: 'Preparar un fondo nuevo',
              GENERATE_EVENT_CG: 'Proponer ilustración especial de evento',
            } as const)[directorPreview.action]}</strong>
            <p>{directorPreview.reason}</p>
            <small>Contexto: {directorPreview.context.location || 'sin lugar'}
              {' · '}{directorPreview.context.time_of_day || 'hora no confirmada'}
              {' · '}{directorPreview.context.weather || 'clima no confirmado'}
              {' · '}{directorPreview.context.shot}
              {' · '}{directorPreview.context.lighting}</small>
            {directorPreview.background_cached && directorPreview.background_asset_id &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void reuseDirectorBackground()}>
                <Image size={16}/> Reutilizar fondo sin generar
              </button>}
            {!directorPreview.background_cached && visual?.selected_asset_id &&
              visual.assets.some(asset => asset.id === visual.selected_asset_id &&
                asset.origin === 'manual') &&
              <button className="secondary-button" disabled={directorBusy}
                onClick={() => void registerDirectorBackground(visual.selected_asset_id!)}>
                <Check size={16}/> Registrar fondo manual para este contexto
              </button>}
            <p className="noble-inspector-hint">El director prepara decisiones.
              Las emociones y CG requieren sprites o generación por separado;
              no se ha producido ninguna imagen automáticamente. Un recurso de
              Creator Studio con coincidencia de pie de foto puede tener prioridad visual.</p>
          </div>}
          <h4>Galería versionada ({visual?.assets.length || 0})</h4>
          {active.scene_image_url ? <img className="noble-gallery-image"
            src={active.scene_image_url} alt={'Ilustración de ' + active.title}/> :
            <p>Aún no hay una ilustración en esta historia.</p>}
          {!!visual?.assets.length && <div className="noble-version-gallery">
            {visual.assets.map(asset => <div key={asset.id} className={'noble-art-version ' +
              (asset.selected ? 'is-selected' : '')}>
              <img src={asset.url} loading="lazy"
                alt={'Versión ilustrada ' + asset.id.slice(0, 8)}/>
              <small>{asset.origin === 'comfyui' ? 'ComfyUI' : 'Importada'}
                {asset.seed != null ? ' · Seed ' + asset.seed : ''}</small>
              {!!asset.render_details?.loras?.length && <small>
                LoRAs: {asset.render_details.loras.map(lora =>
                  lora.lora_name + ' (' + lora.strength + ')').join(', ')}
              </small>}
              <button disabled={visualBusy || asset.selected}
                onClick={() => void chooseArtwork(asset.id)}>
                {asset.selected ? 'En uso' : 'Usar esta versión'}</button>
            </div>)}
          </div>}
          <button className="secondary-button" disabled={updating}
            onClick={() => fileRef.current?.click()}><UploadCloud size={16}/> Importar ilustración</button>
          {imageMode !== 'off' && <>
            <label className="noble-inspector-field">Describe la escena que quieres ilustrar
              <textarea rows={4} minLength={8} maxLength={2400}
                value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
                placeholder="Personajes, lugar, luz, expresión y estilo visual..."/></label>
            <label className="noble-inspector-field">Imagen de referencia (opcional)
              <select aria-label="Referencia visual" value={referenceAssetId}
                onChange={e => setReferenceAssetId(e.target.value)}>
                <option value="">Sin referencia · texto a imagen</option>
                {visual?.assets.map(asset =>
                  <option key={asset.id} value={asset.id}>
                    {asset.origin === 'comfyui' ? 'Ilustración IA' : 'Importada'}
                    {' · '}{asset.id.slice(0, 8)}
                    {asset.selected ? ' (actual)' : ''}
                  </option>)}
              </select>
            </label>
            {referenceAssetId && <>
              <label className="noble-inspector-field">
                Transformación de la referencia · {Math.round(denoise * 100)}%
                <input aria-label="Intensidad de transformación" type="range"
                  min={0.2} max={0.95} step={0.05} value={denoise}
                  onChange={e => setDenoise(Number(e.target.value))}/>
              </label>
              <p className="noble-inspector-hint">
                ComfyUI usará esta imagen como punto de partida (img2img).
                Un valor bajo conserva más la composición; no garantiza identidad facial.
              </p>
            </>}
            <label className="noble-inspector-field">Semilla (opcional para reproducir y reutilizar)
              <input aria-label="Semilla de imagen" type="number" min={0} step={1}
                value={imageSeed} onChange={e => setImageSeed(e.target.value)}
                placeholder="Aleatoria si se deja vacía"/></label>
            <button className="secondary-button" disabled={visualBusy || imagePrompt.trim().length < 8}
              onClick={() => void previewIllustrationPrompt()}>Ver prompt completo y fichas</button>
            {previewPrompt && <div className="noble-prompt-preview">
              <strong>Prompt que recibirá ComfyUI</strong><p>{previewPrompt}</p>
            </div>}
            <div className="noble-inspector-field">
              <label>
                <input type="checkbox" aria-label="Aplicar LoRAs de personajes"
                  checked={applyCharacterLoras}
                  onChange={e => setApplyCharacterLoras(e.target.checked)}/>
                {' '}Aplicar LoRAs de los personajes presentes (opcional)
              </label>
              <p className="noble-inspector-hint">
                Solo se usarán LoRAs configurados en Creator Studio e instalados en
                ComfyUI, con un máximo de tres. Se aplican al modelo completo,
                no a regiones separadas de cada personaje. No se descargan modelos.
              </p>
              <button className="secondary-button" disabled={checkingLoras || illustrating}
                onClick={() => void checkInstalledLoras()}>
                {checkingLoras ? 'Consultando ComfyUI...' : 'Ver LoRAs instalados'}
              </button>
              {loraStatus && <p className="noble-inspector-hint" role="status">
                {loraStatus.online
                  ? loraStatus.loras.length + ' LoRAs disponibles en ComfyUI' +
                    (loraStatus.loras.length
                      ? ': ' + loraStatus.loras.slice(0, 6).join(', ') +
                        (loraStatus.loras.length > 6 ? '…' : '')
                      : '.')
                  : 'No se pudo consultar ComfyUI: ' + (loraStatus.error || 'sin conexión')}
              </p>}
            </div>
            <label className="noble-inspector-field">
              <span>Ignorar la reserva mínima de VRAM solo para esta solicitud</span>
              <input type="checkbox" checked={allowLowVram}
                onChange={e => setAllowLowVram(e.target.checked)}/>
            </label>
            <button className="primary-button" disabled={illustrating || imagePrompt.trim().length < 8}
              onClick={() => void illustrateScene()}>
              {illustrating ? <LoaderCircle className="rotating" size={16}/> : <Image size={16}/>}
              {illustrating ? 'ComfyUI está generando...' : 'Ilustrar escena con ComfyUI'}</button>
          </>}
          {illustrationNotice && <p role="status" className="narrative-saved">{illustrationNotice}</p>}
          <p className="noble-inspector-hint">Las ilustraciones se generan solo cuando las solicitas. Requiere ComfyUI conectado y un checkpoint configurado en Ajustes → Imágenes y voz. La historia puede continuar sin imágenes.</p>
        </>}
        {tab === 'reader' && <>
          <h4>Presentación de lectura</h4>
          <p>Tres vistas sobre los mismos turnos guardados. VN muestra ilustraciones,
            Libro prioriza la narración y Chat distingue la intervención del jugador.
            El modo se conserva al reiniciar.</p>
          {prefs && <div className="noble-reader-layout-options">
            <button className={prefs.reader_layout === 'immersive' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'immersive'}
              disabled={updating} onClick={() => void changeReaderLayout('immersive')}>
              <Palette size={17}/> VN</button>
            <button className={prefs.reader_layout === 'classic' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'classic'}
              disabled={updating} onClick={() => void changeReaderLayout('classic')}>
              <BookOpen size={17}/> Libro</button>
            <button className={prefs.reader_layout === 'chat' ? 'selected' : ''}
              aria-pressed={prefs.reader_layout === 'chat'}
              disabled={updating} onClick={() => void changeReaderLayout('chat')}>
              <MessageSquareText size={17}/> Chat</button>
          </div>}
          <p className="noble-inspector-hint">Atajos cuando el cursor no está en un campo:
            Alt+1 VN, Alt+2 Libro, Alt+3 Chat, Alt+B backlog, Alt+H ocultar interfaz.
            Esc cierra el backlog o restaura la interfaz, si los atajos están activos.</p>
          <button className="secondary-button" onClick={() => setBacklogOpen(true)}>
            <History size={16}/> Abrir backlog de lectura
          </button>
          {voiceEnabled && <label className="noble-inspector-field">Voz de narrador
            <select value={voiceId} disabled={synthesizing} onChange={e => setVoiceId(e.target.value)}>
              {voices?.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </label>}
          <p className="noble-inspector-hint">{voiceEnabled ?
            (voices?.available && voices.voices.length ? 'Piper sintetiza únicamente cuando pulses Escuchar.' :
              'Instala Piper y añade una voz ONNX en Ajustes → Imágenes y voz.') :
            'Las voces están desactivadas. Actívalas en Ajustes → Imágenes y voz.'}</p>
          <button className="secondary-button" onClick={onSettings}><Cpu size={16}/> Más ajustes</button>
        </>}
      </div>
    </aside>
    {inspectorOpen && <button className="noble-inspector-backdrop"
      aria-label="Cerrar panel de información" onClick={() => setInspectorOpen(false)}/>}
    {backlogOpen && <div className="noble-backlog-scrim">
      <section className="noble-backlog-dialog" role="dialog" aria-modal="true"
        aria-label="Backlog de historia">
        <header className="noble-backlog-heading">
          <div><span className="overline"><History size={15}/> REGISTRO DE LECTURA</span>
            <h2>Backlog de la historia</h2>
            <p>{turns.length} escenas cargadas de esta ruta. Las ramas diferentes no se mezclan.</p></div>
          <button className="icon-button" aria-label="Cerrar backlog"
            onClick={() => setBacklogOpen(false)}><X size={19}/></button>
        </header>
        <label className="noble-backlog-search">Buscar en escenas cargadas
          <input type="search" aria-label="Buscar en backlog" maxLength={150}
            value={backlogQuery} onChange={event => setBacklogQuery(event.target.value)}
            placeholder="Intervención, diálogo o narración..."/>
        </label>
        <div className="noble-backlog-entries">
          {backlogItems.map(turn => <article key={turn.id} className="noble-backlog-entry">
            <div><strong>{turn.mode === 'say' ? 'Diálogo' :
              turn.mode === 'do' ? 'Acción' : turn.mode === 'story' ? 'Dirección' : 'Continuación'}
              {' · '}{active.protagonist_name}</strong>
              <button className="secondary-button" onClick={() => {
                setBacklogOpen(false); focusTurn(turn);
              }}>Ir a escena</button></div>
            {turn.input_text && <p className="noble-backlog-player">{turn.input_text}</p>}
            <p className="noble-backlog-narrator"><NarrativeText text={turn.assistant_text}/></p>
          </article>)}
          {!backlogItems.length && <p className="noble-backlog-empty">
            {turns.length ? 'No hay coincidencias en las escenas cargadas.' :
              'Todavía no hay escenas guardadas en esta ruta.'}
          </p>}
        </div>
      </section>
    </div>}
    {rewindTurn && <div className="noble-rewind-scrim" role="presentation">
      <section className="noble-rewind-dialog" role="dialog"
        aria-modal="true" aria-label="Confirmar rebobinado">
        <div className="noble-rewind-header">
          <div><span className="overline"><RotateCcw size={15}/> LÍNEA TEMPORAL</span>
            <h2>Volver a este punto</h2></div>
          <button className="icon-button" aria-label="Cancelar rebobinado"
            onClick={() => setRewindTurn(null)}><X size={19}/></button>
        </div>
        <p>Se creará una <strong>ruta independiente</strong> desde la intervención
          seleccionada. La historia original y todos sus turnos posteriores seguirán intactos.</p>
        <div className="noble-rewind-selected">
          <strong>Turno {turns.findIndex(t => t.id === rewindTurn.id) + 1}</strong>
          <p>{rewindTurn.input_text || rewindTurn.assistant_text.slice(0, 180)}</p>
          <small>{Math.max(0, turns.length - turns.findIndex(t => t.id === rewindTurn.id) - 1)}
            {' '}turno(s) posteriores permanecerán únicamente en la ruta original.</small>
        </div>
        <div className="noble-rewind-checkpoint" role="status">
          {rewindLoading || !rewindPreview ?
            <span><LoaderCircle className="rotating" size={15}/> Consultando instantáneas guardadas...</span> :
            <>
              <div><BookOpen size={15}/>
                {rewindPreview.lore ?
                  `Lorebook histórico: ${rewindPreview.lore.entries.length} entrada(s)` :
                  'Lorebook histórico no disponible: no se heredarán secretos actuales'}
              </div>
              <div><GitBranch size={15}/>
                {rewindPreview.world ?
                  `Estado del mundo: ${rewindPreview.world.state.location || 'sin ubicación confirmada'}` :
                  'Estado histórico no disponible: se usará el estado vacío'}
              </div>
            </>}
        </div>
        <div className="noble-rewind-actions">
          <button className="secondary-button" onClick={() => setRewindTurn(null)}>
            Mantenerme aquí
          </button>
          <button className="primary-button" disabled={rewindLoading || generating || updating}
            onClick={() => {
              const selected = rewindTurn.id;
              setRewindTurn(null);
              setInspectorOpen(false);
              onFork(selected);
            }}><GitBranch size={16}/> Crear ruta desde este turno</button>
        </div>
      </section>
    </div>}
    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
      aria-label="Subir ilustración de escena" onChange={e => {
        const file = e.target.files?.[0];
        void upload(file);
        e.target.value = '';
      }}/>
  </div>;
}
