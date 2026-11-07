# Character LoRA support in ComfyUI

**Status:** explicit on-demand LoRA application is implemented and validated against simulated ComfyUI HTTP transport. Compatibility with particular weights, physical GPU execution, and visual identity quality remain unverified.

## How to use it

1. Install a LoRA compatible with your diffusion checkpoint in `ComfyUI/models/loras`. The initial workflow accepts simple `.safetensors` filenames, not nested subdirectories.
2. In **Creator Studio → Characters**, select an NPC and set `visual_dna.lora_name` plus `lora_strength` from 0 to 2. Effective application requires strength greater than zero. For a saved scene plan, connect the NPC to its corresponding gallery visual identity; the system uses UUIDs rather than name matching.
3. In **Reader → Gallery**, inspect installed LoRAs reported by ComfyUI. Enable **Apply character LoRAs** for that particular illustration, then explicitly request a ComfyUI render. This opt-in state resets when the story changes.

## Runtime behavior

The API defaults to `apply_character_loras=false`. When enabled it selects only characters belonging to the story and appearing in the resolved cast, supports up to three distinct LoRA names, and checks `GET /models/loras` and `GET /object_info/LoraLoader` before submitting `POST /prompt`.

Missing files, duplicate or invalid entries, unsupported nodes, and incompatible cast mappings produce errors rather than silently generating an image with incorrect settings.

Standard `LoraLoader` nodes are chained through MODEL and CLIP from `CheckpointLoaderSimple`, then feed `KSampler` and both `CLIPTextEncode` nodes. The `img2img` branch shares this loaded model using `LoadImage` and `VAEEncode`. No custom node or downloaded executable code is required.

## Provenance and limits

Every render records `workflow_version` and LoRA entries (NPC, filename, strength) in `render_details_json`. Gallery history, forks, and `.noble.zip` archives preserve this provenance. Cache keys change when LoRA selections or strengths change; legacy assets without the metadata remain readable, while malformed metadata is rejected.

ComfyUI's model inventory supplies filenames, **not SHA-256 hashes of local weights**. Replacing a LoRA file without changing its name may therefore leave existing cache entries valid. Multiple LoRAs affect the entire MODEL/CLIP conditioning; they do not enforce independent spatial masks or stable faces for different characters. Real checkpoint compatibility and repeated-scene identity still require GPU testing.

## QA

Relevant suites: `tests/test_comfy_images.py`, `tests/test_visual_render_provenance.py`, and `apps/web/tests/visual-gallery.spec.ts`. [CI #42145790071](https://github.com/Mairon31/novel_ai/actions/runs/42145790071) reported 261 Python / 62 Playwright PASS; [CI #42146552556](https://github.com/Mairon31/novel_ai/actions/runs/42146552556) reported 266 Python / 62 Playwright PASS. Both used simulated ComfyUI responses.

Node reference: [ComfyUI LoraLoader](https://github.com/Comfy-Org/docs/blob/main/built-in-nodes/LoraLoader.mdx). The project follows the documented node contract; it did not copy upstream implementation code.
