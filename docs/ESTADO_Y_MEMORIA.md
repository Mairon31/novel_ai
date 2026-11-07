# Narrative state, memory, and consistency

**Status:** evolving design and implemented P1 features. This document distinguishes shipped persistence from future semantic memory and cognitive-isolation guarantees.

## The problem

An AI visual novel can produce convincing dialogue but, 40 turns later, forget a promise, teleport a character, or silently change their outfit. Noble AI does not delegate all canon to a single context window: structured facts, revisions, and branch-specific state must be persisted.

## Domain aggregates

| Aggregate | Important properties |
|---|---|
| Story | `id`, title, premise, language, style, rules, creation date |
| Branch | `id`, `story_id`, `parent_branch_id`, `fork_turn_id`, `head_revision`, `active` |
| Turn | `id`, parent, input mode, player input, narration/dialogue, provider settings, commit status |
| Event | `id`, `branch_id`, ordinal, type, actor, source turn, JSON payload, time |
| Character | Stable ID, roles, biography, knowledge permissions, versioned visual canon |
| Relationship | From/to, state/revision, supporting events |
| Location | ID, logical geography, occupants, visual keys |
| Scene | Derived state: location, time, cast, revision |
| Memory | Confirmed facts, derived summaries, importance, provenance |
| Asset | Hash, kind, appearance revision, prompt/workflow/model, status, scene revision |
| Job | Kind, priority, idempotency, provider, retry/cancel/lease |

**Source of truth:** branch-confirmed turns and events. Profiles and summaries are recoverable indexes/materializations, not an excuse to overwrite historical facts.

## Per-turn context assembly

Recommended priority:

1. Core project rules: player agency, output language, and API contracts.
2. Premise, world, and story-specific rules.
3. Active characters: identities, motivations, relationships, and what they may know.
4. Current state: in-world time, location, inventory, injuries, objectives, and conditions.
5. Canon facts retrieved for story, branch, temporal relevance, and permissions.
6. Recent full turns, then relevant earlier episodic summaries within the budget.
7. The current player's input, preserved without reinterpretation as a settings command.

Budget tokens by provider/model. Do not assume 128k context is free of KV-cache cost. Use a provider tokenizer where available. When full, preserve current user input and confirmed canon; compact older context. Report inserted memories for debugging.

## Structured fact updates

A future extraction stage may propose typed events such as `character_entered`, `character_left`, `item_acquired`, `item_removed`, `relationship_changed`, `time_advanced`, `location_changed`, `fact_learned`, `appearance_changed`, and `quest_updated`. Validate type, IDs, timeline consistency, and authority before applying any changes.

Confirmed player/editor changes take precedence over speculative model-generated events. If an LLM contradicts canon, reject the conflicting state delta or carefully retry narration. Never create irreversible facts without linking a source turn.

## Branching: retry and edit

```text
main: turn1 -> turn2 -> turn3
                \
                 retry-2: turn2b -> turn3b
```

Each branch preserves its own timeline from the fork point. Use optimistic revisions and explicit parent/fork references. Show current and historical branches distinctly; do not mutate a committed turn's event text in place.

Editing turn 2 should invalidate relevant summaries, derived state, and scene artwork **only on the new branch**. The original branch retains its assets and references. Do not delete shared files without ownership/reference-counted garbage collection.

## Structured versus semantic memory

- **P0/P1:** SQLite canon JSON, keys/tags, and FTS5 for smaller story libraries.
- **P2 target:** episode/window summaries, temporally filtered top-k retrieval.
- **Later:** optional local embeddings to recall distant events. They must never override explicit canon.
- Summaries should contain `source_event_range`, prompt/model revision, and `stale` for reproducible refresh.

## Required narrative QA

- An unrevealed secret must not be attributed to a character who does not know it.
- An item transfer changes inventory, narrates consequences, and persists.
- Retrying/editing never alters the original branch; both restore correctly after restart.
- Across 100 turns, manual canon and the latest state remain available.
- Corrupt narrative JSON causes no unauthorized DB mutation; diagnostics are retained.
- An outfit change increments visual `appearance_revision`, whereas an irrelevant phrase reuses existing art.

## Migrations and backups

Use versioned SQLite schema migrations for schema changes and the SQLite Backup API for safe copies before destructive operations. Portable JSON/ZIP exports should have a manifest, checksums, `schema_version`, remapped IDs, and integrity validation. Do not assume all historical migrations use Alembic; inspect the repository's actual migration runner.

## P1.4 — manual canon and independent story forks

**Implemented and covered by API/SQLite tests.** Each story has an editable `canon` field of up to 5,000 characters, persisted independently of the premise and protagonist. Narration includes it in the system context even after the original turns leave the recent-history window.

- `PATCH /api/v1/stories/{uuid}/canon` with `{"canon":"..."}` returns the updated story.
- `POST /api/v1/stories/{uuid}/fork` with `{"until_turn_id":"uuid"}` creates an **independent story** with history up to and including that turn. `{}` copies all turns.
- New story/turn/request UUIDs are generated. Premise, protagonist, canon, and compatible scene media are copied without deleting the original.
- `origin_story_id` and `origin_turn_id` record provenance for a future graphical branch tree.
- UI: **Library → History → Create branch**.
- SQLite transaction covers the branch copy; a fully interactive graph, merge operation, and fully automated state derivation are separate work.
- Short-term context uses the most recent 16 turns. Canon is authored manually; the system does not infer authoritative new facts solely from prose.

**Explicit engine warmup:** `POST /api/v1/narrative/prepare` performs a small warmup for supported Ollama/KoboldCpp/worker providers, without saving a chapter or changing canon. It never runs merely because the app opens. OpenRouter does not support this managed preload. A successful warmup cannot guarantee permanent model residency.

## P1.5 — visual timeline separate from narrative canon

Narrative canon remains independently editable. `visual_scenes` represents a location timeline; detecting a transition must not rewrite canon or older scenes. `visual_characters` holds versioned textual appearance data. `visual_assets` persists WebP results and `visual_current` identifies the active version.

Forking copies eligible scenes, profiles, and media with new owned IDs rather than mutable pointers to the origin. Full semantic scene understanding and a graphical branch tree remain open.

## Argon memory priorities — November 5, 2026

Existing stories, canon, turns, and forks are persisted, but this foundation **is not yet a complete hybrid memory system or proof of cognitive isolation**. See [TODO AUD-005 / AUD-006 / AUD-014](../TODO.md) and the corresponding sections of the [Argon audit](ARGON_AUDITORIA.md).

1. **Deterministic source of truth:** structured state by story/branch/turn records location, in-world time, present cast, inventory, relationships, flags, witnesses, and related media. LLM narration must not arbitrarily redefine committed state.
2. **Atomicity:** commit turn, world snapshot, and canon revision together; asynchronous visual assets need their own idempotency protocol. Rewinding must restore the selected point, not borrow present-day state from another branch.
3. **Four context layers:** stable instructions/canon/characters; bounded key-triggered Lorebooks; relevant witnessed episodic memory; recent FIFO dialogue. Stable prefixes may help provider KV caches, but report cache-hit metrics only when observed.
4. **Retrieval:** start with FTS5; optional `sqlite-vec` CPU embeddings once installable. Episodes should include `witness_character_ids`, importance, turn range, and provenance. Never inject an unwitnessed secret as an NPC's own memory.
5. **Budget:** server assigns effective per-block token allowances and output reserve, reports truncation, and exposes breakdown via the creator/context inspector. The audit's 8,192-token example is a baseline profile, not a universal rule.
6. **Validation:** 100–120-turn stories, recovery of distant facts, witness separation, branch isolation, context limits, and restart persistence. Keep broader milestones open until these tests pass.

## P1 — conditional local Lorebook (November 5, 2026)

Creator API supports `GET/POST/PUT/DELETE /api/v1/stories/{uuid}/lorebook` and `POST .../lorebook/preview`. Entries store private author text, primary/secondary triggers, an `any/all` secondary matching mode, whole-word escaped matching using `re.escape` (never arbitrary user regex), enabled/always-on flags, and priority 0–100.

Entry text is limited to **3,500 characters**; total activated content to **6,000 characters**. Entries are included whole or omitted if they do not fit. These are **character**, not exact token, limits.

Narration checks the current action and last four turns, **not the hidden `ai_plot`**, for trigger matches. Matching private context is inserted into the narrator's system prompt, not displayed as a player reply. `NarrativeService.fork_story` creates independent Lorebook UUIDs on the new branch.

A 110-turn scenario was checked: a distant Lorebook fact stayed inactive until the current action again contained its trigger. Creator Studio has a separate Lorebook editor and exact-context preview. Tests: `tests/test_lorebook.py`; [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220) reported **151 Python / 30 Playwright PASS**.

Further goals include comprehensive witness isolation, semantic episodic memory, bounded regex options, Lorebook recursion, and provider-tokenizer-aware budgets. Partial witness and snapshots described below were subsequently implemented; do not confuse them with complete cognitive guarantees.

## P1 — structured per-turn world state and witnesses

Noble AI includes `world_state.py` and Creator Studio's **World State** panel. Authors explicitly confirm `location`, `time_of_day`, `weather`, `present_character_ids`, `inventory`, `relationships`, `flags`, and `facts`. A fact has a persistent UUID, text, `public` flag, and `witness_character_ids`.

The API validates ownership of present/witness/relationship NPC IDs, at least one witness for private facts, duplicate restrictions, and field lengths. `PUT /api/v1/stories/{uuid}/world-state` accepts `expected_revision`; stale concurrent edits return **409** instead of overwriting another author's work. `world_state_edits` retains confirmed revisions. The LLM does **not** independently infer and apply these changes from free-form narrative text.

At each turn, `NarrativeService.append` stores the dialogue, spatial transition, and `world_turn_snapshots` row containing the state and exact canonical text **in one SQLite transaction**. `GET .../world-state/turns/{turn_id}` retrieves an earlier state.

A fork at a selected turn copies only historical snapshots, restores the selected state/canon, and remaps character/fact UUIDs. Older turns predating snapshot support may not have one: Noble AI must **not fabricate** a past snapshot from later knowledge.

`WorldStateService.context` omits private facts from the model when none of their witnesses is present. When witnesses are present, the prompt specifies who knows the fact and asks the narrator not to attribute it to anyone else. This is a verifiable **input filter**, not proof that the LLM will honor every knowledge boundary. Global Lorebooks and past dialogue need further isolation controls.

The interface edits location/time/weather, inventory, NPC relationships, booleans, and public/private facts with witness selection; it uses revision-controlled saves and an inspector for historical turn states.

`tests/test_world_state.py` covers transactions/rollback, historical canon, migration, independent forks, and witness filtering. [CI #42074620459](https://github.com/Mairon31/novel_ai/actions/runs/42074620459) reported **162 Python / 32 Playwright PASS** using real SQLite and desktop/mobile flows.

**Remaining:** safe destructive rewind, model-proposed validated state updates, isolation of knowledge across global Lorebooks and earlier dialogue, and power-loss durability tests. Time/weather/presence remain author-confirmed, not reliably inferred.

## P1 — safe historical Lorebook, creator instructions, and NPC rewind

**Fixed bug:** forking from an older turn copied the **current** Lorebook, private creator instructions, and NPC profiles—even if they contained future spoilers. This violated timeline isolation.

Each `NarrativeService.append` now stores snapshots in the same transaction as the turn, scene, and world:

- `lorebook_turn_snapshots`: full JSON of contemporary Lorebook entries, triggers, priority, enabled state. Editing/deleting an entry later does **not** rewrite history.
- `creator_turn_snapshots`: the creator blueprint (`ai_plot`, guidelines, reminders) and NPC records from that turn.
- `world_turn_snapshots`: location, witnesses, and exact contemporaneous canon.

Forking with `until_turn_id` restores precisely those selected versions, remaps Lorebook/NPC IDs to new branch-owned IDs, and uses the same new mappings across copied snapshots. Forking **at the present** copies current state.

For legacy turns **without snapshots**, the safe default is to copy **no invented historical** Lorebook/NPC data that might reveal future knowledge.

**UI:** History → **Rewind here** opens a confirmation showing selected turn, number of later turns preserved on the original branch, and available snapshots. **Create path from this turn** uses the existing transactional fork; **Stay here** changes nothing. Rewind is **non-destructive**.

Evidence: `tests/test_lorebook_timeline.py` validates earlier revisions, edit/delete after turns, restart, story isolation, legacy fallback, and transaction rollback. `tests/test_creator_timeline.py` tests historical private author/NPC content, stable remapping, no future spoilers, and rollback. `apps/web/tests/story-rewind.spec.ts` checks desktop/mobile cancel/confirm/fork against the real API. [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834): **179 Python / 34 Playwright PASS**.

**Limits:** exact time restoration for all later-edited editorial images, references, and visual scene plans is not universally guaranteed. There is no complete episodic FTS5/vector knowledge reconstruction or safe destructive rewind. Historical NPC records are not proof of full cognitive isolation.

## P1 — character-scoped Lorebook memory

Lorebook entries can have world-wide or explicit private-witness scope. The engine compares witnesses against NPC presence from **author-confirmed structured state**. If no character who knows the entry is present, omit it even when keywords match or the entry is always active. Do not infer presence from free text.

Branch snapshots preserve independent remapped private IDs. Older entries default to `visibility=world`.

This reduces Lorebook-based leaks but **does not guarantee semantic knowledge isolation**: episodic facts, dialogue, private blueprint content, and model speculation still need scrutiny.

## Older player interventions and FTS5

Episodic index entries are based exclusively on **player input** from story turns—not generated dialogue or private creator secrets. Turn persistence and indexing share a transaction. Forks inherit only copied turns with new IDs.

Manual search and bounded automatic retrieval can recover **up to three** older player actions beyond the most recent 16 turns. Recovered actions enter the context as historical `user` messages; they do not establish NPC knowledge or override verified world state.

Use SQLite FTS5 when available, with a bounded lexical scan fallback when it is absent.

## Context inspector — provenance of each block

Without generating or saving a new turn, the inspector can show the exact messages that **would** be passed to the narrator adapter for a proposed input. It groups canon, witness-filtered Lorebook, world state, recovered older actions, and recent history, reporting exact character counts and **estimated** tokens with `token_counts_exact=false`.

Budget warnings are estimates, not confirmation of actual truncation by Ollama, KoboldCpp, or remote workers. Private author instructions can appear in the inspector, so it belongs in Settings/Creator tools rather than a public or exported reader surface.

**Combined memory/context evidence:** [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352) passed recovery after 115 turns, fork isolation, index rollback, and private context inspector. Retrieval remains lexical and token counts approximate.
