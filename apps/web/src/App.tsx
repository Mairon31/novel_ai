import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2, Compass,
  ChevronDown, CircleAlert, Cloud, Cpu, Database, Download, ExternalLink,
  HardDrive, Headphones, Image, Info, Layers3, LoaderCircle, Menu, Feather,
  Pause, Play, RefreshCw, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Volume2, X,
} from 'lucide-react';
import { api, downloads as compactCount, size } from './api';
import { StoryStudio } from './StoryStudio';
import { StoryHub } from './StoryHub';
import { parseWorkspaceHash, hashForWorkspaceRoute } from './workspaceRoute';
import type { WorkspaceRoute } from './workspaceRoute';
import { CreatorStudio } from './CreatorStudio';
import { WorkspaceSettings } from './WorkspaceSettings';
import { readModelDetails, readModelSearch, searchCacheKey,
  writeModelDetails, writeModelSearch } from './modelCatalogCache';
import type {
  CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail,
  ModelRole, ModelCardResponse, ModelFitVariant, ModelStorage, Page, Settings,
} from './types';

const roles: Array<{ id: ModelRole; title: string; subtitle: string }> = [
  { id: 'narrator', title: 'Narración', subtitle: 'Models de lenguaje GGUF' },
  { id: 'image', title: 'Imágenes', subtitle: 'Difusión y arte' },
  { id: 'tts', title: 'Voces', subtitle: 'Síntesis de voz' },
];
const menu: Array<{ id: Page; label: string; icon: typeof BookOpen }> = [
  { id: 'inicio', label: 'Biblioteca', icon: BookOpen },
  { id: 'descubrir', label: 'Descubrir historias', icon: Compass },
  { id: 'crear', label: 'Creator Studio', icon: Feather },
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

// FitCell adapted from Urakatsu (MIT), web/src/components/ModelsPage.tsx.
// Copyright (c) 2026 Urakatsu contributors. See docs/THIRD_PARTY_NOTICES.md.
function ModelFitBadge({ fit }: { fit: ModelFitVariant }) {
  const labels: Record<string, string> = {
    full_gpu: 'GPU completa', partial_offload: 'GPU + RAM',
    cpu: 'Solo CPU', too_large: 'Memoria insuficiente',
    unsupported: 'No compatible', unknown: 'Sin datos',
  };
  const share = fit.fit === 'partial_offload' && fit.gpu_share > 0
    ? ' · ~' + Math.round(fit.gpu_share * 100) + '% GPU' : '';
  const breakdown = [
    fit.estimated_required_bytes ? 'Memoria estimada: ' + size(fit.estimated_required_bytes) : '',
    fit.estimated_kv_bytes ? 'Context cache: ' + size(fit.estimated_kv_bytes) : '',
    fit.note, fit.disk_ok === false ? 'Espacio insuficiente en disco.' : '',
  ].filter(Boolean).join(' · ');
  return <span className={'hub-fit-state state-' + fit.fit}
    role="status" tabIndex={0} title={breakdown}
    aria-label={labels[fit.fit] + share + '. ' + breakdown}>
    {labels[fit.fit]}{share}
  </span>;
}

export default function App() {
  const [route, setRoute] = useState<WorkspaceRoute>(
    () => parseWorkspaceHash(window.location.hash));
  const [page, setPage] = useState<Page>(
    () => parseWorkspaceHash(window.location.hash).page);
  const [reading, setReading] = useState(
    () => Boolean(parseWorkspaceHash(window.location.hash).reading));
  const [editingStoryId, setEditingStoryId] = useState<string | null>(() => {
    const current = parseWorkspaceHash(window.location.hash);
    return current.page === 'crear' ? current.storyId || null : null;
  });
  const [narrativeRevision, setNarrativeRevision] = useState(0);
  const [keyboardActive, setKeyboardActive] = useState(true);
  const [releaseNotice, setReleaseNotice] = useState<{ name: string; url: string; label: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<'discover' | 'installed'>('discover');
  const [role, setRole] = useState<ModelRole>('narrator');
  const [modelSort, setModelSort] = useState('downloads');
  const [modelContext, setModelContext] = useState(4096);
  const [fitBusy, setFitBusy] = useState(false);
  const [query, setQuery] = useState('Qwen');
  const [searchResults, setSearchResults] = useState<CatalogEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const [dockedDetail, setDockedDetail] = useState(false);
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardData, setCardData] = useState<ModelCardResponse | null>(null);
  const cardRequest = useRef(0);
  const [pickedVariant, setPickedVariant] = useState('');
  const [variantFilter, setVariantFilter] = useState<'all' | 'full_gpu' | 'partial_offload' | 'cpu'>('all');
  const [hardware, setHardware] = useState<Hardware | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [modelStorage, setModelStorage] = useState<ModelStorage | null>(null);
  const [storageError, setStorageError] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [recovery, setRecovery] = useState<{
    recovered: number; conflicts: number; skipped: number;
  } | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Array<{ id: string; kind: string; status: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [imageMode, setImageMode] = useState<'scene' | 'manual' | 'off'>('scene');

  // Hash routing keeps direct links usable in the packaged local frontend:
  // no server-side SPA catch-all rewrite is required.
  useEffect(() => {
    const onHashChange = () => {
      const next = parseWorkspaceHash(window.location.hash);
      setRoute(next);
      setPage(next.page);
      setEditingStoryId(next.page === 'crear' ? next.storyId || null : null);
      setReading(next.page === 'inicio' && Boolean(next.reading));
      setNavOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1350px)');
    const update = () => setDockedDetail(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
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
      if (!alive || !u.update_available || !u.release?.url) return;
      const label = u.channel + ':' + u.release.version;
      if (localStorage.getItem('noble-seen-release') !== label)
        setReleaseNotice({ name: u.release.name, url: u.release.url, label });
    }).catch(() => { /* startup must not depend on GitHub availability */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const update = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      setKeyboardActive(value);
    };
    window.addEventListener('noble-shortcuts-changed', update);
    return () => window.removeEventListener('noble-shortcuts-changed', update);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyboardActive || e.isComposing) return;
      if (e.key === 'Escape') {
        detailRequest.current += 1;
        setDetail(null); setDetailLoading(false); setNavOpen(false); return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const destinations: Record<string, Page> = {
        '1': 'inicio', '2': 'modelos', '3': 'ajustes',
      };
      if (destinations[e.key]) {
        e.preventDefault(); changePage(destinations[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardActive]);

  useEffect(() => {
    let alive = true;
    void api.downloadRecovery().then(result => {
      if (alive) setRecovery(result);
    }).catch(() => { /* The normal API error banner handles offline status. */ });
    return () => { alive = false; };
  }, []);

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
    const key = searchCacheKey(query, role, modelSort);
    const saved = readModelSearch(key);
    if (saved) {
      setSearchResults(saved);
      setSearchLoading(false);
      return;
    }
    setSearchResults([]);
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      api.search(query.trim(), role, modelSort)
        .then(data => {
          if (!live) return;
          writeModelSearch(key, data.results);
          setSearchResults(data.results);
        })
        .catch((exc: Error) => { if (live) { setSearchResults([]); setError(exc.message); } })
        .finally(() => { if (live) setSearchLoading(false); });
    }, 380);
    return () => { live = false; window.clearTimeout(t); };
  }, [page, query, role, modelSort, tab]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      void refreshDownloads().catch(() => { /* Existing error banner remains visible. */ });
    }, 2000);
    return () => window.clearInterval(handle);
  }, [refreshDownloads]);

  useEffect(() => {
    if (page !== 'modelos' || tab !== 'installed') return;
    let active = true;
    setModelStorage(null); setStorageError('');
    const inspect = () => api.modelStorage()
      .then(info => { if (active) { setModelStorage(info); setStorageError(''); } })
      .catch((error: Error) => { if (active) setStorageError(error.message); });
    void inspect();
    const timer = window.setInterval(() => void inspect(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page, tab]);

  function closeModelDetail() {
    cardRequest.current += 1;
    setCardVisible(false); setCardData(null); setCardBusy(false);
    detailRequest.current += 1;
    setDetail(null); setDetailLoading(false); setFitBusy(false);
  }
  function navigateRoute(next: WorkspaceRoute) {
    closeModelDetail();
    setRoute(next);
    setEditingStoryId(next.page === 'crear' ? next.storyId || null : null);
    setReading(next.page === 'inicio' && Boolean(next.reading));
    setPage(next.page);
    setNavOpen(false); setNotice(''); setError('');
    const target = hashForWorkspaceRoute(next);
    if (window.location.hash !== target) window.location.hash = target;
  }
  function changePage(next: Page) {
    navigateRoute({ page: next });
  }
  function applyModelDetail(info: ModelDetail) {
    setDetail(info);
    setPickedVariant(info.hardware_fit?.recommended_filename ||
      info.variants.find(v => v.supported)?.filename || '');
  }

  async function viewModel(model: CatalogEntry) {
    cardRequest.current += 1; setCardVisible(false); setCardData(null); setCardBusy(false);
    const requestId = ++detailRequest.current;
    setDetail(null); setPickedVariant(''); setVariantFilter('all'); setDetailLoading(true);
    const cached = readModelDetails(model.repo_id, modelContext);
    if (cached) {
      applyModelDetail(cached);
      setDetailLoading(false);
      return;
    }
    try {
      const info = await api.details(model.repo_id, modelContext);
      if (requestId !== detailRequest.current) return;
      writeModelDetails(info, modelContext);
      applyModelDetail(info);
    } catch (exc) {
      if (requestId === detailRequest.current) setError((exc as Error).message);
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  async function toggleModelCard() {
    if (cardVisible) { setCardVisible(false); return; }
    if (!detail) return;
    setCardVisible(true);
    if (cardData) return;
    const sequence = ++cardRequest.current;
    setCardBusy(true);
    try {
      const result = await api.modelCard(detail.repo_id, detail.revision);
      if (sequence === cardRequest.current) setCardData(result);
    } catch (exc) {
      if (sequence === cardRequest.current) {
        setError((exc as Error).message);
        setCardVisible(false);
      }
    } finally {
      if (sequence === cardRequest.current) setCardBusy(false);
    }
  }

  async function selectContext(tokens: number) {
    setModelContext(tokens);
    if (!detail) return;
    const repoId = detail.repo_id;
    const requestId = ++detailRequest.current;
    const cached = readModelDetails(repoId, tokens);
    if (cached) {
      setDetail(cached);
      setPickedVariant(current => cached.variants.some(v => v.filename === current)
        ? current : cached.hardware_fit?.recommended_filename ||
          cached.variants.find(v => v.supported)?.filename || '');
      setFitBusy(false);
      return;
    }
    setFitBusy(true);
    try {
      const info = await api.details(repoId, tokens);
      if (requestId !== detailRequest.current) return;
      writeModelDetails(info, tokens);
      setDetail(info);
      setPickedVariant(current => info.variants.some(v => v.filename === current)
        ? current : info.hardware_fit?.recommended_filename ||
          info.variants.find(v => v.supported)?.filename || '');
    } catch (exc) {
      if (requestId === detailRequest.current) setError((exc as Error).message);
    } finally {
      if (requestId === detailRequest.current) setFitBusy(false);
    }
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
      // Completing initial setup must not silently discard a bookmarked
      // story/reader/creator URL. The default unlinked start is Model Hub.
      if (route.page === 'modelos') changePage('modelos');
      setNotice(route.page === 'modelos'
        ? 'Configuración inicial guardada. Ahora puedes buscar tu modelo narrativo.'
        : 'Configuración inicial guardada. El enlace solicitado sigue abierto.');
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

  const selectedFit = detail?.hardware_fit?.variants.find(item => item.filename === pickedVariant);
  const memoryRequired = selectedFit?.estimated_required_bytes ?? 0;
  const gpuBudget = detail?.hardware_fit?.vram_usable_bytes ?? 0;
  const memoryBudget = selectedFit?.fit === 'full_gpu' ? gpuBudget :
    selectedFit?.fit === 'partial_offload' ? gpuBudget + (detail?.hardware_fit?.ram_usable_bytes ?? 0) :
    (detail?.hardware_fit?.ram_usable_bytes ?? 0);
  const selectedMemoryPercent = memoryBudget > 0 && memoryRequired > 0 ?
    Math.min(100, Math.round(memoryRequired / memoryBudget * 100)) : 0;
  const activeJobs = jobs.filter(j => !terminal.includes(j.status)).length;
  const selectedRole = roles.find(item => item.id === role)!;
  const isInstalled = detail && installed.some(m => m.repo_id === detail.repo_id &&
    m.revision === detail.revision && m.filename === pickedVariant);

  return <div className={'app-shell ' +
    (page === 'inicio' && reading ? 'reader-active ' : '') +
    (page === 'modelos' && tab === 'discover' && (detail || detailLoading)
      ? 'model-inspector-active' : '')}>
    <aside className={'sidebar ' + (navOpen ? 'sidebar-open' : '')}>
      <div className="brand"><div className="brand-mark"><Sparkles size={22}/></div>
        <div className="brand-text"><strong>Noble AI</strong><small>LOCAL STORY STUDIO</small></div>
        <button className="mobile-dismiss icon-button" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={18}/></button>
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
    {navOpen && <button aria-label="Close navigation" className="mobile-overlay" onClick={() => setNavOpen(false)}/>}
    <div className="work-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu size={23}/></button>
        <div className="breadcrumb">Noble AI <span>/</span> <strong>{menu.find(m => m.id === page)?.label}</strong></div>
        <div className="top-actions">
          <span className="service-state"><i className={health?.status === 'ok' ? 'dot-green' : 'dot-red'}/>{health ? 'API local' : 'Sin conexión'}</span>
          <button className="icon-button" title="Actualizar" aria-label="Actualizar datos" onClick={() => { void refreshDownloads().catch(e => setError(e.message)); }}><RefreshCw size={18}/></button>
        </div>
      </header>
      <main className="content" data-ready={ready ? "yes" : "no"}>
        {releaseNotice && <div className="notice-banner noble-update-notice">
          <RefreshCw size={17}/>
          <span>Hay una publicación para tu canal: {releaseNotice.name}. La actualización automática aún no está disponible en la versión fuente.</span>
          <a href={releaseNotice.url} target="_blank" rel="noreferrer">Ver en GitHub</a>
          <button aria-label="Cerrar aviso de versión" onClick={() => {
            setReleaseNotice(null);
            localStorage.setItem('noble-seen-release', releaseNotice.label);
          }}><X size={16}/></button>
        </div>}
        {error && <ErrorNote message={error} close={() => setError('')}/>}
        {notice && <div className="notice-banner"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
        {!ready && <Loading/>}

        {page === 'crear' && <CreatorStudio initialStoryId={editingStoryId}
          onOpenLibrary={() => changePage('inicio')}
          onStoryChange={id => navigateRoute({ page: 'crear', storyId: id })}/>}
        {page === 'modelos' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><Sparkles size={14}/> ECOSISTEMA LOCAL DE IA</div>
            <h1>Centro de modelos<span className="title-dot">.</span></h1>
            <p>Busca, compara e instala modelos de Hugging Face directamente en Noble AI.</p>
          </div>
          <div className="hub-toolbar">
            <div className="tab-buttons" role="tablist">
              <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''}
                onClick={() => { setTab('discover'); closeModelDetail(); }}><Search size={17}/> Descubrir</button>
              <button role="tab" aria-selected={tab === 'installed'} className={tab === 'installed' ? 'active' : ''}
                onClick={() => { setTab('installed'); closeModelDetail(); }}><HardDrive size={17}/> Installeds <span className="mini-count">{installed.length}</span></button>
            </div>
            <div className="source-tag"><Cloud size={16}/> Hugging Face</div>
          </div>
          {tab === 'discover' ? <>
            <div className="search-row">
              <div className="search-box"><Search size={21}/>
                <input aria-label="Buscar modelos" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar modelos, familias o autores..."/></div>
              <div className="search-role-wrap"><SlidersHorizontal size={17}/>
                <select aria-label="Model category" value={role} onChange={e => { setRole(e.target.value as ModelRole); closeModelDetail(); }}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select><ChevronDown size={15}/></div>
            </div>
            <div className="category-tabs" role="group" aria-label="Tipos de modelo">
              {roles.map(item => <button key={item.id} onClick={() => { setRole(item.id); closeModelDetail(); }}
                className={role === item.id ? 'selected' : ''}>
                {item.id === 'narrator' ? <BookOpen size={18}/> : item.id === 'image' ? <Image size={18}/> : <Headphones size={18}/>}
                {item.title}</button>)}
            </div>
            <div className="section-caption"><div><h2>{selectedRole.subtitle}</h2>
              <p>Hugging Face catalog · select a model for its analysis</p></div>
              <div className="noble-model-sort"><label htmlFor="hub-sort">Ordenar por</label>
                <select id="hub-sort" aria-label="Ordenar modelos" value={modelSort}
                  onChange={e => setModelSort(e.target.value)}>
                  <option value="downloads">Descargas</option>
                  <option value="likes">Me gusta</option>
                  <option value="trendingScore">Tendencias</option>
                  <option value="lastModified">Actualizados</option>
                </select>
                {searchLoading && <LoaderCircle className="rotating" size={18}/>}
              </div></div>
            {role !== 'narrator' && <div className="info-note"><Info size={18}/>
              Puedes explorar estos modelos. Su instalación se activará cuando integremos los motores de imágenes y TTS.</div>}
            <div className="hub-discovery-layout">
              <div className="model-grid" aria-label="Resultados de modelos">
                {searchResults.map(m => <button key={m.repo_id} className={'model-card ' + (detail?.repo_id === m.repo_id ? 'hub-model-selected' : '')}
                  aria-pressed={detail?.repo_id === m.repo_id}
                  onClick={() => void viewModel(m)}>
                  <span className="model-icon">
                    {role === 'narrator' ? <BookOpen size={21}/> :
                      role === 'image' ? <Image size={21}/> : <Volume2 size={21}/>}
                  </span>
                  <span className="hub-model-row-main">
                    <strong title={m.repo_id}>{m.repo_id.split('/').slice(-1)[0]}</strong>
                    <small>{m.repo_id.split('/')[0]} · {m.description}</small>
                    <span className="hub-model-chips">
                      <span><Download size={13}/> {compactCount(m)}</span>
                      <span>♥ {m.likes.toLocaleString()}</span>
                      <span>{m.gated ? 'Restringido' : 'Público'}</span>
                      {m.license !== 'sin verificar' && <span>{m.license}</span>}
                    </span>
                  </span>
                  <ChevronDown className="hub-model-row-arrow" size={18}/>
                </button>)}
                {!searchLoading && searchResults.length === 0 && <div className="empty-state">
                  <Search size={30}/><strong>No hay resultados</strong>
                  <p>Try a different search or check your Hugging Face connection.</p></div>}
              </div>
              <aside className="hub-hardware-panel">
                <div className="hub-hardware-title"><Cpu size={20}/>
                  <div><strong>Compatibilidad de tu equipo</strong>
                    <small>Estimate by quantization</small></div></div>
                <div className="hub-hardware-numbers">
                  <div><span>GPU detectada</span><strong>{hardware?.gpus[0]?.name || 'No detectada'}</strong></div>
                  <div><span>VRAM libre</span><strong>
                    {hardware?.gpus[0] ? (hardware.gpus[0].vram_free_mb / 1024).toFixed(1)+' GiB' : 'No disponible'}
                  </strong></div>
                  <div><span>RAM disponible</span><strong>
                    {hardware ? (hardware.ram_available_mb / 1024).toFixed(1)+' GiB' : '—'}
                  </strong></div>
                  <div><span>Espacio libre</span><strong>{hardware?.storage_free_gb ?? '—'} GB</strong></div>
                </div>
                <p>Abre un modelo para comparar sus variantes. Noble AI estima pesos,
                  memoria de contexto y margen del runtime. La clasificación no garantiza
                  compatibilidad con un motor concreto ni velocidad.</p>
                <div className="hub-hardware-legend">
                  <span>GPU completa</span><span>Descarga parcial</span>
                  <span>CPU</span><span>Memoria insuficiente</span>
                </div>
                <button className="secondary-button" onClick={() => changePage('ajustes')}>
                  <Settings2 size={15}/> Ajustes de motores
                </button>
              </aside>
            </div>
          </> : <>
            <div className="section-caption"><div><h2>Models en tu equipo</h2><p>Solo instalaciones completas y registradas por Noble AI.</p></div></div>
            {modelStorage && <section className="hub-storage-summary" aria-label="Almacenamiento de modelos">
              <div className="hub-storage-heading">
                <div><strong>Espacio de modelos</strong>
                  <small title={modelStorage.models_dir}>{modelStorage.models_dir}</small>
                </div>
                <span><HardDrive size={15}/> Disco local</span>
              </div>
              <div className="hub-storage-metrics">
                <div><span>Models registrados</span><strong>{size(modelStorage.installed.bytes)}</strong>
                  <small>{modelStorage.installed.count} en el registro</small></div>
                <div><span>Descargas parciales</span><strong>{size(modelStorage.partial.bytes)}</strong>
                  <small>{modelStorage.partial.count} con archivos .part</small></div>
                <div><span>Espacio disponible</span><strong>{size(modelStorage.disk.free_bytes)}</strong>
                  <small>Capacidad: {size(modelStorage.disk.total_bytes)}</small></div>
              </div>
              <div className="hub-storage-meter" role="meter" aria-label="Espacio ocupado por archivos de Noble"
                aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={modelStorage.disk.total_bytes > 0 ?
                  Math.round((modelStorage.installed.bytes + modelStorage.partial.bytes) /
                    modelStorage.disk.total_bytes * 100) : 0}>
                <div style={{width: modelStorage.disk.total_bytes > 0 ?
                    (modelStorage.installed.bytes / modelStorage.disk.total_bytes * 100) + '%' : '0%'}}/>
                <div className="hub-storage-partial" style={{width: modelStorage.disk.total_bytes > 0 ?
                    (modelStorage.partial.bytes / modelStorage.disk.total_bytes * 100) + '%' : '0%'}}/>
              </div>
              <p>El inventario mide archivos registrados y descargas incompletas.
                La capacidad del disco incluye también otros archivos del equipo.</p>
              {!!modelStorage.items.length && <details className="hub-storage-files">
                <summary>Ver archivos contabilizados ({modelStorage.items.length})</summary>
                <div>{modelStorage.items.map(item => <div key={item.id}>
                  <span title={item.repo_id}>{item.name}
                    {!item.file_present ? ' · No encontrado' : item.kind === 'partial' ? ' · Parcial' : ''}</span>
                  <strong>{size(item.size_bytes)}</strong>
                </div>)}</div>
              </details>}
            </section>}
            {storageError && <p className="narrative-error" role="alert">{storageError}</p>}

            <div className="installed-list">
              {installed.map(model => <article className="installed-row" key={model.id}>
                <div className="installed-symbol"><HardDrive size={23}/></div>
                <div className="installed-details"><strong>{model.filename}</strong>
                  <span>{model.repo_id} · {size(model.size_bytes)}</span>
                  <small>{model.integrity_status === 'sha256_verified' ? 'SHA-256 verificado con el origen' :
                    'Local hash; the source did not publish SHA-256'}</small>
                  {modelStorage?.items.find(item => item.id === model.id)?.file_present === false &&
                    <small className="hub-file-missing">File not found: check installation.</small>}
                </div>
                <div className="installed-actions">
                  {assignments.narrator === model.id && <span className="assigned"><Check size={16}/> Narrador elegido</span>}
                  <button className="secondary-button" disabled={busy || assignments.narrator === model.id ||
                      modelStorage?.items.find(item => item.id === model.id)?.file_present === false}
                    onClick={() => void assignModel(model.id)}>
                    {assignments.narrator === model.id ? 'Asignado' : 'Elegir narrador'}</button>
                </div>
              </article>)}
              {installed.length === 0 && <div className="empty-state"><Database size={31}/><strong>No models installed yet</strong>
                <p>Find a GGUF in Discover, select a variant, and download it here.</p>
                <button className="secondary-button" onClick={() => setTab('discover')}>Buscar modelos</button></div>}
            </div>
          </>}
        </section>}

        {page === 'descargas' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><ArrowDownToLine size={14}/> ACTIVIDAD</div><h1>Descargas<span className="title-dot">.</span></h1>
            <p>Consulta el estado de instalaciones y administra las transferencias.</p></div>
          {recovery && (recovery.recovered > 0 || recovery.conflicts > 0) &&
            <div className="workspace-note" role="status">
              {recovery.conflicts ? <CircleAlert size={18}/> : <ShieldCheck size={18}/>}
              <span>
                {recovery.recovered > 0 &&
                  <strong>{recovery.recovered} descarga(s) recuperada(s) tras un reinicio. </strong>}
                {recovery.conflicts > 0 &&
                  <strong>{recovery.conflicts} conflicto(s) detectado(s). </strong>}
                Los archivos recuperados requieren reanudar y verificar el modelo antes de usarlo.
                {recovery.conflicts > 0 &&
                  ' Los conflictos se mantienen sin sobrescribir archivos; revisa el motivo en cada descarga.'}
              </span>
            </div>}
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
                {['queued', 'downloading'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'pause')}><Pause size={16}/> Pause</button>}
                {['paused', 'failed', 'cancelled'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'resume')}><Play size={16}/> Resume</button>}
                {['queued', 'downloading', 'paused', 'failed'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'cancel')}><X size={16}/> Cancel</button>}
                {job.status === 'completed' && <span className="complete"><CheckCircle2 size={16}/> Modelo registrado</span>}
              </div>
            </article>;
          })}
          {jobs.length === 0 && <div className="empty-state"><ArrowDownToLine size={30}/><strong>No downloads yet</strong>
            <p>Models installed from Model Hub appear here.</p>
            <button className="secondary-button" onClick={() => changePage('modelos')}>Abrir Model Hub</button></div>}
          </div>
        </section>}

        {page === 'descubrir' && <section className="noble-discover-page" aria-label="Story catalog">
          <div className="page-heading">
            <div className="eyebrow"><Compass size={14}/> DESCUBRIR</div>
            <h1>Historias para jugar<span className="title-dot">.</span></h1>
            <p>Explore bundled stories and add them to your library as independent projects.
              Community-created stories will be added in a later release.</p>
          </div>
          <StoryHub onInstall={story => navigateRoute({
            page: 'inicio', storyId: story.id, reading: false,
          })}/>
        </section>}

        {page === 'inicio' && <StoryStudio onOpenSettings={() => changePage('ajustes')}
              routeStoryId={route.page === 'inicio' ? route.storyId || null : null}
              routeReading={Boolean(route.reading)}
              onRouteChange={(storyId, isReading) => navigateRoute({
                page: 'inicio', storyId, reading: isReading,
              })}
              onReadingChange={setReading}
              onEditStory={storyId => navigateRoute({ page: 'crear', storyId })}/>}

        {page === 'ajustes' && <WorkspaceSettings
          modelsDir={settings?.models_dir || ''}
          imageMode={imageMode}
          onImageMode={mode => { void saveImageMode(mode); }}
          narrativeRevision={narrativeRevision}
          onNarratorActivated={() => setNarrativeRevision(v => v + 1)}
        />}

        {page === 'diagnostico' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><Cpu size={14}/> SISTEMA</div><h1>Diagnóstico<span className="title-dot">.</span></h1>
            <p>Data detectados en el equipo que ejecuta el backend, no en tu navegador.</p></div>
          <div className="stat-grid">
            <div className="stat"><span>ESTADO DEL BACKEND</span><strong>{health?.status === 'ok' ? 'Conectado' : 'Sin conexión'}</strong><small>API Noble {health?.version || '—'}</small></div>
            <div className="stat"><span>MEMORIA RAM</span><strong>{hardware ? Math.round(hardware.ram_total_mb / 1024) + ' GB' : '—'}</strong><small>{hardware ? Math.round(hardware.ram_available_mb / 1024) + ' GB disponibles' : ''}</small></div>
            <div className="stat"><span>VRAM NVIDIA</span><strong>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB' : 'No detectada'}</strong><small>{hardware?.gpus[0]?.name || 'CPU disponible'}</small></div>
            <div className="stat"><span>ESPACIO LIBRE</span><strong>{hardware ? hardware.storage_free_gb + ' GB' : '—'}</strong><small>Carpeta de modelos</small></div>
          </div>
          <div className="settings-panel"><section><div className="setting-icon"><Cloud size={22}/></div><div className="setting-main">
            <strong>Proveedores</strong>{providers.map(p => <p key={p.id}>{p.id} · {p.kind} — {p.status === 'ready' ? 'Listo' : 'Integration pending'}</p>)}
          </div></section></div>
        </section>}
      </main>
    </div>

    {(detail || detailLoading) && <div className="modal-scrim model-detail-scrim"
      role="presentation" onClick={closeModelDetail}>
      <section className="detail-panel" role="dialog" aria-modal={!dockedDetail} aria-label="Detalles del modelo" onClick={e => e.stopPropagation()}>
        <div className="detail-top"><span>DETALLE DE MODELO</span><button className="icon-button" onClick={closeModelDetail} aria-label="Cerrar detalles"><X size={19}/></button></div>
        {detailLoading ? <Loading/> : detail && <>
          <div className="noble-model-detail-heading">
            <div className="detail-avatar"><BookOpen size={32}/></div>
            <div>
              <span className="overline">{detail.pipeline_tag || 'MODELO HUGGING FACE'}</span>
              <h2>{detail.repo_id.split('/')[1]}</h2>
              <p className="detail-author">{detail.author || detail.repo_id.split('/')[0]}</p>
            </div>
          </div>
          {detail.summary && <p className="hub-detail-description">{detail.summary}</p>}
          <div className="hub-detail-stats">
            <div><span>Descargas</span><strong>{(detail.downloads || 0).toLocaleString()}</strong></div>
            <div><span>Me gusta</span><strong>{(detail.likes || 0).toLocaleString()}</strong></div>
            <div><span>Licencia</span><strong>{detail.license}</strong></div>
            <div><span>Acceso</span><strong>{detail.gated ? 'Restringido' : 'Público'}</strong></div>
          </div>
          <div className="hub-detail-metadata">
            <div><span>Revisión</span><code>{detail.revision.slice(0,12)}</code></div>
            {detail.hardware_fit?.architecture &&
              <div><span>Arquitectura GGUF</span><strong>{detail.hardware_fit.architecture}</strong></div>}
            {detail.hardware_fit?.parameter_count != null &&
              <div><span>Declared parameters</span>
                <strong>{(detail.hardware_fit.parameter_count/1e9).toFixed(2)} B</strong></div>}
            {detail.library && <div><span>Biblioteca</span><strong>{detail.library}</strong></div>}
            {detail.base_model && <div><span>Modelo base</span><strong>
              {Array.isArray(detail.base_model) ? detail.base_model.join(', ') : detail.base_model}
            </strong></div>}
          </div>
          {!!detail.tags?.length && <div className="hub-detail-tags">
            {detail.tags.slice(0,10).map(tag => <span key={tag}>{tag}</span>)}
          </div>}
          <a className="external-link" href={detail.url} target="_blank" rel="noreferrer">
            Ver ficha original en Hugging Face <ExternalLink size={15}/></a>
          {role === 'narrator' && detail.variants.length > 0 ? <>
            <section className="hub-fit-analysis">
              <div className="hub-fit-header">
                <div><h3>Hardware assessment</h3>
                  <p>{detail.hardware_fit?.gpu?.name || 'CPU / RAM'} ·
                    {detail.hardware_fit?.metadata_source === 'gguf_header'
                      ? ' KV estimada desde cabecera GGUF' : ' Reserva de contexto aproximada'}
                  </p></div>
                <label>Contexto
                  <select aria-label="Contexto de compatibilidad" value={modelContext}
                    disabled={fitBusy} onChange={e => void selectContext(Number(e.target.value))}>
                    <option value={2048}>2K tokens</option>
                    <option value={4096}>4K tokens</option>
                    <option value={8192}>8K tokens</option>
                    <option value={16384}>16K tokens</option>
                    <option value={32768}>32K tokens</option>
                  </select>
                </label>
              </div>
              {detail.hardware_fit?.recommended_filename ?
                <div className="hub-best-fit"><CheckCircle2 size={19}/>
                  <div><strong>Suggested quantization: {detail.hardware_fit.recommended_filename}</strong>
                    <small>Estimate based on observed memory, not a runtime guarantee.</small>
                  </div></div> :
                <div className="hub-fit-caution"><CircleAlert size={18}/>
                  Could not recommend a quantization from the available data.</div>}
              {selectedFit && <div className="hub-selected-fit">
                <div className="hub-selected-fit-head">
                  <strong>Variante seleccionada: {selectedFit.quantization || 'GGUF'}</strong>
                  <span>{selectedFit.estimated_required_bytes
                    ? 'Demanda aproximada ' + size(selectedFit.estimated_required_bytes)
                    : 'Consumo desconocido'}</span>
                </div>
                <div role="meter" aria-label="Memory requirement versus usable memory"
                  aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={selectedMemoryPercent} className="hub-memory-meter">
                  <span style={{width: selectedMemoryPercent+'%'}}/>
                </div>
                <div className="hub-selected-fit-foot">
                  <span>{selectedFit.fit === 'full_gpu' ? 'Estimated usable GPU limit' :
                    selectedFit.fit === 'partial_offload' ? 'Combined GPU and RAM limit' :
                    'Estimated usable RAM limit'}: {memoryBudget ? size(memoryBudget) : 'sin datos'}</span>
                  <span>{selectedFit.fit === 'partial_offload' ?
                    'Requiere offload compatible del motor' :
                    selectedFit.fit === 'full_gpu' ? 'Based on observed free VRAM' :
                    'No implica que se ejecute en GPU'}</span>
                </div>
              </div>}
              <div className="hub-variants-toolbar">
                <h3>Comparar archivos GGUF <small>{detail.variants.length}</small></h3>
                <div role="group" aria-label="Filtrar compatibilidad de cuantizaciones">
                  {[
                    {id:'all',label:'Todas'},
                    {id:'full_gpu',label:'GPU'},
                    {id:'partial_offload',label:'GPU + RAM'},
                    {id:'cpu',label:'CPU'},
                  ].map(filter => <button key={filter.id}
                    aria-pressed={variantFilter === filter.id}
                    className={variantFilter === filter.id ? 'selected' : ''}
                    onClick={() => setVariantFilter(filter.id as typeof variantFilter)}>
                    {filter.label}</button>)}
                </div>
              </div>
              <div className="variant-list">{detail.variants.filter(v =>
                variantFilter === 'all' || detail.hardware_fit?.variants.some(
                  item => item.filename === v.filename && item.fit === variantFilter,
                )).map(v => {
                const fit=detail.hardware_fit?.variants.find(item=>item.filename===v.filename);
                const selected=pickedVariant===v.filename;

                return <button key={v.filename} disabled={!v.supported}
                  aria-pressed={selected} className={'variant hub-fit-variant ' +
                    (selected?'variant-active ':'')+(fit?'fit-'+fit.fit:'')}
                  onClick={() => setPickedVariant(v.filename)}>
                  <span className="hub-variant-info">
                    <strong>{v.filename}</strong>
                    <small>{fit?.quantization || 'GGUF'} · {size(v.size_bytes)} ·
                      {v.sha256 ? ' SHA256 publicado' : ' sin hash publicado'}</small>
                    {fit && <small>{fit.note}</small>}
                    {fit?.disk_ok===false && <small>Espacio insuficiente para descargar este archivo.</small>}
                  </span>
                  <span className="hub-variant-aside">
                    {fit && <ModelFitBadge fit={fit}/>}
                    {fit?.estimated_required_bytes && <small>
                      ~{size(fit.estimated_required_bytes)} memoria
                    </small>}
                    {detail.hardware_fit?.recommended_filename === v.filename &&
                      <small className="hub-variant-recommended">Recomendada para tu equipo</small>}
                    {selected && <Check size={17}/>}
                  </span>
                </button>;
              })}
                {detail.variants.filter(v => variantFilter === 'all' ||
                  detail.hardware_fit?.variants.some(item =>
                    item.filename === v.filename && item.fit === variantFilter)).length === 0 &&
                  <p className="hub-variant-no-fit">No variants in this category.
                    Prueba otro filtro o ajusta el contexto.</p>}
              </div>
              <p className="detail-disclaimer">{detail.hardware_fit?.warning ||
                'Se muestran estimaciones, no resultados de un benchmark real.'}</p>
            </section>
            <button className="primary-button full"
              disabled={busy || detail.gated || !detail.supports_install ||
                !pickedVariant || Boolean(isInstalled)} onClick={() => void install()}>
              {busy ? <LoaderCircle className="rotating" size={17}/> :
                isInstalled ? <CheckCircle2 size={18}/> : <Download size={18}/>}
              {isInstalled ? 'Variante instalada' : 'Descargar variante seleccionada'}
            </button>
          </> : <div className="info-note"><Info size={18}/>
            {role === 'narrator' ?
              'No hay un archivo GGUF individual admitido por el descargador actual.' :
              'Este catálogo permite consultar metadatos; el instalador de imágenes y voces se configura desde su proveedor.'}
          </div>}
          <section className="hub-model-card-section">
            <div className="hub-model-card-heading">
              <div><h3>Ficha del modelo</h3>
                <p>Documento original del autor en Hugging Face.</p></div>
              <button type="button" className="secondary-button"
                aria-expanded={cardVisible} onClick={() => void toggleModelCard()}>
                {cardVisible ? 'Ocultar ficha' : 'Leer ficha completa'}
              </button>
            </div>
            {cardVisible && (cardBusy ?
              <p role="status">Cargando README.md...</p> : cardData?.available ?
                <div>
                  {cardData.truncated && <p>Mostrando los primeros 128 KiB del documento.</p>}
                  <pre className="hub-model-readme">{cardData.readme || 'Empty document.'}</pre>
                </div> : <p>This model does not publish a README.md at the selected revision.</p>)}
          </section>
        </>}
      </section>
    </div>}

    {showSetup && ready && <div className="welcome-scrim"><section className="welcome-panel" role="dialog" aria-modal="true" aria-label="Welcome and initial setup">
      <div className="welcome-icon"><Sparkles size={31}/></div><span className="overline">BIENVENIDO A NOBLE AI</span>
      <h2>Your story studio starts here.</h2>
      <p>Choose how to prepare your library. Models can be configured now or later; nothing will download without your permission.</p>
      <div className="welcome-hardware"><Cpu size={19}/>
        <div><strong>{hardware?.gpus[0]?.name || 'CPU disponible'}</strong>
          <small>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB de VRAM detectados' :
            'No NVIDIA GPU detected by the backend'}</small></div></div>
      <label className="form-label" htmlFor="image-policy">Image generation in future versions</label>
      <select id="image-policy" value={imageMode} onChange={e => setImageMode(e.target.value as 'scene' | 'manual' | 'off')}>
        <option value="scene">Create images when the scene changes</option>
        <option value="manual">Solo cuando las solicite</option>
        <option value="off">No images</option>
      </select>
      <div className="setup-callout"><ShieldCheck size={18}/> TTS is disabled by default. Your story will not be sent to remote providers in this prototype.</div>
      <button className="primary-button full" disabled={busy} onClick={() => void finishSetup()}>
        {busy ? <LoaderCircle className="rotating" size={18}/> : <ArrowRight size={18}/>}
        Continuar al Model Hub</button>
      <small className="welcome-note">Text generation, images, and speech will be integrated incrementally.</small>
    </section></div>}
  </div>;
}
