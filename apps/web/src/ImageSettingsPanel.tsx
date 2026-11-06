import { useEffect, useState } from 'react';
import { Check, Image, LoaderCircle, RefreshCcw } from 'lucide-react';
import { api } from './api';
import type { ImageSettings, ImageStatus, Settings, ResourceConfig, ResourceStatus } from './types';

interface Props {
  imageMode: Settings['image_mode'];
  onImageMode: (next: Settings['image_mode']) => void;
}

/** Only image generation and its local GPU admission policy live here. */
export function ImageSettingsPanel({ imageMode, onImageMode }: Props) {
  const [image, setImage] = useState<ImageSettings | null>(null);
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [resources, setResources] = useState<ResourceConfig | null>(null);
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    Promise.all([api.imageConfig(), api.resourceConfig(), api.resourceStatus()])
      .then(([config, policy, telemetry]) => {
        if (mounted) { setImage(config); setResources(policy); setResourceStatus(telemetry); }
      }).catch((exc: Error) => { if (mounted) setError(exc.message); });
    return () => { mounted = false; };
  }, []);
  async function save() {
    if (!image) return;
    setBusy(true); setError(''); setMessage('');
    try { setImage(await api.saveImageConfig(image)); setMessage('Ajustes de ComfyUI guardados.'); }
    catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function discover() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.imageStatus();
      setStatus(result);
      if (!result.online) setError(result.error || 'ComfyUI no responde');
      else setMessage('ComfyUI conectado. Checkpoints disponibles: ' + result.checkpoints.length);
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function saveResourcePolicy() {
    if (!resources) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setResources(await api.saveResourceConfig(resources));
      setResourceStatus(await api.resourceStatus());
      setMessage('Política GPU guardada.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const change = <K extends keyof ImageSettings>(field: K, value: ImageSettings[K]) => {
    setImage(previous => previous ? { ...previous, [field]: value } : previous);
  };

  return <div className="creative-settings image-settings-panel">
    <div className="setting-section-intro">
      <h2>Imágenes</h2>
      <p>Ilustraciones, modelos, escenas y recursos de generación visual.</p>
    </div>
    {(error || message) && <p role="status" className={error ? 'narrative-error' : 'narrative-saved'}>
      {error || <><Check size={15}/>{message}</>}</p>}
    <div className="workspace-panel">
      <h3><Image size={18}/> Escenas con ComfyUI</h3>
      <p>Instala y ejecuta ComfyUI por separado. Necesita un checkpoint compatible. El botón «Ilustrar» del lector genera una imagen y sustituye la escena únicamente si finaliza correctamente.</p>
      <label className="workspace-pref-field">Política de ilustración
        <select value={imageMode} disabled={busy}
          onChange={e => onImageMode(e.target.value as Settings['image_mode'])}>
          <option value="manual">Bajo demanda (funcional)</option>
          <option value="scene">Escenas (detección automática pendiente; botón manual)</option>
          <option value="off">Desactivadas</option>
        </select>
      </label>
      {image ? <div className="workspace-field-grid">
        <label className="workspace-pref-field">ComfyUI local
          <input value={image.base_url} disabled={busy}
            onChange={e => change('base_url', e.target.value)} placeholder="http://127.0.0.1:8188"/>
        </label>
        <label className="workspace-pref-field">Checkpoint
          <input list="noble-comfy-checkpoints" value={image.checkpoint} disabled={busy}
            onChange={e => change('checkpoint', e.target.value)} placeholder="Modelo instalado en ComfyUI"/>
          <datalist id="noble-comfy-checkpoints">
            {status?.checkpoints.map(model => <option value={model} key={model}/>)}
          </datalist>
        </label>
        <label className="workspace-pref-field">Ancho
          <select value={image.width} onChange={e => change('width', Number(e.target.value))}>
            {[512, 768, 1024].map(w => <option key={w} value={w}>{w} px</option>)}
          </select>
        </label>
        <label className="workspace-pref-field">Alto
          <select value={image.height} onChange={e => change('height', Number(e.target.value))}>
            {[512, 768, 1024].map(w => <option key={w} value={w}>{w} px</option>)}
          </select>
        </label>
        <label className="workspace-pref-field">Pasos de difusión
          <input type="number" min={1} max={70} value={image.steps}
            onChange={e => change('steps', Number(e.target.value))}/>
        </label>
        <label className="workspace-pref-field">Guidance (CFG)
          <input type="number" min={1} max={20} step="0.5" value={image.cfg}
            onChange={e => change('cfg', Number(e.target.value))}/>
        </label>
        <label className="workspace-pref-field" >Prompt negativo
          <input maxLength={1000} value={image.negative_prompt}
            onChange={e => change('negative_prompt', e.target.value)}/>
        </label>
      </div> : <div className="loading">Cargando configuración...</div>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={busy} onClick={() => void discover()}>
          <RefreshCcw size={16}/> Buscar checkpoints</button>
        <button className="primary-button" disabled={busy || !image}
          onClick={() => void save()}>
          {busy ? <LoaderCircle size={16} className="rotating"/> : <Check size={16}/>}
          Guardar ajustes de imagen</button>
      </div>
      {status?.online && <p>Checkpoint(s) detectados: {status.checkpoints.length}. El modelo se cargará cuando pulses «Ilustrar».</p>}
    </div>
    <div className="workspace-panel">
      <h3>Memoria GPU y admisión</h3>
      <p>Consulta la VRAM libre observada con nvidia-smi. Puedes avisar o impedir una
        solicitud de ComfyUI por debajo de una reserva configurada. Esto no calcula
        la memoria real que necesita el checkpoint ni detiene otros procesos.</p>
      {resourceStatus && <p role="status">
        {resourceStatus.selected_gpu
          ? resourceStatus.selected_gpu.name + ' · ' +
            resourceStatus.selected_gpu.free_mib + ' MiB libres / ' +
            resourceStatus.selected_gpu.total_mib + ' MiB totales'
          : 'Telemetría de GPU no disponible (CPU u otro proveedor).'}
        {' · '}{resourceStatus.message}
      </p>}
      {resourceStatus?.workload.active && <p role="status">
        Operación local activa: {resourceStatus.workload.active.kind}.
        Las solicitudes simultáneas al mismo recurso recibirán un aviso.
      </p>}
      {resources && <label className="workspace-pref-toggle">
        <span>Coordinar narrador local y ComfyUI (una operación GPU a la vez)</span>
        <input type="checkbox" aria-label="Coordinar GPU local"
          checked={resources.serialize_local_gpu}
          onChange={e => setResources(x => x ? {
            ...x, serialize_local_gpu: e.target.checked,
          } : x)}/>
      </label>}
      {resources && <div className="workspace-field-grid">
        <label className="workspace-pref-field">Modo
          <select aria-label="Modo de reserva GPU" value={resources.mode}
            onChange={e => setResources(x => x ? {
              ...x, mode: e.target.value as ResourceConfig['mode'],
            } : x)}>
            <option value="monitor">Solo supervisar</option>
            <option value="guard">Bloquear si hay menos VRAM que la reserva</option>
          </select>
        </label>
        <label className="workspace-pref-field">GPU (índice nvidia-smi)
          <input type="number" min={0} max={31} value={resources.gpu_index}
            aria-label="Índice GPU" onChange={e => setResources(x => x ? {
              ...x, gpu_index: Number(e.target.value),
            } : x)}/>
        </label>
        <label className="workspace-pref-field">Reserva mínima libre (MiB)
          <input type="number" min={0} max={65536} step={256}
            value={resources.minimum_free_mib} aria-label="Reserva GPU en MiB"
            onChange={e => setResources(x => x ? {
              ...x, minimum_free_mib: Number(e.target.value),
            } : x)}/>
        </label>
      </div>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={busy}
          onClick={() => void api.resourceStatus().then(setResourceStatus).catch(
            (e: Error) => setError(e.message))}>
          <RefreshCcw size={16}/> Consultar VRAM</button>
        <button className="primary-button" disabled={busy || !resources}
          onClick={() => void saveResourcePolicy()}>
          <Check size={16}/> Guardar política GPU</button>
      </div>
    </div>
  </div>;
}
