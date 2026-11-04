import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Cpu, LoaderCircle, PlugZap, RefreshCw, Save } from 'lucide-react';
import { api } from './api';
import type { NarrativeConfig, ProviderModels } from './types';

const defaultConfig: NarrativeConfig = {
  provider: 'ollama', base_url: 'http://127.0.0.1:11434', model: '',
  temperature: 0.7, top_p: 0.9, max_tokens: 450, num_ctx: 4096, device: 'auto',
  top_k: 40, repetition_penalty: 1.0, reasoning_mode: 'auto', worker_id: '',
};

export function NarrativeSettings() {
  const [config, setConfig] = useState<NarrativeConfig>(defaultConfig);
  const [status, setStatus] = useState<ProviderModels | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.narrativeConfig().then(value => {
      if (alive) setConfig(value);
    }).catch((exc: Error) => { if (alive) setError(exc.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  function update<K extends keyof NarrativeConfig>(key: K, value: NarrativeConfig[K]) {
    setConfig(current => ({ ...current, [key]: value }));
    setSaved('');
  }
  async function persist(probe: boolean) {
    setWorking(true); setSaved(''); setError('');
    try {
      const next = await api.saveNarrativeConfig(config);
      setConfig(next);
      if (probe) {
        const info = await api.narrativeModels();
        setStatus(info);
        setSaved(info.online ? 'Conexión local verificada.' :
          'Configuración guardada; el motor todavía no responde.');
      } else {
        setSaved('Parámetros narrativos guardados.');
      }
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setWorking(false); }
  }

  return <section className="narrative-settings" aria-labelledby="narrative-settings-heading">
    <div className="narrative-section-title">
      <span className="setting-icon"><BookOpen size={22}/></span>
      <div><h2 id="narrative-settings-heading">Motor narrativo local</h2>
        <p>Selecciona un motor local o OpenRouter. Ajusta parámetros según las capacidades reales del proveedor.</p></div>
    </div>
    {loading ? <div className="loading"><LoaderCircle className="rotating" size={18}/> Leyendo configuración...</div> : <>
      <div className="narrative-settings-grid">
        <label>Proveedor
          <select value={config.provider} onChange={e => {
            const provider = e.target.value as NarrativeConfig['provider'];
            setStatus(null);
            setConfig(current => ({ ...current, provider, device: 'auto',
              base_url: provider === 'ollama' ? 'http://127.0.0.1:11434' : provider === 'koboldcpp' ? 'http://127.0.0.1:5001' : 'https://openrouter.ai/api/v1', model: '' }));
          }}>
            <option value="ollama">Ollama (API local)</option>
            <option value="koboldcpp">KoboldCpp (API compatible)</option>
            <option value="openrouter">OpenRouter (modelos por API)</option>
          </select>
        </label>
        <label>Dirección del proveedor
          <input aria-label="Dirección del servidor LLM" value={config.base_url}
            readOnly={config.provider === "openrouter"}
            onChange={e => update('base_url', e.target.value)} spellCheck={false}/>
        </label>
        <label className="settings-span">Modelo del motor
          <input list="noble-local-models" value={config.model} placeholder="Conecta y elige un modelo"
            aria-label="Modelo narrativo del motor" onChange={e => update('model', e.target.value)}/>
          <datalist id="noble-local-models">
            {status?.models.map(item => <option key={item} value={item}/>)}
          </datalist>
          {status?.online && <small>Modelos encontrados: {status.models.length}. Escribe o selecciona uno del catálogo local.</small>}
        </label>
        <label>Temperatura <span className="field-value">{config.temperature.toFixed(2)}</span>
          <input type="range" min={0} max={2} step={0.05} value={config.temperature}
            onChange={e => update('temperature', Number(e.target.value))}/>
        </label>
        <label>Top-P <span className="field-value">{config.top_p.toFixed(2)}</span>
          <input type="range" min={0.05} max={1} step={0.05} value={config.top_p}
            onChange={e => update('top_p', Number(e.target.value))}/>
        </label>
        <label>Top-K <span className="field-value">{config.top_k}</span>
          <input type="range" min={0} max={200} step={5} value={config.top_k}
            disabled={config.provider === 'koboldcpp'}
            onChange={e => update('top_k', Number(e.target.value))}/>
        </label>
        <label>Penalización de repetición <span className="field-value">{config.repetition_penalty.toFixed(2)}</span>
          <input type="range" min={0.5} max={2} step={0.05} value={config.repetition_penalty}
            disabled={config.provider === 'koboldcpp'}
            onChange={e => update('repetition_penalty', Number(e.target.value))}/>
        </label>
        <label>Razonamiento
          <select aria-label="Razonamiento del narrador" value={config.reasoning_mode}
            disabled={config.provider !== 'ollama'}
            onChange={e => update('reasoning_mode', e.target.value as NarrativeConfig['reasoning_mode'])}>
            <option value="auto">Automático / configuración del modelo</option>
            <option value="off">No solicitar razonamiento</option>
          </select>
        </label>
        <label>Máximo de tokens generados
          <input type="number" min={50} max={2048} value={config.max_tokens}
            onChange={e => update('max_tokens', Number(e.target.value))}/>
        </label>
        <label>Ventana de contexto
          <select value={config.num_ctx} onChange={e => update('num_ctx', Number(e.target.value))}>
            {[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n.toLocaleString('es-CR')} tokens</option>)}
          </select>
        </label>
        <label>Dispositivo <span className="field-value">Ollama</span>
          <select aria-label="Dispositivo narrativo" disabled={config.provider !== 'ollama'} value={config.device}
            onChange={e => update('device', e.target.value as NarrativeConfig['device'])}>
            <option value="auto">Automático — usar GPU si existe</option>
            <option value="cpu">Solo CPU</option>
          </select>
        </label>
      </div>
      {config.provider === 'koboldcpp' && <p className="narrative-helper">
        KoboldCpp establece sus capas GPU desde el panel de runtime. Top-K, penalizaciones y razonamiento adicionales no están disponibles a través del adaptador actual.
      </p>}
      {config.provider === 'openrouter' && <p className="narrative-helper">Las solicitudes saldrán del equipo hacia OpenRouter y pueden generar costos. Guarda tu clave desde Configuración → Proveedores; visión y razonamiento específicos dependen del modelo remoto.</p>}
      {status && <div className={'narrative-connect ' + (status.online ? 'connected' : 'disconnected')}>
        <Cpu size={17}/>
        <span>{status.online ? 'Servidor disponible' : 'Sin conexión con el servidor'}
          {status.error ? ' — ' + status.error : ''}</span>
      </div>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {saved && <p className="narrative-saved" role="status"><CheckCircle2 size={16}/>{saved}</p>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={working}
          onClick={() => void persist(true)}>
          {working ? <LoaderCircle className="rotating" size={16}/> : <PlugZap size={16}/>}
          Guardar y probar conexión</button>
        <button className="primary-button" disabled={working}
          onClick={() => void persist(false)}><Save size={16}/> Guardar parámetros</button>
      </div>
      <p className="narrative-helper"><RefreshCw size={14}/> Los modelos instalados en Model Hub
        necesitan un runtime local para su ejecución. Ollama puede cargar su propio modelo al generar; KoboldCpp puede arrancarse desde Noble AI. OpenRouter usa su infraestructura remota.</p>
    </>}
  </section>;
}
