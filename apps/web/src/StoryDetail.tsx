import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock3, Feather, GitBranch, PencilLine, Play, UserRound } from 'lucide-react';
import type { Story, StoryTurn } from './types';

type StoryMetadata = { synopsis: string; genre: string; tags: string[] };
interface Props {
  story: Story;
  turns: StoryTurn[];
  metadata: StoryMetadata | null;
  onBack: () => void;
  onContinue: () => void;
  onEdit: () => void;
}

function date(value: number) {
  if (!value || !Number.isFinite(value)) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-419', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value * 1000));
}

/** A book-detail destination, separate from both the bookshelf and reading room. */
export function StoryDetail({ story, turns, metadata, onBack, onContinue, onEdit }: Props) {
  const last = turns.at(-1);
  const description = metadata?.synopsis.trim() || story.premise;
  return <section className="noble-story-detail" aria-label={'Detalle de ' + story.title}>
    <div className="noble-story-detail-cover"
      style={story.scene_image_url ? { backgroundImage: 'url("' + story.scene_image_url + '")' } : undefined}>
      <div className="noble-story-cover-shade"/>
      <button className="noble-story-detail-back" onClick={onBack}>
        <ArrowLeft size={18}/> Volver a biblioteca
      </button>
      {!story.scene_image_url && <div className="noble-story-cover-empty"><BookOpen size={76}/></div>}
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
          <button className="primary-button" onClick={onContinue}>
            <Play size={17}/> {turns.length ? 'Continuar historia' : 'Comenzar historia'} <ArrowRight size={16}/>
          </button>
          <button className="secondary-button" onClick={onEdit}><PencilLine size={16}/> Editar en Creator Studio</button>
        </div>
      </div>
    </div>
    <div className="noble-story-detail-body">
      <div className="noble-story-detail-overview">
        <div><UserRound size={18}/><span>Protagonista</span><strong>{story.protagonist_name || 'Sin asignar'}</strong></div>
        <div><BookOpen size={18}/><span>Intervenciones recientes</span><strong>{turns.length}</strong></div>
        <div><CalendarDays size={18}/><span>Creada</span><strong>{date(story.created_at)}</strong></div>
        <div><Clock3 size={18}/><span>Actualizada</span><strong>{date(story.updated_at)}</strong></div>
      </div>
      <article className="noble-story-detail-resume">
        <span className="overline">TU AVENTURA</span>
        <h2>{last ? 'Donde quedó tu historia' : 'Antes de comenzar'}</h2>
        <p>{last ? last.assistant_text.slice(0, 700) : story.premise}</p>
        {last && <button className="noble-story-detail-resume-link" onClick={onContinue}>
          Retomar desde esta escena <ArrowRight size={16}/>
        </button>}
      </article>
    </div>
  </section>;
}
