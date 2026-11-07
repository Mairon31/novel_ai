# Noble AI — Model Hub: quantization and hardware analysis

Noble AI queries Hugging Face and presents results, model metadata and GGUF files. It does **not** silently execute third-party model code, install a runtime or start inference when a repository is opened.

## Detailed model view

- Repository, author, pipeline, library, tags, base model, downloads, likes, license, SHA revision, access classification.
- Single-file GGUF variants with filename, size, optional announced SHA-256, and current installer support.
- Preferred variant for the local machine (when memory is known), per-variant estimated memory/fit, disk capacity and reason.
- Selectable context of 2K, 4K, 8K, 16K, 32K tokens, which recalculates KV demand.

## Hardware recommendation algorithm

1. Read detected NVIDIA GPU total and **current free** VRAM, available RAM and free disk. No fabricated GPU if `nvidia-smi` is missing.
2. Probe **at most 512 KiB** of a single supported GGUF variant through a pinned-revision HTTP Range request. Never download a multi-GiB GGUF just to open its detail page.
3. Parse supported GGUF header fields without loading tensors: architecture, parameter count, layers, KV heads, head dimensions. Use them to estimate fp16 KV-cache size for the selected context. If unavailable, fall back to a cautious synthetic reserve and explicitly label it.
4. Estimate `weights + compute overhead + KV context`; leave headroom for desktop/driver and the runtime.
5. Rank fully GPU-fit variants before partial offload, then CPU; within a tier prefer a larger quantized variant before F16/BF16 if quality/size permits. Warn for insufficient disk.
6. Never claim that model will *definitely* load or run at a particular speed. Multimodal projectors, exotic architectures, offload layer policies, KV quantization and external GPU use can invalidate an estimate.

### Classifications

| Fit label | Meaning |
|---|---|
| `full_gpu` | Estimated memory fits measured free VRAM after overhead |
| `partial_offload` | Estimated combination of free GPU memory and RAM; slower, runtime-dependent |
| `cpu` | Estimated RAM-only execution |
| `too_large` | Memory likely insufficient |
| `unsupported` | The current Noble installer cannot handle this file |
| `unknown` | Not enough information (e.g. missing file size) |

**Scope:** Current downloader supports **single-file GGUF narrators** only. Image checkpoints now have a **separate, limited installer** in Images settings; speech has a separate Piper voice installer. Generic image/TTS search in the GGUF Model Hub does not imply installation or runtime compatibility. Sharded GGUF and multipart repositories are not misleadingly labeled installed.

Adapted with MIT attribution from Urakatsu; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Tests and known limitations

`tests/test_model_hardware_fit.py` tests synthetic GGUF header fields, 16GiB GPU and CPU fallback, API detail, and unknown file safety. These are analytical unit tests, not empirical performance measurements. GPU tests with actual checkpoint/driver belong to the later batch benchmark notebook.

## Visual comparison of quantizations

The GGUF details page distinguishes **observed free VRAM** from **estimated memory requirements**. Users can select a 2K–32K context and filter models by All / GPU / GPU + RAM / CPU. A recommended quantization is a memory-based estimate, not a measured benchmark.

Comparison bars describe the GPU, combined GPU+RAM, or RAM-only budget according to expected execution mode. They cannot predict speed or prove checkpoint compatibility. Image models and TTS engines have independent installation and runtime contracts.

## Full upstream model cards

The **Read full model card** action requests the exact-revision Hugging Face `README.md` on demand. Noble AI displays at most 128 KiB as plain text without rendering arbitrary embedded HTML or running repository code. Users can close the card while retaining model and quantization selections.

API: `GET /api/v1/model-cards/{namespace}/{model}?revision={sha40}`. The server validates identifiers and revision hashes, restricts upstream hosts to Hugging Face, and bounds network reads and responses. A missing README returns `available:false`; gated or private repositories return the applicable access error.

Accessibility metadata also includes estimated weight and KV-cache memory and approximate GPU/offload fractions, adapted from Urakatsu's `FitCell` concept (MIT). It does not claim measured CUDA compatibility or tokens/s.

## Registered local model storage

The **Installed** tab shows a real disk-space inventory inspired by Urakatsu `ModelsStorage.tsx` and `UsageBar`, implemented using Noble AI's SQLite and managed model paths.

- `GET /api/v1/models/storage` uses `shutil.disk_usage` to obtain total, used, and free capacity from the model volume.
- Count the **actual bytes** of registered model files that reside inside the managed storage root. External paths and symbolic links are not counted as owned storage.
- Include incomplete jobs only through their existing `.part` bytes; do not claim they are installed.
- Mark missing registered files as unavailable, and prevent selecting them as active narrators.
- Allow inspection of registered sizes without silently moving or deleting files.

The disk inventory does not attempt to measure all unregistered content or model peak VRAM; it is independent of GGUF fit estimates.

## Desktop master/detail and mobile modal

On desktop, a model detail inspector opens alongside the interactive model list. On mobile, it opens in a modal. Searches and recent model-card results are temporarily cached for the current session, adapting the Urakatsu MIT `recentSearches` and `recentDetails` pattern. Hardware-fit cache TTL is short because free VRAM can change.

Automated checks cover inspector opening, variant recommendations and filters, caching, full cards, storage inventory, external-path rejection, and mobile controls.

## Argon audit — Model Hub V2 and resources (2026-11-05)

Verified on the referenced `master`: Hugging Face catalog, single-file GGUF detail pages, local estimator, resumable `.part` jobs, revision pinning, SHA-256 verification **only when a trusted hash is published**, disk inventory, and `nvidia-smi` monitoring. Estimated fit is not measured speed, and it is not a guarantee of co-residency with ComfyUI.

**Ordered remaining work** (see [TODO](../TODO.md)):

1. Validate real paths at every download/copy/delete operation. Test symlinks, deceptive names, invalid Range responses, and checksum errors.
2. Extend quantization comparisons (Q4/Q5/Q6/Q8/IQ) with actual file sizes, estimated weights and 8k/16k KV cache, headroom, and explicit **Optimal / Hybrid / Not feasible** categories and uncertainty.
3. Separate narrator/image/voice roles and offer capability-grounded VRAM policy modes (**Exclusive / Shared / Sequential**). The existing `asyncio.Lock` serializes recognized requests, but cannot unload external runtime weights.
4. Expand the technical detail page and visible download queue with throughput, precise progress, pause/resume, and actionable diagnostics for desktop/mobile.
5. Run actual LLM + ComfyUI transition benchmarks on 16 GB GPUs and on lower-capacity fallback hardware. Never present inferred tokens/s as experimental measurements.

For copied/adapted Urakatsu interface/code under MIT, document the exact files, upstream revision, and license in [Third-party notices](THIRD_PARTY_NOTICES.md). See the [audit](ARGON_AUDITORIA.md) and [GPU policy](RECURSOS_GPU.md).

## SHA verification and cancellation integrity (2026-11-05)

- The download manager uses **conditional SQLite state transitions**. A late pause/cancel must not overwrite `completed` based on an outdated snapshot. Pause and cancel also work during `verifying`, with periodic checks during hashing.
- When `.part` already has the full expected size, resume proceeds to SHA verification without an EOF Range request that might return HTTP 416. With unknown remote length, HTTP 416 is accepted only when `Content-Range: bytes */N` confirms the exact partial size.
- After hash validation, the file and database registration are published using an SQLite `BEGIN IMMEDIATE` section and a compensating rename when possible. Power loss between file operations and database commit is handled by a targeted startup reconciliation, **not a universal solution to physical disk corruption**.
- `sha256_verified` requires a published upstream SHA-256. `local_hash_only` is not cryptographic proof of authenticity.
- `tests/test_api_model_hub.py` exercises cancellation during `hashlib.update`, resume without a redundant GET, and simulated registration failure. [CI #42052817678](https://github.com/Mairon31/novel_ai/actions/runs/42052817678) reported 121 Python tests passing.

## Crash recovery between file publication and registration (2026-11-05)

On startup, `DownloadManager` inspects persisted `paused`/`failed` jobs without automatically downloading. If it finds a final GGUF that is not registered and no `.part`, it can move that file back to a partial state under a write transaction, retain the byte count, and require explicit resume and SHA validation. **An existing final file alone never proves installation.**

If a final GGUF and `.part` both exist, a path points outside the managed root, or a model is already marked installed, the manager leaves the files untouched and records a conflict. Retry cannot overwrite an existing final file. `recovery_report` counts `recovered/conflicts/skipped`; per-job details remain in `downloads.error`.

`tests/test_download_recovery.py` covers real local files and SQLite without network transport. [CI #42062222624](https://github.com/Mairon31/novel_ai/actions/runs/42062222624) reported 127 Python tests passing. Remaining: recovery when `expected_size` is absent, actual power-loss experiments, and adversarial concurrent path replacements.

## Robust resume for unknown-size GGUF downloads (2026-11-05)

When Hugging Face omits `size_bytes`, a completed partial file may trigger `Range: bytes=N-` and HTTP 416 with `Content-Range: bytes */N`. Noble AI compares both N values before continuing directly to SHA verification; otherwise it retains the partial and marks the job failed.

HTTP 206 must contain exactly the required remaining bytes and advertised length. HTTP 200 is checked against `Content-Length` when present. HTTP 204, compressed responses, false GGUF headers, and invalid byte counts are rejected. Without upstream SHA-256, use `local_hash_only`.

`tests/test_unknown_size_resume.py` covers correct and malformed HTTP headers, truncated responses, invalid GGUF headers, deceptive HTTP 416, and incorrect hashes. [CI #42068338409](https://github.com/Mairon31/novel_ai/actions/runs/42068338409) reported 142 Python and 28 Playwright tests passing. These were offline tests, not a real multi-GB CDN download.
