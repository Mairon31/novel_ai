import { useEffect, useState } from 'react';
import { Check, Image, LoaderCircle, RefreshCcw, Volume2 } from 'lucide-react';
import { api } from './api';
import type { ImageSettings, ImageStatus, Settings, SpeechVoices } from './types';

interface Props {
  imageMode: Settings['image_mode'];
  onImageMode: (next: Settings['image_mode']) => void;
}

export function CreativeSettings({ imageMode, onImageMode }: Props) {
  const [image, setImage] = useState<ImageSettings | null>(null);
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [setup, setSetup] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api.imageConfig(), api.settings(), api.speechVoices()])
      .then(([imageSettings, appSettings, speech]) => {
        if (!active) return;
        setImage(imageSettings); setSetup(appSettings); setVoices(speech);
      }).catch((exc: Error) => { if (active) setError(exc.message); });
    return () => { active = false; };
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
  async function toggleSpeech(enabled: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      setSetup(await api.patchSettings({ tts_enabled: enabled, tts_autoread: false }));
      setMessage(enabled ? 'TTS activado solo para los botones Escuchar.' : 'TTS desactivado.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
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
      <h3><Volume2 size={18}/> Voz local con Piper</h3>
      <p>Compatible con voces Piper ONNX en CPU. Coloca archivos <code>.onnx</code> y <code>.onnx.json</code> en el directorio de voces del backend. La síntesis comienza únicamente al pulsar «Escuchar» en un turno guardado.</p>
      {voices && <p>Motor: {voices.available ? 'Piper detectado' : 'Piper no instalado en PATH'} ·
        Voces instaladas: {voices.voices.length} · Carpeta: <code>{voices.models_dir}</code></p>}
      <label className="workspace-pref-toggle">
        <span>Activar botones de voz bajo demanda</span>
        <input type="checkbox" checked={setup?.tts_enabled || false} disabled={busy || !setup}
          onChange={e => void toggleSpeech(e.target.checked)}/>
      </label>
      <p>No se activa autolectura, no se inicia Piper en segundo plano y no se descarga ninguna voz automáticamente.</p>
      <button className="secondary-button" disabled={busy}
        onClick={() => void api.speechVoices().then(setVoices).catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Actualizar voces</button>
    </div>
  </div>;
}
