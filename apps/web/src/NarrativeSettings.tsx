import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Cpu, LoaderCircle, PlugZap, RefreshCw, Save } from 'lucide-react';
import { api } from './api';
import type { NarrativeConfig, ProviderModels, ContextPreview, Story } from './types';

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
  const [preparing, setPreparing] = useState(false);
  const [prepareElapsed, setPrepareElapsed] = useState(0);
  const [error, setError] = useState('');
  const [stories, setStories] = useState<Story[]>([]);
  const [inspectStory, setInspectStory] = useState('');
  const [inspectMode, setInspectMode] = useState<'do'|'say'|'story'|'continue'>('do');
  const [inspectText, setInspectText] = useState('I observe the scene.');
  const [inspecting, setInspecting] = useState(false);
  const [inspectorData, setInspectorData] = useState<ContextPreview | null>(null);
  const [inspectorError, setInspectorError] = useState('');

  useEffect(() => {
    let alive = true;
    api.narrativeConfig().then(value => {
      if (alive) setConfig(value);
    }).catch((exc: Error) => { if (alive) setError(exc.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void api.stories().then(value => {
      if (!alive) return;
      setStories(value.stories);
      setInspectStory(current => current || value.stories[0]?.id || '');
    }).catch(() => { /* Context inspector is optional when stories cannot load. */ });
    return () => { alive = false; };
  }, []);

  async function inspectContext() {
    if (!inspectStory || inspecting) return;
    setInspecting(true);
    setInspectorError('');
    setInspectorData(null);
    try {
      setInspectorData(await api.inspectStoryContext(
        inspectStory, inspectText, inspectMode));
    } catch (exc) { setInspectorError((exc as Error).message); }
    finally { setInspecting(false); }
  }

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
        setSaved(info.online ? 'Local connection verified.' :
          'Settings saved; the engine is not responding yet.');
      } else {
        setSaved('Narrative parameters saved.');
      }
    } catch (exc) {
      setError((exc as Error).message);
    } finally { setWorking(false); }
  }

  async function prepare() {
    setWorking(true); setPreparing(true); setPrepareElapsed(0);
    setSaved(''); setError('');
    const start = Date.now();
    const ticker = window.setInterval(() => setPrepareElapsed(
      Math.floor((Date.now() - start) / 1000)), 1000);
    try {
      await api.saveNarrativeConfig(config);
      const result = await api.prepareNarrator();
      setSaved('Model prepared: ' + result.model + ' · ' +
        (result.duration_ms / 1000).toFixed(1) + ' s. You can begin your story.');
    } catch (exc) { setError((exc as Error).message); }
    finally {
      window.clearInterval(ticker); setPreparing(false); setWorking(false);
    }
  }

  return <section className="narrative-settings" aria-labelledby="narrative-settings-heading">
    <div className="narrative-section-title">
      <span className="setting-icon"><BookOpen size={22}/></span>
      <div><h2 id="narrative-settings-heading">Narrative engine</h2>
        <p>Choose a local runtime, OpenRouter, or an authenticated GPU worker. Configure only parameters supported by the provider.</p></div>
    </div>
    {loading ? <div className="loading"><LoaderCircle className="rotating" size={18}/> Loading settings...</div> : <>
      <div className="narrative-settings-grid">
        <label>Provider
          <select value={config.provider} onChange={e => {
            const provider = e.target.value as NarrativeConfig['provider'];
            setStatus(null);
            setConfig(current => ({ ...current, provider, device: 'auto',
              base_url: provider === 'ollama' ? 'http://127.0.0.1:11434' : provider === 'koboldcpp' ? 'http://127.0.0.1:5001' : 'https://openrouter.ai/api/v1', worker_id: '', model: '' }));
          }}>
            <option value="ollama">Ollama (API local)</option>
            <option value="koboldcpp">KoboldCpp (API compatible)</option>
            <option value="openrouter">OpenRouter (modelos por API)</option>
            <option value="worker" disabled={!config.worker_id}>Worker GPU remoto (Red y workers)</option>
          </select>
        </label>
        <label>Provider address
          <input aria-label="LLM server address" value={config.base_url}
            readOnly={config.provider === "openrouter" || config.provider === "worker"}
            onChange={e => update('base_url', e.target.value)} spellCheck={false}/>
        </label>
        <label className="settings-span">Runtime model
          <input list="noble-local-models" value={config.model} placeholder="Connect and choose a model"
            aria-label="Runtime narrator model" onChange={e => update('model', e.target.value)}/>
          <datalist id="noble-local-models">
            {status?.models.map(item => <option key={item} value={item}/>)}
          </datalist>
          {status?.online && <small>Models found: {status.models.length}. Enter or select a model from the local catalog.</small>}
        </label>
        <label>Temperature <span className="field-value">{config.temperature.toFixed(2)}</span>
          <input type="range" min={0} max={2} step={0.05} value={config.temperature}
            onChange={e => update('temperature', Number(e.target.value))}/>
        </label>
        <label>Top-P <span className="field-value">{config.top_p.toFixed(2)}</span>
          <input type="range" min={0.05} max={1} step={0.05} value={config.top_p}
            onChange={e => update('top_p', Number(e.target.value))}/>
        </label>
        <label>Top-K <span className="field-value">{config.top_k}</span>
          <input type="range" min={0} max={200} step={5} value={config.top_k}
            disabled={config.provider === 'koboldcpp' || config.provider === 'worker'}
            onChange={e => update('top_k', Number(e.target.value))}/>
        </label>
        <label>Repetition penalty <span className="field-value">{config.repetition_penalty.toFixed(2)}</span>
          <input type="range" min={0.5} max={2} step={0.05} value={config.repetition_penalty}
            disabled={config.provider === 'koboldcpp'}
            onChange={e => update('repetition_penalty', Number(e.target.value))}/>
        </label>
        <label>Reasoning
          <select aria-label="Narrator reasoning" value={config.reasoning_mode}
            disabled={config.provider !== 'ollama'}
            onChange={e => update('reasoning_mode', e.target.value as NarrativeConfig['reasoning_mode'])}>
            <option value="auto">Automatic / model defaults</option>
            <option value="off">No solicitar razonamiento</option>
          </select>
        </label>
        <label>Maximum generated tokens
          <input type="number" min={50} max={2048} value={config.max_tokens}
            onChange={e => update('max_tokens', Number(e.target.value))}/>
        </label>
        <label>Context window
          <select value={config.num_ctx} onChange={e => update('num_ctx', Number(e.target.value))}>
            {[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n.toLocaleString('es-CR')} tokens</option>)}
          </select>
        </label>
        <label>Device <span className="field-value">Ollama</span>
          <select aria-label="Narrator device" disabled={config.provider !== 'ollama'} value={config.device}
            onChange={e => update('device', e.target.value as NarrativeConfig['device'])}>
            <option value="auto">Automatic — use GPU if available</option>
            <option value="cpu">CPU only</option>
          </select>
        </label>
      </div>
      {config.provider === 'koboldcpp' && <p className="narrative-helper">
        KoboldCpp GPU layers are configured in Runtime settings. Additional Top-K, penalties, and reasoning settings are not exposed by the current adapter.
      </p>}
      {config.provider === 'openrouter' && <p className="narrative-helper">Requests go to OpenRouter and may incur charges. Save your key under Settings → Providers; vision and reasoning depend on the remote model.</p>}
      {config.provider === 'worker' && <p className="narrative-helper">This model was activated under Network & Workers. The remote server manages its hardware; Noble AI sends only the authenticated narrative request.</p>}
      {status && <div className={'narrative-connect ' + (status.online ? 'connected' : 'disconnected')}>
        <Cpu size={17}/>
        <span>{status.online ? 'Server available' : 'Cannot connect to the server'}
          {status.error ? ' — ' + status.error : ''}</span>
      </div>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {saved && <p className="narrative-saved" role="status"><CheckCircle2 size={16}/>{saved}</p>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={working}
          onClick={() => void persist(true)}>
          {working ? <LoaderCircle className="rotating" size={16}/> : <PlugZap size={16}/>}
          Save and test connection</button>
        <button className="primary-button" disabled={working}
          onClick={() => void persist(false)}><Save size={16}/> Save parameters</button>
        <button className="secondary-button"
          disabled={working || !config.model || config.provider === 'openrouter'}
          onClick={() => void prepare()}>
          {preparing ? <LoaderCircle size={16} className="rotating"/> : <Cpu size={16}/>}
          {preparing ? 'Preparing model… ' + prepareElapsed + ' s' : 'Prepare model now'}
        </button>
      </div>
      <p className="narrative-helper">“Prepare model now” runs a short inference only when you press the button; it does not add a turn to story history. The first load may take longer. This does not apply to remote OpenRouter APIs.</p>
      <p className="narrative-helper"><RefreshCw size={14}/> Models installed from Model Hub need a local runtime. Ollama can load a model on generation, while KoboldCpp can be started from Noble AI. OpenRouter runs remotely, and workers use an authenticated external GPU.</p>
      <section className="narrative-context-inspector" aria-label="Narrative context inspector">
        <h3>Narrative context inspector</h3>
        <p className="narrative-helper">Inspect the exact messages prepared for the provider before generation. It includes private Creator context: use it only to inspect your own stories. It neither runs models nor saves turns.</p>
        {stories.length ? <>
          <div className="narrative-settings-grid">
            <label>Story to inspect
              <select aria-label="Story to inspect" value={inspectStory}
                onChange={e => { setInspectStory(e.target.value); setInspectorData(null); }}>
                {stories.map(story => <option value={story.id} key={story.id}>{story.title}</option>)}
              </select>
            </label>
            <label>Input mode
              <select aria-label="Mode to inspect" value={inspectMode}
                onChange={e => { setInspectMode(e.target.value as typeof inspectMode); setInspectorData(null); }}>
                <option value="do">Action</option>
                <option value="say">Dialogue</option>
                <option value="story">Direction</option>
                <option value="continue">Continue</option>
              </select>
            </label>
          </div>
          <label>Sample input
            <textarea aria-label="Input to inspect"
              rows={2} maxLength={3000} value={inspectText}
              onChange={e => { setInspectText(e.target.value); setInspectorData(null); }}/>
          </label>
          <div className="settings-buttons">
            <button className="secondary-button"
              disabled={inspecting || (inspectMode !== 'continue' && !inspectText.trim())}
              onClick={() => void inspectContext()}>
              {inspecting ? <LoaderCircle size={16} className="rotating"/> : <BookOpen size={16}/>}
              Inspect context
            </button>
          </div>
          {inspectorError && <p role="alert" className="narrative-error">{inspectorError}</p>}
          {inspectorData && <div role="status" className="creator-hint">
            <strong>Estimated prompt budget</strong>
            <p>{inspectorData.estimated_prompt_tokens} estimated input tokens + {inspectorData.reserved_output_tokens} reserved output tokens / {inspectorData.context_window_tokens} configured context-window tokens.</p>
            {inspectorData.estimated_overflow && <p role="alert">
              Posible desbordamiento: entrada + salida estimadas superan la ventana.
            </p>}
            <p>Los tokens se estiman por caracteres, no mediante el tokenizador
              of the model. KV cache is not measured and the supported length is not guaranteed
              por el proveedor.</p>
            <details>
              <summary>View section breakdown</summary>
              <ul>{inspectorData.sections.map((block, i) => <li key={i}>
                {block.name}: {block.characters} caracteres · ~{block.approx_tokens} tokens
              </li>)}</ul>
            </details>
            <details>
              <summary>View all messages sent to the engine</summary>
              {inspectorData.messages.map((message, i) => <div key={i}>
                <strong>{i + 1}. {message.role}</strong>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {message.content}
                </pre>
              </div>)}
            </details>
          </div>}
        </> : <p className="narrative-helper">Create a story to inspect
          su contexto narrativo.</p>}
      </section>
    </>}
  </section>;
}
