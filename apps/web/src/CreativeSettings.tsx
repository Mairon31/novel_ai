import { useEffect, useRef, useState } from 'react';
import { Check, Image, LoaderCircle, RefreshCcw, Volume2 } from 'lucide-react';
import { api } from './api';
import type { ImageSettings, ImageStatus, Settings, SpeechVoices, SpeechPreferences, PiperVoiceCatalog, PiperVoiceJob, ResourceConfig, ResourceStatus } from './types';

interface Props {
  imageMode: Settings['image_mode'];
  onImageMode: (next: Settings['image_mode']) => void;
}

export function CreativeSettings({ imageMode, onImageMode }: Props) {
  const [image, setImage] = useState<ImageSettings | null>(null);
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [setup, setSetup] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [voicePreferences, setVoicePreferences] = useState<SpeechPreferences | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<PiperVoiceCatalog | null>(null);
  const [voiceJobs, setVoiceJobs] = useState<PiperVoiceJob[]>([]);
  const [voiceAction, setVoiceAction] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('Hola. Esta es una prueba de voz de Noble AI.');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);
  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }
  async function previewPiper() {
    const voiceId = voicePreferences?.default_voice_id || voices?.voices[0]?.id;
    if (!voiceId || previewBusy) return;
    setPreviewBusy(true); setError(''); setMessage('');
    try {
      const blob = await api.previewPiperVoice(voiceId, previewText.trim());
      const nextUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = nextUrl; setPreviewUrl(nextUrl);
      setMessage('Muestra generada. Pulsa Reproducir para escucharla.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setPreviewBusy(false); }
  }
  const [resources, setResources] = useState<ResourceConfig | null>(null);
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api.imageConfig(), api.settings(), api.speechVoices(),
                 api.resourceConfig(), api.resourceStatus(), api.speechPreferences()])
      .then(([imageSettings, appSettings, speech, policy, telemetry, speechPrefs]) => {
        if (!active) return;
        setImage(imageSettings); setSetup(appSettings); setVoices(speech);
        setVoicePreferences(speechPrefs);
        setResources(policy); setResourceStatus(telemetry);
      }).catch((exc: Error) => { if (active) setError(exc.message); });
    return () => { active = false; };
  }, []);
  async function refreshVoiceDownloads() {
    const [catalog, jobs, current] = await Promise.all([
      api.piperCatalog(), api.piperJobs(), api.speechVoices(),
    ]);
    setVoiceCatalog(catalog); setVoiceJobs(jobs.downloads); setVoices(current);
  }
  useEffect(() => {
    let live = true;
    Promise.all([api.piperCatalog(), api.piperJobs()]).then(([catalog, jobs]) => {
      if (!live) return;
      setVoiceCatalog(catalog); setVoiceJobs(jobs.downloads);
    }).catch((exc: Error) => { if (live) setError(exc.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!voiceJobs.some(j => j.status === 'queued' || j.status === 'downloading' ||
                             j.status === 'verifying')) return;
    const interval = window.setInterval(() => {
      void refreshVoiceDownloads().catch((exc: Error) => setError(exc.message));
    }, 1200);
    return () => window.clearInterval(interval);
  }, [voiceJobs]);
  async function installVoice(voiceId: string) {
    if (voiceAction) return;
    setVoiceAction(voiceId); setError(''); setMessage('');
    try {
      await api.installPiperVoice(voiceId);
      await refreshVoiceDownloads();
      setMessage('Instalación de voz iniciada; el progreso aparecerá abajo.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setVoiceAction(null); }
  }
  async function controlVoice(job: PiperVoiceJob, action: 'pause' | 'resume' | 'cancel') {
    if (voiceAction) return;
    setVoiceAction(job.voice_id); setError(''); setMessage('');
    try {
      await api.controlPiperVoice(job.id, action);
      await refreshVoiceDownloads();
      setMessage(action === 'pause' ? 'Descarga pausada.' :
        action === 'resume' ? 'Descarga reanudada.' : 'Instalación cancelada.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setVoiceAction(null); }
  }

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

  async function saveDefaultVoice() {
    if (!voicePreferences) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setVoicePreferences(await api.saveSpeechPreferences(voicePreferences.default_voice_id));
      setMessage('Voz predeterminada guardada para el lector.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setBusy(false); }
  }

  async function toggleSpeech(enabled: boolean) {
    setBusy(true); setError(''); setMessage('');
    const previous = setup;
    setSetup(current => current ? { ...current, tts_enabled: enabled, tts_autoread: false } : current);
    try {
      setSetup(await api.patchSettings({ tts_enabled: enabled, tts_autoread: false }));
      setMessage(enabled ? 'TTS activado solo para los botones Escuchar.' : 'TTS desactivado.');
    } catch (exc) {
      setSetup(previous);
      setError((exc as Error).message);
    } finally { setBusy(false); }
  }
  const change = <K extends keyof ImageSettings>(field: K, value: ImageSettings[K]) => {
    setImage(previous => previous ? { ...previous, [field]: value } : previous);
  };

  return <div className="creative-settings">
    <div className="setting-section-intro">
      <h2>Generación multimedia</h2>
      <p>Imagen y voz son servicios independientes de la narración. Solo se ejecutan con tu solicitud.</p>
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
    <div className="workspace-panel">
      <h3><Volume2 size={18}/> Voz local con Piper</h3>
      <p>Instala una voz de español latinoamericano desde el catálogo o añade manualmente el modelo <code>.onnx</code> y su configuración <code>.onnx.json</code>. La síntesis ocurre únicamente cuando pulsas «Escuchar».</p>
      <div className="noble-voice-library" aria-label="Catálogo de voces Piper">
        <h4>Voces de español latinoamericano</h4>
        <p className="noble-inspector-hint">Descarga explícita desde Hugging Face, con revisión fijada y verificación de archivos. El motor Piper se instala por separado.</p>
        {voiceCatalog?.voices.map(voice => {
          const job = voiceJobs.find(item => item.voice_id === voice.id);
          const status = voice.installed ? 'installed' : job?.status;
          const active = status === 'queued' || status === 'downloading' || status === 'verifying';
          const percent = job?.total_bytes
            ? Math.min(100, Math.round(job.received_bytes / job.total_bytes * 100)) : 0;
          return <div className="noble-voice-card" key={voice.id}>
            <div className="noble-voice-main">
              <strong>{voice.name}</strong>
              <span>{voice.language} · {voice.quality} · {status === 'installed' ?
                'Instalada' : status || 'Disponible para instalar'}</span>
              <a href={voice.model_card} target="_blank" rel="noopener noreferrer">
                Consultar licencia y archivos de la voz</a>
            </div>
            {job && status !== 'installed' && <div className="noble-voice-progress">
              <progress aria-label={'Progreso de ' + voice.name} value={percent} max={100}/>
              <small>{percent}% · {(job.received_bytes / 1024 / 1024).toFixed(1)} /
                {(job.total_bytes / 1024 / 1024).toFixed(1)} MiB
                {job.error ? ' · ' + job.error : ''}</small>
            </div>}
            <div className="settings-buttons">
              {status === 'installed' ? <span>Lista para seleccionar</span> :
                job && active ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'pause')}>
                    Pausar descarga</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    Cancelar descarga</button>
                </> : job && (status === 'paused' || status === 'failed') ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'resume')}>
                    Reanudar descarga</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    Cancelar descarga</button>
                </> : <button type="button" className="secondary-button"
                    disabled={!!voiceAction || busy} onClick={() => void installVoice(voice.id)}>
                    {voiceAction === voice.id ? 'Iniciando...' : 'Instalar voz'}</button>}
            </div>
          </div>;
        })}
      </div>
      {voices && <p>Motor: {voices.available ? 'Piper detectado' : 'Piper no instalado en PATH'} ·
        Voces instaladas: {voices.voices.length} · Carpeta: <code>{voices.models_dir}</code></p>}
      {voicePreferences && <div className="workspace-field-grid">
        <label className="workspace-pref-field">Voz predeterminada del lector
          <select aria-label="Voz predeterminada de Piper" disabled={busy}
            value={voicePreferences.default_voice_id}
            onChange={e => {
              setVoicePreferences({ default_voice_id: e.target.value });
              clearPreview();
            }}>
            <option value="">Primera voz instalada</option>
            {voices?.voices.map(voice =>
              <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={busy ||
          (!!voicePreferences.default_voice_id &&
           !voices?.voices.some(v => v.id === voicePreferences.default_voice_id))}
          onClick={() => void saveDefaultVoice()} type="button">
          <Check size={16}/> Guardar voz predeterminada
        </button>
      </div>}
      <div className="noble-voice-preview">
        <label className="workspace-pref-field">Texto para probar voz
          <input aria-label="Texto de muestra de voz" maxLength={400}
            value={previewText} disabled={previewBusy}
            onChange={e => { setPreviewText(e.target.value); clearPreview(); }}/>
        </label>
        <button type="button" className="secondary-button"
          disabled={previewBusy || !voices?.available || !voices.voices.length ||
            previewText.trim().length < 10}
          onClick={() => void previewPiper()}>
          {previewBusy ? <LoaderCircle size={16} className="rotating"/> : <Volume2 size={16}/>}
          {previewBusy ? 'Generando prueba...' : 'Probar voz seleccionada'}
        </button>
        {previewUrl && <audio aria-label="Reproducir prueba de voz" controls
          preload="none" src={previewUrl}/>}
        <small>Solo genera la muestra al pulsar Probar. Necesita Piper instalado y
          una voz ONNX/JSON válida; el audio no se añade a ninguna historia.</small>
      </div>
      <label className="workspace-pref-toggle">
        <span>Activar botones de voz bajo demanda</span>
        <input type="checkbox" checked={setup?.tts_enabled || false} disabled={busy || !setup}
          onChange={e => void toggleSpeech(e.target.checked)}/>
      </label>
      <p>No se activa autolectura ni Piper en segundo plano; solo se descarga una voz tras solicitarla.</p>
      <button className="secondary-button" disabled={busy}
        onClick={() => void refreshVoiceDownloads().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Actualizar voces</button>
    </div>
  </div>;
}
