import { useTranslation } from 'react-i18next';
import { formatUiNumber } from './i18n';
import { useEffect, useState } from 'react';
import {
  CheckCircle2, Cloud, Cpu, Link2, LoaderCircle, PlugZap, Plus, RefreshCw,
  Server, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from './api';
import type { RemoteWorker, WorkerProbe, WorkerBenchmark } from './types';

export function RemoteWorkers({ onActivated }: { onActivated: () => void }) {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<RemoteWorker[]>([]);
  const [selected, setSelected] = useState('');
  const [probe, setProbe] = useState<WorkerProbe | null>(null);
  const [benchmark, setBenchmark] = useState<WorkerBenchmark | null>(null);
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const data = await api.workers();
    setWorkers(data.workers);
    setSelected(previous => data.workers.some(w => w.id === previous)
      ? previous : data.workers[0]?.id || '');
  }

  useEffect(() => {
    let alive = true;
    api.workers().then(data => {
      if (!alive) return;
      setWorkers(data.workers);
      if (data.workers.length) setSelected(data.workers[0].id);
    }).catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function add() {
    if (!name.trim() || !url.trim() || !token.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const item = await api.registerWorker(name.trim(), url.trim(), token.trim());
      setToken(''); setName(''); setUrl('');
      await refresh(); setSelected(item.id);
      setProbe(null); setModel('');
      setMessage(t('feedback.workerRegistered'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage(''); setProbe(null); setModel(''); setBenchmark(null);
    try {
      const status = await api.probeWorker(selected);
      setProbe(status);
      if (status.online) {
        setModel(status.models[0] || '');
        setMessage(t('feedback.workerAuthenticated', { count: status.models.length }));
      } else {
        setError(status.error || t('feedback.workerUnavailable'));
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function activate() {
    if (!selected || !model) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.activateWorker(selected, model);
      onActivated();
      setMessage(t('feedback.workerActivated', { model: result.model }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function measure() {
    if (!selected || !model) return;
    setBusy(true); setError(''); setMessage(''); setBenchmark(null);
    try {
      const result = await api.benchmarkWorker(selected, model);
      setBenchmark(result);
      if (!result.success) setError(result.error || t('feedback.workerBenchmarkFailed'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.removeWorker(selected);
      await refresh();
      setProbe(null); setModel('');
      setMessage(t('feedback.workerRemoved'));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="workspace-panel noble-worker-manager">
    <h3><Cloud size={18}/> {t('workers.title')}</h3>
    <p>{t('workers.connectionHint')}</p>

    <div className="noble-worker-form">
      <label className="workspace-pref-field">{t('workers.name')}
        <input aria-label={t('a11y.workerName')} placeholder={t('uiField.remoteWorkers.myColabGPU')} value={name}
          onChange={e => setName(e.target.value)} maxLength={80}/></label>
      <label className="workspace-pref-field">{t('workers.url')}
        <input aria-label={t('a11y.workerUrl')} placeholder="https://my-gpu.trycloudflare.com"
          value={url} onChange={e => setUrl(e.target.value)} maxLength={256}
          spellCheck={false}/></label>
      <label className="workspace-pref-field">{t('workers.token')}
        <input aria-label={t('a11y.workerToken')} type="password" autoComplete="off"
          placeholder={t('workers.tokenPlaceholder')} value={token}
          maxLength={512} onChange={e => setToken(e.target.value)}/></label>
      <button className="secondary-button" disabled={busy || name.trim().length < 2
        || !url.startsWith('https://') || token.trim().length < 12} onClick={() => void add()}>
        <Plus size={16}/> {t('workers.register')}</button>
    </div>
    <div className="noble-worker-controls">
      <label className="workspace-pref-field">{t('workers.registered')}
        <select aria-label={t('a11y.selectWorker')} value={selected} disabled={busy || loading}
          onChange={e => { setSelected(e.target.value); setProbe(null); setModel(''); }}>
          <option value="">{t('workers.selectWorker')}</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></label>
      <div className="noble-worker-controls-actions">
        <button className="secondary-button" disabled={busy || !selected} onClick={() => void verify()}>
          {busy ? <LoaderCircle size={16} className="rotating"/> : <PlugZap size={16}/>}
          {t('workers.testConnection')}</button>
        <button className="secondary-button" disabled={busy || !selected}
          onClick={() => void remove()}><Trash2 size={16}/> {t('common.remove')}</button>
      </div>
    </div>
    {selected && <div className="noble-worker-info">
      <Link2 size={15}/><span>{workers.find(w => w.id === selected)?.url}</span>
      <span className="muted-tag">LLM · HTTPS</span>
    </div>}
    {probe?.online && <div className="noble-worker-select-model">
      <div className="narrative-connect connected"><CheckCircle2 size={16}/>
        {t('workers.available')}</div>
      <label className="workspace-pref-field">{t('workers.remoteModel')}
        <select aria-label={t('workers.remoteModel')} value={model} onChange={e => setModel(e.target.value)}>
          {probe.models.map(m => <option key={m} value={m}>{m}</option>)}
        </select></label>
      <button className="primary-button" disabled={busy || !model} onClick={() => void activate()}>
        <Cpu size={16}/> {t('workers.useNarrator')}</button>
      <button className="secondary-button" disabled={busy || !model}
        onClick={() => void measure()}>
        {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCw size={16}/>}
        {t('workers.measureReal')}</button>
      {benchmark && <div className="noble-worker-benchmark" role="status">
        <strong>{t(benchmark.success ? 'workers.generationCompleted' : 'workers.testFailed')}</strong>
        <span>{benchmark.ttft_ms == null ? t('workers.noData') :
          t('workers.ttftDisplay', { duration: formatUiNumber(benchmark.ttft_ms) })}</span>
        <span>{t('workers.durationDisplay', { duration: formatUiNumber(benchmark.duration_ms) })}</span>
        <span>{t('workers.outputChars', { count: benchmark.output_characters })}</span>
        <small>{t('workers.benchmarkHint')}</small>
      </div>}

    </div>}
    {probe?.online && <div className="noble-worker-health">
      <h4>{t('workers.status')}</h4>
      <div className="noble-worker-health-stats">
        <div><span>{t('workers.connection')}</span><strong>{probe.latency_ms === undefined
          ? t('common.unavailable') : formatUiNumber(probe.latency_ms) + ' ms'}</strong></div>
        <div><span>{t('workers.engine')}</span><strong>{probe.health?.engine_status === 'ready'
          ? t('workers.statusAvailable') : probe.health?.engine_status === 'unavailable'
            ? t('workers.noResponse') : t('workers.noTelemetry')}</strong></div>
        <div><span>{t('workers.ttfb')}</span><strong>
          {probe.health?.last_ttft_ms == null
            ? t('workers.noData') : formatUiNumber(probe.health.last_ttft_ms) + ' ms'}
        </strong></div>
        <div><span>{t('workers.completed')}</span><strong>
          {probe.health ? probe.health.completed_requests + ' / ' +
            probe.health.failed_requests : t('workers.noData')}
        </strong></div>
      </div>
      {probe.health?.gpu?.map(gpu => <div className="noble-worker-gpu" key={gpu.index}>
        <span><Cpu size={15}/> {gpu.name}</span>
        <strong>{t('workersUi.vramStats', { used: gpu.vram_used_mb, total: gpu.vram_total_mb,
          utilization: gpu.utilization_percent })}</strong>
        <div className="noble-worker-vram-meter"><span style={{
          width: Math.min(100, 100 * gpu.vram_used_mb / Math.max(1, gpu.vram_total_mb)) + '%',
        }}/></div>
      </div>)}
      <p className="noble-worker-health-note">
        {t('workers.metricsHint')}
      </p>
    </div>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {message && <p role="status" className="narrative-saved"><CheckCircle2 size={15}/>{message}</p>}
    <div className="workspace-note"><ShieldCheck size={17}/>
      {t('workers.securityHint')}
    </div>
    <p className="noble-worker-guide"><Server size={15}/> {t('workersUi.workerGuide')} <a target="_blank" rel="noreferrer"
        href="https://github.com/Mairon31/novel_ai/blob/master/docs/WORKERS.md">
        {t('workers.viewInstructions')} <RefreshCw size={13}/></a></p>
  </div>;
}
