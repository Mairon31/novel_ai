import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock3, Feather, GitBranch,
  Image as ImageIcon, PencilLine, Play, UserRound, Users,
} from 'lucide-react';
import type {
  Story, StoryTurn, CreatorBlueprint, CreatorCharacter, CreatorMediaAsset,
} from './types';

interface Props {
  story: Story;
  turns: StoryTurn[];
  metadata: CreatorBlueprint | null;
  characters: CreatorCharacter[];
  media: CreatorMediaAsset[];
  openingBusy: boolean;
  error: string;
  onBack: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onStartOpening: (index: number) => void;
}

function date(value: number) {
  if (!value || !Number.isFinite(value)) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-419', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value * 1000));
}

function preview(text: string, protagonist: string) {
  return text.replace(/\{\{user\}\}/g, protagonist || 'Protagonista');
}

/** Player-facing editorial page. Never display AI-only plot, reminders or dialogue prompts. */
export function StoryDetail({
  story, turns, metadata, characters, media, openingBusy, error,
  onBack, onContinue, onEdit, onStartOpening,
}: Props) {
  const last = turns.at(-1);
  const description = metadata?.synopsis.trim() || story.premise;
  const publicPlot = metadata?.player_plot.trim();
  const openings = turns.length ? [] : (metadata?.opening_scenarios || []);
  const heroArt = story.scene_image_url ||
    media.find(item => item.kind === 'background')?.url || null;

  return <section className="noble-story-detail" aria-label={'Detalle de ' + story.title}>
    <div className="noble-story-detail-cover"
      style={heroArt ? { backgroundImage: 'url("' + heroArt + '")' } : undefined}>
      <div className="noble-story-cover-shade"/>
      <button className="noble-story-detail-back" onClick={onBack} disabled={openingBusy}>
        <ArrowLeft size={18}/> Volver a biblioteca
      </button>
      {!heroArt && <div className="noble-story-cover-empty"><BookOpen size={76}/></div>}
      <div className="noble-story-detail-heading">
        <span className="noble-story-detail-overline">
          {story.origin_story_id ? <GitBranch size={15}/> : <Feather size={15}/>}
          {story.origin_story_id ? 'RUTA ALTERNATIVA' : 'TU HISTORIA'}
        </span>
        <h1>{story.title}</h1>
        {metadata?.genre && <span className="noble-story-genre">{metadata.genre}</span>}
        <p>{description}</p>
        <div className="noble-story-detail-tags">
          {metadata?.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
        <div className="noble-story-detail-actions">
          {openings.length ? <button className="primary-button" onClick={() =>
            document.getElementById('noble-story-openings')?.scrollIntoView({ behavior: 'smooth' })}>
            <Play size={17}/> Elegir una apertura <ArrowRight size={16}/>
          </button> : <button className="primary-button" onClick={onContinue}>
            <Play size={17}/> {turns.length ? 'Continuar historia' : 'Comenzar historia'} <ArrowRight size={16}/>
          </button>}
          <button className="secondary-button" onClick={onEdit}>
            <PencilLine size={16}/> Editar en Creator Studio
          </button>
        </div>
      </div>
    </div>
    {error && <p className="narrative-error" role="alert">{error}</p>}
    <div className="noble-story-detail-body">
      <div className="noble-story-detail-overview">
        <div><UserRound size={18}/><span>Protagonista</span><strong>{story.protagonist_name || 'Sin asignar'}</strong></div>
        <div><BookOpen size={18}/><span>Intervenciones</span><strong>{turns.length}</strong></div>
        <div><CalendarDays size={18}/><span>Creada</span><strong>{date(story.created_at)}</strong></div>
        <div><Clock3 size={18}/><span>Actualizada</span><strong>{date(story.updated_at)}</strong></div>
      </div>
      <article className="noble-story-detail-resume">
        <span className="overline">{last ? 'TU AVENTURA' : 'EL MUNDO'}</span>
        <h2>{last ? 'Donde quedó tu historia' : 'Antes de comenzar'}</h2>
        <p>{last ? last.assistant_text.slice(0, 700) :
          preview(publicPlot || story.premise, story.protagonist_name)}</p>
        {last && <button className="noble-story-detail-resume-link" onClick={onContinue}>
          Retomar desde esta escena <ArrowRight size={16}/>
        </button>}
      </article>
    </div>
    {characters.length > 0 && <section className="noble-detail-section"
      aria-label="Personajes de la historia">
      <div className="noble-detail-section-heading">
        <span className="overline"><Users size={15}/> CONOCE AL ELENCO</span>
        <h2>Personajes de este mundo <small>{characters.length}</small></h2>
        <p>Conoce a quienes pueden acompañarte en tu historia.</p>
      </div>
      <div className="noble-detail-cast-grid">
        {characters.map(character => {
          const portrait = media.find(item =>
            item.kind === 'foreground' && item.character_id === character.id);
          return <article className="noble-detail-cast-card" key={character.id}>
            <div className="noble-detail-portrait">
              {portrait ? <img src={portrait.url} alt={'Retrato de ' + character.name}
                loading="lazy"/> : <UserRound size={49} aria-hidden="true"/>}
            </div>
            <div className="noble-detail-cast-copy">
              <h3>{character.name}</h3>
              <p>{preview(character.description, story.protagonist_name)}</p>
            </div>
          </article>;
        })}
      </div>
    </section>}
    {openings.length > 0 && <section className="noble-detail-section"
      id="noble-story-openings" aria-label="Escenas de apertura">
      <div className="noble-detail-section-heading">
        <span className="overline"><Feather size={15}/> TU PRIMERA DECISIÓN</span>
        <h2>Elige cómo empieza la historia</h2>
        <p>Selecciona una escena de apertura. Al comenzar, se guardará como
          el primer turno de esta historia, sin generar texto adicional.</p>
      </div>
      <div className="noble-detail-openings-grid">
        {openings.map((opening, index) => <article className="noble-detail-opening" key={index}>
          <div className="noble-detail-opening-label">
            <span>ESCENA {String(index + 1).padStart(2, '0')}</span>
            <BookOpen size={18} aria-hidden="true"/>
          </div>
          <p>{preview(opening, story.protagonist_name)}</p>
          <button className="secondary-button" disabled={openingBusy}
            onClick={() => onStartOpening(index)}>
            <Play size={16}/> {openingBusy ? 'Guardando inicio...' : 'Comenzar con esta apertura'}
            <ArrowRight size={16}/>
          </button>
        </article>)}
      </div>
    </section>}
    {media.length > 0 && <section className="noble-detail-section"
      aria-label="Galería visual de la historia">
      <div className="noble-detail-section-heading">
        <span className="overline"><ImageIcon size={15}/> GALERÍA DEL MUNDO</span>
        <h2>Escenarios e ilustraciones</h2>
      </div>
      <div className="noble-detail-media-strip">
        {media.slice(0, 8).map(asset => <figure key={asset.id}>
          <img src={asset.url} alt={asset.label} loading="lazy"/>
          <figcaption>{asset.label}</figcaption>
        </figure>)}
      </div>
    </section>}
  </section>;
}
