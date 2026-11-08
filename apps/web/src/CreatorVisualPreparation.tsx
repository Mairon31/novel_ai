import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Image as ImageIcon, LoaderCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { api } from './api';
import type { Story, VisualPreparationPlan } from './types';

/** Author-only review surface. Rendering is *never* automatic on mount or refresh. */
export function CreatorVisualPreparation({
  storyId, assetRevision, onGenerated, onOpenCharacters,
}: {
  storyId: string;
  assetRevision: string;
  onGenerated: (story: Story) => void;
  onOpenCharacters: () => void;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<VisualPreparationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
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
