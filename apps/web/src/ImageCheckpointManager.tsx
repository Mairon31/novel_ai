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
      setMessage('Descarga iniciada. Se comprobará SHA-256 y el formato antes de publicar.');
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  async function control(job: CheckpointDownload, action: 'pause' | 'resume' | 'cancel') {
    if (changing) return;
    setChanging(job.id); setError(''); setMessage('');
    try {
      await api.checkpointControl(job.id, action);
      await refresh();
      setMessage(action === 'pause' ? 'Descarga pausada.' :
        action === 'resume' ? 'Descarga reanudada.' : 'Descarga cancelada.');
    } catch (e) { setError((e as Error).message); }
    finally { setChanging(null); }
  }

  function formatted(bytes: number) { return (bytes / (1024 * 1024)).toFixed(1) + ' MiB'; }
  const current = catalog?.repo_id;

  return <div className="workspace-panel noble-checkpoint-installer">
    <h3><Download size={18}/> Checkpoints desde Noble AI</h3>
    <p>Busca un repositorio público de Hugging Face con un checkpoint
      <code> .safetensors</code>. Noble lo descarga a su carpeta de modelos;
      solo se instala si se verifica su SHA-256 y su estructura.</p>
    <div className="workspace-field-grid">
      <label className="workspace-pref-field">Repositorio de Hugging Face
        <input aria-label="Repositorio Hugging Face" placeholder="autor/modelo"
          value={repo} disabled={busy || !!changing}
          onChange={e => { setRepo(e.target.value); setCatalog(null); }}/>
      </label>
    </div>
    <div className="settings-buttons">
      <button className="secondary-button" type="button"
        disabled={busy || !!changing || !/^[\w.-]+\/[\w.-]+$/.test(repo.trim())}
        onClick={() => void inspect()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
        Buscar archivos del checkpoint
      </button>
      <button className="secondary-button" type="button" onClick={() =>
        void refresh().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Actualizar descargas de imágenes
      </button>
    </div>

    {catalog && <div className="noble-voice-library" aria-label="Modelos del repositorio">
      <h4>{catalog.repo_id}</h4>
      <p>Licencia informada: {catalog.license}. Revisión: <code>{catalog.revision.slice(0,12)}</code>.
        Los modelos que requieren permisos o no tienen hash verificable se excluyen.</p>
      {!catalog.models.length && <p>No hay checkpoints individuales instalables con
        tamaño y SHA-256 publicados en la raíz del repositorio.</p>}
      {catalog.models.map(model => {
        const job = jobs.find(j => j.repo_id === current && j.filename === model.filename &&
          !['cancelled'].includes(j.status));
        const running = job && ['queued', 'downloading', 'verifying'].includes(job.status);
        return <div className="noble-voice-card" key={model.filename}>
          <div className="noble-voice-main">
            <strong>{model.filename}</strong>
            <span>{formatted(model.size_bytes)} · SHA-256 publicado ·
              {model.installed ? ' Instalado en Noble' : ' Pendiente de instalar'}</span>
            <a href={model.model_card} rel="noopener noreferrer" target="_blank">
              Ver ficha y condiciones del modelo</a>
          </div>
          <button className="secondary-button" type="button"
            disabled={model.installed || !!changing || !!running || !!job && job.status === 'paused'}
            onClick={() => void install(model.filename)}>
            {model.installed ? 'Instalado' : 'Instalar checkpoint'}
          </button>
        </div>;
      })}
    </div>}

    {jobs.length > 0 && <div className="noble-voice-library" aria-label="Transferencias de modelos visuales">
      <h4>Descargas recientes</h4>
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
            <progress aria-label={'Descarga de ' + job.filename} max={100} value={pct}/>
          </div>
          {active && <button className="secondary-button" type="button"
            disabled={!!changing} onClick={() => void control(job, 'pause')}>Pausar</button>}
          {['paused', 'failed'].includes(job.status) && <>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'resume')}>Reanudar</button>
            <button className="secondary-button" type="button" disabled={!!changing}
              onClick={() => void control(job, 'cancel')}>Cancelar</button>
          </>}
        </div>;
      })}
    </div>}

    {installed && <>
      <h4>Checkpoints administrados por Noble AI ({installed.models.length})</h4>
      {installed.models.map(model => {
        const usable = availableInComfy.includes(model.checkpoint_name);
        return <div className="noble-voice-card" key={model.repo_id + model.filename}>
          <div className="noble-voice-main">
            <strong>{model.filename}</strong>
            <span>{model.repo_id} · {formatted(model.size_bytes)} ·
              {usable ? ' Detectado en ComfyUI' : ' ComfyUI aún no lo reconoce'}</span>
          </div>
          <button className="secondary-button" type="button" disabled={!usable}
            onClick={() => onSelectCheckpoint(model.checkpoint_name)}>
            {usable ? <><Check size={16}/> Seleccionar checkpoint</> : 'Pendiente de ComfyUI'}
          </button>
        </div>;
      })}
      <p className="noble-inspector-hint">Integración inicial: para que ComfyUI reconozca
        estos archivos, inícialo con el argumento indicado y después pulsa
        «Buscar checkpoints». Noble AI no instala ni reinicia ComfyUI automáticamente.</p>
      <code className="noble-model-path">--extra-model-paths-config "{installed.config_path}"</code>
      <p>Modelos: <code>{installed.model_dir}</code></p>
    </>}
    {(error || message) && <p role="status"
      className={error ? 'narrative-error' : 'narrative-saved'}>{error || message}</p>}
  </div>;
}
