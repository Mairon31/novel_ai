# Noble AI — ComfyUI AI expression drafts

## Scope

Creators can explicitly request five portraits for one NPC: `neutral`, `joy`, `anger`, `sadness`, `surprise`. Each is generated independently as a **reviewable draft**. **Nothing becomes available to the reader until all five are approved.**

The workflow uses the configured local ComfyUI runtime. It never silently starts inference in response to a story turn, installs model weights, or runs arbitrary remote nodes.

## Creator Studio workflow

1. Configure and start an existing compatible ComfyUI with an active checkpoint from **Settings → Images**. In Creator Studio create an NPC with `visual_dna.tags` and optionally `visual_dna.seed`; an installed `.safetensors` LoRA may be associated if compatible.
2. Open **Images → Generate expressions with AI**. Choose the NPC, scene context for later deterministic selection, pose, style, optional seed override, optional gallery reference (img2img), and optional NPC LoRA.
3. Click **Prepare five-expression draft**. This step does not use GPU. **Generate missing** requests remaining slots sequentially; individual slots can also be regenerated without deleting the others.
4. Inspect five transparent PNGs for hair borders, stray figures, outfit, pose, facial coherence, and scale. Only when acceptable, choose **Approve five expressions**. Publication is transactional; the reader can use those assets without launching ComfyUI.
5. Drafts persist across reload and can be discarded. The cap is three drafts per story; inactive drafts expire after 48 hours.

## Transparency and quality

The default ComfyUI graph produces opaque images. Noble AI asks for a single isolated character on a consistent chroma-green background. `sprite_cutout.transparent_sprite` validates dimensions, silhouette margins, corner/border chroma and coverage, removing green regions connected to the outer background. Real alpha returned by an upstream PNG is validated instead of being discarded.

This is **not neural segmentation**. Green clothing/hair, internal green spaces, gradients, extra figures, complex shadows, or crops may require regeneration or manual import. Suspicious candidates must fail visibly rather than be published.

Sharing a seed across expressions and using a LoRA **does not guarantee the same face**. Expression-specific prompts still vary, and an img2img reference can preserve composition while interfering with chroma extraction. Human review remains mandatory.

## Durable draft state and publication

- SQLite `sprite_drafts`: UUID, story/NPC association, settings snapshot, five slots, timestamps.
- Temporary files: `sprite-drafts/<story-id>/<draft-id>/<expression>-<uuid>.png`. These are distinct from published `story-assets` and excluded from `.noble.zip` archives.
- A shared ComfyUI lock and optional GPU admission reserve prevent five parallel jobs; real physical VRAM budgets still require measurement.
- `approve` assembles a horizontal RGBA sheet, validates each cell, and calls `CreatorMediaService.import_expression_sheet`. On failure, existing drafts remain available for retry.
- Published expression assets contain `source=ai_reviewed` and `generation_json` including checkpoint, seed, LoRA, prompt SHA-256, extraction method, and approval. Manual imports retain `source=manual`. Forks/backups copy approved media and metadata only.

## Tests and evidence

CI uses simulated ComfyUI HTTP responses, real SQLite/Pillow, and desktop/mobile Playwright. It does **not** establish the quality of generated sprites, identity preservation, real checkpoint compatibility, or GPU memory use.

Tests: `tests/test_sprite_cutout.py`, `tests/test_sprite_drafts.py`, `tests/test_sprite_provenance.py`, and `apps/web/tests/sprite-drafts.spec.ts`.

### Hardened diffusion protocol

ComfyUI-provided IDs and filenames are validated before constructing `/history` and `/view` requests. Noble AI's `SaveImage` workflow does not require arbitrary subfolders, so responses containing unapproved paths are rejected. Images are fetched only through the configured loopback HTTP service; no filesystem reads are performed at paths supplied by ComfyUI.

### Original implementation milestone

[GitHub Actions #42152514498](https://github.com/Mairon31/novel_ai/actions/runs/42152514498): **283 Python / 64 Playwright / Vite PASS** with mocked ComfyUI. Physical image generation and cutout quality remain unverified.

## IPAdapter Plus identity reference

Creators can select **Reference mode → img2img** (reuse composition) or **IPAdapter** (guide a new scene from a reference). The source must be **either** a gallery image from the current story **or** an approved sprite belonging to the same NPC, not both. IPAdapter requires an explicit source.

Supported presets: `STANDARD`, `PLUS`, `PLUS FACE`; weight range **0.1–1.5**. Compatible [IPAdapter Plus](https://github.com/comfyorg/comfyui-ipadapter) nodes, `IPAdapterUnifiedLoader`, `IPAdapter`, IPAdapter model files, and matching CLIP Vision assets must exist in ComfyUI for the checkpoint family.

**Check installed IPAdapter** inspects capabilities without downloading or generating. On generation, the backend validates advertised node inputs and preset availability before calling `/prompt`. References are normalized as RGB PNG with neutral borders. The graph connects:

```text
Checkpoint → optional LoRA → IPAdapterUnifiedLoader → IPAdapter → KSampler
```

This mode does not use `VAEEncode`, FaceID, or region masks. Human face comparison is still needed. Approved provenance includes `comfy-sprite-v2-ipadapter`, preset/weight, and reference SHA-256. If the referenced source is changed or deleted before generation, the request is rejected rather than silently using a substitute.

## Silhouette continuity review

Noble AI compares alpha bounding-box center and scale across all five variants and flags large differences. Approval is disabled until the creator explicitly accepts discrepancies using `accept_alignment_warnings=true` or regenerates outliers. The API rechecks each PNG against its saved SHA-256 at approval to prevent publishing a modified preview.

Geometry warnings can identify significant shifts but **cannot certify** matching face, eyes, outfit, or apparent character age.

### Evidence for IPAdapter and geometry milestones

- [CI #42155018903](https://github.com/Mairon31/novel_ai/actions/runs/42155018903): **298 Python / 66 Playwright PASS**, IPAdapter editor/integration (without silhouette gate).
- [CI #42155457588](https://github.com/Mairon31/novel_ai/actions/runs/42155457588): **307 Python / 66 Playwright PASS**, geometry warnings and preview SHA-256 validation.
- Both built Vite successfully with simulated ComfyUI transport. Neither proves installed physical IPAdapter weights or repeatable facial identity.

## Optional neural background extraction

The AI sprite cutout controls support four modes:

| Mode | Identifier | Required runtime |
|---|---|---|
| **Green screen** | `chroma_green` | Local chroma extraction; no extra neural weights |
| **RMBG-2.0** | `neural_rmbg2` | `RMBG` node from [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) with `RMBG-2.0` |
| **BiRefNet Portrait** | `neural_birefnet_portrait` | `BiRefNetRMBG` node and Portrait model |
| **BiRefNet Matting** | `neural_birefnet_matting` | `BiRefNetRMBG` node and Matting model |

The selected method is captured at draft creation alongside visual DNA, seed, LoRA, and optional reference. Green screen requests a uniform chroma background; neural modes ask for a simple neutral background and need not prohibit green clothing.

**Check cutout models** probes `/object_info/RMBG`, `/object_info/BiRefNetRMBG`, `/object_info/MaskToImage`, and `/models/rmbg`, validating actual node inputs and registered supporting code/config/weights. No generation/download occurs while checking. Missing models produce diagnostics, and generation fails **before** submitting a graph. Noble AI does not install these weights; a third-party ComfyUI extension may have independent download behavior outside this guarded flow.

### Two outputs from one render

The neural graph keeps `VAEDecode(6)`, passes its image through `RMBG/BiRefNetRMBG(23)`, saves the processed image via `SaveImage(7)`, and converts the returned MASK into a separate PNG through `MaskToImage(24) → SaveImage(25)`.

**Both outputs must come from the same `/prompt` job**. If either is missing, no result is published. Noble AI retrieves both through the configured loopback URL after validating IDs, filenames, file types and subfolders. Pillow composes an RGBA PNG using RGB from the processed image and the real gray mask; soft hair/edge alpha is retained instead of binarizing the entire mask.

Reject: files larger than 12 MiB, unexpected formats, mismatched mask dimensions, inverted/empty masks, implausible coverage, opaque-dominant backgrounds, or silhouettes touching critical canvas edges. No silent chroma fallback. Normal story ownership, five-expression review and geometry gates still apply.

### Provenance and limits

Neural cutouts record `quality.method=neural_rmbg|neural_birefnet` with `matting:{mode,model}`. Without IPAdapter, workflow version is `comfy-sprite-v3-matting`; combining them yields `comfy-sprite-v4-matting-ipadapter`. Forks and `.noble.zip` archives preserve and validate provenance. v1/v2/manual assets stay compatible.

Automated tests cover graph routing, secondary output requirements, invalid masks/path handling, weight inventory, UI controls, and provenance—not real model installation, image quality, or hardware fit. Measure actual segmentation and VRAM before recommending a mode for a specific GPU.

### Neural implementation milestone

[GitHub Actions #42158275044](https://github.com/Mairon31/novel_ai/actions/runs/42158275044), commit `63db653c`: **326 Python / 66 desktop+mobile Playwright / Vite PASS**. The test suite exercised the IMAGE/MASK graph, absent secondary output, model inventory, no-fallback behavior, alpha quality checks, and v3/v4 provenance with IPAdapter. **Real ComfyUI-RMBG generation and fine-hair inspection remain unverified.**
