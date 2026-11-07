# GPU profiles — 12 GB and 16 GB VRAM

These are **engineering targets and estimates, not measured benchmarks**. Actual memory depends on quantization, inference backend, KV cache, context, CUDA kernels, image workflow, and concurrent workloads. A hardware profile is not certified until its documented real-device checks pass.

## Baseline hardware

- **Minimum target:** NVIDIA GPU with 12 GB VRAM, a modern CPU, and at least 32 GB recommended system RAM. Leave headroom for drivers, OS, and context.
- **Recommended target:** NVIDIA GPU with 16 GB VRAM, at least 32 GB system RAM (64 GB helps with CPU offload), and sufficient SSD space for checkpoints/caches.
- **Reference PC for future tests:** RTX 5060 Ti 16 GB, Ryzen 7 5800XT, 64 GB DDR4, Windows 11. **No Noble AI performance benchmarks from this machine have been recorded in this document.**
- **Google Colab:** available hardware is not guaranteed and does not necessarily represent an equivalent desktop GPU. Log the actual GPU model each session.

## Proposed profiles

| Preset | Experimental LLM | Image model | Speech | Execution policy |
|---|---|---|---|---|
| `minimum_12gb` | Qwen3-8B GGUF Q4_K_M, 4k–8k initial context | SDXL 768–1024 if compatible | Lazy/on request | CPU offload and serialized GPU |
| `recommended_16gb` | Qwen3-8B Q5/Q6; 14B Q4 **experiment only** | SDXL/Illustrious, batch 1 | Lazy | One heavy model at a time |
| `colab_probe` | Small smoke-test model; 8B only when allocated GPU permits | Optional separate image smoke test | Optional separate test | Sequential checks |
| `cpu_fallback` | Small quantized LLM; zero GPU layers | Disabled | Disabled | Preserve text play without speed guarantee |

For planning only: 8B Q4 weights may require roughly **4–6 GB** plus runtime and KV cache; 14B Q4 roughly **8–10+ GB** plus runtime and KV. SDXL adds potentially several more GB. **Do not add these as if the workloads can always fit simultaneously.** These estimates are not peak-VRAM measurements.

## Resource orchestration

- Keep the selected narrator reachable through its API, potentially with CPU offload.
- Prioritize `interactive_text > requested_audio > requested_image > background_image`.
- Design explicit heavy-GPU job leases and queued states, rather than starting multiple large models in parallel.
- Support configuration such as `reserve_vram_mb`, `max_image_jobs=1`, `max_tts_jobs=1`, cancellation, and OOM recovery where each provider allows it.
- Distinguish observed total GPU VRAM from the amount actually available for models.
- Preserve database and story state across model changes or failures.

These are target scheduler behaviors; the current local mutex/VRAM guard is **not** a complete model-unloading or memory-reallocation scheduler.

## Minimum measurements per GPU

1. Launch a real LLM and record idle VRAM/RAM, actual context, offload, and streaming stability.
2. Generate 20 turns, measuring cold/warm TTFT, p50/p95, tokens/s when counted, and peak GPU/system memory.
3. Produce five sequential illustrations at 768 and 1024 pixels, recording OOM, latency, and cache behavior.
4. Synthesize three manual speech segments and assess memory use and pronunciation.
5. Keep narration reliable while an image request is queued; detect duplicated/corrupt turns.
6. Run a 30-minute interactive session looking for leaks and cancellation recovery.
7. Repeat in Colab only when a real GPU is allocated; record SKU, driver, and environment.

## Measurement template

| Date | GPU | Profile | LLM GGUF + hash | Context | Image/workflow | TTS | Peak VRAM MiB | Peak RAM MiB | Tokens/s | Image time | Speech time | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pending | — | `minimum_12gb` | — | — | — | — | — | — | — | — | — | Not measured |

Never fabricate results. Record driver, CUDA/PyTorch, quantization, inference arguments, GPU layers, batch, context, and offload settings.

## App-first device configuration

Users should eventually select **CPU/GPU/Auto** independently for narration, image, and speech, **only when the chosen runtime supports that option**. GGUF runtimes may expose layers, context, batch, and KV parameters. ComfyUI memory depends on its specific graph and checkpoint; speech device support varies by engine.

The app should start with lightweight hardware discovery rather than running a mandatory GPU benchmark. Model Hub may show both an estimated standalone VRAM/RAM requirement and a projected session headroom with the narrator active. Neither is a benchmark until real measurements are attached. Unsupported controls must report `unsupported` rather than pretending to apply.
