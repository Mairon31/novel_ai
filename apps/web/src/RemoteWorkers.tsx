import { useEffect, useState } from 'react';
import {
  CheckCircle2, Cloud, Cpu, Link2, LoaderCircle, PlugZap, Plus, RefreshCw,
  Server, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from './api';
import type { RemoteWorker, WorkerProbe } from './types';

export function RemoteWorkers({ onActivated }: { onActivated: () => void }) {
  const [workers, setWorkers] = useState<RemoteWorker[]>([]);
  const [selected, setSelected] = useState('');
  const [probe, setProbe] = useState<WorkerProbe | null>(null);
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
      setMessage('Worker registrado. Comprueba su conexión antes de activarlo.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage(''); setProbe(null); setModel('');
    try {
      const status = await api.probeWorker(selected);
      setProbe(status);
      if (status.online) {
        setModel(status.models[0] || '');
        setMessage('Worker autenticado. ' + status.models.length + ' modelos anunciados.');
      } else {
        setError(status.error || 'El worker no responde o no acepta el token.');
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
      setMessage('Narrador remoto activado: ' + result.model + '. Abre Biblioteca para usarlo.');
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
      setMessage('Worker eliminado. Su token guardado fue retirado.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="workspace-panel noble-worker-manager">
    <h3><Cloud size={18}/> Workers GPU remotos</h3>
    <p>Conecta una segunda PC o una sesión de Google Colab a través de un túnel Cloudflare protegido.
      Noble AI utiliza la GPU del worker para generar los diálogos; el historial permanece en el equipo principal.</p>

    <div className="noble-worker-form">
      <label className="workspace-pref-field">Nombre
        <input aria-label="Nombre del worker" placeholder="Mi GPU de Colab" value={name}
          onChange={e => setName(e.target.value)} maxLength={80}/></label>
      <label className="workspace-pref-field">URL Cloudflare HTTPS
        <input aria-label="URL del worker" placeholder="https://mi-gpu.trycloudflare.com"
          value={url} onChange={e => setUrl(e.target.value)} maxLength={256}
          spellCheck={false}/></label>
      <label className="workspace-pref-field">Token del worker (Bearer)
        <input aria-label="Token del worker" type="password" autoComplete="off"
          placeholder="Token secreto de al menos 12 caracteres" value={token}
          maxLength={512} onChange={e => setToken(e.target.value)}/></label>
      <button className="secondary-button" disabled={busy || name.trim().length < 2
        || !url.startsWith('https://') || token.trim().length < 12} onClick={() => void add()}>
        <Plus size={16}/> Registrar worker</button>
    </div>
    <div className="noble-worker-controls">
      <label className="workspace-pref-field">Worker registrado
        <select aria-label="Seleccionar worker" value={selected} disabled={busy || loading}
          onChange={e => { setSelected(e.target.value); setProbe(null); setModel(''); }}>
          <option value="">Selecciona un worker</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></label>
      <div className="noble-worker-controls-actions">
        <button className="secondary-button" disabled={busy || !selected} onClick={() => void verify()}>
          {busy ? <LoaderCircle size={16} className="rotating"/> : <PlugZap size={16}/>}
          Probar conexión</button>
        <button className="secondary-button" disabled={busy || !selected}
          onClick={() => void remove()}><Trash2 size={16}/> Quitar</button>
      </div>
    </div>
    {selected && <div className="noble-worker-info">
      <Link2 size={15}/><span>{workers.find(w => w.id === selected)?.url}</span>
      <span className="muted-tag">LLM · HTTPS</span>
    </div>}
    {probe?.online && <div className="noble-worker-select-model">
      <div className="narrative-connect connected"><CheckCircle2 size={16}/>
        Worker disponible y autenticado</div>
      <label className="workspace-pref-field">Modelo remoto
        <select aria-label="Modelo remoto" value={model} onChange={e => setModel(e.target.value)}>
          {probe.models.map(m => <option key={m} value={m}>{m}</option>)}
        </select></label>
      <button className="primary-button" disabled={busy || !model} onClick={() => void activate()}>
        <Cpu size={16}/> Usar modelo remoto como narrador</button>
    </div>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {message && <p role="status" className="narrative-saved"><CheckCircle2 size={15}/>{message}</p>}
    <div className="workspace-note"><ShieldCheck size={17}/>
      El túnel debe autenticar todas las solicitudes Bearer. Noble AI rechaza workers que respondan
      a tokens incorrectos. Por ahora se admiten únicamente endpoints de LLM compatibles
      con OpenAI; no se inicia Colab automáticamente ni se comparten archivos con el worker.
    </div>
    <p className="noble-worker-guide"><Server size={15}/> Configuración del worker:
      ejecuta el proxy autenticado de Noble AI en la máquina GPU y publica solo ese proxy
      con cloudflared. <a target="_blank" rel="noreferrer"
        href="https://github.com/Mairon31/novel_ai/blob/master/docs/WORKERS.md">
        Ver instrucciones <RefreshCw size={13}/></a></p>
  </div>;
}
