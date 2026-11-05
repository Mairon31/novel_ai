import type { CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail, ModelRole, SearchResponse, Settings, NarrativeConfig, ProviderModels, Story, StoryTurn, GenerationEvent, KoboldStatus, KoboldInstalled, KoboldLaunch, WorkspacePreferences, About, Updates, RuntimeDiagnostics, NetworkCapabilities, ProviderCredentialStatus, RemoteWorker, WorkerProbe, WorkerBenchmark, ImageSettings, ImageStatus, IllustrationResult, SpeechVoices, NarratorPrepareResult, VisualState, VisualCharacterDraft, VisualCharacter } from './types';

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
  search: (query: string, role: ModelRole) =>
    request<SearchResponse>('/models/search?q=' + encodeURIComponent(query) +
      '&role=' + encodeURIComponent(role)),
  details: (repo: string) => request<ModelDetail>('/models/' + repo.split('/').map(encodeURIComponent).join('/')),
  installed: () => request<{ models: InstalledModel[] }>('/models/installed'),
  downloads: () => request<{ downloads: DownloadJob[] }>('/downloads'),
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
  imageConfig: () => request<ImageSettings>('/images/config'),
  saveImageConfig: (config: ImageSettings) => request<ImageSettings>(
    '/images/config', { method: 'PUT', body: JSON.stringify(config) }),
  imageStatus: () => request<ImageStatus>('/images/status'),
  illustrate: (storyId: string, prompt: string, seed?: number,
               reference_asset_id?: string, denoise?: number) => request<IllustrationResult>(
    '/stories/' + encodeURIComponent(storyId) + '/illustrate',
    { method: 'POST', body: JSON.stringify({
      prompt, ...(seed === undefined ? {} : { seed }),
      ...(reference_asset_id ? { reference_asset_id, denoise: denoise ?? 0.62 } : {}),
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
  stories: () => request<{ stories: Story[] }>('/stories'),
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
