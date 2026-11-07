import { useEffect, useState } from 'react';
import { Check, CircleStop, LoaderCircle, Play, RefreshCcw, Terminal } from 'lucide-react';
import { api } from './api';
import type { ComfyLaunchConfig, ComfyLaunchValidation, ComfyRuntimeStatus, ComfyRuntimeLogs } from './types';

interface Props { onRuntimeStarted: (baseUrl: string) => void; }

const DEFAULT: ComfyLaunchConfig = {
  install_dir: '', python_executable: '', port: 8188, memory_mode: 'auto',
};
const MODES: Array<{id: ComfyLaunchConfig['memory_mode']; label: string}> = [
  {id: 'auto', label: 'Automatic (recommended)'},
  {id: 'lowvram', label: 'VRAM baja'},
  {id: 'normalvram', label: 'VRAM normal'},
  {id: 'highvram', label: 'VRAM alta'},
  {id: 'cpu', label: 'CPU only (slower)'},
];
function sameSettings(a: ComfyLaunchConfig, b: ComfyLaunchConfig) {
  return a.install_dir === b.install_dir &&
    a.python_executable === b.python_executable &&
    a.port === b.port && a.memory_mode === b.memory_mode;
}

export function ComfyRuntimePanel({ onRuntimeStarted }: Props) {
  const [config, setConfig] = useState<ComfyLaunchConfig>(DEFAULT);
  const [saved, setSaved] = useState<ComfyLaunchConfig>(DEFAULT);
  const [status, setStatus] = useState<ComfyRuntimeStatus | null>(null);
  const [validation, setValidation] = useState<ComfyLaunchValidation | null>(null);
  const [logs, setLogs] = useState<ComfyRuntimeLogs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = !sameSettings(config, saved);
  const running = status?.owns_process && ['starting', 'ready'].includes(status.status);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.comfyRuntimeConfig(), api.comfyRuntimeStatus()])
      .then(([initial, state]) => {
        if (mounted) { setConfig(initial); setSaved(initial); setStatus(state); }
      }).catch((e: Error) => { if (mounted) setError(e.message); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (status?.status !== 'starting') return;
    const id = window.setInterval(() => {
      void api.comfyRuntimeStatus().then(setStatus).catch(() => {});
    }, 1800);
    return () => window.clearInterval(id);
  }, [status?.status]);

  function change<K extends keyof ComfyLaunchConfig>(field: K, value: ComfyLaunchConfig[K]) {
    setConfig(previous => ({ ...previous, [field]: value }));
    setValidation(null); setMessage(''); setError('');
  }
  async function verify() {
    setBusy(true); setError(''); setMessage('');
    try {
      setValidation(await api.comfyRuntimeValidate(config));
      setMessage('ComfyUI installation and Python executable verified.');
    } catch (e) { setValidation(null); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.comfyRuntimeSave(config);
      setSaved(result); setConfig(result);
      setValidation(null); setMessage('ComfyUI settings saved.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function start() {
    if (dirty) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.comfyRuntimeStart();
      setStatus(result); onRuntimeStarted(result.base_url);
      setMessage('ComfyUI started. Check diagnostics until it reports Ready.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true); setError(''); setMessage('');
    try {
      setStatus(await api.comfyRuntimeStop());
      setMessage('Noble AI-managed ComfyUI process stopped.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function inspectLogs() {
    setBusy(true); setError('');
    try { setLogs(await api.comfyRuntimeLogs()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="workspace-panel comfy-runtime-panel">
    <h3><Terminal size={18}/> Ejecutar ComfyUI desde Noble AI</h3>
    <p>Use an existing ComfyUI installation and its local Python environment. Noble AI manages only the processes it starts, without downloading code or launching ComfyUI just by opening Settings.</p>
    <div className="workspace-field-grid">
      <label className="workspace-pref-field">Carpeta de ComfyUI
        <input aria-label="Carpeta local de ComfyUI" value={config.install_dir}
          placeholder="Ruta absoluta hasta ComfyUI/main.py"
          disabled={busy || !!running}
          onChange={e => change('install_dir', e.target.value)}/>
      </label>
      <label className="workspace-pref-field">Ejecutable Python (opcional)
        <input aria-label="Python para ComfyUI" value={config.python_executable}
          placeholder="Leave empty to detect .venv or Python"
          disabled={busy || !!running}
          onChange={e => change('python_executable', e.target.value)}/>
      </label>
      <label className="workspace-pref-field">Puerto local
        <input type="number" aria-label="Puerto de ComfyUI"
          min={1024} max={65535} value={config.port} disabled={busy || !!running}
          onChange={e => change('port', Number(e.target.value))}/>
      </label>
      <label className="workspace-pref-field">Perfil de memoria
        <select aria-label="Perfil de VRAM ComfyUI" value={config.memory_mode}
          disabled={busy || !!running}
          onChange={e => change('memory_mode', e.target.value as ComfyLaunchConfig['memory_mode'])}>
          {MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
      </label>
    </div>
    <div className="settings-buttons">
      <button type="button" className="secondary-button" disabled={busy || !!running}
        onClick={() => void verify()}><Check size={16}/> Validate installation</button>
      <button type="button" className="secondary-button"
        disabled={busy || !!running || !dirty} onClick={() => void save()}>
        Save arranque de ComfyUI
      </button>
      <button type="button" className="primary-button"
        disabled={busy || !!running || dirty || !saved.install_dir}
        onClick={() => void start()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <Play size={16}/>}
        Iniciar ComfyUI
      </button>
      <button type="button" className="secondary-button"
        disabled={busy || !running} onClick={() => void stop()}>
        <CircleStop size={16}/> Detener ComfyUI
      </button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => void api.comfyRuntimeStatus().then(setStatus).catch(
          (e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Consultar proceso
      </button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => void inspectLogs()}>
        <Terminal size={16}/> Ver registros ComfyUI
      </button>
    </div>
    <p role="status">
      Estado: <strong>{status?.status === 'ready' ? 'Listo' :
        status?.status === 'starting' ? 'Iniciando' :
        status?.status === 'exited' ? 'Finalizado' : 'Detenido'}</strong>.
      {status?.owns_process ? ' Noble administra este proceso.' :
        ' Noble does not manage any external process.'}
      {status?.pid ? ' PID ' + status.pid + '.' : ''}
    </p>
    {status?.diagnostics && <p role="status">
      ComfyUI version: {status.diagnostics.comfyui_version || 'desconocida'}.
      {' '}Dispositivos: {status.diagnostics.devices.map(x => x.name).join(', ') || 'no informados'}.
    </p>}
    {dirty && <p role="status">Hay cambios sin guardar. Guarda antes de iniciar ComfyUI.</p>}
    {validation && <p role="status">
      Python: <code>{validation.python_executable}</code>.
      {' '}Modelos Noble: <code>{validation.model_paths_config}</code>.
    </p>}
    {logs && <div className="noble-comfy-log">
      <h4>Latest process logs</h4>
      <pre>{logs.text || 'No logs yet.'}</pre>
      {logs.truncated && <small>Showing the last 16 KiB of the log.</small>}
    </div>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {message && <p role="status" className="narrative-saved">{message}</p>}
    <p className="noble-inspector-hint">
      Arranque local 127.0.0.1, sin shell, con la carpeta de modelos Noble.
      Use Find checkpoints once ComfyUI is ready.
    </p>
  </div>;
}
