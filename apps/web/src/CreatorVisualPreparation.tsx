import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Image as ImageIcon, LoaderCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { api } from './api';
import type { Story, VisualAsset, VisualPreparationPlan } from './types';

/** Author-only review surface. Rendering is *never* automatic on mount or refresh. */
export function CreatorVisualPreparation({
  storyId, storyTitle, galleryAssets, assetRevision,
  onGenerated, onCoverApproved, onOpenCharacters,
}: {
  storyId: string;
  storyTitle: string;
  galleryAssets: VisualAsset[];
  assetRevision: string;
  onGenerated: (story: Story) => void;
  onCoverApproved: (story: Story) => Promise<void>;
  onOpenCharacters: () => void;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<VisualPreparationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [coverApproving, setCoverApproving] = useState(false);
  const [coverGalleryId, setCoverGalleryId] = useState('');
  const [coverLabel, setCoverLabel] = useState(storyTitle);
  const [coverCaption, setCoverCaption] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prompt, setPrompt] = useState('');
  const [revision, setRevision] = useState(0);
  const latestRequest = useRef(0);
  useEffect(() => {
    setPrompt('');
    setPlan(null);
    setError('');
    setNotice('');
    setCoverGalleryId('');
    setCoverLabel(storyTitle);
    setCoverCaption('');
  }, [storyId]);
  useEffect(() => {
    let alive = true;
    const request = ++latestRequest.current;
    setLoading(true);
    void api.visualPreparationPlan(storyId).then(next => {
      if (!alive || latestRequest.current !== request) return;
      setPlan(next);
      setPrompt(previous => previous || next.steps.find(item => item.kind === 'background')?.prompt || '');
    }).catch((exc: Error) => {
      if (alive && latestRequest.current === request) setError(exc.message);
    }).finally(() => {
      if (alive && latestRequest.current === request) setLoading(false);
    });
    return () => { alive = false; };
  }, [storyId, assetRevision, revision]);

  async function renderFirstBackground() {
    if (generating || !plan || plan.has_started ||
        !plan.steps.some(step => step.kind === 'background') ||
        prompt.trim().length < 8) return;
    const story = storyId;
    setGenerating(true); setError(''); setNotice('');
    try {
      // Existing renderer provides real ComfyUI status, GPU policy, persistence
      // and gallery selection. No fake job state and no automatic requests.
      const generated = await api.illustrate(story, prompt.trim());
      onGenerated(generated.story);
      setNotice(t('visualPrep.backgroundSaved'));
      setRevision(n => n + 1);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const backgroundPending = Boolean(plan?.steps.some(item => item.kind === 'background'));
  const coverPending = Boolean(plan?.steps.some(item => item.kind === 'cover'));
  const reviewedGallery = galleryAssets.find(item => item.id === coverGalleryId) ||
    galleryAssets.find(item => item.selected) || galleryAssets[0];
  const selectionId = reviewedGallery?.id || '';
  useEffect(() => {
    setCoverCaption('');
  }, [storyId]);
  useEffect(() => {
    if (reviewedGallery && !coverCaption.trim()) {
      setCoverCaption((reviewedGallery.prompt || t('visualPrep.defaultCoverCaption')).slice(0, 220));
    }
  }, [reviewedGallery?.id, storyId]);

  async function approveCover() {
    if (!coverPending || !selectionId || coverApproving || generating ||
        coverLabel.trim().length < 1 || coverCaption.trim().length < 3) return;
    const story = storyId;
    setCoverApproving(true); setError(''); setNotice('');
    try {
      const result = await api.approveGalleryCover(story, {
        gallery_asset_id: selectionId,
        label: coverLabel.trim(), caption: coverCaption.trim(),
      });
      await onCoverApproved(result.story);
      setNotice(t(result.reused ? 'visualPrep.coverReselected' : 'visualPrep.coverApproved'));
      setRevision(n => n + 1);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setCoverApproving(false);
    }
  }
  return <section className="noble-visual-prep" aria-label={t('visualPrep.title')}>
    <header className="noble-visual-prep-header">
      <div>
        <h3><ImageIcon size={18}/> {t('visualPrep.title')}</h3>
        <p>{t('visualPrep.explain')}</p>
      </div>
      <button type="button" className="secondary-button"
        disabled={loading || generating} onClick={() => setRevision(n => n + 1)}>
        <RefreshCcw size={15}/> {t('visualPrep.refresh')}
      </button>
    </header>
    {loading && <p role="status"><LoaderCircle className="rotating" size={15}/>
      {' '}{t('visualPrep.checking')}</p>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {notice && <p role="status" className="narrative-saved">{notice}</p>}
    {plan && <>
      {plan.mode === 'text' && <p>{t('visualPrep.textMode')}</p>}
      {plan.has_started && <p>{t('visualPrep.alreadyStarted')}</p>}
      {plan.mode !== 'text' && !plan.has_started && !plan.steps.length &&
        <p><CheckCircle2 size={17}/> {t('visualPrep.allReady')}</p>}
      {plan.steps.length > 0 && <ol className="noble-visual-prep-steps">
        {plan.steps.map((item, i) => <li key={item.character_id || item.kind + i}>
          <strong>{item.kind === 'cover' ? t('visualPrep.cover') :
            item.kind === 'background' ? t('visualPrep.background') :
            t('visualPrep.character', { name: item.name || t('visualStart.unnamedCharacter') })}</strong>
          <p>{t('visualPrep.' + item.action)}</p>
          {item.kind === 'cover' && <details>
            <summary>{t('visualPrep.suggestedCoverPrompt')}</summary>
            <p>{item.prompt}</p>
          </details>}
          {item.kind === 'character' && <button type="button"
            className="secondary-button" disabled={generating} onClick={onOpenCharacters}>
            {t('visualPrep.openCast')}
          </button>}
        </li>)}
      </ol>}
      {coverPending && !plan.has_started && galleryAssets.length > 0 &&
        <div className="noble-visual-prep-cover">
          <h4>{t('visualPrep.reviewCoverTitle')}</h4>
          <p>{t('visualPrep.reviewCoverHint')}</p>
          <label>{t('visualPrep.galleryImage')}
            <select aria-label={t('visualPrep.galleryImage')}
              disabled={coverApproving || generating}
              value={selectionId}
              onChange={e => {
                setCoverGalleryId(e.target.value);
                const chosen = galleryAssets.find(item => item.id === e.target.value);
                setCoverCaption((chosen?.prompt || t('visualPrep.defaultCoverCaption')).slice(0, 220));
              }}>
              {galleryAssets.map(asset => <option key={asset.id} value={asset.id}>
                {asset.origin === 'comfyui' ? 'ComfyUI' : t('reader.imported')} · {asset.id.slice(0, 8)}
              </option>)}
            </select>
          </label>
          {reviewedGallery && <img src={reviewedGallery.url}
            alt={t('visualPrep.galleryPreviewAlt')} loading="lazy"/>}
          <label>{t('visualPrep.coverName')}
            <input aria-label={t('visualPrep.coverName')} maxLength={100}
              disabled={coverApproving || generating}
              value={coverLabel} onChange={e => setCoverLabel(e.target.value)}/>
          </label>
          <label>{t('visualPrep.coverCaption')}
            <textarea aria-label={t('visualPrep.coverCaption')} rows={3} maxLength={220}
              disabled={coverApproving || generating} value={coverCaption}
              onChange={e => setCoverCaption(e.target.value)}/>
          </label>
          <button type="button" className="primary-button"
            disabled={coverApproving || generating || loading ||
              coverLabel.trim().length < 1 || coverCaption.trim().length < 3}
            onClick={() => void approveCover()}>
            {coverApproving && <LoaderCircle className="rotating" size={16}/>}
            {t('visualPrep.approveAsCover')}
          </button>
        </div>}
      {backgroundPending && !plan.has_started &&
        <div className="noble-visual-prep-generate">
          <label>{t('visualPrep.backgroundPrompt')}
            <textarea aria-label={t('visualPrep.backgroundPrompt')}
              rows={4} maxLength={2400} value={prompt}
              disabled={generating} onChange={e => setPrompt(e.target.value)}/>
          </label>
          <p>{t('visualPrep.generationExplicit')}</p>
          <button className="primary-button" type="button"
            disabled={generating || loading || prompt.trim().length < 8}
            onClick={() => void renderFirstBackground()}>
            {generating ? <LoaderCircle className="rotating" size={16}/> :
              <Sparkles size={16}/>}
            {generating ? t('visualPrep.generating') : t('visualPrep.generateBackground')}
          </button>
        </div>}
      <small>{t('visualPrep.noAuto')}</small>
    </>}
  </section>;
}
