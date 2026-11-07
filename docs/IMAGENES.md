# Progressive illustration generation — Noble AI

**Status:** the P1.4 on-demand local ComfyUI adapter and WebP storage are implemented; P1.5 added heuristic location detection, a versioned gallery, and visual-character profiles. Advanced semantic scene detection, proactive planning, physical GPU validation, ControlNet, remote image workers, and a full multi-GPU scheduler remain open.

## Product contract

**Do not generate every asset when a story is created.** In the current implementation, images are generated **on request**, with reusable backgrounds/sprites and fully functional text-only play. A failed image request must never block the narrative engine. The separately specified illustrated-story preparation wizard is future work; it must not be confused with existing on-demand behavior.

## Visual asset types

- **background:** reusable location + weather + time + art style.
- **portrait:** canonical character appearance with source reference.
- **sprite:** transparent-background character with pose/expression tied to identity.
- **cg:** special event illustration, optional and more expensive.
- **thumbnail/cover:** editorial image for a story, once or on request.
- **expression variant:** alternate expression derived from an existing sprite where feasible.

Asset provenance should include `asset_id`, SHA-256, `story_id`, optional `character_id`, appearance/scene revisions, model/hash, seed, prompts, negatives, LoRA settings, dimensions, workflow hash, timestamp, and model license where relevant.

## Planning policy

| Story event | Intended default |
|---|---|
| Open story without art | Display neutral background; **no automatic render in P1.4** |
| Introduce a new character | Reuse an existing portrait/sprite; plan new art only when visually revealed |
| Change only an emotion | Switch an existing expression; generate only on explicit request or later approved policy |
| Change location | Heuristic detector records a scene; **does not automatically generate art yet** |
| Advance dialogue without a visual change | **Do not generate an image** |
| Player clicks **Illustrate scene** | Generate or reuse versioned art with explicit priority |
| Outfit/appearance changes | Increase `appearance_revision`; produce a new version when appropriate |
| Player requests TTS | Does not affect the image planner |
| Retry a turn | Fork branch; preserve assets from the previous branch |

An intended cache signature covers `art_style_version + location_id + lighting/weather + appearance_revision(s) + pose/expression + camera + image_kind + workflow_version`. Irrelevant wording changes in narration must not trigger a new illustration.

Desired job states: `missing / queued / running / ready / failed / cancelled`. Keep the previous image visible until the new result is validated. Deduplicate equivalent jobs by stable IDs and signatures.

## Character consistency

Canonical visual DNA describes hair/eye colors, accessories, ears/horns, clothing, proportions, and palette. Use approved reference portraits, compatible LoRA, and IPAdapter/ControlNet **only if the actual nodes/models exist and the relevant request enables them**. Prompt-only conditioning cannot guarantee facial/outfit consistency; review generated scenes.

For multi-character compositions, plan cast/positions before rendering. If identity mapping fails, prefer independently layered sprites or simplified art over swapped identities.

## Minimum ComfyUI protocol

- Export workflows in **API format**, verify available `object_info` nodes, and version workflow JSON.
- Submit with `POST /prompt`, monitor via `/ws` or polling, inspect `/history/{prompt_id}`, and fetch `/view`.
- Validate bytes, expected MIME, image dimensions, size, integrity, and hash before storing assets.
- Keep runtime-specific checkpoint, LoRA, resolution, steps, VAE, batch, backend, and RAM/VRAM policies separate.
- Prefer low-res previews when appropriate; upscale only on explicit request or confirmed quality criteria.
- Bound retries and backoff; on OOM record `failed:gpu_oom` with actionable profile suggestions rather than looping indefinitely.

## GPU resource targets

Design 12/16 GB profiles with at most one heavy diffusion job at a time and a narrator that can remain usable (with CPU offload where supported). A future scheduler should avoid unbudgeted simultaneous GPU loads. When appropriate, an owned image worker may release weights after work; browser/disk assets remain available. **This full unload/reallocation policy is not yet implemented.**

## Key regression scenarios

- Ten consecutive turns in the same tavern → **zero extra images** unless explicitly requested.
- Moving tavern → forest → one background if uncached, otherwise zero new renders.
- Two requests for an identical scene → one deduplicated job and stable signature.
- A late image from an abandoned branch → archived, **never displayed as the current scene**.
- ComfyUI offline → story remains playable and the image error is retryable.
- Ten scenes with the same character → human review of facial/outfit continuity plus metadata inspection.

## P1.4 — implemented on-demand local API

- `GET /api/v1/images/config`: read persisted ComfyUI preferences.
- `PUT /api/v1/images/config`: validate loopback URL, checkpoint, dimensions, steps, CFG, negative prompt, and related settings.
- `GET /api/v1/images/status`: check local ComfyUI via `GET /models/checkpoints` when inventory is refreshed.
- `POST /api/v1/stories/{uuid}/illustrate`: request `{"prompt":"...","seed":123}` with optional seed, using standard `CheckpointLoaderSimple → CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage`.
- Fetch output with `/view`, validate using Pillow, and save a WebP under `story-assets/{uuid}/scene.webp` only after success.
- Initial admission policy allows **one simultaneous image request**; otherwise returns 409 to avoid flooding the GPU.
- Creating, opening, and continuing narrative turns **never automatically calls ComfyUI** in this release. The user explicitly chooses **Illustrate** and a prompt.
- A failed render never deletes or overwrites the previously valid illustration.
- Standard nodes cover compatible checkpoint families; Flux/SD3 and customized graphs need appropriate templates. Do not claim universal checkpoint compatibility.
- Automated ComfyUI-mocked tests validate HTTP flow and actual Pillow image decoding; physical GPU generation still needs its own test.

## P1.5 — persisted scenes and versioned gallery

**Scene records:** SQLite `visual_scenes` includes `id`, `story_id`, `location`, `source_turn_id`, detection source (`initial`, `heuristic`, `confirmed`), and timestamp. After committing each narrative turn, heuristics inspect place names and past-tense movement/entry verbs for a scene transition. Obvious quoted dialogue and negation are excluded. The user can confirm/correct the location in Gallery. This is regex-based, **not a semantic LLM detector**.

**Immutable illustrations:** SQLite `visual_assets` includes UUID, associated scene, source, final prompt, checkpoint, seed, SHA-256, and deterministic render settings signature. Files are stored under `story-assets/<story_id>/images/<asset_uuid>.webp`; `scene.webp` remains a compatibility pointer. `visual_current` chooses what the reader displays. Changing the active version does not delete earlier files. Legacy stories with only `scene.webp` migrate when `visual-state` is accessed.

**Exact render cache:** SHA-256 over scene ID, enriched prompt, checkpoint, diffusion configuration, seed, and workflow version. Cache lookup applies when the user specifies a seed; random seeds create fresh versions. A valid matching result can be reused offline. Scene and explicitly named character changes affect the signature.

**Textual visual identity:** `visual_characters` stores name, appearance, clothing, traits, and revision. Only characters explicitly mentioned by name in the prompt are included in free-form illustration context. This original layer alone has no visual embeddings, FaceID, ControlNet, or guarantees of matching clothing or faces.

**Forks:** cloning a story copies relevant scenes/media/profiles into an independent namespace. A branch started at an earlier turn cannot show images belonging only to later events on the original branch.

### P1.5 API

- `GET /api/v1/stories/{id}/visual-state`: scenes, current scene, gallery, visual-character profiles.
- `PUT /api/v1/stories/{id}/scene`: confirm location without image generation.
- `POST /api/v1/stories/{id}/visual-characters`; `PUT /.../visual-characters/{character_id}`: manage appearances.
- `POST /api/v1/stories/{id}/illustration-prompt`: preview enriched prompt with **no inference**.
- `GET /api/v1/stories/{id}/gallery/{asset_id}`: fetch story-owned WebP.
- `POST /api/v1/stories/{id}/gallery/{asset_id}/select`: activate a saved version.
- `POST /api/v1/stories/{id}/illustrate`: return `asset_id` and `cached` while retaining version history.

Tests use real SQLite/Pillow for migration, restoration, versioning, branch isolation, and story ownership, with simulated ComfyUI transport and desktop/mobile Playwright. **These are not physical GPU benchmarks.**

## ComfyUI img2img with stored gallery art

An existing WebP asset **from the same story** may become the reference for a new illustration. Standard graph:

```text
LoadImage → VAEEncode → KSampler (configurable denoise) → VAEDecode → SaveImage
```

- In **Library → Gallery**, import/select a previously saved illustration. Under **Illustrate**, pick a **Reference image** and choose transformation strength between **20% and 95%**. Lower denoise generally preserves more composition.
- Verify story ownership and stored SHA-256 before uploading a checkpoint-sized PNG through ComfyUI `POST /upload/image`; validate returned filename, then submit the img2img graph to `POST /prompt`.
- Results receive independent version IDs and never overwrite the source. The cache signature includes reference SHA-256 and denoise.
- This is **classic img2img**, not IPAdapter, InstantID, FaceID, or LoRA training. Facial identity is not guaranteed. The chosen checkpoint still must support the standard VAE nodes.

### NVIDIA free-VRAM monitoring

With `nvidia-smi`, Noble AI can report system-level free MiB. **Settings → Images → GPU memory and admission** exposes `Monitor only` or `Block when free VRAM falls below reserve`, GPU index, and a minimum-free threshold. The reserve is a user-defined bound, **not** model consumption prediction.

- `monitor` (default): observe without blocking.
- `guard`: return HTTP 409 before contacting ComfyUI when observed VRAM is below threshold.
- A per-request **Ignore reserve only this time** option can bypass the policy without persisting a new preference.
- Missing `nvidia-smi`: return `unknown`, rather than blocking CPU or non-NVIDIA providers.
- Monitoring does not unload models, allocate GPU memory, terminate processes, forecast checkpoint consumption, or coordinate unrelated software. See [resource policy](RECURSOS_GPU.md).

## Per-scene persistent visual plan

The Gallery contains explicit editable scene **composition/action**, shot (wide/medium/close-up), lighting, atmosphere, up to six visible cast members, and an optional protagonist reference. This is manually curated, not background LLM semantic classification.

- `scene_plans` uses scene UUID; changing location opens its own plan.
- `GET /api/v1/stories/{id}/scene-plan` returns a plan or empty defaults without generating.
- `PUT /api/v1/stories/{id}/scene-plan` validates story-owned character IDs, presence constraints, and duplicate rejection.
- `POST /api/v1/stories/{id}/scene-plan/preview` builds a prompt **without inference**. Include names/traits only for explicitly selected cast.
- `PUT /visual-characters/{id}/reference` sets/clears an owned gallery asset with `{"asset_id":"uuid"}` or `null`; verifies ownership/SHA-256.
- A saved plan can use a character's registered reference through img2img unless an explicit request specifies a different image. The response reports the actual `reference_asset_id`.
- Forks copy eligible plans with remapped scene, cast, and asset IDs; excluded future scenes remain isolated.

The basic reference mechanism supplies spatial conditioning, not true multi-character region control or biometric identity.

## Multi-layer stage director — Argon requirements (November 5, 2026)

**Decision:** prefer background/sprite reuse over a new full-frame render on every turn. Existing Gallery, Creator foreground, and scene-plan features are a foundation—not a finished emotional stage director.

Target `VisualStageState`: `location_id`, `time_of_day`, `weather`, `lighting`, `camera_shot`, `visible_characters[]` (ID, position, expression, voice), and `is_climactic_cg`. The director should choose deterministically between:

- `REUSE_BACKGROUND`: use matching background; no ComfyUI call.
- `UPDATE_SPRITE_EMOTION`: change only the relevant sprite/expression, not the background.
- `GENERATE_NEW_BACKGROUND`: queue missing background while retaining the old scene, then crossfade when ready.
- `GENERATE_EVENT_CG`: render exceptional art only on narrative triggers or explicit request.

Proposed background signature: `(location_id, time_of_day, weather, camera_shot)` plus asset revision. Expression sets `neutral/joy/anger/sadness/surprise` must tie to visual DNA, shared seed, optional LoRA, and character identity. `images.py` should accept validated family-specific ComfyUI templates, applying references only with consent. Do not promise perfect face consistency.

**Acceptance:** ten turns in one place trigger no new background; emotion change switches sprite without diffusion; location change transitions without blocking text; desktop/mobile tests; GPU work is serialized without leaving unnecessary owned weights resident. See [TODO](../TODO.md) and [Argon audit §§12, 19](ARGON_AUDITORIA.md).

## Creator visual DNA and expression sheets

`CreatorCharacter.visual_dna` stores identity tags, optional seed, LoRA filename/strength. Identity tags enter image prompt composition **only** for selected NPCs; they do not modify the narrator's story instructions. NPC seed metadata does not replace the render seed. LoRAs affect graph loading only with explicit activation.

`CreatorMediaService.import_expression_sheet` transforms a transparent horizontal (1×5) or vertical (5×1) PNG/WebP into `neutral/joy/anger/sadness/surprise` variants associated with a specific NPC. It uses transactional SQLite and cleans newly written files on failure. Manually imported sheets remain supported; there is also an optional reviewed/approved AI draft workflow. Actual region conditioning, perfect facial identity, and physical GPU continuity validation remain open.

### Selective visual DNA in prompts

Visual DNA contributes textual cues to the positive prompt only when a creator explicitly illustrates a scene. In free-form mode, detect whole-word NPC names in the request; in a saved scene plan, include only cast members linked by UUID and currently selected. Both modes preserve base gallery prompts and offer no-GPU previews. The text affects the cache signature but does not silently change seed, LoRA, or the diffusion graph. Editing identity metadata never rewrites past illustrations.

## Real opt-in LoRAs with versioned provenance

`POST /illustrate` optionally accepts `apply_character_loras=true`. LoRAs derive from story-owned NPC records present in the plan or free-form request. Noble AI queries ComfyUI's LoRA inventory and `LoraLoader`, chains MODEL/CLIP, and uses the standard graph when disabled.

Renders persist LoRA names and strengths in `visual_assets.render_details_json`, exposed in Gallery and retained through forks/backups. Multi-LoRA loading affects the **whole** model, not separate canvas regions. ComfyUI inventory does not provide file SHA-256; replacing weights while keeping a filename can defeat the cache. See [LoRA limitations](COMFY_LORAS.md).

## AI expression drafts with transparency and approval

Creator-requested expression generation renders five separate portraits through ComfyUI with shared checkpoint/base seed/style/visual DNA and optional reference via img2img and an NPC-owned installed LoRA. `comfy_runtime.py` supplies the protocol and `images.lock` + VRAM reserve serialize GPU operations.

Default `sprite_cutout.py` uses **local chroma-green extraction**, not a neural segmentation model; it demands a predominantly green border-connected background, fully visible subject, plausible coverage, and actual alpha output. Poor candidates are rejected.

Saved previews **never become reader assets without creator approval**. The transactional expression importer publishes five foreground variants, with `source=ai_reviewed` and per-expression provenance in exports/forks. See [sprite drafts](COMFY_SPRITE_DRAFTS.md).

## Optional IPAdapter identity guidance

For draft sprites, `reference_mode=ipadapter` uses installed `IPAdapterUnifiedLoader + IPAdapter` with an owned gallery image or approved sprite for the same NPC. It conditions a new composition rather than reusing the reference as img2img latent input. Optional LoRA is supported with node/model preflight; nothing runs automatically on story turns.

Published provenance records preset, strength, and reference digest in `generation_json`. Five variants are compared for silhouette scale/position before approval; significant differences require explicit human acceptance. **This is not facial identity verification or neural matting.**

## Optional neural sprite matting (RMBG/BiRefNet)

Besides default green-screen extraction, drafts support `neural_rmbg2`, `neural_birefnet_portrait`, and `neural_birefnet_matting` when ComfyUI-RMBG nodes/weights are installed and discoverable.

The graph exports **IMAGE and MASK as separate SaveImage outputs from one job**; Noble AI creates a soft-alpha PNG from the processed image and original grayscale mask, validating bytes, bounds, edges, and coverage instead of assuming ComfyUI preserves four channels.

Provenance `comfy-sprite-v3/v4` records the matting method/model, preserves approval requirements, and survives exports/forks. These operations do not run during ordinary narration. Physical GPU latency and real segmentation accuracy have **not** been measured.
