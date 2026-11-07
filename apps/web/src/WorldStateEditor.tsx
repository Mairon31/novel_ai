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

  if (loading) return <div className="loading">Cargando estado confirmado del mundo...</div>;
  if (!draft || !document) return <div role="alert" className="narrative-error">
    {error || 'No se pudo cargar el estado del mundo.'}
    <button className="secondary-button" onClick={() => void reload()}>
      <RotateCcw size={15}/> Reintentar</button>
  </div>;

  const canSave = draft.facts.every(fact =>
    fact.text.trim().length >= 10 && (fact.public || fact.witness_character_ids.length > 0));

  return <div className="creator-fields world-state-editor" aria-label="Estado del mundo">
    <div className="creator-section-intro">
      <h3>Estado confirmado del mundo</h3>
      <p>Explicitly update location, present characters, inventory, and facts. The narrator cannot silently promote assumptions into canon. Each turn stores a snapshot for restoring branches.</p>
      <small>Saved revision: {document.revision} · Changes are validated before saving</small>
    </div>

    {error && <p className="narrative-error" role="alert">{error}</p>}
    {notice && <p className="narrative-saved" role="status"><Check size={15}/>{notice}</p>}

    <section className="world-section">
      <h4>Scene situation</h4>
      <div className="creator-double">
        <label>Lugar actual
          <input aria-label="Lugar del mundo" maxLength={200} value={draft.location}
            placeholder="Puerto de las estrellas..."
            onChange={event => patch({ location: event.target.value })}/>
        </label>
        <label>Time of day
          <input aria-label="Momento del mundo" maxLength={80} value={draft.time_of_day}
            placeholder="Anochecer, madrugada..."
            onChange={event => patch({ time_of_day: event.target.value })}/>
        </label>
      </div>
      <label>Clima
        <input aria-label="Clima del mundo" maxLength={100} value={draft.weather}
          placeholder="Lluvia, despejado, tormenta..."
          onChange={event => patch({ weather: event.target.value })}/>
      </label>
      <label>Confirmed inventory (one item per line)
        <textarea aria-label="Inventario del mundo" rows={4} value={inventoryInput}
          onChange={event => { setInventoryInput(event.target.value); setNotice(''); }}
          placeholder="Llave de plata\nMapa antiguo"/>
      </label>
    </section>

    <section className="world-section">
      <h4><Users size={17}/> Personajes presentes</h4>
      <p>Solo los personajes marcados como presentes pueden activar hechos que presenciaron.
        Private text for an absent character is not sent to the narrator.</p>
      <div className="world-npc-grid">
        {characters.map(character => <label className="world-check" key={character.id}>
          <input type="checkbox" aria-label={'Presente ' + character.name}
            checked={draft.present_character_ids.includes(character.id)}
            onChange={event => patch({ present_character_ids: uniqueList(
              draft.present_character_ids, character.id, event.target.checked) })}/>
          <span>{character.name}</span>
        </label>)}
        {!characters.length && <p className="creator-hint">
          Create characters under Characters before assigning witnesses.</p>}
      </div>
      {!!characters.length && <div className="world-relations">
        <h4>Relaciones confirmadas</h4>
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
            }} placeholder="Aliado, desconfianza, rivalidad..."/>
        </label>)}
      </div>}
    </section>

    <section className="world-section">
      <h4>Indicadores persistentes</h4>
      <p>Guarda decisiones y condiciones observables, por ejemplo <code>puerta_abierta</code>.</p>
      {Object.entries(draft.flags).map(([name, value]) =>
        <div className="world-flag-row" key={name}>
          <label className="world-check">
            <input type="checkbox" aria-label={'Indicador ' + name}
              checked={value} onChange={event =>
                patch({ flags: {...draft.flags, [name]: event.target.checked } })}/>
            <span>{name}</span>
          </label>
          <button className="secondary-button" aria-label={'Eliminar indicador ' + name}
            onClick={() => {
              const flags = { ...draft.flags };
              delete flags[name];
              patch({ flags });
            }}><Trash2 size={14}/></button>
        </div>)}
      <div className="world-add-row">
        <input aria-label="Nombre de indicador nuevo" maxLength={70}
          value={flagName} onChange={event => setFlagName(event.target.value)}
          placeholder="puerta_abierta"/>
        <button className="secondary-button"
          disabled={!/^[\p{L}\p{N}_\-.]{1,70}$/u.test(flagName) ||
            Object.prototype.hasOwnProperty.call(draft.flags, flagName)}
          onClick={() => {
            patch({ flags: { ...draft.flags, [flagName]: false } });
            setFlagName('');
          }}><Plus size={15}/> Add flag</button>
      </div>
    </section>

    <section className="world-section">
      <h4><ShieldCheck size={17}/> Hechos y testigos</h4>
      <p>Public facts are general knowledge. Private facts enter the narrator's context only when a declared witness is present.</p>
      {draft.facts.map((fact, index) =>
        <div key={fact.id} className="world-fact">
          <div className="world-fact-title">
            <strong>Hecho {index + 1}</strong>
            <button className="secondary-button" aria-label={'Eliminar hecho ' + (index + 1)}
              onClick={() => patch({ facts: draft.facts.filter(item => item.id !== fact.id) })}>
              <Trash2 size={15}/>
            </button>
          </div>
          <label>Contenido confirmado
            <textarea aria-label={'Texto del hecho ' + (index + 1)} maxLength={360} rows={3}
              value={fact.text} onChange={event =>
                editFact(index, { text: event.target.value })}/>
          </label>
          <label className="world-check">
            <input type="checkbox" aria-label={'Public fact ' + (index + 1)}
              checked={fact.public}
              onChange={event => editFact(index, { public: event.target.checked })}/>
            <span>Public · everyone may know this</span>
          </label>
          {!fact.public && <div className="world-witnesses">
            <strong>Personajes que presenciaron este hecho</strong>
            {characters.map(character => <label className="world-check" key={character.id}>
              <input type="checkbox" aria-label={'Testigo ' + character.name + ' del hecho ' + (index + 1)}
                checked={fact.witness_character_ids.includes(character.id)}
                onChange={event => editFact(index, {
                  witness_character_ids: uniqueList(
                    fact.witness_character_ids, character.id, event.target.checked),
                })}/>
              <span>{character.name}</span>
            </label>)}
            {!characters.length && <p>Un hecho privado necesita personajes registrados.</p>}
          </div>}
        </div>)}
      <button className="secondary-button" disabled={draft.facts.length >= 120}
        onClick={() => patch({ facts: [...draft.facts, {
          id: crypto.randomUUID(), text: '', public: true, witness_character_ids: [],
        }] })}><Plus size={16}/> Add fact</button>
    </section>

    <div className="creator-actions">
      <button className="primary-button" disabled={busy || !canSave}
        onClick={() => void save()}><Save size={16}/>
        {busy ? 'Guardando...' : 'Save estado del mundo'}</button>
      <button className="secondary-button" disabled={busy}
        onClick={() => void reload()}><RotateCcw size={16}/> Recargar desde disco</button>
    </div>
    {!canSave && <p className="creator-hint">
      Revisa los hechos: cada uno necesita al menos 10 caracteres y, si es privado,
      one or more witnesses.</p>}

    <details className="world-history">
      <summary><History size={16}/> Turn snapshot history</summary>
      <p>Selecciona un turno para consultar su estado original, incluso si la historia
        has since changed. Turns before this feature may not have snapshots.</p>
      <div className="world-add-row">
        <select aria-label="Historical world turn" value={turnId}
          onChange={event => { setTurnId(event.target.value); setSnapshot(null); }}>
          <option value="">Seleccionar turno</option>
          {turns.map((turn, index) =>
            <option key={turn.id} value={turn.id}>Turno {index + 1}: {turn.input_text.slice(0, 65)}</option>)}
        </select>
        <button className="secondary-button" disabled={busy || !turnId}
          onClick={() => void inspectSnapshot()}><BookOpen size={16}/> View snapshot</button>
      </div>
      {snapshot && <div className="world-snapshot" role="status">
        <strong>Estado registrado en ese turno</strong>
        <span>Lugar: {snapshot.state.location || 'No definido'}</span>
        <span>Momento: {snapshot.state.time_of_day || 'No definido'}</span>
        <span>Clima: {snapshot.state.weather || 'No definido'}</span>
        <span>Objetos: {snapshot.state.inventory.join(', ') || 'Ninguno'}</span>
        <span>Hechos registrados: {snapshot.state.facts.length}</span>
        <span>Canon de ese turno: {snapshot.canon || 'Sin canon confirmado'}</span>
      </div>}
    </details>
  </div>;
}
