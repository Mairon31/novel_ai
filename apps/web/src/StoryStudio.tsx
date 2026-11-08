import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Feather, LoaderCircle, Plus, X, Upload } from 'lucide-react';
import { api } from './api';
import { VisualReader } from './VisualReader';
import { StoryDetail } from './StoryDetail';
import { VisualStartGate } from './VisualStartGate';
import { streamFailure } from './apiErrors';
import { StoryHub } from './StoryHub';
import type { BranchTree, CreatorBlueprint, CreatorCharacter, CreatorMediaAsset, GenerationEvent, Story, StoryTurn, VisualPreflightStatus } from './types';

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
  const { t } = useTranslation();
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [reading, setReading] = useState(false);
  const [storyMetadata, setStoryMetadata] = useState<CreatorBlueprint | null>(null);
  const [storyCharacters, setStoryCharacters] = useState<CreatorCharacter[]>([]);
  const [storyAssets, setStoryAssets] = useState<CreatorMediaAsset[]>([]);
  const [branchTree, setBranchTree] = useState<BranchTree | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [visualPreflight, setVisualPreflight] = useState<VisualPreflightStatus | null>(null);
  const [visualCheckPending, setVisualCheckPending] = useState(false);
  const [visualCheckError, setVisualCheckError] = useState('');
  const [visualChoiceBusy, setVisualChoiceBusy] = useState(false);
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
  // Store the phase key so in-flight status responds to UI locale changes.
  const [generationMessageKey, setGenerationMessageKey] = useState('feedback.storyPreparingNarrator');
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
        setError(t('feedback.storyLinkError', { error: exc.message }));
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

  useEffect(() => {
    let live = true;
    setVisualPreflight(null);
    setVisualCheckError('');
    setVisualCheckPending(Boolean(active));
    if (active) {
      void api.visualPreflight(active.id).then(status => {
        if (live) setVisualPreflight(status);
      }).catch((exc: Error) => {
        if (live) setVisualCheckError(exc.message);
      }).finally(() => { if (live) setVisualCheckPending(false); });
    }
    return () => { live = false; };
  }, [active?.id]);

  async function refreshVisualPreflight() {
    if (!active || visualChoiceBusy) return;
    const storyId = active.id;
    setVisualCheckPending(true); setVisualCheckError('');
    try {
      const status = await api.visualPreflight(storyId);
      if (activeStoryId.current === storyId) setVisualPreflight(status);
    } catch (exc) {
      if (activeStoryId.current === storyId) setVisualCheckError((exc as Error).message);
    } finally {
      if (activeStoryId.current === storyId) setVisualCheckPending(false);
    }
  }
  async function chooseVisualMode(textOnly: boolean) {
    if (!active || visualChoiceBusy) return;
    const storyId = active.id;
    setVisualChoiceBusy(true); setVisualCheckError('');
    try {
      const next = await api.chooseVisualMode(storyId, textOnly);
      if (activeStoryId.current === storyId) setVisualPreflight(next);
    } catch (exc) {
      if (activeStoryId.current === storyId) setVisualCheckError((exc as Error).message);
    } finally {
      setVisualChoiceBusy(false);
    }
  }
  const currentPreflight = visualPreflight?.story_id === active?.id ? visualPreflight : null;
  const visualStartBlocked = Boolean(active && turns.length === 0 &&
    (visualCheckPending || visualCheckError || !currentPreflight?.ready));
  const startGate = <VisualStartGate
    status={currentPreflight}
    busy={visualCheckPending || visualChoiceBusy}
    error={visualCheckError}
    onRefresh={() => void refreshVisualPreflight()}
    onTextOnly={() => void chooseVisualMode(true)}
    onIllustrated={() => void chooseVisualMode(false)}
    onEdit={() => { if (active) onEditStory?.(active.id); }}/>;

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
      const storyLabel = t(result.restored_stories === 1 ? 'library.oneStory' : 'library.manyStories');
      const assetLabel = t(result.restored_files === 1 ? 'library.oneAsset' : 'library.manyAssets');
      setNotice(t(result.imported_as_copy ? 'library.copyCreated' : 'library.backupRestored',
        { count: result.restored_stories, storyLabel, assets: result.restored_files, assetLabel }));
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
      setCreating(false); setCreateStep('story'); setTitle(''); setPremise(''); setProtagonistName(''); setNotice(t('feedback.storyCreated'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setLoading(false); }
  }

  async function submit(continueOnly = false) {
    if (!active || generating || visualStartBlocked || (!continueOnly && !draft.trim())) return;
    const controllerLocal = new AbortController();
    const requestId = crypto.randomUUID();
    controller.current = controllerLocal;
    inFlight.current = { storyId: active.id, requestId };
    setGenerating(true); setGenerationMessageKey('feedback.storyPreparingNarrator'); setStreamText(''); setNotice(''); setError('');
    let complete = false;
    try {
      await api.streamTurn(active.id, {
        mode: continueOnly ? 'continue' : mode,
        input_text: continueOnly ? '' : draft.trim(),
        request_id: requestId,
      }, controllerLocal.signal, (evt: GenerationEvent) => {
        if (evt.event === 'status') setGenerationMessageKey('storySse.' + evt.data.phase);
        if (evt.event === 'delta') setStreamText(text => text + evt.data.text);
        if (evt.event === 'error') throw streamFailure(evt.data);
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
      if (!complete) throw new Error(t('storyUi.connectionIncomplete'));
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
    if (!active || openingBusy || turnsLoading || turns.length || visualStartBlocked) return;
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
      setNotice(t('feedback.storyBranchCreated'));
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
    setNotice(t('feedback.storyCancelRequested'));
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
      <button className="noble-return-library" aria-label={t("library.returnLibrary")} onClick={() => {
        abortCurrentNarration();
        setGenerating(false); setStreamText(''); setDraft(''); setActive(null); setReading(false);
        onRouteChange?.(null, false);
      }}><ArrowLeft size={19}/> {t("nav.inicio")}</button>
      <div className="noble-reading-navigation-title">
        <strong>{active.title}</strong><span>{t('library.playingAs', { name: active.protagonist_name || t('library.protagonist') })}</span>
      </div>
      {branchTree && branchTree.branches.length > 1 && <select
        aria-label={t("library.switchBranch")} value={active.id} disabled={generating}
        onChange={event => void switchBranch(event.target.value, true)}>
        {branchTree.branches.map(branch => <option key={branch.id} value={branch.id}>
          {'· '.repeat(branch.depth)}{branch.title} ({t('storyUi.branchTurns', { amount: branch.turn_count })})
        </option>)}
      </select>}
      <button className="noble-reader-settings-link" onClick={onOpenSettings}>{t("common.settings")}</button>
    </div> : active ? <>
      {visualStartBlocked && startGate}
      {!visualStartBlocked && currentPreflight?.text_only &&
       !currentPreflight.has_started && currentPreflight.mode !== 'text' &&
        <div className="noble-visual-choice-note" role="status">
          <span>{t('visualStart.textOnlyActive')}</span>
          <button type="button" className="secondary-button"
            disabled={visualChoiceBusy} onClick={() => void chooseVisualMode(false)}>
            {t('visualStart.requireVisuals')}
          </button>
        </div>}
      <StoryDetail story={active} turns={turns} metadata={storyMetadata}
      characters={storyCharacters} media={storyAssets} openingBusy={openingBusy || turnsLoading}
      error={error}
      onBack={() => { setActive(null); setReading(false); onRouteChange?.(null, false); }}
      onContinue={() => { setReading(true); onRouteChange?.(active.id, true); }}
      onStartOpening={index => void startOpening(index)}
      branches={branchTree?.branches || []}
      onChooseBranch={id => void switchBranch(id)}
      onEdit={() => onEditStory?.(active.id)}/>
      </> : <div className="noble-library-home">
      <div className="noble-library-hero">
        <div><span className="eyebrow"><Feather size={15}/> {t("library.universe")}</span>
          <h1>{t("library.headline")}</h1>
          <p>{t("library.description")}</p>
          <button className="primary-button" onClick={() => {
            setCreating(true); setCreateStep('story');
          }}><Plus size={17}/> {t("library.newStory")}</button>
          {' '}
          <button className="secondary-button" disabled={restoring}
            onClick={() => archiveFile.current?.click()}>
            {restoring ? <LoaderCircle size={17} className="rotating"/> : <Upload size={17}/>}
            {restoring ? t('library.restoringBackup') : t('library.importBackup')}
          </button>
          <input ref={archiveFile} type="file" hidden accept=".zip,.noble.zip"
            aria-label={t('a11y.storyBackupFile')}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void importArchive(file);
            }}/>
          <label className="noble-backup-copy-choice">
            <input type="checkbox" checked={restoreAsCopy}
              onChange={event => setRestoreAsCopy(event.target.checked)}/>
            {t("library.importCopy")}
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
        setNotice(t('library.storyInstalled'));
        onRouteChange?.(story.id, false);
      }}/>
      <div className="noble-library-section-heading">
        <div><span className="overline">{t("library.yourCollection")}</span><h2>{t("library.myStories")} <small>{stories.length}</small></h2></div>
        {loading && <div className="loading"><LoaderCircle className="rotating" size={15}/> {t("common.loading")}</div>}
      </div>
      <div className="noble-library-cover-grid">
        {stories.map(s => <button key={s.id} className="noble-library-cover"
          onClick={() => selectStory(s)} disabled={generating}>
          <div className="noble-library-cover-art"
            style={s.cover_image_url || s.scene_image_url ? {backgroundImage:'url("'+(s.cover_image_url || s.scene_image_url)+'")'}:undefined}>
            {!(s.cover_image_url || s.scene_image_url) && <BookOpen size={38}/>}
            <span>{s.origin_story_id ? t('library.branch') : t('library.story')}</span>
          </div>
          <div className="noble-library-cover-copy"><strong>{s.title}</strong>
            <small>{t('library.protagonist')} · {s.protagonist_name || t('library.unnamed')}</small>
            <p>{s.premise}</p>
            <div><span>{t("library.continueReading")}</span><ChevronRight size={17}/></div>
          </div>
        </button>)}
        {!loading && stories.length===0 && <div className="noble-library-empty">
          <BookOpen size={38}/><h3>{t("library.noStories")}</h3>
          <p>{t("library.noStoriesHint")}</p>
          <button className="secondary-button" onClick={() => setCreating(true)}>{t("library.createStory")}</button>
        </div>}
      </div>
    </div>}
    {active && reading && (visualStartBlocked ? startGate : <VisualReader active={active} turns={turns}
      mode={mode} setMode={setMode} draft={draft} setDraft={setDraft}
      streamText={streamText} generating={generating} generationMessage={t(generationMessageKey)}
      onCancel={cancelGeneration} onFork={createBranch} notice={notice} error={error}
      onSubmit={continueOnly => void submit(continueOnly)}
      onCreate={() => { setCreateStep('story'); setCreating(true); }}
      onSettings={onOpenSettings}
      onUpdateStory={next => {
        // A slow image upload or generation must not jump back to an old story.
        setActive(current => current?.id === next.id ? next : current);
        setStories(old => old.map(item => item.id === next.id ? next : item));
      }}/>)}
    {creating && <div className="welcome-scrim"><section className="welcome-panel" role="dialog"
      aria-modal="true" aria-label={t("library.createDialog")}>
      <div className="story-create-heading"><div className="welcome-icon"><Feather size={29}/></div>
        <button aria-label={t('a11y.storyCloseCreator')} className="icon-button" onClick={() => setCreating(false)}><X size={19}/></button></div>
      <span className="overline">{t(createStep === 'story' ? 'story.stepWorld' : 'story.stepCharacter')}</span>
      {createStep === 'story' ? <>
        <h2>{t("library.startNew")}</h2>
        <p>{t("library.defineOpening")}</p>
        <label className="form-label" htmlFor="story-title">{t("library.title")}</label>
        <input id="story-title" className="story-create-input" maxLength={100} value={title}
          onChange={e => setTitle(e.target.value)} placeholder={t('story.titlePlaceholder')}/>
        <label className="form-label" htmlFor="story-premise">{t("library.worldPremise")}</label>
        <textarea id="story-premise" className="story-create-input" value={premise}
          onChange={e => setPremise(e.target.value)} rows={5} maxLength={4000}
          placeholder={t('story.premisePlaceholder')}/>
      </> : <>
        <div className="noble-create-character"><div className="noble-create-avatar"><Feather size={33}/></div>
          <span>{t('story.playingAsLabel')}</span></div>
        <h2>{t("library.namePrompt")}</h2>
        <p>{t("library.nameDescription")}</p>
        <label className="form-label" htmlFor="story-protagonist">{t("library.protagonistName")}</label>
        <input id="story-protagonist" className="story-create-input noble-name-input"
          value={protagonistName} maxLength={60} autoFocus
          onChange={e => setProtagonistName(e.target.value)} placeholder={t('story.namePlaceholder')}/>
      </>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {createStep === 'story' ? <button className="primary-button full"
        disabled={loading || title.trim().length < 2 || premise.trim().length < 10}
        onClick={() => setCreateStep('protagonist')}>
        <ArrowRight size={17}/> {t("library.chooseProtagonist")}</button> :
        <div className="noble-create-actions">
          <button className="secondary-button" onClick={() => setCreateStep('story')}>{t("common.back")}</button>
          <button className="primary-button" disabled={loading || !protagonistName.trim()}
            onClick={() => void createStory()}><ArrowRight size={17}/> {t("library.startStory")}</button>
        </div>}
    </section></div>}
  </section>;
}
