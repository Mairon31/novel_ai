import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Check, CircleStop, LoaderCircle, Play, RefreshCcw, Terminal } from 'lucide-react';
import { api } from './api';
import type { ComfyLaunchConfig, ComfyLaunchValidation, ComfyRuntimeStatus, ComfyRuntimeLogs } from './types';

interface Props { onRuntimeStarted: (baseUrl: string) => void; }

const DEFAULT: ComfyLaunchConfig = {
  install_dir: '', python_executable: '', port: 8188, memory_mode: 'auto',
};
const MODES: Array<{id: ComfyLaunchConfig['memory_mode']; labelKey: string}> = [
  {id: 'auto', labelKey: 'comfy.auto'},
  {id: 'lowvram', labelKey: 'comfy.lowVram'},
  {id: 'normalvram', labelKey: 'comfy.normalVram'},
  {id: 'highvram', labelKey: 'comfy.highVram'},
  {id: 'cpu', labelKey: 'comfy.cpu'},
];
function sameSettings(a: ComfyLaunchConfig, b: ComfyLaunchConfig) {
  return a.install_dir === b.install_dir &&
    a.python_executable === b.python_executable &&
    a.port === b.port && a.memory_mode === b.memory_mode;
}

export function ComfyRuntimePanel({ onRuntimeStarted }: Props) {
  const { t } = useTranslation();
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
      setMessage(t('feedback.comfyVerified'));
    } catch (e) { setValidation(null); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.comfyRuntimeSave(config);
      setSaved(result); setConfig(result);
      setValidation(null); setMessage(t('feedback.comfyLaunchSaved'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function start() {
    if (dirty) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.comfyRuntimeStart();
      setStatus(result); onRuntimeStarted(result.base_url);
      setMessage(t('feedback.comfyStarted'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true); setError(''); setMessage('');
    try {
      setStatus(await api.comfyRuntimeStop());
      setMessage(t('feedback.comfyStopped'));
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
    <h3><Terminal size={18}/> {t('comfy.title')}</h3>
    <p>{t('comfy.runtimeHint')}</p>
    <div className="workspace-field-grid">
      <label className="workspace-pref-field">{t('comfy.directory')}
        <input aria-label={t('uiField.comfyRuntimePanel.localComfyUIDirectory')} value={config.install_dir}
          placeholder={t('uiField.comfyRuntimePanel.absolutePathToComfyUImainpy')}
          disabled={busy || !!running}
          onChange={e => change('install_dir', e.target.value)}/>
      </label>
      <label className="workspace-pref-field">{t('comfy.python')}
        <input aria-label={t('uiField.comfyRuntimePanel.comfyUIPython')} value={config.python_executable}
          placeholder={t('uiField.comfyRuntimePanel.leaveEmptyToDetectVenvOrPython')}
          disabled={busy || !!running}
          onChange={e => change('python_executable', e.target.value)}/>
      </label>
      <label className="workspace-pref-field">{t('comfy.port')}
        <input type="number" aria-label={t('uiField.comfyRuntimePanel.comfyUIPort')}
          min={1024} max={65535} value={config.port} disabled={busy || !!running}
          onChange={e => change('port', Number(e.target.value))}/>
      </label>
      <label className="workspace-pref-field">{t('comfy.memory')}
        <select aria-label={t('uiField.comfyRuntimePanel.comfyUIVRAMProfile')} value={config.memory_mode}
          disabled={busy || !!running}
          onChange={e => change('memory_mode', e.target.value as ComfyLaunchConfig['memory_mode'])}>
          {MODES.map(mode => <option key={mode.id} value={mode.id}>{t(mode.labelKey)}</option>)}
        </select>
      </label>
    </div>
    <div className="settings-buttons">
      <button type="button" className="secondary-button" disabled={busy || !!running}
        onClick={() => void verify()}><Check size={16}/> {t('comfy.validate')}</button>
      <button type="button" className="secondary-button"
        disabled={busy || !!running || !dirty} onClick={() => void save()}>
        {t('comfy.saveLaunch')}
      </button>
      <button type="button" className="primary-button"
        disabled={busy || !!running || dirty || !saved.install_dir}
        onClick={() => void start()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <Play size={16}/>}
        {t('comfy.start')}
      </button>
      <button type="button" className="secondary-button"
        disabled={busy || !running} onClick={() => void stop()}>
        <CircleStop size={16}/> {t('comfy.stop')}
      </button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => void api.comfyRuntimeStatus().then(setStatus).catch(
          (e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> {t('comfy.check')}
      </button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => void inspectLogs()}>
        <Terminal size={16}/> {t('comfy.logs')}
      </button>
    </div>
    <p role="status">
      {t('comfy.status')} <strong>{status?.status === 'ready' ? 'Ready' :
        status?.status === 'starting' ? 'Starting' :
        status?.status === 'exited' ? 'Exited' : 'Stopped'}</strong>.
      {status?.owns_process ? ' Noble AI manages this process.' :
        ' Noble does not manage any external process.'}
      {status?.pid ? ' PID ' + status.pid + '.' : ''}
    </p>
    {status?.diagnostics && <p role="status">
      ComfyUI version: {status.diagnostics.comfyui_version || 'unknown'}.
      {' '}Devices: {status.diagnostics.devices.map(x => x.name).join(', ') || 'not reported'}.
    </p>}
    {dirty && <p role="status">{t('comfy.unsaved')}</p>}
    {validation && <p role="status">
      Python: <code>{validation.python_executable}</code>.
      {' '}Noble AI models: <code>{validation.model_paths_config}</code>.
    </p>}
    {logs && <div className="noble-comfy-log">
      <h4>{t('comfy.latestLogs')}</h4>
      <pre>{logs.text || 'No logs yet.'}</pre>
      {logs.truncated && <small>{t('comfy.logsLimited')}</small>}
    </div>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {message && <p role="status" className="narrative-saved">{message}</p>}
    <p className="noble-inspector-hint">{t('comfy.startHint')}</p>
  </div>;
}
