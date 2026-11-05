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

**Scope:** Current downloader supports **single-file GGUF narrators** only. Search for image and TTS models remains discovery-only until their installer manifests and runtime compatibility are implemented. Sharded GGUF and multipart repositories are not misleadingly labeled installed.

Adapted with MIT attribution from Urakatsu; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Tests and known limitations

`tests/test_model_hardware_fit.py` tests synthetic GGUF header fields, 16GiB GPU and CPU fallback, API detail, and unknown file safety. These are analytical unit tests, not empirical performance measurements. GPU tests with actual checkpoint/driver belong to the later batch benchmark notebook.

## Comparación visual de cuantizaciones

La ficha de un GGUF muestra una medición de VRAM libre observada y demanda de memoria estimada. La persona puede elegir 2K–32K tokens y filtrar variantes: Todas / GPU / GPU + RAM / CPU. La cuantización recomendada es una sugerencia calculada por memoria, no una prueba empírica.

La barra de comparación distingue presupuesto de GPU, memoria combinada o RAM según el tipo de ejecución. El resultado no predice velocidad ni descarga modelos para comprobarlos. Imágenes y TTS siguen en modalidad de catálogo hasta incorporar instaladores compatibles por motor.
