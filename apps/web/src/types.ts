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
  provider: 'ollama' | 'koboldcpp' | 'openrouter';
  base_url: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  num_ctx: number;
  device: 'auto' | 'cpu';
  top_k: number;
  repetition_penalty: number;
  reasoning_mode: 'auto' | 'off';
};
export type ProviderModels = {
  online: boolean; provider: string; models: string[];
  selected: string; device: string; error?: string;
};
export type Story = {
  id: string; title: string; premise: string;
  protagonist_name: string; scene_image_url: string | null;
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

export type WorkspacePreferences = {
  target_language: 'es-419' | 'en' | 'ja' | 'ko' | 'pt-BR' | 'fr';
  source_language: 'auto' | 'es' | 'en' | 'ja' | 'ko' | 'pt' | 'fr';
  narration_style: 'natural' | 'literary' | 'concise';
  translation_mode: 'off' | 'target_output';
  accent: 'violet' | 'rose' | 'teal';
  font_scale: number;
  reader_layout: 'immersive' | 'classic';
  shortcuts_enabled: boolean;
  update_channel: 'stable' | 'beta' | 'nightly';
  check_updates_on_start: boolean;
};
export type About = {
  name: string; version: string; commit: string; build_type: string;
  channel: string; models_dir: string; data_dir: string;
  os: string; python: string; auto_update_supported: boolean;
};
export type Updates = {
  channel: string; check_success: boolean; update_available: boolean;
  needs_installer: boolean; message: string;
  release: null | { version: string; name: string; url: string; channel: string;
    published_at?: string; assets: number };
};
export type RuntimeDiagnostics = {
  scope: string; updatable_from_app: boolean;
  python_packages: Record<string, string | null>;
  binaries: Record<string, string | null>;
};
export type NetworkCapabilities = {
  mode: string; shared_workspace: boolean; cloudflare_tunnel: string;
  remote_workers: string; api_key_auth: string;
  cors_management: string; message: string;
};
export type ProviderCredentialStatus = { provider: string; configured: boolean; storage: string };
