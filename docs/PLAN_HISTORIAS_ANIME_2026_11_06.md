# Noble AI — anime storytelling, orchestration, and complete creation flow (November 6, 2026 backlog)

**Status: planned work, not proof of implementation.** This converts actual use feedback and two editor screenshots from November 6, 2026 into testable requirements. Master issue IDs: `N-16`–`N-24` in [TODO](../TODO.md). Also see [TTS](TTS.md), [Roadmap](ROADMAP.md), and [QA](QA_Y_ACEPTACION.md).

## 1. Product direction: anime fantasy novels and roleplay

Noble AI should prioritize **playable fantasy stories with anime/visual-novel presentation**, not a generic chat interface or realistic-life simulator. Its default experience is narrative and immersive: a coherent world, cast, relationships, conflict, episodes, chapters, scenes, illustrations, and sound.

- Default creative direction: stylized anime, fantasy, isekai, adventure, supernatural mystery, and author-selected fiction subgenres. Do **not** default to photorealism or everyday realism.
- Each story/preset should declare `genre`, `tone`, `art_style`, `setting`, world rules, dramatic goals, and player freedom. Treat them as structured story configuration, not disconnected fields.
- Expand Story Hub worlds with arcs, episodes, NPC motives, conflicts, and meaningful choices. Never silently replace existing worlds or player edits.
- Maintain consistent artistic direction: anime cover, location backgrounds, NPC sprites, expressions/poses, visual DNA, lighting, and story palettes. Use appropriate illustration prompts, with photorealism only by explicit author choice.
- Distinguish missing, queued, failed, verified, and approved artwork. Never masquerade a generic placeholder as a real illustration.

## 2. N-18 — An intelligent, non-sycophantic story orchestrator

Introduce a **narrative director** between player input, structured world state, and the LLM. A generic system prompt or a single unconstrained generation call is not enough.

**Minimum per-turn context:** current story/arc/act/scene, dramatic objectives, present cast, NPC motivations/private knowledge, physical and magic rules, prior events, confirmed canon, narrative constraints, proposed player action, plausible consequences, remaining choices, and desired pacing.

1. **Interpret input:** distinguish speech, action, thought, narrative direction, and out-of-character messages. Detect unrelated requests and world contradictions *before* modifying canon, inventory, or NPC locations.
2. **Enforce fictional boundaries:** maintain world rules and power limits. The player cannot simply assert as canon that they defeat everyone, gain arbitrary abilities, teleport NPCs, or rewrite past events. The director can narrate failure, resistance, costs, reactions, or a plausible alternative action.
3. **Avoid automatic agreement:** NPCs have independent values, motives, and knowledge. They may disagree, misunderstand, refuse, mislead, bargain, or oppose the player when the story supports it. Avoid routine flattery and guaranteed outcomes.
4. **Graduated narrative freedom:** per-story modes `guided` (default), `flexible`, and `strict`. In guided mode the player chooses actions **within world rules**; the director maintains goals and consequences. Branches can be planned without arbitrary jumps into unrelated plots.
5. **Out-of-context input:** do not turn meta remarks, outside jokes, or impossible commands into canonical events. Suggest an in-character reformulation or respond contextually while preserving legitimate player intent when possible.
6. **Planning and progress:** act/book/scene plans, conflicts, clues, objectives, progression flags, narrative timers, durable consequences, arc endings, and stagnation/repetition detection.
7. **Pacing and voice:** variable prose length, natural character dialogue, no constant explanations of rules, and no generic chatbot formulas. Orchestrate text/image/voice engines with explicit job dependencies, bounded retries, metrics, and visible fallbacks.
8. **Inspectability:** optional, unobtrusive creator inspector for current arc, blocked rule and reason, injected context, director decisions, provider errors, and observed cost/performance. Never expose private spoilers to the player.

**Acceptance:** 10–20-turn sessions where players propose impossible actions, contradict Lorebook facts, or speak out of character. Invalid actions must not rewrite world state; NPCs with conflicting motives must be able to refuse. Confirm arc progression and preservation of legitimate player agency.

## 3. N-19 — Roleplay composer and reader controls

**Screenshot evidence:** the November 6 editor placed **Continue / Retry / Clear** on a separate upper row; the text box used a prompt equivalent to "Speak as Kai, describe your action or what happens next"; small round icons and a sparkle marker lacked clear affordances. Turn actions and settings were mixed.

**Target flow (Isekai Zero interaction reference):**

- Put the player's composer in the foreground, with a clearly labeled roleplay action bar **inside its top region**: `Speak`, `Act`, `Think`, `Observe/Inspect`, `Interact`, and `Narrate/Direct` only where the story permits.
- Selecting an action adjusts structured input mode and placeholder, not arbitrary unexplained symbols or a surprise rewrite of the player's draft.
- Make **Continue** and **Send** unambiguous primary actions. **Retry** acts on the intended turn with safe fork/recovery semantics. **Clear/Delete** is separate and guarded by confirmation/undo where appropriate.
- Add **Story Settings** inside the reader: tone, difficulty, freedom, length, language, pacing, rules, illustration policy, voice casting, visual style, and reading controls. Explain precedence across global, story, and scene settings.
- Preserve editor drafts/history, contextual disabled states while generating, LLM/image/TTS status, retry, focus, and scroll. Prevent duplicate submission.
- Make cost/quota/sparkle information understandable without covering the composer. Use responsive desktop/mobile design, ~44 px touch targets, accessible names, and discoverable shortcuts.
- Verify desktop/mobile with open keyboard, loading, error, offline, no-art, guided-story mode, VN/Book/Chat modes, typography, and contrast.

## 4. N-16 and N-17 — Modular TTS and narrator/character voices

Investigate and integrate viable providers from within Noble AI: **Pocket TTS, OmniVoice, Kokoro TTS, and Qwen3-TTS**, while retaining Piper. Names are not proof of support. For each, validate the actual project/source, code and weight licenses, model formats, dependencies, Latin American Spanish, CPU/GPU requirements, VRAM, Windows/Colab behavior, and real API contract.

**Adapter contract:** discover models, describe capabilities, install, list voices, preview, configure, synthesize, cancel, unload, report telemetry, storage and failures. Expose only provider-supported settings such as voice, language, pace, expressiveness, volume, temperature/reference/style if the engine actually supports them.

- Assign **independent voices to each NPC and the narrator**, with precedence `character → story preset → global default → explicit fallback`. Store per story and preserve through branch/export transitions.
- Segment narration versus dialogue with verified speakers. Unknown speakers must not get randomly assigned a voice. Support multi-NPC scenes, ordered chunks, pauses, and sensible output levels.
- Individual voice samples and cast previews; cache by model/voice/text/options; invalidate after dialogue or voice edits; normalize playback levels and avoid blocking text when TTS queues.
- Present voice catalog, installation, progress, previews, settings, and resource usage in one **Voice/TTS product area**, while keeping image generation in its own independent panel. Backend runtimes may remain separate processes.
- Do not generate speech simply because a story opens. Automatic reading requires separate per-story opt-in.
- Test speaker stability, voice changes, engine failures, latency, ten Latin American Spanish sentences, and mixed LLM/image/voice resource contention.

## 5. N-21 — Complete image/TTS settings inside Noble AI

- **Images:** install/manage compatible checkpoints, LoRA, VAE, ControlNet, IPAdapter, and matting assets; sampler/scheduler, CFG, steps, aspect/resolution, seed, denoise, positive/negative prompts, anime styles, NPC identity, scene references, batch, GPU/VRAM, and quality selections.
- **Voices:** provider, model, voice, language/pronunciation, proper-name dictionary, pace, expression, supported engine-specific controls, narrator/NPC casting, preview, cache, output, runtime and resource policy.
- **Integrated product UX:** model cards with file variants, sizes, hardware compatibility, and installation status; separate per-function settings pages; global profiles with per-story/scene overrides, import/export presets, safe saving without invalidating active jobs.
- **Resource management:** visible job queues/dependencies, progress, **estimated** versus **measured** budgets, cancel/retry/resume, storage/VRAM checks, and actionable errors. Unsupported controls must be disabled with explanations.
- ComfyUI can stay a separate technical backend, but routine model selection, generation controls, and progress should be usable from Noble AI.

## 6. N-22 — Prepare visual assets before opening illustrated stories

When an illustrated story lacks a cover, starting background, or required character sprites, **do not show the reader as fully ready or start the first LLM turn immediately**. Offer a guided preparation workflow first.

Proposed states: `draft → validating → assets_planned → generating_assets → reviewing_assets → ready_to_play`, with explicit `retry_required` and `text_only_by_choice` exits. Persist jobs/state by story and scene/NPC IDs and make reloading idempotent.

1. Detect genuinely missing assets rather than rebuilding existing approved art every time: cover, opening background, required cast sprites/expressions, and compatible model dependencies.
2. Show a **Preparing your story** view with stage-based progress and previews. Only display time/percent estimates backed by observed data.
3. Build prompts/assets from the story's anime style, fantasy setting, and visual DNA. Reuse versioned references and cached poses.
4. In illustrated mode, **disable player input and first-turn LLM generation** until `ready_to_play`; explain the blocking requirement.
5. Handle missing image runtime, low disk space, OOM, cancellation/retry, Colab interruptions, and partial assets without an endless spinner. Offer explicit image import or **conscious text-only choice**, never silent fallback.
6. Validate opening background against location/scene and initial sprites against cast/expression requirements. Allow approval and corrections.
7. Do not overwrite existing art, stories, or preferences; support selective regeneration and revision history.

**Acceptance:** a new illustrated story enters preparation, survives reloads, and only opens for play after required assets complete. Failures offer retry or explicit text-only choice. Valid existing assets open without redundant generation.

## 7. N-23 — Validated creation wizard and initial illustration jobs

Creator Studio needs a **stage-based creation workflow with field and semantic validation**, not a collection of optional fields capable of creating an unusable story.

**Minimum playable fields:** title, genre/subgenre, anime visual style, tone, premise, basic world rules/setting, protagonist and role, first objective/conflict, starting location, and a playable opening. Require additional characters/lore/references when the selected template needs them; distinguish mandatory from optional.

**Validation:** nonempty fields, coherent premise/opening, valid roles/IDs, no conflicting required names, context budget, no unregistered mandatory cast members, compatible image/TTS resources for the selected preset, and honest hardware limits. Show inline errors and a pre-confirmation summary. Save a resumable draft without modifying installed stories.

**On Create in illustrated mode:** confirm the resource plan, transactionally create the story/plan/job references, and **automatically start cover, initial background, and essential sprite/expression generation**. Show progress/review and do not mark `ready_to_play` prematurely. Text-only mode must be an explicit author choice.

**Error recovery:** rollback if story creation fails; retry individual assets without duplicating the story; recover queues without deleting earlier art. Library states should distinguish **Draft**, **Preparing images**, **Needs attention**, and **Ready to play**.

**Acceptance:** incomplete creation cannot submit and explains each field; a valid illustrated creation schedules actual compatible jobs and shows status; the player cannot issue the first turn before visual preparation completes.

## 8. Proposed order, dependencies, and QA

| Order | Work package | Dependencies | Minimum evidence |
|---|---|---|---|
| 1 / P1 | N-23 story schema and validation | N-07 | API/UI reject invalid data without partial persistence |
| 2 / P1 | N-21 image model and generation controls | N-01/N-03 | Saved settings affect real generation; report compatibility |
| 3 / P1 | N-22 visual startup/asset states | N-21/N-13 | Empty → assets → playable end-to-end, reloads and failures |
| 4 / P1 | N-18 narrative director and progression | Canon/Lorebook/memory | 10–20 turns with inconsistent/sycophantic-model challenge tests |
| 5 / P1 | N-19 roleplay composer and story settings | N-18/Reader | Desktop/mobile usability and accessibility evidence |
| 6 / P1 | N-20 anime art direction and Story Hub | N-18/N-22 | Coherent gallery/story, prompts and approved art |
| 7 / P2 | N-16 modular TTS engines | N-02/N-03 | Real provider contracts and voice samples |
| 8 / P2 | N-17 character/narrator voice casting | N-16 | Multi-NPC dialogue with consistent speaker attribution |
| Cross-cutting | N-24 integration QA | All | CI, real Colab/Windows tests, screenshots |

**Do not close tasks merely because this document exists.** Every feature needs code, unit/integration tests, desktop/mobile UI evidence, and physical checks when applicable. Existing TTS/image infrastructure does **not** fulfill this complete experience specification on its own.

## 9. N-25 — Separate settings pages (November 6, 2026)

**Feedback:** unrelated configuration categories must not be grouped into a single panel. The previous `WorkspaceSettings.tsx` had combined **Images and Voice** via `CreativeSettings.tsx` and **About and Updates** in one destination. All four need independent pages rather than two expandable subsections.

**Target navigation:**

- **Images:** model/checkpoint installation, LoRA and references, anime styles, prompts, resolution, sampler/scheduler/CFG/seed, ComfyUI, visual queues, and relevant GPU controls. Shared GPU policy may live in its own Hardware page, linked without inconsistent duplication.
- **Voice / TTS:** Piper and future Pocket TTS/OmniVoice/Kokoro/Qwen3-TTS models, voice libraries, narrator/NPC casting, languages, pronunciation, previews, synthesis and queues. No image controls.
- **About Noble AI:** installed version, build, technical information, documentation, credits, license notices, official links. Product information only.
- **Updates:** release channels, manual/automatic checks, available versions, release notes, progress, errors, installation or platform-specific instructions. Kept separate from static About content.

**UX contract:** four individually labeled and navigable entries—no combined **Images + Voice**, **Images + TTS**, or **About + Updates** page. Keyboard, responsive mobile, active-tab indication, stable URLs/deep links, and reload must work. Components may share hooks/API but not a monolithic visible panel. Existing SQLite preferences/downloads must persist and settings navigation must not start engines/jobs. Global release notifications may exist; update configuration belongs under Updates.

**QA:** desktop/mobile captures show four independent destinations; entering Images never shows voice controls and vice versa; About has no update-check buttons and Updates no static About panel. Validate persistence, deep links, Playwright, accessibility, and existing ComfyUI/Piper/release behavior.

**Implementation status:** four destinations published to `master`, replacing the old combined panel. Paths: `#/configuracion/images`, `#/configuracion/voice`, `#/configuracion/about`, and `#/configuracion/updates`, with desktop/mobile Playwright. [CI #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131) reported **381 Python / 80 Playwright / Vite PASS**. The separation N-25 is implemented; manual visual acceptance and advanced controls remain under N-21.
