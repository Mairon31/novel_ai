import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleAlert, Cloud, Cpu, Database, Download, ExternalLink,
  HardDrive, Headphones, Image, Info, Layers3, LoaderCircle, Menu,
  Pause, Play, RefreshCw, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Volume2, X,
} from 'lucide-react';
import { api, downloads as compactCount, size } from './api';
import { StoryStudio } from './StoryStudio';
import { WorkspaceSettings } from './WorkspaceSettings';
import type {
  CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail,
  ModelRole, Page, Settings,
} from './types';

const roles: Array<{ id: ModelRole; title: string; subtitle: string }> = [
  { id: 'narrator', title: 'Narración', subtitle: 'Modelos de lenguaje GGUF' },
  { id: 'image', title: 'Imágenes', subtitle: 'Difusión y arte' },
  { id: 'tts', title: 'Voces', subtitle: 'Síntesis de voz' },
];
const menu: Array<{ id: Page; label: string; icon: typeof BookOpen }> = [
  { id: 'inicio', label: 'Biblioteca', icon: BookOpen },
  { id: 'modelos', label: 'Model Hub', icon: Layers3 },
  { id: 'descargas', label: 'Descargas', icon: ArrowDownToLine },
  { id: 'ajustes', label: 'Configuración', icon: Settings2 },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Cpu },
];
const terminal = ['completed', 'failed', 'cancelled', 'paused'];
function humanStatus(job: DownloadJob) {
  return ({
    queued: 'En cola', downloading: 'Descargando', paused: 'Pausada',
    verifying: 'Verificando', completed: 'Completada',
    failed: 'Fallida', cancelled: 'Cancelada',
  } as Record<string, string>)[job.status] || job.status;
}
function ErrorNote({ message, close }: { message: string; close: () => void }) {
  return <div className="error-banner" role="alert"><CircleAlert size={17}/><span>{message}</span>
    <button aria-label="Cerrar aviso" onClick={close}><X size={16}/></button></div>;
}
function Loading() {
  return <div className="loading"><LoaderCircle className="rotating" size={18}/> Consultando...</div>;
}

export default function App() {
  const [page, setPage] = useState<Page>('modelos');
  const [narrativeRevision, setNarrativeRevision] = useState(0);
  const [keyboardActive, setKeyboardActive] = useState(true);
  const [releaseNotice, setReleaseNotice] = useState<{ name: string; url: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<'discover' | 'installed'>('discover');
  const [role, setRole] = useState<ModelRole>('narrator');
  const [query, setQuery] = useState('Qwen');
  const [searchResults, setSearchResults] = useState<CatalogEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [pickedVariant, setPickedVariant] = useState('');
  const [hardware, setHardware] = useState<Hardware | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Array<{ id: string; kind: string; status: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [imageMode, setImageMode] = useState<'scene' | 'manual' | 'off'>('scene');

  useEffect(() => {
    let alive = true;
    api.workspacePreferences().then(async p => {
      if (!alive) return;
      setKeyboardActive(p.shortcuts_enabled);
      document.documentElement.dataset.nobleAccent = p.accent;
      document.documentElement.dataset.nobleReaderLayout = p.reader_layout;
      document.documentElement.style.setProperty('--noble-reader-scale', String(p.font_scale / 100));
      if (!p.check_updates_on_start) return;
      const u = await api.updates();
      if (!alive || !u.release?.url) return;
      const label = u.channel + ':' + u.release.version;
      if (localStorage.getItem('noble-seen-release') !== label)
        setReleaseNotice({ name: u.release.name, url: u.release.url });
    }).catch(() => { /* startup must not depend on GitHub availability */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyboardActive || e.isComposing) return;
      if (e.key === 'Escape') { setDetail(null); setNavOpen(false); return; }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const destinations: Record<string, Page> = {
        '1': 'inicio', '2': 'modelos', '3': 'ajustes',
      };
      if (destinations[e.key]) {
        e.preventDefault(); setPage(destinations[e.key]);
        setNavOpen(false); setNotice(''); setError('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardActive]);

  const refreshDownloads = useCallback(async () => {
    const [jobList, models, roleMap] = await Promise.all([
      api.downloads(), api.installed(), api.roles(),
    ]);
    setJobs(jobList.downloads);
    setInstalled(models.models);
    setAssignments(roleMap.roles);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([api.health(), api.hardware(), api.settings(), api.providers(), api.downloads(),
      api.installed(), api.roles()])
      .then(([h, hw, s, p, d, i, r]) => {
        if (!live) return;
        setHealth(h); setHardware(hw); setSettings(s); setProviders(p.available);
        setJobs(d.downloads); setInstalled(i.models); setAssignments(r.roles);
        setImageMode(s.image_mode);
        setShowSetup(!s.setup_complete);
      })
      .catch((exc: Error) => { if (live) setError('No se pudo conectar con Noble API: ' + exc.message); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    if (page !== 'modelos' || tab !== 'discover' || query.trim().length < 2) {
      setSearchResults([]); return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      api.search(query.trim(), role)
        .then(data => { if (live) setSearchResults(data.results); })
        .catch((exc: Error) => { if (live) { setSearchResults([]); setError(exc.message); } })
        .finally(() => { if (live) setSearchLoading(false); });
    }, 380);
    return () => { live = false; window.clearTimeout(t); };
  }, [page, query, role, tab]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      void refreshDownloads().catch(() => { /* Existing error banner remains visible. */ });
    }, 2000);
    return () => window.clearInterval(handle);
  }, [refreshDownloads]);

  function changePage(next: Page) {
    setPage(next); setNavOpen(false); setNotice(''); setError('');
  }

  async function viewModel(model: CatalogEntry) {
    setDetail(null); setPickedVariant(''); setDetailLoading(true);
    try {
      const info = await api.details(model.repo_id);
      setDetail(info);
      setPickedVariant(info.variants.find(v => v.supported)?.filename || '');
    } catch (exc) { setError((exc as Error).message); }
    finally { setDetailLoading(false); }
  }

  async function install() {
    if (!detail || !pickedVariant) return;
    setBusy(true);
    try {
      const job = await api.install({
        repo_id: detail.repo_id, revision: detail.revision, filename: pickedVariant,
      });
      await refreshDownloads();
      setNotice('Descarga ' + humanStatus(job).toLowerCase() + ': ' + job.filename);
      changePage('descargas');
      setNotice('Descarga registrada: ' + job.filename);
      setDetail(null);
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  async function manageDownload(id: string, action: 'pause' | 'resume' | 'cancel') {
    setBusy(true);
    try {
      await api.control(id, action);
      await refreshDownloads();
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  async function assignModel(id: string) {
    setBusy(true);
    try {
      const result = await api.assign('narrator', id);
      setAssignments(result.roles);
      setNotice(result.message);
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  async function finishSetup() {
    setBusy(true);
    try {
      const result = await api.patchSettings({ setup_complete: true, image_mode: imageMode });
      setSettings(result);
      setShowSetup(false);
      changePage('modelos');
      setNotice('Configuración inicial guardada. Ahora puedes buscar tu modelo narrativo.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  async function saveImageMode(mode: 'scene' | 'manual' | 'off') {
    setBusy(true);
    try {
      const result = await api.patchSettings({ image_mode: mode });
      setSettings(result); setImageMode(result.image_mode);
      setNotice('Preferencia visual guardada. Se aplicará al integrar ComfyUI.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  const activeJobs = jobs.filter(j => !terminal.includes(j.status)).length;
  const selectedRole = roles.find(item => item.id === role)!;
  const isInstalled = detail && installed.some(m => m.repo_id === detail.repo_id &&
    m.revision === detail.revision && m.filename === pickedVariant);

  return <div className="app-shell">
    <aside className={'sidebar ' + (navOpen ? 'sidebar-open' : '')}>
      <div className="brand"><div className="brand-mark"><Sparkles size={22}/></div>
        <div className="brand-text"><strong>Noble AI</strong><small>LOCAL STORY STUDIO</small></div>
        <button className="mobile-dismiss icon-button" onClick={() => setNavOpen(false)} aria-label="Cerrar menú"><X size={18}/></button>
      </div>
      <div className="nav-label">ESPACIO DE TRABAJO</div>
      <nav className="nav-menu" aria-label="Secciones">
        {menu.map(item => <button key={item.id} onClick={() => changePage(item.id)}
          className={'nav-item ' + (page === item.id ? 'nav-active' : '')}>
          <item.icon size={19}/><span>{item.label}</span>
          {item.id === 'descargas' && activeJobs > 0 && <b className="counter">{activeJobs}</b>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="device-card"><div className="device-icon"><Cpu size={18}/></div>
          <div><strong>{hardware?.gpus[0]?.name || 'CPU / sin NVIDIA detectada'}</strong>
            <small>{hardware?.gpus[0]
              ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB de VRAM'
              : 'Diagnóstico disponible'}</small></div>
        </div>
        <p className="sidebar-footer">PROTOTIPO P1 <span>·</span> LOCAL-FIRST</p>
      </div>
    </aside>
    {navOpen && <button aria-label="Cerrar navegación" className="mobile-overlay" onClick={() => setNavOpen(false)}/>}
    <div className="work-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Abrir menú" onClick={() => setNavOpen(true)}><Menu size={23}/></button>
        <div className="breadcrumb">Noble AI <span>/</span> <strong>{menu.find(m => m.id === page)?.label}</strong></div>
        <div className="top-actions">
          <span className="service-state"><i className={health?.status === 'ok' ? 'dot-green' : 'dot-red'}/>{health ? 'API local' : 'Sin conexión'}</span>
          <button className="icon-button" title="Actualizar" aria-label="Actualizar datos" onClick={() => { void refreshDownloads().catch(e => setError(e.message)); }}><RefreshCw size={18}/></button>
        </div>
      </header>
      <main className="content">
        {releaseNotice && <div className="notice-banner noble-update-notice">
          <RefreshCw size={17}/>
          <span>Hay una publicación para tu canal: {releaseNotice.name}. La actualización automática aún no está disponible en la versión fuente.</span>
          <a href={releaseNotice.url} target="_blank" rel="noreferrer">Ver en GitHub</a>
          <button aria-label="Cerrar aviso de versión" onClick={() => {
            setReleaseNotice(null);
            localStorage.setItem('noble-seen-release', releaseNotice.url.split('/').pop() || releaseNotice.name);
          }}><X size={16}/></button>
        </div>}
        {error && <ErrorNote message={error} close={() => setError('')}/>}
        {notice && <div className="notice-banner"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
        {!ready && <Loading/>}

        {page === 'modelos' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><Sparkles size={14}/> ECOSISTEMA LOCAL DE IA</div>
            <h1>Centro de modelos<span className="title-dot">.</span></h1>
            <p>Busca, compara e instala modelos de Hugging Face directamente en Noble AI.</p>
          </div>
          <div className="hub-toolbar">
            <div className="tab-buttons" role="tablist">
              <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''}
                onClick={() => { setTab('discover'); setDetail(null); }}><Search size={17}/> Descubrir</button>
              <button role="tab" aria-selected={tab === 'installed'} className={tab === 'installed' ? 'active' : ''}
                onClick={() => { setTab('installed'); setDetail(null); }}><HardDrive size={17}/> Instalados <span className="mini-count">{installed.length}</span></button>
            </div>
            <div className="source-tag"><Cloud size={16}/> Hugging Face</div>
          </div>
          {tab === 'discover' ? <>
            <div className="search-row">
              <div className="search-box"><Search size={21}/>
                <input aria-label="Buscar modelos" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar modelos, familias o autores..."/></div>
              <div className="search-role-wrap"><SlidersHorizontal size={17}/>
                <select aria-label="Categoría de modelo" value={role} onChange={e => { setRole(e.target.value as ModelRole); setDetail(null); }}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select><ChevronDown size={15}/></div>
            </div>
            <div className="category-tabs" role="group" aria-label="Tipos de modelo">
              {roles.map(item => <button key={item.id} onClick={() => { setRole(item.id); setDetail(null); }}
                className={role === item.id ? 'selected' : ''}>
                {item.id === 'narrator' ? <BookOpen size={18}/> : item.id === 'image' ? <Image size={18}/> : <Headphones size={18}/>}
                {item.title}</button>)}
            </div>
            <div className="section-caption"><div><h2>{selectedRole.subtitle}</h2><p>Resultados del catálogo en línea · compatibilidad aún sin verificar</p></div>
              {searchLoading && <LoaderCircle className="rotating" size={18}/>}</div>
            {role !== 'narrator' && <div className="info-note"><Info size={18}/>
              Puedes explorar estos modelos. Su instalación se activará cuando integremos los motores de imágenes y TTS.</div>}
            <div className="model-grid">
              {searchResults.map(m => <button key={m.repo_id} className="model-card" onClick={() => void viewModel(m)}>
                <div className="card-top"><span className="model-icon">
                  {role === 'narrator' ? <BookOpen size={23}/> : role === 'image' ? <Image size={23}/> : <Volume2 size={23}/>}
                </span><ArrowRight size={18} className="card-arrow"/></div>
                <strong title={m.repo_id}>{m.repo_id.split('/').slice(-1)[0]}</strong>
                <small className="author">{m.repo_id.split('/')[0]}</small>
                <p>{m.description}</p>
                <div className="card-meta"><span><Download size={15}/> {compactCount(m)}</span>
                  <span>{m.gated ? 'Acceso restringido' : 'Público'}</span></div>
              </button>)}
              {!searchLoading && searchResults.length === 0 && <div className="empty-state">
                <Search size={30}/><strong>No hay resultados</strong>
                <p>Prueba otra búsqueda o revisa tu conexión con Hugging Face.</p></div>}
            </div>
          </> : <>
            <div className="section-caption"><div><h2>Modelos en tu equipo</h2><p>Solo instalaciones completas y registradas por Noble AI.</p></div></div>
            <div className="installed-list">
              {installed.map(model => <article className="installed-row" key={model.id}>
                <div className="installed-symbol"><HardDrive size={23}/></div>
                <div className="installed-details"><strong>{model.filename}</strong>
                  <span>{model.repo_id} · {size(model.size_bytes)}</span>
                  <small>{model.integrity_status === 'sha256_verified' ? 'SHA-256 verificado con el origen' :
                    'Hash local; el origen no anunció SHA-256'}</small>
                </div>
                <div className="installed-actions">
                  {assignments.narrator === model.id && <span className="assigned"><Check size={16}/> Narrador elegido</span>}
                  <button className="secondary-button" disabled={busy || assignments.narrator === model.id}
                    onClick={() => void assignModel(model.id)}>
                    {assignments.narrator === model.id ? 'Asignado' : 'Elegir narrador'}</button>
                </div>
              </article>)}
              {installed.length === 0 && <div className="empty-state"><Database size={31}/><strong>Aún no hay modelos instalados</strong>
                <p>Busca un GGUF en Descubrir, elige una variante y descárgala aquí.</p>
                <button className="secondary-button" onClick={() => setTab('discover')}>Buscar modelos</button></div>}
            </div>
          </>}
        </section>}

        {page === 'descargas' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><ArrowDownToLine size={14}/> ACTIVIDAD</div><h1>Descargas<span className="title-dot">.</span></h1>
            <p>Consulta el estado de instalaciones y administra las transferencias.</p></div>
          <div className="downloads-list">{jobs.map(job => {
            const pct = job.expected_size ? Math.min(100, Math.round(job.received_bytes / job.expected_size * 100)) : 0;
            return <article key={job.id} className="download-card">
              <div className="download-top"><div className="installed-symbol"><Download size={22}/></div>
                <div className="download-title"><strong>{job.filename}</strong><span>{job.repo_id}</span></div>
                <span className={'job-badge status-' + job.status}>{humanStatus(job)}</span></div>
              <div className="progress-track"><div style={{ width: pct + '%' }}/></div>
              <div className="progress-label"><span>{size(job.received_bytes)} / {size(job.expected_size)}</span>
                <span>{job.expected_size ? pct + '%' : 'Total desconocido'}</span></div>
              {job.error && <p className="job-error">{job.error}</p>}
              <div className="download-controls">
                {['queued', 'downloading'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'pause')}><Pause size={16}/> Pausar</button>}
                {['paused', 'failed', 'cancelled'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'resume')}><Play size={16}/> Reanudar</button>}
                {['queued', 'downloading', 'paused', 'failed'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'cancel')}><X size={16}/> Cancelar</button>}
                {job.status === 'completed' && <span className="complete"><CheckCircle2 size={16}/> Modelo registrado</span>}
              </div>
            </article>;
          })}
          {jobs.length === 0 && <div className="empty-state"><ArrowDownToLine size={30}/><strong>Sin descargas todavía</strong>
            <p>Los modelos que instales desde Model Hub aparecerán aquí.</p>
            <button className="secondary-button" onClick={() => changePage('modelos')}>Abrir Model Hub</button></div>}
          </div>
        </section>}

        {page === 'inicio' && <StoryStudio onOpenSettings={() => changePage('ajustes')}/>}

        {page === 'ajustes' && <WorkspaceSettings
          modelsDir={settings?.models_dir || ''}
          imageMode={imageMode}
          onImageMode={mode => { void saveImageMode(mode); }}
          narrativeRevision={narrativeRevision}
          onNarratorActivated={() => setNarrativeRevision(v => v + 1)}
        />}

        {page === 'diagnostico' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><Cpu size={14}/> SISTEMA</div><h1>Diagnóstico<span className="title-dot">.</span></h1>
            <p>Datos detectados en el equipo que ejecuta el backend, no en tu navegador.</p></div>
          <div className="stat-grid">
            <div className="stat"><span>ESTADO DEL BACKEND</span><strong>{health?.status === 'ok' ? 'Conectado' : 'Sin conexión'}</strong><small>API Noble {health?.version || '—'}</small></div>
            <div className="stat"><span>MEMORIA RAM</span><strong>{hardware ? Math.round(hardware.ram_total_mb / 1024) + ' GB' : '—'}</strong><small>{hardware ? Math.round(hardware.ram_available_mb / 1024) + ' GB disponibles' : ''}</small></div>
            <div className="stat"><span>VRAM NVIDIA</span><strong>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB' : 'No detectada'}</strong><small>{hardware?.gpus[0]?.name || 'CPU disponible'}</small></div>
            <div className="stat"><span>ESPACIO LIBRE</span><strong>{hardware ? hardware.storage_free_gb + ' GB' : '—'}</strong><small>Carpeta de modelos</small></div>
          </div>
          <div className="settings-panel"><section><div className="setting-icon"><Cloud size={22}/></div><div className="setting-main">
            <strong>Proveedores</strong>{providers.map(p => <p key={p.id}>{p.id} · {p.kind} — {p.status === 'ready' ? 'Listo' : 'Integración pendiente'}</p>)}
          </div></section></div>
        </section>}
      </main>
    </div>

    {(detail || detailLoading) && <div className="modal-scrim" role="presentation" onClick={() => setDetail(null)}>
      <section className="detail-panel" role="dialog" aria-modal="true" aria-label="Detalles del modelo" onClick={e => e.stopPropagation()}>
        <div className="detail-top"><span>DETALLE DE MODELO</span><button className="icon-button" onClick={() => setDetail(null)} aria-label="Cerrar detalles"><X size={19}/></button></div>
        {detailLoading ? <Loading/> : detail && <>
          <div className="detail-avatar"><BookOpen size={32}/></div>
          <h2>{detail.repo_id.split('/')[1]}</h2><p className="detail-author">{detail.repo_id.split('/')[0]}</p>
          <a className="external-link" href={detail.url} target="_blank" rel="noreferrer">Ver en Hugging Face <ExternalLink size={15}/></a>
          <div className="detail-props">
            <div><span>LICENCIA DECLARADA</span><strong>{detail.license}</strong></div>
            <div><span>REVISIÓN</span><code>{detail.revision.slice(0, 12) || 'Desconocida'}</code></div>
            <div><span>ACCESO</span><strong>{detail.gated ? 'Restringido' : 'Público'}</strong></div>
          </div>
          {role === 'narrator' && detail.variants.length > 0 ? <>
            <h3>Elegir cuantización GGUF</h3>
            <div className="variant-list">{detail.variants.map(v => <button key={v.filename} disabled={!v.supported}
              className={'variant ' + (pickedVariant === v.filename ? 'variant-active' : '')} onClick={() => setPickedVariant(v.filename)}>
              <span><strong>{v.filename}</strong><small>{size(v.size_bytes)} · {v.sha256 ? 'SHA-256 disponible' : 'Sin hash de origen'}</small></span>
              {pickedVariant === v.filename && <Check size={17}/>}</button>)}</div>
            <p className="detail-disclaimer">La compatibilidad real con GPU/CPU se comprobará cuando conectemos el runtime. La descarga no ejecuta el modelo.</p>
            <button className="primary-button full" disabled={busy || detail.gated || !detail.supports_install ||
              !pickedVariant || Boolean(isInstalled)} onClick={() => void install()}>
              {busy ? <LoaderCircle className="rotating" size={17}/> : isInstalled ? <CheckCircle2 size={18}/> : <Download size={18}/>}
              {isInstalled ? 'Variante instalada' : 'Instalar variante'} </button>
          </> : <div className="info-note"><Info size={18}/>
            {role === 'narrator' ? 'Este repositorio no ofrece un GGUF individual compatible con esta primera versión.' :
            'La instalación de modelos de imágenes y voces llegará al integrar sus motores.'}</div>}
        </>}
      </section>
    </div>}

    {showSetup && ready && <div className="welcome-scrim"><section className="welcome-panel" role="dialog" aria-modal="true" aria-label="Bienvenida y configuración inicial">
      <div className="welcome-icon"><Sparkles size={31}/></div><span className="overline">BIENVENIDO A NOBLE AI</span>
      <h2>Tu estudio de historias empieza aquí.</h2>
      <p>Elige cómo quieres preparar tu biblioteca. Puedes configurar tus modelos ahora o después; no se descargará nada sin tu autorización.</p>
      <div className="welcome-hardware"><Cpu size={19}/>
        <div><strong>{hardware?.gpus[0]?.name || 'CPU disponible'}</strong>
          <small>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB de VRAM detectados' :
            'No se detectó una GPU NVIDIA en el backend'}</small></div></div>
      <label className="form-label" htmlFor="image-policy">Generación visual en futuras versiones</label>
      <select id="image-policy" value={imageMode} onChange={e => setImageMode(e.target.value as 'scene' | 'manual' | 'off')}>
        <option value="scene">Crear imágenes cuando cambie la escena</option>
        <option value="manual">Solo cuando las solicite</option>
        <option value="off">Sin imágenes</option>
      </select>
      <div className="setup-callout"><ShieldCheck size={18}/> TTS desactivado por defecto. Tu historia no se enviará a proveedores remotos en este prototipo.</div>
      <button className="primary-button full" disabled={busy} onClick={() => void finishSetup()}>
        {busy ? <LoaderCircle className="rotating" size={18}/> : <ArrowRight size={18}/>}
        Continuar al Model Hub</button>
      <small className="welcome-note">La inferencia de texto, las imágenes y las voces se integrarán por fases.</small>
    </section></div>}
  </div>;
}
