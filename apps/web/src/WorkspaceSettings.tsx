import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Check, Cpu, Download, ExternalLink, Globe2,
  KeyRound, Keyboard, Languages, LoaderCircle, LockKeyhole, MonitorCog,
  MoonStar, Palette, RefreshCcw, Server, Settings2, ShieldCheck,
  SlidersHorizontal, Trash2, Volume2,
} from 'lucide-react';
import { api } from './api';
import type {
  About, NetworkCapabilities, ProviderCredentialStatus, RuntimeDiagnostics,
  Updates, WorkspacePreferences,
} from './types';
import { NarrativeSettings } from './NarrativeSettings';
import { RuntimeManager } from './RuntimeManager';
import { RemoteWorkers } from './RemoteWorkers';
import { CreativeSettings } from './CreativeSettings';

type Tab = 'narration' | 'multimedia' | 'languages' | 'providers' | 'appearance' |
  'runtimes' | 'shortcuts' | 'network' | 'about';

const tabs: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'narration', label: 'Narración', icon: SlidersHorizontal },
  { id: 'multimedia', label: 'Imágenes y voz', icon: Volume2 },
  { id: 'languages', label: 'Idiomas y traducción', icon: Languages },
  { id: 'providers', label: 'Proveedores', icon: Globe2 },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'runtimes', label: 'Runtimes', icon: Cpu },
  { id: 'shortcuts', label: 'Atajos', icon: Keyboard },
  { id: 'network', label: 'Red y workers', icon: Server },
  { id: 'about', label: 'Sobre y actualizaciones', icon: MonitorCog },
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
  const [tab, setTab] = useState<Tab>('narration');
  const [prefs, setPrefs] = useState<WorkspacePreferences | null>(null);
  const [about, setAbout] = useState<About | null>(null);
  const [release, setRelease] = useState<Updates | null>(null);
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
    if (tab === 'about' && !release) {
      void api.updates().then(setRelease).catch((e: Error) => setError(e.message));
    }
    if (tab === 'runtimes' && !diagnostics) {
      void api.runtimeDiagnostics().then(setDiagnostics).catch((e: Error) => setError(e.message));
    }
    if (tab === 'network' && !network) {
      void api.networkCapabilities().then(setNetwork).catch((e: Error) => setError(e.message));
    }
  }, [tab, release, diagnostics, network]);

  async function update<K extends keyof WorkspacePreferences>(field: K, value: WorkspacePreferences[K]) {
    if (!prefs || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const next = await api.patchWorkspacePreferences({ [field]: value });
      setPrefs(next);
      window.dispatchEvent(new CustomEvent('noble-shortcuts-changed', { detail: next.shortcuts_enabled }));
      if (field === 'accent' || field === 'font_scale' || field === 'reader_layout')
        applyAppearance(next);
      if (field === 'update_channel') setRelease(null);
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
      setFeedback(remove ? 'Clave retirada del almacén.' : 'Clave guardada en el almacén de credenciales del sistema.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function refreshReleases() {
    setBusy(true); setError('');
    try { setRelease(await api.updates(true)); }
    catch (e) { setError((e as Error).message); }
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
      <h1>Configuración<span className="title-dot">.</span></h1>
      <p>Motores, idioma, interfaz, diagnóstico y futuras conexiones remotas desde un solo lugar.</p>
    </div>
    <div className="workspace-settings-shell">
      <nav aria-label="Apartados de configuración" className="workspace-settings-tabs">
        {tabs.map(item => <button key={item.id} className={tab === item.id ? 'selected' : ''}
          onClick={() => { setTab(item.id); setFeedback(''); setError(''); }}>
          <item.icon size={17}/>{item.label}</button>)}
      </nav>
      <div className="workspace-settings-body">
        {!prefs && <div className="loading"><LoaderCircle className="rotating" size={18}/> Cargando preferencias...</div>}
        {error && <p className="narrative-error" role="alert">{error}</p>}
        {feedback && <p className="narrative-saved" role="status"><Check size={16}/>{feedback}</p>}

        {tab === 'narration' && <>
          <div className="setting-section-intro"><h2>Motor narrativo</h2>
            <p>Elige entre un LLM local o una API de pago. Configura muestreo, razonamiento y contexto.</p></div>
          <NarrativeSettings key={narrativeRevision}/>
          <RuntimeManager onActivated={onNarratorActivated}/>
        </>}

        {tab === 'multimedia' && <CreativeSettings imageMode={imageMode} onImageMode={onImageMode}/>}

        {tab === 'languages' && prefs && <>
          <div className="setting-section-intro"><h2>Idioma y traducción</h2>
            <p>La salida se aplica al prompt que recibe el narrador en cada turno; todavía no es un motor independiente de traducción.</p></div>
          <div className="workspace-panel workspace-field-grid">
            {option('Idioma de salida', prefs.target_language, [
              ['es-419', 'Español latinoamericano'], ['en', 'English'], ['ja', '日本語'],
              ['ko', '한국어'], ['pt-BR', 'Português brasileiro'], ['fr', 'Français'],
            ], v => void update('target_language', v))}
            {option('Idioma del contenido entrante', prefs.source_language, [
              ['auto', 'Detectar automáticamente'], ['es', 'Español'], ['en', 'Inglés'],
              ['ja', 'Japonés'], ['ko', 'Coreano'], ['pt', 'Portugués'], ['fr', 'Francés'],
            ], v => void update('source_language', v))}
            {option('Tratamiento multilingüe', prefs.translation_mode, [
              ['off', 'Narración normal'], ['target_output', 'Conservar el sentido y responder en idioma objetivo'],
            ], v => void update('translation_mode', v))}
            {option('Estilo narrativo', prefs.narration_style, [
              ['natural', 'Natural y conversacional'], ['literary', 'Literario y descriptivo'],
              ['concise', 'Breve y dinámico'],
            ], v => void update('narration_style', v))}
          </div>
          <div className="workspace-note"><Languages size={17}/> Estos ajustes se guardan en SQLite y afectan la siguiente generación, no reescriben automáticamente capítulos anteriores.</div>
        </>}

        {tab === 'providers' && <>
          <div className="setting-section-intro"><h2>Proveedores y servicios</h2>
            <p>Conecta modelos externos para narrar sin consumir tu GPU. ComfyUI y Piper se configuran en «Imágenes y voz»; los proveedores de pago para estas tareas siguen pendientes.</p></div>
          <div className="workspace-panel">
            <div className="workspace-provider-head"><span className="provider-icon">OR</span><div>
              <h3>OpenRouter</h3><p>Modelos de lenguaje en la nube, con consumo según el proveedor.</p></div>
              <span className={credential?.configured ? 'provider-ready' : 'provider-missing'}>
                {credential?.configured ? 'Configurado' : 'Sin clave'}</span></div>
            <p>La clave se guarda en el almacén de credenciales del sistema; nunca en el historial de historias ni en SQLite.</p>
            <label className="workspace-pref-field">Clave de API
              <input type="password" value={keyDraft} autoComplete="off" placeholder="Introduce tu clave OpenRouter"
                onChange={e => setKeyDraft(e.target.value)}/></label>
            <div className="settings-buttons">
              <button className="primary-button" disabled={busy || keyDraft.trim().length < 12}
                onClick={() => void changeKey()}><KeyRound size={16}/> Guardar clave</button>
              {credential?.configured && credential.storage !== 'environment' && <button className="secondary-button"
                disabled={busy} onClick={() => void changeKey(true)}><Trash2 size={16}/> Quitar clave</button>}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer"
                className="workspace-external">Crear clave <ArrowUpRight size={15}/></a>
            </div>
          </div>
          <div className="workspace-panel">
            <h3>Catálogo de proveedores por herramienta</h3>
            <div className="workspace-service-row"><strong>Narración</strong><span>Ollama, KoboldCpp y OpenRouter</span><b>Integrados</b></div>
            <div className="workspace-service-row"><strong>Imágenes</strong><span>ComfyUI local bajo demanda</span><b>Conectable</b></div>
            <div className="workspace-service-row"><strong>Voces</strong><span>Piper local CPU bajo demanda</span><b>Conectable</b></div>
            <div className="workspace-service-row"><strong>Workers</strong><span>Worker remoto LLM autenticado</span><b>Conectable</b></div>
          </div>
        </>}

        {tab === 'appearance' && prefs && <>
          <div className="setting-section-intro"><h2>Apariencia y lector</h2>
            <p>Personaliza Noble AI y adapta la forma de leer historias para PC y móvil.</p></div>
          <div className="workspace-panel workspace-field-grid">
            {option('Paleta de color', prefs.accent, [
              ['violet', 'Violeta nocturno'], ['rose', 'Rosa oscuro'], ['teal', 'Turquesa'],
            ], v => void update('accent', v))}
            {option('Presentación del lector', prefs.reader_layout, [
              ['immersive', 'Inmersiva · escena + texto'], ['classic', 'Clásica · lectura prioritaria'],
            ], v => void update('reader_layout', v))}
            <label className="workspace-pref-field">Tamaño del texto del lector: {prefs.font_scale}%
              <input type="range" min={85} max={135} step={5} value={prefs.font_scale}
                disabled={busy} onChange={e => void update('font_scale', Number(e.target.value))}/></label>
          </div>
          <div className="workspace-reader-preview"><span className="overline">VISTA PREVIA</span>
            <h3>El encuentro bajo la lluvia</h3>
            <p>La luz de la biblioteca tembló. <em>«¿En serio viniste hasta aquí?»</em>, preguntó la joven con una sonrisa apenas visible.</p>
          </div>
        </>}

        {tab === 'runtimes' && <>
          <div className="setting-section-intro"><h2>Runtimes y paquetes</h2>
            <p>Inventario de dependencias detectadas en la máquina que ejecuta el backend, no en el navegador.</p></div>
          <div className="workspace-panel">
            {diagnostics ? <>
              <h3><Cpu size={17}/> Paquetes Python</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.python_packages).map(([name, version]) =>
                  <div key={name}><span>{name}</span><code>{version || 'No instalado'}</code></div>)}
              </div>
              <h3>Ejecutables detectados</h3>
              <div className="workspace-diagnostics-list">
                {Object.entries(diagnostics.binaries).map(([name, pathname]) =>
                  <div key={name}><span>{name}</span><code>{pathname || 'No encontrado'}</code></div>)}
              </div>
              <p>Actualización de runtimes pendiente. Este panel es de solo lectura: no instala ni reemplaza binarios del sistema.</p>
              <button className="secondary-button" onClick={() => void api.runtimeDiagnostics().then(setDiagnostics)}>
                <RefreshCcw size={16}/> Actualizar inventario</button>
            </> : <div className="loading"><LoaderCircle className="rotating" size={18}/> Consultando runtimes...</div>}
          </div>
        </>}

        {tab === 'shortcuts' && prefs && <>
          <div className="setting-section-intro"><h2>Atajos de teclado</h2>
            <p>Los atajos se desactivan dentro de campos de escritura, excepto los del lector.</p></div>
          <div className="workspace-panel">
            {toggle('Activar atajos de teclado', prefs.shortcuts_enabled, v => void update('shortcuts_enabled', v))}
            {[
              ['Ctrl / ⌘ + 1', 'Biblioteca'], ['Ctrl / ⌘ + 2', 'Model Hub'],
              ['Ctrl / ⌘ + 3', 'Configuración'], ['Ctrl / ⌘ + Enter', 'Enviar intervención del lector'],
              ['Alt + Enter', 'Continuar historia'], ['Esc', 'Cerrar paneles'],
            ].map(([combo, action]) => <div className="workspace-shortcut-row" key={combo}>
              <kbd>{combo}</kbd><span>{action}</span></div>)}
          </div>
        </>}

        {tab === 'network' && <>
          <div className="setting-section-intro"><h2>Red, dispositivos y workers</h2>
            <p>Arquitectura prevista para conectar GPUs remotas o compartir Noble AI con otros dispositivos.</p></div>
          <div className="workspace-panel">
            <h3><LockKeyhole size={17}/> Estado de la red</h3>
            {network ? <p>{network.message}</p> : <p>Consultando disponibilidad...</p>}
            <div className="workspace-service-row"><strong>Servidor local</strong><span>127.0.0.1:8000</span><b>Activo</b></div>
            <div className="workspace-service-row"><strong>Acceso desde móviles en LAN</strong><span>Autenticación y TLS pendientes</span><b>Bloqueado</b></div>
            <div className="workspace-service-row"><strong>Workers Colab / otras PC</strong><span>LLM remoto compatible con OpenAI</span><b>Registro disponible</b></div>
            <div className="workspace-service-row"><strong>Túnel Cloudflare</strong><span>Conexión a túneles externos con token Bearer</span><b>Conectable</b></div>
            <div className="workspace-note"><ShieldCheck size={17}/> El servidor principal sigue siendo local. Solo se conecta a un proxy de worker protegido mediante token; publicar el workspace completo en Internet continúa deshabilitado.</div>
          </div>
          <RemoteWorkers onActivated={onNarratorActivated}/>
        </>}

        {tab === 'about' && prefs && <>
          <div className="setting-section-intro"><h2>Sobre Noble AI</h2>
            <p>Identidad de build, archivos de usuario y canales de publicación.</p></div>
          <div className="workspace-panel">
            <div className="workspace-about-title"><MoonStar size={27}/><div><strong>Noble AI</strong><span>Local Story Studio</span></div></div>
            {about && <div className="workspace-diagnostics-list">
              <div><span>Versión</span><code>{about.version}</code></div>
              <div><span>Commit</span><code>{about.commit}</code></div>
              <div><span>Tipo de instalación</span><code>{about.build_type}</code></div>
              <div><span>Datos</span><code>{about.data_dir}</code></div>
              <div><span>Modelos</span><code>{modelsDir || about.models_dir}</code></div>
              <div><span>Python</span><code>{about.python}</code></div>
            </div>}
          </div>
          <div className="workspace-panel">
            <h3><Download size={17}/> Actualizaciones</h3>
            <div className="workspace-field-grid">
              {option('Canal de versiones', prefs.update_channel, [
                ['stable', 'Stable · versiones probadas'],
                ['beta', 'Beta · versiones preliminares'],
                ['nightly', 'Nightly · cambios recientes'],
              ], v => void update('update_channel', v))}
            </div>
            {toggle('Comprobar novedades al abrir la aplicación',
              prefs.check_updates_on_start, v => void update('check_updates_on_start', v))}
            {release && <div className="workspace-release-card">
              {release.check_success ? release.release ? <>
                <strong>{release.release.name}</strong>
                <span>Publicación encontrada para el canal {release.channel}.</span>
                {release.release.url && <a href={release.release.url} target="_blank" rel="noreferrer">
                  Ver publicación <ExternalLink size={14}/></a>}
              </> : <span>No hay releases publicadas para el canal {release.channel}.</span> :
                <span>{release.message}</span>}
            </div>}
            <p>Esta ejecución es de código fuente. Podemos consultar releases pero no instalar una actualización automáticamente hasta disponer de un empaquetador, verificación de integridad y rollback.</p>
            <button className="secondary-button" disabled={busy} onClick={() => void refreshReleases()}>
              {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
              Comprobar actualizaciones</button>
          </div>
        </>}
      </div>
    </div>
  </section>;
}
