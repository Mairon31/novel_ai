import type { CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail, ModelRole, SearchResponse, Settings, NarrativeConfig, ProviderModels, Story, StoryTurn, GenerationEvent } from './types';

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
  narrativeConfig: () => request<NarrativeConfig>('/narrative/config'),
  saveNarrativeConfig: (config: NarrativeConfig) => request<NarrativeConfig>(
    '/narrative/config', { method: 'PUT', body: JSON.stringify(config) }),
  narrativeModels: () => request<ProviderModels>('/narrative/models'),
  stories: () => request<{ stories: Story[] }>('/stories'),
  createStory: (title: string, premise: string) => request<Story>(
    '/stories', { method: 'POST', body: JSON.stringify({ title, premise }) }),
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
      if (name && data && (name === 'delta' || name === 'done' || name === 'error')) {
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
