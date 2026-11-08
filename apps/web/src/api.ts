import i18n from './i18n';
import { fetchWithApiError, responseFailure } from './apiErrors';
import type { VisualPreflightStatus, VisualPreparationPlan } from './types';
import type { CatalogEntry, DownloadJob, Hardware, Health, InstalledModel, ModelDetail, ModelRole, SearchResponse, ModelCardResponse, Settings, NarrativeConfig, ProviderModels, Story, StoryTurn, GenerationEvent, KoboldStatus, KoboldInstalled, KoboldLaunch, WorkspacePreferences, About, Updates, RuntimeDiagnostics, NetworkCapabilities, ProviderCredentialStatus, RemoteWorker, WorkerProbe, WorkerBenchmark, ImageSettings, ImageStatus, ImageSamplerOptions, CheckpointCatalog, CheckpointDownload, CheckpointInstalled, ComfyLaunchConfig, ComfyLaunchValidation, ComfyRuntimeStatus, ComfyRuntimeLogs, LoraStatus, IllustrationResult, SpeechVoices, SpeechPreferences, PiperSynthesisConfig, PiperVoiceCatalog, PiperVoiceJob, NarratorPrepareResult, VisualState, VisualCharacterDraft, VisualCharacter, ResourceConfig, ResourceStatus, ScenePlan, ScenePlanInput, CreatorBlueprint, CreatorBlueprintDraft, CreatorCharacter, CreatorCharacterDraft, CreatorMediaAsset, SpriteExpression, SpriteDraft, NewSpriteDraft, IdentityAdapterStatus, MattingStatus, ScenePresentation, ModelStorage, StoryHubPack, GeneratedStoryDraft, LorebookEntry, LorebookEntryDraft, LorebookPreview, LorebookTurnSnapshot, WorldStateData, WorldStateDocument, WorldTurnSnapshot, EpisodicSearch, ContextPreview, BranchTree, VisualDirectorPreview, VisualDirectorIntent } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithApiError('/api/v1' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw await responseFailure(response);
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
  previewVisualDirector: (storyId: string, intent: VisualDirectorIntent) =>
    request<VisualDirectorPreview>('/stories/' + encodeURIComponent(storyId) +
      '/visual-director/preview', json({ intent })),
  registerVisualBackground: (storyId: string, assetId: string, expected_cache_key: string) =>
    request<VisualDirectorPreview>('/stories/' + encodeURIComponent(storyId) +
      '/visual-director/backgrounds/' + encodeURIComponent(assetId),
      json({ expected_cache_key })),
  applyVisualBackground: (storyId: string, assetId: string, expected_cache_key: string) =>
    request<{ selected_asset_id: string; action: string; background_cached: boolean }>(
      '/stories/' + encodeURIComponent(storyId) + '/visual-director/apply',
      json({ asset_id: assetId, expected_cache_key })),
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
  imageSamplerOptions: () => request<ImageSamplerOptions>('/images/sampler-options'),
  comfyRuntimeConfig: () => request<ComfyLaunchConfig>('/images/runtime/config'),
  comfyRuntimeValidate: (config: ComfyLaunchConfig) =>
    request<ComfyLaunchValidation>('/images/runtime/validate', json(config)),
  comfyRuntimeSave: (config: ComfyLaunchConfig) =>
    request<ComfyLaunchConfig>('/images/runtime/config', {
      method: 'PUT', body: JSON.stringify(config),
    }),
  comfyRuntimeStatus: () => request<ComfyRuntimeStatus>('/images/runtime/status'),
  comfyRuntimeStart: () => request<ComfyRuntimeStatus>('/images/runtime/start', {
    method: 'POST',
  }),
  comfyRuntimeStop: () => request<ComfyRuntimeStatus>('/images/runtime/stop', {
    method: 'POST',
  }),
  comfyRuntimeLogs: () => request<ComfyRuntimeLogs>('/images/runtime/logs'),
  checkpointLookup: (repo_id: string) => request<CheckpointCatalog>(
    '/images/checkpoints/lookup?repo_id=' + encodeURIComponent(repo_id)),
  checkpointInstalled: () => request<CheckpointInstalled>('/images/checkpoints/installed'),
  checkpointDownloads: () => request<{ downloads: CheckpointDownload[] }>(
    '/images/checkpoints/downloads'),
  checkpointInstall: (input: {repo_id: string; filename: string; revision: string}) =>
    request<CheckpointDownload>('/images/checkpoints/install', json(input)),
  checkpointControl: (jobId: string, action: 'pause' | 'resume' | 'cancel') =>
    request<CheckpointDownload>('/images/checkpoints/downloads/' +
      encodeURIComponent(jobId) + '/' + action, { method: 'POST' }),

  imageLoras: () => request<LoraStatus>('/images/loras'),
  illustrate: (storyId: string, prompt: string, seed?: number,
               reference_asset_id?: string, denoise?: number,
               allow_low_vram = false, apply_character_loras = false) => request<IllustrationResult>(
    '/stories/' + encodeURIComponent(storyId) + '/illustrate',
    { method: 'POST', body: JSON.stringify({
      prompt, ...(seed === undefined ? {} : { seed }),
      ...(reference_asset_id ? { reference_asset_id, denoise: denoise ?? 0.62 } : {}),
      allow_low_vram, apply_character_loras,
    }) }),
  speechVoices: () => request<SpeechVoices>('/tts/voices'),
  piperCatalog: () => request<PiperVoiceCatalog>('/tts/catalog'),
  piperJobs: () => request<{ downloads: PiperVoiceJob[] }>('/tts/downloads'),
  installPiperVoice: (voice_id: string) =>
    request<PiperVoiceJob>('/tts/install', json({ voice_id })),
  controlPiperVoice: (jobId: string, action: 'pause' | 'resume' | 'cancel') =>
    request<PiperVoiceJob>('/tts/downloads/' + encodeURIComponent(jobId) +
      '/' + action, { method: 'POST' }),
  async previewPiperVoice(voice_id: string, text: string): Promise<Blob> {
    const response = await fetchWithApiError('/api/v1/tts/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id, text, request_source: 'preview_button' }),
    });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.voicePreviewError');
    }
    return response.blob();
  },
  speechPreferences: () => request<SpeechPreferences>('/tts/config'),
  piperSynthesisConfig: () => request<PiperSynthesisConfig>('/tts/synthesis-config'),
  savePiperSynthesisConfig: (params: PiperSynthesisConfig) =>
    request<PiperSynthesisConfig>('/tts/synthesis-config', {
      method: 'PUT', body: JSON.stringify(params),
    }),
  saveSpeechPreferences: (default_voice_id: string) =>
    request<SpeechPreferences>('/tts/config', {
      method: 'PUT', body: JSON.stringify({ default_voice_id }),
    }),
  async requestSpeech(storyId: string, turnId: string, voice_id: string): Promise<Blob> {
    const response = await fetchWithApiError('/api/v1/stories/' + encodeURIComponent(storyId) +
      '/turns/' + encodeURIComponent(turnId) + '/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id, request_source: 'listen_button' }),
    });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.voiceSynthesisError');
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
    character_id?: string; expression?: SpriteExpression; pose?: string; file: File;
  }): Promise<CreatorMediaAsset> {
    const body = new FormData();
    body.append('kind', data.kind); body.append('label', data.label);
    body.append('caption', data.caption);
    if (data.character_id) body.append('character_id', data.character_id);
    if (data.expression) body.append('expression', data.expression);
    if (data.pose) body.append('pose', data.pose);
    body.append('file', data.file);
    const response = await fetchWithApiError('/api/v1/stories/' + encodeURIComponent(storyId) +
      '/creator/assets', { method: 'POST', body });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.saveVisualError');
    }
    return response.json() as Promise<CreatorMediaAsset>;
  },
  async importCreatorExpressionSheet(storyId: string, characterId: string, data: {
    caption: string; pose: string; layout: 'horizontal' | 'vertical'; file: File;
  }): Promise<{ assets: CreatorMediaAsset[]; count: number }> {
    const body = new FormData();
    body.append('caption', data.caption); body.append('pose', data.pose);
    body.append('layout', data.layout); body.append('file', data.file);
    const response = await fetchWithApiError('/api/v1/stories/' + encodeURIComponent(storyId) +
      '/creator/characters/' + encodeURIComponent(characterId) + '/expression-sheet',
      { method: 'POST', body });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.importExpressionError');
    }
    return response.json() as Promise<{ assets: CreatorMediaAsset[]; count: number }>;
  },
  identityAdapterStatus: () => request<IdentityAdapterStatus>(
    '/images/identity-adapter/status'),
  mattingStatus: () => request<MattingStatus>(
    '/images/matting/status'),
  spriteDrafts: (storyId: string) => request<{drafts: SpriteDraft[]}>(
    '/stories/' + encodeURIComponent(storyId) + '/creator/sprite-drafts'),
  startSpriteDraft: (storyId: string, characterId: string, input: NewSpriteDraft) =>
    request<SpriteDraft>('/stories/' + encodeURIComponent(storyId) +
      '/creator/characters/' + encodeURIComponent(characterId) + '/sprite-drafts', json(input)),
  generateSpriteExpression: (storyId: string, draftId: string,
                            expression: SpriteExpression, allowLowVram = false) =>
    request<SpriteDraft>('/stories/' + encodeURIComponent(storyId) +
      '/creator/sprite-drafts/' + encodeURIComponent(draftId) +
      '/expressions/' + expression, json({ allow_low_vram: allowLowVram })),
  approveSpriteDraft: (storyId: string, draftId: string,
                       acceptAlignmentWarnings = false) =>
    request<{count: number; assets: CreatorMediaAsset[]; approved: boolean}>(
      '/stories/' + encodeURIComponent(storyId) + '/creator/sprite-drafts/' +
      encodeURIComponent(draftId) + '/approve',
      json({ accept_alignment_warnings: acceptAlignmentWarnings })),
  discardSpriteDraft: (storyId: string, draftId: string) =>
    request<void>('/stories/' + encodeURIComponent(storyId) +
      '/creator/sprite-drafts/' + encodeURIComponent(draftId), { method: 'DELETE' }),
  editCreatorAsset: (storyId: string, assetId: string, label: string, caption: string,
    expression?: SpriteExpression, pose?: string) =>
    request<CreatorMediaAsset>('/stories/' + encodeURIComponent(storyId) +
      '/creator/assets/' + encodeURIComponent(assetId),
      { method: 'PUT', body: JSON.stringify({ label, caption, expression, pose }) }),
  deleteCreatorAsset: (storyId: string, assetId: string) =>
    request<void>('/stories/' + encodeURIComponent(storyId) + '/creator/assets/' +
      encodeURIComponent(assetId), { method: 'DELETE' }),
  creatorBlueprint: (id: string) => request<CreatorBlueprint>(
    '/stories/' + encodeURIComponent(id) + '/creator'),
  visualPreflight: (id: string) => request<VisualPreflightStatus>(
    '/stories/' + encodeURIComponent(id) + '/visual-preflight'),
  visualPreparationPlan: (id: string) => request<VisualPreparationPlan>(
    '/stories/' + encodeURIComponent(id) + '/visual-preflight/plan'),
  chooseVisualMode: (id: string, text_only: boolean) => request<VisualPreflightStatus>(
    '/stories/' + encodeURIComponent(id) + '/visual-preflight/choice',
    { method: 'PUT', body: JSON.stringify({ text_only }) }),
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
  draftStoryWithAI: (input: {
    idea: string; protagonist_name: string; genre: string; tone: string;
  }) => request<{ draft: GeneratedStoryDraft; saved: boolean;
    stages_completed: number; model: string }>('/creator/assistant/draft', json(input)),
  regenerateAIDraft: (input: {
    draft: GeneratedStoryDraft; section: 'plot' | 'openings' | 'characters' | 'lore';
    instruction: string;
  }) => request<{ draft: GeneratedStoryDraft; section: string;
    saved: boolean; model: string; generation_budget?: {
      context_characters: number; input_tokens_estimate: number;
      max_output_tokens: number; estimate_only: boolean;
    } }>('/creator/assistant/regenerate', json(input)),
  installAIDraft: (draft: GeneratedStoryDraft) => request<{
    story: Story; source: string; characters_installed: number;
    lore_installed: number; openings_installed: number; generated_media: number;
  }>('/creator/assistant/install', json(draft)),
  storyHub: () => request<{ packs: StoryHubPack[]; source: string;
    community_online: boolean }>('/story-hub'),
  storyHubDetail: (id: string) => request<StoryHubPack>(
    '/story-hub/' + encodeURIComponent(id)),
  installStoryPack: (id: string, protagonist_name: string) => request<{
    story: Story; package_id: string; version: string;
    characters_installed: number; lore_installed: number; openings_installed: number;
  }>('/story-hub/' + encodeURIComponent(id) + '/install',
    { method: 'POST', body: JSON.stringify({ protagonist_name }) }),
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
    const response = await fetchWithApiError('/api/v1/stories/archive/import?as_copy=' + String(asCopy),
      { method: 'POST', body });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.restoreBackupError');
    }
    return response.json();
  },
  createStory: (title: string, premise: string, protagonist_name = 'Protagonist') => request<Story>(
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
    const response = await fetchWithApiError('/api/v1/stories/' + encodeURIComponent(storyId) + '/scene-image', {
      method: 'POST', body: form,
    });
    if (!response.ok) {
      throw await responseFailure(response, 'apiClient.importIllustrationError');
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
    const response = await fetchWithApiError('/api/v1/stories/' + encodeURIComponent(storyId) + '/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw await responseFailure(response, 'apiClient.generationError');
    if (!response.body) throw new Error(i18n.t('apiClient.noStreamError'));
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
  if (bytes == null) return i18n.t('apiClient.unknownSize');
  if (bytes < 1024) return String(bytes) + ' B';
  const unit = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, unit)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][unit];
}
export function downloads(n: CatalogEntry, locale = i18n.language): string {
  return new Intl.NumberFormat(locale, { notation: 'compact' }).format(n.downloads);
}
