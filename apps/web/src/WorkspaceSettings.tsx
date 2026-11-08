import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InterfaceLanguageSelector } from './InterfaceLanguageSelector';
import {
  ArrowUpRight, ArrowRight, Check, Cpu, Download, Globe2, Image,
  KeyRound, Keyboard, Languages, LoaderCircle, LockKeyhole, MonitorCog,
  Palette, RefreshCcw, Server, Settings2, ShieldCheck,
  SlidersHorizontal, Trash2, Volume2,
} from 'lucide-react';
import { api } from './api';
import type {
  About, NetworkCapabilities, ProviderCredentialStatus, RuntimeDiagnostics,
  WorkspacePreferences,
} from './types';
import { NarrativeSettings } from './NarrativeSettings';
import { RuntimeManager } from './RuntimeManager';
import { RemoteWorkers } from './RemoteWorkers';
import { ImageSettingsPanel } from './ImageSettingsPanel';
import { AboutSettingsPanel } from './AboutSettingsPanel';
import { UpdatesSettingsPanel } from './UpdatesSettingsPanel';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

type Tab = 'overview' | 'narration' | 'images' | 'voice' | 'languages' | 'providers' |
  'appearance' | 'runtimes' | 'shortcuts' | 'network' | 'about' | 'updates';

const SETTINGS_TABS: readonly Tab[] = ['overview', 'narration', 'images', 'voice',
  'languages', 'providers', 'appearance', 'runtimes', 'shortcuts', 'network',
  'about', 'updates'];

function tabFromHash(): Tab {
  const segment = window.location.hash.replace(/^#\/configuracion\/?/, '').replace(/\/$/, '');
  if (segment === 'multimedia') return 'images'; // legacy link before N-25
  return SETTINGS_TABS.includes(segment as Tab) ? segment as Tab : 'overview';
}

const tabs: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'overview', label: 'settings.overview', icon: Settings2 },
  { id: 'narration', label: 'settings.narration', icon: SlidersHorizontal },
  { id: 'images', label: 'settings.images', icon: Image },
  { id: 'voice', label: 'settings.voice', icon: Volume2 },
  { id: 'languages', label: 'settings.languages', icon: Languages },
  { id: 'providers', label: 'settings.providers', icon: Globe2 },
  { id: 'appearance', label: 'settings.appearance', icon: Palette },
  { id: 'runtimes', label: 'settings.runtimes', icon: Cpu },
  { id: 'shortcuts', label: 'settings.shortcuts', icon: Keyboard },
  { id: 'network', label: 'settings.network', icon: Server },
  { id: 'about', label: 'settings.about', icon: MonitorCog },
  { id: 'updates', label: 'settings.updates', icon: Download },
];

const settingGroups: {title:string; description:string; sections:Tab[]}[] = [
  {title:'settings.group.overview', description:'settings.group.overviewDescription',
    sections:['overview']},
  {title:'settings.group.intelligence',description:'settings.group.intelligenceDescription',
    sections:['narration','providers','languages']},
  {title:'settings.group.media',description:'settings.group.mediaDescription',
    sections:['images','voice']},
  {title:'settings.group.application',description:'settings.group.applicationDescription',
    sections:['appearance','shortcuts','runtimes']},
  {title:'settings.group.connections',description:'settings.group.connectionsDescription',
    sections:['network','about','updates']},
];

function applyAppearance(p: WorkspacePreferences) {
  document.documentElement.dataset.nobleAccent = p.accent;
  document.documentElement.dataset.nobleReaderLayout = p.reader_layout;
  document.documentElement.style.setProperty('--noble-reader-scale', String(p.font_scale / 100));
}

interface Props {
  modelsDir: string;
  imageMode: 'scene' | 'manual' | 'off';
  onImageMode: (value: 'scene' | 'manual' | 'off') => void;
  narrativeRevision: number;
  onNarratorActivated: () => void;
}

export function WorkspaceSettings({ modelsDir, imageMode, onImageMode, narrativeRevision, onNarratorActivated }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  // Each settings tab has its own reloadable hash route. Browser Back/Forward
  // and direct links update the selected tab without remounting the workspace.
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  function selectTab(id: Tab) {
    setTab(id);
    setFeedback(''); setError('');
    const nextHash = '#/configuracion' + (id === 'overview' ? '' : '/' + id);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const [about, setAbout] = useState<About | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [network, setNetwork] = useState<NetworkCapabilities | null>(null);
  const [credential, setCredential] = useState<ProviderCredentialStatus | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api.workspacePreferences(), api.about(), api.openRouterCredential()])
      .then(([p, a, k]) => { if (active) {
        setPrefs(p); setAbout(a); setCredential(k); applyAppearance(p);
      } }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (tab === 'runtimes' && !diagnostics) {
      void api.runtimeDiagnostics().then(setDiagnostics).catch((e: Error) => setError(e.message));
    }
    if (tab === 'network' && !network) {
      void api.networkCapabilities().then(setNetwork).catch((e: Error) => setError(e.message));
    }
  }, [tab, diagnostics, network]);

  async function update<K extends keyof WorkspacePreferences>(field: K, value: WorkspacePreferences[K]) {
    if (!prefs || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const next = await api.patchWorkspacePreferences({ [field]: value });
      setPrefs(next);
      window.dispatchEvent(new CustomEvent('noble-shortcuts-changed', { detail: next.shortcuts_enabled }));
      if (field === 'accent' || field === 'font_scale' || field === 'reader_layout')
        applyAppearance(next);
      setFeedback(t('settings.preferenceSaved'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function changeKey(remove = false) {
    setBusy(true); setFeedback(''); setError('');
    try {
      const updated = remove ? await api.deleteOpenRouterCredential() :
        await api.saveOpenRouterCredential(keyDraft);
      setCredential(updated); setKeyDraft('');
      setFeedback(remove ? 'Key removed from secure storage.' : 'Key saved in the system credential store.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function option<T extends string | number>(name: string, value: T, choices: [T, string][],
                                               onChange: (v: T) => void) {
    return <label className="workspace-pref-field">{name}
      <select value={value} disabled={busy} onChange={e => {
        const raw = e.target.value;
        const found = choices.find(x => String(x[0]) === raw);
        if (found) onChange(found[0]);
      }}>
        {choices.map(([v, title]) => <option key={String(v)} value={String(v)}>{title}</option>)}
      </select></label>;
  }
  function toggle(name: string, checked: boolean, updateFn: (next: boolean) => void) {
    return <label className="workspace-pref-toggle"><span>{name}</span>
      <input type="checkbox" checked={checked} disabled={busy}
        onChange={e => updateFn(e.target.checked)}/></label>;
  }

  return <section className="hub workspace-settings">
    <div className="page-heading"><div className="eyebrow"><Settings2 size={14}/> {t("settings.customizable")}</div>
      <h1>{t("settings.title")}<span className="title-dot">.</span></h1>
      <p>{t("settings.subtitle")}</p>
    </div>
    <div className="workspace-settings-shell">
      <nav aria-label={t("settings.sections")} className="workspace-settings-tabs">
        {settingGroups.map(group => <div className="settings-nav-group" key={group.title}>
          <span className="settings-nav-label">{t(group.title)}</span>
          <small>{t(group.description)}</small>
          {group.sections.map(id => {
            const item = tabs.find(candidate => candidate.id === id)!;
            return <button key={item.id} className={tab === item.id ? 'selected' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => selectTab(item.id)}>
              <item.icon size={17}/>{t(item.label)}</button>;
          })}
        </div>)}
      </nav>
      <div className="workspace-settings-body">
        {!prefs && <div className="loading"><LoaderCircle className="rotating" size={18}/> {t("settings.loadingPreferences")}</div>}
        {error && <p className="narrative-error" role="alert">{error}</p>}
        {feedback && <p className="narrative-saved" role="status"><Check size={16}/>{feedback}</p>}

        {tab === 'overview' && <div className="workspace-settings-overview">
          <div className="setting-section-intro">
            <span className="overline">{t("settings.studioControls")}</span>
            <h2>{t("settings.workspace")}</h2>
            <p>{t("settings.workspaceDescription")}</p>
          </div>
          <div className="workspace-settings-snapshot">
            <div><Languages size={17}/><small>{t("settings.narrationLanguage")}</small>
              <strong>{prefs?.target_language === 'es-419' ? 'Latin American Spanish' :
                prefs?.target_language || 'Loading...'}</strong></div>
            <div><Volume2 size={17}/><small>{t("settings.illustrations")}</small>
              <strong>{imageMode === 'off' ? t('common.disabled') :
                imageMode === 'manual' ? t('settings.onDemand') : t('settings.perScene')}</strong></div>
            <div><KeyRound size={17}/><small>OpenRouter</small>
              <strong>{credential?.configured ? t('settings.keyConfigured') : t('settings.noKey')}</strong></div>
            <div><Cpu size={17}/><small>{t("settings.localVersion")}</small>
              <strong>{about?.version || 'Loading...'}</strong></div>
          </div>
          <div className="workspace-settings-overview-grid">
            {[
              {id:'narration',title:'settings.narrativeEngine',summary:'settings.card.narration'},
              {id:'images',title:'settings.images',summary:'settings.card.images'},
              {id:'voice',title:'settings.voice',summary:'settings.card.voice'},
              {id:'providers',title:'settings.providers',summary:'settings.card.providers'},
              {id:'languages',title:'settings.languages',summary:'settings.card.languages'},
              {id:'appearance',title:'settings.appearance',summary:'settings.card.appearance'},
              {id:'runtimes',title:'settings.runtimes',summary:'settings.card.runtimes'},
              {id:'network',title:'settings.network',summary:'settings.card.network'},
              {id:'shortcuts',title:'settings.shortcuts',summary:'settings.card.shortcuts'},
              {id:'about',title:'settings.about',summary:'settings.card.about'},
              {id:'updates',title:'settings.updates',summary:'settings.card.updates'},
            ].map(item => {
              const section = tabs.find(candidate => candidate.id === item.id)!;
              return <button className="workspace-overview-card" key={item.id}
                onClick={() => selectTab(section.id)}>
                <span className="workspace-overview-icon"><section.icon size={22}/></span>
                <span><strong>{t(item.title)}</strong><small>{t(item.summary)}</small></span>
                <ArrowRight size={17}/>
              </button>;
            })}
          </div>
          <div className="workspace-panel workspace-overview-storage">
            <h3>{t("settings.modelStorage")}</h3>
            <code title={modelsDir}>{modelsDir || t('settings.pathUnavailable')}</code>
            <p>{t("settings.managePaths")}</p>
          </div>
        </div>}

        {tab === 'narration' && <>
          <div className="setting-section-intro"><h2>{t("settings.narrativeEngine")}</h2>
            <p>{t("settings.narrativeEngineDescription")}</p></div>
          <NarrativeSettings key={narrativeRevision}/>
          <RuntimeManager onActivated={onNarratorActivated}/>
        </>}

        {tab === 'images' && <ImageSettingsPanel imageMode={imageMode} onImageMode={onImageMode}/>}
        {tab === 'voice' && <VoiceSettingsPanel/>}

        {tab === 'languages' && prefs && <>
          <div className="setting-section-intro"><h2>{t("settings.languageTitle")}</h2>
            <p>{t("settings.languageDescription")}</p></div>
          <div className="workspace-panel"><InterfaceLanguageSelector/>
            <p className="noble-inspector-hint">{t("settings.uiLanguageDescription")}</p>
            <small>{t("settings.uiLanguageHint")}</small></div>
          <div className="workspace-panel workspace-field-grid">
            {option(t('settings.outputLanguage'), prefs.target_language, [
              ['es-419', 'Latin American Spanish'], ['en', 'English'], ['ja', '日本語'],
              ['ko', '한국어'], ['pt-BR', 'Português brasileiro'], ['fr', 'Français'],
            ], v => void update('target_language', v))}
            {option(t('settings.inputLanguage'), prefs.source_language, [
              ['auto', 'Detect automatically'], ['es', 'Español'], ['en', 'English'],
              ['ja', 'Japanese'], ['ko', 'Korean'], ['pt', 'Portuguese'], ['fr', 'French'],
            ], v => void update('source_language', v))}
            {option(t('settings.translationMode'), prefs.translation_mode, [
              ['off', 'Standard narration'], ['target_output', 'Preserve meaning and respond in the target language'],
            ], v => void update('translation_mode', v))}
            {option(t('settings.narrationStyle'), prefs.narration_style, [
              ['natural', 'Natural and conversational'], ['literary', 'Literary and descriptive'],
              ['concise', 'Brief and dynamic'],
            ], v => void update('narration_style', v))}
          </div>
          <div className="workspace-note"><Languages size={17}/> Settings are stored in SQLite and affect new generation, not previously saved chapters.</div>
        </>}

        {tab === 'providers' && <>
          <div className="setting-section-intro"><h2>Providers and services</h2>
            <p>Connect an external narrator without consuming local GPU resources. ComfyUI belongs in Images and Piper in Voice / TTS; paid image and voice provider integrations remain planned.</p></div>
          <div className="workspace-panel">
            <div className="workspace-provider-head"><span className="provider-icon">OR</span><div>
              <h3>OpenRouter</h3><p>Cloud language models with provider-specific billing.</p></div>
              <span className={credential?.configured ? 'provider-ready' : 'provider-missing'}>
                {credential?.configured ? 'Configured' : 'No key'}</span></div>
            <p>The key is kept in the system credential store, never in story history or SQLite.</p>
            <label className="workspace-pref-field">API key
              <input type="password" value={keyDraft} autoComplete="off" placeholder="Enter your OpenRouter key"
                onChange={e => setKeyDraft(e.target.value)}/></label>
            <div className="settings-buttons">
              <button className="primary-button" disabled={busy || keyDraft.trim().length < 12}
                onClick={() => void changeKey()}><KeyRound size={16}/> Save key</button>
              {credential?.configured && credential.storage !== 'environment' && <button className="secondary-button"
                disabled={busy} onClick={() => void changeKey(true)}><Trash2 size={16}/> Remove key</button>}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer"
                className="workspace-external">Create key <ArrowUpRight size={15}/></a>
            </div>
          </div>
          <div className="workspace-panel">
            <h3>Providers by feature</h3>
            <div className="workspace-service-row"><strong>Narration</strong><span>Ollama, KoboldCpp, and OpenRouter</span><b>Integrated</b></div>
            <div className="workspace-service-row"><strong>Images</strong><span>Local ComfyUI on demand</span><b>Connectable</b></div>
            <div className="workspace-service-row"><strong>Voices</strong><span>Local CPU Piper on demand</span><b>Connectable</b></div>
            <div className="workspace-service-row"><strong>Workers</strong><span>Authenticated remote LLM worker</span><b>Connectable</b></div>
          </div>
        </>}

        {tab === 'appearance' && prefs && <>
          <div className="setting-section-intro"><h2>Appearance and reader</h2>
            <p>Customize Noble AI and your reading experience for desktop and mobile.</p></div>
          <div className="workspace-panel workspace-field-grid">
            {option('Color palette', prefs.accent, [
              ['violet', 'Night violet'], ['rose', 'Dark rose'], ['teal', 'Teal'],
            ], v => void update('accent', v))}
            {option('Reader layout', prefs.reader_layout, [
              ['immersive', 'VN · background and narration'], ['classic', 'Book · continuous reading'],
              ['chat', 'Chat · turns and replies'],
            ], v => void update('reader_layout', v))}
            <label className="workspace-pref-field">Reader text size: {prefs.font_scale}%
              <input type="range" min={85} max={135} step={5} value={prefs.font_scale}
                disabled={busy} onChange={e => void update('font_scale', Number(e.target.value))}/></label>
          </div>
          <div className="workspace-reader-preview"><span className="overline">PREVIEW</span>
            <h3>The encounter in the rain</h3>
            <p>The library lights flickered. <em>“Did you really come all this way?”</em> the young woman asked with a faint smile.</p>
          </div>
        </>}

        {tab === 'runtimes' && <>
          <div className="setting-section-intro"><h2>Runtimes and packages</h2>
            <p>Inventory of dependencies detected on the backend computer, not the browser.</p></div>
          <div className="workspace-panel">
            {diagnostics ? <>
              <h3><Cpu size={17}/> Python packages</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.python_packages).map(([name, version]) =>
                  <div key={name}><span>{name}</span><code>{version || 'Not installed'}</code></div>)}
              </div>
              <h3>Detected executables</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.binaries).map(([name, pathname]) =>
                  <div key={name}><span>{name}</span><code>{pathname || 'Not found'}</code></div>)}
              </div>
              <p>Runtime updates are not implemented. This read-only panel does not install or replace system binaries.</p>
              <button className="secondary-button" onClick={() => void api.runtimeDiagnostics().then(setDiagnostics)}>
                <RefreshCcw size={16}/> Refresh inventory</button>
            </> : <div className="loading"><LoaderCircle className="rotating" size={18}/> Checking runtimes...</div>}
          </div>
        </>}

        {tab === 'shortcuts' && prefs && <>
          <div className="setting-section-intro"><h2>Keyboard shortcuts</h2>
            <p>Shortcuts are disabled in text fields, except reader shortcuts.</p></div>
          <div className="workspace-panel">
            {toggle('Enable keyboard shortcuts', prefs.shortcuts_enabled, v => void update('shortcuts_enabled', v))}
            {[
              ['Ctrl / ⌘ + 1', 'Library'], ['Ctrl / ⌘ + 2', 'Model Hub'],
              ['Ctrl / ⌘ + 3', 'Settings'], ['Ctrl / ⌘ + Enter', 'Submit reader input'],
              ['Alt + Enter', 'Continue story'], ['Esc', 'Close panels'],
            ].map(([combo, action]) => <div className="workspace-shortcut-row" key={combo}>
              <kbd>{combo}</kbd><span>{action}</span></div>)}
          </div>
        </>}

        {tab === 'network' && <>
          <div className="setting-section-intro"><h2>Network, devices, and workers</h2>
            <p>Architecture for connecting remote GPUs or sharing Noble AI with other devices.</p></div>
          <div className="workspace-panel">
            <h3><LockKeyhole size={17}/> Network status</h3>
            {network ? <p>{network.message}</p> : <p>Checking availability...</p>}
            <div className="workspace-service-row"><strong>Local server</strong><span>127.0.0.1:8000</span><b>Active</b></div>
            <div className="workspace-service-row"><strong>Mobile LAN access</strong><span>Authentication and TLS pending</span><b>Blocked</b></div>
            <div className="workspace-service-row"><strong>Colab / other PC workers</strong><span>OpenAI-compatible remote LLM</span><b>Registration available</b></div>
            <div className="workspace-service-row"><strong>Cloudflare Tunnel</strong><span>Bearer-authenticated external tunnels</span><b>Connectable</b></div>
            <div className="workspace-note"><ShieldCheck size={17}/> The main server remains local. Only a bearer-protected worker proxy may be connected; publishing the entire workspace online is disabled.</div>
          </div>
          <RemoteWorkers onActivated={onNarratorActivated}/>
        </>}

        {tab === 'about' && <AboutSettingsPanel about={about} modelsDir={modelsDir}/>}
        {tab === 'updates' && prefs && <UpdatesSettingsPanel
          prefs={prefs} parentBusy={busy}
          onChangeChannel={value => { void update('update_channel', value); }}
          onAutoCheck={enabled => { void update('check_updates_on_start', enabled); }}/>}
      </div>
    </div>
  </section>;
}
