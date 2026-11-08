import { useTranslation } from 'react-i18next';
import { BackendDiagnostic } from './BackendDiagnostic';
import { formatUiNumber } from './i18n';
import { useEffect, useState } from 'react';
import { Check, Download, LoaderCircle, RefreshCcw } from 'lucide-react';
import { api } from './api';
import type { CheckpointCatalog, CheckpointDownload, CheckpointInstalled } from './types';

interface Props {
  availableInComfy: string[];
  onSelectCheckpoint: (name: string) => void;
}

/** Image-only checkpoint downloads. No download or GPU work on mount. */
export function ImageCheckpointManager({ availableInComfy, onSelectCheckpoint }: Props) {
  const { t } = useTranslation();
  const [repo, setRepo] = useState('');
  const [catalog, setCatalog] = useState<CheckpointCatalog | null>(null);
  const [installed, setInstalled] = useState<CheckpointInstalled | null>(null);
  const [jobs, setJobs] = useState<CheckpointDownload[]>([]);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const [models, active] = await Promise.all([
      api.checkpointInstalled(), api.checkpointDownloads(),
    ]);
    setInstalled(models);
    setJobs(active.downloads);
  }

  useEffect(() => {
    let live = true;
    Promise.all([api.checkpointInstalled(), api.checkpointDownloads()])
      .then(([models, active]) => {
        if (live) { setInstalled(models); setJobs(active.downloads); }
      }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!jobs.some(j => ['queued', 'downloading', 'verifying'].includes(j.status))) return;
    const id = window.setInterval(() => {
      void refresh().catch((e: Error) => setError(e.message));
    }, 1500);
    return () => window.clearInterval(id);
  }, [jobs]);

  async function inspect() {
    if (busy || !repo.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setCatalog(await api.checkpointLookup(repo.trim()));
      await refresh();
    } catch (e) { setCatalog(null); setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function install(filename: string) {
    if (!catalog || changing) return;
    setChanging(filename); setError(''); setMessage('');
    try {
      await api.checkpointInstall({repo_id: catalog.repo_id,
        filename, revision: catalog.revision});
      await refresh();
      setMessage(t('feedback.checkpointStarted'));
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  async function control(job: CheckpointDownload, action: 'pause' | 'resume' | 'cancel') {
    if (changing) return;
    setChanging(job.id); setError(''); setMessage('');
    try {
      await api.checkpointControl(job.id, action);
      await refresh();
      setMessage(t(action === 'pause' ? 'feedback.downloadPaused' :
        action === 'resume' ? 'feedback.downloadResumed' : 'feedback.downloadCanceled'));
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  function formatted(bytes: number) { return formatUiNumber(bytes / (1024 * 1024), 1) + ' MiB'; }
  const current = catalog?.repo_id;

  return <div className="workspace-panel noble-checkpoint-installer">
    <h3><Download size={18}/> {t('checkpoint.title')}</h3>
    <p>{t('checkpoint.installerHint')}</p>
    <div className="workspace-field-grid">
      <label className="workspace-pref-field">{t('checkpoint.repo')}
        <input aria-label={t('checkpoint.repo')} placeholder="author/model"
          value={repo} disabled={busy || !!changing}
          onChange={e => { setRepo(e.target.value); setCatalog(null); }}/>
      </label>
    </div>
    <div className="settings-buttons">
      <button className="secondary-button" type="button"
        disabled={busy || !!changing || !/^[\w.-]+\/[\w.-]+$/.test(repo.trim())}
        onClick={() => void inspect()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
        {t('checkpointUi.findFiles')}
      </button>
      <button className="secondary-button" type="button" onClick={() =>
        void refresh().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> {t('checkpoint.refresh')}
      </button>
    </div>

    {catalog && <div className="noble-voice-library" aria-label={t('a11y.checkpointRepositories')}>
      <h4>{catalog.repo_id}</h4>
      <p>{t('checkpoint.licenseInfo', { license: catalog.license,
        revision: catalog.revision.slice(0,12) })}</p>
      {!catalog.models.length && <p>{t('checkpoint.emptyCatalog')}</p>}
      {catalog.models.map(model => {
        const job = jobs.find(j => j.repo_id === current && j.filename === model.filename &&
          !['cancelled'].includes(j.status));
        const running = job && ['queued', 'downloading', 'verifying'].includes(job.status);
        return <div className="noble-voice-card" key={model.filename}>
          <div className="noble-voice-main">
            <strong>{model.filename}</strong>
            <span>{formatted(model.size_bytes)} · {t('checkpoint.publishedHash')} ·
              {t(model.installed ? 'checkpoint.installedInNoble' : 'checkpoint.notInstalled')}</span>
            <a href={model.model_card} rel="noopener noreferrer" target="_blank">
              {t('model.card')}</a>
          </div>
          <button className="secondary-button" type="button"
            disabled={model.installed || !!changing || !!running || !!job && job.status === 'paused'}
            onClick={() => void install(model.filename)}>
            {t(model.installed ? 'checkpoint.installedShort' : 'checkpoint.installAction')}
          </button>
        </div>;
      })}
    </div>}

    {jobs.length > 0 && <div className="noble-voice-library" aria-label={t('a11y.imageTransfers')}>
      <h4>{t('checkpoint.recent')}</h4>
      {jobs.map(job => {
        const active = ['queued','downloading','verifying'].includes(job.status);
        const pct = job.expected_size ?
          Math.min(100, Math.round(job.received_bytes * 100 / job.expected_size)) : 0;
        return <div className="noble-voice-card" key={job.id}>
          <div className="noble-voice-main">
            <strong>{job.filename}</strong>
            <span>{job.repo_id} · {t('jobs.' + job.status, { defaultValue: t('jobs.unknown') })} ·
              {formatted(job.received_bytes)} / {formatted(job.expected_size)}</span>
            {job.error && <BackendDiagnostic detail={job.error}/>}
            <progress aria-label={t('a11y.downloadFile', { filename: job.filename })} max={100} value={pct}/>
          </div>
          {active && <button className="secondary-button" type="button"
            disabled={!!changing} onClick={() => void control(job, 'pause')}>{t('checkpoint.pause')}</button>}
          {['paused', 'failed'].includes(job.status) && <>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'resume')}>{t('checkpoint.resume')}</button>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'cancel')}>{t('checkpoint.cancel')}</button>
          </>}
        </div>;
      })}
    </div>}

    {installed && <>
      <h4>{t('checkpoint.installed', { count: installed.models.length })}</h4>
      {installed.models.map(model => {
        // ComfyUI on Windows may report native backslash paths. Preserve the
        // exact spelling reported by the provider when saving the selection.
        const discovered = availableInComfy.find(name =>
          name.replace(/\\/g, '/') === model.checkpoint_name.replace(/\\/g, '/'));
        const usable = discovered !== undefined;
        return <div className="noble-voice-card" key={model.repo_id + model.filename}>
          <div className="noble-voice-main">
            <strong>{model.filename}</strong>
            <span>{model.repo_id} · {formatted(model.size_bytes)} ·
              {usable ? t('checkpoint.detected') : t('checkpoint.notRecognized')}</span>
          </div>
          <button className="secondary-button" type="button" disabled={!usable}
            onClick={() => { if (discovered) onSelectCheckpoint(discovered); }}>
            {usable ? <><Check size={16}/> {t('checkpoint.select')}</> : t('checkpoint.waiting')}
          </button>
        </div>;
      })}
      <p className="noble-inspector-hint">{t('checkpoint.comfyGuide')}</p>
      <code className="noble-model-path">--extra-model-paths-config "{installed.config_path}"</code>
      <p>{t('checkpoint.modelDir')} <code>{installed.model_dir}</code></p>
    </>}
    {(error || message) && <p role="status"
      className={error ? 'narrative-error' : 'narrative-saved'}>{error || message}</p>}
  </div>;
}
