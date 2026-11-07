import { useEffect, useState } from 'react';
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
  { id: 'overview', label: 'Overview', icon: Settings2 },
  { id: 'narration', label: 'Narration', icon: SlidersHorizontal },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'voice', label: 'Voice / TTS', icon: Volume2 },
  { id: 'languages', label: 'Languages and translation', icon: Languages },
  { id: 'providers', label: 'Proveedores', icon: Globe2 },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'runtimes', label: 'Runtimes', icon: Cpu },
  { id: 'shortcuts', label: 'Atajos', icon: Keyboard },
  { id: 'network', label: 'Red y workers', icon: Server },
  { id: 'about', label: 'About Noble AI', icon: MonitorCog },
  { id: 'updates', label: 'Updates', icon: Download },
];

const settingGroups: {title:string; description:string; sections:Tab[]}[] = [
  {title:'OVERVIEW', description:'Quick access to your preferences',
    sections:['overview']},
  {title:'INTELIGENCIA',description:'Narrator and providers',
    sections:['narration','providers','languages']},
  {title:'MEDIA CREATION',description:'Image generation and voices',
    sections:['images','voice']},
  {title:'APPLICATION',description:'Preferences and tools',
    sections:['appearance','shortcuts','runtimes']},
  {title:'CONNECTIONS AND SYSTEM',description:'Network, devices, and version',
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
      setFeedback('Preferencia guardada.');
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
    <div className="page-heading"><div className="eyebrow"><Settings2 size={14}/> ESTUDIO PERSONALIZABLE</div>
      <h1>Settings<span className="title-dot">.</span></h1>
      <p>Engines, languages, reader preferences, diagnostics, and future remote connections in one place.</p>
    </div>
    <div className="workspace-settings-shell">
      <nav aria-label="Settings sections" className="workspace-settings-tabs">
        {settingGroups.map(group => <div className="settings-nav-group" key={group.title}>
          <span className="settings-nav-label">{group.title}</span>
          <small>{group.description}</small>
          {group.sections.map(id => {
            const item = tabs.find(candidate => candidate.id === id)!;
            return <button key={item.id} className={tab === item.id ? 'selected' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => selectTab(item.id)}>
              <item.icon size={17}/>{item.label}</button>;
          })}
        </div>)}
      </nav>
      <div className="workspace-settings-body">
        {!prefs && <div className="loading"><LoaderCircle className="rotating" size={18}/> Loading preferences...</div>}
        {error && <p className="narrative-error" role="alert">{error}</p>}
        {feedback && <p className="narrative-saved" role="status"><Check size={16}/>{feedback}</p>}

        {tab === 'overview' && <div className="workspace-settings-overview">
          <div className="setting-section-intro">
            <span className="overline">STUDIO CONTROLS</span>
            <h2>Your workspace, your way</h2>
            <p>Configure each system separately. Narrator settings are independent from visuals, networking, and installed models.</p>
          </div>
          <div className="workspace-settings-snapshot">
            <div><Languages size={17}/><small>Narration language</small>
              <strong>{prefs?.target_language === 'es-419' ? 'Latin American Spanish' :
                prefs?.target_language || 'Loading...'}</strong></div>
            <div><Volume2 size={17}/><small>Illustrations</small>
              <strong>{imageMode === 'off' ? 'Disabled' :
                imageMode === 'manual' ? 'On demand' : 'Per scene'}</strong></div>
            <div><KeyRound size={17}/><small>OpenRouter</small>
              <strong>{credential?.configured ? 'Key configured' : 'No key'}</strong></div>
            <div><Cpu size={17}/><small>Local version</small>
              <strong>{about?.version || 'Consultando...'}</strong></div>
          </div>
          <div className="workspace-settings-overview-grid">
            {[
              {id:'narration',title:'Narrative engine',summary:'Connect your LLM, context, settings, and model.'},
              {id:'images',title:'Images',summary:'ComfyUI, illustrations, checkpoints, and GPU.'},
              {id:'voice',title:'Voice / TTS',summary:'Piper, voice models, and audio previews.'},
              {id:'providers',title:'Services and keys',summary:'External accounts, providers, and credentials.'},
              {id:'languages',title:'Languages and style',summary:'Latin American Spanish, translation, and narration.'},
              {id:'appearance',title:'Reader appearance',summary:'Theme, visual novel layout, and typography.'},
              {id:'runtimes',title:'Models and executables',summary:'Installed packages and engine diagnostics.'},
              {id:'network',title:'GPU remotas y red',summary:'Workers, conexiones seguras y red local.'},
              {id:'shortcuts',title:'Atajos de teclado',summary:'Combinaciones para navegar y jugar.'},
              {id:'about',title:'About Noble AI',summary:'Application version, build, and data.'},
              {id:'updates',title:'Updates',summary:'Release channel and update checks.'},
            ].map(item => {
              const section = tabs.find(candidate => candidate.id === item.id)!;
              return <button className="workspace-overview-card" key={item.id}
                onClick={() => selectTab(section.id)}>
                <span className="workspace-overview-icon"><section.icon size={22}/></span>
                <span><strong>{item.title}</strong><small>{item.summary}</small></span>
                <ArrowRight size={17}/>
              </button>;
            })}
          </div>
          <div className="workspace-panel workspace-overview-storage">
            <h3>Almacenamiento de modelos</h3>
            <code title={modelsDir}>{modelsDir || 'Path not available yet'}</code>
            <p>Las rutas y ejecutables se administran desde sus apartados correspondientes.</p>
          </div>
        </div>}

        {tab === 'narration' && <>
          <div className="setting-section-intro"><h2>Narrative engine</h2>
            <p>Choose a local LLM or a hosted API. Configure sampling, reasoning, and context.</p></div>
          <NarrativeSettings key={narrativeRevision}/>
          <RuntimeManager onActivated={onNarratorActivated}/>
        </>}

        {tab === 'images' && <ImageSettingsPanel imageMode={imageMode} onImageMode={onImageMode}/>}
        {tab === 'voice' && <VoiceSettingsPanel/>}

        {tab === 'languages' && prefs && <>
          <div className="setting-section-intro"><h2>Language and translation</h2>
            <p>This preference applies to the narrator prompt on each turn; it is not a separate translation engine.</p></div>
          <div className="workspace-panel workspace-field-grid">
            {option('Output language', prefs.target_language, [
              ['es-419', 'Latin American Spanish'], ['en', 'English'], ['ja', '日本語'],
              ['ko', '한국어'], ['pt-BR', 'Português brasileiro'], ['fr', 'Français'],
            ], v => void update('target_language', v))}
            {option('Incoming content language', prefs.source_language, [
              ['auto', 'Detect automatically'], ['es', 'Español'], ['en', 'English'],
              ['ja', 'Japanese'], ['ko', 'Korean'], ['pt', 'Portuguese'], ['fr', 'French'],
            ], v => void update('source_language', v))}
            {option('Multilingual handling', prefs.translation_mode, [
              ['off', 'Standard narration'], ['target_output', 'Preserve meaning and respond in the target language'],
            ], v => void update('translation_mode', v))}
            {option('Estilo narrativo', prefs.narration_style, [
              ['natural', 'Natural y conversacional'], ['literary', 'Literario y descriptivo'],
              ['concise', 'Brief and dynamic'],
            ], v => void update('narration_style', v))}
          </div>
          <div className="workspace-note"><Languages size={17}/> Settings are stored in SQLite and affect new generation, not previously saved chapters.</div>
        </>}

        {tab === 'providers' && <>
          <div className="setting-section-intro"><h2>Proveedores y servicios</h2>
            <p>Connect an external narrator without consuming local GPU resources. ComfyUI belongs in Images and Piper in Voice / TTS; paid image and voice provider integrations remain planned.</p></div>
          <div className="workspace-panel">
            <div className="workspace-provider-head"><span className="provider-icon">OR</span><div>
              <h3>OpenRouter</h3><p>Cloud language models with provider-specific billing.</p></div>
              <span className={credential?.configured ? 'provider-ready' : 'provider-missing'}>
                {credential?.configured ? 'Configured' : 'No key'}</span></div>
            <p>The key is kept in the system credential store, never in story history or SQLite.</p>
            <label className="workspace-pref-field">Clave de API
              <input type="password" value={keyDraft} autoComplete="off" placeholder="Introduce tu clave OpenRouter"
                onChange={e => setKeyDraft(e.target.value)}/></label>
            <div className="settings-buttons">
              <button className="primary-button" disabled={busy || keyDraft.trim().length < 12}
                onClick={() => void changeKey()}><KeyRound size={16}/> Save key</button>
              {credential?.configured && credential.storage !== 'environment' && <button className="secondary-button"
                disabled={busy} onClick={() => void changeKey(true)}><Trash2 size={16}/> Quitar clave</button>}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer"
                className="workspace-external">Create key <ArrowUpRight size={15}/></a>
            </div>
          </div>
          <div className="workspace-panel">
            <h3>Providers by feature</h3>
            <div className="workspace-service-row"><strong>Narration</strong><span>Ollama, KoboldCpp y OpenRouter</span><b>Integrated</b></div>
            <div className="workspace-service-row"><strong>Images</strong><span>Local ComfyUI on demand</span><b>Connectable</b></div>
            <div className="workspace-service-row"><strong>Voces</strong><span>Local CPU Piper on demand</span><b>Connectable</b></div>
            <div className="workspace-service-row"><strong>Workers</strong><span>Worker remoto LLM autenticado</span><b>Connectable</b></div>
          </div>
        </>}

        {tab === 'appearance' && prefs && <>
          <div className="setting-section-intro"><h2>Apariencia y lector</h2>
            <p>Customize Noble AI and your reading experience for desktop and mobile.</p></div>
          <div className="workspace-panel workspace-field-grid">
            {option('Paleta de color', prefs.accent, [
              ['violet', 'Violeta nocturno'], ['rose', 'Rosa oscuro'], ['teal', 'Turquesa'],
            ], v => void update('accent', v))}
            {option('Reader layout', prefs.reader_layout, [
              ['immersive', 'VN · background and narration'], ['classic', 'Book · continuous reading'],
              ['chat', 'Chat · turnos y respuestas'],
            ], v => void update('reader_layout', v))}
            <label className="workspace-pref-field">Reader text size: {prefs.font_scale}%
              <input type="range" min={85} max={135} step={5} value={prefs.font_scale}
                disabled={busy} onChange={e => void update('font_scale', Number(e.target.value))}/></label>
          </div>
          <div className="workspace-reader-preview"><span className="overline">VISTA PREVIA</span>
            <h3>El encuentro bajo la lluvia</h3>
            <p>The library lights flickered. <em>“Did you really come all this way?”</em> the young woman asked with a faint smile.</p>
          </div>
        </>}

        {tab === 'runtimes' && <>
          <div className="setting-section-intro"><h2>Runtimes y paquetes</h2>
            <p>Inventory of dependencies detected on the backend computer, not the browser.</p></div>
          <div className="workspace-panel">
            {diagnostics ? <>
              <h3><Cpu size={17}/> Paquetes Python</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.python_packages).map(([name, version]) =>
                  <div key={name}><span>{name}</span><code>{version || 'Not installed'}</code></div>)}
              </div>
              <h3>Ejecutables detectados</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.binaries).map(([name, pathname]) =>
                  <div key={name}><span>{name}</span><code>{pathname || 'No encontrado'}</code></div>)}
              </div>
              <p>Runtime updates are not implemented. This read-only panel does not install or replace system binaries.</p>
              <button className="secondary-button" onClick={() => void api.runtimeDiagnostics().then(setDiagnostics)}>
                <RefreshCcw size={16}/> Refresh inventory</button>
            </> : <div className="loading"><LoaderCircle className="rotating" size={18}/> Consultando runtimes...</div>}
          </div>
        </>}

        {tab === 'shortcuts' && prefs && <>
          <div className="setting-section-intro"><h2>Atajos de teclado</h2>
            <p>Los atajos se desactivan dentro de campos de escritura, excepto los del lector.</p></div>
          <div className="workspace-panel">
            {toggle('Activar atajos de teclado', prefs.shortcuts_enabled, v => void update('shortcuts_enabled', v))}
            {[
              ['Ctrl / ⌘ + 1', 'Library'], ['Ctrl / ⌘ + 2', 'Model Hub'],
              ['Ctrl / ⌘ + 3', 'Settings'], ['Ctrl / ⌘ + Enter', 'Submit reader input'],
              ['Alt + Enter', 'Continue story'], ['Esc', 'Close panels'],
            ].map(([combo, action]) => <div className="workspace-shortcut-row" key={combo}>
              <kbd>{combo}</kbd><span>{action}</span></div>)}
          </div>
        </>}

        {tab === 'network' && <>
          <div className="setting-section-intro"><h2>Red, dispositivos y workers</h2>
            <p>Architecture for connecting remote GPUs or sharing Noble AI with other devices.</p></div>
          <div className="workspace-panel">
            <h3><LockKeyhole size={17}/> Network status</h3>
            {network ? <p>{network.message}</p> : <p>Consultando disponibilidad...</p>}
            <div className="workspace-service-row"><strong>Servidor local</strong><span>127.0.0.1:8000</span><b>Activo</b></div>
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
