# Noble AI image sampling and style controls

**Status:** the first N-21 sampling controls are implemented on `master`. [CI #42340226265](https://github.com/Mairon31/novel_ai/actions/runs/42340226265) reported 385 Python tests, 80 Playwright tests, and a passing Vite build. These are software contract results, **not measured art quality on a physical GPU**.

## Configuration

The Images settings panel already provides ComfyUI URL, checkpoint, output dimensions, diffusion steps, CFG, and negative prompt. Three fields extend `GET/PUT /api/v1/images/config`:

| Field | Supported values | Applied to |
|---|---|---|
| `sampler_name` | `euler`, `euler_ancestral`, `dpmpp_2m`, `dpmpp_sde`, `dpmpp_2m_sde`, `heun`, `uni_pc` | `KSampler.inputs.sampler_name` |
| `scheduler` | `normal`, `karras`, `exponential`, `sgm_uniform`, `simple` | `KSampler.inputs.scheduler` |
| `style_preset` | `anime_fantasy`, `anime_cinematic`, `anime_watercolor`, `none` | Image prompt conditioning before render |

Defaults: `euler`, `normal`, `anime_fantasy`. Existing configuration rows receive non-destructive defaults; callers using the previous image graph retain Euler/Normal behavior.

## Runtime capability checking

`GET /api/v1/images/sampler-options` queries the connected ComfyUI instance at `/object_info/KSampler` without loading weights or generating an image. The response reports whether ComfyUI is online, the supported sampler/scheduler arrays, and any error. The UI warns when a selected method is unavailable and blocks saving a confirmed-incompatible choice.

Before rendering with any non-default sampler or scheduler, the API checks compatibility again. If the runtime changes, lacks the requested method, or does not expose the required inventory, Noble AI returns HTTP 422 before sending `/prompt`. The default Euler/Normal combination retains legacy behavior without mandatory introspection. Saving while offline **cannot certify compatibility**.

## Anime presets and provenance

- `anime_fantasy`: 2D illustration, fantasy settings, painted scenery, and consistent character design language.
- `anime_cinematic`: additional cinematic composition and lighting guidance.
- `anime_watercolor`: watercolor-oriented texture and styling.
- `none`: pass through the scene planner's prompt without preset augmentation.

These presets affect **image generation prompts**, not saved player dialogue. The selected style, sampler, and scheduler contribute to the render cache signature and `visual_assets.render_details_json` provenance. Older gallery items import without the new fields; malformed or unknown values are rejected. Selecting a preset never automatically starts image generation.

## Checkpoint manager

The Images panel also provides managed installation of supported public Hugging Face root-level `.safetensors` files with published size and SHA-256. Downloads are explicit, persistent, and pausable/resumable. Noble AI generates a model-path configuration for ComfyUI, and checkpoint selection stays disabled until the runtime confirms it recognizes the downloaded file. See the [checkpoint installation guide](CHECKPOINTS_IMAGEN.md).

## Test coverage and remaining work

- `tests/test_comfy_images.py`: persisted values, KSampler payload, anime prompt composition, cache keys, invalid runtime inventory, HTTP 422, and default behavior.
- `tests/test_visual_render_provenance.py`: export/import of render settings and rejection of manipulated metadata.
- `apps/web/tests/multimedia.spec.ts`: UI selection, compatibility checks, settings persistence, and independent Voice/TTS navigation with simulated endpoints.

Outstanding: full Windows/Colab ComfyUI GPU runs, broader managed model and LoRA installation, per-story/per-scene presets, advanced batch/seed options, and measurable character consistency/performance. N-21 and N-24 are not complete.
