import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Feather, LoaderCircle, Plus, X } from 'lucide-react';
import { api } from './api';
import { VisualReader } from './VisualReader';
import { StoryDetail } from './StoryDetail';
import type { CreatorBlueprint, CreatorCharacter, CreatorMediaAsset, GenerationEvent, Story, StoryTurn } from './types';

interface StoryStudioProps {
  onOpenSettings: () => void;
  onReadingChange?: (reading: boolean) => void;
  onEditStory?: (storyId: string) => void;
}

export function StoryStudio({ onOpenSettings, onReadingChange, onEditStory }: StoryStudioProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [reading, setReading] = useState(false);
  const [storyMetadata, setStoryMetadata] = useState<CreatorBlueprint | null>(null);
  const [storyCharacters, setStoryCharacters] = useState<CreatorCharacter[]>([]);
  const [storyAssets, setStoryAssets] = useState<CreatorMediaAsset[]>([]);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [turns, setTurns] = useState<StoryTurn[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [premise, setPremise] = useState('');
  const [protagonistName, setProtagonistName] = useState('');
  const [createStep, setCreateStep] = useState<'story' | 'protagonist'>('story');
  const [mode, setMode] = useState<StoryTurn['mode']>('do');
  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('Preparando narrador...');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const activeStoryId = useRef<string | null>(null);
  activeStoryId.current = active?.id || null;

  useEffect(() => {
    let alive = true;
    api.stories().then(response => {
      if (!alive) return;
      setStories(response.stories);
      // Opening the library never automatically enters the most recent story.
    }).catch((exc: Error) => { if (alive) setError(exc.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    onReadingChange?.(Boolean(active && reading));
  }, [active?.id, reading, onReadingChange]);
  useEffect(() => {
    let live = true;
    setStoryMetadata(null);
    setStoryCharacters([]);
    setStoryAssets([]);
    if (active) {
      // Independent queries: a missing portrait must not hide the storyline or cast.
      void Promise.allSettled([
        api.creatorBlueprint(active.id), api.creatorCharacters(active.id),
        api.creatorAssets(active.id),
      ]).then(([blueprint, cast, media]) => {
        if (!live) return;
        if (blueprint.status === 'fulfilled') setStoryMetadata(blueprint.value);
        if (cast.status === 'fulfilled') setStoryCharacters(cast.value.characters);
        if (media.status === 'fulfilled') setStoryAssets(media.value.assets);
      });
    }
    return () => { live = false; };
  }, [active?.id]);
  useEffect(() => {
    let alive = true;
    setTurns([]); setStreamText(''); setError('');
    setTurnsLoading(Boolean(active));
    if (active) {
      api.storyTurns(active.id).then(result => { if (alive) setTurns(result.turns); })
        .catch((exc: Error) => { if (alive) setError(exc.message); })
        .finally(() => { if (alive) setTurnsLoading(false); });
    }
    return () => { alive = false; };
  }, [active?.id]);

  async function createStory() {
    if (title.trim().length < 2 || premise.trim().length < 10 || !protagonistName.trim()) return;
    setError(''); setLoading(true);
    try {
      const story = await api.createStory(title.trim(), premise.trim(), protagonistName.trim());
      setStories(previous => [story, ...previous]);
      setActive(story); setReading(true);
      setCreating(false); setCreateStep('story'); setTitle(''); setPremise(''); setProtagonistName(''); setNotice('Historia creada. Puedes comenzar cuando quieras.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setLoading(false); }
  }

  async function submit(continueOnly = false) {
    if (!active || generating || (!continueOnly && !draft.trim())) return;
    const controllerLocal = new AbortController();
    controller.current = controllerLocal;
    setGenerating(true); setGenerationMessage('Preparando narrador...'); setStreamText(''); setNotice(''); setError('');
    let complete = false;
    try {
      await api.streamTurn(active.id, {
        mode: continueOnly ? 'continue' : mode,
        input_text: continueOnly ? '' : draft.trim(),
        request_id: crypto.randomUUID(),
      }, controllerLocal.signal, (evt: GenerationEvent) => {
        if (evt.event === 'status') setGenerationMessage(evt.data.message);
        if (evt.event === 'delta') setStreamText(text => text + evt.data.text);
        if (evt.event === 'error') throw new Error(evt.data.message);
        if (evt.event === 'done') {
          complete = true;
          setTurns(old => old.some(t => t.id === evt.data.turn.id) ?
            old : [...old, evt.data.turn]);
          setStreamText('');
          setDraft('');
          setStories(old => old.map(s => s.id === active.id ?
            { ...s, updated_at: Date.now() / 1000 } : s));
        }
      });
      if (!complete) throw new Error('La conexión terminó sin confirmar el turno.');
    } catch (exc) {
      if (!controllerLocal.signal.aborted) setError((exc as Error).message);
    } finally {
      controller.current = null;
      setGenerating(false);
    }
  }

  async function startOpening(index: number) {
    if (!active || openingBusy || turnsLoading || turns.length) return;
    const storyId = active.id;
    setOpeningBusy(true);
    setError('');
    try {
      const firstTurn = await api.startCreatorOpening(storyId, index);
      // Keep a delayed request from opening the wrong story after navigation.
      if (activeStoryId.current !== storyId) return;
      setTurns([firstTurn]);
      setStories(previous => previous.map(story => story.id === storyId ?
        { ...story, updated_at: Date.now() / 1000 } : story));
      setReading(true);
    } catch (exc) {
      if (activeStoryId.current === storyId) setError((exc as Error).message);
    } finally {
      setOpeningBusy(false);
    }
  }

  async function createBranch(turnId: string) {
    if (!active || generating) return;
    const originalId = active.id;
    setError(''); setLoading(true);
    try {
      const copy = await api.forkStory(originalId, turnId);
      setStories(existing => [copy, ...existing]);
      setActive(current => current?.id === originalId ? copy : current);
      setReading(true);
      setDraft('');
      setNotice('Rama creada. Puedes continuar por una ruta diferente sin modificar la historia original.');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  function cancelGeneration() {
    controller.current?.abort();
    controller.current = null;
    setGenerating(false);
    setStreamText('');
    setNotice('Generación detenida. Puedes continuar cuando quieras.');
  }

  function selectStory(story: Story) {
    controller.current?.abort();
    setGenerating(false); setStreamText('');
    setDraft(''); setActive(story); setReading(false); setCreating(false);
  }


  return <section className={'story-studio ' + (active && reading ? 'is-reading' : 'is-library')}>
    {active && reading ? <div className="noble-reading-navigation">
      <button className="noble-return-library" aria-label="Volver a biblioteca" onClick={() => {
        controller.current?.abort();
        setGenerating(false); setStreamText(''); setDraft(''); setActive(null); setReading(false);
      }}><ArrowLeft size={19}/> Biblioteca</button>
      <div className="noble-reading-navigation-title">
        <strong>{active.title}</strong><span>Jugando como {active.protagonist_name || 'Protagonista'}</span>
      </div>
      <button className="noble-reader-settings-link" onClick={onOpenSettings}>Ajustes</button>
    </div> : active ? <StoryDetail story={active} turns={turns} metadata={storyMetadata}
      characters={storyCharacters} media={storyAssets} openingBusy={openingBusy || turnsLoading}
      error={error}
      onBack={() => { setActive(null); setReading(false); }}
      onContinue={() => setReading(true)}
      onStartOpening={index => void startOpening(index)}
      onEdit={() => onEditStory?.(active.id)}/> : <div className="noble-library-home">
      <div className="noble-library-hero">
        <div><span className="eyebrow"><Feather size={15}/> TU UNIVERSO DE HISTORIAS</span>
          <h1>Historias para vivir, no solo leer.</h1>
          <p>Elige un mundo, continúa una aventura o crea una historia desde cero.
            Tu biblioteca y el lector son espacios independientes.</p>
          <button className="primary-button" onClick={() => {
            setCreating(true); setCreateStep('story');
          }}><Plus size={17}/> Nueva historia</button>
        </div>
        <div className="noble-library-hero-art" aria-hidden="true">
          <BookOpen size={72}/>
        </div>
      </div>
      <div className="noble-library-section-heading">
        <div><span className="overline">TU COLECCIÓN</span><h2>Mis historias <small>{stories.length}</small></h2></div>
        {loading && <div className="loading"><LoaderCircle className="rotating" size={15}/> Cargando...</div>}
      </div>
      <div className="noble-library-cover-grid">
        {stories.map(s => <button key={s.id} className="noble-library-cover"
          onClick={() => selectStory(s)} disabled={generating}>
          <div className="noble-library-cover-art"
            style={s.cover_image_url || s.scene_image_url ? {backgroundImage:'url("'+(s.cover_image_url || s.scene_image_url)+'")'}:undefined}>
            {!(s.cover_image_url || s.scene_image_url) && <BookOpen size={38}/>}
            <span>{s.origin_story_id ? 'Ruta alternativa' : 'Historia'}</span>
          </div>
          <div className="noble-library-cover-copy"><strong>{s.title}</strong>
            <small>Protagonista · {s.protagonist_name || 'Sin nombre'}</small>
            <p>{s.premise}</p>
            <div><span>Continuar leyendo</span><ChevronRight size={17}/></div>
          </div>
        </button>)}
        {!loading && stories.length===0 && <div className="noble-library-empty">
          <BookOpen size={38}/><h3>Tu próxima aventura comienza aquí</h3>
          <p>Crea el mundo y el protagonista para empezar a escribir tu primera historia.</p>
          <button className="secondary-button" onClick={() => setCreating(true)}>Crear historia</button>
        </div>}
      </div>
    </div>}
    {active && reading && <VisualReader active={active} turns={turns}
      mode={mode} setMode={setMode} draft={draft} setDraft={setDraft}
      streamText={streamText} generating={generating} generationMessage={generationMessage}
      onCancel={cancelGeneration} onFork={createBranch} notice={notice} error={error}
      onSubmit={continueOnly => void submit(continueOnly)}
      onCreate={() => { setCreateStep('story'); setCreating(true); }}
      onSettings={onOpenSettings}
      onUpdateStory={next => {
        // A slow image upload or generation must not jump back to an old story.
        setActive(current => current?.id === next.id ? next : current);
        setStories(old => old.map(item => item.id === next.id ? next : item));
      }}/>}
    {creating && <div className="welcome-scrim"><section className="welcome-panel" role="dialog"
      aria-modal="true" aria-label="Crear una nueva historia">
      <div className="story-create-heading"><div className="welcome-icon"><Feather size={29}/></div>
        <button aria-label="Cerrar creador" className="icon-button" onClick={() => setCreating(false)}><X size={19}/></button></div>
      <span className="overline">{createStep === 'story' ? 'PASO 1 / 2 · EL MUNDO' : 'PASO 2 / 2 · TU PERSONAJE'}</span>
      {createStep === 'story' ? <>
        <h2>Empieza una nueva historia.</h2>
        <p>Define el escenario inicial. No se crearán imágenes ni voces hasta que las solicites.</p>
        <label className="form-label" htmlFor="story-title">Título</label>
        <input id="story-title" className="story-create-input" maxLength={100} value={title}
          onChange={e => setTitle(e.target.value)} placeholder="Por ejemplo: El bosque de los espíritus"/>
        <label className="form-label" htmlFor="story-premise">Premisa del mundo</label>
        <textarea id="story-premise" className="story-create-input" value={premise}
          onChange={e => setPremise(e.target.value)} rows={5} maxLength={4000}
          placeholder="Dónde sucede, cómo es este mundo y cómo comienza tu aventura..."/>
      </> : <>
        <div className="noble-create-character"><div className="noble-create-avatar"><Feather size={33}/></div>
          <span>ESTÁS JUGANDO COMO...</span></div>
        <h2>¿Cómo te llamas en esta historia?</h2>
        <p>Este será el nombre del personaje que tú controlas. El narrador respetará sus decisiones.</p>
        <label className="form-label" htmlFor="story-protagonist">Nombre del protagonista</label>
        <input id="story-protagonist" className="story-create-input noble-name-input"
          value={protagonistName} maxLength={60} autoFocus
          onChange={e => setProtagonistName(e.target.value)} placeholder="Elige el nombre de tu personaje"/>
      </>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {createStep === 'story' ? <button className="primary-button full"
        disabled={loading || title.trim().length < 2 || premise.trim().length < 10}
        onClick={() => setCreateStep('protagonist')}>
        <ArrowRight size={17}/> Elegir protagonista</button> :
        <div className="noble-create-actions">
          <button className="secondary-button" onClick={() => setCreateStep('story')}>Volver</button>
          <button className="primary-button" disabled={loading || !protagonistName.trim()}
            onClick={() => void createStory()}><ArrowRight size={17}/> Empezar historia</button>
        </div>}
    </section></div>}
  </section>;
}
