# Noble AI — Colab feedback and story-first product backlog

**Source:** owner testing Noble AI in Google Colab on November 5, 2026.  
**Status:** requested backlog; **this document is not evidence of implementation or validation**.  
**Scope:** features, usability, architecture, hardware stability, and story distribution.  
**Tracking:** [TODO](../TODO.md) and [Progress](PROGRESO.md). Implementation targets `master`; mark a task complete only after code and verifiable tests.

## Product principle

**Noble AI should open with stories to play and tools to create them.** Model Hub, runtimes, downloads, and technical management must be separate tools accessed as needed—not the permanent center of the product.

Three independent journeys:

1. **Player:** Discover stories → inspect synopsis, cast, tags, cover, prerequisites → install/open world → choose protagonist and opening → play/read with continuity.
2. **Creator:** Describe an idea → AI assistant proposes world, public/private plot, secrets, characters, scenes, and image plans → review/edit each field → generate/import media → test the story → optionally publish a versioned package.
3. **Technical administrator:** Find/install/assign narrator, image, and speech models → configure engines and GPU budgets → test inference → inspect downloads, logs, and provider health.

Do not present a feature as complete merely because a button or mock exists.

## Proposed sequence and acceptance criteria

### P0 — Make the product truly usable through the interface

**N-01 — Integrated image model installer**

- Real catalog of compatible checkpoints, LoRAs, ControlNet, VAEs, and workflow-family dependencies. Detect supported ComfyUI nodes. Show author, license, model family, format, size, approximate VRAM, and prerequisites.
- Install explicitly through UI with resumable download, progress/cancel, trusted hash checks when published, safe storage paths, free-disk checks, license/terms review, and authentication-aware error handling. Never run arbitrary downloaded code.
- Choose profile defaults, render one real image on the connected runtime, preserve old images when rendering fails. Delete only unused, verified Noble-owned model files.
- **Acceptance:** interrupted/resumed transfer + integrity + ComfyUI inventory + **one actual render per supported family**. Catalog visibility alone does not prove Flux/Illustrious compatibility.
- **Partial implementation since request:** individual public Hugging Face root-level `.safetensors` checkpoints and an existing-ComfyUI runtime manager. Full N-01 remains open.

**N-02 — TTS installer and voice library**

- Catalog compatible Piper voices with language/accent, size, source samples, and documented model provenance. Install both `.onnx` and `.onnx.json` with pair/hash validation.
- UI progress, pause, retry, default and per-NPC voice assignment, pace/pauses, and controlled **Listen to sample** preview. Prioritize natural Latin American Spanish when that narrative language is chosen; `es-MX` metadata alone does not certify quality.
- Keep speech on demand and default OFF. Support cancellation/queues and settings persistence.
- **Acceptance:** UI install → visible voice → real WAV synthesis → play/pause/stop in browser → persistence, multi-voice, cancellation, and disconnect recovery.
- **Partial implementation:** limited Piper voice catalog/download/preview. Per-NPC voices and real physical voice validation remain open.

**N-03 — Structured engine settings**

- Separate **Narrator**, **Images**, **Voice**, **Performance/GPU**, **Providers**, **Downloads**, and **Diagnostics**, with clear headers/statuses/help and meaningful T4/8/12/16/24 GB profiles. Avoid one unstructured column of fields.
- Images: model architecture, checkpoint, valid resolution steps, CFG, sampler/scheduler, seed, negatives, LoRA strength, IPAdapter references, matting, cache, output paths. Show only implemented and provider-compatible controls.
- Voice: model/language/accent, per-character assignment, speed, silence, volume where supported, device/load, preview, and independent automatic-reading preference.
- Save/cancel/revert, validate range and effective graph changes, connection health, and backward-compatible SQLite migrations.
- **Acceptance:** saved settings actually affect the next image and WAV; API and desktop/mobile Playwright checks.

**N-04 — Narration + image + voice orchestrator**

- Define job dependencies and states for narration, scenes, backgrounds, sprites, event CG, and TTS. Provide a visible queue, idempotent cancellation, bounded retries, story-switch cleanup, and no duplicate/partial publication.
- Implement actual GPU/RAM arbitration for Colab T4 and local devices: controlled release/unload of **owned** Ollama/ComfyUI/Piper resources, recovery from OOM, and explicit fallback. Never assume all three engines fit simultaneously.
- Resource presets: text-first, balanced, visual-first, CPU-only. Narrative play must survive image or voice failures.
- **Acceptance:** 20 mixed turns with measured device budgets, cancellations at every stage, restart recovery, zero partial publications, real peak-VRAM logs. Mocked metrics do not count.

**N-05 — First-run and physical Colab QA**

- Validate the real T4 flow: in-app model installation, endpoints/proxy, narrator, checkpoint, TTS, Drive persistence, saved configuration, and migrations. Also test a no-GPU environment.
- Surface separate narrator/image/TTS readiness; never show a generic **Ready** when required dependencies failed.
- **Acceptance:** installer logs, desktop/mobile screenshots, one physical image and voice, playable first story, and successful reopen without loss.

### P1 — Put playable stories and Creator Studio first

**N-06 — Redesign Library, Detail, Reader, and primary navigation**

- Home with stories, not engine diagnostics. Distinct **My Library**, **Continue**, **Discover**, **Creator Studio**, and **Settings** destinations. Use covers, synopses, cast, tags, status, and reading history.
- Immersive story detail with synopsis, characters, background art, openings, model requirements, language, creator/version, and preview. Preserve progress on desktop/mobile.
- Helpful empty states without requiring ten technical fields before play. Do not nest a cramped library list under unrelated settings panes.
- **Acceptance:** desktop/mobile screenshots; deep-link, reload/back tests; create/open/continue/edit without losing position.

**N-07 — AI-assisted Creator Studio**

- From concept, tone, genre, output language, and author constraints, produce a **reviewable structured draft**: title, pitch, synopsis, private lore, hidden canon, world rules, arcs, opening scenes, meaningful choices, NPC personalities/dialogue, Lorebooks, and initial state.
- Validate schema, references, and limits before saving. Never silently overwrite existing creations or leak private narrator data into public synopsis.
- Offer explicitly approved visual plans for covers/backgrounds/NPC sprites, with queues, previews, retries, GPU budget visibility, and identity references. Do not promise models/assets that are not installed.
- **Acceptance:** turn a one-sentence idea into an editable **playable** story, optionally generate assets, export/import/fork without losing data, validate schema and physical rendering.
- **Partial implementation:** structured three-stage AI drafts, section regeneration, validation, and transactional install. Full illustrated novel workflow is pending.

**N-08 — Complete reproducible demonstration story**

- Upgrade the superficial original **La estación de la última luna** experience into a curated package: coherent public/private plot, 3–5 distinct NPCs, visual descriptions, locations, Lorebooks, world state, three openings, and meaningful early decisions.
- Include sample media with explicit licenses or offer a clearly optional editorial generation step; never fake a cover or claim visual assets exist.
- Install only into an empty library or by explicit selection. Do not duplicate/overwrite user-edited demo stories on update.
- **Acceptance:** play 10–20 turns, test alternate decisions, reopen with canon continuity, inspect illustrations and backup.

**N-09 — Bundled Story Hub**

- Installable packages with covers, author, language, license, tags/classification, version, requirements, synopsis, cast, and a **real opening**, not just a title.
- Install/uninstall/import/repair as independent copies; preserve player edits and progress across package upgrades.
- Separate **Discover Stories** from **My Library**. Installing a story must not activate a remote provider or transmit private data.
- **Acceptance:** three complete original packs with independent installation, play, export, and safe updates.
- **Partial implementation:** three bundled text-only worlds with transactional copies, four NPCs and three openings. Public community publishing is separate work.

**N-10 — Creator community and publishing**

- After a safe local pack format: configurable registry, creator pages, search/filter, versions, dependencies, licenses, integrity/signatures, and incompatible-version handling.
- Consent, permissions, attribution, moderation, reporting, secure downloads, archive inspection, and redistribution restrictions for images/model weights. No fake upload/auth flow.
- Distinguish creator story packages from model-checkpoint downloads. Guard ZIP size, expansion ratio, path traversal, embedded links, and assets.
- **Acceptance:** real registration/publication/install/update integration with access controls and adversarial file tests.

**N-11 — Standalone Urakatsu-depth Model Hub**

- Extract from an overly large `App.tsx` into a dedicated page, with search, sorting, useful cards, master/detail UI, `Narrator / Images / Speech` roles, and download history.
- Model details: author, README, variants/files, license, format, engine, quantization, family-specific requirements, estimated hardware fit, install/apply and test actions.
- Reuse compatible Urakatsu patterns with required notices; no dependency on Urakatsu services.
- **Acceptance:** end-to-end **search → compare → detail → install → select → test** for every supported model family, responsive/deep-linked; never label discovery-only entries as installable.

**N-12 — Split frontend by domain with coherent UX**

- Break down `App.tsx` into separate routing/modules/hooks for Library, Story Hub, Creator Studio, Reader, Model Hub, and Settings.
- Shared design system: typography, spacing, meaningful state indicators, empty/loading/error screens, responsive breakpoints, form and keyboard accessibility.
- **Acceptance:** preserve existing deep links, reader state, and story creation; compare real screenshots and E2E test results. Renaming buttons or colors does not count as full redesign.

### P2 — Immersion and community growth

**N-13 — Automated visual narrative planning with approval**

- Let the orchestrator propose locations, cast/presence, emotions, backgrounds, sprites, and CG from scene state. Process a batch only with user approval, cache/reuse, and identity controls.
- Do not generate a full illustration for every line; reuse existing scene assets. Media failure must not block narrative text.
- **Acceptance:** an idea-generated story with reviewed media, ten unchanged-scene turns with no background regeneration, correct new-location transitions, measured costs/memory.

**N-14 — Creator ecosystem**

- Creator profiles, public package/version pages, favorites/collections, ratings/reports, moderation, discovery, import/export, and takedown paths. Design privacy/access before opening publishing.
- **Acceptance:** actual authorization and publication flows, not placeholder controls.

**N-15 — Orchestrator observability**

- Queue/status dashboard, RAM/VRAM, TTFT/TPS, image and TTS latency, per-model failures, and per-story performance.
- Local history and diagnostic export without leaking secret prompts. Distinguish simulated CI from Colab/Windows measurements.
- **Acceptance:** real Colab and Windows sessions, interrupted-network/CPU/GPU cases, versioned reports, and tested recovery.

## Engineering delivery rules

- Do **not** claim completion of this entire backlog in one change. Deliver functional vertical increments: contracts/tests, UI, then real provider validation.
- No milestone is complete merely because an audit, mock, notebook, or route describes it.
- Every completed feature needs a commit in `master`, positive/negative tests, desktop/mobile screenshots for UI changes, and physical GPU logs for hardware claims.
- The community Hub is **not** the same as the built-in Story Hub.
- When the specific Colab runtime is inaccessible, rely on the user's logs/screenshots without claiming a live remote experiment.
- Preserve SQLite history, earlier story formats, `.noble.zip`, snapshots, branches, and notebooks; validate migrations using older data.

## Partial N-09/N-08 implementation (November 5–6, 2026)

`story_hub.py` and `StoryHub.tsx` provide three original **text-based** worlds with four NPCs, three openings, Lorebooks, and independent transactional installation. The Colab demo uses a richer pack only when the library is empty. [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781) reported 358 Python / 68 Playwright / successful Vite build.

There are still no included cover images, versioned external pack upgrades, community registry, or publishing backend. N-08/N-09/N-10 full acceptance definitions remain open. See [Story Hub](STORY_HUB.md).
