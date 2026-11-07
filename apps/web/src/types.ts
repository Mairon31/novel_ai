export type GeneratedStoryDraft = {
  title: string; synopsis: string; player_plot: string; ai_plot: string;
  guidelines: string; reminder: string; openings: string[];
  genre: string; tags: string[]; protagonist_name: string;
  characters: Array<{ name: string; description: string; personality: string;
    dialogue_examples: string }>;
  lore: Array<{ title: string; content: string; keys: string[] }>;
};

export type ModelRole = 'narrator' | 'image' | 'tts';
export type StoryHubPack = {
  id: string; version: string; author: string; source: 'bundled-original';
  license: string; title: string; genre: string; tags: string[];
  language: string; synopsis: string; player_plot: string;
  protagonist: string; character_names: string[]; opening_previews: string[];
  character_count: number; lore_count: number; has_images: boolean;
};

export type Page = 'inicio' | 'descubrir' | 'crear' | 'modelos' | 'descargas' | 'ajustes' | 'diagnostico';
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
  cover_asset_id?: string | null; cover_image_url?: string | null;
  created_at: number; updated_at: number;
};
export type BranchTree = {
  root_story_id: string; selected_story_id: string;
  branches: Array<{
    id: string; title: string; protagonist_name: string;
    origin_story_id: string | null; origin_turn_id: string | null;
    depth: number; turn_count: number; created_at: number;
    updated_at: number; is_selected: boolean;
  }>;
};
export type StoryTurn = {
  id: string; story_id: string; request_id: string;
  mode: 'say' | 'do' | 'story' | 'continue';
  input_text: string; assistant_text: string;
  model: string; created_at: number;
};
export type EpisodicSearch = {
  fts5: boolean; source: 'player_input';
  episodes: Array<{
    turn_id: string; story_id: string; input_text: string;
    mode: StoryTurn['mode']; created_at: number; matched_terms: number;
  }>;
};
export type ContextPreview = {
  story_id: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sections: Array<{ name: string; characters: number; approx_tokens: number }>;
  total_characters: number; estimated_prompt_tokens: number;
  reserved_output_tokens: number; context_window_tokens: number;
  estimated_total_tokens: number; estimated_overflow: boolean;
  token_counts_exact: false; token_estimate_method: string;
  runtime_kv_cache_measured: false;
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
  reader_layout: 'immersive' | 'classic' | 'chat';
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
  sampler_name: 'euler' | 'euler_ancestral' | 'dpmpp_2m' | 'dpmpp_sde' |
    'dpmpp_2m_sde' | 'heun' | 'uni_pc';
  scheduler: 'normal' | 'karras' | 'exponential' | 'sgm_uniform' | 'simple';
  style_preset: 'anime_fantasy' | 'anime_cinematic' | 'anime_watercolor' | 'none';
};
export type ImageSamplerOptions = {
  online: boolean; sampler_name: string[]; scheduler: string[]; error: string | null;
};
export type ImageStatus = {
  online: boolean; provider: string; checkpoints: string[]; error: string | null;
};
export type AppliedCharacterLora = {
  character_name: string; lora_name: string; strength: number;
};
export type LoraStatus = { online: boolean; loras: string[]; error: string | null };
export type IllustrationResult = {
  story: Story; asset_id?: string; seed: number; checkpoint: string;
  duration_ms: number; cached: boolean; applied_loras: AppliedCharacterLora[];
};
export type SpeechPreferences = { default_voice_id: string };
export type PiperVoiceCatalog = {
  source: string; language_focus: string; runtime: string; engine_installed: boolean;
  note: string; voices: Array<{
    id: string; name: string; language: string; quality: string;
    installed: boolean; model_card: string;
  }>;
};
export type PiperVoiceJob = {
  id: string; voice_id: string; revision: string;
  status: 'queued' | 'downloading' | 'verifying' | 'paused' | 'failed' | 'cancelled' | 'completed';
  received_bytes: number; total_bytes: number; error: string | null;
  created_at: number; updated_at: number;
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
  render_details: {
    workflow_version?: string; loras?: AppliedCharacterLora[];
    sampler_name?: string; scheduler?: string;
    style_preset?: 'anime_fantasy' | 'anime_cinematic' | 'anime_watercolor' | 'none';
  };
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

export type VisualDirectorAction =
  | 'REUSE_BACKGROUND'
  | 'UPDATE_SPRITE_EMOTION'
  | 'GENERATE_NEW_BACKGROUND'
  | 'GENERATE_EVENT_CG';
export type VisualDirectorIntent = 'auto' | 'background' | 'emotion' | 'event';
export type VisualDirectorPreview = {
  scene_id: string;
  cache_key: string;
  context: {
    location: string; time_of_day: string; weather: string;
    shot: ScenePlan['shot']; lighting: ScenePlan['lighting'];
  };
  action: VisualDirectorAction; reason: string;
  background_asset_id: string | null;
  background_url: string | null;
  background_cached: boolean;
  inference_used: false; generation_started: false;
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
export type VisualDNA = {
  tags: string[]; seed: number | null; lora_name: string | null; lora_strength: number;
};
export type CreatorCharacter = {
  id: string; story_id: string; name: string; description: string;
  personality: string; dialogue_examples: string; visual_character_id: string | null;
  voice_id: string; visual_dna: VisualDNA; updated_at: number;
};
export type CreatorCharacterDraft = Omit<CreatorCharacter, 'id'|'story_id'|'updated_at'>;

export type WorldFact = {
  id: string; text: string; public: boolean; witness_character_ids: string[];
};
export type WorldStateData = {
  location: string; time_of_day: string; weather: string;
  present_character_ids: string[]; inventory: string[];
  relationships: Record<string, string>; flags: Record<string, boolean>;
  facts: WorldFact[];
};
export type WorldStateDocument = {
  story_id: string; revision: number; updated_at: number | null;
  state: WorldStateData;
};
export type WorldTurnSnapshot = {
  story_id: string; turn_id: string; created_at: number;
  canon: string; state: WorldStateData;
};

export type LorebookTurnSnapshot = {
  story_id: string; turn_id: string; created_at: number;
  entries: LorebookEntry[];
};

export type LorebookEntry = {
  id: string; story_id: string; title: string; content: string;
  keys: string[]; secondary_keys: string[];
  secondary_mode: 'any' | 'all'; match_whole_words: boolean;
  priority: number; enabled: boolean; always_active: boolean;
  visibility: 'world' | 'witnesses'; witness_character_ids: string[];
  created_at: number; updated_at: number;
};
export type LorebookEntryDraft = Omit<LorebookEntry, 'id'|'story_id'|'created_at'|'updated_at'>;
export type LorebookPreview = {
  entries: Array<{ id: string; title: string; priority: number; content: string }>;
  context: string; used_chars: number; budget_chars: number;
  skipped_budget: number; skipped_visibility: number;
};

export type SpriteExpression = 'neutral' | 'joy' | 'anger' | 'sadness' | 'surprise';
export type CreatorMediaAsset = {
  id: string; story_id: string; kind: 'cover' | 'background' | 'foreground';
  label: string; caption: string; character_id: string | null;
  expression: SpriteExpression; pose: string;
  filename: string; media_type: string; created_at: number; url: string;
  source: 'manual' | 'ai_reviewed';
  generation_details: {
    workflow_version?: string; checkpoint?: string; seed?: number;
    prompt_sha256?: string; lora?: { lora_name: string; strength: number };
    adapter?: { preset: string; weight: number;
      reference_sha256: string; reference_kind: string };
    matting?: { mode: NeuralCutoutMode; model: string };
    quality?: { method: string; coverage: number; author_approved: boolean };
  };
};
export type SpriteDraftSlot = {
  ready: boolean; preview_url: string | null;
  quality: { method: string; coverage: number; requires_author_review: boolean } | null;
};
export type SpriteDraft = {
  id: string; story_id: string; character_id: string; character_name: string;
  caption: string; pose: string; seed: number; checkpoint: string;
  style: string; use_lora: boolean; reference_asset_id: string | null;
  cutout_mode?: NeuralCutoutMode;
  reference_sprite_asset_id?: string | null;
  reference_mode?: 'img2img' | 'ipadapter';
  ipadapter_preset?: string; ipadapter_weight?: number;
  slots: Record<SpriteExpression, SpriteDraftSlot>;
  ready_count: number; created_at: number; updated_at: number;
  alignment_warnings?: string[];
  alignment_review_needed?: boolean;
};
export type NeuralCutoutMode =
  'chroma_green' | 'neural_rmbg2' | 'neural_birefnet_portrait' |
  'neural_birefnet_matting';
export type MattingStatus = {
  neural_available: boolean;
  modes: Array<{
    mode: NeuralCutoutMode; model: string | null;
    node: string | null; ready: boolean; reason: string;
  }>;
};
export type IdentityAdapterStatus = {
  available: boolean; presets: string[]; model_count: number;
  clip_vision_count: number; error: string | null;
};
export type NewSpriteDraft = {
  caption: string; pose: string; style: string; seed?: number;
  reference_asset_id?: string; reference_sprite_asset_id?: string;
  reference_mode: 'img2img' | 'ipadapter';
  ipadapter_preset: string; ipadapter_weight: number;
  cutout_mode: NeuralCutoutMode;
  use_lora: boolean;
};
export type SceneSprite = CreatorMediaAsset & {
  expression_target: SpriteExpression;
  speaker: boolean;
};
export type ScenePresentation = {
  background: CreatorMediaAsset | null; foreground: SceneSprite | null;
  sprites: SceneSprite[]; speaker_character_id: string | null;
  selection: 'caption_match' | 'no_match'; context_excerpt: string; generated: false;
};

export type ModelStorage = {
  models_dir: string;
  disk: { total_bytes: number; used_bytes: number; free_bytes: number };
  installed: { count: number; bytes: number };
  partial: { count: number; bytes: number };
  items: Array<{
    id: string; name: string; kind: 'installed' | 'partial';
    size_bytes: number; file_present: boolean; repo_id: string;
  }>;
  observed_at: number;
  scope: 'registered_and_partial_files_only';
};
