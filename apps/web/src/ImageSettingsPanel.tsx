import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Check, Image, LoaderCircle, RefreshCcw } from 'lucide-react';
import { api } from './api';
import { ImageCheckpointManager } from './ImageCheckpointManager';
import { ComfyRuntimePanel } from './ComfyRuntimePanel';
import type { ImageSettings, ImageStatus, ImageSamplerOptions, Settings, ResourceConfig, ResourceStatus } from './types';

const SAMPLERS: Array<{id: ImageSettings['sampler_name']; label: string}> = [
  {id: 'euler', label: 'Euler (compatible by default)'},
  {id: 'euler_ancestral', label: 'Euler ancestral'},
  {id: 'dpmpp_2m', label: 'DPM++ 2M'},
  {id: 'dpmpp_sde', label: 'DPM++ SDE'},
  {id: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE'},
  {id: 'heun', label: 'Heun'},
  {id: 'uni_pc', label: 'UniPC'},
];
const SCHEDULERS: Array<{id: ImageSettings['scheduler']; label: string}> = [
  {id: 'normal', label: 'Normal (compatible by default)'},
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
  const { t } = useTranslation();
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
    try { setImage(await api.saveImageConfig(image)); setMessage(t('image.comfySaved')); }
    catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function discover() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.imageStatus();
      setStatus(result);
      if (!result.online) setError(result.error || 'ComfyUI is not responding');
      else setMessage('ComfyUI connected. Available checkpoints: ' + result.checkpoints.length);
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function inspectSamplerOptions() {
    setBusy(true); setError(''); setMessage('');
    try {
      const options = await api.imageSamplerOptions();
      setSamplerOptions(options);
      if (!options.online) setError(options.error || 'Could not query KSampler');
      else setMessage(t('image.samplingStatus', { samplers: options.sampler_name.length,
        schedulers: options.scheduler.length }));
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }
  async function saveResourcePolicy() {
    if (!resources) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setResources(await api.saveResourceConfig(resources));
      setResourceStatus(await api.resourceStatus());
      setMessage(t('image.policySaved'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const change = <K extends keyof ImageSettings>(field: K, value: ImageSettings[K]) => {
    setImage(previous => previous ? { ...previous, [field]: value } : previous);
  };

  return <div className="creative-settings image-settings-panel">
    <div className="setting-section-intro">
      <h2>{t('image.title')}</h2>
      <p>{t('image.description')}</p>
    </div>
    {(error || message) && <p role="status" className={error ? 'narrative-error' : 'narrative-saved'}>
      {error || <><Check size={15}/>{message}</>}</p>}
    <ComfyRuntimePanel onRuntimeStarted={url => {
      setImage(previous => previous ? { ...previous, base_url: url } : previous);
      setStatus(null);
      setMessage('Noble AI-managed ComfyUI started at ' + url);
    }}/>
    <div className="workspace-panel">
      <h3><Image size={18}/> {t('image.comfyScenes')}</h3>
      <p>You can start an existing ComfyUI installation here or connect an external one. A compatible checkpoint is required. The reader's Illustrate action replaces the current scene only after a successful render.</p>
      <label className="workspace-pref-field">{t('image.policy')}
        <select value={imageMode} disabled={busy}
          onChange={e => onImageMode(e.target.value as Settings['image_mode'])}>
          <option value="manual">{t('image.onDemand')}</option>
          <option value="scene">{t('image.scenesManual')}</option>
          <option value="off">{t('common.disabled')}</option>
        </select>
      </label>
      {image ? <div className="workspace-field-grid">
        <label className="workspace-pref-field">{t('image.localComfy')}
          <input value={image.base_url} disabled={busy}
            onChange={e => change('base_url', e.target.value)} placeholder="http://127.0.0.1:8188"/>
        </label>
        <label className="workspace-pref-field">{t('image.checkpoint')}
          <input list="noble-comfy-checkpoints" value={image.checkpoint} disabled={busy}
            onChange={e => change('checkpoint', e.target.value)} placeholder="Model installed in ComfyUI"/>
          <datalist id="noble-comfy-checkpoints">
            {status?.checkpoints.map(model => <option value={model} key={model}/>)}
          </datalist>
        </label>
        <label className="workspace-pref-field">{t('image.width')}
          <select value={image.width} onChange={e => change('width', Number(e.target.value))}>
            {[512, 768, 1024].map(w => <option key={w} value={w}>{w} px</option>)}
          </select>
        </label>
        <label className="workspace-pref-field">{t('image.height')}
          <select value={image.height} onChange={e => change('height', Number(e.target.value))}>
            {[512, 768, 1024].map(w => <option key={w} value={w}>{w} px</option>)}
          </select>
        </label>
        <label className="workspace-pref-field">{t('image.steps')}
          <input type="number" min={1} max={70} value={image.steps}
            onChange={e => change('steps', Number(e.target.value))}/>
        </label>
        <label className="workspace-pref-field">{t('image.cfg')}
          <input type="number" min={1} max={20} step="0.5" value={image.cfg}
            onChange={e => change('cfg', Number(e.target.value))}/>
        </label>
        <label className="workspace-pref-field">{t('image.style')}
          <select aria-label={t('image.style')} value={image.style_preset}
            disabled={busy}
            onChange={e => change('style_preset', e.target.value as ImageSettings['style_preset'])}>
            <option value="anime_fantasy">{t('image.fantasy')}</option>
            <option value="anime_cinematic">{t('image.cinematic')}</option>
            <option value="anime_watercolor">{t('image.watercolor')}</option>
            <option value="none">{t('image.noStyle')}</option>
          </select>
        </label>
        <label className="workspace-pref-field">{t('image.comfySampler')}
          <select aria-label={t('image.comfySampler')} value={image.sampler_name}
            disabled={busy}
            onChange={e => change('sampler_name', e.target.value as ImageSettings['sampler_name'])}>
            {SAMPLERS.map(sampler => <option key={sampler.id} value={sampler.id}>
              {sampler.label}{samplerOptions?.online &&
                !samplerOptions.sampler_name.includes(sampler.id) ? ' · unavailable' : ''}
            </option>)}
          </select>
        </label>
        <label className="workspace-pref-field">{t('image.comfyScheduler')}
          <select aria-label={t('image.comfyScheduler')} value={image.scheduler}
            disabled={busy}
            onChange={e => change('scheduler', e.target.value as ImageSettings['scheduler'])}>
            {SCHEDULERS.map(scheduler => <option key={scheduler.id} value={scheduler.id}>
              {scheduler.label}{samplerOptions?.online &&
                !samplerOptions.scheduler.includes(scheduler.id) ? ' · unavailable' : ''}
            </option>)}
          </select>
        </label>
        <label className="workspace-pref-field" >{t('image.negativePrompt')}
          <input maxLength={1000} value={image.negative_prompt}
            onChange={e => change('negative_prompt', e.target.value)}/>
        </label>
      </div> : <div className="loading">{t('image.loading')}</div>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={busy} onClick={() => void discover()}>
          <RefreshCcw size={16}/> {t('image.findCheckpoints')}</button>
        <button className="secondary-button" disabled={busy}
          onClick={() => void inspectSamplerOptions()}>
          <RefreshCcw size={16}/> {t('image.checkSampling')}</button>
        <button className="primary-button" disabled={busy || !image ||
          (samplerOptions?.online === true &&
           (!samplerOptions.sampler_name.includes(image.sampler_name) ||
            !samplerOptions.scheduler.includes(image.scheduler)))}
          onClick={() => void save()}>
          {busy ? <LoaderCircle size={16} className="rotating"/> : <Check size={16}/>}
          Save image settings</button>
      </div>
      {samplerOptions?.online && image && <p role="status">
        Compatibilidad KSampler: {samplerOptions.sampler_name.includes(image.sampler_name) &&
          samplerOptions.scheduler.includes(image.scheduler)
          ? 'compatible selection' : 'this selection is unavailable in the current ComfyUI instance'}.
      </p>}
      <p className="noble-inspector-hint">Style affects the actual image prompt; sampler and scheduler settings change KSampler inputs. Non-default choices are verified against ComfyUI before generation.</p>
      {status?.online && <p>Detected checkpoint(s): {status.checkpoints.length}. The model will load when you select Illustrate.</p>}
    </div>
    <ImageCheckpointManager availableInComfy={status?.online ? status.checkpoints : []}
      onSelectCheckpoint={name => {
        change('checkpoint', name);
        setMessage('Checkpoint selected. Save image settings to apply it.');
      }}/>
    <div className="workspace-panel">
      <h3>{t('image.gpuMemory')}</h3>
      <p>Check observed free VRAM with nvidia-smi. You can warn or block ComfyUI requests below a configured reserve. This does not estimate a checkpoint's actual memory requirements or stop other processes.</p>
      {resourceStatus && <p role="status">
        {resourceStatus.selected_gpu
          ? resourceStatus.selected_gpu.name + ' · ' +
            resourceStatus.selected_gpu.free_mib + ' MiB free / ' +
            resourceStatus.selected_gpu.total_mib + ' MiB total'
          : 'GPU telemetry unavailable (CPU or another provider).'}
        {' · '}{resourceStatus.message}
      </p>}
      {resourceStatus?.workload.active && <p role="status">
        Active local operation: {resourceStatus.workload.active.kind}.
        Simultaneous requests for the same resource will receive a warning.
      </p>}
      {resources && <label className="workspace-pref-toggle">
        <span>{t('image.gpuMemoryDescription')}</span>
        <input type="checkbox" aria-label="Coordinate local GPU"
          checked={resources.serialize_local_gpu}
          onChange={e => setResources(x => x ? {
            ...x, serialize_local_gpu: e.target.checked,
          } : x)}/>
      </label>}
      {resources && <div className="workspace-field-grid">
        <label className="workspace-pref-field">{t('image.mode')}
          <select aria-label={t('image.mode')} value={resources.mode}
            onChange={e => setResources(x => x ? {
              ...x, mode: e.target.value as ResourceConfig['mode'],
            } : x)}>
            <option value="monitor">{t('image.monitorOnly')}</option>
            <option value="guard">{t('image.blockReserve')}</option>
          </select>
        </label>
        <label className="workspace-pref-field">{t('image.gpuIndex')}
          <input type="number" min={0} max={31} value={resources.gpu_index}
            aria-label="GPU index" onChange={e => setResources(x => x ? {
              ...x, gpu_index: Number(e.target.value),
            } : x)}/>
        </label>
        <label className="workspace-pref-field">{t('image.minReserve')}
          <input type="number" min={0} max={65536} step={256}
            value={resources.minimum_free_mib} aria-label="GPU reserve in MiB"
            onChange={e => setResources(x => x ? {
              ...x, minimum_free_mib: Number(e.target.value),
            } : x)}/>
        </label>
      </div>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={busy}
          onClick={() => void api.resourceStatus().then(setResourceStatus).catch(
            (e: Error) => setError(e.message))}>
          <RefreshCcw size={16}/> {t('image.checkVRAM')}</button>
        <button className="primary-button" disabled={busy || !resources}
          onClick={() => void saveResourcePolicy()}>
          <Check size={16}/> {t('image.savePolicy')}</button>
      </div>
    </div>
  </div>;
}
