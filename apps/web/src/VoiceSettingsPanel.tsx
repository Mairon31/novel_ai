import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RefreshCcw, Volume2 } from 'lucide-react';
import { api } from './api';
import type { Settings, SpeechVoices, SpeechPreferences, PiperSynthesisConfig, PiperVoiceCatalog, PiperVoiceJob } from './types';

/** Piper preferences, downloads and samples never initialize image generation. */
export function VoiceSettingsPanel() {
  const [setup, setSetup] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [voicePreferences, setVoicePreferences] = useState<SpeechPreferences | null>(null);
  const [synthesisConfig, setSynthesisConfig] = useState<PiperSynthesisConfig | null>(null);
  const [savedSynthesis, setSavedSynthesis] = useState<PiperSynthesisConfig | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<PiperVoiceCatalog | null>(null);
  const [voiceJobs, setVoiceJobs] = useState<PiperVoiceJob[]>([]);
  const [voiceAction, setVoiceAction] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('Hello. This is a Noble AI voice test.');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const synthesisDirty = synthesisConfig && savedSynthesis &&
    (synthesisConfig.length_scale !== savedSynthesis.length_scale ||
     synthesisConfig.noise_scale !== savedSynthesis.noise_scale ||
     synthesisConfig.noise_w !== savedSynthesis.noise_w);
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
      setMessage('Sample generated. Press Play to listen.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setPreviewBusy(false); }
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([api.settings(), api.speechVoices(), api.speechPreferences(),
                 api.piperSynthesisConfig()])
      .then(([appSettings, speech, preferences, synthesis]) => {
        if (mounted) {
          setSetup(appSettings); setVoices(speech); setVoicePreferences(preferences);
          setSynthesisConfig(synthesis); setSavedSynthesis(synthesis);
        }
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
      setMessage('Voice installation started; progress will appear below.');
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
      setMessage(action === 'pause' ? 'Download paused.' :
        action === 'resume' ? 'Download resumed.' : 'Installation canceled.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setVoiceAction(null); }
  }

  async function saveDefaultVoice() {
    if (!voicePreferences) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setVoicePreferences(await api.saveSpeechPreferences(voicePreferences.default_voice_id));
      setMessage('Default reader voice saved.');
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setBusy(false); }
  }

  async function savePiperParameters() {
    if (!synthesisConfig || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await api.savePiperSynthesisConfig(synthesisConfig);
      setSynthesisConfig(saved); setSavedSynthesis(saved);
      clearPreview();
      setMessage('Piper settings saved for future synthesis.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  function changePiperParameter(field: keyof PiperSynthesisConfig, value: number) {
    clearPreview();
    setSynthesisConfig(previous => previous ? { ...previous, [field]: value } : previous);
  }

  async function toggleSpeech(enabled: boolean) {
    setBusy(true); setError(''); setMessage('');
    const previous = setup;
    setSetup(current => current ? { ...current, tts_enabled: enabled, tts_autoread: false } : current);
    try {
      setSetup(await api.patchSettings({ tts_enabled: enabled, tts_autoread: false }));
      setMessage(enabled ? 'TTS enabled only for explicit Listen actions.' : 'TTS disabled.');
    } catch (exc) {
      setSetup(previous);
      setError((exc as Error).message);
    } finally { setBusy(false); }
  }

  return <div className="creative-settings voice-settings-panel">
    <div className="setting-section-intro">
      <h2>Voice / TTS</h2>
      <p>Installed voices, reader preferences and on-demand audio previews.</p>
    </div>
    {(error || message) && <p role="status" className={error ? 'narrative-error' : 'narrative-saved'}>
      {error || <><Check size={15}/>{message}</>}</p>}
    <div className="workspace-panel">
      <h3><Volume2 size={18}/> Local speech with Piper</h3>
      <p>Install a Latin American Spanish voice from the catalog or manually add the <code>.onnx</code> and its configuration <code>.onnx.json</code>. Synthesis runs only when you press Listen.</p>
      <div className="noble-voice-library" aria-label="Piper voice catalog">
        <h4>Latin American Spanish voices</h4>
        <p className="noble-inspector-hint">Explicit Hugging Face downloads with pinned revisions and file verification. Install the Piper engine separately.</p>
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
                'Installed' : status || 'Available to install'}</span>
              <a href={voice.model_card} target="_blank" rel="noopener noreferrer">
                View voice license and files</a>
            </div>
            {job && status !== 'installed' && <div className="noble-voice-progress">
              <progress aria-label={'Progress for ' + voice.name} value={percent} max={100}/>
              <small>{percent}% · {(job.received_bytes / 1024 / 1024).toFixed(1)} /
                {(job.total_bytes / 1024 / 1024).toFixed(1)} MiB
                {job.error ? ' · ' + job.error : ''}</small>
            </div>}
            <div className="settings-buttons">
              {status === 'installed' ? <span>Ready to select</span> :
                job && active ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'pause')}>
                    Pause download</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    Cancel download</button>
                </> : job && (status === 'paused' || status === 'failed') ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'resume')}>
                    Resume download</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    Cancel download</button>
                </> : <button type="button" className="secondary-button"
                    disabled={!!voiceAction || busy} onClick={() => void installVoice(voice.id)}>
                    {voiceAction === voice.id ? 'Starting...' : 'Install voice'}</button>}
            </div>
          </div>;
        })}
      </div>
      {voices && <p>Motor: {voices.available ? 'Piper detected' : 'Piper not found in PATH'} ·
        Installed voices: {voices.voices.length} · Folder: <code>{voices.models_dir}</code></p>}
      {voicePreferences && <div className="workspace-field-grid">
        <label className="workspace-pref-field">Default reader voice
          <select aria-label="Default Piper voice" disabled={busy}
            value={voicePreferences.default_voice_id}
            onChange={e => {
              setVoicePreferences({ default_voice_id: e.target.value });
              clearPreview();
            }}>
            <option value="">First installed voice</option>
            {voices?.voices.map(voice =>
              <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={busy ||
          (!!voicePreferences.default_voice_id &&
           !voices?.voices.some(v => v.id === voicePreferences.default_voice_id))}
          onClick={() => void saveDefaultVoice()} type="button">
          <Check size={16}/> Save default voice
        </button>
      </div>}
      <div className="noble-voice-synthesis workspace-field-grid">
        <h4>Piper synthesis settings</h4>
        <p>These settings affect previews and newly generated speech. They never play audio automatically.</p>
        {synthesisConfig && <>
          <label className="workspace-pref-field">Speed (phoneme duration)
            <input aria-label="Piper speed" type="number" min={0.5} max={2}
              step={0.05} value={synthesisConfig.length_scale} disabled={busy || previewBusy}
              onChange={e => changePiperParameter('length_scale', Number(e.target.value))}/>
            <small>1.0 is normal speed; lower values produce faster speech.</small>
          </label>
          <label className="workspace-pref-field">Voice variation
            <input aria-label="Piper voice noise" type="number" min={0} max={1.5}
              step={0.05} value={synthesisConfig.noise_scale} disabled={busy || previewBusy}
              onChange={e => changePiperParameter('noise_scale', Number(e.target.value))}/>
          </label>
          <label className="workspace-pref-field">Phoneme variation
            <input aria-label="Piper phoneme noise" type="number" min={0} max={1.5}
              step={0.05} value={synthesisConfig.noise_w} disabled={busy || previewBusy}
              onChange={e => changePiperParameter('noise_w', Number(e.target.value))}/>
          </label>
          <button className="secondary-button" type="button" disabled={busy || previewBusy ||
            !Number.isFinite(synthesisConfig.length_scale) ||
            synthesisConfig.length_scale < 0.5 || synthesisConfig.length_scale > 2 ||
            !Number.isFinite(synthesisConfig.noise_scale) ||
            synthesisConfig.noise_scale < 0 || synthesisConfig.noise_scale > 1.5 ||
            !Number.isFinite(synthesisConfig.noise_w) ||
            synthesisConfig.noise_w < 0 || synthesisConfig.noise_w > 1.5}
            onClick={() => void savePiperParameters()}>
            <Check size={16}/> Save Piper settings
          </button>
        </>}
      </div>
      <div className="noble-voice-preview">
        <label className="workspace-pref-field">Voice preview text
          <input aria-label="Voice sample text" maxLength={400}
            value={previewText} disabled={previewBusy}
            onChange={e => { setPreviewText(e.target.value); clearPreview(); }}/>
        </label>
        <button type="button" className="secondary-button"
          disabled={previewBusy || !!synthesisDirty || !voices?.available || !voices.voices.length ||
            previewText.trim().length < 10}
          onClick={() => void previewPiper()}>
          {previewBusy ? <LoaderCircle size={16} className="rotating"/> : <Volume2 size={16}/>}
          {previewBusy ? 'Generating preview...' : 'Preview selected voice'}
        </button>
        {previewUrl && <audio aria-label="Play voice preview" controls
          preload="none" src={previewUrl}/>}
        {synthesisDirty && <small role="status">Save the updated settings before testing the voice.</small>}
        <small>Generate previews only by pressing Preview. Piper and
          a valid ONNX/JSON voice; preview audio is not added to any story.</small>
      </div>
      <label className="workspace-pref-toggle">
        <span>Enable on-demand speech buttons</span>
        <input type="checkbox" checked={setup?.tts_enabled || false} disabled={busy || !setup}
          onChange={e => void toggleSpeech(e.target.checked)}/>
      </label>
      <p>Automatic reading and background Piper are disabled; a voice downloads only after you request it.</p>
      <button className="secondary-button" disabled={busy}
        onClick={() => void refreshVoiceDownloads().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> Refresh voices</button>
    </div>
  </div>;
}
