import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Feather, LoaderCircle, Plus, X } from 'lucide-react';
import { api } from './api';
import { VisualReader } from './VisualReader';
import type { GenerationEvent, Story, StoryTurn } from './types';

interface StoryStudioProps {
  onOpenSettings: () => void;
}

export function StoryStudio({ onOpenSettings }: StoryStudioProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
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

  useEffect(() => {
    let alive = true;
    api.stories().then(response => {
      if (!alive) return;
      setStories(response.stories);
      if (response.stories.length) setActive(response.stories[0]);
    }).catch((exc: Error) => { if (alive) setError(exc.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    let alive = true;
    setTurns([]); setStreamText(''); setError('');
    if (active) {
      api.storyTurns(active.id).then(result => { if (alive) setTurns(result.turns); })
        .catch((exc: Error) => { if (alive) setError(exc.message); });
    }
    return () => { alive = false; };
  }, [active?.id]);

  async function createStory() {
    if (title.trim().length < 2 || premise.trim().length < 10 || !protagonistName.trim()) return;
    setError(''); setLoading(true);
    try {
      const story = await api.createStory(title.trim(), premise.trim(), protagonistName.trim());
      setStories(previous => [story, ...previous]);
      setActive(story);
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

  async function createBranch(turnId: string) {
    if (!active || generating) return;
    setError(''); setLoading(true);
    try {
      const copy = await api.forkStory(active.id, turnId);
      setStories(existing => [copy, ...existing]);
      setActive(copy);
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
    setDraft(''); setActive(story); setCreating(false);
  }


  return <section className="story-studio">
    <div className="page-heading"><div className="eyebrow"><Feather size={14}/> NOBLE STORY ENGINE</div>
      <h1>Biblioteca<span className="title-dot">.</span></h1>
      <p>Historias interactivas guardadas localmente. El narrador responde desde tu motor Ollama o KoboldCpp.</p>
    </div>
    <div className="noble-library-strip">
      <div className="noble-library-strip-heading"><BookOpen size={18}/><strong>Mis historias</strong>
        <span>{stories.length}</span></div>
      <div className="noble-library-story-options">
        {loading && <div className="loading"><LoaderCircle className="rotating" size={16}/> Cargando...</div>}
        {stories.map(s => <button key={s.id}
          className={'noble-library-story ' + (active?.id === s.id ? 'selected' : '')}
          onClick={() => selectStory(s)} disabled={generating}>
          <span>{s.title}</span><small>{s.protagonist_name || 'Protagonista'}</small>
          <ChevronRight size={14}/></button>)}
        <button className="noble-library-new" onClick={() => { setCreating(true); setCreateStep('story'); }}>
          <Plus size={16}/> Nueva historia</button>
      </div>
    </div>
    <VisualReader active={active} turns={turns}
      mode={mode} setMode={setMode} draft={draft} setDraft={setDraft}
      streamText={streamText} generating={generating} generationMessage={generationMessage}
      onCancel={cancelGeneration} onFork={createBranch} notice={notice} error={error}
      onSubmit={continueOnly => void submit(continueOnly)}
      onCreate={() => { setCreateStep('story'); setCreating(true); }}
      onSettings={onOpenSettings}
      onUpdateStory={next => {
        setActive(next);
        setStories(old => old.map(item => item.id === next.id ? next : item));
      }}/>
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
