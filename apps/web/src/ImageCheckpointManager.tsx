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
      setMessage('Download started. SHA-256 and file format will be verified before publishing.');
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  async function control(job: CheckpointDownload, action: 'pause' | 'resume' | 'cancel') {
    if (changing) return;
    setChanging(job.id); setError(''); setMessage('');
    try {
      await api.checkpointControl(job.id, action);
      await refresh();
      setMessage(action === 'pause' ? 'Download paused.' :
        action === 'resume' ? 'Download resumed.' : 'Download canceled.');
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  function formatted(bytes: number) { return (bytes / (1024 * 1024)).toFixed(1) + ' MiB'; }
  const current = catalog?.repo_id;

  return <div className="workspace-panel noble-checkpoint-installer">
    <h3><Download size={18}/> Checkpoints from Noble AI</h3>
    <p>Find a public Hugging Face repository containing a
      <code> .safetensors</code>. Noble AI downloads it to its model directory and installs it only after verifying SHA-256 and file structure.</p>
    <div className="workspace-field-grid">
      <label className="workspace-pref-field">Hugging Face repository
        <input aria-label="Hugging Face repository" placeholder="autor/modelo"
          value={repo} disabled={busy || !!changing}
          onChange={e => { setRepo(e.target.value); setCatalog(null); }}/>
      </label>
    </div>
    <div className="settings-buttons">
      <button className="secondary-button" type="button"
        disabled={busy || !!changing || !/^[\w.-]+\/[\w.-]+$/.test(repo.trim())}
        onClick={() => void inspect()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
        Find checkpoint files
      </button>
      <button className="secondary-button" type="button" onClick={() =>
        void refresh().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Refresh image downloads
      </button>
    </div>

    {catalog && <div className="noble-voice-library" aria-label="Repository models">
      <h4>{catalog.repo_id}</h4>
      <p>Reported license: {catalog.license}. Revision: <code>{catalog.revision.slice(0,12)}</code>.
        Models requiring special access or lacking a verifiable hash are excluded.</p>
      {!catalog.models.length && <p>No installable individual checkpoints with a published size and SHA-256 were found at the repository root.</p>}
      {catalog.models.map(model => {
        const job = jobs.find(j => j.repo_id === current && j.filename === model.filename &&
          !['cancelled'].includes(j.status));
        const running = job && ['queued', 'downloading', 'verifying'].includes(job.status);
        return <div className="noble-voice-card" key={model.filename}>
          <div className="noble-voice-main">
            <strong>{model.filename}</strong>
            <span>{formatted(model.size_bytes)} · Published SHA-256 ·
              {model.installed ? ' Installed in Noble' : ' Not installed'}</span>
            <a href={model.model_card} rel="noopener noreferrer" target="_blank">
              View model card and terms</a>
          </div>
          <button className="secondary-button" type="button"
            disabled={model.installed || !!changing || !!running || !!job && job.status === 'paused'}
            onClick={() => void install(model.filename)}>
            {model.installed ? 'Installed' : 'Install checkpoint'}
          </button>
        </div>;
      })}
    </div>}

    {jobs.length > 0 && <div className="noble-voice-library" aria-label="Image model transfers">
      <h4>Recent downloads</h4>
      {jobs.map(job => {
        const active = ['queued','downloading','verifying'].includes(job.status);
        const pct = job.expected_size ?
          Math.min(100, Math.round(job.received_bytes * 100 / job.expected_size)) : 0;
        return <div className="noble-voice-card" key={job.id}>
          <div className="noble-voice-main">
            <strong>{job.filename}</strong>
            <span>{job.repo_id} · {job.status} ·
              {formatted(job.received_bytes)} / {formatted(job.expected_size)}</span>
            {job.error && <span role="alert">{job.error}</span>}
            <progress aria-label={'Download of ' + job.filename} max={100} value={pct}/>
          </div>
          {active && <button className="secondary-button" type="button"
            disabled={!!changing} onClick={() => void control(job, 'pause')}>Pause</button>}
          {['paused', 'failed'].includes(job.status) && <>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'resume')}>Resume</button>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'cancel')}>Cancel</button>
          </>}
        </div>;
      })}
    </div>}

    {installed && <>
      <h4>Checkpoints administrados por Noble AI ({installed.models.length})</h4>
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
              {usable ? ' Detectado en ComfyUI' : ' ComfyUI has not recognized it yet'}</span>
          </div>
          <button className="secondary-button" type="button" disabled={!usable}
            onClick={() => { if (discovered) onSelectCheckpoint(discovered); }}>
            {usable ? <><Check size={16}/> Select checkpoint</> : 'Waiting for ComfyUI'}
          </button>
        </div>;
      })}
      <p className="noble-inspector-hint">Integración inicial: para que ComfyUI reconozca
        estos archivos, inícialo con el argumento indicado y después pulsa
        «Buscar checkpoints». Noble AI no instala ni reinicia ComfyUI automáticamente.</p>
      <code className="noble-model-path">--extra-model-paths-config "{installed.config_path}"</code>
      <p>Models: <code>{installed.model_dir}</code></p>
    </>}
    {(error || message) && <p role="status"
      className={error ? 'narrative-error' : 'narrative-saved'}>{error || message}</p>}
  </div>;
}
