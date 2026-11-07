import { useEffect, useState } from 'react';
import { Check, Image, LoaderCircle, RefreshCcw } from 'lucide-react';
import { api } from './api';
import { ImageCheckpointManager } from './ImageCheckpointManager';
import { ComfyRuntimePanel } from './ComfyRuntimePanel';
import type { ImageSettings, ImageStatus, ImageSamplerOptions, Settings, ResourceConfig, ResourceStatus } from './types';

const SAMPLERS: Array<{id: ImageSettings['sampler_name']; label: string}> = [
  {id: 'euler', label: 'Euler (compatible por defecto)'},
  {id: 'euler_ancestral', label: 'Euler ancestral'},
  {id: 'dpmpp_2m', label: 'DPM++ 2M'},
  {id: 'dpmpp_sde', label: 'DPM++ SDE'},
  {id: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE'},
  {id: 'heun', label: 'Heun'},
  {id: 'uni_pc', label: 'UniPC'},
];
const SCHEDULERS: Array<{id: ImageSettings['scheduler']; label: string}> = [
  {id: 'normal', label: 'Normal (compatible por defecto)'},
  {id: 'karras', label: 'Karras'},
  {id: 'exponential', label: 'Exponential'},
  {id: 'sgm_uniform', label: 'SGM Uniform'},
  {id: 'simple', label: 'Simple'},
];

interface Props {
  imageMode: Settings['image_mode'];
  onImageMode: (next: Settings['image_mode']) => void;
}

/** Only image generation and its local GPU admission policy live here. */
export function ImageSettingsPanel({ imageMode, onImageMode }: Props) {
  const [image, setImage] = useState<ImageSettings | null>(null);
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [samplerOptions, setSamplerOptions] = useState<ImageSamplerOptions | null>(null);
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
  async function inspectSamplerOptions() {
    setBusy(true); setError(''); setMessage('');
    try {
      const options = await api.imageSamplerOptions();
      setSamplerOptions(options);
      if (!options.online) setError(options.error || 'No se pudo consultar KSampler');
      else setMessage('ComfyUI: ' + options.sampler_name.length +
        ' muestreadores y ' + options.scheduler.length + ' planificadores admitidos.');
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
    <ComfyRuntimePanel onRuntimeStarted={url => {
      setImage(previous => previous ? { ...previous, base_url: url } : previous);
      setStatus(null);
      setMessage('ComfyUI administrado por Noble AI iniciado en ' + url);
    }}/>
    <div className="workspace-panel">
      <h3><Image size={18}/> Escenas con ComfyUI</h3>
      <p>Puedes iniciar ComfyUI desde este mismo apartado, o conectar uno externo. Necesita un checkpoint compatible. El botón «Ilustrar» del lector genera una imagen y sustituye la escena únicamente si finaliza correctamente.</p>
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
        <label className="workspace-pref-field">Estilo de ilustración
          <select aria-label="Estilo de ilustración" value={image.style_preset}
            disabled={busy}
            onChange={e => change('style_preset', e.target.value as ImageSettings['style_preset'])}>
            <option value="anime_fantasy">Anime de fantasía (predeterminado)</option>
            <option value="anime_cinematic">Anime cinematográfico</option>
            <option value="anime_watercolor">Anime acuarela</option>
            <option value="none">Sin refuerzo de estilo</option>
          </select>
        </label>
        <label className="workspace-pref-field">Muestreador ComfyUI
          <select aria-label="Muestreador ComfyUI" value={image.sampler_name}
            disabled={busy}
            onChange={e => change('sampler_name', e.target.value as ImageSettings['sampler_name'])}>
            {SAMPLERS.map(sampler => <option key={sampler.id} value={sampler.id}>
              {sampler.label}{samplerOptions?.online &&
                !samplerOptions.sampler_name.includes(sampler.id) ? ' · no disponible' : ''}
            </option>)}
          </select>
        </label>
        <label className="workspace-pref-field">Planificador ComfyUI
          <select aria-label="Planificador ComfyUI" value={image.scheduler}
            disabled={busy}
            onChange={e => change('scheduler', e.target.value as ImageSettings['scheduler'])}>
            {SCHEDULERS.map(scheduler => <option key={scheduler.id} value={scheduler.id}>
              {scheduler.label}{samplerOptions?.online &&
                !samplerOptions.scheduler.includes(scheduler.id) ? ' · no disponible' : ''}
            </option>)}
          </select>
        </label>
        <label className="workspace-pref-field" >Prompt negativo
          <input maxLength={1000} value={image.negative_prompt}
            onChange={e => change('negative_prompt', e.target.value)}/>
        </label>
      </div> : <div className="loading">Cargando configuración...</div>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={busy} onClick={() => void discover()}>
          <RefreshCcw size={16}/> Buscar checkpoints</button>
        <button className="secondary-button" disabled={busy}
          onClick={() => void inspectSamplerOptions()}>
          <RefreshCcw size={16}/> Comprobar muestreo ComfyUI</button>
        <button className="primary-button" disabled={busy || !image ||
          (samplerOptions?.online === true &&
           (!samplerOptions.sampler_name.includes(image.sampler_name) ||
            !samplerOptions.scheduler.includes(image.scheduler)))}
          onClick={() => void save()}>
          {busy ? <LoaderCircle size={16} className="rotating"/> : <Check size={16}/>}
          Guardar ajustes de imagen</button>
      </div>
      {samplerOptions?.online && image && <p role="status">
        Compatibilidad KSampler: {samplerOptions.sampler_name.includes(image.sampler_name) &&
          samplerOptions.scheduler.includes(image.scheduler)
          ? 'selección compatible' : 'la selección no está disponible en este ComfyUI'}.
      </p>}
      <p className="noble-inspector-hint">El estilo modifica el prompt real de cada imagen; cambiar el muestreador o planificador modifica el nodo KSampler. Las opciones distintas de Euler/Normal se validan en el motor antes de generar.</p>
      {status?.online && <p>Checkpoint(s) detectados: {status.checkpoints.length}. El modelo se cargará cuando pulses «Ilustrar».</p>}
    </div>
    <ImageCheckpointManager availableInComfy={status?.online ? status.checkpoints : []}
      onSelectCheckpoint={name => {
        change('checkpoint', name);
        setMessage('Checkpoint seleccionado. Guarda los ajustes de imagen para aplicarlo.');
      }}/>
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
