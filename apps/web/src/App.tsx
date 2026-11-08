import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { InterfaceLanguageSelector } from './InterfaceLanguageSelector';
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

const roles: Array<{ id: ModelRole; titleKey: string; subtitleKey: string }> = [
  { id: 'narrator', titleKey: 'model.roleNarrator', subtitleKey: 'model.roleNarratorDescription' },
  { id: 'image', titleKey: 'model.roleImage', subtitleKey: 'model.roleImageDescription' },
  { id: 'tts', titleKey: 'model.roleTts', subtitleKey: 'model.roleTtsDescription' },
];
const menu: Array<{ id: Page; label: string; icon: typeof BookOpen }> = [
  { id: 'inicio', label: 'Library', icon: BookOpen },
  { id: 'descubrir', label: 'Discover stories', icon: Compass },
  { id: 'crear', label: 'Creator Studio', icon: Feather },
  { id: 'modelos', label: 'Model Hub', icon: Layers3 },
  { id: 'descargas', label: 'Downloads', icon: ArrowDownToLine },
  { id: 'ajustes', label: 'Settings', icon: Settings2 },
  { id: 'diagnostico', label: 'Diagnostics', icon: Cpu },
];
const terminal = ['completed', 'failed', 'cancelled', 'paused'];
function humanStatus(job: DownloadJob) {
  return i18n.t('jobs.' + job.status, { defaultValue: job.status });
}
function ErrorNote({ message, close }: { message: string; close: () => void }) {
  const { t } = useTranslation();
  return <div className="error-banner" role="alert"><CircleAlert size={17}/><span>{message}</span>
    <button aria-label={t('app.dismissNotice')} onClick={close}><X size={16}/></button></div>;
}
function Loading() {
  const { t } = useTranslation();
  return <div className="loading"><LoaderCircle className="rotating" size={18}/> {t('common.loading')}</div>;
}

// FitCell adapted from Urakatsu (MIT), web/src/components/ModelsPage.tsx.
// Copyright (c) 2026 Urakatsu contributors. See docs/THIRD_PARTY_NOTICES.md.
function ModelFitBadge({ fit }: { fit: ModelFitVariant }) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    full_gpu: t('model.fullGpu'), partial_offload: t('model.fitPartialBadge'),
    cpu: t('model.fitCpuBadge'), too_large: t('model.insufficient'),
    unsupported: t('model.fitUnsupported'), unknown: t('model.fitUnknown'),
  };
  const share = fit.fit === 'partial_offload' && fit.gpu_share > 0
    ? ' · ~' + Math.round(fit.gpu_share * 100) + '% GPU' : '';
  const breakdown = [
    fit.estimated_required_bytes ? t('model.estimatedMemory', { size: size(fit.estimated_required_bytes) }) : '',
    fit.estimated_kv_bytes ? t('model.contextCache', { size: size(fit.estimated_kv_bytes) }) : '',
    fit.note, fit.disk_ok === false ? t('model.insufficientDisk') : '',
  ].filter(Boolean).join(' · ');
  return <span className={'hub-fit-state state-' + fit.fit}
    role="status" tabIndex={0} title={breakdown}
    aria-label={labels[fit.fit] + share + '. ' + breakdown}>
    {labels[fit.fit]}{share}
  </span>;
}

export default function App() {
  const { t } = useTranslation();
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
      .catch((exc: Error) => { if (live) setError(t('feedback.apiConnection', { error: exc.message })); })
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
      changePage('descargas');
      setNotice(t('feedback.downloadRegistered', { filename: job.filename }));
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
      setNotice(t(route.page === 'modelos' ? 'feedback.setupSavedModels' : 'feedback.setupSavedRoute'));
    } catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  async function saveImageMode(mode: 'scene' | 'manual' | 'off') {
    setBusy(true);
    try {
      const result = await api.patchSettings({ image_mode: mode });
      setSettings(result); setImageMode(result.image_mode);
      setNotice(t('feedback.imagePreferenceSaved'));
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
        <div className="brand-text"><strong>Noble AI</strong><small>{t("nav.localStudio")}</small></div>
        <button className="mobile-dismiss icon-button" onClick={() => setNavOpen(false)} aria-label={t("nav.closeMenu")}><X size={18}/></button>
      </div>
      <div className="nav-label">{t("nav.workspace")}</div>
      <nav className="nav-menu" aria-label={t("nav.sections")}>
        {menu.map(item => <button key={item.id} onClick={() => changePage(item.id)}
          className={'nav-item ' + (page === item.id ? 'nav-active' : '')}>
          <item.icon size={19}/><span>{t("nav." + item.id)}</span>
          {item.id === 'descargas' && activeJobs > 0 && <b className="counter">{activeJobs}</b>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="device-card"><div className="device-icon"><Cpu size={18}/></div>
          <div><strong>{hardware?.gpus[0]?.name || t('nav.cpuNotDetected')}</strong>
            <small>{hardware?.gpus[0]
              ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB VRAM'
              : t('nav.diagnosticsAvailable')}</small></div>
        </div>
        <p className="sidebar-footer">P1 PROTOTYPE <span>·</span> LOCAL-FIRST</p>
      </div>
    </aside>
    {navOpen && <button aria-label={t("nav.closeMenu")} className="mobile-overlay" onClick={() => setNavOpen(false)}/>}
    <div className="work-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label={t("nav.openMenu")} onClick={() => setNavOpen(true)}><Menu size={23}/></button>
        <div className="breadcrumb">Noble AI <span>/</span> <strong>{t("nav." + page)}</strong></div>
        <div className="top-actions">
          <InterfaceLanguageSelector compact/>
          <span className="service-state"><i className={health?.status === 'ok' ? 'dot-green' : 'dot-red'}/>{health ? 'API local' : t('app.offline')}</span>
          <button className="icon-button" title={t("common.refresh")} aria-label={t("nav.refreshData")} onClick={() => { void refreshDownloads().catch(e => setError(e.message)); }}><RefreshCw size={18}/></button>
        </div>
      </header>
      <main className="content" data-ready={ready ? "yes" : "no"}>
        {releaseNotice && <div className="notice-banner noble-update-notice">
          <RefreshCw size={17}/>
          <span>{t('app.releaseNotice', { name: releaseNotice.name })}</span>
          <a href={releaseNotice.url} target="_blank" rel="noreferrer">{t('app.viewGitHub')}</a>
          <button aria-label={t('app.closeReleaseNotice')} onClick={() => {
            setReleaseNotice(null);
            localStorage.setItem('noble-seen-release', releaseNotice.label);
          }}><X size={16}/></button>
        </div>}
        {error && <ErrorNote message={error} close={() => setError('')}/>}
        {notice && <div className="notice-banner"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice('')} aria-label={t('app.dismissNotice')}><X size={16}/></button></div>}
        {!ready && <Loading/>}

        {page === 'crear' && <CreatorStudio initialStoryId={editingStoryId}
          onOpenLibrary={() => changePage('inicio')}
          onStoryChange={id => navigateRoute({ page: 'crear', storyId: id })}/>}
        {page === 'modelos' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><Sparkles size={14}/> {t('model.ecosystem')}</div>
            <h1>{t('model.title')}<span className="title-dot">.</span></h1>
            <p>{t('model.description')}</p>
          </div>
          <div className="hub-toolbar">
            <div className="tab-buttons" role="tablist">
              <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''}
                onClick={() => { setTab('discover'); closeModelDetail(); }}><Search size={17}/> {t('model.discover')}</button>
              <button role="tab" aria-selected={tab === 'installed'} className={tab === 'installed' ? 'active' : ''}
                onClick={() => { setTab('installed'); closeModelDetail(); }}><HardDrive size={17}/> {t('model.installed')} <span className="mini-count">{installed.length}</span></button>
            </div>
            <div className="source-tag"><Cloud size={16}/> Hugging Face</div>
          </div>
          {tab === 'discover' ? <>
            <div className="search-row">
              <div className="search-box"><Search size={21}/>
                <input aria-label={t('model.searchModels')} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder={t('app.searchPlaceholder')}/></div>
              <div className="search-role-wrap"><SlidersHorizontal size={17}/>
                <select aria-label={t('a11y.modelCategory')} value={role} onChange={e => { setRole(e.target.value as ModelRole); closeModelDetail(); }}>
                  {roles.map(r => <option key={r.id} value={r.id}>{t(r.titleKey)}</option>)}
                </select><ChevronDown size={15}/></div>
            </div>
            <div className="category-tabs" role="group" aria-label={t('app.modelTypes')}>
              {roles.map(item => <button key={item.id} onClick={() => { setRole(item.id); closeModelDetail(); }}
                className={role === item.id ? 'selected' : ''}>
                {item.id === 'narrator' ? <BookOpen size={18}/> : item.id === 'image' ? <Image size={18}/> : <Headphones size={18}/>}
                {t(item.titleKey)}</button>)}
            </div>
            <div className="section-caption"><div><h2>{t(selectedRole.subtitleKey)}</h2>
              <p>{t('model.catalog')}</p></div>
              <div className="noble-model-sort"><label htmlFor="hub-sort">{t('model.sortBy')}</label>
                <select id="hub-sort" aria-label={t('app.sortModels')} value={modelSort}
                  onChange={e => setModelSort(e.target.value)}>
                  <option value="downloads">{t('nav.descargas')}</option>
                  <option value="likes">{t('model.mostLiked')}</option>
                  <option value="trendingScore">{t('model.trending')}</option>
                  <option value="lastModified">{t('model.recent')}</option>
                </select>
                {searchLoading && <LoaderCircle className="rotating" size={18}/>}
              </div></div>
            {role !== 'narrator' && <div className="info-note"><Info size={18}/>
              {t('model.exploreOnly')}</div>}
            <div className="hub-discovery-layout">
              <div className="model-grid" aria-label={t('app.modelResults')}>
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
                      <span>{m.gated ? 'Restricted' : 'Public'}</span>
                      {m.license !== 'sin verificar' && <span>{m.license}</span>}
                    </span>
                  </span>
                  <ChevronDown className="hub-model-row-arrow" size={18}/>
                </button>)}
                {!searchLoading && searchResults.length === 0 && <div className="empty-state">
                  <Search size={30}/><strong>{t('model.noResults')}</strong>
                  <p>{t('model.searchHint')}</p></div>}
              </div>
              <aside className="hub-hardware-panel">
                <div className="hub-hardware-title"><Cpu size={20}/>
                  <div><strong>{t('model.hardware')}</strong>
                    <small>{t('model.quantEstimate')}</small></div></div>
                <div className="hub-hardware-numbers">
                  <div><span>{t('model.gpuDetected')}</span><strong>{hardware?.gpus[0]?.name || t('app.notDetected')}</strong></div>
                  <div><span>{t('model.freeVRAM')}</span><strong>
                    {hardware?.gpus[0] ? (hardware.gpus[0].vram_free_mb / 1024).toFixed(1)+' GiB' : 'Unavailable'}
                  </strong></div>
                  <div><span>{t('model.availableRAM')}</span><strong>
                    {hardware ? (hardware.ram_available_mb / 1024).toFixed(1)+' GiB' : '—'}
                  </strong></div>
                  <div><span>{t('model.freeDisk')}</span><strong>{hardware?.storage_free_gb ?? '—'} GB</strong></div>
                </div>
                <p>Open a model to compare its variants. Noble AI estimates weight sizes,
                  context memory, and runtime headroom. These estimates do not
                  guarantee engine compatibility or performance.</p>
                <div className="hub-hardware-legend">
                  <span>{t('model.fullGpu')}</span><span>{t('model.partial')}</span>
                  <span>{t('model.cpu')}</span><span>{t('model.insufficient')}</span>
                </div>
                <button className="secondary-button" onClick={() => changePage('ajustes')}>
                  <Settings2 size={15}/> {t('model.engineSettings')}
                </button>
              </aside>
            </div>
          </> : <>
            <div className="section-caption"><div><h2>{t('model.computer')}</h2><p>{t('model.registeredOnly')}</p></div></div>
            {modelStorage && <section className="hub-storage-summary" aria-label={t('settings.modelStorage')}>
              <div className="hub-storage-heading">
                <div><strong>{t('settings.modelStorage')}</strong>
                  <small title={modelStorage.models_dir}>{modelStorage.models_dir}</small>
                </div>
                <span><HardDrive size={15}/> {t('model.localDisk')}</span>
              </div>
              <div className="hub-storage-metrics">
                <div><span>{t('model.registered')}</span><strong>{size(modelStorage.installed.bytes)}</strong>
                  <small>{modelStorage.installed.count} in the registry</small></div>
                <div><span>{t('model.partialDownloads')}</span><strong>{size(modelStorage.partial.bytes)}</strong>
                  <small>{modelStorage.partial.count} with .part files</small></div>
                <div><span>{t('model.availableSpace')}</span><strong>{size(modelStorage.disk.free_bytes)}</strong>
                  <small>Capacity: {size(modelStorage.disk.total_bytes)}</small></div>
              </div>
              <div className="hub-storage-meter" role="meter" aria-label={t('app.diskSpaceOccupied')}
                aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={modelStorage.disk.total_bytes > 0 ?
                  Math.round((modelStorage.installed.bytes + modelStorage.partial.bytes) /
                    modelStorage.disk.total_bytes * 100) : 0}>
                <div style={{width: modelStorage.disk.total_bytes > 0 ?
                    (modelStorage.installed.bytes / modelStorage.disk.total_bytes * 100) + '%' : '0%'}}/>
                <div className="hub-storage-partial" style={{width: modelStorage.disk.total_bytes > 0 ?
                    (modelStorage.partial.bytes / modelStorage.disk.total_bytes * 100) + '%' : '0%'}}/>
              </div>
              <p>The inventory includes registered files and incomplete downloads.
                Disk capacity also includes other files on this computer.</p>
              {!!modelStorage.items.length && <details className="hub-storage-files">
                <summary>View counted files ({modelStorage.items.length})</summary>
                <div>{modelStorage.items.map(item => <div key={item.id}>
                  <span title={item.repo_id}>{item.name}
                    {!item.file_present ? ' · Missing' : item.kind === 'partial' ? ' · Partial' : ''}</span>
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
                  <small>{model.integrity_status === 'sha256_verified' ? 'SHA-256 verified against upstream' :
                    'Local hash; the source did not publish SHA-256'}</small>
                  {modelStorage?.items.find(item => item.id === model.id)?.file_present === false &&
                    <small className="hub-file-missing">{t('model.missingFile')}</small>}
                </div>
                <div className="installed-actions">
                  {assignments.narrator === model.id && <span className="assigned"><Check size={16}/> {t('model.selectedNarrator')}</span>}
                  <button className="secondary-button" disabled={busy || assignments.narrator === model.id ||
                      modelStorage?.items.find(item => item.id === model.id)?.file_present === false}
                    onClick={() => void assignModel(model.id)}>
                    {assignments.narrator === model.id ? 'Assigned' : 'Choose narrator'}</button>
                </div>
              </article>)}
              {installed.length === 0 && <div className="empty-state"><Database size={31}/><strong>{t('model.noInstalled')}</strong>
                <p>{t('model.noInstalledHint')}</p>
                <button className="secondary-button" onClick={() => setTab('discover')}>{t('model.searchModels')}</button></div>}
            </div>
          </>}
        </section>}

        {page === 'descargas' && <section className="hub">
          <div className="page-heading"><div className="eyebrow"><ArrowDownToLine size={14}/> {t('downloads.activity')}</div><h1>{t('nav.descargas')}<span className="title-dot">.</span></h1>
            <p>{t('downloads.description')}</p></div>
          {recovery && (recovery.recovered > 0 || recovery.conflicts > 0) &&
            <div className="workspace-note" role="status">
              {recovery.conflicts ? <CircleAlert size={18}/> : <ShieldCheck size={18}/>}
              <span>
                {recovery.recovered > 0 &&
                  <strong>{recovery.recovered} download{recovery.recovered === 1 ? '' : 's'} recovered after restart. </strong>}
                {recovery.conflicts > 0 &&
                  <strong>{recovery.conflicts} conflict{recovery.conflicts === 1 ? '' : 's'} detected. </strong>}
                Recovered files require an explicit resume and verification before use.
                {recovery.conflicts > 0 &&
                  ' Conflicts do not overwrite files; review the reason on each download.'}
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
                <span>{job.expected_size ? pct + '%' : 'Unknown total'}</span></div>
              {job.error && <p className="job-error">{job.error}</p>}
              <div className="download-controls">
                {['queued', 'downloading'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'pause')}><Pause size={16}/> {t('downloads.pause')}</button>}
                {['paused', 'failed', 'cancelled'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'resume')}><Play size={16}/> {t('downloads.resume')}</button>}
                {['queued', 'downloading', 'paused', 'failed'].includes(job.status) && <button disabled={busy} onClick={() => void manageDownload(job.id, 'cancel')}><X size={16}/> {t('downloads.cancel')}</button>}
                {job.status === 'completed' && <span className="complete"><CheckCircle2 size={16}/> {t('downloads.registered')}</span>}
              </div>
            </article>;
          })}
          {jobs.length === 0 && <div className="empty-state"><ArrowDownToLine size={30}/><strong>{t('downloads.empty')}</strong>
            <p>{t('downloads.emptyHint')}</p>
            <button className="secondary-button" onClick={() => changePage('modelos')}>{t('downloads.openHub')}</button></div>}
          </div>
        </section>}

        {page === 'descubrir' && <section className="noble-discover-page" aria-label={t('app.storyCatalog')}>
          <div className="page-heading">
            <div className="eyebrow"><Compass size={14}/> {t('app.discover')}</div>
            <h1>{t('discover.title')}<span className="title-dot">.</span></h1>
            <p>{t('discover.description')}</p>
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
          <div className="page-heading"><div className="eyebrow"><Cpu size={14}/> {t('app.system')}</div><h1>{t('system.title')}<span className="title-dot">.</span></h1>
            <p>{t('system.description')}</p></div>
          <div className="stat-grid">
            <div className="stat"><span>{t('system.backend')}</span><strong>{health?.status === 'ok' ? t('app.connected') : t('app.offline')}</strong><small>API Noble {health?.version || '—'}</small></div>
            <div className="stat"><span>{t('system.ram')}</span><strong>{hardware ? Math.round(hardware.ram_total_mb / 1024) + ' GB' : '—'}</strong><small>{hardware ? t('app.availableGB', { count: Math.round(hardware.ram_available_mb / 1024) }) : ''}</small></div>
            <div className="stat"><span>{t('system.vram')}</span><strong>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB' : t('app.notDetected')}</strong><small>{hardware?.gpus[0]?.name || t('app.cpuAvailable')}</small></div>
            <div className="stat"><span>{t('system.disk')}</span><strong>{hardware ? hardware.storage_free_gb + ' GB' : '—'}</strong><small>{t('system.modelDir')}</small></div>
          </div>
          <div className="settings-panel"><section><div className="setting-icon"><Cloud size={22}/></div><div className="setting-main">
            <strong>{t('settings.providers')}</strong>{providers.map(p => <p key={p.id}>{p.id} · {p.kind} — {p.status === 'ready' ? t('common.ready') : t('app.integrationPending')}</p>)}
          </div></section></div>
        </section>}
      </main>
    </div>

    {(detail || detailLoading) && <div className="modal-scrim model-detail-scrim"
      role="presentation" onClick={closeModelDetail}>
      <section className="detail-panel" role="dialog" aria-modal={!dockedDetail} aria-label={t('a11y.modelDetails')} onClick={e => e.stopPropagation()}>
        <div className="detail-top"><span>{t('model.details')}</span><button className="icon-button" onClick={closeModelDetail} aria-label={t('app.closeDetails')}><X size={19}/></button></div>
        {detailLoading ? <Loading/> : detail && <>
          <div className="noble-model-detail-heading">
            <div className="detail-avatar"><BookOpen size={32}/></div>
            <div>
              <span className="overline">{detail.pipeline_tag || 'HUGGING FACE MODEL'}</span>
              <h2>{detail.repo_id.split('/')[1]}</h2>
              <p className="detail-author">{detail.author || detail.repo_id.split('/')[0]}</p>
            </div>
          </div>
          {detail.summary && <p className="hub-detail-description">{detail.summary}</p>}
          <div className="hub-detail-stats">
            <div><span>{t('nav.descargas')}</span><strong>{(detail.downloads || 0).toLocaleString()}</strong></div>
            <div><span>{t('model.mostLiked')}</span><strong>{(detail.likes || 0).toLocaleString()}</strong></div>
            <div><span>{t('model.license')}</span><strong>{detail.license}</strong></div>
            <div><span>{t('model.access')}</span><strong>{detail.gated ? 'Restricted' : 'Public'}</strong></div>
          </div>
          <div className="hub-detail-metadata">
            <div><span>{t('model.revision')}</span><code>{detail.revision.slice(0,12)}</code></div>
            {detail.hardware_fit?.architecture &&
              <div><span>{t('model.ggufArchitecture')}</span><strong>{detail.hardware_fit.architecture}</strong></div>}
            {detail.hardware_fit?.parameter_count != null &&
              <div><span>{t('model.parameters')}</span>
                <strong>{(detail.hardware_fit.parameter_count/1e9).toFixed(2)} B</strong></div>}
            {detail.library && <div><span>{t('model.library')}</span><strong>{detail.library}</strong></div>}
            {detail.base_model && <div><span>{t('model.baseModel')}</span><strong>
              {Array.isArray(detail.base_model) ? detail.base_model.join(', ') : detail.base_model}
            </strong></div>}
          </div>
          {!!detail.tags?.length && <div className="hub-detail-tags">
            {detail.tags.slice(0,10).map(tag => <span key={tag}>{tag}</span>)}
          </div>}
          <a className="external-link" href={detail.url} target="_blank" rel="noreferrer">
            {t('model.viewCard')} <ExternalLink size={15}/></a>
          {role === 'narrator' && detail.variants.length > 0 ? <>
            <section className="hub-fit-analysis">
              <div className="hub-fit-header">
                <div><h3>{t('model.assessment')}</h3>
                  <p>{detail.hardware_fit?.gpu?.name || 'CPU / RAM'} ·
                    {detail.hardware_fit?.metadata_source === 'gguf_header'
                      ? ' KV estimated from GGUF header' : ' Approximate context reserve'}
                  </p></div>
                <label>{t('model.context')}
                  <select aria-label={t('app.compatibilityContext')} value={modelContext}
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
                    <small>{t('model.estimateDisclaimer')}</small>
                  </div></div> :
                <div className="hub-fit-caution"><CircleAlert size={18}/>
                  {t('model.noRecommendation')}</div>}
              {selectedFit && <div className="hub-selected-fit">
                <div className="hub-selected-fit-head">
                  <strong>Selected variant: {selectedFit.quantization || 'GGUF'}</strong>
                  <span>{selectedFit.estimated_required_bytes
                    ? 'Approximate requirement ' + size(selectedFit.estimated_required_bytes)
                    : 'Unknown consumption'}</span>
                </div>
                <div role="meter" aria-label={t('app.memoryRequirement')}
                  aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={selectedMemoryPercent} className="hub-memory-meter">
                  <span style={{width: selectedMemoryPercent+'%'}}/>
                </div>
                <div className="hub-selected-fit-foot">
                  <span>{selectedFit.fit === 'full_gpu' ? 'Estimated usable GPU limit' :
                    selectedFit.fit === 'partial_offload' ? 'Combined GPU and RAM limit' :
                    'Estimated usable RAM limit'}: {memoryBudget ? size(memoryBudget) : 'no data'}</span>
                  <span>{selectedFit.fit === 'partial_offload' ?
                    'Requires engine-supported offload' :
                    selectedFit.fit === 'full_gpu' ? 'Based on observed free VRAM' :
                    'Does not imply GPU execution'}</span>
                </div>
              </div>}
              <div className="hub-variants-toolbar">
                <h3>{t('model.compare')} <small>{detail.variants.length}</small></h3>
                <div role="group" aria-label={t('app.filterCompatibility')}>
                  {[
                    {id:'all',label:'All'},
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
                      {v.sha256 ? ' published SHA-256' : ' no published hash'}</small>
                    {fit && <small>{fit.note}</small>}
                    {fit?.disk_ok===false && <small>{t('model.noDisk')}</small>}
                  </span>
                  <span className="hub-variant-aside">
                    {fit && <ModelFitBadge fit={fit}/>}
                    {fit?.estimated_required_bytes && <small>
                      ~{size(fit.estimated_required_bytes)} memory
                    </small>}
                    {detail.hardware_fit?.recommended_filename === v.filename &&
                      <small className="hub-variant-recommended">{t('model.recommended')}</small>}
                    {selected && <Check size={17}/>}
                  </span>
                </button>;
              })}
                {detail.variants.filter(v => variantFilter === 'all' ||
                  detail.hardware_fit?.variants.some(item =>
                    item.filename === v.filename && item.fit === variantFilter)).length === 0 &&
                  <p className="hub-variant-no-fit">No variants in this category.
                    Try another filter or adjust the context.</p>}
              </div>
              <p className="detail-disclaimer">{detail.hardware_fit?.warning ||
                'These are estimates, not measured benchmark results.'}</p>
            </section>
            <button className="primary-button full"
              disabled={busy || detail.gated || !detail.supports_install ||
                !pickedVariant || Boolean(isInstalled)} onClick={() => void install()}>
              {busy ? <LoaderCircle className="rotating" size={17}/> :
                isInstalled ? <CheckCircle2 size={18}/> : <Download size={18}/>}
              {isInstalled ? 'Variant installed' : 'Download selected variant'}
            </button>
          </> : <div className="info-note"><Info size={18}/>
            {role === 'narrator' ?
              'The current downloader has no supported individual GGUF file for this model.' :
              'This catalog shows metadata. Image and voice installation uses their respective provider settings.'}
          </div>}
          <section className="hub-model-card-section">
            <div className="hub-model-card-heading">
              <div><h3>{t('model.card')}</h3>
                <p>{t('model.originalAuthor')}</p></div>
              <button type="button" className="secondary-button"
                aria-expanded={cardVisible} onClick={() => void toggleModelCard()}>
                {cardVisible ? 'Hide model card' : 'Read full model card'}
              </button>
            </div>
            {cardVisible && (cardBusy ?
              <p role="status">{t('model.loadingReadme')}</p> : cardData?.available ?
                <div>
                  {cardData.truncated && <p>{t('model.truncatedReadme')}</p>}
                  <pre className="hub-model-readme">{cardData.readme || 'Empty document.'}</pre>
                </div> : <p>{t('model.noReadme')}</p>)}
          </section>
        </>}
      </section>
    </div>}

    {showSetup && ready && <div className="welcome-scrim"><section className="welcome-panel" role="dialog" aria-modal="true" aria-label={t('a11y.initialSetup')}>
      <div className="welcome-icon"><Sparkles size={31}/></div><span className="overline">{t('setup.welcome')}</span>
      <h2>{t('setup.title')}</h2>
      <p>{t('setup.description')}</p>
      <div className="welcome-hardware"><Cpu size={19}/>
        <div><strong>{hardware?.gpus[0]?.name || t('app.cpuAvailable')}</strong>
          <small>{hardware?.gpus[0] ? Math.round(hardware.gpus[0].vram_total_mb / 1024) + ' GB VRAM detected' :
            'No NVIDIA GPU detected by the backend'}</small></div></div>
      <label className="form-label" htmlFor="image-policy">{t('setup.imagesFuture')}</label>
      <select id="image-policy" value={imageMode} onChange={e => setImageMode(e.target.value as 'scene' | 'manual' | 'off')}>
        <option value="scene">{t('setup.sceneChange')}</option>
        <option value="manual">{t('setup.onRequest')}</option>
        <option value="off">{t('setup.noImages')}</option>
      </select>
      <div className="setup-callout"><ShieldCheck size={18}/> {t('setup.ttsDisabled')}</div>
      <button className="primary-button full" disabled={busy} onClick={() => void finishSetup()}>
        {busy ? <LoaderCircle className="rotating" size={18}/> : <ArrowRight size={18}/>}
        Continue to Model Hub</button>
      <small className="welcome-note">{t('setup.incremental')}</small>
    </section></div>}
  </div>;
}
