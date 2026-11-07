import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, CircleAlert, Cpu, HardDrive, LoaderCircle, Play, Power, RefreshCw,
} from 'lucide-react';
import { api, size } from './api';
import type { KoboldInstalled, KoboldStatus } from './types';

export function RuntimeManager({ onActivated }: { onActivated: () => void }) {
  const [status, setStatus] = useState<KoboldStatus | null>(null);
  const [models, setModels] = useState<KoboldInstalled[]>([]);
  const [installedId, setInstalledId] = useState('');
  const [executable, setExecutable] = useState('');
  const [gpuLayers, setGpuLayers] = useState(-1);
  const [contextSize, setContextSize] = useState(4096);
  const [port, setPort] = useState(5001);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [s, list] = await Promise.all([api.koboldStatus(), api.koboldInstalled()]);
    setStatus(s);
    setModels(list.models);
    setInstalledId(previous => previous || list.models[0]?.id || '');
  }, []);
  useEffect(() => {
    void refresh().catch((exc: Error) => setError(exc.message));
    const interval = setInterval(() => {
      void refresh().catch(() => { /* last status remains */ });
    }, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function start() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const result = await api.koboldStart({
        executable, installed_id: installedId,
        gpu_layers: gpuLayers, contextsize: contextSize, port,
      });
      setStatus(result);
      setMessage('Process started. The model will appear ready when KoboldCpp responds.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true); setError(''); setMessage('');
    try {
      setStatus(await api.koboldStop());
      setMessage('Noble AI-managed KoboldCpp stopped.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function activate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const config = await api.koboldActivate();
      onActivated();
      setMessage('Active narrator: ' + config.model + '. You can now open Library.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  const running = status && ['starting', 'ready'].includes(status.status);
  const label = status?.status === 'ready' ? 'Modelo listo' :
    status?.status === 'starting' ? 'Cargando modelo...' :
    status?.status === 'exited' ? 'Process exited' : 'Detenido';

  return <section className="narrative-settings kobold-manager">
    <div className="narrative-section-title"><span className="setting-icon"><Cpu size={22}/></span>
      <div><h2>KoboldCpp administrado</h2>
        <p>Inicia directamente un GGUF instalado desde Noble AI. Controla la carga en GPU o CPU.</p></div></div>
    <div className="runtime-indicator">
      <span className={'runtime-led ' + (status?.status === 'ready' ? 'runtime-green' : '')}/>
      <strong>{label}</strong>
      {status?.owns_process && <small>Proceso {status.pid} · Puerto {status.port} · {status.model_filename}</small>}
      <button className="icon-button" title="Actualizar estado" aria-label="Actualizar KoboldCpp"
        onClick={() => void refresh()}><RefreshCw size={17}/></button>
    </div>
    {!running && <>
      <div className="narrative-settings-grid">
        <label className="settings-span"><span><HardDrive size={14}/> Modelo GGUF registrado</span>
          <select aria-label="GGUF para ejecutar" value={installedId}
            onChange={e => setInstalledId(e.target.value)}>
            <option value="">Seleccionar modelo...</option>
            {models.map(model => <option key={model.id} value={model.id}>
              {model.filename} — {size(model.size_bytes)}</option>)}
          </select>
        </label>
        <label className="settings-span">Ruta al ejecutable KoboldCpp
          <input aria-label="Ruta de KoboldCpp" value={executable}
            placeholder="C:\\Herramientas\\koboldcpp.exe"
            onChange={e => setExecutable(e.target.value)}/>
        </label>
        <label>Capas que se ejecutan en GPU
          <select aria-label="Capas GPU KoboldCpp" value={gpuLayers}
            onChange={e => setGpuLayers(Number(e.target.value))}>
            <option value={-1}>Automatic (auto-fit)</option>
            <option value={0}>Solo CPU</option>
            {[12, 24, 36, 48, 64, 96, 128].map(n => <option key={n} value={n}>{n} capas GPU</option>)}
          </select>
        </label>
        <label>Contexto
          <select aria-label="Contexto KoboldCpp" value={contextSize}
            onChange={e => setContextSize(Number(e.target.value))}>
            {[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n} tokens</option>)}
          </select>
        </label>
        <label>Puerto local (loopback)
          <input aria-label="Puerto KoboldCpp" type="number" min={1024} max={65535}
            value={port} onChange={e => setPort(Number(e.target.value))}/>
        </label>
      </div>
      <p className="narrative-helper">Necesitas tener el ejecutable oficial KoboldCpp descargado.
        Noble AI launches only a registered GGUF and binds to 127.0.0.1. Memory settings are configurable, but 12/16 GB compatibility still requires physical measurement.</p>
    </>}
    {error && <p className="narrative-error" role="alert"><CircleAlert size={15}/> {error}</p>}
    {message && <p className="narrative-saved" role="status"><CheckCircle2 size={15}/> {message}</p>}
    <div className="settings-buttons">
      {!running && <button className="primary-button" disabled={busy || !installedId || !executable.trim()}
        onClick={() => void start()}><Play size={17}/> Iniciar modelo</button>}
      {running && <button className="secondary-button" disabled={busy} onClick={() => void stop()}>
        <Power size={16}/> Detener motor</button>}
      {status?.status === 'ready' && <button className="primary-button" disabled={busy}
        onClick={() => void activate()}>
        {busy ? <LoaderCircle className="rotating" size={16}/> : <CheckCircle2 size={16}/>}
        Usar como narrador</button>}
    </div>
  </section>;
}
