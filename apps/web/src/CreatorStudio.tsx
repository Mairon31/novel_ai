import { useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, ChevronRight, Feather, FileText, LoaderCircle,
  Plus, Save, Sparkles, UserRound, Users, Image as ImageIcon, UploadCloud, Trash2, X, BookKey, Globe2,
} from 'lucide-react';
import { api } from './api';
import { WorldStateEditor } from './WorldStateEditor';
import type {
  Story, CreatorBlueprint, CreatorBlueprintDraft, CreatorCharacter,
  CreatorCharacterDraft, CreatorMediaAsset, SpriteExpression, LorebookEntry, LorebookEntryDraft, LorebookPreview,
} from './types';

type Section = 'story' | 'cast' | 'lorebook' | 'world' | 'openings' | 'media';

const blankBlueprint: CreatorBlueprintDraft = {
  synopsis: '', player_plot: '', ai_plot: '', guidelines: '', reminder: '',
  opening_scenarios: [], genre: '', tags: [], language: 'es-419',
};
const blankCharacter: CreatorCharacterDraft = {
  name: '', description: '', personality: '', dialogue_examples: '',
  visual_character_id: null, voice_id: '',
};

const blankLorebook: LorebookEntryDraft = {
  title: '', content: '', keys: [], secondary_keys: [], secondary_mode: 'any',
  match_whole_words: true, priority: 50, enabled: true, always_active: false,
  visibility: 'world', witness_character_ids: [],
};

interface Props {
  onOpenLibrary: () => void;
  initialStoryId?: string | null;
  onStoryChange?: (id: string) => void;
}

export function CreatorStudio({ onOpenLibrary, initialStoryId, onStoryChange }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [section, setSection] = useState<Section>('story');
  const [blueprint, setBlueprint] = useState<CreatorBlueprintDraft>(blankBlueprint);
  const [characters, setCharacters] = useState<CreatorCharacter[]>([]);
  const [lorebookEntries, setLorebookEntries] = useState<LorebookEntry[]>([]);
  const [lorebookDraft, setLorebookDraft] = useState<LorebookEntryDraft>(blankLorebook);
  const [editingLorebook, setEditingLorebook] = useState<string | null>(null);
  const [loreKeysInput, setLoreKeysInput] = useState('');
  const [loreSecondaryInput, setLoreSecondaryInput] = useState('');
  const [loreQuery, setLoreQuery] = useState('');
  const [lorePreview, setLorePreview] = useState<LorebookPreview | null>(null);
  const [character, setCharacter] = useState<CreatorCharacterDraft>(blankCharacter);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [openingDraft, setOpeningDraft] = useState('');
  const [assets, setAssets] = useState<CreatorMediaAsset[]>([]);
  const [mediaKind, setMediaKind] = useState<CreatorMediaAsset['kind']>('background');
  const [mediaLabel, setMediaLabel] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaCharacter, setMediaCharacter] = useState('');
  const [mediaExpression, setMediaExpression] = useState<SpriteExpression>('neutral');
  const [mediaPose, setMediaPose] = useState('standing');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPremise, setNewPremise] = useState('');
  const [newProtagonist, setNewProtagonist] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    api.stories().then(result => {
      if (live) {
        setStories(result.stories);
        setActive(initialStoryId
          ? result.stories.find(story => story.id === initialStoryId) || null
          : null);
        setSection('story');
      }
    }).catch((exc: Error) => { if (live) setError(exc.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [initialStoryId]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    setLoading(true);
    setError(''); setNotice(''); setCharacters([]); setLorebookEntries([]);
    setEditingLorebook(null); setLorebookDraft(blankLorebook);
    setLoreKeysInput(''); setLoreSecondaryInput(''); setLorePreview(null);
    setEditingCharacter(null); setCharacter(blankCharacter);
    setAssets([]); setMediaFile(null);
    Promise.all([api.creatorBlueprint(active.id), api.creatorCharacters(active.id),
                 api.creatorAssets(active.id), api.lorebookEntries(active.id)])
      .then(([data, cast, media, lorebook]) => {
        if (!live) return;
        const { synopsis, player_plot, ai_plot, guidelines, reminder,
          opening_scenarios, genre, tags, language } = data;
        setBlueprint({ synopsis, player_plot, ai_plot, guidelines, reminder,
          opening_scenarios, genre, tags, language });
        setTagsInput(tags.join(', '));
        setCharacters(cast.characters);
        setAssets(media.assets);
        setLorebookEntries(lorebook.entries);
      })
      .catch((exc: Error) => { if (live) setError(exc.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active?.id]);

  function update<K extends keyof CreatorBlueprintDraft>(key: K, value: CreatorBlueprintDraft[K]) {
    setBlueprint(previous => ({ ...previous, [key]: value }));
  }

  async function createStory() {
    if (newTitle.trim().length < 2 || newPremise.trim().length < 10 ||
        !newProtagonist.trim()) return;
    setWorking(true); setError('');
    try {
      const saved = await api.createStory(newTitle.trim(), newPremise.trim(), newProtagonist.trim());
      setStories(previous => [saved, ...previous]);
      setActive(saved); setSection('story'); setCreateNew(false);
      onStoryChange?.(saved.id);
      setNewTitle(''); setNewPremise(''); setNewProtagonist('');
      setNotice('Historia creada. Puedes preparar su contenido antes de jugarla.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function saveBlueprint() {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const draft = { ...blueprint, tags: tagsInput.split(',').map(v => v.trim()).filter(Boolean) };
      const saved: CreatorBlueprint = await api.saveCreatorBlueprint(active.id, draft);
      setBlueprint({
        synopsis: saved.synopsis, player_plot: saved.player_plot,
        ai_plot: saved.ai_plot, guidelines: saved.guidelines,
        reminder: saved.reminder, opening_scenarios: saved.opening_scenarios,
        genre: saved.genre, tags: saved.tags, language: saved.language,
      });
      setTagsInput(saved.tags.join(', '));
      setNotice('Contenido del creador guardado. El narrador utilizará las instrucciones privadas.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editCharacter(value: CreatorCharacter) {
    setEditingCharacter(value.id);
    setCharacter({
      name: value.name, description: value.description,
      personality: value.personality, dialogue_examples: value.dialogue_examples,
      visual_character_id: value.visual_character_id, voice_id: value.voice_id,
    });
  }

  async function saveCharacter() {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.saveCreatorCharacter(active.id, character, editingCharacter || undefined);
      setCharacters((await api.creatorCharacters(active.id)).characters);
      setEditingCharacter(null); setCharacter(blankCharacter);
      setNotice('Ficha narrativa del personaje guardada.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editLorebook(entry: LorebookEntry) {
    setEditingLorebook(entry.id);
    setLorebookDraft({
      title: entry.title, content: entry.content, keys: entry.keys,
      secondary_keys: entry.secondary_keys, secondary_mode: entry.secondary_mode,
      match_whole_words: entry.match_whole_words, priority: entry.priority,
      enabled: entry.enabled, always_active: entry.always_active,
      visibility: entry.visibility || 'world',
      witness_character_ids: entry.witness_character_ids || [],
    });
    setLoreKeysInput(entry.keys.join(', '));
    setLoreSecondaryInput(entry.secondary_keys.join(', '));
    setLorePreview(null);
  }

  function resetLorebookEditor() {
    setEditingLorebook(null); setLorebookDraft(blankLorebook);
    setLoreKeysInput(''); setLoreSecondaryInput('');
  }

  async function saveLorebook() {
    if (!active || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.saveLorebookEntry(active.id, {
        ...lorebookDraft,
        keys: loreKeysInput.split(',').map(value => value.trim()).filter(Boolean),
        secondary_keys: loreSecondaryInput.split(',').map(value => value.trim()).filter(Boolean),
      }, editingLorebook || undefined);
      setLorebookEntries((await api.lorebookEntries(active.id)).entries);
      resetLorebookEditor();
      setLorePreview(null);
      setNotice('Entrada de Lorebook guardada. Se activará según sus palabras clave.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function removeLorebook(entry: LorebookEntry) {
    if (!active || working || !window.confirm('¿Eliminar esta entrada del Lorebook?')) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.deleteLorebookEntry(active.id, entry.id);
      setLorebookEntries((await api.lorebookEntries(active.id)).entries);
      if (editingLorebook === entry.id) resetLorebookEditor();
      setLorePreview(null);
      setNotice('Entrada eliminada del Lorebook.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function previewLorebookActivation() {
    if (!active) return;
    setWorking(true); setError(''); setLorePreview(null);
    try { setLorePreview(await api.previewLorebook(active.id, loreQuery)); }
    catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function rememberStory(updated: Story) {
    setActive(current => current?.id === updated.id ? updated : current);
    setStories(previous => previous.map(story => story.id === updated.id ? updated : story));
  }

  async function chooseCover(assetId: string | null) {
    if (!active || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      rememberStory(await api.setStoryCover(active.id, assetId));
      setNotice(assetId ? 'Portada editorial seleccionada para la biblioteca.' :
        'Se quitó la portada editorial. La historia permanece intacta.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  function editAsset(asset: CreatorMediaAsset) {
    setEditingAsset(asset.id); setMediaKind(asset.kind);
    setMediaLabel(asset.label); setMediaCaption(asset.caption);
    setMediaCharacter(asset.character_id || '');
    setMediaExpression(asset.expression); setMediaPose(asset.pose);
    setMediaFile(null);
  }
  function resetMediaEditor() {
    setEditingAsset(null); setMediaLabel(''); setMediaCaption('');
    setMediaCharacter(''); setMediaExpression('neutral');
    setMediaPose('standing'); setMediaFile(null);
  }
  async function saveMediaAsset() {
    if (!active || !mediaLabel.trim() || mediaCaption.trim().length < 3) return;
    setWorking(true); setError(''); setNotice('');
    try {
      if (editingAsset) {
        await api.editCreatorAsset(active.id, editingAsset, mediaLabel.trim(),
          mediaCaption.trim(), mediaKind === 'foreground' ? mediaExpression : undefined,
          mediaKind === 'foreground' ? mediaPose.trim() : undefined);
      } else {
        if (!mediaFile) throw new Error('Selecciona un archivo de imagen.');
        const imported = await api.uploadCreatorAsset(active.id, {
          kind: mediaKind, label: mediaLabel.trim(), caption: mediaCaption.trim(),
          character_id: mediaKind === 'foreground' ? (mediaCharacter || undefined) : undefined,
          expression: mediaKind === 'foreground' ? mediaExpression : undefined,
          pose: mediaKind === 'foreground' ? mediaPose.trim() : undefined,
          file: mediaFile,
        });
        if (mediaKind === 'cover') rememberStory(await api.setStoryCover(active.id, imported.id));
      }
      setAssets((await api.creatorAssets(active.id)).assets);
      resetMediaEditor();
      setNotice(mediaKind === 'cover' && !editingAsset ?
        'Portada editorial guardada y seleccionada para la biblioteca.' :
        'Recurso visual guardado para su selección durante la lectura.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }
  async function deleteMediaAsset(asset: CreatorMediaAsset) {
    if (!active || !window.confirm('¿Eliminar este recurso visual de la historia?')) return;
    setWorking(true); setError('');
    try {
      await api.deleteCreatorAsset(active.id, asset.id);
      if (active.cover_asset_id === asset.id) {
        rememberStory({ ...active, cover_asset_id: null, cover_image_url: null });
      }
      setAssets((await api.creatorAssets(active.id)).assets);
      if (editingAsset === asset.id) resetMediaEditor();
      setNotice('Recurso visual eliminado.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  async function startOpening(index: number) {
    if (!active) return;
    setWorking(true); setError(''); setNotice('');
    try {
      await api.startCreatorOpening(active.id, index);
      setNotice('La apertura se guardó como primer turno. Abre la historia desde Biblioteca para continuar.');
    } catch (exc) { setError((exc as Error).message); }
    finally { setWorking(false); }
  }

  return <section className="creator-studio" aria-label="Estudio de creación de historias">
    <div className="creator-heading">
      <button className="creator-return" onClick={onOpenLibrary}>
        <ArrowLeft size={16}/> Biblioteca
      </button>
      <span className="overline"><Feather size={15}/> NOBLE CREATOR STUDIO</span>
      <h1>Construye historias con intención.</h1>
      <p>Separa lo que ve el jugador de lo que conoce el narrador. Define personajes,
        reglas, escenas de apertura y el tono de tu mundo sin mezclarlos con la lectura.</p>
    </div>

    <div className="creator-layout">
      <aside className="creator-projects" aria-label="Historias para crear">
        <div className="creator-projects-head">
          <div><span className="overline">TUS MUNDOS</span><strong>Proyectos</strong></div>
          <button title="Nuevo proyecto" aria-label="Crear proyecto" onClick={() => setCreateNew(true)}>
            <Plus size={18}/>
          </button>
        </div>
        {loading && !active && <p className="creator-placeholder"><LoaderCircle size={15} className="rotating"/> Cargando...</p>}
        {stories.map(story => <button className={'creator-project ' +
          (active?.id === story.id ? 'is-selected' : '')} key={story.id}
          onClick={() => {
            setActive(story); setSection('story');
            onStoryChange?.(story.id);
          }}>
          <BookOpen size={18}/><span><strong>{story.title}</strong>
          <small>{story.protagonist_name || 'Protagonista'}</small></span><ChevronRight size={15}/>
        </button>)}
        {!stories.length && !loading && <p className="creator-placeholder">
          Aún no hay historias. Crea tu primer proyecto para diseñar su mundo.</p>}
        <button className="creator-new" onClick={() => setCreateNew(true)}>
          <Plus size={17}/> Nuevo proyecto
        </button>
      </aside>

      <div className="creator-editor">
        {error && <p className="narrative-error" role="alert">{error}</p>}
        {notice && <p className="narrative-saved" role="status"><Check size={16}/>{notice}</p>}
        {!active ? <div className="creator-welcome">
          <Sparkles size={40}/><h2>Selecciona una historia para editarla</h2>
          <p>Desde aquí puedes escribir la trama para el jugador, la información
            interna para el modelo, las fichas de personajes y los distintos inicios.</p>
          <button className="primary-button" onClick={() => setCreateNew(true)}>
            <Plus size={16}/> Crear nueva historia
          </button>
        </div> : <>
          <div className="creator-editor-title">
            <div><span className="overline">EDITANDO PROYECTO</span>
              <h2>{active.title}</h2>
              <small>El jugador controla a {active.protagonist_name || 'Protagonista'}.</small></div>
            <button className="secondary-button" onClick={onOpenLibrary}>
              <BookOpen size={15}/> Ir a Biblioteca
            </button>
          </div>
          <nav className="creator-editor-tabs" aria-label="Herramientas de creación">
            <button className={section === 'story' ? 'selected' : ''}
              onClick={() => setSection('story')}><FileText size={17}/> Trama y contexto</button>
            <button className={section === 'cast' ? 'selected' : ''}
              onClick={() => setSection('cast')}><Users size={17}/> Personajes ({characters.length})</button>
            <button className={section === 'lorebook' ? 'selected' : ''}
              onClick={() => setSection('lorebook')}><BookKey size={17}/> Lorebook ({lorebookEntries.length})</button>
            <button className={section === 'world' ? 'selected' : ''}
              onClick={() => setSection('world')}><Globe2 size={17}/> Estado del mundo</button>
            <button className={section === 'openings' ? 'selected' : ''}
              onClick={() => setSection('openings')}><Feather size={17}/> Aperturas</button>
            <button className={section === 'media' ? 'selected' : ''}
              onClick={() => setSection('media')}><ImageIcon size={17}/> Imágenes ({assets.length})</button>
          </nav>

          {loading ? <div className="loading"><LoaderCircle className="rotating" size={17}/> Cargando contenido...</div> :
            section === 'world' ? <WorldStateEditor
              storyId={active.id} characters={characters}/> :
            section === 'media' ? <div className="creator-fields creator-media-library">
              <div className="creator-section-intro">
                <h3>Portadas, escenarios y personajes</h3>
                <p>Elige una portada fija para la biblioteca, prepara fondos de escenarios
                  y retratos transparentes para las escenas narrativas.
                  No se generan imágenes automáticamente.</p>
              </div>
              <div className="creator-cover-preview" aria-label="Portada editorial actual">
                <div className="creator-cover-preview-art">
                  {active.cover_image_url ?
                    <img src={active.cover_image_url} alt={'Portada de ' + active.title}/> :
                    <BookOpen size={42} aria-hidden="true"/>}
                </div>
                <div className="creator-cover-preview-copy">
                  <span className="overline">PORTADA DE LA HISTORIA</span>
                  <strong>{active.cover_image_url ? 'Portada personalizada' : 'Sin portada personalizada'}</strong>
                  <p>Se muestra en Biblioteca y en el detalle de la historia.
                    No cambia cuando avanzas o generas una nueva escena.</p>
                  {active.cover_asset_id && <button className="secondary-button" disabled={working}
                    onClick={() => void chooseCover(null)}>Quitar portada</button>}
                </div>
              </div>
              <div className="creator-media-grid">
                {assets.map(asset => <article className="creator-media-card" key={asset.id}>
                  <div className={'creator-media-thumbnail ' + asset.kind}>
                    <img src={asset.url} loading="lazy" alt={'Imagen: ' + asset.label}/>
                  </div>
                  <div className="creator-media-copy">
                    <small>{asset.kind === 'cover' ? 'PORTADA' :
                      asset.kind === 'background' ? 'FONDO' : 'PRIMER PLANO'}
                      {asset.id === active.cover_asset_id ? ' · ACTUAL' : ''}</small>
                    <strong>{asset.label}</strong><p>{asset.caption}</p>
                    {asset.kind === 'foreground' && <small>
                      Expresión: {asset.expression} · Pose: {asset.pose}
                    </small>}
                    <div>
                      {asset.kind === 'cover' && asset.id !== active.cover_asset_id &&
                        <button className="secondary-button" disabled={working}
                          onClick={() => void chooseCover(asset.id)}>Usar como portada</button>}
                      <button className="secondary-button" disabled={working}
                        onClick={() => editAsset(asset)}>Editar descripción</button>
                      <button aria-label={'Eliminar imagen ' + asset.label}
                        className="creator-media-delete" disabled={working}
                        onClick={() => void deleteMediaAsset(asset)}><Trash2 size={15}/></button>
                    </div>
                  </div>
                </article>)}
                {assets.length === 0 && <div className="creator-media-empty">
                  <ImageIcon size={30}/><strong>Todavía no hay recursos visuales.</strong>
                  <p>Importa un fondo o un retrato para preparar tu novela visual.</p>
                </div>}
              </div>
              <div className="creator-media-form">
                <h4>{editingAsset ? 'Editar recurso' : 'Añadir recurso visual'}</h4>
                {!editingAsset && <div className="creator-double">
                  <label>Tipo de recurso
                    <select aria-label="Tipo de recurso visual" value={mediaKind}
                      onChange={e => setMediaKind(e.target.value as CreatorMediaAsset['kind'])}>
                      <option value="cover">Portada editorial</option>
                      <option value="background">Fondo de escenario</option>
                      <option value="foreground">Personaje / primer plano</option>
                    </select>
                  </label>
                  {mediaKind === 'foreground' && <label>Personaje vinculado (opcional)
                    <select aria-label="Personaje de la imagen" value={mediaCharacter}
                      onChange={e => setMediaCharacter(e.target.value)}>
                      <option value="">Ninguno</option>
                      {characters.map(npc => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
                    </select>
                  </label>}
                </div>}
                {mediaKind === 'foreground' && <div className="creator-double">
                  <label>Expresión de sprite
                    <select aria-label="Expresión de sprite" value={mediaExpression}
                      onChange={e => setMediaExpression(e.target.value as SpriteExpression)}>
                      <option value="neutral">Neutral</option>
                      <option value="joy">Alegría</option>
                      <option value="anger">Enojo</option>
                      <option value="sadness">Tristeza</option>
                      <option value="surprise">Sorpresa</option>
                    </select>
                  </label>
                  <label>Pose (identificador)
                    <input aria-label="Pose de sprite" maxLength={32} value={mediaPose}
                      onChange={e => setMediaPose(e.target.value)}
                      placeholder="standing, sitting, waving..."/>
                  </label>
                </div>}
                <label>Nombre
                  <input aria-label="Nombre de imagen" maxLength={100} value={mediaLabel}
                    placeholder="Salón del trono, Aira sonriendo..."
                    onChange={e => setMediaLabel(e.target.value)}/></label>
                <label>Descripción para reconocer la escena
                  <textarea aria-label="Descripción de imagen" maxLength={220} rows={3}
                    value={mediaCaption} onChange={e => setMediaCaption(e.target.value)}
                    placeholder="Bosque oscuro de noche, Aira sonríe en la taberna..."/>
                  <small>Usa lugares y emociones concretas. No se envía esta descripción a ningún modelo.</small>
                </label>
                {!editingAsset && <label>Archivo PNG, JPEG o WebP (hasta 12 MiB)
                  <input type="file" aria-label="Archivo de recurso visual"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => setMediaFile(e.target.files?.[0] || null)}/>
                  {mediaKind === 'foreground' && <small>
                    La transparencia se conserva en PNG para superponer personajes sobre el fondo.
                  </small>}
                  {mediaKind === 'cover' && <small>
                    La portada se guarda como WebP y se selecciona automáticamente al importar.
                  </small>}
                </label>}
                <div className="creator-actions">
                  <button className="primary-button" disabled={working || !mediaLabel.trim() ||
                    mediaCaption.trim().length < 3 ||
                    (mediaKind === 'foreground' && !/^[a-z0-9_-]{1,32}$/.test(mediaPose.trim().toLowerCase())) ||
                    (!editingAsset && !mediaFile)}
                    onClick={() => void saveMediaAsset()}><UploadCloud size={16}/>
                    {editingAsset ? 'Guardar descripción' : 'Importar imagen'}</button>
                  {editingAsset && <button className="secondary-button"
                    onClick={resetMediaEditor}>Cancelar edición</button>}
                </div>
              </div>
            </div> :
            section === 'lorebook' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Lorebook · conocimiento condicional</h3>
                <p>Guarda secretos, lugares y reglas que el narrador consulta cuando aparecen
                  palabras activadoras en la intervención o en la escena reciente. El jugador
                  no recibe estos textos directamente. Cada rama conserva su propia copia.</p>
              </div>
              <div className="creator-character-list">
                {lorebookEntries.map(entry => <div className="creator-opening" key={entry.id}>
                  <div><strong>{entry.title} · prioridad {entry.priority}</strong>
                    <button className="creator-media-delete" disabled={working}
                      aria-label={'Eliminar Lorebook ' + entry.title}
                      onClick={() => void removeLorebook(entry)}><Trash2 size={15}/></button>
                  </div>
                  <p>{entry.always_active ? 'Siempre activo' :
                    'Claves: ' + entry.keys.join(', ')}
                    {entry.enabled ? '' : ' · Deshabilitado'}
                    {entry.visibility === 'witnesses'
                      ? ' · Solo personajes testigos presentes'
                      : ' · Conocimiento general'}</p>
                  <p>{entry.content.slice(0, 170)}{entry.content.length > 170 ? '…' : ''}</p>
                  <button className="secondary-button" disabled={working}
                    onClick={() => editLorebook(entry)}>Editar entrada</button>
                </div>)}
                {!lorebookEntries.length && <p className="creator-placeholder">
                  Todavía no hay entradas. Crea hechos que deban recordarse
                  únicamente en escenas relevantes.</p>}
              </div>
              <div className="creator-media-form">
                <h4>{editingLorebook ? 'Editar entrada del Lorebook' : 'Nueva entrada del Lorebook'}</h4>
                <label>Título
                  <input aria-label="Título de Lorebook" value={lorebookDraft.title}
                    maxLength={100} onChange={e => setLorebookDraft(v => ({
                      ...v, title: e.target.value,
                    }))} placeholder="Bosque de cristal, pacto secreto..."/>
                </label>
                <label>Hechos que debe recordar el narrador
                  <textarea aria-label="Contenido de Lorebook" rows={5} maxLength={3500}
                    value={lorebookDraft.content} onChange={e => setLorebookDraft(v => ({
                      ...v, content: e.target.value,
                    }))} placeholder="Describe reglas, secretos o información canónica del mundo."/>
                </label>
                <div className="creator-double">
                  <label>Claves principales (separadas por coma)
                    <input aria-label="Claves de Lorebook" value={loreKeysInput}
                      onChange={e => setLoreKeysInput(e.target.value)}
                      placeholder="bosque, ruinas, mapa"/>
                  </label>
                  <label>Claves secundarias opcionales
                    <input aria-label="Claves secundarias de Lorebook" value={loreSecondaryInput}
                      onChange={e => setLoreSecondaryInput(e.target.value)}
                      placeholder="noche, guardia"/>
                  </label>
                </div>
                <div className="creator-double">
                  <label>Prioridad (0–100)
                    <input aria-label="Prioridad de Lorebook" type="number" min={0} max={100}
                      value={lorebookDraft.priority}
                      onChange={e => setLorebookDraft(v => ({ ...v,
                        priority: Number(e.target.value),
                      }))}/>
                  </label>
                  <label>Activación secundaria
                    <select aria-label="Condición secundaria de Lorebook"
                      value={lorebookDraft.secondary_mode}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, secondary_mode: e.target.value as 'any'|'all',
                      }))}>
                      <option value="any">Cualquiera</option>
                      <option value="all">Todas</option>
                    </select>
                  </label>
                </div>
                <label>Quién puede conocer este hecho
                  <select aria-label="Visibilidad de Lorebook"
                    value={lorebookDraft.visibility}
                    onChange={e => setLorebookDraft(v => ({
                      ...v, visibility: e.target.value as 'world' | 'witnesses',
                      witness_character_ids: [],
                    }))}>
                    <option value="world">Conocimiento general del mundo</option>
                    <option value="witnesses">Solo personajes testigos presentes</option>
                  </select>
                </label>
                {lorebookDraft.visibility === 'witnesses' && <fieldset>
                  <legend>Personajes que conocen este hecho</legend>
                  {!characters.length && <p>Primero crea personajes en la sección Personajes.</p>}
                  {characters.map(person => <label key={person.id} className="creator-lore-toggle">
                    <input type="checkbox" aria-label={'Testigo ' + person.name}
                      checked={lorebookDraft.witness_character_ids.includes(person.id)}
                      onChange={e => setLorebookDraft(v => ({
                        ...v, witness_character_ids: e.target.checked
                          ? [...v.witness_character_ids, person.id]
                          : v.witness_character_ids.filter(id => id !== person.id),
                      }))}/>
                    {person.name}
                  </label>)}
                  <small>Solo se incluye al narrar si alguno de estos personajes está
                    presente en el estado del mundo confirmado. Mencionar su nombre
                    en el texto no cambia quién está presente.</small>
                </fieldset>}
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.enabled}
                  onChange={e => setLorebookDraft(v => ({...v, enabled: e.target.checked}))}/>
                  Entrada habilitada</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.always_active}
                  onChange={e => setLorebookDraft(v => ({...v, always_active: e.target.checked}))}/>
                  Siempre activo (sin claves)</label>
                <label className="creator-lore-toggle"><input type="checkbox" checked={lorebookDraft.match_whole_words}
                  onChange={e => setLorebookDraft(v => ({
                    ...v, match_whole_words: e.target.checked,
                  }))}/> Coincidir palabras completas</label>
                <div className="creator-actions">
                  <button className="primary-button" disabled={working ||
                    lorebookDraft.title.trim().length < 2 ||
                    lorebookDraft.content.trim().length < 10 ||
                    (lorebookDraft.visibility === 'witnesses' &&
                      !lorebookDraft.witness_character_ids.length)}
                    onClick={() => void saveLorebook()}><Save size={16}/>
                    {editingLorebook ? 'Actualizar Lorebook' : 'Crear entrada de Lorebook'}
                  </button>
                  {editingLorebook && <button className="secondary-button"
                    onClick={resetLorebookEditor}>Cancelar edición</button>}
                </div>
              </div>
              <div className="creator-media-form">
                <h4>Comprobar activaciones antes de jugar</h4>
                <p>Escribe una acción o frase. Se muestran las entradas que recibiría el
                  narrador y el presupuesto realmente utilizado (máximo 6000 caracteres).
                  La prueba usa los personajes presentes guardados en Estado del mundo.</p>
                <label>Simular una intervención
                  <textarea rows={3} aria-label="Simular activación Lorebook"
                    maxLength={3000} value={loreQuery}
                    onChange={e => { setLoreQuery(e.target.value); setLorePreview(null); }}
                    placeholder="Entro en las ruinas del bosque..."/>
                </label>
                <button className="secondary-button" disabled={working}
                  onClick={() => void previewLorebookActivation()}>
                  <BookKey size={16}/> Previsualizar Lorebook
                </button>
                {lorePreview && <div role="status" className="creator-hint">
                  <strong>{lorePreview.entries.length} entrada(s) activada(s)</strong>
                  <p>{lorePreview.used_chars} de {lorePreview.budget_chars} caracteres
                    · {lorePreview.skipped_budget} excluidas por presupuesto
                    · {lorePreview.skipped_visibility} sin testigos presentes</p>
                  {lorePreview.entries.map(entry => <p key={entry.id}>
                    {entry.title} · prioridad {entry.priority}</p>)}
                  {!!lorePreview.context && <details className="creator-lorebook-preview">
                    <summary>Ver contexto exacto enviado al narrador</summary>
                    <pre>{lorePreview.context}</pre>
                  </details>}
                </div>}
              </div>
            </div> :
            section === 'story' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Identidad y trama de tu historia</h3>
                <p>La descripción pública presenta el mundo. El contexto interno y
                  las directrices se entregan al narrador, no al texto del jugador.</p>
              </div>
              <div className="creator-double">
                <label>Género
                  <input aria-label="Género de la historia" value={blueprint.genre}
                    maxLength={80} placeholder="Fantasía, romance, misterio..."
                    onChange={e => update('genre', e.target.value)}/>
                </label>
                <label>Idioma
                  <select aria-label="Idioma de la historia" value={blueprint.language}
                    onChange={e => update('language', e.target.value)}>
                    <option value="es-419">Español latinoamericano</option>
                    <option value="en">English</option><option value="ja">日本語</option>
                    <option value="ko">한국어</option><option value="pt-BR">Português (Brasil)</option>
                    <option value="fr">Français</option>
                  </select>
                </label>
              </div>
              <label>Sinopsis breve para lectores
                <textarea rows={3} aria-label="Sinopsis para lectores" maxLength={250}
                  value={blueprint.synopsis} onChange={e => update('synopsis', e.target.value)}
                  placeholder="Lo primero que verá el jugador al descubrir la historia."/>
              </label>
              <label>Trama que conoce el jugador
                <textarea rows={5} maxLength={4000} aria-label="Trama visible"
                  value={blueprint.player_plot}
                  onChange={e => update('player_plot', e.target.value)}
                  placeholder="Punto de partida, situación y expectativas sin revelar secretos."/>
              </label>
              <label>Contexto interno para la IA
                <textarea rows={8} maxLength={12000} aria-label="Contexto interno de la IA"
                  value={blueprint.ai_plot}
                  onChange={e => update('ai_plot', e.target.value)}
                  placeholder="Reglas del mundo, relaciones, secretos y sucesos que el narrador sí debe conocer."/>
                <small>No aparece directamente en la historia, pero influye en su generación.</small>
              </label>
              <label>Directrices narrativas
                <textarea rows={5} maxLength={4000} aria-label="Directrices de narración"
                  value={blueprint.guidelines}
                  onChange={e => update('guidelines', e.target.value)}
                  placeholder="Estilo, ritmo, personajes que controla el narrador, detalles de continuidad..."/>
              </label>
              <label>Recordatorio persistente
                <textarea rows={3} maxLength={1200} aria-label="Recordatorio persistente"
                  value={blueprint.reminder} onChange={e => update('reminder', e.target.value)}
                  placeholder="Una instrucción breve que importa en cada turno."/>
              </label>
              <label>Etiquetas (separadas por coma)
                <input maxLength={500} aria-label="Etiquetas de la historia" value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)} placeholder="isekai, aventura, magia"/>
              </label>
              <button className="primary-button" disabled={working} onClick={() => void saveBlueprint()}>
                <Save size={16}/>{working ? 'Guardando...' : 'Guardar trama y contexto'}
              </button>
            </div> : section === 'cast' ? <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Personajes de la novela</h3>
                <p>Define personalidad, historia y ejemplos de habla de los NPC.
                  Es un sistema narrativo independiente de las fichas visuales.</p>
              </div>
              <div className="creator-character-list">
                {characters.map(person => <button key={person.id}
                  onClick={() => editCharacter(person)}>
                  <UserRound size={19}/><span><strong>{person.name}</strong>
                    <small>{person.personality || person.description}</small></span>
                  <ChevronRight size={16}/></button>)}
              </div>
              <label>Nombre
                <input aria-label="Nombre de NPC" maxLength={80}
                  value={character.name} onChange={e => setCharacter(v => ({...v,name:e.target.value}))}/>
              </label>
              <label>Trasfondo y descripción
                <textarea rows={5} maxLength={3000} aria-label="Descripción de NPC"
                  value={character.description} onChange={e => setCharacter(v => ({
                    ...v,description:e.target.value,
                  }))}/>
              </label>
              <label>Personalidad y motivaciones
                <textarea rows={4} maxLength={1500} aria-label="Personalidad de NPC"
                  value={character.personality} onChange={e => setCharacter(v => ({
                    ...v,personality:e.target.value,
                  }))}/>
              </label>
              <label>Ejemplos de diálogo
                <textarea rows={4} maxLength={3000} aria-label="Diálogos de ejemplo"
                  value={character.dialogue_examples} onChange={e => setCharacter(v => ({
                    ...v,dialogue_examples:e.target.value,
                  }))} placeholder="Cómo habla, expresiones habituales y forma de responder."/>
              </label>
              <div className="creator-actions">
                <button className="primary-button" disabled={working || !character.name.trim() ||
                    character.description.trim().length < 20} onClick={() => void saveCharacter()}>
                  <Save size={16}/>{editingCharacter ? 'Actualizar personaje' : 'Añadir personaje'}
                </button>
                {editingCharacter && <button className="secondary-button" onClick={() => {
                  setEditingCharacter(null); setCharacter(blankCharacter);
                }}><X size={15}/> Cancelar edición</button>}
              </div>
            </div> : <div className="creator-fields">
              <div className="creator-section-intro">
                <h3>Distintas formas de comenzar</h3>
                <p>Prepara hasta seis escenas iniciales. El jugador podrá elegir
                  una al iniciar. Puedes usar <code>{'{{user}}'}</code> como referencia al protagonista.</p>
              </div>
              {blueprint.opening_scenarios.map((opening,index) =>
                <div className="creator-opening" key={index}>
                  <div><strong>Apertura {index+1}</strong>
                    <button disabled={working} aria-label={'Quitar apertura '+(index+1)}
                      onClick={() => update('opening_scenarios',
                        blueprint.opening_scenarios.filter((_,i)=>i!==index))}><X size={15}/></button>
                  </div>
                  <textarea aria-label={'Texto de apertura '+(index+1)} rows={5}
                    maxLength={3000} value={opening}
                    onChange={e => update('opening_scenarios',
                      blueprint.opening_scenarios.map((v,i)=>i===index?e.target.value:v))}/>
                  <button className="secondary-button" disabled={working || opening.trim().length<15}
                    onClick={() => void startOpening(index)}>
                    <BookOpen size={15}/> Utilizar como inicio de esta historia
                  </button>
                </div>)}
              <label>Escribir otra apertura
                <textarea rows={5} aria-label="Nueva apertura" maxLength={3000}
                  value={openingDraft} onChange={e=>setOpeningDraft(e.target.value)}
                  placeholder="Describe la primera escena tal como debería leerla el jugador."/>
              </label>
              <div className="creator-actions">
                <button className="secondary-button" disabled={working ||
                    blueprint.opening_scenarios.length >= 6 || openingDraft.trim().length<15}
                  onClick={() => {
                    update('opening_scenarios',[...blueprint.opening_scenarios, openingDraft.trim()]);
                    setOpeningDraft('');
                  }}><Plus size={16}/> Añadir apertura</button>
                <button className="primary-button" disabled={working}
                  onClick={() => void saveBlueprint()}><Save size={16}/> Guardar aperturas</button>
              </div>
              <p className="creator-hint">Guarda las aperturas antes de activar un inicio.
                No se reemplaza automáticamente una historia que ya tenga turnos.</p>
            </div>}
        </>}
      </div>
    </div>
    {createNew && <div className="welcome-scrim">
      <section className="welcome-panel" role="dialog" aria-modal="true" aria-label="Crear proyecto narrativo">
        <div className="story-create-heading"><span className="overline">NUEVA HISTORIA</span>
          <button aria-label="Cerrar proyecto" className="icon-button"
            onClick={() => setCreateNew(false)}><X size={18}/></button></div>
        <h2>Crea tu próximo mundo</h2>
        <p>Primero crea el proyecto. Después tendrás herramientas independientes para
          la trama, personajes y aperturas.</p>
        <label className="form-label">Título
          <input value={newTitle} maxLength={100}
            onChange={e => setNewTitle(e.target.value)}/></label>
        <label className="form-label">Premisa del mundo
          <textarea rows={4} maxLength={4000} value={newPremise}
            onChange={e => setNewPremise(e.target.value)}/></label>
        <label className="form-label">Protagonista
          <input value={newProtagonist} maxLength={60}
            onChange={e => setNewProtagonist(e.target.value)}/></label>
        {error && <p role="alert" className="narrative-error">{error}</p>}
        <button className="primary-button full" disabled={working || newTitle.trim().length<2 ||
          newPremise.trim().length<10 || !newProtagonist.trim()} onClick={() => void createStory()}>
          <Plus size={16}/> Crear proyecto
        </button>
      </section>
    </div>}
  </section>;
}
