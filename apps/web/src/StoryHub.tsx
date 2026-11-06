import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Compass, LoaderCircle, Users } from 'lucide-react';
import { api } from './api';
import type { Story, StoryHubPack } from './types';

interface Props {
  onInstall: (story: Story) => void;
}

export function StoryHub({ onInstall }: Props) {
  const [packs, setPacks] = useState<StoryHubPack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [protagonist, setProtagonist] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void api.storyHub().then(data => {
      if (live) {
        setPacks(data.packs);
        setSelected(current => current ?? data.packs[0]?.id ?? null);
      }
    }).catch((exc: Error) => {
      if (live) setError(exc.message);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, []);
  const chosen = packs.find(p => p.id === selected) || null;
  async function install() {
    if (!chosen || installing) return;
    setError('');
    setInstalling(chosen.id);
    try {
      const result = await api.installStoryPack(chosen.id,
        protagonist.trim() || chosen.protagonist);
      onInstall(result.story);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setInstalling(null);
    }
  }
  return <section className="noble-story-hub" aria-label="Descubrir historias para jugar">
    <header className="noble-story-hub-heading">
      <div>
        <span className="overline"><Compass size={15}/> HISTORIAS PARA COMENZAR</span>
        <h2>Descubre un mundo para jugar</h2>
        <p>Instala historias originales con personajes, reglas del mundo y
          tres comienzos alternativos. Cada instalación crea una copia editable.</p>
      </div>
      <span className="noble-story-hub-source">Catálogo incluido · sin cuenta</span>
    </header>
    {loading && <div className="loading" role="status">
      <LoaderCircle size={18} className="rotating"/> Cargando historias...</div>}
    {!loading && packs.length === 0 && !error && <p>
      No hay historias incluidas en esta versión.</p>}
    <div className="noble-story-hub-grid">
      {packs.map((pack, index) => <button key={pack.id}
        type="button" disabled={!!installing}
        className={'noble-story-hub-tile ' + (chosen?.id === pack.id ? 'is-selected' : '')}
        aria-pressed={chosen?.id === pack.id}
        aria-label={'Ver historia ' + pack.title}
        onClick={() => { setSelected(pack.id); setProtagonist(''); setError(''); }}>
        <div className={'noble-story-hub-art hub-art-' + index % 3}
          aria-hidden="true"><BookOpen size={36}/></div>
        <div className="noble-story-hub-tile-copy">
          <small>{pack.genre} · {pack.language}</small>
          <strong>{pack.title}</strong>
          <span>{pack.synopsis}</span>
          <em>{pack.character_count} personajes · {pack.opening_previews.length} inicios</em>
        </div>
      </button>)}
    </div>
    {chosen && <article className="noble-story-hub-detail"
      aria-label={'Vista previa de ' + chosen.title}>
      <div className="noble-story-hub-detail-main">
        <span className="overline">HISTORIA SELECCIONADA</span>
        <h3>{chosen.title}</h3>
        <p>{chosen.player_plot}</p>
        <div className="noble-story-hub-tags">
          {chosen.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
        <p className="noble-story-hub-credits">
          <Users size={15}/> {chosen.character_names.join(' · ')}
        </p>
        <p className="noble-story-hub-credits">
          Autoría {chosen.author} · {chosen.license} · Versión {chosen.version}
        </p>
        <p className="noble-story-hub-credits">
          Esta edición contiene texto y lore. Las imágenes se pueden crear
          o importar posteriormente en Creator Studio.
        </p>
        <label className="noble-hub-protagonist">
          Nombre de tu protagonista
          <input aria-label="Nombre para la historia instalada" maxLength={60}
            value={protagonist} placeholder={chosen.protagonist}
            onChange={event => setProtagonist(event.target.value)}/>
        </label>
        <button className="primary-button" type="button"
          disabled={!!installing} onClick={() => void install()}>
          {installing === chosen.id ? <LoaderCircle className="rotating" size={16}/> :
            <CheckCircle2 size={16}/>}
          {installing === chosen.id ? 'Instalando historia...' : 'Añadir a mi biblioteca'}
          {!installing && <ArrowRight size={16}/>}
        </button>
      </div>
      <div className="noble-story-hub-openings">
        <strong>Tres formas de comenzar</strong>
        {chosen.opening_previews.map((opening, idx) => <div key={idx}>
          <small>Inicio {idx + 1}</small>
          <p>{opening.replace(/\{\{user\}\}/g, protagonist.trim() || chosen.protagonist)}</p>
        </div>)}
      </div>
    </article>}
    {error && <p role="alert" className="narrative-error">
      No se pudo cargar o instalar la historia: {error}
      {!packs.length && <button type="button" className="secondary-button"
        onClick={() => window.location.reload()}>Reintentar</button>}
    </p>}
  </section>;
}
