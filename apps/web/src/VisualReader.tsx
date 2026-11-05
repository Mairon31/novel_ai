import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Camera, Check, ChevronRight, Cpu, Eye, Feather,
  Image, LoaderCircle, MessageSquareText, Palette, Send, Settings2, Volume2, Square,
  Sparkles, UploadCloud, UserRound, X,
} from 'lucide-react';
import { api } from './api';
import type { Story, StoryTurn, WorkspacePreferences, SpeechVoices, VisualState, VisualCharacterDraft } from './types';

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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [readerError, setReaderError] = useState('');
  const [visual, setVisual] = useState<VisualState | null>(null);
  const [sceneLocation, setSceneLocation] = useState('');
  const [visualBusy, setVisualBusy] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [character, setCharacter] = useState<VisualCharacterDraft>({
    name: '', appearance: '', outfit: '', distinguishing_features: '',
  });
  const [elapsed, setElapsed] = useState(0);
  const [imagePrompt, setImagePrompt] = useState(active?.premise || '');
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
  const [name, setName] = useState(active?.protagonist_name || 'Protagonista');
  const [canon, setCanon] = useState(active?.canon || '');
  const [shortcuts, setShortcuts] = useState(true);
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setName(active?.protagonist_name || 'Protagonista'); }, [active?.id, active?.protagonist_name]);
  useEffect(() => { setCanon(active?.canon || ''); }, [active?.id, active?.canon]);
  useEffect(() => { setImagePrompt(active?.premise || ''); }, [active?.id]);
  useEffect(() => {
    if (!active) { setVisual(null); return; }
    let live = true;
    setVisual(null); setPreviewPrompt('');
    api.visualState(active.id).then(current => {
      if (!live) return;
      setVisual(current);
      setSceneLocation(current.current_scene.location);
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
    try { onUpdateStory(await api.uploadSceneImage(active.id, file)); await refreshVisual(active.id); setTab('gallery'); }
    catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
  }
  async function refreshVisual(storyId: string) {
    const next = await api.visualState(storyId);
    setVisual(next);
    setSceneLocation(next.current_scene.location);
  }
  async function saveSceneLocation() {
    if (!active || sceneLocation.trim().length < 2) return;
    setVisualBusy(true); setReaderError('');
    try {
      const next = await api.setSceneLocation(active.id, sceneLocation.trim());
      setVisual(next); setSceneLocation(next.current_scene.location);
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
      setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }
  async function previewIllustrationPrompt() {
    if (!active || imagePrompt.trim().length < 8) return;
    setVisualBusy(true); setReaderError('');
    try {
      const result = await api.imagePromptPreview(active.id, imagePrompt.trim());
      setPreviewPrompt(result.prompt);
    } catch (e) { setReaderError((e as Error).message); }
    finally { setVisualBusy(false); }
  }

  async function illustrateScene() {
    if (!active || !imagePrompt.trim() || illustrating) return;
    setIllustrating(true); setReaderError('');
    const requestedStoryId = active.id;
    const revision = mediaRevision.current;
    try {
      const result = await api.illustrate(requestedStoryId, imagePrompt.trim());
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

  async function changeReaderLayout(mode: 'immersive' | 'classic') {
    if (!prefs) return;
    setUpdating(true); setReaderError('');
    try {
      const p = await api.patchWorkspacePreferences({ reader_layout: mode });
      setPrefs(p);
      document.documentElement.dataset.nobleReaderLayout = p.reader_layout;
    } catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
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

  return <div className="noble-reader-layout">
    <aside className={'noble-scene-panel ' + (active.scene_image_url ? 'has-art' : '')}>
      <div className="noble-scene-art"
        style={active.scene_image_url ? { backgroundImage: 'url("' + active.scene_image_url + '")' } : undefined}>
        <div className="noble-scene-wash"/>
        {!active.scene_image_url && <div className="noble-scene-empty">
          <Image size={34}/><strong>Tu escena, tu mundo</strong>
          <p>Agrega una ilustración para acompañar la lectura.</p>
        </div>}
        <div className="noble-scene-bottom">
          <span className="overline">NOBLE VISUAL NOVEL</span>
          <h3>{active.title}</h3>
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
          <button title="Mostrar panel de historia" aria-label="Abrir información de historia"
            onClick={() => setInspectorOpen(open => !open)}><Eye size={17}/></button>
          <button title="Configurar narrador" aria-label="Configurar narrador" onClick={onSettings}>
            <Settings2 size={18}/></button>
        </div>
      </header>
      <div className="noble-reader-prose" aria-live="polite">
        <div className="noble-reader-intro"><Sparkles size={17}/>
          <div><span>LA HISTORIA COMIENZA</span><p>{active.premise}</p></div></div>
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
          {editingCharacterId && <button className="secondary-button" onClick={() => {
            setEditingCharacterId(null);
            setCharacter({ name: '', appearance: '', outfit: '', distinguishing_features: '' });
          }}>Cancelar edición</button>}

          {active.origin_story_id && <p className="noble-inspector-hint">
            Esta historia es una rama independiente. Las decisiones futuras no modifican la original.
          </p>}
        </>}
        {tab === 'history' && <>
          <h4>Historial de escenas</h4>
          {turns.length ? turns.map((turn, i) =>
            <div key={turn.id} className="noble-inspector-turn">
              <button className="noble-inspector-turn-jump" onClick={() => focusTurn(turn)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{turn.input_text || 'Continuación automática'}</strong><ChevronRight size={15}/>
              </button>
              <button className="noble-inspector-branch" disabled={generating || updating}
                title="Crear una historia alternativa desde esta intervención"
                onClick={() => onFork(turn.id)}>Crear rama</button>
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
            <button className="secondary-button" disabled={visualBusy || imagePrompt.trim().length < 8}
              onClick={() => void previewIllustrationPrompt()}>Ver prompt completo y fichas</button>
            {previewPrompt && <div className="noble-prompt-preview">
              <strong>Prompt que recibirá ComfyUI</strong><p>{previewPrompt}</p>
            </div>}
            <button className="primary-button" disabled={illustrating || imagePrompt.trim().length < 8}
              onClick={() => void illustrateScene()}>
              {illustrating ? <LoaderCircle className="rotating" size={16}/> : <Image size={16}/>}
              {illustrating ? 'ComfyUI está generando...' : 'Ilustrar escena con ComfyUI'}</button>
          </>}
          <p className="noble-inspector-hint">Las ilustraciones se generan solo cuando las solicitas. Requiere ComfyUI conectado y un checkpoint configurado en Ajustes → Imágenes y voz. La historia puede continuar sin imágenes.</p>
        </>}
        {tab === 'reader' && <>
          <h4>Presentación de lectura</h4>
          <p>El diseño es adaptable a móvil y escritorio. Elige entre lector inmersivo o lectura clásica.</p>
          {prefs && <div className="noble-reader-layout-options">
            <button className={prefs.reader_layout === 'immersive' ? 'selected' : ''}
              disabled={updating} onClick={() => void changeReaderLayout('immersive')}>
              <Palette size={17}/> Inmersiva</button>
            <button className={prefs.reader_layout === 'classic' ? 'selected' : ''}
              disabled={updating} onClick={() => void changeReaderLayout('classic')}>
              <BookOpen size={17}/> Clásica</button>
          </div>}
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
    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
      aria-label="Subir ilustración de escena" onChange={e => {
        const file = e.target.files?.[0];
        void upload(file);
        e.target.value = '';
      }}/>
  </div>;
}
