import type { CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail, ModelRole, SearchResponse, Settings } from './types';

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
};
export function size(bytes?: number | null): string {
  if (bytes == null) return 'Tamaño desconocido';
  if (bytes < 1024) return String(bytes) + ' B';
  const unit = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, unit)).toFixed(1) + ' ' + ['B', 'KB', 'GB', 'TB'][unit === 2 ? 2 : unit === 1 ? 1 : unit === 3 ? 3 : 0];
}
export function downloads(n: CatalogEntry): string {
  return new Intl.NumberFormat('es-CR', { notation: 'compact' }).format(n.downloads);
}
