import type { CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail, ModelRole, SearchResponse, ModelCardResponse, Settings, NarrativeConfig, ProviderModels, Story, StoryTurn, GenerationEvent, KoboldStatus, KoboldInstalled, KoboldLaunch, WorkspacePreferences, About, Updates, RuntimeDiagnostics, NetworkCapabilities, ProviderCredentialStatus, RemoteWorker, WorkerProbe, WorkerBenchmark, ImageSettings, ImageStatus, IllustrationResult, SpeechVoices, NarratorPrepareResult, VisualState, VisualCharacterDraft, VisualCharacter, ResourceConfig, ResourceStatus, ScenePlan, ScenePlanInput, CreatorBlueprint, CreatorBlueprintDraft, CreatorCharacter, CreatorCharacterDraft, CreatorMediaAsset, ScenePresentation, ModelStorage, LorebookEntry, LorebookEntryDraft, LorebookPreview, LorebookTurnSnapshot, WorldStateData, WorldStateDocument, WorldTurnSnapshot, EpisodicSearch, ContextPreview, BranchTree } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const failure: { detail?: string | Array<{ msg?: string }> } = await response.json().catch(() => ({}));
    const message = Array.isArray(failure.detail)
      ? failure.detail.map((entry) => entry.msg || 'Error de validación').join(', ')
      : failure.detail;
    throw new Error(message || ('Error HTTP ' + response.status));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function json(data: object): RequestInit {
  return { method: 'POST', body: JSON.stringify(data) };
}
export const api = {
  health: () => request<Health>('/health'),
  hardware: () => request<Hardware>('/hardware'),
  settings: () => request<Settings>('/settings'),
  patchSettings: (data: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  search: (query: string, role: ModelRole, sort = 'downloads') =>
    request<SearchResponse>('/models/search?q=' + encodeURIComponent(query) +
      '&role=' + encodeURIComponent(role) + '&sort=' + encodeURIComponent(sort)),
  details: (repo: string, contextTokens = 4096) => request<ModelDetail>(
    '/models/' + repo.split('/').map(encodeURIComponent).join('/') +
    (contextTokens === 4096 ? '' : '?context_tokens=' + contextTokens)),
  modelCard: (repo: string, revision: string) => request<ModelCardResponse>(
    '/model-cards/' + repo.split('/').map(encodeURIComponent).join('/') +
    '?revision=' + encodeURIComponent(revision)),
  installed: () => request<{ models: InstalledModel[] }>('/models/installed'),
  modelStorage: () => request<ModelStorage>('/models/storage'),
  downloads: () => request<{ downloads: DownloadJob[] }>('/downloads'),
  downloadRecovery: () => request<{ recovered: number; conflicts: number; skipped: number }>(
    '/downloads/recovery'),
  install: (data: { repo_id: string; revision: string; filename: string }) =>
    request<DownloadJob>('/models/install', json(data)),
  control: (jobId: string, action: 'pause' | 'resume' | 'cancel') =>
    request<DownloadJob>('/downloads/' + encodeURIComponent(jobId) + '/' + action, { method: 'POST' }),
  roles: () => request<{ roles: Record<string, string>; runtime_connected: boolean }>('/model-roles'),
  assign: (role: string, installedId: string) =>
    request<{ roles: Record<string, string>; message: string; runtime_connected: boolean }>(
      '/model-roles/' + role, { method: 'PUT', body: JSON.stringify({ installed_id: installedId }) }),
  providers: () => request<{ available: Array<{ id: string; kind: string; status: string }> }>('/providers'),
  workspacePreferences: () => request<WorkspacePreferences>('/workspace/preferences'),
  patchWorkspacePreferences: (data: Partial<WorkspacePreferences>) => request<WorkspacePreferences>(
    '/workspace/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
  about: () => request<About>('/about'),
  updates: (force = false) => request<Updates>('/updates' + (force ? '?force=true' : '')),
  runtimeDiagnostics: () => request<RuntimeDiagnostics>('/runtime/diagnostics'),
  networkCapabilities: () => request<NetworkCapabilities>('/network/capabilities'),
  workers: () => request<{ workers: RemoteWorker[]; supported_role: string }>('/workers'),
  registerWorker: (name: string, url: string, token: string) => request<RemoteWorker>(
    '/workers', { method: 'POST', body: JSON.stringify({ name, url, token }) }),
  probeWorker: (id: string) => request<WorkerProbe>('/workers/' + encodeURIComponent(id) + '/probe'),
  benchmarkWorker: (id: string, model: string) => request<WorkerBenchmark>(
    '/workers/' + encodeURIComponent(id) + '/benchmark',
    { method: 'POST', body: JSON.stringify({ model }) }),
  activateWorker: (id: string, model: string) => request<NarrativeConfig>(
    '/workers/' + encodeURIComponent(id) + '/activate',
    { method: 'POST', body: JSON.stringify({ model }) }),
  removeWorker: (id: string) => request<void>(
    '/workers/' + encodeURIComponent(id), { method: 'DELETE' }),
  openRouterCredential: () => request<ProviderCredentialStatus>('/provider-credentials/openrouter'),
  saveOpenRouterCredential: (api_key: string) => request<ProviderCredentialStatus>(
    '/provider-credentials/openrouter', { method: 'PUT', body: JSON.stringify({ api_key }) }),
  deleteOpenRouterCredential: () => request<ProviderCredentialStatus>(
    '/provider-credentials/openrouter', { method: 'DELETE' }),
  scenePlan: (storyId: string) => request<ScenePlan>(
    '/stories/' + encodeURIComponent(storyId) + '/scene-plan'),
  saveScenePlan: (storyId: string, plan: ScenePlanInput) => request<ScenePlan>(
    '/stories/' + encodeURIComponent(storyId) + '/scene-plan',
    { method: 'PUT', body: JSON.stringify(plan) }),
  previewScenePlan: (storyId: string, prompt: string) => request<{
    prompt: string; scene_id: string; revision: number;
    inference_used: boolean; reference_asset_id: string | null;
  }>('/stories/' + encodeURIComponent(storyId) + '/scene-plan/preview',
    { method: 'POST', body: JSON.stringify({ prompt }) }),
  setCharacterReference: (storyId: string, characterId: string, assetId: string | null) =>
    request<VisualCharacter>('/stories/' + encodeURIComponent(storyId) +
      '/visual-characters/' + encodeURIComponent(characterId) + '/reference',
      { method: 'PUT', body: JSON.stringify({ asset_id: assetId }) }),
  visualState: (storyId: string) => request<VisualState>(
    '/stories/' + encodeURIComponent(storyId) + '/visual-state'),
  setSceneLocation: (storyId: string, location: string) => request<VisualState>(
    '/stories/' + encodeURIComponent(storyId) + '/scene',
    { method: 'PUT', body: JSON.stringify({ location }) }),
  saveVisualCharacter: (storyId: string, character: VisualCharacterDraft,
                         characterId?: string) => request<VisualCharacter>(
    '/stories/' + encodeURIComponent(storyId) + '/visual-characters' +
      (characterId ? '/' + encodeURIComponent(characterId) : ''),
    { method: characterId ? 'PUT' : 'POST', body: JSON.stringify(character) }),
  chooseSceneImage: (storyId: string, assetId: string) => request<VisualState>(
    '/stories/' + encodeURIComponent(storyId) + '/gallery/' + encodeURIComponent(assetId) + '/select',
    { method: 'POST' }),
  imagePromptPreview: (storyId: string, prompt: string) => request<{ prompt: string; inference_used: boolean }>(
    '/stories/' + encodeURIComponent(storyId) + '/illustration-prompt',
    { method: 'POST', body: JSON.stringify({ prompt }) }),
  resourceStatus: () => request<ResourceStatus>('/resources/status'),
  resourceConfig: () => request<ResourceConfig>('/resources/config'),
  saveResourceConfig: (body: ResourceConfig) => request<ResourceConfig>(
    '/resources/config', { method: 'PUT', body: JSON.stringify(body) }),
  imageConfig: () => request<ImageSettings>('/images/config'),
  saveImageConfig: (config: ImageSettings) => request<ImageSettings>(
    '/images/config', { method: 'PUT', body: JSON.stringify(config) }),
  imageStatus: () => request<ImageStatus>('/images/status'),
  illustrate: (storyId: string, prompt: string, seed?: number,
               reference_asset_id?: string, denoise?: number,
               allow_low_vram = false) => request<IllustrationResult>(
    '/stories/' + encodeURIComponent(storyId) + '/illustrate',
    { method: 'POST', body: JSON.stringify({
      prompt, ...(seed === undefined ? {} : { seed }),
      ...(reference_asset_id ? { reference_asset_id, denoise: denoise ?? 0.62 } : {}),
      allow_low_vram,
    }) }),
  speechVoices: () => request<SpeechVoices>('/tts/voices'),
  async requestSpeech(storyId: string, turnId: string, voice_id: string): Promise<Blob> {
    const response = await fetch('/api/v1/stories/' + encodeURIComponent(storyId) +
      '/turns/' + encodeURIComponent(turnId) + '/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id, request_source: 'listen_button' }),
    });
    if (!response.ok) {
      const error: { detail?: string } = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Error de síntesis de voz');
    }
    return response.blob();
  },
  narrativeConfig: () => request<NarrativeConfig>('/narrative/config'),
  saveNarrativeConfig: (config: NarrativeConfig) => request<NarrativeConfig>(
    '/narrative/config', { method: 'PUT', body: JSON.stringify(config) }),
  narrativeModels: () => request<ProviderModels>('/narrative/models'),
  prepareNarrator: () => request<NarratorPrepareResult>('/narrative/prepare', { method: 'POST' }),
  koboldStatus: () => request<KoboldStatus>('/runtime/kobold/status'),
  koboldInstalled: () => request<{ models: KoboldInstalled[] }>('/runtime/kobold/installed'),
  koboldStart: (payload: KoboldLaunch) => request<KoboldStatus>(
    '/runtime/kobold/start', { method: 'POST', body: JSON.stringify(payload) }),
  koboldStop: () => request<KoboldStatus>(
    '/runtime/kobold/stop', { method: 'POST' }),
  koboldActivate: () => request<NarrativeConfig>(
    '/runtime/kobold/activate', { method: 'POST' }),
  creatorAssets: (storyId: string) => request<{ assets: CreatorMediaAsset[] }>(
    '/stories/' + encodeURIComponent(storyId) + '/creator/assets'),
  setStoryCover: (storyId: string, assetId: string | null) => request<Story>(
    '/stories/' + encodeURIComponent(storyId) + '/creator/cover',
    { method: 'PUT', body: JSON.stringify({ asset_id: assetId }) }),
  scenePresentation: (storyId: string) => request<ScenePresentation>(
    '/stories/' + encodeURIComponent(storyId) + '/creator/assets/scene'),
  async uploadCreatorAsset(storyId: string, data: {
    kind: 'cover' | 'background' | 'foreground'; label: string; caption: string;
    character_id?: string; file: File;
  }): Promise<CreatorMediaAsset> {
    const body = new FormData();
    body.append('kind', data.kind); body.append('label', data.label);
    body.append('caption', data.caption);
    if (data.character_id) body.append('character_id', data.character_id);
    body.append('file', data.file);
    const response = await fetch('/api/v1/stories/' + encodeURIComponent(storyId) +
      '/creator/assets', { method: 'POST', body });
    if (!response.ok) {
      const error: { detail?: string } = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'No se pudo guardar el recurso visual');
    }
    return response.json() as Promise<CreatorMediaAsset>;
  },
  editCreatorAsset: (storyId: string, assetId: string, label: string, caption: string) =>
    request<CreatorMediaAsset>('/stories/' + encodeURIComponent(storyId) +
      '/creator/assets/' + encodeURIComponent(assetId),
      { method: 'PUT', body: JSON.stringify({ label, caption }) }),
  deleteCreatorAsset: (storyId: string, assetId: string) =>
    request<void>('/stories/' + encodeURIComponent(storyId) + '/creator/assets/' +
      encodeURIComponent(assetId), { method: 'DELETE' }),
  creatorBlueprint: (id: string) => request<CreatorBlueprint>(
    '/stories/' + encodeURIComponent(id) + '/creator'),
  saveCreatorBlueprint: (id: string, input: CreatorBlueprintDraft) => request<CreatorBlueprint>(
    '/stories/' + encodeURIComponent(id) + '/creator',
    { method: 'PUT', body: JSON.stringify(input) }),
  worldState: (storyId: string) => request<WorldStateDocument>(
    '/stories/' + encodeURIComponent(storyId) + '/world-state'),
  saveWorldState: (storyId: string, expected_revision: number, state: WorldStateData) =>
    request<WorldStateDocument>('/stories/' + encodeURIComponent(storyId) + '/world-state',
      { method: 'PUT', body: JSON.stringify({ expected_revision, state }) }),
  worldTurnSnapshot: (storyId: string, turnId: string) => request<WorldTurnSnapshot>(
    '/stories/' + encodeURIComponent(storyId) + '/world-state/turns/' +
    encodeURIComponent(turnId)),
  lorebookEntries: (id: string) => request<{ entries: LorebookEntry[] }>(
    '/stories/' + encodeURIComponent(id) + '/lorebook'),
  lorebookTurnSnapshot: (storyId: string, turnId: string) =>
    request<LorebookTurnSnapshot>(
      '/stories/' + encodeURIComponent(storyId) + '/lorebook/turns/' +
      encodeURIComponent(turnId)),
  saveLorebookEntry: (id: string, entry: LorebookEntryDraft, entryId?: string) =>
    request<LorebookEntry>('/stories/' + encodeURIComponent(id) + '/lorebook' +
      (entryId ? '/' + encodeURIComponent(entryId) : ''),
    { method: entryId ? 'PUT' : 'POST', body: JSON.stringify(entry) }),
  deleteLorebookEntry: (id: string, entryId: string) => request<void>(
    '/stories/' + encodeURIComponent(id) + '/lorebook/' + encodeURIComponent(entryId),
    { method: 'DELETE' }),
  previewLorebook: (id: string, query: string, budget_chars = 6000) =>
    request<LorebookPreview>('/stories/' + encodeURIComponent(id) + '/lorebook/preview',
    { method: 'POST', body: JSON.stringify({ query, budget_chars }) }),
  creatorCharacters: (id: string) => request<{characters: CreatorCharacter[]}>(
    '/stories/' + encodeURIComponent(id) + '/creator/characters'),
  saveCreatorCharacter: (id: string, input: CreatorCharacterDraft, characterId?: string) =>
    request<CreatorCharacter>('/stories/' + encodeURIComponent(id) +
      '/creator/characters' + (characterId ? '/' + encodeURIComponent(characterId) : ''),
      {method: characterId ? 'PUT' : 'POST', body: JSON.stringify(input)}),
  startCreatorOpening: (id: string, index: number) => request<StoryTurn>(
    '/stories/' + encodeURIComponent(id) + '/creator/opening',
    {method: 'POST', body: JSON.stringify({index})}),
  stories: () => request<{ stories: Story[] }>('/stories'),
  story: (storyId: string) => request<Story>(
    '/stories/' + encodeURIComponent(storyId)),
  storyBranches: (storyId: string) => request<BranchTree>(
    '/stories/' + encodeURIComponent(storyId) + '/branches'),
  async importStoryArchive(file: File, asCopy = false): Promise<{
    root_story_id: string; restored_stories: number;
    restored_files: number; story_ids: string[];
    imported_as_copy: boolean; original_root_story_id: string;
    story_id_map: Record<string, string>;
  }> {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/v1/stories/archive/import?as_copy=' + String(asCopy),
      { method: 'POST', body });
    if (!response.ok) {
      const payload: { detail?: string } = await response.json().catch(() => ({}));
      throw new Error(payload.detail || 'No se pudo restaurar el respaldo');
    }
    return response.json();
  },
  createStory: (title: string, premise: string, protagonist_name = 'Protagonista') => request<Story>(
    '/stories', { method: 'POST', body: JSON.stringify({ title, premise, protagonist_name }) }),
  forkStory: (storyId: string, until_turn_id: string | null = null) => request<Story>(
    '/stories/' + encodeURIComponent(storyId) + '/fork',
    { method: 'POST', body: JSON.stringify({ until_turn_id }) }),
  updateStoryCanon: (storyId: string, canon: string) => request<Story>(
    '/stories/' + encodeURIComponent(storyId) + '/canon',
    { method: 'PATCH', body: JSON.stringify({ canon }) }),
  renameProtagonist: (storyId: string, name: string) => request<Story>(
    '/stories/' + encodeURIComponent(storyId) + '/protagonist',
    { method: 'PATCH', body: JSON.stringify({ name }) }),
  async uploadSceneImage(storyId: string, file: File): Promise<Story> {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/v1/stories/' + encodeURIComponent(storyId) + '/scene-image', {
      method: 'POST', body: form,
    });
    if (!response.ok) {
      const payload: { detail?: string } = await response.json().catch(() => ({}));
      throw new Error(payload.detail || 'Error al importar la ilustración');
    }
    return response.json() as Promise<Story>;
  },
  storyTurns: (storyId: string) => request<{ turns: StoryTurn[] }>(
    '/stories/' + encodeURIComponent(storyId) + '/turns'),
  searchStoryMemory: (storyId: string, query: string) => request<EpisodicSearch>(
    '/stories/' + encodeURIComponent(storyId) + '/memory/search?q=' +
    encodeURIComponent(query)),
  inspectStoryContext: (storyId: string, input_text: string, mode: StoryTurn['mode']) =>
    request<ContextPreview>('/stories/' + encodeURIComponent(storyId) +
      '/context/preview', { method: 'POST', body: JSON.stringify({ input_text, mode }) }),
  cancelNarration: (storyId: string, requestId: string) => request<{
    request_id: string; cancel_requested: boolean;
  }>('/stories/' + encodeURIComponent(storyId) + '/generate/' +
    encodeURIComponent(requestId) + '/cancel', { method: 'POST' }),
  async streamTurn(
    storyId: string,
    body: { mode: StoryTurn['mode']; input_text: string; request_id: string },
    signal: AbortSignal,
    onEvent: (data: GenerationEvent) => void,
  ): Promise<void> {
    const response = await fetch('/api/v1/stories/' + encodeURIComponent(storyId) + '/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    if (!response.ok) {
      let error = 'Error HTTP ' + response.status;
      try {
        const payload = await response.json() as { detail?: string };
        error = payload.detail || error;
      } catch { /* Response may not be JSON. */ }
      throw new Error(error);
    }
    if (!response.body) throw new Error('El proveedor no envió un flujo de datos.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    function dispatch(packet: string) {
      let name = '';
      let data = '';
      for (const line of packet.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (name && data && (name === 'delta' || name === 'done' || name === 'error' || name === 'status')) {
        onEvent({ event: name, data: JSON.parse(data) } as GenerationEvent);
      }
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        let i = buffer.indexOf('\n\n');
        while (i !== -1) {
          dispatch(buffer.slice(0, i));
          buffer = buffer.slice(i + 2);
          i = buffer.indexOf('\n\n');
        }
        if (done) {
          if (buffer.trim()) dispatch(buffer.trim());
          break;
        }
      }
    } finally { reader.releaseLock(); }
  },
};
export function size(bytes?: number | null): string {
  if (bytes == null) return 'Tamaño desconocido';
  if (bytes < 1024) return String(bytes) + ' B';
  const unit = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, unit)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][unit];
}
export function downloads(n: CatalogEntry): string {
  return new Intl.NumberFormat('es-CR', { notation: 'compact' }).format(n.downloads);
}
