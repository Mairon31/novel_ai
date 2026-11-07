import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Feather, LoaderCircle, Plus, X, Upload } from 'lucide-react';
import { api } from './api';
import { VisualReader } from './VisualReader';
import { StoryDetail } from './StoryDetail';
import { StoryHub } from './StoryHub';
import type { BranchTree, CreatorBlueprint, CreatorCharacter, CreatorMediaAsset, GenerationEvent, Story, StoryTurn } from './types';

interface StoryStudioProps {
  onOpenSettings: () => void;
  onReadingChange?: (reading: boolean) => void;
  onEditStory?: (storyId: string) => void;
  routeStoryId?: string | null;
  routeReading?: boolean;
  onRouteChange?: (storyId: string | null, reading: boolean) => void;
}

export function StoryStudio({
  onOpenSettings, onReadingChange, onEditStory,
  routeStoryId, routeReading = false, onRouteChange,
}: StoryStudioProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [reading, setReading] = useState(false);
  const [storyMetadata, setStoryMetadata] = useState<CreatorBlueprint | null>(null);
  const [storyCharacters, setStoryCharacters] = useState<CreatorCharacter[]>([]);
  const [storyAssets, setStoryAssets] = useState<CreatorMediaAsset[]>([]);
  const [branchTree, setBranchTree] = useState<BranchTree | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [turns, setTurns] = useState<StoryTurn[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreAsCopy, setRestoreAsCopy] = useState(false);
  const archiveFile = useRef<HTMLInputElement | null>(null);
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
  const inFlight = useRef<{ storyId: string; requestId: string } | null>(null);
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
    return () => { alive = false; abortCurrentNarration(); };
  }, []);
  useEffect(() => {
    onReadingChange?.(Boolean(active && reading));
  }, [active?.id, reading, onReadingChange]);
  useEffect(() => {
    let alive = true;
    const current = activeStoryId.current;
    if (!routeStoryId) {
      if (current) abortCurrentNarration();
      setActive(null);
      setReading(false);
    } else if (current === routeStoryId) {
      setReading(routeReading);
    } else {
      void api.story(routeStoryId).then(story => {
        if (!alive) return;
        abortCurrentNarration();
        setActive(story);
        setReading(routeReading);
      }).catch((exc: Error) => {
        if (!alive) return;
        setActive(null);
        setReading(false);
        setError('Could not open story link: ' + exc.message);
      });
    }
    return () => { alive = false; };
    // URL route drives navigation; callback identity must not reset the reader.
  }, [routeStoryId, routeReading]);
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
    setBranchTree(null);
    if (active) {
      void api.storyBranches(active.id).then(tree => {
        if (alive) setBranchTree(tree);
      }).catch(() => { /* Reader and library remain usable without the tree. */ });
    }
    return () => { alive = false; };
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

  async function importArchive(file: File) {
    setRestoring(true);
    setError(''); setNotice('');
    try {
      const result = await api.importStoryArchive(file, restoreAsCopy);
      const fresh = await api.stories();
      setStories(fresh.stories);
      setActive(null);
      setReading(false);
      onRouteChange?.(null, false);
      setNotice((result.imported_as_copy ? 'Copia independiente creada: ' : 'Respaldo restaurado: ') +
        result.restored_stories + ' stories and ' + result.restored_files + ' assets.');
    } catch (e) { setError((e as Error).message); }
    finally { setRestoring(false); }
  }

  async function createStory() {
    if (title.trim().length < 2 || premise.trim().length < 10 || !protagonistName.trim()) return;
    setError(''); setLoading(true);
    try {
      const story = await api.createStory(title.trim(), premise.trim(), protagonistName.trim());
      setStories(previous => [story, ...previous]);
      setActive(story); setReading(true);
      onRouteChange?.(story.id, true);
      setCreating(false); setCreateStep('story'); setTitle(''); setPremise(''); setProtagonistName(''); setNotice('Story created. You can begin when ready.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setLoading(false); }
  }

  async function submit(continueOnly = false) {
    if (!active || generating || (!continueOnly && !draft.trim())) return;
    const controllerLocal = new AbortController();
    const requestId = crypto.randomUUID();
    controller.current = controllerLocal;
    inFlight.current = { storyId: active.id, requestId };
    setGenerating(true); setGenerationMessage('Preparando narrador...'); setStreamText(''); setNotice(''); setError('');
    let complete = false;
    try {
      await api.streamTurn(active.id, {
        mode: continueOnly ? 'continue' : mode,
        input_text: continueOnly ? '' : draft.trim(),
        request_id: requestId,
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
      if (!complete) throw new Error('Connection ended without committing the turn.');
    } catch (exc) {
      if (!controllerLocal.signal.aborted) setError((exc as Error).message);
    } finally {
      // An older aborted request must not reset a newer ongoing generation.
      if (controller.current === controllerLocal) {
        controller.current = null;
        inFlight.current = null;
        setGenerating(false);
      }
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
      onRouteChange?.(storyId, true);
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
      onRouteChange?.(copy.id, true);
      setDraft('');
      setNotice('Branch created. Continue along a different path without modifying the original story.');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  function abortCurrentNarration() {
    const request = inFlight.current;
    inFlight.current = null;
    controller.current?.abort();
    controller.current = null;
    if (request) {
      // The server-side signal handles providers stalled without sending
      // more tokens. AbortController still stops local browser rendering.
      void api.cancelNarration(request.storyId, request.requestId).catch(() => {
        // Best-effort fallback: the original HTTP abort remains in effect.
      });
    }
  }

  function cancelGeneration() {
    abortCurrentNarration();
    setGenerating(false);
    setStreamText('');
    setNotice('Cancellation requested. You can continue once the narrator becomes available.');
  }

  function selectStory(story: Story) {
    abortCurrentNarration();
    setGenerating(false); setStreamText('');
    setDraft(''); setActive(story); setReading(false); setCreating(false);
    onRouteChange?.(story.id, false);
  }
  async function switchBranch(storyId: string, read = false) {
    if (generating || storyId === active?.id) return;
    setError('');
    try {
      const next = await api.story(storyId);
      abortCurrentNarration();
      setGenerating(false); setStreamText(''); setDraft('');
      setActive(next); setReading(read); setCreating(false);
      onRouteChange?.(next.id, read);
    } catch (exc) { setError((exc as Error).message); }
  }


  return <section className={'story-studio ' + (active && reading ? 'is-reading' : 'is-library')}>
    {active && reading ? <div className="noble-reading-navigation">
      <button className="noble-return-library" aria-label="Return to library" onClick={() => {
        abortCurrentNarration();
        setGenerating(false); setStreamText(''); setDraft(''); setActive(null); setReading(false);
        onRouteChange?.(null, false);
      }}><ArrowLeft size={19}/> Library</button>
      <div className="noble-reading-navigation-title">
        <strong>{active.title}</strong><span>Playing as {active.protagonist_name || 'Protagonist'}</span>
      </div>
      {branchTree && branchTree.branches.length > 1 && <select
        aria-label="Switch narrative branch" value={active.id} disabled={generating}
        onChange={event => void switchBranch(event.target.value, true)}>
        {branchTree.branches.map(branch => <option key={branch.id} value={branch.id}>
          {'· '.repeat(branch.depth)}{branch.title} ({branch.turn_count} turns)
        </option>)}
      </select>}
      <button className="noble-reader-settings-link" onClick={onOpenSettings}>Settings</button>
    </div> : active ? <StoryDetail story={active} turns={turns} metadata={storyMetadata}
      characters={storyCharacters} media={storyAssets} openingBusy={openingBusy || turnsLoading}
      error={error}
      onBack={() => { setActive(null); setReading(false); onRouteChange?.(null, false); }}
      onContinue={() => { setReading(true); onRouteChange?.(active.id, true); }}
      onStartOpening={index => void startOpening(index)}
      branches={branchTree?.branches || []}
      onChooseBranch={id => void switchBranch(id)}
      onEdit={() => onEditStory?.(active.id)}/> : <div className="noble-library-home">
      <div className="noble-library-hero">
        <div><span className="eyebrow"><Feather size={15}/> YOUR STORY UNIVERSE</span>
          <h1>Stories to experience, not just read.</h1>
          <p>Choose a world, continue an adventure, or create an original story.
            Your library and reader are separate spaces.</p>
          <button className="primary-button" onClick={() => {
            setCreating(true); setCreateStep('story');
          }}><Plus size={17}/> New story</button>
          {' '}
          <button className="secondary-button" disabled={restoring}
            onClick={() => archiveFile.current?.click()}>
            {restoring ? <LoaderCircle size={17} className="rotating"/> : <Upload size={17}/>}
            {restoring ? 'Restoring backup...' : 'Import .noble.zip backup'}
          </button>
          <input ref={archiveFile} type="file" hidden accept=".zip,.noble.zip"
            aria-label="Noble backup file"
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void importArchive(file);
            }}/>
          <label className="noble-backup-copy-choice">
            <input type="checkbox" checked={restoreAsCopy}
              onChange={event => setRestoreAsCopy(event.target.checked)}/>
            Import as a separate copy (new identifiers)
          </label>
          {notice && <p className="story-notice" role="status">{notice}</p>}
          {error && <p className="narrative-error" role="alert">{error}</p>}
        </div>
        <div className="noble-library-hero-art" aria-hidden="true">
          <BookOpen size={72}/>
        </div>
      </div>
      <StoryHub onInstall={story => {
        setStories(old => [story, ...old.filter(existing => existing.id !== story.id)]);
        setActive(story); setReading(false); setCreating(false);
        setNotice('Story installed. Choose one of the three openings to begin.');
        onRouteChange?.(story.id, false);
      }}/>
      <div className="noble-library-section-heading">
        <div><span className="overline">YOUR COLLECTION</span><h2>My stories <small>{stories.length}</small></h2></div>
        {loading && <div className="loading"><LoaderCircle className="rotating" size={15}/> Loading...</div>}
      </div>
      <div className="noble-library-cover-grid">
        {stories.map(s => <button key={s.id} className="noble-library-cover"
          onClick={() => selectStory(s)} disabled={generating}>
          <div className="noble-library-cover-art"
            style={s.cover_image_url || s.scene_image_url ? {backgroundImage:'url("'+(s.cover_image_url || s.scene_image_url)+'")'}:undefined}>
            {!(s.cover_image_url || s.scene_image_url) && <BookOpen size={38}/>}
            <span>{s.origin_story_id ? 'Alternate branch' : 'Story'}</span>
          </div>
          <div className="noble-library-cover-copy"><strong>{s.title}</strong>
            <small>Protagonist · {s.protagonist_name || 'Unnamed'}</small>
            <p>{s.premise}</p>
            <div><span>Continue reading</span><ChevronRight size={17}/></div>
          </div>
        </button>)}
        {!loading && stories.length===0 && <div className="noble-library-empty">
          <BookOpen size={38}/><h3>Your next adventure begins here</h3>
          <p>Install a ready-made world from the catalog or create an original story.</p>
          <button className="secondary-button" onClick={() => setCreating(true)}>Create story</button>
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
      aria-modal="true" aria-label="Create a new story">
      <div className="story-create-heading"><div className="welcome-icon"><Feather size={29}/></div>
        <button aria-label="Close story creator" className="icon-button" onClick={() => setCreating(false)}><X size={19}/></button></div>
      <span className="overline">{createStep === 'story' ? 'STEP 1 / 2 · THE WORLD' : 'STEP 2 / 2 · YOUR CHARACTER'}</span>
      {createStep === 'story' ? <>
        <h2>Start a new story.</h2>
        <p>Define the opening scene. Images and speech are generated only when requested.</p>
        <label className="form-label" htmlFor="story-title">Title</label>
        <input id="story-title" className="story-create-input" maxLength={100} value={title}
          onChange={e => setTitle(e.target.value)} placeholder="For example: The Forest of Spirits"/>
        <label className="form-label" htmlFor="story-premise">World premise</label>
        <textarea id="story-premise" className="story-create-input" value={premise}
          onChange={e => setPremise(e.target.value)} rows={5} maxLength={4000}
          placeholder="Where it happens, what the world is like, and how your adventure begins..."/>
      </> : <>
        <div className="noble-create-character"><div className="noble-create-avatar"><Feather size={33}/></div>
          <span>YOU ARE PLAYING AS...</span></div>
        <h2>What is your name in this story?</h2>
        <p>This will be the name of the character you control. The narrator will respect your decisions.</p>
        <label className="form-label" htmlFor="story-protagonist">Protagonist name</label>
        <input id="story-protagonist" className="story-create-input noble-name-input"
          value={protagonistName} maxLength={60} autoFocus
          onChange={e => setProtagonistName(e.target.value)} placeholder="Choose your character's name"/>
      </>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {createStep === 'story' ? <button className="primary-button full"
        disabled={loading || title.trim().length < 2 || premise.trim().length < 10}
        onClick={() => setCreateStep('protagonist')}>
        <ArrowRight size={17}/> Choose protagonist</button> :
        <div className="noble-create-actions">
          <button className="secondary-button" onClick={() => setCreateStep('story')}>Back</button>
          <button className="primary-button" disabled={loading || !protagonistName.trim()}
            onClick={() => void createStory()}><ArrowRight size={17}/> Start story</button>
        </div>}
    </section></div>}
  </section>;
}
