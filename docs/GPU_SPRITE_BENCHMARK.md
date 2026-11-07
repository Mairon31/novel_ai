# Physical sprite benchmark — ComfyUI, RMBG, and BiRefNet

This optional local tool compares elapsed time, alpha transparency, and sampled VRAM for multiple expressions of the same NPC. It uses **already installed** Noble AI and ComfyUI services. **It does not run physical benchmarks in CI**, edit application preferences, install model weights, or automatically approve/publish generated images.

Source: [`tools/sprite_gpu_benchmark.py`](../tools/sprite_gpu_benchmark.py). Contract tests: `tests/test_sprite_gpu_benchmark.py`, with mocked HTTP and GPU telemetry.

## Prerequisites

1. Start Noble AI at `http://127.0.0.1:8000` and an existing local ComfyUI installation. Use **Settings → Images** to choose the checkpoint, resolution, steps, and CFG to compare. This benchmark does not change them.
2. Create a story and NPC in Creator Studio; choose a common seed across comparisons.
3. For RMBG/BiRefNet, install [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) and compatible models. Noble AI must be able to query `/models/rmbg` and the corresponding nodes. IPAdapter and LoRA require their own installed models and a suitable reference asset.
4. For NVIDIA VRAM sampling, `nvidia-smi` must be accessible on the same host/terminal. If the service uses another GPU or machine, report unavailable telemetry as `null`; never invent numbers.

## Windows PowerShell

Run from the repository root:

```powershell
# 1. Read local story IDs
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --list-stories

# 2. Read NPC IDs for the chosen story
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --list-characters STORY_UUID

# 3. Validate models/nodes without starting GPU work
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id STORY_UUID --character-id NPC_UUID --modes chroma_green,neural_rmbg2,neural_birefnet_portrait --check-only --out reports\sprite-preflight

# 4. Compare three modes using the SAME checkpoint, seed and settings
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id STORY_UUID --character-id NPC_UUID --modes chroma_green,neural_rmbg2,neural_birefnet_portrait --seed 1407 --out reports\sprite-comparison
```

Replace `STORY_UUID` and `NPC_UUID` with IDs returned by the listing commands. Three modes with five expressions can create **up to 15 images**. To start smaller, use `--expressions neutral,joy`. Unavailable modes are explicitly `skipped` and do not start inference.

To compare all four cutout methods and remove only drafts created by this benchmark after exporting previews/reports, pass `--discard-after`:

```powershell
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id STORY_UUID --character-id NPC_UUID --modes chroma_green,neural_rmbg2,neural_birefnet_portrait,neural_birefnet_matting --seed 1407 --discard-after --out reports\sprites-all-four
```

Without `--discard-after`, test drafts remain reviewable in Creator Studio. Noble AI limits active drafts to three per story; remove unused drafts through the UI. The cleanup option **never deletes published sprites or unrelated drafts**.

## Linux/macOS

Use `.venv/bin/python` instead:

```bash
.venv/bin/python tools/sprite_gpu_benchmark.py --list-stories
.venv/bin/python tools/sprite_gpu_benchmark.py --story-id STORY_UUID --character-id NPC_UUID --modes chroma_green,neural_birefnet_matting --seed 1407 --out reports/sprites
```

## References, LoRA, and GPU options

For IPAdapter identity conditioning, use `--reference-mode ipadapter` and **exactly one** of `--reference-asset-id UUID` (Gallery) or `--reference-sprite-asset-id UUID` (approved sprite for the same NPC). The default preset is `PLUS FACE (portraits)`; override using `--ipadapter-preset` and `--ipadapter-weight`. `--use-lora` applies the NPC's configured compatible LoRA when present. Neither conditioning method guarantees face/outfit consistency.

The default NVIDIA telemetry target is `--gpu-index 0`; select the GPU actually used by ComfyUI on multi-GPU machines. `--timeout 360` controls the client request timeout; the backend has separate limits. `--allow-low-vram` overrides an admission policy for the benchmark, **not** the physical VRAM budget.

## Output artifacts

| File | Content |
|---|---|
| `report.json` | Per-mode/expression status, observed settings and checkpoint, request latency, alpha/geometry metrics, preflight state, sampled GPU metrics, failures, cleanup |
| `review.html` | Local visual grid with checkerboard transparency, five expressions and visual inspection aids |
| `review.csv` | Manual quality assessment for hair/edges, face/outfit consistency and notes |
| `<mode>-<expression>.png` | A valid RGBA preview returned by the server, if generated |

`report.json` is updated after each expression to preserve partial results during interruptions; HTML/CSV are finalized at the end. Reports omit NPC text, story plots, prompts, and story/character UUIDs. **PNG previews do contain generated artwork**; share them only when appropriate.

`simulated=true` marks injected/mock HTTP tests; real HTTP mode uses `false` but does not alone prove GPU execution. `nvidia-smi` samples include system-wide activity and can miss short peaks.

## Interpretation

- **Latency:** from the HTTP generation request through preview download and validation, including API/ComfyUI overhead; not pure GPU execution time. Separate cold starts from repeated warm requests.
- **VRAM:** the maximum sampled `nvidia-smi` reading, or `null` if unavailable. No samples means no validated fit/OOM conclusion.
- **Soft alpha, bounding box, coverage:** objective PNG geometry indicators, **not** proof of good segmentation or consistent character identity.
- **Visual review:** open `review.html`, record decisions in `review.csv`, and inspect hair edges, accessories, clothing, transparency, eyes, anatomy, and pose.

## Safe failure handling and privacy

The client allows only loopback HTTP URLs (`127.0.0.1`, `localhost`, `[::1]`) with a port, no embedded credentials, redirects, or arbitrary routes. It does not use environment proxies or contact third-party APIs. Missing weights, faulty masks, individual generation errors, or timeouts produce explicit report failures. Existing previews are preserved; unvalidated assets are never published. `--check-only` returns a nonzero exit when requested modes are unavailable.

ComfyUI third-party plugins may have their own download behavior when invoked outside this workflow; install and administer those resources separately.

## Evidence and current acceptance status

[CI #42161285281](https://github.com/Mairon31/novel_ai/actions/runs/42161285281) reported **337 Python / 66 Playwright / Vite PASS** for the mocked implementation. Local `reports/` and `sprite-benchmark/` outputs are gitignored to prevent accidentally committing generated art/telemetry.

**The physical GPU benchmark is still pending**. Real checkpoints (SD/SDXL/Illustrious/Flux), VRAM, model-family compatibility, transparency quality, and character identity must be assessed by running this utility with an actual ComfyUI installation and inspecting its outputs.
