import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RefreshCcw, Volume2 } from 'lucide-react';
import { api } from './api';
import type { Settings, SpeechVoices, SpeechPreferences, PiperVoiceCatalog, PiperVoiceJob } from './types';

/** Piper preferences, downloads and samples never initialize image generation. */
export function VoiceSettingsPanel() {
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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

  useEffect(() => {
    let mounted = true;
    Promise.all([api.settings(), api.speechVoices(), api.speechPreferences()])
      .then(([appSettings, speech, preferences]) => {
        if (mounted) { setSetup(appSettings); setVoices(speech); setVoicePreferences(preferences); }
      }).catch((exc: Error) => { if (mounted) setError(exc.message); });
    return () => { mounted = false; };
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

  return <div className="creative-settings voice-settings-panel">
    <div className="setting-section-intro">
      <h2>Voz / TTS</h2>
      <p>Voces instaladas, opciones de lectura y pruebas de audio bajo demanda.</p>
    </div>
    {(error || message) && <p role="status" className={error ? 'narrative-error' : 'narrative-saved'}>
      {error || <><Check size={15}/>{message}</>}</p>}
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
