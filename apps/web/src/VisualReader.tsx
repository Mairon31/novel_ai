import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Camera, Check, ChevronRight, Cpu, Eye, Feather,
  Image, LoaderCircle, MessageSquareText, Palette, Send, Settings2,
  Sparkles, UploadCloud, UserRound, X,
} from 'lucide-react';
import { api } from './api';
import type { Story, StoryTurn, WorkspacePreferences } from './types';

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
  active, turns, mode, draft, streamText, generating,
  notice, error, setDraft, setMode, onSubmit, onCreate, onSettings, onUpdateStory,
}: Props) {
  const [tab, setTab] = useState<Tab>('summary');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [readerError, setReaderError] = useState('');
  const [name, setName] = useState(active?.protagonist_name || 'Protagonista');
  const [shortcuts, setShortcuts] = useState(true);
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setName(active?.protagonist_name || 'Protagonista'); }, [active?.id, active?.protagonist_name]);
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
    try { onUpdateStory(await api.uploadSceneImage(active.id, file)); setTab('gallery'); }
    catch (e) { setReaderError((e as Error).message); }
    finally { setUpdating(false); }
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
          <div className="noble-turn-caption">{turn.model}</div>
        </section>)}
        {generating && <div className="noble-reader-stream">
          <span><LoaderCircle className="rotating" size={15}/> El narrador está escribiendo...</span>
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
          <h4>Estado</h4>
          <p>{turns.length} escenas guardadas · último modelo: {turns.at(-1)?.model || 'Sin iniciar'}</p>
        </>}
        {tab === 'history' && <>
          <h4>Historial de escenas</h4>
          {turns.length ? turns.map((turn, i) =>
            <button key={turn.id} className="noble-inspector-turn" onClick={() => focusTurn(turn)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{turn.input_text || 'Continuación automática'}</strong><ChevronRight size={15}/></button>) :
            <p>Todavía no se han generado escenas.</p>}
        </>}
        {tab === 'gallery' && <>
          <h4>Galería de esta historia</h4>
          {active.scene_image_url ? <img className="noble-gallery-image"
            src={active.scene_image_url} alt={'Ilustración de ' + active.title}/> :
            <p>Aún no hay una ilustración en esta historia.</p>}
          <button className="secondary-button" disabled={updating}
            onClick={() => fileRef.current?.click()}><UploadCloud size={16}/> Importar ilustración</button>
          <p className="noble-inspector-hint">Puedes usar PNG, JPEG o WebP propios. Se almacena una copia WebP local; la generación automática con ComfyUI llegará después.</p>
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
