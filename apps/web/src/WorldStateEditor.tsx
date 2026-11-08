import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { BookOpen, Check, History, Plus, RotateCcw, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from './api';
import type {
  CreatorCharacter, StoryTurn, WorldFact, WorldStateData, WorldStateDocument,
  WorldTurnSnapshot,
} from './types';

interface Props {
  storyId: string;
  characters: CreatorCharacter[];
}

function uniqueList(list: string[], item: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...list, item])] : list.filter(value => value !== item);
}

export function WorldStateEditor({ storyId, characters }: Props) {
  const { t } = useTranslation();
  const [document, setDocument] = useState<WorldStateDocument | null>(null);
  const [draft, setDraft] = useState<WorldStateData | null>(null);
  const [inventoryInput, setInventoryInput] = useState('');
  const [flagName, setFlagName] = useState('');
  const [turns, setTurns] = useState<StoryTurn[]>([]);
  const [turnId, setTurnId] = useState('');
  const [snapshot, setSnapshot] = useState<WorldTurnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [world, storyTurns] = await Promise.all([
      api.worldState(storyId), api.storyTurns(storyId),
    ]);
    setDocument(world);
    setDraft(world.state);
    setInventoryInput(world.state.inventory.join('\n'));
    setTurns(storyTurns.turns);
    setSnapshot(null);
    setTurnId('');
  }

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setNotice(''); setDocument(null);
    setDraft(null); setSnapshot(null); setFlagName('');
    void Promise.all([api.worldState(storyId), api.storyTurns(storyId)])
      .then(([world, storyTurns]) => {
        if (!alive) return;
        setDocument(world);
        setDraft(world.state);
        setInventoryInput(world.state.inventory.join('\n'));
        setTurns(storyTurns.turns);
      })
      .catch((cause: Error) => { if (alive) setError(cause.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storyId]);

  function patch(changes: Partial<WorldStateData>) {
    setDraft(previous => previous ? { ...previous, ...changes } : previous);
    setNotice('');
  }

  function editFact(index: number, changes: Partial<WorldFact>) {
    if (!draft) return;
    patch({ facts: draft.facts.map((fact, i) =>
      i === index ? { ...fact, ...changes } : fact) });
  }

  async function save() {
    if (!draft || !document || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const state = {
        ...draft,
        inventory: inventoryInput.split('\n').map(item => item.trim()).filter(Boolean),
      };
      const result = await api.saveWorldState(storyId, document.revision, state);
      setDocument(result);
      setDraft(result.state);
      setInventoryInput(result.state.inventory.join('\n'));
      setNotice('State confirmed. The next turn will snapshot these values.');
    } catch (cause) {
      setError((cause as Error).message +
        ' If this was edited in another tab, reload before saving.');
    } finally { setBusy(false); }
  }

  async function reload() {
    if (busy) return;
    setLoading(true); setError(''); setNotice('');
    try { await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }

  async function inspectSnapshot() {
    if (!turnId || busy) return;
    setBusy(true); setError(''); setSnapshot(null);
    try { setSnapshot(await api.worldTurnSnapshot(storyId, turnId)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">{t('world.loading')}</div>;
  if (!draft || !document) return <div role="alert" className="narrative-error">
    {error || 'Could not load world state.'}
    <button className="secondary-button" onClick={() => void reload()}>
      <RotateCcw size={15}/> Retry</button>
  </div>;

  const canSave = draft.facts.every(fact =>
    fact.text.trim().length >= 10 && (fact.public || fact.witness_character_ids.length > 0));

  return <div className="creator-fields world-state-editor" aria-label="World state">
    <div className="creator-section-intro">
      <h3>{t('world.title')}</h3>
      <p>Explicitly update location, present characters, inventory, and facts. The narrator cannot silently promote assumptions into canon. Each turn stores a snapshot for restoring branches.</p>
      <small>Saved revision: {document.revision} · Changes are validated before saving</small>
    </div>

    {error && <p className="narrative-error" role="alert">{error}</p>}
    {notice && <p className="narrative-saved" role="status"><Check size={15}/>{notice}</p>}

    <section className="world-section">
      <h4>{t('world.sceneSituation')}</h4>
      <div className="creator-double">
        <label>{t('world.location')}
          <input aria-label="World location" maxLength={200} value={draft.location}
            placeholder="Star Harbor..."
            onChange={event => patch({ location: event.target.value })}/>
        </label>
        <label>{t('world.time')}
          <input aria-label="World time of day" maxLength={80} value={draft.time_of_day}
            placeholder="Anochecer, madrugada..."
            onChange={event => patch({ time_of_day: event.target.value })}/>
        </label>
      </div>
      <label>{t('world.weather')}
        <input aria-label="World weather" maxLength={100} value={draft.weather}
          placeholder="Lluvia, despejado, tormenta..."
          onChange={event => patch({ weather: event.target.value })}/>
      </label>
      <label>{t('world.inventory')}
        <textarea aria-label="World inventory" rows={4} value={inventoryInput}
          onChange={event => { setInventoryInput(event.target.value); setNotice(''); }}
          placeholder="Silver key\nOld map"/>
      </label>
    </section>

    <section className="world-section">
      <h4><Users size={17}/> {t('world.presentCharacters')}</h4>
      <p>{t('world.witnessHint')}</p>
      <div className="world-npc-grid">
        {characters.map(character => <label className="world-check" key={character.id}>
          <input type="checkbox" aria-label={'Present ' + character.name}
            checked={draft.present_character_ids.includes(character.id)}
            onChange={event => patch({ present_character_ids: uniqueList(
              draft.present_character_ids, character.id, event.target.checked) })}/>
          <span>{character.name}</span>
        </label>)}
        {!characters.length && <p className="creator-hint">
          {t('world.createCharacters')}</p>}
      </div>
      {!!characters.length && <div className="world-relations">
        <h4>{t('world.relationships')}</h4>
        {characters.map(character => <label key={character.id}>
          Relationship of {character.name} with the protagonist
          <input aria-label={'Relationship with ' + character.name} maxLength={160}
            value={draft.relationships[character.id] || ''}
            onChange={event => {
              const relationships = { ...draft.relationships };
              const value = event.target.value;
              if (value) relationships[character.id] = value;
              else delete relationships[character.id];
              patch({ relationships });
            }} placeholder="Ally, distrust, rivalry..."/>
        </label>)}
      </div>}
    </section>

    <section className="world-section">
      <h4>{t('world.flags')}</h4>
      <p>{t('world.flagsHint')} <code>door_open</code>.</p>
      {Object.entries(draft.flags).map(([name, value]) =>
        <div className="world-flag-row" key={name}>
          <label className="world-check">
            <input type="checkbox" aria-label={'Flag ' + name}
              checked={value} onChange={event =>
                patch({ flags: {...draft.flags, [name]: event.target.checked } })}/>
            <span>{name}</span>
          </label>
          <button className="secondary-button" aria-label={'Delete flag ' + name}
            onClick={() => {
              const flags = { ...draft.flags };
              delete flags[name];
              patch({ flags });
            }}><Trash2 size={14}/></button>
        </div>)}
      <div className="world-add-row">
        <input aria-label="New flag name" maxLength={70}
          value={flagName} onChange={event => setFlagName(event.target.value)}
          placeholder="door_open"/>
        <button className="secondary-button"
          disabled={!/^[\p{L}\p{N}_\-.]{1,70}$/u.test(flagName) ||
            Object.prototype.hasOwnProperty.call(draft.flags, flagName)}
          onClick={() => {
            patch({ flags: { ...draft.flags, [flagName]: false } });
            setFlagName('');
          }}><Plus size={15}/> {t('world.addFlag')}</button>
      </div>
    </section>

    <section className="world-section">
      <h4><ShieldCheck size={17}/> {t('world.facts')}</h4>
      <p>{t('world.factsHint')}</p>
      {draft.facts.map((fact, index) =>
        <div key={fact.id} className="world-fact">
          <div className="world-fact-title">
            <strong>Fact {index + 1}</strong>
            <button className="secondary-button" aria-label={'Delete fact ' + (index + 1)}
              onClick={() => patch({ facts: draft.facts.filter(item => item.id !== fact.id) })}>
              <Trash2 size={15}/>
            </button>
          </div>
          <label>{t('world.confirmedContent')}
            <textarea aria-label={'Fact text ' + (index + 1)} maxLength={360} rows={3}
              value={fact.text} onChange={event =>
                editFact(index, { text: event.target.value })}/>
          </label>
          <label className="world-check">
            <input type="checkbox" aria-label={'Public fact ' + (index + 1)}
              checked={fact.public}
              onChange={event => editFact(index, { public: event.target.checked })}/>
            <span>{t('world.publicFact')}</span>
          </label>
          {!fact.public && <div className="world-witnesses">
            <strong>{t('world.factWitnesses')}</strong>
            {characters.map(character => <label className="world-check" key={character.id}>
              <input type="checkbox" aria-label={'Witness ' + character.name + ' for fact ' + (index + 1)}
                checked={fact.witness_character_ids.includes(character.id)}
                onChange={event => editFact(index, {
                  witness_character_ids: uniqueList(
                    fact.witness_character_ids, character.id, event.target.checked),
                })}/>
              <span>{character.name}</span>
            </label>)}
            {!characters.length && <p>{t('world.privateFactHint')}</p>}
          </div>}
        </div>)}
      <button className="secondary-button" disabled={draft.facts.length >= 120}
        onClick={() => patch({ facts: [...draft.facts, {
          id: crypto.randomUUID(), text: '', public: true, witness_character_ids: [],
        }] })}><Plus size={16}/> {t('world.addFact')}</button>
    </section>

    <div className="creator-actions">
      <button className="primary-button" disabled={busy || !canSave}
        onClick={() => void save()}><Save size={16}/>
        {busy ? 'Saving...' : 'Save world state'}</button>
      <button className="secondary-button" disabled={busy}
        onClick={() => void reload()}><RotateCcw size={16}/> {t('world.reload')}</button>
    </div>
    {!canSave && <p className="creator-hint">
      {t('world.reviewFacts')}</p>}

    <details className="world-history">
      <summary><History size={16}/> {t('world.turnSnapshots')}</summary>
      <p>{t('world.snapshotHint')}</p>
      <div className="world-add-row">
        <select aria-label="Historical world turn" value={turnId}
          onChange={event => { setTurnId(event.target.value); setSnapshot(null); }}>
          <option value="">{t('world.selectTurn')}</option>
          {turns.map((turn, index) =>
            <option key={turn.id} value={turn.id}>Turn {index + 1}: {turn.input_text.slice(0, 65)}</option>)}
        </select>
        <button className="secondary-button" disabled={busy || !turnId}
          onClick={() => void inspectSnapshot()}><BookOpen size={16}/> {t('world.viewSnapshot')}</button>
      </div>
      {snapshot && <div className="world-snapshot" role="status">
        <strong>{t('world.snapshotState')}</strong>
        <span>Location: {snapshot.state.location || 'Not defined'}</span>
        <span>Time: {snapshot.state.time_of_day || 'Not defined'}</span>
        <span>Weather: {snapshot.state.weather || 'Not defined'}</span>
        <span>Items: {snapshot.state.inventory.join(', ') || 'None'}</span>
        <span>Recorded facts: {snapshot.state.facts.length}</span>
        <span>Canon at that turn: {snapshot.canon || 'No confirmed canon'}</span>
      </div>}
    </details>
  </div>;
}
