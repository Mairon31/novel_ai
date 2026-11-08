import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { api } from './api';
import type { ImageGenerationJob, Story } from './types';

/** Durable image jobs: polling only reads state; rendering requires an explicit click. */
export function CreatorImageJobQueue({
  storyId, prompt, disabled, onGenerated,
}: {
  storyId: string; prompt: string; disabled: boolean;
  onGenerated: (story: Story) => void;
}) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ImageGenerationJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const reported = useRef(new Set<string>());
  const callback = useRef(onGenerated);
  callback.current = onGenerated;
  const active = jobs.some(job => job.status === 'queued' || job.status === 'running');
  const latest = jobs[0];

  useEffect(() => {
    reported.current.clear();
    setJobs([]);
    setError('');
    setNotice('');
  }, [storyId]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await api.imageJobs(storyId);
        if (!alive) return;
        setJobs(result.jobs);
        const newest = result.jobs[0];
        if (newest?.status === 'succeeded' && !reported.current.has(newest.id)) {
          reported.current.add(newest.id);
          const story = await api.story(storyId);
          if (alive) {
            callback.current(story);
            setNotice(t('visualPrep.backgroundSaved'));
          }
        }
      } catch (exc) {
        if (alive) setError((exc as Error).message);
      }
    }
    void refresh();
    // Keep the panel quiet when idle. A reload reconciles an in-flight job
    // via its first GET; only active jobs need periodic polling.
    const timer = active ? window.setInterval(() => void refresh(), 1500) : null;
    return () => {
      alive = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [storyId, active, refreshKey]);

  async function submit() {
    if (submitting || controlling || active || disabled || prompt.trim().length < 8) return;
    setSubmitting(true); setError(''); setNotice('');
    try {
      const job = await api.submitImageJob(storyId, crypto.randomUUID(), prompt.trim());
      setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)]);
      setRefreshKey(n => n + 1);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function control(action: 'retry' | 'cancel', id: string) {
    if (controlling || submitting) return;
    setControlling(true); setError(''); setNotice('');
    try {
      const job = await api.imageJobAction(storyId, id, action);
      setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)]);
      setRefreshKey(n => n + 1);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setControlling(false);
    }
  }

  return <div className="noble-image-job-queue">
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {notice && <p role="status" className="narrative-saved">{notice}</p>}
    {latest && <div role="status" className="noble-image-job">
      <strong>{t('visualPrep.jobStatus', {
        status: {
          queued: t('visualPrep.status_queued'),
          running: t('visualPrep.status_running'),
          succeeded: t('visualPrep.status_succeeded'),
          failed: t('visualPrep.status_failed'),
          cancelled: t('visualPrep.status_cancelled'),
          interrupted: t('visualPrep.status_interrupted'),
        }[latest.status],
      })}</strong>
      <small>{t('visualPrep.jobSeed', { seed: latest.seed })}</small>
      {(latest.status === 'failed' || latest.status === 'interrupted' ||
        latest.status === 'cancelled') && <button type="button"
        className="secondary-button" disabled={controlling || submitting}
        onClick={() => void control('retry', latest.id)}>
          {t('visualPrep.retryJob')}
        </button>}
      {(latest.status === 'queued' || latest.status === 'running') &&
        <button type="button" className="secondary-button"
          disabled={controlling || submitting}
          onClick={() => void control('cancel', latest.id)}>
          {t('visualPrep.cancelJob')}
        </button>}
      {latest.error && <>
        <p role="alert">{t('visualPrep.jobFailureSummary')}</p>
        <details>
          <summary>{t('visualPrep.jobDetails')}</summary>
          <pre>{latest.error}</pre>
        </details>
      </>}
    </div>}
    <button className="primary-button" type="button"
      disabled={disabled || submitting || controlling || active || prompt.trim().length < 8}
      onClick={() => void submit()}>
      {submitting ? <LoaderCircle className="rotating" size={16}/> :
        <Sparkles size={16}/>}
      {submitting ? t('visualPrep.queuing') : t('visualPrep.generateBackground')}
    </button>
  </div>;
}
