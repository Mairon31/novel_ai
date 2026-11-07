# Noble AI — API contracts and compatibility

**Status:** versioned working endpoints plus historical contract evolution. This page describes software behavior observed at individual milestones. Verify a deployed build against the current FastAPI OpenAPI schema and tests before claiming it supports a particular optional provider. **API paths, JSON field identifiers, persisted UUIDs, and existing hash-based frontend routes stay unchanged even when the user interface is translated into English.**

## P1 — narration and managed KoboldCpp

| Method and endpoint | Contract |
|---|---|
| GET/PUT `/api/v1/narrative/config` | Narrator provider (Ollama/KoboldCpp), loopback URL, model and sampling parameters |
| GET `/api/v1/narrative/models` | Models exposed by the selected engine, or `online:false` with error |
| GET/POST `/api/v1/stories` | List/create stories with a premise |
| GET `/api/v1/stories/{story_id}` | Story details |
| GET `/api/v1/stories/{story_id}/turns` | Committed turns |
| POST `/api/v1/stories/{story_id}/generate` | Streaming SSE `status/delta/done/error`; UUID request idempotency |
| GET `/api/v1/runtime/kobold/status` | Managed process state/endpoint health |
| GET `/api/v1/runtime/kobold/installed` | Registered GGUF files eligible for launch |
| POST `/api/v1/runtime/kobold/start` | Launch explicitly selected executable with a registered GGUF |
| POST `/api/v1/runtime/kobold/stop` | Stop only Noble-owned process |
| POST `/api/v1/runtime/kobold/activate` | Assign the model reported by the runtime's `/v1/models` |

Generation example:

```json
{"mode":"do","input_text":"I examine the library.","request_id":"7053aead-3e62-411f-a5d5-598c5609dbfb"}
```

`mode` is `do | say | story | continue`; empty `input_text` is permitted only for `continue`. Stream multiple `event:delta` packets, then **one `event:done` only after a successful transactional commit**, or `event:error`. A failed/canceled request must not persist a partial turn.

KoboldCpp launch example:

```json
{"executable":"C:\\Tools\\koboldcpp.exe","installed_id":"registered-model-uuid","gpu_layers":-1,"contextsize":4096,"port":5001}
```

The executable must be recognized and the GGUF registered inside managed storage. The runtime binds to loopback and does not require a CUDA GPU for CPU-only execution.

## P1.1 — workers, workspace, preferences

| Method | Endpoint | Behavior |
|---|---|---|
| GET/POST | `/api/v1/workers` | List/register remote LLM workers |
| GET | `/api/v1/workers/{uuid}/probe` | Authenticate/test token, discover advertised models |
| POST | `/api/v1/workers/{uuid}/activate` | Assign a remote narrator |
| DELETE | `/api/v1/workers/{uuid}` | Remove worker record and secret |
| GET/PATCH | `/api/v1/workspace/preferences` | Output language, reader layout, appearance and shortcuts |
| GET | `/api/v1/about` | Source version, commit and paths |
| GET | `/api/v1/runtime/diagnostics` | Read-only packages/binaries |
| GET | `/api/v1/updates` | Release metadata, **not** automatic installation |
| GET | `/api/v1/network/capabilities` | Loopback network defaults |
| GET/PUT/DELETE | `/api/v1/provider-credentials/openrouter` | Secret management without returning the actual value |
| PATCH | `/api/v1/stories/{uuid}/protagonist` | Update protagonist name |
| GET/POST | `/api/v1/stories/{uuid}/scene-image` | Read/import a scene illustration |

The separate **remote worker proxy** exposes bearer-required `GET /v1/models`, `POST /v1/chat/completions`, and health diagnostics. It is not a general remote file, process, image or speech API. Keep the main workspace on loopback; see [Workers](WORKERS.md).

## P1.2 — remote inference benchmark

`POST /api/v1/workers/{uuid}/benchmark` with `{"model":"advertised-model-id"}` runs **one explicit synthetic inference**, not a story turn. It returns success/failure, time to first content, total duration, character count, and available GPU telemetry, but does not store or return generated story prose. The worker must be registered, authenticated and online, with a model it actually advertises.

The bearer-protected remote `GET /v1/health` offers aggregate request and sampled GPU/VRAM metrics. Primary `GET /workers/{uuid}/probe` tolerates older workers that do not implement those counters.

One sample is neither p95 latency nor a physical GPU fit certification.

## P1.4 — canon, explicit engine preparation and on-demand media

| Method | Endpoint | Contract |
|---|---|---|
| PATCH | `/api/v1/stories/{uuid}/canon` | Save up to 5,000 characters of persistent canon, independent of past turn text |
| POST | `/api/v1/stories/{uuid}/fork` | Clone through `until_turn_id` inclusive, or all turns if omitted/null |
| POST | `/api/v1/narrative/prepare` | Explicit short local/worker inference warmup without committing a story turn |
| GET/PUT | `/api/v1/images/config` | Persistent local ComfyUI settings |
| GET | `/api/v1/images/status` | Bounded probe of local image runtime/checkpoints |
| POST | `/api/v1/stories/{uuid}/illustrate` | **Explicit** image render `{"prompt":"...","seed":123}`; ComfyUI must be available |
| GET | `/api/v1/tts/voices` | Installed Piper ONNX/JSON voices |
| POST | `/api/v1/stories/{uuid}/turns/{turn_id}/speech` | Manual `{"voice_id":"es_MX.onnx","request_source":"listen_button"}`; WAV; requires enabled on-demand TTS |

ComfyUI may return 409 busy, 422 invalid configuration, 503 offline, and 502/504 upstream/timeout. The narration SSE adds `status.phase=preparing|connecting|streaming` before content; old clients can ignore status frames.

Fork results include `origin_story_id` and `origin_turn_id`. They never mutate the source; a merge endpoint is not implemented. The prepare endpoint must be invoked explicitly and is not managed preloading for OpenRouter.

## P1.5 — immutable gallery and visual timeline

`GET /api/v1/stories/{uuid}/visual-state` returns `{current_scene,scenes,assets,characters,selected_asset_id}` with individual owned media URLs, `origin`, `content_sha256`, `seed`, and selection state.

- `PUT /api/v1/stories/{uuid}/scene` with `{location}`: confirm location without image generation.
- `POST /api/v1/stories/{uuid}/visual-characters` and `PUT /.../visual-characters/{uuid}`: `{name,appearance,outfit,distinguishing_features}`.
- `POST /api/v1/stories/{uuid}/illustration-prompt`: `{prompt,inference_used:false}` preview without loading models.
- `GET /api/v1/stories/{uuid}/gallery/{asset_uuid}`: retrieve a story-owned WebP.
- `POST /api/v1/stories/{uuid}/gallery/{asset_uuid}/select`: select an existing immutable gallery version.
- `POST /api/v1/stories/{uuid}/illustrate`: now also reports `asset_id` and `cached`. A matching explicit seed, enriched prompt, model config and scene may return cached output with **no ComfyUI call**.

The server validates every story/media UUID relationship. Detecting a new location never initiates diffusion by itself.

## P1.6 — reference image and GPU resource policy

Image rendering accepts optional `reference_asset_id:uuid`, `denoise:0.2..0.95`, and `allow_low_vram:boolean`, together with `prompt`/`seed`. A reference must belong to the story and pass SHA-256 checks before a local ComfyUI `POST /upload/image` and the img2img graph. Without a reference, use text-to-image.

- `GET /api/v1/resources/config` returns `{mode:"monitor"|"guard",gpu_index,minimum_free_mib,serialize_local_gpu}`.
- `PUT /api/v1/resources/config` persists validated policy. `serialize_local_gpu` defaults to `true`.
- `GET /api/v1/resources/status` reports observed NVIDIA cards, total/used/free MiB, utilization, timestamp and `above_reserve|below_reserve|unknown`.
- `GET /api/v1/resources/active` describes a currently managed local operation, if present.

Guard mode runs `nvidia-smi` **before an uncached explicit ComfyUI job**, not on every narration turn. It cannot guarantee the model fits. A one-time `allow_low_vram=true` bypasses the reserve check without saving that exception. Concurrent local engine work may return 409; there is no hidden GPU job queue.

## Scene planner, visual identity, and saved references

- `GET /api/v1/stories/{uuid}/scene-plan` returns current `scene_id,revision,shot,lighting,mood,direction,visible_character_ids,reference_character_id`.
- `PUT /api/v1/stories/{uuid}/scene-plan` accepts:

```json
{"shot":"medium","lighting":"natural","mood":"","direction":"","visible_character_ids":[],"reference_character_id":null}
```

Allowed shots: `wide|medium|closeup`; lighting: `natural|sunset|night|interior|dramatic`. Cast IDs must be story-owned.

- `POST /api/v1/stories/{uuid}/scene-plan/preview` with `{"prompt":"..."}` builds an enriched prompt and reports an automatic reference without inference.
- `PUT /api/v1/stories/{uuid}/visual-characters/{char_uuid}/reference` with `{"asset_id":"uuid"}` or null sets/clears a verified story-owned image.
- `POST /api/v1/stories/{uuid}/illustrate` can use the plan's focal-character reference when the request did not explicitly supply another; returns `reference_asset_id`.

The scene planner cannot automatically launch image generation solely from a scene change.

## API evolution after Argon audit — November 5

**Already implemented:** `POST /api/v1/stories/{id}/generate` streams `status/delta/done/error` through `narrative.stream_turn`; browser clients consume incremental fragments. Do **not** describe streaming as absent.

**Further target contracts** (some pieces subsequently implemented, see sections below):
- Stable typed response states `token/state_delta/scene_plan/done/error` and structured provider failures.
- Per-story `GET /context/preview` with exact future tokenizer budgets while preventing private context disclosure.
- Lorebook CRUD, safe triggers, priority and bounded activation.
- Future `/stage` to describe multi-layer visual decisions.
- Model download endpoints showing bytes/progress/speed, verified resume and source-hash provenance.

Prompt assembly and authoritative state changes belong to the backend, not the UI.

## Hardened SSE and disconnection contract

For `POST /api/v1/stories/{story_id}/generate`, `request_id` is an idempotent UUID. The request's `is_disconnected` state is checked before inference, between chunks, while waiting for a chunk, and before commit.

Disconnect/cancel closes the upstream HTTP stream, releases the managed GPU lease in `finally`, and **does not persist partial text**. A complete turn and its heuristic visual scene transition commit together; a failure rolls both back. Only after COMMIT may `done` emit. Repeating an already committed request ID returns its result without another inference.

These are simulated protocol guarantees; the physical time to stop model computation/free VRAM in Ollama/KoboldCpp/remote workers is not yet certified. Avoid unsupported claims such as sub-250 ms cancellation.

GGUF resumable HTTP must validate an explicitly requested 206, exact Range start/end, expected total, and actual bytes before registration.

## Explicit cancel endpoint

`POST /api/v1/stories/{story_id}/generate/{request_id}/cancel` returns:

```json
{"request_id":"uuid","cancel_requested":true}
```

`true` means a registered operation received the signal; it does **not** prove weights unloaded. `false` means the operation is not currently tracked or has already completed.

Register the operation before `StreamingResponse`, reject simultaneous duplicate UUIDs with 409, and remove the registration in `finally`. Other story/request IDs must not be affected. Poll disconnection/cancel during silent upstream waits at about 200 ms; close the pending `anext()` and remote response. No canceled turn commits or emits `done`.

The frontend combines `AbortController` with best-effort explicit cancellation when stopping, leaving the reader or switching stories. [CI #42050811867](https://github.com/Mairon31/novel_ai/actions/runs/42050811867) exercised Python cancellation under simulated waiting providers.

## Creator Studio Lorebook CRUD and preview

All paths use a valid existing story UUID, and Lorebook contents are private author data inserted into the narrator's **system** context, never a public player turn.

| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/v1/stories/{id}/lorebook` | `{entries:LorebookEntry[]}` |
| POST | `/api/v1/stories/{id}/lorebook` | 201 + new UUID entry |
| PUT | `/api/v1/stories/{id}/lorebook/{entry_id}` | Updated entry; 422 for another story |
| DELETE | `/api/v1/stories/{id}/lorebook/{entry_id}` | 204; 404 when missing |
| POST | `/api/v1/stories/{id}/lorebook/preview` | `{entries:[{id,title,priority,content}],context,used_chars,budget_chars,skipped_budget}` |

Preview example: `{"query":"I enter the forest","budget_chars":6000}`. Preview uses **only the supplied query**; real narration also considers the most recent four turns.

Entry fields: `title` length 2–100; `content` 10–3500; up to 12 primary and 8 secondary keys; `secondary_mode=any|all`, `match_whole_words`, `priority` 0–100, `enabled`, `always_active`. Primary keys required unless always active. User-supplied regular expressions are never executed. Entries that exceed the remaining 512–6000-character budget are omitted whole; forks assign new entry UUIDs.

## World state and committed snapshots

- `GET /api/v1/stories/{id}/world-state` → `{story_id,revision,updated_at,state}`. New stories report revision zero and empty state.
- `PUT /api/v1/stories/{id}/world-state` accepts `{expected_revision,state:WorldStateInput}`, returns incremented state; stale concurrent changes 409, invalid/foreign-NPC UUIDs 422.
- `GET /api/v1/stories/{id}/world-state/turns/{turn_id}` → `{story_id,turn_id,created_at,canon,state}`; 404 for missing or foreign snapshot.

`WorldStateInput`: `location` 0–200, `time_of_day` 0–80, `weather` 0–100; `present_character_ids` up to 30 owned NPC UUIDs; `inventory` up to 60 strings length 1–100; `relationships` up to 30 UUID→description mappings length 1–160; `flags` up to 60 booleans; `facts` up to 120.

`WorldFact`: `id` UUID, text length 10–360, `public` boolean, up to 16 `witness_character_ids` all from the same story. Private facts require at least one witness.

Every committed turn snapshots world state/canon together with text and scene in one SQLite transaction. Historical forks remap NPC/fact IDs and restore only selected-time canon. Legacy turns without snapshots must not be rebuilt from future state.

## Time-scoped Lorebook and Creator data

- `GET /api/v1/stories/{id}/lorebook/turns/{turn_id}` → `{story_id,turn_id,created_at,entries:[LorebookEntry]}`. Returns exactly what was saved at that turn; missing/foreign snapshots 404.
- `POST /api/v1/stories/{id}/fork` with `{"until_turn_id":"uuid"}` restores contemporaneous Lorebook entries, NPC profiles, private creator blueprint, world state and canon. A complete present-day fork uses `{"until_turn_id":null}`.
- `creator_turn_snapshots` remains an internal table. Never expose its private blueprint in public reader/API surfaces.
- Legacy turns without snapshots take an **empty fallback** when forking historically, rather than importing future spoilers.
- **Rewind here** in reader is non-destructive: confirm then create a new fork, leaving existing turns untouched.

## Character-scoped Lorebook entries

New optional fields `visibility:"world"|"witnesses"` and `witness_character_ids:string[]` (max 16, story-owned IDs). Private witnessed Lorebook content activates only when at least one associated character is present in the **confirmed** current world state; `always_active` does not bypass this. Public entries are unchanged.

Forks remap witness UUIDs via the destination NPC mappings; a missing witness does not silently turn the entry into world knowledge. The server filters prompt data; it cannot guarantee what a probabilistic LLM will infer from other context.

## HTML and EPUB3 exports

- `GET /api/v1/stories/{id}/export.html` → `200 text/html; charset=utf-8`, attachment `noble-story.html`, `Cache-Control:no-store`, `X-Content-Type-Options:nosniff`.
- `GET /api/v1/stories/{id}/export.epub` → `200 application/epub+zip`, attachment `noble-story.epub`, same no-store/nosniff behavior.
- Missing story 404. Both are self-contained for the requested branch, include historical visual snapshots where safe, and omit private Creator prompts.
- Exports escape narrative text and do not include remote image requests.
- Evidence: [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352): **217 Python / 42 Playwright PASS**.

## Episodic search and narrator context inspector

- `GET /api/v1/stories/{id}/memory/search?q=<text>&limit=6` → `{episodes:[{turn_id,story_id,mode,input_text,created_at,matched_terms}],fts5:boolean,source:"player_input"}`. Query 2–500 characters, limit 1–12; 404 unknown story. Only player input of that story is indexed, no assistant prose/Creator secrets; lexical fallback when FTS5 unavailable.
- `POST /api/v1/stories/{id}/context/preview` accepts `{input_text:string(0–3000),mode:"do"|"say"|"story"|"continue"}`; input required except `continue`.
- Response includes `story_id,messages:[{role,content}],sections:[{name,characters,approx_tokens}],total_characters,estimated_prompt_tokens,reserved_output_tokens,context_window_tokens,estimated_total_tokens,estimated_overflow,token_counts_exact:false,token_estimate_method,runtime_kv_cache_measured:false`.
- No model inference or DB writes. Preview may disclose private creator instructions and therefore belongs to an **author-only** surface.

## Family ZIP archive and independent copy import

`GET /api/v1/stories/{id}/archive.noble.zip` → application/zip attachment `noble-family.noble.zip`. 404 unknown story; 422 corrupt/limit. `manifest.json` contains:

```json
{"format":"noble-story-family","version":1,"root_story_id":"<uuid>","tables":{},"files":[{"path":"story-assets/<uuid>/images/<uuid>.webp","size":1234,"sha256":"<sha256>"}]}
```

`POST /api/v1/stories/archive/import` multipart `file=...noble.zip` → 201 `{root_story_id,restored_stories,restored_files,story_ids}`. Existing conflicts 409 by default; malformed ZIP/hashes/fields/paths 422. All content is validated before transactional restoration.

Explicit `?as_copy=true` remaps every family story/turn/scene/NPC/media/fact and structured JSON reference, preserving chronology, existing data, and logical tree. Response adds `imported_as_copy,original_root_story_id,story_id_map`. Default `as_copy=false` retains source UUIDs, refusing conflicts.

## Branch graph

`GET /api/v1/stories/{story_id}/branches` → `{root_story_id,selected_story_id,branches:[{id,title,protagonist_name,origin_story_id,origin_turn_id,depth,turn_count,created_at,updated_at,is_selected}]}`. Root and descendants in parent-before-child order, max 64 nodes, 404 unknown, 422 cycles/bad data.

Evidence: [CI #42115183293](https://github.com/Mairon31/novel_ai/actions/runs/42115183293): **226 Python / 46 Playwright PASS**; [CI #42120432384](https://github.com/Mairon31/novel_ai/actions/runs/42120432384): **231 Python / 52 Playwright**, including JSON UUID keys remapping and deep links.

## Frontend hash routes (not REST endpoints)

Existing `#/biblioteca`, `#/historia/{id}`, `#/historia/{id}/leer`, `#/creator/{id}`, `#/creator`, `#/modelos`, `#/descargas`, `#/configuracion`, `#/diagnostico`, and `#/infraestructura` are browser hash routes. UUIDs are validated; navigation/reload never generates turns. Keep these stable even when English labels are displayed.

## Deterministic visual director

- `POST /api/v1/stories/{id}/visual-director/preview` with `{intent:"auto"|"background"|"emotion"|"event"}` (default auto) → `{scene_id,context:{location,time_of_day,weather,shot,lighting},cache_key,action,background_asset_id,background_url,background_cached,reason,inference_used:false,generation_started:false}`.
- Actions: `REUSE_BACKGROUND`, `UPDATE_SPRITE_EMOTION`, `GENERATE_NEW_BACKGROUND`, `GENERATE_EVENT_CG`. Preview is a plan; no LLM, ComfyUI or TTS job.
- `POST /api/v1/stories/{id}/visual-director/backgrounds/{asset_id}` with `{expected_cache_key:"noble-bg-v1:<sha256>"}` registers an owned manual gallery asset. Invalid/foreign asset or original render signature → 422; changed context → 409.
- `POST /api/v1/stories/{id}/visual-director/apply` with `{asset_id,expected_cache_key}` selects a previously registered background, returning `{selected_asset_id,action:"REUSE_BACKGROUND",inference_used:false,generation_started:false,background_cached:true,scene_id}`; changed context/version 409, invalid file 422.

[CI #42127083317](https://github.com/Mairon31/novel_ai/actions/runs/42127083317) covered cache keys, archive/fork and local application: **239 Python / 58 Playwright / Vite PASS**.

## Sprite assets and reader compositor

- `POST /api/v1/stories/{id}/creator/assets` multipart `kind,label,caption,character_id,file`, optional `expression=neutral|joy|anger|sadness|surprise`, and `pose` of 1–32 ASCII alphanumeric/hyphen/underscore characters (default `standing`). Non-neutral expression/pose applies only to `foreground`. Invalid 422.
- `PUT /api/v1/stories/{id}/creator/assets/{asset_id}` updates `label,caption` and optional `expression,pose`; omitted optional fields remain unchanged; no file rewrite.
- `GET /api/v1/stories/{id}/creator/assets/scene` retains `background,foreground,selection,context_excerpt,generated:false` and adds `sprites:[{...asset,expression_target,speaker}]` (0–3) and `speaker_character_id` (UUID or null). Speaking requires **explicit attribution**; list order is not proof of the last speaker.
- Rows, turn snapshots, forks and v1 archives preserve expression/pose. Old archives missing them default to `neutral/standing`; extra schema fields remain prohibited.
- Selecting/crossfading sprites is local and does not start a GPU job.

Evidence: [CI #42137444723](https://github.com/Mairon31/novel_ai/actions/runs/42137444723): **247 Python / 60 Playwright / Vite PASS**.

## Character visual DNA and expression-sheet import

- `POST/PUT /api/v1/stories/{id}/creator/characters[/{npc_id}]` accepts `visual_dna:{tags:string[],seed:number|null,lora_name:string|null,lora_strength:number}`. Defaults `[]/null/null/0.8`; up to 16 casefold-unique tags length 2–64; seed 0–4294967295; LoRA path-free `.safetensors` filename; strength 0–2. Invalid or attempts to overwrite locked tags/seed 422. Legacy PUT omitting the field preserves existing DNA.
- `POST /api/v1/stories/{id}/creator/characters/{npc_id}/expression-sheet` multipart `caption,pose,layout=horizontal|vertical,file` (PNG/WebP max 12 MiB). Requires exactly five equally sized **transparent** cells in order `neutral,joy,anger,sadness,surprise`, nonempty. 201 `{assets:[x5],count:5}`; 415 MIME, 413 size, 422 ownership/layout/pose. Entire import is transactional and cleans new files on failure.
- Results are regular story-owned `creator_media_assets` visible through list/scene selection. No model inference or implicit GPU use.

## Visual DNA prompt composition

- `GET /api/v1/stories/{id}/creator/characters` adds `visual_character_id`, a story-owned identity mapping.
- `POST /api/v1/stories/{id}/scene-plan/preview` and `/illustration-prompt` share `ScenePlanner.prompt` when a plan is present. Without a plan, `VisualState.enriched_prompt` adds DNA tags only for uniquely named present NPCs; with plan, only UUID-linked cast in `visible_character_ids`.
- `POST /api/v1/stories/{id}/illustrate` uses the same prompt/cache signature. Render seed is independently selected; DNA does not silently add a LoRA or change the seed. `apply_character_loras` is opt-in.

## Optional ComfyUI LoRAs and render provenance

- `GET /api/v1/images/loras` probes only a connected local ComfyUI `/models/loras` when requested; returns `{online,loras,error}`, without downloading/loading.
- `POST /api/v1/stories/{id}/illustrate` accepts `apply_character_loras:boolean=false`. When true, load at most three distinct story-owned NPC LoRAs after validating ComfyUI inventory and `/object_info/LoraLoader` required inputs `model,clip,lora_name,strength_model,strength_clip`. Missing/incompatible → 422, offline catalog → 503, **no /prompt**.
- Response reports `applied_loras:[{character_name,lora_name,strength}]`.
- `visual_assets.render_details_json` stores `{workflow_version,loras}`, exposed as `render_details`. Cache signature changes with LoRA selection/strength. Legacy/manual values default to `{}`; forks and archives preserve compatible metadata. Reject unsafe JSON, paths, non-finite strengths or more than three LoRAs.

## Reviewable AI sprite drafts

- `POST /api/v1/stories/{story}/creator/characters/{npc}/sprite-drafts` accepts `{caption,pose,style,seed?,reference_asset_id?,use_lora?,denoise?}`; returns 201 `SpriteDraft`. This stores the editorial snapshot (prefer DNA seed), with **no ComfyUI call**.
- `GET /api/v1/stories/{story}/creator/sprite-drafts` → `{drafts:[SpriteDraft]}`; GET by draft ID returns its slots `neutral|joy|anger|sadness|surprise` and `ready,preview_url,quality,ready_count` plus model/seed/pose/NPC/date/reference.
- `POST /api/v1/stories/{story}/creator/sprite-drafts/{draft}/expressions/{expression}` with `{allow_low_vram:false}` starts **one** ComfyUI generation through shared lock/preflight. A valid transparent PNG preview is saved; on failure prior preview remains. Not published yet.
- `GET /api/v1/stories/{story}/creator/sprite-drafts/{draft}/expressions/{expression}/preview`: owned PNG, `Cache-Control:no-store`.
- `POST /api/v1/stories/{story}/creator/sprite-drafts/{draft}/approve`: requires all five; publishes transactionally, returns `{approved:true,count:5,assets:[...]}`.
- Reject invalid/foreign IDs and path traversal, enforce three-draft cap and expiry. Draft media is excluded from reader and archive until approval. See [Sprite drafts](COMFY_SPRITE_DRAFTS.md).

## IPAdapter reference and alignment

- `GET /api/v1/images/identity-adapter/status` probes `/object_info/IPAdapterUnifiedLoader`, `/object_info/IPAdapter`, `/models/ipadapter`, `/models/clip_vision` on explicit request, returning `{available,presets,model_count,clip_vision_count,error}` without inference.
- Sprite draft create accepts **either** `reference_asset_id` (owned gallery) or `reference_sprite_asset_id` (approved sprite of same NPC), not both. `reference_mode:"img2img"|"ipadapter"` defaults to img2img; IPAdapter requires a source.
- `ipadapter_preset`: `STANDARD|PLUS|PLUS FACE`; `ipadapter_weight` 0.1–1.5. The draft persists choice without starting GPU.
- On expression generation, img2img uses `VAEEncode`; IPAdapter normalizes an RGB letterboxed reference into `LoadImage → IPAdapter` while keeping a fresh `EmptyLatentImage`. Required nodes/weights and original reference SHA-256 are checked. This is not FaceID or spatial masking.
- Provenance supports `comfy-sprite-v2-ipadapter` with adapter preset/strength and reference hash; earlier v1 media remain valid. Alpha bbox center/scale drift may block approval until explicit `accept_alignment_warnings=true`. The inspector does not perform facial recognition.

## Neural sprite cutout

- `GET /api/v1/images/matting/status` returns `{neural_available,modes:[{mode,model,node,ready,reason}]}`. `chroma_green` is always supported; `neural_rmbg2`, `neural_birefnet_portrait`, `neural_birefnet_matting` require corresponding ComfyUI-RMBG node schemas and installed model files.
- Create draft accepts `cutout_mode` with those values (default `chroma_green`) and persists it; may combine with supported LoRA/IPAdapter/img2img references.
- Expression render with neural mode rejects missing nodes/models with 422 **before** `/prompt`. One job must return processed `SaveImage[7]` and mask `SaveImage[25]`; missing/unsafe output → 502, unusable mask/quality → 422. Keep earlier preview and do not silently use chroma.
- `generation_json` supports `comfy-sprite-v3-matting` and `comfy-sprite-v4-matting-ipadapter` with `matting:{mode,model}`, `quality.method=neural_rmbg|neural_birefnet`. Validate compatibility between method/model/workflow. v1/v2/manual assets remain readable.

## Local Story Hub v1

- `GET /api/v1/story-hub` → `{packs,source:"bundled-original",community_online:false}`, public-only fields, NPC names, counts and `has_images=false` (no private plot/reminders/Lorebooks).
- `GET /api/v1/story-hub/{pack_id}` → public pack detail or 404.
- `POST /api/v1/story-hub/{pack_id}/install` with optional `{"protagonist_name":"Alex"}` → 201 `{story,package_id,version,characters_installed,lore_installed,openings_installed}`. Transactional new story/NPC/Lorebook IDs. Unknown ID 404, invalid fields 422.
- `POST /api/v1/stories/{story_id}/creator/opening` persists the selected opening **without an LLM**, rejecting a second opening after a story has started.

This is not a hosted community publishing registry. See [Story Hub](STORY_HUB.md).

## Checkpoint, Piper and ComfyUI runtime contracts

The later installer/runtime endpoints were documented separately to keep their limitations clear:

- [Image checkpoint installation](CHECKPOINTS_IMAGEN.md): Hugging Face lookup/installed/download job/start/pause/resume/cancel, verified root-level `.safetensors`.
- [Managed ComfyUI](COMFY_UI_INTEGRACION.md): existing-runtime config, validate, start/stop/status/logs and local model-path YAML. **It does not install ComfyUI itself.**
- [Piper voices](PIPER_VOICES.md): explicit catalog/download/preview/voice synthesis; model ONNX+JSON and runtime prerequisites.
- [Image controls](CONTROLES_IMAGEN.md): KSampler options and presets, persisted sampling controls.

**API compatibility rule:** do not rename existing Spanish-looking hash-route IDs or story pack identifiers as a side effect of translating UI/documentation. Add English labels without breaking saved links, media references, or tests.
