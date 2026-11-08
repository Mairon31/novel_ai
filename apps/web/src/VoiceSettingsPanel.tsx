import { useTranslation } from 'react-i18next';
import { BackendDiagnostic } from './BackendDiagnostic';
import { formatUiNumber } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RefreshCcw, Volume2 } from 'lucide-react';
import { api } from './api';
import type { Settings, SpeechVoices, SpeechPreferences, PiperSynthesisConfig, PiperVoiceCatalog, PiperVoiceJob } from './types';

/** Piper preferences, downloads and samples never initialize image generation. */
export function VoiceSettingsPanel() {
  const { t, i18n } = useTranslation();
  const [setup, setSetup] = useState<Settings | null>(null);
  const [voices, setVoices] = useState<SpeechVoices | null>(null);
  const [voicePreferences, setVoicePreferences] = useState<SpeechPreferences | null>(null);
  const [synthesisConfig, setSynthesisConfig] = useState<PiperSynthesisConfig | null>(null);
  const [savedSynthesis, setSavedSynthesis] = useState<PiperSynthesisConfig | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<PiperVoiceCatalog | null>(null);
  const [voiceJobs, setVoiceJobs] = useState<PiperVoiceJob[]>([]);
  const [voiceAction, setVoiceAction] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(t('voiceUi.sampleDefault'));
  const previousSample = useRef(t('voiceUi.sampleDefault'));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Translate the default TTS example on language change, retaining custom text.
  useEffect(() => {
    const nextSample = t('voiceUi.sampleDefault');
    const previous = previousSample.current;
    if (nextSample !== previous && previewText === previous) {
      setPreviewText(nextSample);
      clearPreview();
    }
    previousSample.current = nextSample;
  }, [i18n.language, t]);
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
      setMessage(t('feedback.voiceSampleReady'));
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
      setMessage(t('feedback.voiceStarted'));
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
      setMessage(t(action === 'pause' ? 'feedback.downloadPaused' :
        action === 'resume' ? 'feedback.downloadResumed' : 'feedback.installCanceled'));
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setVoiceAction(null); }
  }

  async function saveDefaultVoice() {
    if (!voicePreferences) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setVoicePreferences(await api.saveSpeechPreferences(voicePreferences.default_voice_id));
      setMessage(t('feedback.voiceDefaultSaved'));
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
      setMessage(t('feedback.piperSaved'));
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
      setMessage(t(enabled ? 'feedback.ttsEnabled' : 'feedback.ttsDisabled'));
    } catch (exc) {
      setSetup(previous);
      setError((exc as Error).message);
    } finally { setBusy(false); }
  }

  return <div className="creative-settings voice-settings-panel">
    <div className="setting-section-intro">
      <h2>{t('settings.voice')}</h2>
      <p>{t('voice.description')}</p>
    </div>
    {(error || message) && <p role="status" className={error ? 'narrative-error' : 'narrative-saved'}>
      {error || <><Check size={15}/>{message}</>}</p>}
    <div className="workspace-panel">
      <h3><Volume2 size={18}/> {t('voice.localPiper')}</h3>
      <p>{t('voice.installHint')}</p>
      <div className="noble-voice-library" aria-label={t('uiField.voiceSettingsPanel.piperVoiceCatalog')}>
        <h4>{t('voice.latinVoices')}</h4>
        <p className="noble-inspector-hint">{t('voice.installDescription')}</p>
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
                t('jobs.installed') : status ? t('jobs.' + status, { defaultValue: t('jobs.unknown') }) : t('jobs.availableToInstall')}</span>
              <a href={voice.model_card} target="_blank" rel="noopener noreferrer">
                {t('voice.viewLicense')}</a>
            </div>
            {job && status !== 'installed' && <div className="noble-voice-progress">
              <progress aria-label={t('voiceUi.progress', { name: voice.name })} value={percent} max={100}/>
              <small>{percent}% · {formatUiNumber(job.received_bytes / 1024 / 1024, 1)} /
                {formatUiNumber(job.total_bytes / 1024 / 1024, 1)} MiB
                </small>
              {job.error && <BackendDiagnostic detail={job.error}/>}
            </div>}
            <div className="settings-buttons">
              {status === 'installed' ? <span>{t('voice.readySelect')}</span> :
                job && active ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'pause')}>
                    {t('voice.pauseDownload')}</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    {t('voice.cancelDownload')}</button>
                </> : job && (status === 'paused' || status === 'failed') ? <>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'resume')}>
                    {t('voice.resumeDownload')}</button>
                  <button type="button" className="secondary-button"
                    disabled={!!voiceAction} onClick={() => void controlVoice(job, 'cancel')}>
                    {t('voice.cancelDownload')}</button>
                </> : <button type="button" className="secondary-button"
                    disabled={!!voiceAction || busy} onClick={() => void installVoice(voice.id)}>
                    {t(voiceAction === voice.id ? 'voiceUi.starting' : 'voiceUi.install')}</button>}
            </div>
          </div>;
        })}
      </div>
      {voices && <p>{t('voiceUi.engineStatus', { status: t(voices.available ? 'voiceUi.piperReady' : 'voiceUi.piperMissing'), amount: voices.voices.length })} <code>{voices.models_dir}</code></p>}
      {voicePreferences && <div className="workspace-field-grid">
        <label className="workspace-pref-field">{t('voice.defaultVoice')}
          <select aria-label={t('a11y.defaultPiperVoice')} disabled={busy}
            value={voicePreferences.default_voice_id}
            onChange={e => {
              setVoicePreferences({ default_voice_id: e.target.value });
              clearPreview();
            }}>
            <option value="">{t('voice.firstInstalled')}</option>
            {voices?.voices.map(voice =>
              <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={busy ||
          (!!voicePreferences.default_voice_id &&
           !voices?.voices.some(v => v.id === voicePreferences.default_voice_id))}
          onClick={() => void saveDefaultVoice()} type="button">
          <Check size={16}/> {t('voice.saveDefault')}
        </button>
      </div>}
      <div className="noble-voice-synthesis workspace-field-grid">
        <h4>{t('voice.piperSettings')}</h4>
        <p>{t('voice.piperDescription')}</p>
        {synthesisConfig && <>
          <label className="workspace-pref-field">{t('voice.speed')}
            <input aria-label={t('a11y.piperSpeed')} type="number" min={0.5} max={2}
              step={0.05} value={synthesisConfig.length_scale} disabled={busy || previewBusy}
              onChange={e => changePiperParameter('length_scale', Number(e.target.value))}/>
            <small>{t('voice.speedHint')}</small>
          </label>
          <label className="workspace-pref-field">{t('voice.variation')}
            <input aria-label={t('uiField.voiceSettingsPanel.piperVoiceNoise')} type="number" min={0} max={1.5}
              step={0.05} value={synthesisConfig.noise_scale} disabled={busy || previewBusy}
              onChange={e => changePiperParameter('noise_scale', Number(e.target.value))}/>
          </label>
          <label className="workspace-pref-field">{t('voice.phonemeVariation')}
            <input aria-label={t('uiField.voiceSettingsPanel.piperPhonemeNoise')} type="number" min={0} max={1.5}
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
            <Check size={16}/> {t('voice.savePiper')}
          </button>
        </>}
      </div>
      <div className="noble-voice-preview">
        <label className="workspace-pref-field">{t('voice.sampleText')}
          <input aria-label={t('uiField.voiceSettingsPanel.voiceSampleText')} maxLength={400}
            value={previewText} disabled={previewBusy}
            onChange={e => { setPreviewText(e.target.value); clearPreview(); }}/>
        </label>
        <button type="button" className="secondary-button"
          disabled={previewBusy || !!synthesisDirty || !voices?.available || !voices.voices.length ||
            previewText.trim().length < 10}
          onClick={() => void previewPiper()}>
          {previewBusy ? <LoaderCircle size={16} className="rotating"/> : <Volume2 size={16}/>}
          {t(previewBusy ? 'voiceUi.previewBusy' : 'voiceUi.previewAction')}
        </button>
        {previewUrl && <audio aria-label={t('uiField.voiceSettingsPanel.playVoicePreview')} controls
          preload="none" src={previewUrl}/>}
        {synthesisDirty && <small role="status">{t('voice.saveBeforePreview')}</small>}
        <small>{t('voice.previewNote')}</small>
      </div>
      <label className="workspace-pref-toggle">
        <span>{t('voice.enableButtons')}</span>
        <input type="checkbox" checked={setup?.tts_enabled || false} disabled={busy || !setup}
          onChange={e => void toggleSpeech(e.target.checked)}/>
      </label>
      <p>{t('voice.offByDefault')}</p>
      <button className="secondary-button" disabled={busy}
        onClick={() => void refreshVoiceDownloads().catch((e: Error) => setError(e.message))}>
        <RefreshCcw size={16}/> {t('voice.refreshVoices')}</button>
    </div>
  </div>;
}
