import { useTranslation } from 'react-i18next';
import { formatUiNumber } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Cpu, LoaderCircle, PlugZap, RefreshCw, Save } from 'lucide-react';
import { api } from './api';
import type { NarrativeConfig, ProviderModels, ContextPreview, Story } from './types';

const defaultConfig: NarrativeConfig = {
  provider: 'ollama', base_url: 'http://127.0.0.1:11434', model: '',
  temperature: 0.7, top_p: 0.9, max_tokens: 450, num_ctx: 4096, device: 'auto',
  top_k: 40, repetition_penalty: 1.0, reasoning_mode: 'auto', worker_id: '',
};

export function NarrativeSettings() {
  const { t, i18n } = useTranslation();
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
  const [inspectText, setInspectText] = useState(t('narrativeUi.inspectSample'));
  const previousSample = useRef(t('narrativeUi.inspectSample'));
  const [inspecting, setInspecting] = useState(false);
  const [inspectorData, setInspectorData] = useState<ContextPreview | null>(null);
  const [inspectorError, setInspectorError] = useState('');

  // Keep untouched example copy in the chosen UI language without replacing edits.
  useEffect(() => {
    const nextSample = t('narrativeUi.inspectSample');
    const previous = previousSample.current;
    if (nextSample !== previous && inspectText === previous) {
      setInspectText(nextSample);
      setInspectorData(null);
    }
    previousSample.current = nextSample;
  }, [i18n.language, t]);

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
        setSaved(t(info.online ? 'narrative.connectionVerified' : 'narrative.connectionPending'));
      } else {
        setSaved(t('narrative.parametersSaved'));
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
      setSaved(t('narrative.modelPrepared', {
        model: result.model, seconds: formatUiNumber(result.duration_ms / 1000, 1),
      }));
    } catch (exc) { setError((exc as Error).message); }
    finally {
      window.clearInterval(ticker); setPreparing(false); setWorking(false);
    }
  }

  return <section className="narrative-settings" aria-labelledby="narrative-settings-heading">
    <div className="narrative-section-title">
      <span className="setting-icon"><BookOpen size={22}/></span>
      <div><h2 id="narrative-settings-heading">{t('narrative.title')}</h2>
        <p>{t('narrative.description')}</p></div>
    </div>
    {loading ? <div className="loading"><LoaderCircle className="rotating" size={18}/> {t('image.loading')}</div> : <>
      <div className="narrative-settings-grid">
        <label>{t('narrative.provider')}
          <select value={config.provider} onChange={e => {
            const provider = e.target.value as NarrativeConfig['provider'];
            setStatus(null);
            setConfig(current => ({ ...current, provider, device: 'auto',
              base_url: provider === 'ollama' ? 'http://127.0.0.1:11434' : provider === 'koboldcpp' ? 'http://127.0.0.1:5001' : 'https://openrouter.ai/api/v1', worker_id: '', model: '' }));
          }}>
            <option value="ollama">{t('narrative.ollamaLabel')}</option>
            <option value="koboldcpp">{t('narrative.koboldLabel')}</option>
            <option value="openrouter">{t('narrative.openRouterLabel')}</option>
            <option value="worker" disabled={!config.worker_id}>{t('narrative.workerLabel')}</option>
          </select>
        </label>
        <label>{t('narrative.address')}
          <input aria-label={t('uiField.narrativeSettings.lLMServerAddress')} value={config.base_url}
            readOnly={config.provider === "openrouter" || config.provider === "worker"}
            onChange={e => update('base_url', e.target.value)} spellCheck={false}/>
        </label>
        <label className="settings-span">{t('narrative.model')}
          <input list="noble-local-models" value={config.model} placeholder={t('uiField.narrativeSettings.connectAndChooseAModel')}
            aria-label={t('uiField.narrativeSettings.runtimeNarratorModel')} onChange={e => update('model', e.target.value)}/>
          <datalist id="noble-local-models">
            {status?.models.map(item => <option key={item} value={item}/>)}
          </datalist>
          {status?.online && <small>{t('narrative.modelsFound', { count: status.models.length })}</small>}
        </label>
        <label>{t('narrative.temperature')} <span className="field-value">{formatUiNumber(config.temperature, 2)}</span>
          <input type="range" min={0} max={2} step={0.05} value={config.temperature}
            onChange={e => update('temperature', Number(e.target.value))}/>
        </label>
        <label>{t('narrative.topP')} <span className="field-value">{formatUiNumber(config.top_p, 2)}</span>
          <input type="range" min={0.05} max={1} step={0.05} value={config.top_p}
            onChange={e => update('top_p', Number(e.target.value))}/>
        </label>
        <label>{t('narrative.topK')} <span className="field-value">{config.top_k}</span>
          <input type="range" min={0} max={200} step={5} value={config.top_k}
            disabled={config.provider === 'koboldcpp' || config.provider === 'worker'}
            onChange={e => update('top_k', Number(e.target.value))}/>
        </label>
        <label>{t('narrative.repetition')} <span className="field-value">{formatUiNumber(config.repetition_penalty, 2)}</span>
          <input type="range" min={0.5} max={2} step={0.05} value={config.repetition_penalty}
            disabled={config.provider === 'koboldcpp'}
            onChange={e => update('repetition_penalty', Number(e.target.value))}/>
        </label>
        <label>{t('narrative.reasoning')}
          <select aria-label={t('uiField.narrativeSettings.narratorReasoning')} value={config.reasoning_mode}
            disabled={config.provider !== 'ollama'}
            onChange={e => update('reasoning_mode', e.target.value as NarrativeConfig['reasoning_mode'])}>
            <option value="auto">{t('narrative.automaticReasoning')}</option>
            <option value="off">{t('narrative.noReasoning')}</option>
          </select>
        </label>
        <label>{t('narrative.maxTokens')}
          <input type="number" min={50} max={2048} value={config.max_tokens}
            onChange={e => update('max_tokens', Number(e.target.value))}/>
        </label>
        <label>{t('narrative.context')}
          <select value={config.num_ctx} onChange={e => update('num_ctx', Number(e.target.value))}>
            {[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n.toLocaleString(i18n.language)} tokens</option>)}
          </select>
        </label>
        <label>{t('narrative.device')} <span className="field-value">Ollama</span>
          <select aria-label={t('uiField.narrativeSettings.narratorDevice')} disabled={config.provider !== 'ollama'} value={config.device}
            onChange={e => update('device', e.target.value as NarrativeConfig['device'])}>
            <option value="auto">{t('narrative.autoGpu')}</option>
            <option value="cpu">{t('narrative.cpuOnly')}</option>
          </select>
        </label>
      </div>
      {config.provider === 'koboldcpp' && <p className="narrative-helper">
        {t('narrative.koboldHint')}
      </p>}
      {config.provider === 'openrouter' && <p className="narrative-helper">{t('narrative.openRouterHint')}</p>}
      {config.provider === 'worker' && <p className="narrative-helper">{t('narrative.workerHint')}</p>}
      {status && <div className={'narrative-connect ' + (status.online ? 'connected' : 'disconnected')}>
        <Cpu size={17}/>
        <span>{t(status.online ? 'narrative.serverAvailable' : 'narrative.serverUnavailable')}
          {status.error ? ' — ' + status.error : ''}</span>
      </div>}
      {error && <p className="narrative-error" role="alert">{error}</p>}
      {saved && <p className="narrative-saved" role="status"><CheckCircle2 size={16}/>{saved}</p>}
      <div className="settings-buttons">
        <button className="secondary-button" disabled={working}
          onClick={() => void persist(true)}>
          {working ? <LoaderCircle className="rotating" size={16}/> : <PlugZap size={16}/>}
          {t('narrative.saveAndTest')}</button>
        <button className="primary-button" disabled={working}
          onClick={() => void persist(false)}><Save size={16}/> {t('narrative.saveParameters')}</button>
        <button className="secondary-button"
          disabled={working || !config.model || config.provider === 'openrouter'}
          onClick={() => void prepare()}>
          {preparing ? <LoaderCircle size={16} className="rotating"/> : <Cpu size={16}/>}
          {preparing ? t('narrative.preparing', { seconds: prepareElapsed }) : t('narrative.prepareModel')}
        </button>
      </div>
      <p className="narrative-helper">{t('narrative.prepareHint')}</p>
      <p className="narrative-helper"><RefreshCw size={14}/> {t('narrative.runtimeHint')}</p>
      <section className="narrative-context-inspector" aria-label={t('narrative.inspect')}>
        <h3>{t('narrative.inspect')}</h3>
        <p className="narrative-helper">{t('narrative.inspectorHint')}</p>
        {stories.length ? <>
          <div className="narrative-settings-grid">
            <label>{t('narrative.storyToInspect')}
              <select aria-label={t('narrative.storyToInspect')} value={inspectStory}
                onChange={e => { setInspectStory(e.target.value); setInspectorData(null); }}>
                {stories.map(story => <option value={story.id} key={story.id}>{story.title}</option>)}
              </select>
            </label>
            <label>{t('narrative.inputMode')}
              <select aria-label={t('a11y.inspectMode')} value={inspectMode}
                onChange={e => { setInspectMode(e.target.value as typeof inspectMode); setInspectorData(null); }}>
                <option value="do">{t('narrative.action')}</option>
                <option value="say">{t('narrative.dialogue')}</option>
                <option value="story">{t('narrative.direction')}</option>
                <option value="continue">{t('narrative.continue')}</option>
              </select>
            </label>
          </div>
          <label>{t('narrative.sampleInput')}
            <textarea aria-label={t('a11y.inspectInput')}
              rows={2} maxLength={3000} value={inspectText}
              onChange={e => { setInspectText(e.target.value); setInspectorData(null); }}/>
          </label>
          <div className="settings-buttons">
            <button className="secondary-button"
              disabled={inspecting || (inspectMode !== 'continue' && !inspectText.trim())}
              onClick={() => void inspectContext()}>
              {inspecting ? <LoaderCircle size={16} className="rotating"/> : <BookOpen size={16}/>}
              {t('narrativeUi.inspectContext')}
            </button>
          </div>
          {inspectorError && <p role="alert" className="narrative-error">{inspectorError}</p>}
          {inspectorData && <div role="status" className="creator-hint">
            <strong>{t('narrative.estimatedBudget')}</strong>
            <p>{t('narrative.estimatedTokens', { input: inspectorData.estimated_prompt_tokens,
              output: inspectorData.reserved_output_tokens, windowTokens: inspectorData.context_window_tokens })}</p>
            {inspectorData.estimated_overflow && <p role="alert">
              {t('narrative.overflow')}
            </p>}
            <p>{t('narrative.tokensHint')}</p>
            <details>
              <summary>{t('narrative.sectionBreakdown')}</summary>
              <ul>{inspectorData.sections.map((block, i) => <li key={i}>
                {block.name}: {t('narrative.sectionStats', { characters: block.characters, tokens: block.approx_tokens })}
              </li>)}</ul>
            </details>
            <details>
              <summary>{t('narrative.allMessages')}</summary>
              {inspectorData.messages.map((message, i) => <div key={i}>
                <strong>{i + 1}. {message.role}</strong>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {message.content}
                </pre>
              </div>)}
            </details>
          </div>}
        </> : <p className="narrative-helper">{t('narrative.createToInspect')}</p>}
      </section>
    </>}
  </section>;
}
