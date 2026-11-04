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

export type NarrativeConfig = {
  provider: 'ollama' | 'koboldcpp';
  base_url: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  num_ctx: number;
  device: 'auto' | 'cpu';
};
export type ProviderModels = {
  online: boolean; provider: string; models: string[];
  selected: string; device: string; error?: string;
};
export type Story = {
  id: string; title: string; premise: string;
  created_at: number; updated_at: number;
};
export type StoryTurn = {
  id: string; story_id: string; request_id: string;
  mode: 'say' | 'do' | 'story' | 'continue';
  input_text: string; assistant_text: string;
  model: string; created_at: number;
};
export type GenerationEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { turn: StoryTurn; replayed: boolean } }
  | { event: 'error'; data: { message: string } };

export type KoboldStatus = {
  status: 'stopped' | 'starting' | 'ready' | 'exited';
  owns_process: boolean; pid?: number; exit_code?: number | null;
  port?: number; model_filename?: string; gpu_layers?: number;
  base_url?: string;
};
export type KoboldInstalled = { id: string; filename: string; size_bytes: number };
export type KoboldLaunch = {
  executable: string; installed_id: string; gpu_layers: number;
  contextsize: number; port: number;
};
