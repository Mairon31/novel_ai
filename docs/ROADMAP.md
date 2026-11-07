# Noble AI — roadmap and definition of done

**Updated product direction:** app-first, story-first, creator-first. This roadmap records historical P0–P5 phases and later Argon/Colab feedback. The actionable implementation checklist is [TODO.md](../TODO.md); [Progress](PROGRESO.md) records completed changes and evidence. Milestones remain open until their **full acceptance criteria** pass, even if some constituent features have shipped.

## Updated execution plan — Argon audit (November 5, 2026)

The earlier roadmap phases below remain historical context. The current backlog follows the 22 sections of [Argon audit](ARGON_AUDITORIA.md), cross-referenced by stable AUD identifiers. Avoid confusing section numbers with similar-looking AUD IDs. Integrate work directly on `master` unless explicitly instructed otherwise.

| Dependency sequence | Demonstrable delivery | Acceptance evidence |
|---|---|---|
| Phase 1 / P0 | Transactional SQLite, safe file paths, resilient downloads, cancelable SSE, credential security | Rollback/50 writes, adversarial paths/symlinks, interrupted transfer, cancellation recovery |
| Phase 2 / P0–P1 | VRAM arbitration, owned runtime lifecycle, Model Hub V2, real hardware fit checks | 20–25 mixed text/image turns without OOM, measured quantization and memory comparison |
| Phase 3 / P1 | Per-turn canon and witnesses, Lorebooks, summaries, hybrid memory with bounded context | 100–120-turn story, exact fork restoration, visible budgets |
| Phase 4 / P1 | Stage director, background reuse, emotion sprites, reproducible ComfyUI, character voices | Ten same-scene turns without new background, fast sprite switches, multi-voice TTS |
| Phase 5 / P1–P2 | Separate product spaces, VN/Book/Chat, basic/advanced Studio, PNG V2/V3, mobile | Deep links, imports, desktop/mobile Playwright, no fake controls |
| Phase 6 / P2–P3 | Desktop package, versioned benchmarks, distinct product capabilities | Real installer/portable build, reproducible reports, export and regression results |

`store.py` already uses WAL, `narrative.py` provides SSE, and `downloads.py` uses Range and SHA-256 where a trustworthy upstream hash exists. **These partial facts do not certify complete phases**.

## Priority shift from actual Colab use — November 5, 2026

Owner testing exposed gaps in image/speech model installation, full settings, intelligent orchestration, a detailed Urakatsu-level Model Hub, and the workflows for **playing and authoring compelling stories**. A community story hub and a Creator Studio that can produce structured stories with visuals are future needs. The current demonstration stories do not yet represent the desired full illustrated experience.

**Functional priority:** playable stories and Creator Studio before infrastructure-centered landing pages. The plan is **not automatically implemented** by documenting it.

| Order | Milestone | Overall acceptance |
|---|---|---|
| P0 | In-app image/TTS installers, per-engine settings, resource/job orchestration, physical Colab QA | **Open**; first installers and runtime manager partly implemented |
| P1-A | Story-first Library/Detail, complete demo, bundled Story Hub | **Open**; local text packs exist |
| P1-B | Editable AI-assisted idea → world/NPC/lore/scene/image workflow | **Open**; structured draft generation exists |
| P1-C | Independent detailed Model Hub and modular frontend | **Open**; initial master/detail and registry exist |
| P1-D | Community creator publishing, permissions, moderation, versioned packs, licenses | **Open** |
| P2 | Automated visual direction, collections/marketplace and real orchestrator telemetry | **Open** |

The full N-01–N-15 requirements are in [Colab feedback backlog](FEEDBACK_COLAB_Y_BACKLOG.md). Deliver vertical increments to `master`, rather than trying to close everything in a single session.

---

## P1.5 — Persistent visual state and non-destructive gallery (implemented in code)

- [x] Conservative location-change detection after completed narration, without another model call.
- [x] Persistent scenes with provenance/detection mode and manual correction.
- [x] Every import/render saves a distinct WebP version with SHA-256 and gallery selection.
- [x] Non-destructive migration of legacy `scene.webp`.
- [x] Versioned per-character visual profiles, included in prompts only when relevant.
- [x] Preview of the enriched illustration prompt without inference.
- [x] Exact cache by explicit seed, configuration, checkpoint, scene, and relevant traits.
- [x] Forked gallery/profiles are isolated from future scenes of the original timeline.
- [ ] Validated semantic extraction of scenes and cast presence.
- [ ] Full reference-image/IPAdapter/LoRA identity consistency across real checkpoints.
- [ ] Intelligent image planning with persistent cancelable queues, GPU budgets and multiworker deduplication.
- [ ] Commercial image API options and GPU/cloud speech adapters.
- [ ] Actual VRAM/offload priorities among LLM, diffusion, and TTS.
- [ ] Physical visual/media validation and grouped benchmarks.

## P1.4 — Connectable local multimedia and persisted canon (implemented in code)

- [x] Editable per-story canon included in narrator context; automated extraction/reconciliation remains separate.
- [x] SSE `status` phases for preparing context, connecting, and streaming, with elapsed time and abort.
- [x] On-demand ComfyUI: checkpoint in UI, standard graph, seed/settings, polling, validated local WebP; disconnected service does not block text.
- [x] On-demand CPU Piper: local ONNX voice inventory, path validation, cached per-turn WAV, Listen/Stop controls.
- [x] Responsive multimedia controls with access from the reader and independent Settings destinations.
- [x] Mocked ComfyUI with real Pillow image decoding and simulated Piper CLI with WAV contract tests.
- [ ] Real ComfyUI and compatible model on a physical GPU (functional test before extended benchmarks).
- [ ] Real Piper ES-LA pronunciation/intonation tests.
- [ ] Automatic scene-aware visual planning.
- [ ] Multi-character narration/voice casting and additional TTS runtimes.
- [ ] Robust visual identity and comprehensive GPU scheduler for 12/16 GB.
- [ ] Complete derived canon, branch management, and summaries.

**P1.4 gate:** green Python/React/Playwright plus actual external-engine tests. Mocked CI alone is not the end of verification.

# Historical app-first roadmap (ADR-0002)

Baseline created November 4, 2026 after [ADR-0002](adr/0002-app-first-model-hub.md). **The status notes in this section describe the phase at that historical date**, not a present-day audit. The original dependency order put Model Hub/Onboarding ahead of narrative play; later feedback shifted editorial priorities toward stories and creators. Colab is optional diagnostics, not the main UI.

## Engineering principles

1. Assemble suitable open-source tools and evaluate their licenses/costs.
2. Users should not have to edit config files, manually download weights in a terminal, or run a notebook before using the product.
3. UI/API must be functional from early increments; mock providers belong only in tests.
4. Certify features with appropriate CPU tests, real integrations, desktop/mobile visual QA, and logs.
5. Persist narrative turns while optional images/TTS remain nonblocking; never make unmeasured 12/16 GB claims.
6. Record architectural decisions as ADRs and update progress evidence when changing them.

## Phase P0 — Open-source study and contracts (documented)

- [x] Initial README, GDD, architecture, memory, API and QA.
- [x] OSS tool/license inventory.
- [x] Technical Urakatsu MIT and Koharu MIT/Apache-2.0 research with source paths.
- [x] App-first ADR-002 and Model Hub/onboarding/desktop specifications.
- [x] Basic documentation CI; **not physical GPU inference**.
- [ ] Reuse comparison of Urakatsu catalog versus `huggingface_hub`, with real cost/attribution assessment.
- [ ] Exact upstream source revision and reusable-component license review.

**P0 gate:** explicit contracts/licenses and honest unverified states.

## Phase P0.5 — Visual app and Model Hub (first executable goal)

[Issue #9](https://github.com/Mairon31/novel_ai/issues/9) · [Issue #10](https://github.com/Mairon31/novel_ai/issues/10)

- [x] Initial React/Vite/TS frontend with Library, Model Hub, Downloads, Settings, wizard and Diagnostics.
- [x] Initial FastAPI, hardware/disk discovery and settings; complete runtime orchestration remained separate.
- [ ] Resumable first-run wizard for model directory, download policy, and device, without forcing a model.
- [x] Hugging Face GGUF metadata/variant search; real network compatibility requires separate evidence.
- [ ] Calibrated 12/16 GB fit estimates with uncertainty and role filters.
- [ ] Complete durable job/verified pause-resume-cancel/import/installed registry coverage with physical tests.
- [ ] Per-role `narrator/image/tts` assignment and capability-grounded provider settings, global presets and story overrides.
- [ ] Zero automatic TTS downloads/synthesis when opening a settings page.
- [ ] Contract and small real download tests, Playwright 390×844 and 1440×900 screenshots.

**P0.5 gate:** open without model, install/import a compatible weight, reopen, select from UI, with observed logs.

## Phase P1 — Narrator engine and persistent gameplay

[Backend #3](https://github.com/Mairon31/novel_ai/issues/3) · [LLM #4](https://github.com/Mairon31/novel_ai/issues/4) · [Runtime #11](https://github.com/Mairon31/novel_ai/issues/11)

- [x] KoboldCpp/Ollama adapters and connection settings; automatic runtime installation pending.
- [x] Basic managed KoboldCpp start/stop, health, GPU layers including CPU; robust swap/rollback/runtime download/OOM still pending.
- [ ] Complete long-term SQLite state/memory/branching requirements; simple persistence alone is not enough.
- [x] New story, streaming, free-form input, Continue, restart/reopen; retry/edit/branches evolved in later increments.
- [x] Responsive text-only VN reader, independently of artwork; sprites/background were initially P2.
- [ ] Ten real-GPU LLM turns, with idempotence and recovery checks beyond mocks.

**P1 gate:** select LLM in UI, start, generate, save, and branch with repeatable real-provider evidence.

## Phase P1.1 — Advanced settings, visual reading, remote LLM (experimental implementation)

- [x] Persisted story output language, prompt translation, narrative style, and appearance.
- [x] OpenRouter adapter with API key outside SQLite.
- [x] Protagonist identity, scene/inspector reader, validated manual image upload.
- [x] Runtime diagnostics and stable/beta/nightly release checks.
- [x] Cloudflare-tunneled LLM worker registration, bearer proxy, remote model assignment UI and mocked tests.
- [ ] Complete desktop/mobile reader and worker visual acceptance.
- [ ] Real Colab remote-GPU tunnel, latency, reconnect and safe context limits.
- [ ] Authenticated LAN access; primary backend currently defaults to loopback.
- [ ] Remote image and speech workers with resource reservations.
- [ ] Runtime installers and signed application updates/rollback.

**P1.1 gate:** CI and a real reproducible remote inference path; the latter was not established by the initial tests.

## Phase P1.2 — Remote GPU probe (tools available)

- [x] Authenticated TTFT, duration, error and sampled VRAM diagnostics.
- [x] Remote worker GPU/latency status screen.
- [x] Colab notebook using CUDA llama.cpp and temporary Cloudflare Quick Tunnel.
- [x] Benchmark CLI and offline contract tests.
- [ ] Capture real GGUF inference through a remote Colab T4/L4 worker, rather than only same-machine Colab.
- [ ] Real network failure, session recovery, and OOM tests.
- [ ] Measured desktop 12/16 GB hardware profiles.

**P1.2 gate:** a real attached remote-worker benchmark, still open.

## Phase P1.3 — First physical GPU report (partial)

- [x] Actual Noble AI API + GGUF experiment: Qwen3-4B-Instruct-2507 Q4_K_M on Tesla T4, three generations completed.
- [x] Reproducible environment, model SHA-256, TTFT/total/character count and sampled GPU/VRAM.
- [x] Documented cold vs warm behavior and sampling limitations.
- [ ] Explain/reduce cold-first-turn delay and show model preparation in the UI.
- [ ] More warm samples, model status and literary-quality evaluation.
- [ ] Remote Cloudflare-tunnel narrator from a second computer. The local Colab test does **not** cover this.
- [ ] Larger LLMs, real 12/16 GB devices and diffusion/TTS arbitration.

**P1.3 gate:** repeated cold/warm and narrative-quality tests, without inventing tokens/s. See [Colab QA v1.4](COLAB_QA_V14_RESULTADOS.md).

## Phase P2 — ComfyUI, character identity, progressive art

[Issue #6](https://github.com/Mairon31/novel_ai/issues/6)

- [ ] Complete capability-based checkpoint/workflow/LoRA/seed/sampler/steps/CFG/resolution UI, across supported model families.
- [ ] ComfyUI job API with workflow validation, cache/manifest, leases and errors.
- [ ] Scene-aware generation/reuse, not an image for every response.
- [ ] Identity/versioned outfits and ten-scene visual quality evaluation.
- [ ] Ten dialogue turns in one scene → zero new art; scene change → at most one job.

Parts of the above were subsequently implemented as documented below, but full P2 remains open.

**P2 gate:** real art generated, reused, and attached to the correct story/branch without blocking text.

## Phase P3 — On-demand, configurable TTS

[Issue #7](https://github.com/Mairon31/novel_ai/issues/7)

- [ ] Compatible engine/voice/language/device selection, exposing CPU/GPU/Auto only where supported.
- [ ] Lazy worker, per-character audio, cache by text/voice/version.
- [ ] OFF by default, manual Listen, auto-read only if explicitly enabled.
- [ ] Fifty turns with TTS disabled → zero syntheses; real audio and resource results.

**P3 gate:** real manual audio with working controls and no effect on text play when speech fails. Piper pieces have shipped, but comprehensive multi-engine/character acceptance is open.

## Phase P4 — Full product UI and Windows packaging

[Frontend #5](https://github.com/Mairon31/novel_ai/issues/5) · [Desktop #12](https://github.com/Mairon31/novel_ai/issues/12)

- [ ] Comprehensive Library, visual world/character editor, Gallery, import/export.
- [ ] Candidate Tauri 2 shell with FastAPI sidecar, no-console install, user-chosen storage.
- [ ] Verified updates/permissions, authenticated opt-in LAN, process recovery.
- [ ] Desktop/mobile visual QA and physical installer/executable tests.

**P4 gate:** install and launch desktop application, finish a chapter without editing files manually.

## Phase P5 — Actual hardware and portability measurements

[GPU #8](https://github.com/Mairon31/novel_ai/issues/8) · [Colab #1](https://github.com/Mairon31/novel_ai/issues/1)

- [ ] NVIDIA 12 GB and RTX 5060 Ti 16 GB measurements with exact models/revisions/hashes.
- [ ] Text → image → speech sequences with offload, OOM handling, RAM/VRAM/p95/persistence.
- [ ] Colab as optional laboratory, never mandatory installation.
- [ ] CI for app, contracts, integration/E2E, backup/restore, performance, docs, and licensing.

**P5 gate:** reproducible 12/16 GB reports with real hardware, limitations, and recovery evidence.

## Definition of done for issues and pull requests

- Actual code, validated API/data states, and a clear test plan.
- Exact commands/results; desktop/mobile Playwright screenshots for UI changes.
- Model hashes/provider revision; licensing notices for adapted code.
- Working buttons/error states; no decorative controls masquerading as functionality.
- Navigation in Settings/Model Hub does not load models or synthesize speech.
- Real-GPU tests specify device, driver, backend, preset, and observed peak VRAM.
- Update README, relevant ADR, [Progress](PROGRESO.md) and issues; never conceal failures.

[Model Hub](MODEL_HUB.md) · [Onboarding](ONBOARDING_Y_UI.md) · [Urakatsu/Koharu references](REFERENCIAS_URAKATSU_KOHARU.md) · [Desktop](DESKTOP_Y_DESPLIEGUE.md)

---

## Later P1.4 delivery — expanded functionality

- [x] Per-story editable canon reinserted into narrator context.
- [x] Independent forks from saved turns, with copied story/art and origin metadata.
- [x] Explicit model warmup API without writing test turns or loading GPU at startup.
- [x] Inference progress, elapsed time, and cancel controls.
- [ ] Interactive branch tree, merge/rewind/conflict handling, per-branch caches.
- [ ] Auditable, configurable automatic extraction of chapter facts.
- [ ] Multi-level resource manager for ComfyUI/LLM/TTS.

## Image references and GPU resources

- [x] Basic ComfyUI VAEEncode img2img using a saved story-gallery WebP.
- [x] Story ownership and reference SHA-256 validation.
- [x] Configurable denoise and reproducible cache signature for reference/seed/prompt/config.
- [x] On-demand free VRAM query via `nvidia-smi`, without pretending a model was measured.
- [x] Minimum VRAM reserve/one-request explicit override.
- [ ] Full FaceID/IPAdapter real-hardware identity stability across model families.
- [ ] Owned-process offload and LLM↔ComfyUI↔TTS scheduling.
- [ ] Per-process memory telemetry, multi-GPU, heterogeneous CUDA/model checkpoints.

## Scene planning and local resources (implemented components)

- [x] Per-scene plans with composition, framing, lighting, atmosphere, cast and saved references.
- [x] Character reference gallery image with validated association and fork remapping.
- [x] Prompt preview without loading inference models.
- [x] Optional local LLM/diffusion operation exclusion, released on completion/error.
- [x] Concurrent initial-scene duplicate prevention in SQLite.
- [ ] Robust multi-reference identity conditioning and region consistency.
- [ ] Durable GPU-aware prioritized queues, cancellation, and owned-weight unloading.

## Authorial layered-story media

- [x] Per-story WebP backgrounds and alpha-PNG foreground sprites.
- [x] Appearance captions, conservative whole-word selection, optional NPC mapping.
- [x] Basic existing-asset reader compositor; no automatic generation on every turn.
- [x] Media ownership/remapping when forking stories.
- [x] Model Hub fit filters and visual memory-demand explanations.
- [ ] Rich expression/pose viewer, animation/layer positioning.
- [ ] Reviewable semantic match engine and per-scene rules.
- [ ] Full runtime-specific image/TTS model installation and compatibility reports.

## N-08/N-09 — partial local Story Hub

Three bundled original **text-only** worlds can be installed as independent copies with NPCs, openings, and Lorebooks from Library. Colab's enriched demo does not overwrite an existing library. [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781) passed **358 Python / 68 Playwright**. **N-08 and N-09 remain open** for art, external packs, and real immersive QA; N-10 (remote community publishing) is not implemented.

- [x] Separate `#/descubrir` route for future remote discovery. Its current catalog remains local, without a community service.

## N-07 — first AI-assisted Creator Studio slice (November 6)

Creator Studio can request a structured, editable proposal from the configured LLM in three stages: public/private world, four NPCs, three Lorebook entries, and three openings, with review before transactional SQLite installation. This is **not complete automatic illustrated-novel creation**. Further per-section regeneration and editing were later implemented; visual plans, covers, backgrounds, sprites, speech casting, and long-run physical-GPU QA remain open.

- [x] Initial assistant/confirmation tests: [CI #42180655437](https://github.com/Mairon31/novel_ai/actions/runs/42180655437), **365 Python / 72 Playwright / Vite PASS** for `3be0b5c`, including editing NPCs/Lorebooks/tags/openings.

## Anime roleplay and illustrated-story preparation — November 6 (planned)

Real-use feedback and two composer screenshots increased priority for engaging anime/fantasy stories rather than superficial UI polish. [Detailed narrative experience plan](PLAN_HISTORIAS_ANIME_2026_11_06.md) and [TODO N-16–N-24](../TODO.md) are the source requirements.

1. **Reliable authoring:** validated story wizard, essential fields, anime/fantasy templates, front/server validation, editable previews (N-23).
2. **All-in-one experience:** install/select/configure image and speech models and manage queues/resources *inside Noble AI*, not another application's interface for routine use (N-21; depends on N-01/N-03/N-11).
3. **Illustrated stories prepared before interaction:** new or opened illustrated stories missing media should enter **Preparing story**, schedule cover/background/sprites, persist/recover jobs, and only activate LLM/player input when requirements pass; allow explicit retry or text-only choice (N-22/N-23).
4. **Narrative director, not an agreeable chatbot:** arcs, canon, world constraints, autonomous NPCs, consequences, and out-of-character handling (N-18).
5. **Roleplay composer:** integrated Speak/Act/Think/Observe/Interact toolbar, per-story settings, separated Retry/Delete, responsive screenshots (N-19).
6. **Artwork/content:** anime/fantasy by default, worldbuilding, narrative arcs, coherent prompt styles, backgrounds, sprites, covers (N-20).
7. **Cast voices:** expand Piper with Pocket TTS, OmniVoice, Kokoro, Qwen3-TTS after licensing/ES-LA/runtime checks; distinct narrator/NPC voices (N-16/N-17).
8. **QA gates:** impossible-action and non-sycophancy tests over 10–20 turns, desktop/mobile evidence, failures/recovery, and real Windows/Colab runs. **Do not mark complete because an item is designed.**

Existing Piper/ComfyUI/Creator Studio/Story Hub components remain valuable building blocks but do not yet satisfy this full scope.

### N-25 — Separate settings pages (implemented and validated November 6)

Before expanding N-21 controls, separated previously combined sections into **Images**, **Voice / TTS**, **About Noble AI**, and **Updates** as independently navigable destinations. Do not merge unrelated options again merely to reduce the tab count. Preserve settings, Piper/ComfyUI functions, update checks, and mobile navigation.

`WorkspaceSettings.tsx` holds independent navigation; `CreativeSettings.tsx` was replaced by the distinct components. [CI #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131) passed **381 Python / 80 Playwright / Vite**. See [settings acceptance](CONFIGURACION_APARTADOS.md).

### N-21 — First sampling/style implementation (November 6)

Persisted image sampler/scheduler values are sent to KSampler. Anime presets affect prompts, and manual runtime capability inspection rejects unsupported non-default combinations before inference. Advanced image settings, per-story/scene settings, multi-model installation and new TTS providers remain open. [Image controls](CONTROLES_IMAGEN.md).

### N-01/N-21 — First image checkpoint installer (November 6)

Implemented on `master`: Hugging Face repo inspection of eligible individual public safetensors with SHA-256, durable jobs, transfer pause/resume/cancel, safetensors validation, managed storage, and ComfyUI model-path YAML. Images settings exposes this without requiring an external downloader.

Full model-family support, LoRA/VAE/accessories, per-story settings, automated **ComfyUI app installation**, and physical GPU rendering remain open. [Checkpoint guide](CHECKPOINTS_IMAGEN.md). [CI #42342017206](https://github.com/Mairon31/novel_ai/actions/runs/42342017206) reported **393 Python / 82 Playwright / Vite PASS** for the initial flow.

### N-01 — Managed local ComfyUI runtime (second increment)

Noble AI can validate an **existing** ComfyUI directory and Python executable, configure port/VRAM mode, launch `main.py` using fixed safe arguments with `--listen 127.0.0.1` and `--extra-model-paths-config`, check `/system_stats`, inspect logs, and stop only its own process. A separately installed ComfyUI instance no longer needs to be started manually when managed launch is configured.

This does **not** install/upgrade ComfyUI or dependencies, automatically install plugins, certify SDXL/Flux compatibility, or prove real GPU generation. [Runtime guide](COMFY_UI_INTEGRACION.md). [CI #42343797171](https://github.com/Mairon31/novel_ai/actions/runs/42343797171) passed **398 Python / 84 Playwright / Vite**, including browser cross-site start/stop protections. Third-increment installation/upgrades remain in TODO.
