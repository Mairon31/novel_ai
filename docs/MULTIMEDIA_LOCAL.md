# Noble AI — local image and speech integration

This guide describes the implemented adapter contracts and related setup. It is not a physical performance benchmark or a claim that all optional runtimes can be installed automatically.

## Prerequisites

For images, install or start a compatible local ComfyUI server, normally at `http://127.0.0.1:8188`. The standard workflow uses `CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`, `VAEDecode`, and `SaveImage`. Model compatibility depends on the checkpoint architecture and the installed nodes.

For voice, install the Piper CLI and provide matching `.onnx` and `.onnx.json` files under `data/models/voices` (or the configured data directory). Piper can synthesize on CPU without an NVIDIA card.

## Image generation

1. Start Noble AI and open the **Images** settings section.
2. Connect ComfyUI or use Noble AI's manager for an **already installed** instance. Refresh its checkpoint inventory.
3. Select a recognized checkpoint; configure width/height, steps, CFG, negative prompt, sampler, scheduler, and style where supported. Save settings.
4. Open a story and its Gallery or scene illustration controls.
5. Enter or review scene details and explicitly request a ComfyUI illustration. The resulting image is saved to the local gallery.
6. If generation fails, narrative turns remain usable; previously saved images are not discarded.

The backend restricts local ComfyUI connections, serializes compatible work, and applies request timeouts. It does not execute arbitrary user-supplied Python workflows. Advanced plugins, custom nodes, model families, and GPU behavior require separate compatibility checks.

Noble AI can install supported individual Hugging Face `.safetensors` checkpoint files into its own managed directory. A downloaded file is selectable only when ComfyUI confirms it is available. See [checkpoint installation](CHECKPOINTS_IMAGEN.md) and [managed ComfyUI](COMFY_UI_INTEGRACION.md).

## Voice synthesis

1. Install Piper and add a compatible ONNX voice pair, or use the supported voice catalog/installer for eligible models.
2. Refresh the voice inventory in the separate **Voice / TTS** settings section.
3. Explicitly enable on-demand voice controls and choose a default reader voice.
4. In the reader, select or confirm the desired voice.
5. Click **Listen** on a saved turn. The first request may synthesize local WAV; subsequent playback can reuse a cached result.
6. Stop playback in the browser when needed. Opening a story or generating text does not automatically trigger speech.

Piper's initial CPU adapter has request duration and input-length limits; available settings may include `length_scale`, `noise_scale`, and `noise_w`. Automatic per-character voice assignment, voice cloning, and additional TTS engines remain roadmap items unless explicitly implemented.

## Reference-image img2img

1. Open an existing gallery image and choose it as the ComfyUI reference.
2. Adjust transformation strength; lower strengths generally preserve more composition, but effects are checkpoint-dependent.
3. Enter the new scene prompt and optionally set a reproducible seed.
4. Explicitly start generation. Noble AI uploads the reference only for that request and uses the standard `LoadImage` + `VAEEncode` path.

Text-to-image remains available without a reference. Contract tests cover multipart upload and graph assembly, not artistic output quality on a physical GPU.

## GPU monitoring and reserve

The Images settings can report free NVIDIA VRAM from `nvidia-smi` and configure a minimum-free threshold. In monitor mode, this is informational; in guard mode, an image request may fail with HTTP 409 when the observed free VRAM is below the threshold. A single explicit override may be offered from the reader. These controls do not unload unrelated models or stop external processes.

## Diagnostics and limits

- `GET /api/v1/images/status` probes ComfyUI without launching a render.
- `GET /api/v1/tts/voices` enumerates supported installed voices without synthesizing audio.
- `GET /api/v1/health` identifies `comfyui_on_demand` and `piper_on_demand` adapters; this does not guarantee that external runtimes are installed and ready.
- Simulated ComfyUI tests can still process real PNG/WebP fixture bytes; a mocked response is not a model-output test.
- Piper CLI tests may use a simulated WAV-producing executable, which does not establish real voice quality.
- On 12–16 GB VRAM systems, check actual budgets before running a large LLM and diffusion model simultaneously.
- External models and voices have their own licenses and distribution conditions.

Next areas include improved scene scheduling, consistent identity, additional TTS engines, better job cancellation/status, and stronger GPU resource orchestration.
