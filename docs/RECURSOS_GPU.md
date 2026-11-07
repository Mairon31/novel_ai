# Noble AI — GPU resource policies

Noble AI distinguishes **observed free VRAM** from **estimated model consumption**. `nvidia-smi` can provide the first metric; the second depends on model weights, quantization, context, kernels, batch, and concurrent jobs, and cannot be derived reliably from one VRAM sample.

## Resource monitor and admission guard

`GET /api/v1/resources/status` returns total/used/free memory, observed utilization for detected NVIDIA GPUs, and the configured policy. It neither loads a model nor runs a benchmark.

The policy persists in `data/noble.sqlite`:

- `mode=monitor` (default): observe and report, without blocking new requests.
- `mode=guard`: before a **new** ComfyUI request, compare observed free VRAM on the chosen GPU with `minimum_free_mib`; return HTTP 409 if there is insufficient headroom.
- `allow_low_vram=true` on an explicit request allows a one-time exception without changing the global policy.
- If the configured GPU is unavailable or `nvidia-smi` is missing, report `unknown` rather than assuming CUDA availability. CPU or other-device inference need not be blocked solely for this reason.

These controls do **not** stop KoboldCpp, Ollama, ComfyUI, or third-party programs, and they do not guarantee checkpoint compatibility or adjust CUDA allocations.

## Test coverage

`tests/test_resource_policy.py` simulates `nvidia-smi` responses, absent GPUs, and free-memory states. It verifies monitoring, admission rejection, one-time overrides, and persistence after API restart. It is not a physical GPU benchmark.

## Local GPU operation coordination

The API also provides an optional local exclusion policy, `serialize_local_gpu`, enabled by default. It covers operations Noble AI knows may compete for local GPU resources: local Ollama/KoboldCpp narration in auto mode, managed local warmup, and new ComfyUI render requests. Returning an already cached image does not reserve the GPU.

`GET /api/v1/resources/active` reports an active locally managed operation, its type, and start time. With serialization enabled, a competing operation returns HTTP 409; narrative SSE can emit a readable error event. Locks are released in `finally` after normal completion, errors, or client cancellation. The user can disable serialization where providers operate on different devices.

**Limit:** this is admission control for **requests that Noble AI manages**, not a physical memory scheduler. It does not unload tensor weights, restart inference engines, move checkpoints, or prevent other applications from consuming VRAM. Remote workers and CPU Piper are outside the local lock.

## Open Argon audit gaps (AUD-002)

Noble AI already observes `nvidia-smi`, maintains a configurable VRAM reserve, and uses an `asyncio.Lock` for recognized local GPU operations. It does **not** automatically unload unrelated Ollama/llama.cpp models or prove that two heavyweight providers will coexist within a particular GPU's memory budget.

Pending: capacity-aware leases, explicit exclusive/shared/sequential modes, before/after memory measurements, model unloading only for owned processes with permission, safe OOM handling, and a cancelable queue. Run 20–25 LLM + SDXL cycles on a real 16 GB GPU and capture peak VRAM and actual transition times rather than extrapolated values.

See [TODO AUD-002](../TODO.md), [Argon audit](ARGON_AUDITORIA.md), and [Model Hub](MODEL_HUB.md).
