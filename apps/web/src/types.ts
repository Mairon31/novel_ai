export type ModelRole = 'narrator' | 'image' | 'tts';
export type Page = 'inicio' | 'crear' | 'modelos' | 'descargas' | 'ajustes' | 'diagnostico';
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
export type ModelFitVariant = {
  filename: string; quantization: string | null;
  fit: 'full_gpu' | 'partial_offload' | 'cpu' | 'too_large' | 'unsupported' | 'unknown';
  estimated_required_bytes: number | null; estimated_kv_bytes: number | null;
  gpu_share: number; disk_ok: boolean | null; note: string;
};
export type HardwareFit = {
  context_tokens: number; gpu: Hardware['gpus'][number] | null;
  vram_usable_bytes: number; ram_usable_bytes: number;
  metadata_source: 'gguf_header' | 'fallback_estimate';
  architecture: string | null; parameter_count: number | null;
  confidence: string; warning: string;
  recommended_filename: string | null; variants: ModelFitVariant[];
};
export type ModelCardResponse = { readme: string; truncated: boolean; available: boolean };
export type ModelDetail = {
  repo_id: string; revision: string; license: string; gated: boolean;
  variants: Variant[]; supports_install: boolean; url: string;
  author?: string; downloads?: number; likes?: number;
  pipeline_tag?: string | null;
  last_modified?: string | null; library?: string | null;
  tags?: string[]; summary?: string; base_model?: string | string[] | null;
  hardware_fit?: HardwareFit;
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
  provider: 'ollama' | 'koboldcpp' | 'openrouter' | 'worker';
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
  worker_id: string;
};
export type ProviderModels = {
  online: boolean; provider: string; models: string[];
  selected: string; device: string; error?: string;
};
export type Story = {
  id: string; title: string; premise: string;
  protagonist_name: string; canon: string; origin_story_id?: string | null; origin_turn_id?: string | null; scene_image_url: string | null;
  created_at: number; updated_at: number;
};
export type StoryTurn = {
  id: string; story_id: string; request_id: string;
  mode: 'say' | 'do' | 'story' | 'continue';
  input_text: string; assistant_text: string;
  model: string; created_at: number;
};
export type GenerationEvent =
  | { event: 'status'; data: { phase: 'preparing' | 'connecting' | 'streaming'; message: string } }
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

export type RemoteWorker = {
  id: string; name: string; url: string; role: string; created_at: number;
};
export type WorkerGpu = {
  index: number; name: string; vram_total_mb: number;
  vram_used_mb: number; utilization_percent: number;
};
export type WorkerHealth = {
  engine_status: string; active_requests: number;
  completed_requests: number; failed_requests: number;
  last_ttft_ms: number | null; avg_ttft_ms: number | null;
  avg_duration_ms: number | null; gpu: WorkerGpu[];
};
export type WorkerProbe = {
  id: string; online: boolean; models: string[];
  role: string; error?: string; latency_ms?: number;
  health?: WorkerHealth | null;
};

export type WorkerBenchmark = {
  success: boolean; model: string; duration_ms: number;
  ttft_ms: number | null; output_characters: number;
  error?: string; gpu?: WorkerGpu[]; note?: string;
};

export type ImageSettings = {
  provider: 'comfyui'; base_url: string; checkpoint: string;
  width: number; height: number; steps: number; cfg: number; negative_prompt: string;
};
export type ImageStatus = {
  online: boolean; provider: string; checkpoints: string[]; error: string | null;
};
export type IllustrationResult = {
  story: Story; asset_id?: string; seed: number; checkpoint: string; duration_ms: number; cached: boolean;
};
export type SpeechVoices = {
  engine: 'piper'; available: boolean; device: string; on_demand_only: boolean;
  models_dir: string; voices: Array<{ id: string; name: string }>;
};

export type NarratorPrepareResult = {
  ready: boolean; provider: string; model: string; duration_ms: number;
  first_text_ms: number | null; message: string;
};

export type VisualScene = {
  id: string; story_id: string; location: string;
  source_turn_id: string | null; detection: 'initial' | 'heuristic' | 'confirmed';
  created_at: number;
};
export type VisualAsset = {
  id: string; story_id: string; scene_id: string; file_name: string;
  content_sha256: string; origin: 'manual' | 'comfyui';
  prompt: string; checkpoint: string | null; seed: number | null;
  created_at: number; selected: boolean; url: string;
};
export type VisualCharacter = {
  id: string; story_id: string; name: string; appearance: string;
  outfit: string; distinguishing_features: string;
  revision: number; updated_at: number; reference_asset_id: string | null;
};
export type VisualCharacterDraft = Pick<VisualCharacter,
  'name' | 'appearance' | 'outfit' | 'distinguishing_features'>;
export type VisualState = {
  current_scene: VisualScene; scenes: VisualScene[];
  assets: VisualAsset[]; characters: VisualCharacter[];
  selected_asset_id: string | null;
};

export type ResourceConfig = {
  mode: 'monitor' | 'guard'; gpu_index: number; minimum_free_mib: number;
  serialize_local_gpu: boolean;
};
export type ResourceStatus = {
  policy: ResourceConfig; status: 'above_reserve' | 'below_reserve' | 'unknown';
  gpus: Array<{ index: number; name: string; total_mib: number;
    used_mib: number; free_mib: number; gpu_utilization_percent: number | null }>;
  selected_gpu: ResourceStatus['gpus'][number] | null;
  observed_at: number; message: string; monitor_only: boolean;
  workload: {active: {kind: string; started_at: number} | null;
             serialization_enabled: boolean};
};

export type ScenePlan = {
  scene_id: string; story_id: string;
  shot: 'wide' | 'medium' | 'closeup';
  lighting: 'natural' | 'sunset' | 'night' | 'interior' | 'dramatic';
  mood: string; direction: string; visible_character_ids: string[];
  reference_character_id: string | null; revision: number; updated_at: number | null;
};
export type ScenePlanInput = Pick<ScenePlan, 'shot' | 'lighting' | 'mood' | 'direction'
  | 'visible_character_ids' | 'reference_character_id'>;

export type CreatorBlueprint = {
  story_id: string; synopsis: string; player_plot: string; ai_plot: string;
  guidelines: string; reminder: string; opening_scenarios: string[];
  genre: string; tags: string[]; language: string; updated_at: number | null;
};
export type CreatorBlueprintDraft = Omit<CreatorBlueprint, 'story_id'|'updated_at'>;
export type CreatorCharacter = {
  id: string; story_id: string; name: string; description: string;
  personality: string; dialogue_examples: string; visual_character_id: string | null;
  voice_id: string; updated_at: number;
};
export type CreatorCharacterDraft = Omit<CreatorCharacter, 'id'|'story_id'|'updated_at'>;

export type CreatorMediaAsset = {
  id: string; story_id: string; kind: 'background' | 'foreground';
  label: string; caption: string; character_id: string | null;
  filename: string; media_type: string; created_at: number; url: string;
};
export type ScenePresentation = {
  background: CreatorMediaAsset | null; foreground: CreatorMediaAsset | null;
  selection: 'caption_match' | 'no_match'; context_excerpt: string; generated: false;
};
