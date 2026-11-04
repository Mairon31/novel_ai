export type ModelRole = 'narrator' | 'image' | 'tts';
export type Page = 'inicio' | 'modelos' | 'descargas' | 'ajustes' | 'diagnostico';
export type CatalogEntry = {
  repo_id: string; revision: string | null; description: string;
  downloads: number; likes: number; gated: boolean; license: string;
  updated?: string; role: ModelRole;
};
export type SearchResponse = {
  results: CatalogEntry[]; source: string; role: ModelRole; query: string;
  installation_supported: boolean; cached_seconds: number;
};
export type Variant = {
  filename: string; size_bytes: number | null;
  sha256: string | null; supported: boolean;
};
export type ModelDetail = {
  repo_id: string; revision: string; license: string; gated: boolean;
  variants: Variant[]; supports_install: boolean; url: string;
};
export type InstalledModel = {
  id: string; repo_id: string; revision: string; filename: string;
  size_bytes: number; sha256: string; filepath: string;
  integrity_status: string; created_at: number;
};
export type DownloadJob = {
  id: string; repo_id: string; revision: string; filename: string;
  expected_size: number | null; expected_sha256: string | null;
  received_bytes: number; status: string; error: string | null;
  created_at: number; updated_at: number;
};
export type Settings = {
  setup_complete: boolean; language: string; image_mode: 'scene' | 'manual' | 'off';
  tts_enabled: boolean; tts_autoread: boolean; models_dir: string;
};
export type Hardware = {
  os: string; os_release: string; cpu: string; logical_cores: number;
  ram_total_mb: number; ram_available_mb: number; storage_free_gb: number;
  device_options: string[]; fit_is_estimate: boolean;
  gpus: Array<{ index: number; name: string; backend: string;
    vram_total_mb: number; vram_free_mb: number; driver: string }>;
};
export type Health = {
  status: string; version: string; model_hub: string;
  llm_runtime: string; image_runtime: string; tts_runtime: string;
};
