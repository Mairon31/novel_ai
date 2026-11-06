import { useState } from 'react';
import { BookOpen, Check, LoaderCircle, Sparkles, Users, X } from 'lucide-react';
import { api } from './api';
import type { GeneratedStoryDraft, Story } from './types';

interface Props {
  onCreated: (story: Story) => void;
  onCancel: () => void;
}

export function AssistantStoryWizard({ onCreated, onCancel }: Props) {
  const [idea, setIdea] = useState('');
  const [protagonist, setProtagonist] = useState('Alex');
  const [genre, setGenre] = useState('');
  const [tone, setTone] = useState('');
  const [draft, setDraft] = useState<GeneratedStoryDraft | null>(null);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<'draft' | 'install' | null>(null);
  const [error, setError] = useState('');

  const reset = () => { setDraft(null); setError(''); };
  async function generate() {
    if (busy || idea.trim().length < 30 || !protagonist.trim()) return;
    setBusy('draft'); setError(''); setDraft(null);
    try {
      const result = await api.draftStoryWithAI({
        idea: idea.trim(), protagonist_name: protagonist.trim(),
        genre: genre.trim(), tone: tone.trim(),
      });
      setDraft(result.draft);
      setModel(result.model);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function install() {
    if (!draft || busy) return;
    setBusy('install'); setError('');
    try {
      const result = await api.installAIDraft(draft);
      onCreated(result.story);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <section className="creator-ai-wizard" aria-label="Asistente IA de historias">
    <div className="creator-ai-header">
      <div>
        <span className="overline"><Sparkles size={15}/> CREACIÓN ASISTIDA</span>
        <h2>Construye un mundo con IA</h2>
        <p>Genera una base jugable con trama pública, secretos para el narrador,
          cuatro personajes, tres Lorebooks y tres comienzos. Primero revisas
          la propuesta; después decides si deseas guardarla.</p>
      </div>
      <button className="secondary-button" onClick={onCancel} disabled={!!busy}
        type="button"><X size={16}/> Cerrar</button>
    </div>
    <div className="creator-ai-fields">
      <label>Idea para la historia
        <textarea aria-label="Idea para generar historia" rows={5} maxLength={2500}
          placeholder="Describe el conflicto, el mundo, sus reglas, el tipo de decisiones y los personajes que imaginas..."
          value={idea} onChange={e => { setIdea(e.target.value); reset(); }}/>
      </label>
      <div className="creator-ai-row">
        <label>Protagonista
          <input aria-label="Protagonista de historia IA" maxLength={60}
            value={protagonist} onChange={e => { setProtagonist(e.target.value); reset(); }}/>
        </label>
        <label>Género (opcional)
          <input aria-label="Género de historia IA" maxLength={80}
            value={genre} placeholder="Misterio, fantasía, romance..."
            onChange={e => { setGenre(e.target.value); reset(); }}/>
        </label>
        <label>Tono (opcional)
          <input aria-label="Tono de historia IA" maxLength={120}
            value={tone} placeholder="Suspenso, melancólico..."
            onChange={e => { setTone(e.target.value); reset(); }}/>
        </label>
      </div>
      <div className="creator-ai-actions">
        <button className="primary-button" type="button"
          onClick={() => void generate()}
          disabled={!!busy || idea.trim().length < 30 || !protagonist.trim()}>
          {busy === 'draft' ? <LoaderCircle size={16} className="rotating"/> :
            <Sparkles size={16}/>}
          {busy === 'draft' ? 'Generando trama, reparto y Lorebook...' : 'Generar propuesta'}
        </button>
        <small>Utiliza el narrador configurado en Ajustes. No descarga modelos ni guarda
          nada durante la generación. Las ilustraciones y voces se añaden después.</small>
      </div>
    </div>

    {error && <p role="alert" className="narrative-error">{error}</p>}
    {draft && <div className="creator-ai-preview" aria-label="Revisión del mundo generado">
      <div className="creator-ai-preview-head">
        <span className="overline"><Check size={14}/> TRES ETAPAS TERMINADAS</span>
        <h3>Revisa el mundo antes de crearlo</h3>
        <small>Modelo: {model} · aún no se ha guardado</small>
      </div>
      <label>Título de la propuesta
        <input aria-label="Título generado editable" maxLength={100} value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}/>
      </label>
      <label>Sinopsis pública
        <textarea aria-label="Sinopsis generada editable" rows={3} maxLength={250}
          value={draft.synopsis} onChange={e =>
            setDraft({ ...draft, synopsis: e.target.value })}/>
      </label>
      <div className="creator-ai-reading">
        <h4><BookOpen size={16}/> Mundo del jugador</h4>
        <p>{draft.player_plot}</p>
        <h4>Contexto privado del narrador</h4>
        <p>{draft.ai_plot}</p>
      </div>
      <div className="creator-ai-review-grid">
        <div>
          <h4><Users size={15}/> Personajes ({draft.characters.length})</h4>
          {draft.characters.map(npc => <article key={npc.name}>
            <strong>{npc.name}</strong><p>{npc.description}</p>
          </article>)}
        </div>
        <div>
          <h4>Lorebook ({draft.lore.length})</h4>
          {draft.lore.map(item => <article key={item.title}>
            <strong>{item.title}</strong><p>{item.content}</p>
          </article>)}
        </div>
      </div>
      <h4>Tres posibles inicios</h4>
      <div className="creator-ai-openings">
        {draft.openings.map((opening, index) => <article key={index}>
          <strong>Inicio {index + 1}</strong>
          <p>{opening.replace(/\{\{user\}\}/g, draft.protagonist_name)}</p>
        </article>)}
      </div>
      <p className="creator-ai-private-note">Estos datos quedan en tu biblioteca local.
        Después podrás modificar todos los campos desde Creator Studio.
        No se ha creado portada, imagen ni voz.</p>
      <button className="primary-button" type="button" disabled={!!busy ||
        draft.title.trim().length < 2 || draft.synopsis.trim().length < 25}
        onClick={() => void install()}>
        {busy === 'install' ? <LoaderCircle size={16} className="rotating"/> :
          <Check size={16}/>}
        {busy === 'install' ? 'Guardando mundo...' : 'Crear historia con esta propuesta'}
      </button>
    </div>}
  </section>;
}
