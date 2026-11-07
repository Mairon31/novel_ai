# Noble AI — visual assets for creators

Creator Studio → Images lets authors assemble visual novel scenes using their own media without loading ComfyUI or another model merely to select existing artwork.

## Import files

Choose a project in Creator Studio and open **Images**. Select **Editorial Cover**, **Scene Background**, or **Character / Foreground**. Provide a label and descriptive caption, such as "illuminated castle at night" or "Aira smiling at the castle". A foreground image may optionally be associated with an NPC from the same story.

Supported formats: PNG, JPEG, and WebP up to 12 MiB. Pillow validates image data and resolution limits. Covers and backgrounds are converted to RGB WebP; foreground images are stored as RGBA PNG to retain transparency.

## Story covers

A story cover is a distinct editorial asset, not a scene automatically generated or selected by the narrator. Import a **Cover** asset, upload alternatives, choose **Use as cover**, or clear the association without deleting the story.

Library and story detail use `cover_image_url` when available and fall back to existing scene artwork when there is no cover. The selection persists as `stories.cover_asset_id`. A story fork clones the underlying media into new asset IDs and remaps the cover reference. Deleting the active cover clears its association. Covers do **not** participate in scene matching.

## Selection during reading

The reader queries a dedicated presentation endpoint using current location and the most recent saved narrative turn. It compares whole words, requires several matches for descriptive captions, and accepts an NPC-linked foreground only if that NPC is explicitly present in the narration. A matching background becomes the current scene; a matching foreground is layered on top.

If nothing matches, the existing story illustration or an empty stage remains. The selector reads locally stored assets; it does not call a generation service, download models, or send narration to external providers. Lexical matching may miss synonyms/ambiguous descriptions and must not be misrepresented as robust semantic classification.

## API and persistence

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/stories/{id}/creator/assets` | List assets and URLs |
| POST | `/api/v1/stories/{id}/creator/assets` | Multipart `kind`, `label`, `caption`, `file`, optional `character_id` |
| PUT | `/api/v1/stories/{id}/creator/cover` | Set `{"asset_id":"uuid"}` or clear `{"asset_id":null}` |
| GET | `/api/v1/stories/{id}/creator/assets/scene` | Resolve background, foreground, and selection |
| GET | `/api/v1/stories/{id}/creator/assets/{asset_id}/file` | Stream validated story-owned file |
| PUT | `/api/v1/stories/{id}/creator/assets/{asset_id}` | Update label and caption |
| DELETE | `/api/v1/stories/{id}/creator/assets/{asset_id}` | Remove owned asset |

SQLite uses `creator_media_assets` and `stories.cover_asset_id`. Forks copy files with new UUIDs and remap linked NPCs and cover selection.

## Image compositor and planned enhancements

The staged compositor can place up to three NPCs using pose/expression variants. More advanced positioning, 2D rigging, automatic cutouts, real model visual-identity evaluation, and editorial image-generation improvements remain in the backlog. These are Noble AI implementations inspired by general VN interaction principles, not imported Isekai Zero image assets.

## Argon audit: security and evolution (November 5, 2026)

**Already hardened on `master`:** all asset paths use canonical UUIDs and valid types and resolve inside managed storage. Symlinks escaping `story-assets` are rejected, including when reading imported legacy rows. Evidence: `tests/test_creator_media.py::test_owned_asset_paths_reject_traversal_and_symlinked_directories` and [CI #41994792794](https://github.com/Mairon31/novel_ai/actions/runs/41994792794).

Further requirements:

- **P1:** per-character sheets for `neutral/joy/anger/sadness/surprise`, with asset IDs, pose, metadata, and separate cover/background/sprite/CG types. Preserve mappings across forks.
- **P2:** Character Card PNG V2/V3 import/export (`chara`, `ccv3`) with drag-and-drop, mapped fields, embedded Lorebooks, and strict byte/chunk limits. Never execute embedded scripts or trust arbitrary PNG JSON.
- **QA:** story ownership, symlink/traversal prevention, branching and safe delete, card roundtrip, and reusing the same expression without inference.

See [TODO](../TODO.md), [Argon audit](ARGON_AUDITORIA.md), and related [QA](QA_Y_ACEPTACION.md).

## Visual DNA and manually imported expression sheets

Under **Creator Studio → Characters**, `visual_dna` is separate from narrative personality. Normalized tags and seed are fixed when saved if missing. Optional LoRA filename and strength are stored without arbitrary paths; they apply only when the creator explicitly opts into a relevant ComfyUI request. These fields follow NPC records through canon, snapshots, forks, and backups.

**Expression-sheet import:** under Images, select the NPC, scene context, and pose, then upload a transparent PNG/WebP arranged as five equal cells in a row (`1x5`) or column (`5x1`). Every cell must contain content, in order: **neutral → joy → anger → sadness → surprise**. Import creates five RGBA PNG foreground assets associated with the NPC. Another sheet for another pose can coexist without overwriting the first.

Files are prepared before SQLite insertion; any SQL failure rolls back the records and deletes files created by the failed operation. API:
`POST /api/v1/stories/{id}/creator/characters/{character_id}/expression-sheet`
(multipart `caption`, `pose`, `layout`, `file`), response 201 with `assets[]` and `count:5`.

Reader selection remains heuristic and depends on matching captions and text. Importing does not generate AI artwork or prove images of the character are visually consistent.

### Link NPCs with visual-character records

The **Linked visual character** control under Characters selects a gallery visual-character record owned by the same story. Its UUID links a narrative NPC to the cast item in a scene plan. When the creator explicitly supplies a cast, visual-DNA descriptions are applied only to linked and present UUIDs. Matching a name alone must not inject another unrelated character. Linking does not render art or install LoRA.

## NPC LoRAs for future illustrations

Select a simple `.safetensors` LoRA filename and intensity in Characters, then link the visual identity if the scene cast uses UUIDs. The reader can inspect the installed LoRA inventory reported by ComfyUI and explicitly apply up to three LoRAs to one illustration. Advancing narration or changing stories never silently generates images. Gallery provenance records the actual LoRA filenames and strengths. See [LoRA guide](COMFY_LORAS.md).

## Five-expression AI drafts with explicit approval

Manual expression sheets work without GPU inference. The optional **Creator Studio → Images → Generate expressions with AI** flow creates per-NPC drafts using a shared seed (prefer `visual_dna.seed`), style, pose, context, optional LoRA, and optional owned gallery reference via img2img.

Each **Generate** action makes one ComfyUI request. **Generate missing** requests remaining slots sequentially. Candidate images that fail transparent-PNG cutout checks (green background, borders, or silhouette coverage) are rejected while existing saved drafts remain intact.

Draft files live in `sprite-drafts/<story_uuid>/<draft_uuid>`, separate from published media and `.noble.zip` exports. SQLite tracks draft slots and supports resuming/discarding after reload. Up to three drafts per story are allowed; inactive drafts expire after 48 hours.

**Approve five expressions** uses the established transactional importer to publish five `foreground` assets without replacing older approved variants. Published images store `source=ai_reviewed` and `generation_json` with checkpoint, seed, LoRA, prompt fingerprint, quality results, and confirmation. Approved media/provenance survive forks and backups; temporary drafts do not. See [sprite draft architecture](COMFY_SPRITE_DRAFTS.md).

## Optional identity conditioning and silhouette QA

Under the AI expression wizard, choose an owned gallery image or an approved sprite for the **same NPC**, then select `IPAdapter` to condition a new composition rather than classic img2img. An optional LoRA can be chained; preset and influence are configurable.

IPAdapter Plus and CLIP Vision nodes/model files must be installed and visible to ComfyUI. The backend validates story ownership, source SHA-256, and required node inputs **before submitting GPU work**. It must not silently fall back to another conditioning mode. Published expression provenance records which method was used.

Significant shifts in silhouette position/scale produce warnings. Approval requires explicit acceptance or regeneration of affected slots. This is a geometry check, not face recognition. See [IPAdapter and geometry review](COMFY_SPRITE_DRAFTS.md).

## Neural cutout options

The AI draft workflow offers **Sprite background removal**. The original `chroma_green` path requires no additional model. `RMBG 2.0`, `BiRefNet Portrait`, and `BiRefNet Matting` require ComfyUI-RMBG with the corresponding installed weights.

**Check cutout models** probes availability without generating. A missing or failed model keeps earlier previews and surfaces an error rather than publishing opaque sprites or silently falling back to green.

For neural modes, Noble AI retrieves a processed image and its mask as separate outputs, then reconstructs an alpha PNG with border/coverage checks. All five generated sprites still need review and approval, and provenance records the selected cutout model. See [technical cutout guide](COMFY_SPRITE_DRAFTS.md).
