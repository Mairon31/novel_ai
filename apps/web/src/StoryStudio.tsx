import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronRight, CircleAlert, Cpu,
  Feather, LoaderCircle, MessageSquareText, Plus, Send, Sparkles, X,
} from 'lucide-react';
import { api } from './api';
import type { GenerationEvent, Story, StoryTurn } from './types';

const modes = [
  { id: 'do', label: 'Hacer' }, { id: 'say', label: 'Decir' },
  { id: 'story', label: 'Dirigir la historia' }, { id: 'continue', label: 'Continuar' },
] as const;

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
  const [mode, setMode] = useState<StoryTurn['mode']>('do');
  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);

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
  useEffect(() => { tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, streamText]);

  async function createStory() {
    if (title.trim().length < 2 || premise.trim().length < 10) return;
    setError(''); setLoading(true);
    try {
      const story = await api.createStory(title.trim(), premise.trim());
      setStories(previous => [story, ...previous]);
      setActive(story);
      setCreating(false); setTitle(''); setPremise(''); setNotice('Historia creada. Puedes comenzar cuando quieras.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setLoading(false); }
  }

  async function submit(continueOnly = false) {
    if (!active || generating || (!continueOnly && !draft.trim())) return;
    const controllerLocal = new AbortController();
    controller.current = controllerLocal;
    setGenerating(true); setStreamText(''); setNotice(''); setError('');
    let complete = false;
    try {
      await api.streamTurn(active.id, {
        mode: continueOnly ? 'continue' : mode,
        input_text: continueOnly ? '' : draft.trim(),
        request_id: crypto.randomUUID(),
      }, controllerLocal.signal, (evt: GenerationEvent) => {
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

  function selectStory(story: Story) {
    controller.current?.abort();
    setGenerating(false); setStreamText('');
    setDraft(''); setActive(story); setCreating(false);
  }

  const inputLabel = mode === 'say' ? 'Escribe lo que dice tu personaje...' :
    mode === 'story' ? 'Indica cómo continúa la historia...' :
    'Describe lo que hace tu personaje...';

  return <section className="story-studio">
    <div className="page-heading"><div className="eyebrow"><Feather size={14}/> NOBLE STORY ENGINE</div>
      <h1>Biblioteca<span className="title-dot">.</span></h1>
      <p>Historias interactivas guardadas localmente. El narrador responde desde tu motor Ollama o KoboldCpp.</p>
    </div>
    <div className="story-grid">
      <aside className="story-list">
        <div className="story-list-header"><strong>Mis historias</strong>
          <button aria-label="Crear historia" title="Crear historia" onClick={() => setCreating(true)}><Plus size={19}/></button></div>
        {loading && <div className="loading"><LoaderCircle className="rotating" size={17}/> Cargando...</div>}
        {stories.map(s => <button key={s.id} className={'story-link ' + (active?.id === s.id ? 'current' : '')}
          onClick={() => selectStory(s)} disabled={generating}>
          <BookOpen size={19}/><span><strong>{s.title}</strong><small>{s.premise}</small></span><ChevronRight size={15}/>
        </button>)}
        {!loading && stories.length === 0 && <p className="story-empty-note">Todavía no hay historias. Crea una para comenzar.</p>}
        <button className="story-create-small" onClick={() => setCreating(true)}><Plus size={16}/> Nueva historia</button>
      </aside>
      <article className="story-reader">
        {active ? <>
          <header className="story-reader-header"><div><span className="overline">HISTORIA LOCAL</span>
            <h2>{active.title}</h2></div><button className="story-settings-button"
              title="Configurar narrador" onClick={onOpenSettings}><Cpu size={17}/> Modelo</button></header>
          <div className="story-scroll" aria-live="polite">
            <div className="story-premise"><Sparkles size={17}/><p>{active.premise}</p></div>
            {turns.map((turn, index) => <div className="story-turn" key={turn.id}>
              <div className="story-turn-index">ESCENA {String(index + 1).padStart(2, '0')}</div>
              <div className="story-player"><span>{turn.mode === 'say' ? 'DICES' :
                turn.mode === 'do' ? 'HACES' : turn.mode === 'continue' ? 'CONTINUAR' : 'DIRECCIÓN'}</span>
                <p>{turn.input_text || 'La historia continúa...'}</p></div>
              <div className="story-narration"><MessageSquareText size={17}/><p>{turn.assistant_text}</p></div>
              <div className="turn-model">{turn.model}</div>
            </div>)}
            {generating && <div className="story-generation">
              <span><LoaderCircle className="rotating" size={15}/> El narrador está escribiendo...</span>
              <p>{streamText || 'Conectando con el motor local...'}</p></div>}
            {!generating && turns.length === 0 && <div className="story-empty-page">
              <BookOpen size={30}/><h3>El primer capítulo está por escribirse.</h3>
              <p>Describe una acción, una frase o pulsa Continuar para que el narrador comience.</p>
            </div>}
            <div ref={tail}/>
          </div>
          <footer className="story-input">
            {notice && <p className="story-notice"><CheckCircle2 size={15}/>{notice}</p>}
            {error && <div className="story-error" role="alert"><CircleAlert size={16}/>{error}
              <button title="Configurar servidor" onClick={onOpenSettings}>Configurar modelo <ArrowRight size={13}/></button></div>}
            <div className="story-mode-row">
              <label>Modo de entrada <select aria-label="Modo de narración"
                value={mode} disabled={generating}
                onChange={e => setMode(e.target.value as StoryTurn['mode'])}>
                {modes.filter(m => m.id !== 'continue').map(m => <option value={m.id} key={m.id}>{m.label}</option>)}
              </select></label>
              <span>Texto e historial guardados en SQLite</span>
            </div>
            <textarea aria-label="Tu intervención en la historia" disabled={generating}
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={inputLabel} maxLength={3000} rows={3}/>
            <div className="story-submit-row">
              <button className="secondary-button" disabled={generating} onClick={() => void submit(true)}>
                <Sparkles size={16}/> Continuar</button>
              <button className="primary-button" disabled={generating || !draft.trim()}
                onClick={() => void submit(false)}>
                {generating ? <LoaderCircle className="rotating" size={16}/> : <Send size={16}/>}
                {generating ? 'Generando...' : 'Enviar intervención'}</button>
            </div>
          </footer>
        </> : <div className="story-start-screen"><div className="story-start-icon"><BookOpen size={34}/></div>
          <h2>Una historia por descubrir.</h2><p>Crea tu propio mundo, define una premisa y deja que el narrador local genere las siguientes escenas.</p>
          <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17}/> Crear mi primera historia</button>
        </div>}
      </article>
    </div>
    {creating && <div className="welcome-scrim"><section className="welcome-panel" role="dialog"
      aria-modal="true" aria-label="Crear una nueva historia">
      <div className="story-create-heading"><div className="welcome-icon"><Feather size={29}/></div>
        <button aria-label="Cerrar creador" className="icon-button" onClick={() => setCreating(false)}><X size={19}/></button></div>
      <span className="overline">NOBLE STORY STUDIO</span><h2>Empieza una nueva historia.</h2>
      <p>Escribe un nombre y una premisa. El narrador usará este contexto durante los turnos de la historia.</p>
      <label className="form-label" htmlFor="story-title">Título</label>
      <input id="story-title" className="story-create-input" maxLength={100} value={title}
        onChange={e => setTitle(e.target.value)} placeholder="Por ejemplo: El bosque de los espíritus"/>
      <label className="form-label" htmlFor="story-premise">Premisa del mundo</label>
      <textarea id="story-premise" className="story-create-input" value={premise}
        onChange={e => setPremise(e.target.value)} rows={5} maxLength={4000}
        placeholder="Dónde sucede, quién eres, qué reglas tiene este mundo y cómo comienza..."/>
      {error && <p className="narrative-error" role="alert">{error}</p>}
      <button className="primary-button full" disabled={loading || title.trim().length < 2 || premise.trim().length < 10}
        onClick={() => void createStory()}><ArrowRight size={17}/> Crear historia</button>
    </section></div>}
  </section>;
}
