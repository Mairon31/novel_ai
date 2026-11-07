# Noble AI — modular architecture and implementation history

The app-first architecture uses **React/Vite/TypeScript**, **FastAPI/Python**, **SQLite**, and separate narrative/image/voice inference adapters. It is a modular local application, **not a fleet of microservices**. Historical implementation notes below refer to the initial development milestones; treat dated CI results as evidence of those commits, not proof of current hardware compatibility.

## 11. P1 implementation — narrative and process control boundaries

**Source modules:**
- `apps/api/noble_api/narrative.py`: local configuration, loopback validation, Ollama chat NDJSON and KoboldCpp OpenAI SSE adapters; SQLite story/turn persistence, per-story locking and `request_id` idempotency.
- `apps/api/noble_api/runtime.py`: KoboldCpp manager using `Popen(shell=False)`; registered GGUF only, explicitly configured executable, `--host 127.0.0.1`, `--gpulayers -1/0/N`, `--contextsize`, owned start/status/stop, and activation based on the model advertised by `/v1/models`.
- `apps/web/src/StoryStudio.tsx`: reader/input; `NarrativeSettings.tsx`: LLM/provider/settings; `RuntimeManager.tsx`: owned engine controls.
- Tests: `tests/test_narrative.py`, `tests/test_runtime.py`, `apps/web/tests/story.spec.ts`.

**Initial limits:** no cross-platform automatic KoboldCpp/Ollama installer; no full replayable SSE event log with per-sequence resume. Early idempotency persisted only completed turns. Later milestones added canon, snapshots, and branches, described below. Externally managed models are not terminated when Noble exits.

**Initial evidence:** 21 Python / 6 Playwright tests using simulated inference; no physical GPU at that milestone. See [Progress](PROGRESO.md).

## 12. P1.1 — Control plane and remote GPU worker

Local registration stores a worker URL/name/role in SQLite and bearer credentials in the OS keyring. The backend connects via HTTPS to a Cloudflare Quick Tunnel and verifies that incorrect credentials are rejected. A remote proxy authenticates and forwards OpenAI-compatible LLM requests to a GPU-local server.

Relevant modules: `workers.py`, `worker_server.py`, `narrative.py`, `RemoteWorkers.tsx`, `tests/test_workers.py`. The browser can register a worker without reading back its previously saved secret. **Narrative context is transmitted to the remote GPU.** No hosted shared LAN server or diffusion/TTS worker is included.

Initial protocol tests were simulated, not real remote-GPU measurements. See [ADR-0003](adr/0003-remote-workers.md).

## Architectural direction after Argon audit — November 5, 2026

**Evolve modules; do not rewrite everything.** Retain the modular FastAPI backend, React/Vite frontend, local SQLite, inference adapters, and optional workers. Separate duties without turning a local-first product into unnecessary microservices. See [Argon audit §20](ARGON_AUDITORIA.md) and [TODO](../TODO.md).

**Layer boundaries:**
- **UI:** submit user intent, display stage/reader state, consume REST/SSE; never build canonical narrator prompts independently.
- **Narrative:** canon, branches, witnesses, per-turn state, context budgets, validated event processing.
- **Infrastructure:** hardware, models, process lifecycle, downloads, VRAM and remote workers; keep it out of the immersive reader.
- **Visual stage:** choose whether to reuse a background, switch a sprite, generate missing scenery, or request an exceptional CG.
- **Persistence:** use coherent transactions for related database changes; SQLite WAL is not distributed atomicity across services/files.

Migration order: P0 integrity → resource/model management → narrative state/memory → visual composition → VN/Creator/infrastructure UX → packaging and physical benchmarks. Preserve API contracts and E2E coverage. Audit findings may already have been addressed by later code; check current `master` first.

## Transactional Unit of Work for story forks

`NarrativeService.fork_story` coordinates the branch commit using a **single `noble.sqlite` connection** and `BEGIN IMMEDIATE`. VisualState, ScenePlanner, CreatorService, CreatorMediaService, LorebookService, and WorldStateService clone with an optional supplied `conn`, reused through `nullcontext`, instead of independently committing. The orchestrator alone executes final COMMIT or ROLLBACK. Historical turn, scene, character, and fact UUID mappings are preserved, and the selected fork turn determines restored canon/state.

Physical files cannot join the SQLite transaction. On error, remove **only the newly created destination UUID directory**. For abrupt interruptions, a staging marker `fork-staging/<UUID>.pending` is created under the SQLite lock before file copies. Startup recovery inspects only markers, preserves rows that actually committed, and removes abandoned folders after validating paths and rejecting symlinks. Recovery holds `BEGIN IMMEDIATE` to avoid racing a new fork.

Power loss, file-system durability, and TOCTOU remain separate limitations. Tests in `tests/test_fork_atomicity.py` cover late module failure, filesystem errors, marker recovery and concurrent forks. See [QA](QA_Y_ACEPTACION.md) and [Progress](PROGRESO.md).

## Historical editorial-media isolation

`CreatorMediaService` snapshots editor asset inventory, metadata, and the current cover into `creator_media_turn_snapshots` at each committed narrative turn **in the same SQLite transaction**. A partial fork selects only assets present at the chosen turn; a full fork copies current editorial data and historical snapshots while remapping UUIDs. A legacy turn without a snapshot does not import future artwork.

Deletion removes the active metadata and stops serving its URL, but retains physical bytes referenced by an earlier turn so a historical fork can restore them. A required missing file aborts the fork. Cleanup/garbage collection must account for historical references; path-substitution attacks remain a QA concern.

Evidence: [CI #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045), **184 Python / 34 Playwright PASS**.

## Per-turn gallery, reference and scene-plan snapshots

`VisualState` stores `visual_turn_snapshots` when a turn commits: visual profiles including image references, existing gallery IDs, selected asset, and `scene_plans`. The operation uses `NarrativeService.append`'s SQLite connection, not a second commit.

A partial fork restricts gallery/profiles to the selected historical turn and passes the selected plan to `ScenePlanner.clone`. A full fork copies live state and rewrites prior snapshot links to new branch IDs so it too can be rewound.

Legacy turns without historical visual snapshots do not borrow present-day data. Filesystem copy/compensation remains separate from SQLite atomicity. No automatic scene generator, GPU worker, or historical-file garbage collector was added by this feature.

Backend evidence: commit [`a49ca05`](https://github.com/Mairon31/novel_ai/commit/a49ca0591222837d28b344798646dd113ea567c4), [CI #42094814974](https://github.com/Mairon31/novel_ai/actions/runs/42094814974): **189 Python PASS** when recorded; Playwright was still pending at that moment.

## Lorebooks with witness-scoped access

In addition to shared `visibility=world`, an entry may declare `visibility=witnesses` and up to 16 creator-character UUIDs. Before applying budget/priority, `LorebookService.activate` intersects these IDs with `WorldStateService.current`'s confirmed present cast. If no witness is present, neither keyword matches nor `always_active` may inject the secret.

On save, witness UUIDs must belong to the same story's `creator_characters`, checked under `BEGIN IMMEDIATE`. Lorebook snapshots store the extended JSON. Forks remap witness IDs using the exact new mappings from `CreatorService.clone`. A private entry without a valid destination witness is omitted instead of becoming public.

This is **prompt inclusion control**, not a complete per-NPC cognitive model. An LLM can still infer or disclose secrets from other injected data, such as blueprint text, NPC descriptions, or prior dialogue. Stronger epistemic isolation and semantic output QA remain pending.

Evidence: commit `cef3a99`, E2E fix `cb687ec`, [CI #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216): **193 Python / 36 Playwright PASS**.

## Fork durability: filesystem synchronization and WAL

The branch staging UUID marker is written before copying and flushed with `os.fsync`; on POSIX, parent/staging directories are also synchronized. After cloning gallery, covers, and editorial media, the implementation traverses only the new destination UUID directory, rejects symlinks, and syncs all files and directory entries **before** SQLite COMMIT.

`fork_story` uses `PRAGMA synchronous=FULL` for its WAL commit without changing the general Store's `NORMAL` mode. Precommit sync failure rolls back SQL and compensates files.

Windows Python has no portable directory `fsync`: file contents can be flushed, but metadata sync remains an explicit limitation. Even on POSIX, filesystem and SQLite do not form a single transaction, and no physical power-loss durability guarantee exists.

First [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230): **197 Python / 36 Playwright PASS**, commit `eca8166`. An external `os._exit(41)` test was subsequently added.

**Crash-recovery evidence:** [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453): **198 Python / 36 Playwright PASS**. `os._exit(41)` after copying but before commit leaves a durable marker and unregistered files; the next app instance's `recover_incomplete_forks` removes only the abandoned marked folder, preserving the original story. This is not a physical blackout experiment or complete symlink-race defense.

## Multi-process interruption tests

Tests run independent `create_app` processes against the same Store, coordinating timing **in the test harness** with atomically published handshake files. `Popen.kill()` stops actual Python processes after fsync/before COMMIT or after COMMIT/before marker cleanup, while another writer contends on SQLite. On startup, recovery must distinguish uncommitted directories from committed story rows.

Production does not add artificial delays or test hooks. Tests exercise the actual `BEGIN IMMEDIATE`, `synchronous=FULL`, marker and startup recovery contracts, but not a power outage.

[CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771): **201 Python / 36 Playwright PASS** at commit `f684580`, covering before-commit competing writer, after-commit marker, and serialized recovery of two terminated processes.

## Synchronizing cleanup during recovery

The inverse recovery protocol syncs parent directories after deletion: when no committed story row exists, remove its UUID directory and sync `story-assets`; after removing a marker for an abandoned **or committed** branch, sync `fork-staging`. Only count success after required flushes.

If syncing a parent fails, retain the marker for the next startup. Repeated cleanup is idempotent when the folder was already removed. Portable directory sync still depends on POSIX; this is not distributed filesystem/SQLite atomicity.

[CI #42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649): **203 Python / 36 Playwright PASS**, commit `c2dbbca`; checks deletion ordering, directory metadata flush and retry after failure on Linux.

## Portable single-branch HTML export

`story_export.py` exports without modifying SQLite. It selects turns from the requested story/branch, embeds the Creator-managed cover and historical gallery WebPs from `selected_asset_id` snapshots **only when those IDs belong to that branch**. It never reconstructs an older image selection from future data.

`html.escape` prevents player/narrator text being interpreted as HTML, and exported images contain no remote fetch paths. Resource limits prevent unbounded reads.

The self-contained HTML covers **one narrative line**, labeled as an independent branch where appropriate. It excludes private Creator instructions, complete Lorebooks, and administrative state. EPUB and full family ZIP backup are distinct operations; full backups include author material and require explicit import.

## Episodic FTS5 limited to player inputs

`narrative_turn_fts` indexes `turn_id,story_id,mode,input_text` using `unicode61`; legacy SQLite files can be reindexed without changing scenes. `story_turns` remains the source of truth. New turns and index rows commit together, and branch copying excludes future turns.

Search filters by story and validates each retrieved turn against `story_turns`. A bounded lexical fallback examines up to the latest 2,500 turns when FTS5 is unavailable.

**Only player input** is indexed, not model-generated prose or private Creator/Lorebook content. Up to three recovered distant actions are appended as historical `user` messages, not promoted into system instructions. Such input does not independently prove NPC knowledge or causality. Semantic retrieval, witnessed summaries and exact token accounting remain open.

## Narrator adapter message inspector

`context_inspector.py` calls `NarrativeService.messages` directly to reproduce the exact message array prepared for Ollama/KoboldCpp/OpenRouter/worker. Read-only; does not load a model or save turns.

The inspector groups the unmodified message content into system/preferences, premise, canon, creator context, Lorebook, world state, episodic retrieval, and recent history. Character counts are exact; `ceil(characters/4) + overhead` is a **heuristic**, not model-specific tokenization. Context-cap warnings are informational. Never invent KV cache-hit metrics.

The inspector belongs in `NarrativeSettings` for the author because it contains private story instructions. It must not appear in the public reader or portable HTML.

## EPUB3 without external dependencies

EPUB export uses Python's `zipfile` and `xml.etree.ElementTree`. An uncompressed `mimetype` is the first ZIP entry; `META-INF/container.xml` points to package OPF defining metadata, the manifest (including WebPs), XHTML chapters, navigation, and reading order.

Chapters contain ordered turns and scenes with story-owned cover/illustrations selected from historical snapshots. Files contain no remote requests or Creator private instructions. The reader offers EPUB alongside portable HTML.

Combined P1 evidence: [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352): **217 Python / 42 desktop/mobile Playwright / Vite PASS**, covering export, episodic player memory, and private message inspector.

## `.noble.zip` v1 — portable family archive, limits, and recovery

Export follows `origin_story_id` to the family's root, then traverses descendants. `manifest.json` stores the root, **18 domain SQLite tables** (excluding global/index-only FTS tables), and owned media entries with `sha256`, size, and UUID paths. Only regular files in approved locations are included: `story-assets/{uuid}/scene.webp`, `images/{uuid}.webp`, `creator/{uuid}.webp`, `creator/{uuid}.png`. Player input FTS is rebuilt upon import.

The importer validates archive type/version/structure, graph connectivity, allowed table columns, `story_id` ownership, snapshot turn IDs, UUID formats, ZIP members, sizes, and hashes **before** writing. Caps: 64 stories, 25,000 database rows, 1,200 media files, 192 MiB total media, 16 MiB per file, 24 MiB manifest. It does not extract arbitrary ZIP filenames as filesystem paths; it reconstructs known Noble-owned destinations.

Default import refuses UUID conflicts with **409**, never overwriting an existing project.

Restoration holds the SQLite writer lock, checks collisions, creates `fork-staging/{uuid}.pending` markers and fresh `story-assets/{uuid}` folders. It writes/syncs files and directories before COMMIT, inserts domain tables/rebuilds FTS in one transaction, and rolls back with file compensation on error. Startup recovery reuses the fork marker protocol.

These controls do not guarantee power-loss atomicity across SQLite and the filesystem, or overwrite existing UUIDs.

## Navigable story branch tree

`branch_map.py` reads the connected story family, preserving IDs, and returns nodes with parent, fork turn, depth, and turn count; read-only and cycle-safe. Library → Detail renders indented branches; the reader has a selector to switch to linked branches.

Switching branches fetches existing story/history and does not merge, edit, or generate turns.

**Backup and branches CI:** [#42115183293](https://github.com/Mairon31/novel_ai/actions/runs/42115183293) passed **226 Python / 46 Playwright / Vite**, including a mobile return-button stacking fix.

## Import family archives as non-conflicting copies

The default restore remains non-destructive (409 on conflict). Explicit `as_copy=true` first fully validates the ZIP and then remaps all original UUIDs to fresh IDs for structured records, relational references, JSON **keys and values**, and media. It does **not** replace UUID-looking strings in free-form prose.

The importer rebuilds story-owned paths, labels copied titles, rewrites parent/child relationships, and reuses the same SQLite transaction/staging/file-compensation rules. The response provides a story-ID map for opening imported copies.

[CI #42117963321](https://github.com/Mairon31/novel_ai/actions/runs/42117963321) covered duplicate import; [CI #42120432384](https://github.com/Mairon31/novel_ai/actions/runs/42120432384) verified remapping UUIDs in structured JSON keys/values such as `world_states.relationships` and `world_state_edits`, with **231 Python / 52 Playwright**.

## Shareable local UI routing

`workspaceRoute.ts` parses hash-based links such as `#/biblioteca`, `#/historia/<uuid>/leer`, `#/creator/<uuid>`. These **URLs are stable compatibility identifiers** even though English is now the UI language.

`App.tsx` coordinates route state; `StoryStudio` and `CreatorStudio` receive the selected story/project as props and notify navigation. Hash routes permit reload/bookmarks in FastAPI or future desktop packaging without adding backend routes for every view, while REST remains under `/api/v1`. Navigation does not merge/erase turns or bypass branch isolation.

During first-run setup, redirect to Model Hub only if already viewing its destination; a requested `#/historia/{id}` stays selected. Opening `#/creator` without an ID clears previous project selection; mobile menus must open before interaction.

## Reader modes and history controls

A single source of truth (`story_turns`) is displayed according to saved `workspace_preferences.reader_layout`: `immersive` (VN scene), `classic` (Book), and `chat`. Backlog searches already loaded turns in `StoryStudio`; it does **not** mutate storage or expose private memory. HUD hide/show keeps a visible restoration action.

Keyboard shortcuts respect `shortcuts_enabled` and must not act while focus is in an editable input. Backlog is distinct from FTS5 retrieval of historic player messages.

## Deterministic visual director and contextual background cache

`VisualDirector` derives a deterministic `noble-bg-v1:sha256(context)` key from `world_states.location/time_of_day/weather` or current visual scene, plus `scene_plans.shot/lighting`, normalized with NFKC, casefold, and whitespace rules.

Character emotion does not enter the background key: switching expressions must not regenerate scenery. The director returns an action/reason/existing background **without inference**; sprite/CG actions are plans, not proof a new asset exists.

Registering a cached background requires an **explicit author action**, existing gallery media with `origin=manual`, and an exact expected-context signature. The key is stored in `visual_assets.render_signature` and enables reuse across scenes **of the same story**, including fork/backup semantics. It does not overwrite a ComfyUI render signature.

Applying a background rechecks context and ownership, changing `visual_current`/legacy image pointer only. It does not generate new bytes or modify narration. Creator caption-matched backgrounds and foreground overlays retain their existing priority.

File selection cannot guarantee atomicity against hostile symlink substitution or physical power loss. [CI #42127083317](https://github.com/Mairon31/novel_ai/actions/runs/42127083317) covers SQLite/filesystem logic, not a GPU benchmark.

## Visual novel compositor: backgrounds and 2D cast

`creator_media_assets` extends its schema backward-compatibly with `expression` (`neutral/joy/anger/sadness/surprise`) and bounded `pose`, using conditional `ALTER TABLE` and `creator_sprite_variant` index.

Authors import real alpha images; there is no invented generation on story load. `CreatorMediaService.presentation` scores captions against location/latest saved turn, identifies explicitly present NPC names, limits selection to **three distinct identities**, and chooses detected emotion variants with `neutral` fallback. A linked portrait must not be displayed unless that NPC is actually identified in narration. Legacy `foreground` remains an alias for the first `sprites[]` element.

Speaker highlight requires explicit attribution patterns (for example, "*Aira says*" or "*replied Aira*"), not any mention of a character. Generated prose is always presented with a separate **Narrator** label. UI layers include up to three PNG sprite slots, optional background, wash, lower dialogue pane, and independent controls.

Background transitions retain the prior scene for roughly 560 ms during crossfade, then remove it; the previous story's background must **never survive a story-ID change**. Mobile adjusts sprite slots/dialogue panel and respects reduced-motion preferences.

Forks and snapshots preserve expression/pose metadata. Legacy v1 archive rows lacking those columns default to `neutral` and `standing`; arbitrary schema fields remain rejected.

Gate: [CI #42137444723](https://github.com/Mairon31/novel_ai/actions/runs/42137444723): **247 Python / 60 desktop-mobile Playwright / Vite PASS**, including no visual mixing across story navigation.

## Canonical visual DNA and expression sheets (Creator Studio)

`creator_characters.visual_dna` stores identity tags, seed, and optional LoRA filename/strength with Pydantic validation. `CreatorService` rejects locked tag/seed mutations under one writer transaction; old rows have read defaults, and legacy PUT requests that omit visual DNA preserve its value.

NPC voice and narrative personality remain separate from visual prompt fields.

`CreatorMediaService` imports one transparent horizontal/vertical sheet containing **five equal cells**, crops to memory, writes new UUID PNGs per expression, and inserts all five in one SQLite transaction. Failure cleans newly written files without affecting existing assets. The importer reuses media ownership, per-turn snapshots, fork remapping and archive handling; it does not start GPU work or configure ComfyUI.

## Character LoRA graph and render provenance

`comfy_loras.py` selects only story-owned creator NPCs: exact NPC-name matches in free-form mode, or UUID-linked `visual_character_id` records in a saved scene plan. It validates path-free `.safetensors` filenames, bounded positive weights, duplicates and maximum **three** LoRAs.

Only explicitly enabled image requests use this path. `SceneImageService` checks ComfyUI's inventory/`LoraLoader` over loopback and chains MODEL/CLIP loading before `KSampler`/`CLIPTextEncode`, including the img2img branch. Requests without LoRA use the previous graph/signature.

`render_provenance.py` validates gallery metadata. `visual_assets.render_details_json` stores per-version settings exposed as `render_details`. `VisualState.clone_branch` and `story_archive` preserve/remap metadata and support safe v1 import. LoRA weights are never embedded in the story.

## SpriteDraftService: explicit five-step generation and approval

`SpriteDraftService` connects `CreatorMediaService` and `SceneImageService`, but does not start ComfyUI on app launch or ordinary story turns.

Workflow: **create draft with no GPU → request each expression separately → GET own story/UUID preview → approve all five → transactionally publish assets**.

SQLite `sprite_drafts` stores snapshot settings and slot state; `store.root/sprite-drafts/<story>/<draft>` holds temporary PNG previews excluded from reader/archive until approval. Limit three drafts per story, expire after 48 hours of inactivity, cleanup on create/list.

`comfy_runtime.render` centralizes `/prompt`, `/history/<prompt_id>`, and `/view`; it validates responses and shares the `SceneImageService.lock`, VRAM reserve, and checkpoint/LoRA preflight. A failed expression leaves earlier valid previews intact.

`sprite_cutout.transparent_sprite` preserves existing alpha or removes border-connected green chroma, reduces simple edge artifacts and rejects opaque/cropped/out-of-budget candidates. This is **not neural human segmentation**; editor review is required.

Approval assembles an RGBA row and invokes the transactional expression importer. `sprite_provenance.py` validates `generation_json`; legacy `source/generation_json` rows default to `manual/{}`. Approved provenance survives forks and v1 archives, including imports predating the new fields.

### Strict ComfyUI output validation

`comfy_runtime.render` accepts `prompt_id` containing only ASCII alphanumerics, hyphens, underscores (max 100), preventing an upstream response from injecting `/history/<id>` routes. It accepts only valid `output` items from the Noble SaveImage node and path-free filenames; ComfyUI's reported subfolder must be empty, matching fixed Noble `filename_prefix`.

The client never interprets an upstream filename as a Noble local filesystem path. `tests/test_comfy_runtime.py` covers malicious responses before querying `/view`.

## IPAdapter Plus and editorial alignment

`comfy_identity_adapter.inject_ipadapter` changes a graph **only when** the author requests `reference_mode='ipadapter'` using an owned reference for a particular NPC draft.

It adds `IPAdapterUnifiedLoader` and `IPAdapter` after optional LoRA nodes and uses `LoadImage` for the reference. `KSampler.model` receives the conditioned model; `CLIPTextEncode` retains checkpoint/LoRA CLIP, and `KSampler.latent_image` stays `EmptyLatentImage` for newly drawn expressions. The img2img alternative remains `LoadImage → VAEEncode`.

`reference_preparation.identity_reference_png` letterboxes the whole character as RGB rather than cropping with `ImageOps.fit`. Preflight reads only expected ComfyUI plugin-node/model endpoints; missing dependencies fail visibly. No automatic weight or code download occurs.

Owned gallery images or previously approved `foreground` for the **same NPC/story** must remain unchanged under SHA-256. `sprite_provenance.py` persists `comfy-sprite-v2-ipadapter` with preset, strength, reference digest; backups/forks preserve this structure and older v1 data.

`sprite_alignment.py` performs **geometry warnings, not face recognition**: calculate visible-alpha bounding box with threshold 128; compare center drift and scale against neutral. Before publishing, revalidate five final PNGs/SHA-256. Significant displacement requires explicit creator acceptance instead of mislabeling a face as verified.

## Neural RMBG with separate IMAGE/MASK outputs (v3/v4)

`comfy_matting.py` defines a closed registry of neural cutout modes. The backend inspects `/object_info/{RMBG,BiRefNetRMBG,MaskToImage}` and `/models/rmbg` without running inference, checking required files/config for each model. Missing dependencies yield 422 rather than silent chroma fallback or a download.

An explicitly requested draft extends the graph with `VAEDecode[6] → (RMBG or BiRefNetRMBG)[23]`, with `background='Alpha'` and `unload_model=true`. Two outputs are saved: processed `IMAGE → SaveImage[7]` and `MASK → MaskToImage[24] → SaveImage[25]`.

`comfy_runtime.render_outputs` retrieves **both images from one job ID** after output completeness/path validation. `transparent_sprite_from_matte` uses the grayscale mask as soft Pillow alpha instead of assuming SaveImage preserves four tensor channels. Five validated previews and explicit human approval remain necessary.

`SpriteDraft.settings_json.cutout_mode` defaults to `chroma_green` for older drafts. Published `creator_media_assets.generation_json` stores `quality.method` and matting model: v3 for neural cutout, v4 with IPAdapter as well. Provenance validation enforces consistent mode/model/method combinations, rejects tampering, and retains compatibility with older v1/v2 assets.

Story/NPC ownership, reference SHA-256, edge quality, and geometry acceptance gates still apply.
