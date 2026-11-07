# Image checkpoint installation in Noble AI

**Status:** the first Hugging Face checkpoint installation workflow is implemented on `master`. The earlier automated run [#42342017206](https://github.com/Mairon31/novel_ai/actions/runs/42342017206) reported 393 Python and 82 Playwright tests passing, plus a successful Vite build. Subsequent Windows-path and runtime-manager changes must be evaluated against their own CI runs. **This does not install ComfyUI itself.**

## Install a checkpoint

Open **Settings → Images → Checkpoints**. Enter a public Hugging Face repository ID in `author/model` format and inspect available files. This initial flow supports individual root-level `.safetensors` checkpoint files when Hugging Face publishes both their file size and SHA-256. It displays the advertised license, repository revision, and size before installation.

Starting a download is an explicit user action. The manager shows progress and offers pause, resume, and cancel. Opening Settings or inspecting a repository does not start a download.

Verified files are stored under:

```text
data/models/comfyui/checkpoints/author/model/file.safetensors
```

The base model directory can be configured. Noble AI verifies the immutable repository revision, size, published SHA-256, and safetensors header/tensor structure before publishing the final file. It will not overwrite unrelated files.

**Not supported in this first flow:** nested model paths within a Hugging Face repository, gated/private files, missing published hashes or sizes, and arbitrary extensions. Passing file verification **does not establish** architecture compatibility, expected VRAM use, or image quality.

## Make the checkpoint visible to ComfyUI

Noble AI writes `data/models/comfyui/noble_extra_model_paths.yaml` with the managed checkpoint directory.

There are two supported ways to register it:

1. In **Settings → Images**, configure an **already installed** ComfyUI directory, Python interpreter, and local port. Use the managed launch controls. Noble AI passes the required extra-model-paths configuration automatically and starts only the configured local process.
2. If you manage ComfyUI separately, start it with:

```text
--extra-model-paths-config "<absolute path displayed by Noble AI>"
```

ComfyUI may need a restart before it refreshes its checkpoint inventory. Click **Refresh checkpoints**. A downloaded model becomes selectable only after ComfyUI reports its relative `author/model/file.safetensors` name. Save the image settings before using that checkpoint for illustration.

Noble AI does not write into arbitrary third-party ComfyUI model folders. The managed ComfyUI **start/stop controls exist**, but automated installation/upgrading of ComfyUI is still pending. See [ComfyUI integration](COMFY_UI_INTEGRACION.md).

## API contract

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/images/checkpoints/lookup?repo_id=author/model` | Inspect an immutable revision and supported root safetensors |
| GET | `/api/v1/images/checkpoints/installed` | Verified inventory and managed model path |
| GET | `/api/v1/images/checkpoints/downloads` | Recent installation jobs |
| GET | `/api/v1/images/checkpoints/downloads/{uuid}` | A single job |
| POST | `/api/v1/images/checkpoints/install` | Install using repo ID, filename, and revision |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/pause` | Pause |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/resume` | Resume or retry |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/cancel` | Cancel |

The requested revision is a 40-character commit SHA and the published content hash is 64 hexadecimal characters. Jobs are persisted in `image_checkpoint_downloads`. An HTTP 206 resume must match the exact expected `Content-Range`; an HTTP 200 response to a resume starts the partial download again from byte zero.

Example request body:

```json
{"repo_id":"author/model","filename":"checkpoint.safetensors","revision":"<40-character-commit-sha>"}
```

## Validation and remaining work

`tests/test_checkpoint_installer.py` covers security checks, format parsing, mocked Hugging Face responses, interrupted downloads, and no downloads on panel mount. `apps/web/tests/checkpoint-installer.spec.ts` covers installation controls and ComfyUI-gated selection on desktop and mobile.

Remaining: nested Hugging Face paths, reliable model-family identification (SD 1.5 / SDXL / Illustrious / Flux), managed LoRA/VAE installation, full ComfyUI application installation, and end-to-end Windows/Colab GPU validation. The larger N-01 and N-21 milestones remain open.

The **managed runtime panel** can validate, start, inspect logs for, and stop an existing ComfyUI installation; this is separate from installing its Python environment, dependencies, or executable.
