# Noble AI — Isekai Zero workflow research

> Product research only. This is neither an implementation report nor an official Isekai Zero API specification.

## Sources reviewed

- [Official documentation](https://docs.isekaizero.ai/shelves/english)
- [Storyline Creation Guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/storyline-creation-guide)
- [Character Creation Guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/character-creation-guide)
- [Visual Novel Mode](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/visual-novel-mode)
- [Preparing a storyline for visual novel mode](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/how-to-get-your-storyline-ready-for-visual-novel-mode)
- [Summarization and Arc](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/summarization-and-arc)

User-provided screenshots were also compared: character/name selection, narration with a scene illustration, settings, and mobile layouts. They were studied as **interaction references**, not reusable graphic assets.

## Two distinct product experiences

**Creator / Author:** separate workspaces for story metadata, public player presentation, private story/AI instructions, characters, artwork, opening messages, and publishing information.

**Player / Reader:** the user first chooses their player persona or playable character and then enters the story. The visual novel interface prioritizes narration, with scene imagery and continue/retry/edit controls. Settings should be secondary to the reading experience. **Do not embed a library of unrelated stories into the reader canvas.**

Noble AI applies these observations through product separation. It does not assume access to Isekai Zero's proprietary algorithms.

## Creator data and narrative generation

| Concept | Purpose | Noble AI mapping |
|---|---|---|
| Title, genre, tags | Discoverability and organization | Story metadata |
| Synopsis | Public presentation | `synopsis`; never include private secrets |
| Player-visible plot | Facts the player knows at the beginning | `player_plot` |
| Private AI plot | World background, rules, secrets | `ai_plot` included in the narrator's system context |
| Author guidelines | Tone, pacing, player agency | `guidelines` |
| Reminders | Rules that must stay active | Persistent `reminder` |
| Openings | Alternate initial scenarios | `opening_scenarios` (design range 0–6) |
| NPCs | Personality, motives, dialogue voice | `creator_characters` and examples |
| Player persona | Identity and choices belonging to the player | `protagonist_name`, separate from NPCs |
| Visuals | Backgrounds, characters, expressions, scenes | `scene_plans`, `visual_characters`, `creator_media_assets`; basic composition implemented |
| Memory | Important facts across chapters | Hand-authored canon; chapter/arc summaries planned |

Isekai Zero's documentation distinguishes **player-visible information** from **model-directed private context**. Noble AI should never reveal the full `ai_plot` in the public opening or allow an AI narrator to decide an action explicitly reserved for the player.

## Recommended narrative prompt architecture

Use this logical order when assembling narration context:

1. **Core system rules:** narrator responsibilities, player ownership of protagonist decisions, and output format.
2. **Language and style preferences:** user settings, not player actions.
3. **Story premise and confirmed canon:** persistent facts supplemented by author materials.
4. **Private author bible:** AI plot, author directives, NPC records, and reminders.
5. **Long-term memory:** revisable chapter/arc summaries where implemented.
6. **Recent history:** limited by the actual provider context budget.
7. **Current player action:** the latest user input preserved verbatim.

A prior code audit found that the last action had been replaced by the `Required output language` instruction. That bug was addressed by keeping action and preference variables separate. Tests should verify that the actual player input remains present in the assembled prompt.

## Separate views

- **Library:** cover cards and stories, without automatically starting a reader or rendering complete history.
- **Reader:** screen-oriented scene composition, readable text, hideable auxiliary controls, and a clear route back to Library. Do not display a list of all stories here.
- **Creator Studio:** project-oriented editing with **Plot and Context**, **Characters**, and **Openings**. Edits must not start narration or GPU jobs.
- **Model Hub:** searchable results, detail pane, quantization, and honest per-device compatibility estimates.
- **Settings:** distinct provider, language, reader, runtime, storage, network, images, voice, About, and Updates destinations.

## Image architecture for a real visual novel

One illustration per story is not a complete visual novel system. The target should provide:

- Location background separate from foreground characters.
- Multiple character sprites with expression, pose, clothing, and screen position.
- Links from existing images to particular story events without regenerating.
- Captions and condition rules for choosing backgrounds/expressions, under creator review.
- Explicit optional generation on demand, not diffusion for every chapter change.
- Persistent visual references and appropriately validated IPAdapter/FaceID/LoRA support where required.
- Separate per-scene and per-character galleries, not one global image.

Noble AI already has a scene planner, versioned gallery, visual reference profiles, and caption-based sprite selection. More expression variants, a full layer editor, and richer semantic triggers remain open.

## Chapter and arc memory

Official documentation describes periodic chapter/arc summaries to manage context. Noble AI should store editable summaries linked to turn IDs, revisions, and source provenance, with checks against contradictions. **Do not fabricate events absent from original narrative history.**

## Attribution and evidence limits

These findings concern **interaction patterns and functional separation**. They do not establish that Noble AI can copy Isekai Zero source code, brands, character designs, or story content. User screenshots show the outward experience, not its internal code.

Compare future implementations with the public documentation and verify licenses of any external assets or code before importing them.

## Research update — November 4, 2026

Reviewed official story, character, and VN authoring guides. They distinguish synopsis from public plot, private AI context, guidelines, reminders, alternate openings, optional playable-persona fields, background imagery, and transparent foreground character artwork with captions.

Noble AI mapping at the time:

- **Creator Studio:** title, synopsis, public plot, private context, guidelines, reminders, NPCs, and opening scenarios.
- **Library and Reader:** story collections and immersive reading are separate; the reader composes an image scene instead of showing a story list.
- **Author media:** WebP backgrounds, PNG sprites with alpha, names, captions, and optional NPC associations. Matching against the latest saved turn is lexical and implemented by Noble AI itself.
- **Model Hub:** catalog, GGUF variants, and estimated memory for CPU, full GPU, and combined GPU+RAM modes.

Outstanding differences include editorial story covers, multiple simultaneously visible cast members, richer expression/pose selection, layer editing, playable-character profiles, chapter/arc summaries, and multi-user publishing. Isekai Zero's public review/distribution system is not part of Noble AI's current local-only Story Hub.

Research references: [storyline creation](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/storyline-creation-guide), [character creation](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/character-creation-guide), and [visual novel mode](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/visual-novel-mode).

No Isekai Zero source or graphics were copied in the research documented here. Public documentation describes an experience, not its private implementation.
