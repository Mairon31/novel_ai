import { useTranslation } from 'react-i18next';
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
      setMessage('Worker registered. Check its connection before activation.');
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
        setMessage('Worker authenticated. ' + status.models.length + ' models advertised.');
      } else {
        setError(status.error || 'The worker is not responding or rejects the token.');
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
      setMessage('Remote narrator activated: ' + result.model + '. Open Library to use it.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function measure() {
    if (!selected || !model) return;
    setBusy(true); setError(''); setMessage(''); setBenchmark(null);
    try {
      const result = await api.benchmarkWorker(selected, model);
      setBenchmark(result);
      if (!result.success) setError(result.error || 'Worker benchmark failed');
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
      setMessage('Worker removed. Its stored token was cleared.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="workspace-panel noble-worker-manager">
    <h3><Cloud size={18}/> {t('workers.title')}</h3>
    <p>Connect another PC or an eligible Colab session through a protected Cloudflare tunnel. Remote GPU inference handles narrative generation while story history stays on this computer.</p>

    <div className="noble-worker-form">
      <label className="workspace-pref-field">{t('workers.name')}
        <input aria-label={t('workers.name')} placeholder="My Colab GPU" value={name}
          onChange={e => setName(e.target.value)} maxLength={80}/></label>
      <label className="workspace-pref-field">{t('workers.url')}
        <input aria-label={t('a11y.workerUrl')} placeholder="https://my-gpu.trycloudflare.com"
          value={url} onChange={e => setUrl(e.target.value)} maxLength={256}
          spellCheck={false}/></label>
      <label className="workspace-pref-field">{t('workers.token')}
        <input aria-label={t('a11y.workerToken')} type="password" autoComplete="off"
          placeholder="Secret token with at least 12 characters" value={token}
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
          Test connection</button>
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
        Measure real response</button>
      {benchmark && <div className="noble-worker-benchmark" role="status">
        <strong>{benchmark.success ? 'Generation test completed' : 'Test failed'}</strong>
        <span>Time to first text: {benchmark.ttft_ms == null
          ? 'No data' : benchmark.ttft_ms.toFixed(0) + ' ms'}</span>
        <span>Total duration: {benchmark.duration_ms.toFixed(0)} ms</span>
        <span>Output characters: {benchmark.output_characters}</span>
        <small>This is one test request. For p50/p95 latency and sampled VRAM
          use the Colab notebook benchmark.</small>
      </div>}

    </div>}
    {probe?.online && <div className="noble-worker-health">
      <h4>{t('workers.status')}</h4>
      <div className="noble-worker-health-stats">
        <div><span>{t('workers.connection')}</span><strong>{probe.latency_ms === undefined
          ? 'Unavailable' : probe.latency_ms.toFixed(0) + ' ms'}</strong></div>
        <div><span>{t('workers.engine')}</span><strong>{probe.health?.engine_status === 'ready'
          ? 'Available' : probe.health?.engine_status === 'unavailable'
            ? 'No response' : 'No telemetry'}</strong></div>
        <div><span>{t('workers.ttfb')}</span><strong>
          {probe.health?.last_ttft_ms == null
            ? 'No data' : probe.health.last_ttft_ms.toFixed(0) + ' ms'}
        </strong></div>
        <div><span>{t('workers.completed')}</span><strong>
          {probe.health ? probe.health.completed_requests + ' / ' +
            probe.health.failed_requests : 'No data'}
        </strong></div>
      </div>
      {probe.health?.gpu?.map(gpu => <div className="noble-worker-gpu" key={gpu.index}>
        <span><Cpu size={15}/> {gpu.name}</span>
        <strong>VRAM {gpu.vram_used_mb} / {gpu.vram_total_mb} MB · GPU {gpu.utilization_percent}%</strong>
        <div className="noble-worker-vram-meter"><span style={{
          width: Math.min(100, 100 * gpu.vram_used_mb / Math.max(1, gpu.vram_total_mb)) + '%',
        }}/></div>
      </div>)}
      <p className="noble-worker-health-note">
        Metrics reflect the latest probe, not continuous benchmarking. Refresh them using Test connection.
      </p>
    </div>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {message && <p role="status" className="narrative-saved"><CheckCircle2 size={15}/>{message}</p>}
    <div className="workspace-note"><ShieldCheck size={17}/>
      The tunnel must authenticate all bearer requests. Noble AI rejects workers accepting invalid tokens. Only compatible LLM endpoints are supported; Colab is not started automatically and no files are shared.
    </div>
    <p className="noble-worker-guide"><Server size={15}/> Worker setup: run Noble AI's authenticated proxy on the GPU computer and expose only that proxy
      with cloudflared. <a target="_blank" rel="noreferrer"
        href="https://github.com/Mairon31/novel_ai/blob/master/docs/WORKERS.md">
        {t('workers.viewInstructions')} <RefreshCw size={13}/></a></p>
  </div>;
}
