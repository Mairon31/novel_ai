import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock3, Feather, GitBranch,
  Image as ImageIcon, PencilLine, Play, UserRound, Users, Download,
} from 'lucide-react';
import type {
  Story, StoryTurn, CreatorBlueprint, CreatorCharacter, CreatorMediaAsset, BranchTree,
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
  branches: BranchTree['branches'];
  onChooseBranch: (storyId: string) => void;
}

function date(value: number) {
  if (!value || !Number.isFinite(value)) return 'Date unavailable';
  return new Intl.DateTimeFormat('es-419', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value * 1000));
}

function preview(text: string, protagonist: string) {
  return text.replace(/\{\{user\}\}/g, protagonist || 'Protagonist');
}

/** Player-facing editorial page. Never display AI-only plot, reminders or dialogue prompts. */
export function StoryDetail({
  story, turns, metadata, characters, media, openingBusy, error,
  onBack, onContinue, onEdit, onStartOpening, branches, onChooseBranch,
}: Props) {
  const last = turns.at(-1);
  const description = metadata?.synopsis.trim() || story.premise;
  const publicPlot = metadata?.player_plot.trim();
  const openings = turns.length ? [] : (metadata?.opening_scenarios || []);
  const heroArt = story.cover_image_url || story.scene_image_url ||
    media.find(item => item.kind === 'background')?.url || null;

  return <section className="noble-story-detail" aria-label={'Details of ' + story.title}>
    <div className="noble-story-detail-cover"
      style={heroArt ? { backgroundImage: 'url("' + heroArt + '")' } : undefined}>
      <div className="noble-story-cover-shade"/>
      <button className="noble-story-detail-back" onClick={onBack} disabled={openingBusy}>
        <ArrowLeft size={18}/> Return to library
      </button>
      {!heroArt && <div className="noble-story-cover-empty"><BookOpen size={76}/></div>}
      <div className="noble-story-detail-heading">
        <span className="noble-story-detail-overline">
          {story.origin_story_id ? <GitBranch size={15}/> : <Feather size={15}/>}
          {story.origin_story_id ? 'ALTERNATE BRANCH' : 'YOUR STORY'}
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
            <Play size={17}/> Choose an opening <ArrowRight size={16}/>
          </button> : <button className="primary-button" onClick={onContinue}>
            <Play size={17}/> {turns.length ? 'Continue story' : 'Start story'} <ArrowRight size={16}/>
          </button>}
          <button className="secondary-button" onClick={onEdit}>
            <PencilLine size={16}/> Edit in Creator Studio
          </button>
          <a className="secondary-button" role="link"
            href={'/api/v1/stories/' + encodeURIComponent(story.id) + '/archive.noble.zip'}
            download="noble-family.noble.zip" aria-label="Download full backup">
            <Download size={16}/> Back up story and branches
          </a>
        </div>
      </div>
    </div>
    {error && <p className="narrative-error" role="alert">{error}</p>}
    <div className="noble-story-detail-body">
      <div className="noble-story-detail-overview">
        <div><UserRound size={18}/><span>Protagonist</span><strong>{story.protagonist_name || 'Not assigned'}</strong></div>
        <div><BookOpen size={18}/><span>Story turns</span><strong>{turns.length}</strong></div>
        <div><CalendarDays size={18}/><span>Created</span><strong>{date(story.created_at)}</strong></div>
        <div><Clock3 size={18}/><span>Updated</span><strong>{date(story.updated_at)}</strong></div>
      </div>
      <article className="noble-story-detail-resume">
        <span className="overline">{last ? 'YOUR ADVENTURE' : 'THE WORLD'}</span>
        <h2>{last ? 'Where your story left off' : 'Before you begin'}</h2>
        <p>{last ? last.assistant_text.slice(0, 700) :
          preview(publicPlot || story.premise, story.protagonist_name)}</p>
        {last && <button className="noble-story-detail-resume-link" onClick={onContinue}>
          Continue from this scene <ArrowRight size={16}/>
        </button>}
      </article>
    </div>
    {branches.length > 1 && <section className="noble-detail-section"
      aria-label="Narrative branch tree">
      <div className="noble-detail-section-heading">
        <span className="overline"><GitBranch size={16}/> CONNECTED STORIES</span>
        <h2>Branch tree <small>{branches.length}</small></h2>
        <p>Explore saved branches without modifying their turns or choices.</p>
      </div>
      <div className="noble-route-list">
        {branches.map(branch => <button key={branch.id}
          type="button" disabled={branch.is_selected || openingBusy}
          className={'noble-route-node ' + (branch.is_selected ? 'is-selected' : '')}
          style={{ marginLeft: Math.min(branch.depth, 6) * 24 }}
          aria-label={'Open branch ' + branch.title}
          onClick={() => onChooseBranch(branch.id)}>
          <GitBranch size={18}/>
          <span><strong>{branch.title}</strong><small>
            {branch.depth === 0 ? 'Main story' : 'Alternate branch'}
            {' · '}{branch.turn_count} saved scenes
            {branch.is_selected ? ' · Current route' : ''}
          </small></span>
          {!branch.is_selected && <ArrowRight size={16}/>}
        </button>)}
      </div>
    </section>}
    {characters.length > 0 && <section className="noble-detail-section"
      aria-label="Story characters">
      <div className="noble-detail-section-heading">
        <span className="overline"><Users size={15}/> CONOCE AL ELENCO</span>
        <h2>Characters in this world <small>{characters.length}</small></h2>
        <p>Meet the characters who may accompany you.</p>
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
      id="noble-story-openings" aria-label="Opening scenes">
      <div className="noble-detail-section-heading">
        <span className="overline"><Feather size={15}/> YOUR FIRST DECISION</span>
        <h2>Choose how the story begins</h2>
        <p>Choose an opening scene. It will be saved as
          the first turn of this story without generating additional text.</p>
      </div>
      <div className="noble-detail-openings-grid">
        {openings.map((opening, index) => <article className="noble-detail-opening" key={index}>
          <div className="noble-detail-opening-label">
            <span>SCENE {String(index + 1).padStart(2, '0')}</span>
            <BookOpen size={18} aria-hidden="true"/>
          </div>
          <p>{preview(opening, story.protagonist_name)}</p>
          <button className="secondary-button" disabled={openingBusy}
            onClick={() => onStartOpening(index)}>
            <Play size={16}/> {openingBusy ? 'Saving opening...' : 'Start with this opening'}
            <ArrowRight size={16}/>
          </button>
        </article>)}
      </div>
    </section>}
    {media.some(asset => asset.kind !== 'cover') && <section className="noble-detail-section"
      aria-label="Story art gallery">
      <div className="noble-detail-section-heading">
        <span className="overline"><ImageIcon size={15}/> WORLD GALLERY</span>
        <h2>Scenes and illustrations</h2>
      </div>
      <div className="noble-detail-media-strip">
        {media.filter(asset => asset.kind !== 'cover').slice(0, 8).map(asset => <figure key={asset.id}>
          <img src={asset.url} alt={asset.label} loading="lazy"/>
          <figcaption>{asset.label}</figcaption>
        </figure>)}
      </div>
    </section>}
  </section>;
}
