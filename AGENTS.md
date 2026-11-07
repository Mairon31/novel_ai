# AGENTS.md — Noble AI engineering guidance

Read `TODO.md`, `README.md`, `docs/ARGON_AUDITORIA.md`, the relevant technical docs, both ADRs, and the latest `master` history before changing behavior. Inspect existing implementations first. Do not treat old audit findings as proof that a feature is absent.

## Mission

Build a **local-first, app-first** interactive story and visual novel platform, with an approachable Model Hub, interchangeable inference providers, persistent narrative state, optional image generation and optional speech. The repository already contains React/TypeScript, FastAPI, SQLite, integrations, and automated tests. Colab is an optional runtime/testing environment, not a required user-facing installation step.

## Non-negotiable principles

1. Inspect current GitHub `master` before implementation. Prefer maintained, license-compatible open-source components when practical. Preserve required attribution and license text.
2. Keep catalog search, model download, installed files, runtime processes, inference providers, assigned roles, and hardware profiles conceptually distinct.
3. The app must open even when zero models are installed. Do not require users to edit `.env` or run Colab just to browse the UI.
4. Check file paths, repository revisions, supported formats, hashes, runtime capabilities, and declared provider features. A valid `.safetensors` file is not automatically a usable diffusion checkpoint or TTS model.
5. Respect actual backend support when offering CPU/GPU controls, parameter settings, and hardware compatibility estimates. Never label a theoretical performance estimate as a benchmark.
6. Do not load LLM, ComfyUI, and TTS concurrently without respecting resource budgets. The 12 GB minimum target and 16 GB recommended profile still need real measurements.
7. Generate images on explicit request or meaningful scene changes only; reuse visual assets where applicable. Stories must also work without images.
8. Keep TTS **off by default**. Never start synthesis or downloads merely by visiting a panel.
9. Support shared defaults and per-story settings without destroying story canon or existing data on model changes.
10. Preserve narrative history, idempotency, branch isolation, and transactional SQLite changes. Distinguish reversible branches from destructive operations.
11. Keep desktop/mobile reader layouts responsive and accessible. UI changes require appropriate automated checks and, when available, screenshots at 390×844 and 1440×900. No nonfunctional production controls.
12. Tauri 2 is a future desktop packaging candidate, not an already shipped `.exe`.
13. Never run arbitrary remote Python from model manifests; secure downloads, secrets, endpoints, and model provenance. Do not commit model weights, credentials, personal stories, or local data.
14. Treat Colab as ephemeral. Do not add public tunnels or anti-idle mechanisms that bypass runtime restrictions.
15. Every functional change should include relevant contracts, failure handling, tests, documentation, and license notes. Distinguish mocks, CI, and real hardware checks.
16. **English is the default language for the entire product and repository**: README, documentation, contribution guidance, UI labels, settings, accessibility names, errors, test descriptions, and developer comments. Existing stable API paths, database fields, persisted data, user-authored content, and external model identifiers must not be renamed merely for translation. Story output language remains user-selectable; natural Latin American Spanish remains a supported story-language option.
17. Do not report PASS without a traceable execution. Record FAILED, SKIPPED, or NOT RUN accurately.
18. Update `TODO.md`, roadmap, progress log, and issue links when completing milestones. Work directly on `master` unless explicitly instructed otherwise.

## Engineering priorities

- **P0:** security, recovery, cancellation, data integrity, and truthful documentation.
- **P1:** model/runtime lifecycle, resource policies, world state, Lorebooks, and reader stability.
- **P2:** improved Model Hub, scene/character media tooling, and actual hardware evidence.
- **P3:** optional speech systems and advanced provider support.
- **P4:** desktop packaging, deployment, and final product polish.

Avoid claiming that an engineering milestone is complete because one narrow slice is merged.

## Argon audit and progress tracking

`docs/ARGON_AUDITORIA.md` is the historical source of audit observations; `TODO.md` is the actionable checklist. Some audit IDs are repeated with different meanings: prefer the stable IDs and references in the TODO. Existing features include SQLite WAL, SSE streaming, resume/checksum handling, world-state snapshots, and basic GPU locks, but each has distinct remaining limits.

Use the open-source reference work from Urakatsu and Koharu only in accordance with the applicable licenses and notices, recording the upstream revision and adaptations in `docs/THIRD_PARTY_NOTICES.md`. Attribution alone is not a substitute for satisfying all license terms.

## Completion report

Describe what changed, what remains unfinished, modified paths, exact commit(s), evidence from executed tests (with environment and screenshots where applicable), and any known real-hardware limitations. Update `docs/PROGRESO.md` and `TODO.md` without inventing validation results.
