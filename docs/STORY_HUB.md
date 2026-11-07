# Noble AI Story Hub — bundled original worlds

**Status:** a local story catalog included with Noble AI. It is **not** a hosted community marketplace. Bundled packs contain structured story text and metadata, not generated covers or installed sprites/backgrounds.

## Explore and install

Open **Library → Discover Stories** (or the independent `#/descubrir` route). Select a world, inspect its characters and three opening options, optionally edit the protagonist's name, and explicitly add it to your library.

The result is a new editable story that can be opened in Creator Studio. Choosing an opening saves an initial narrative turn **without calling an LLM**; continuing from there requires a configured narrator. Installing the same pack again creates an independent copy and does not overwrite progress.

| Bundled pack v1.0.0 | Genre | NPCs | Lorebook entries | Openings |
|---|---|---:|---:|---:|
| `ultima-luna` — La estación de la última luna | Supernatural mystery | 4 | 3 | 3 |
| `mareas-de-vidrio` — Las mareas de vidrio | Coastal science fiction | 4 | 3 | 3 |
| `jardin-mecanico` — El jardín de las horas rotas | Clockwork fantasy | 4 | 3 | 3 |

Pack IDs and original story titles remain unchanged for compatibility with saved data and fixture assertions. Story content may be multilingual even when product documentation and controls are English.

Each pack includes synopsis, player-visible plot, **private narrator plot**, creator directives, NPC profiles/dialogue, triggerable Lorebook entries, and three opening scenes. The public catalog strips private instructions and secrets. `has_images=false` accurately indicates there are no bundled illustrations. Credit/version labels do **not** imply an unverified CC0 redistribution license.

## API contracts

- `GET /api/v1/story-hub` → `{packs, source:"bundled-original", community_online:false}`, public metadata only.
- `GET /api/v1/story-hub/{pack_id}` → public details or 404.
- `POST /api/v1/story-hub/{pack_id}/install` → optional `{"protagonist_name":"Alex"}` with 1–60 characters; response status 201 with story/package ID/version and installed character/lore/opening counts.
- `POST /api/v1/stories/{story_id}/creator/opening` → `{"index":0}`, `1`, or `2` to save the initial turn. A story that has already started cannot select a second opening.

The installer rejects unknown packs, invalid names, and extra fields. A single `BEGIN IMMEDIATE` transaction creates the story, blueprint, NPCs, and Lorebooks with fresh UUIDs. A failed insert rolls the entire installation back.

These local packs involve no model inference, remote downloads, third-party ZIP imports, plugin execution, or network access. Installed stories can be exported using the established `.noble.zip` archive format.

## Colab sample world

If the story library is **empty**, `tools/colab_launch.py` installs the enriched `ultima-luna` pack with its four NPCs, three Lorebook entries, and three openings, verifying counts before reporting success. It does not rewrite a non-empty library or overwrite an older demo story.

## Independent Discover Stories page

The `#/descubrir` route opens a dedicated catalog accessible on desktop/mobile, separate from the library and Creator Studio. Library can continue showing featured packs. Installing from Discover returns to `#/historia/{uuid}`, where the player chooses an opening. Existing legacy routes remain valid.

## AI-assisted story drafting

Creator Studio also includes a separate **Create with AI** flow for a story idea, protagonist, genre, and tone. It calls the currently configured narrator in three sequential stages:

1. World, public/private plot, and three openings.
2. Four NPCs, personalities, and dialogue guidance.
3. Three triggerable Lorebook entries.

The model must return validated JSON for the relevant typed schema. There is no placeholder generation falsely presented as an AI output. **Draft generation does not write to SQLite.** The user can review and edit all public/private story elements, character profiles, lore, and openings before explicitly installing the proposal as a new story.

- `POST /api/v1/creator/assistant/draft`: idea of 30–2,500 characters plus optional protagonist/genre/tone; returns a draft, model and stage count, `saved=false`. An unconfigured narrator yields 409, schema errors 422, and upstream/timeouts 502 as applicable.
- `POST /api/v1/creator/assistant/install`: accepts a validated `StoryDraft`, creates the world transactionally, and returns installed counts with `generated_media=0`. It does not call the LLM.
- The implementation uses the existing local inference arbitration for relevant providers. It has an approximate generation budget, not a real measured model-cost guarantee.

This is not the full AI-driven illustrated novel creator: images, voice casting, editorial scene plans, and long-run story consistency remain separate tasks.

## Regenerate selected draft sections

The assistant supports `POST /api/v1/creator/assistant/regenerate` with `{draft, section, instruction}`, where `section` is `plot`, `openings`, `characters`, or `lore`.

Other sections are carried as canonical reference context. The server validates the regenerated section and the complete result before replacing anything. If an upstream call fails or JSON validation rejects it, the UI keeps the original draft and SQLite remains unchanged.

Prompt context is compacted to approximate character budgets: 14,000 characters for NPC/lore/opening context in relevant revisions; plot rewriting allows a 9,000-character stable context plus up to 3,500 characters of previous plot. These are character estimates, not tokenizer-aware context guarantees.

Plot rewriting requires `synopsis`, `player_plot`, `ai_plot`, `guidelines`, and `reminder`, preserves unrelated fields, and allows a local one-step draft undo. Revision checks prevent a late model response from silently replacing a draft edited while the request was running. The returned `generation_budget` reports approximated prompt characters, input estimate based on characters/4, and the output token cap—not observed cost or VRAM. Plot rewrites may request up to 3,072 output tokens; other sections up to 2,048.

## Tests and remaining work

- `tests/test_story_hub.py`: three packs, secret stripping, isolation, count checks, opening selection, and forced-SQLite rollback.
- `apps/web/tests/story-hub.spec.ts`: desktop/mobile browse → install → detail → start, plus deep links and reload.
- `tests/test_colab_play.py`: enrich only an empty library.
- `tests/test_story_generator.py`: simulated three-stage generation, validation, provider errors, section rewrite behavior, and rollback.
- `apps/web/tests/creator-ai.spec.ts`: review/edit/install workflow and section controls with simulated model responses.

Past verified runs: [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781) (358 Python / 68 Playwright), [CI #42170140099](https://github.com/Mairon31/novel_ai/actions/runs/42170140099) (358 / 70), [CI #42180655437](https://github.com/Mairon31/novel_ai/actions/runs/42180655437) (365 / 72), and [CI #42256256693](https://github.com/Mairon31/novel_ai/actions/runs/42256256693) (372 / 72), all with successful Vite builds. Tests simulate model outputs; they do not establish long-run narrative or GPU image quality.

N-07, N-08, N-09, and N-10 still have open scope: bundled visual assets, versioned external manifests, safe pack upgrades, creator/community publishing, moderation, distribution, provenance/signatures/licenses, 10–20-turn real-model evaluation, and optional image/speech generation.
