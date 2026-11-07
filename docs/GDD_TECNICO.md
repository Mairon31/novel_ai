# Noble AI — Technical Game Design Document (v0.1)

**Date:** November 4, 2026. **Status:** initial design proposal; this document is not a claim that all items are implemented. **App-first amendment:** [ADR-0002](adr/0002-app-first-model-hub.md) prioritizes the setup wizard and Model Hub. Colab is optional, not a requirement for the product.

## 1. Vision and differentiation

Noble AI is a **local-first** environment for creating and playing AI-driven interactive stories in a visual-novel style. It combines **open-ended player input** (the user chooses their own actions and dialogue) with a **persistent world** (characters, relationships, time, objects, locations, and events). Contextual anime-style images enrich scenes; the application should **not** generate a new image for every response. Voices are generated **on request only**.

The application should support desktop and mobile layouts, with portable backend contracts across Windows, Linux, and optional Colab experimentation.

The project studies Isekai Zero's workflow, such as character selection, scene composition, narration, continue/retry actions, and reading modes. Upstream code, art, trademarks, and proprietary story text must be handled under their actual permissions; user-provided screenshots are UX references, not automatically licensed assets.

## 2. Scope

**First end-to-end vertical slice:** create a story from a premise; define a protagonist and 1–3 NPCs; enter player actions/dialogue/narration; continue; retry; edit and branch events; stream text; persist scenes, history, and important facts; responsive visual novel UI; generate optional image assets only on appropriate scene transitions or explicit requests; request speech explicitly; save to SQLite; switch compatible LLM providers.

Development placeholders must be **functional and clearly identified as temporary**, not passed off as finished media assets.

**Following the slice:** improved world and character editors, canon/Lorebooks, multiple stories, expressions, model selection, import/export, visual QA, GPU scheduling, controlled mobile access, asset versioning, and advanced episodic narration.

**Outside the initial scope:** real-time AI video, online multiplayer, a public story marketplace, mandatory illustration per turn, unsolicited TTS, or unauthorized cloning of third-party voices.

## 3. Play loop

1. In Library, create a story with title, genre, premise, world rules, output language, and visual style.
2. Set the protagonist's name, identity, motivation, visual description, and initial relationships.
3. Begin a scene; show an existing illustration or request one on demand. **Story play must work without an image server**.
4. The player chooses **Act**, **Say**, or **Narrate**, or continues without a typed action if supported.
5. The LLM drafts narration/dialogue. A separate state validator proposes canon changes supported by the response and world rules; the backend applies updates transactionally.
6. Stream narrative text. If location, cast, outfit, or composition changes, consult visual cache and decide whether an optional image job is warranted; keep the prior scene visible while work is pending.
7. Support retry, edit, rewind, save, alternate reader modes, and manual audio playback without silently destroying existing story branches.
8. Summarize important world events across chapters without deleting the primary event history.

## 4. User experience components

**Screens:** Home/Library, World Creator, Character Detail, VN Reader, History/Branches, Asset Gallery, Settings/Providers, GPU Diagnostics.

**VN reader:** layered backgrounds, optional sprites with speaker/emotion, high-contrast narration/dialogue pane, Continue/Retry/Edit/History/Save/Listen controls, Act/Say/Narrate composer, accessible mobile touch targets (~44 px), and hideable text panel for unobstructed art. Transitions should not flicker when images change.

**Story language:** the application UI defaults to **English**, while narrative output remains **user-selectable**. Latin American Spanish (`es-419`) is an explicit target; do not force Spain-specific Spanish into that mode. Dialogue must be attributed correctly, with narrator separate from NPCs. The model can control NPCs and describe the world but must not appropriate an explicit decision belonging to the player.

**Characters:** stable IDs, names, pronouns, fictional roles/background, traits, goals, physical/emotional state in the story, relationships, secrets, known facts, visual identity (hair, outfit, palette), and eligible poses/expressions. One dialogue turn must not randomly change a character's identity.

**World:** logical locations, in-world time, inventory, events, restrictions, knowledge, consequences, and active objectives. Optional RPG rules can be added later without requiring numerical character stats for all stories.

## 5. Narration and canon

- Store **presented prose** separately from **structured world-state updates**. Text is not the sole source of truth.
- Characters can speak only about facts they know or can plausibly infer.
- Do not revive a dead character or restore a destroyed item without an explicit fictional event that justifies it.
- Retry is branch creation, not destruction of the original timeline.
- Editing an event invalidates derived memories/media for the affected branch while preserving untouched branches.
- Manually authored canon has precedence over speculative LLM inferences, subject to application safety and consistency checks.
- Summaries are reproducible derived data; original events and revisions remain primary.
- Use a hybrid memory budget: recent turns, world records, milestones, summaries, and **optional** semantic retrieval. A vector database is not required for P0.
- Invalid JSON or contradictory state changes trigger controlled retry or a **pending validation** state, never a corrupted database.

## 6. Image and speech policies

**Images:** generate progressively when a new scene or character arrives, an outfit/background materially changes, or the user explicitly illustrates. A minor dialogue edit must not generate a new frame. Prefer reusing background/sprite/expression assets. Apply cache signatures based on scene, identity, and style; support priority and cancellation. Start with backgrounds/sprites; more complex CG can follow. Visual QA should inspect identity continuity, composition, anatomy, legibility, and unwanted text artifacts.

**Speech:** default OFF, with no TTS model preloading. Explicit Listen actions may create a segment; optional future automatic reading needs a separate opt-in. Character-specific audio should be keyed by text, voice, model, and settings. Failure must not block story text or chapter state.

## 7. Nonfunctional requirements

- Design for 12 GB NVIDIA VRAM minimum and 16 GB recommended, but **do not claim measured compatibility** without real benchmarks. Do not assume LLM, diffusion, and speech all fit in VRAM simultaneously.
- Work offline after compatible runtimes/weights are installed; local play should not require a paid API key.
- Preserve storage and API semantics across Windows and Linux/Colab.
- Recover committed story state after browser/server restarts.
- Bind local APIs to `127.0.0.1` by default; network access requires deliberate authentication/authorization.
- Do not log secrets in prompts or execute LLM-generated shell commands.
- Record job/turn IDs, elapsed time, memory usage where measurable, failures, cache hits, and runtime versions.
- Support keyboard, touch, adjustable type, and readable dialogue.

## 8. Acceptance criteria for the first vertical slice

1. Create and persist a story with a protagonist/NPC; restore it without data loss after restart.
2. Produce ten turns through a **real LLM** with traceable state and no lost events.
3. Retry turn N into a new branch without mutating the original timeline.
4. If ComfyUI disconnects, continue saving story text; mark image jobs as pending/failed with retry.
5. A dialogue-only event creates **zero unnecessary image jobs**; a material scene change creates at most one deduplicated job.
6. With speech disabled and no explicit Listen, record **zero synthesis calls**. An explicit request produces audio or a visible error without story loss.
7. Verify reader layers, history, gallery navigation, and responsive touch controls in real browsers.
8. Measure physical GPU smoke tests separately at 12/16 GB and record peak memory before claiming compatibility.
9. Export/import preserves IDs, event relationships, branches, canon, and references.
10. Timeouts, invalid JSON, and network failures do not duplicate turns or corrupt state.

## 9. Quality metrics — targets, not results

- All accepted events have IDs, timestamps, and branch ownership.
- Zero unauthorized TTS syntheses.
- Zero unnecessary illustrations across ten dialogue-only turns.
- Zero database corruption under concurrent retry/edit simulation.
- Record first-content, complete-turn, and image latency distributions as p50/p95 **after actual measurement**.
- Use reproducible quality rubrics for pronouns, inventory, NPC knowledge, clothing, location, and visual continuity.

## 10. Linked technical deliverables

[Architecture](ARQUITECTURA.md), [World state and memory](ESTADO_Y_MEMORIA.md), [API contracts](CONTRATOS_API.md), [QA](QA_Y_ACEPTACION.md), [Roadmap](ROADMAP.md), and [Progress log](PROGRESO.md). Update this design document whenever verified implementation changes invalidate a previous decision.

## 11. App-first installation and personalization (ADR-0002)

**Product requirement:** Noble AI must be an **application with graphical settings**, not a notebook or installer that requires manual model-file downloads before first launch.

Target sections: Setup Wizard, Model Hub, Installed/Downloads, Providers, Model Assignments, Performance/Devices, Creator Studio, Story Reader, and Diagnostics. Browser-local and future desktop-shell modes should share API contracts.

- **First launch without weights:** lightweight hardware discovery, managed storage, provider choice, supported model search/import/install, resumable setup. Library remains available without a narrator.
- **Narration settings:** local/remote provider, GGUF quantization, context, max tokens, temperature, top-p/top-k, repetition, reasoning/vision if supported, CPU/GPU/offload, and profiles such as Fast/Balanced/Quality/Custom.
- **Image settings:** checkpoint, workflow, LoRA, negative prompts, resolution, seed, steps, CFG, sampler, and manual/scene-aware rendering. A checkpoint labeled `uncensored` is not a universal application content filter.
- **Voice settings:** engine, voice, CPU/GPU/Auto only where supported, language, speed/style/emotion, and caching. Configuring speech is not permission to synthesize or preload.
- **Profiles:** global defaults and optional per-story overrides; switching models never rewrites previously committed branch facts.
- **Visible states:** unconfigured, downloading, installed, loading, ready, incompatible, error, offline. Clearly distinguish analytical estimates from device measurements.
- **Experience:** a dedicated immersive reader, distinct Studio and Model Hub, accessibility, and responsive 390×844/1440×900 QA. Reuse compatible open-source components under their actual licenses and attribution requirements.

**Additional acceptance evidence:** start with zero models; real Hugging Face lookup; install/verify a small supported GGUF through UI; change active model without editing a shell command; persist device and provider settings; zero unsolicited TTS loads; browser QA and interrupted-download recovery.

See [Model Hub](MODEL_HUB.md), [Onboarding and UI](ONBOARDING_Y_UI.md), and [Desktop deployment](DESKTOP_Y_DESPLIEGUE.md).
