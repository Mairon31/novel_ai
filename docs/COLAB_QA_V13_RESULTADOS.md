# Noble AI — real Google Colab QA, v1.3

**Log date:** November 5, 2026 UTC (November 4 in Costa Rica).  
**Evidence:** v1.3 diagnostic ZIP provided by the user.  
**Tested commit:** `2d1d40d1c3db80a7291397f8a66049dadbd2b02e`.  
**Privacy:** the original archive and private story data are not committed.

## Results

Elapsed time: **178.7 seconds (2 minutes 59 seconds)**. Summary: **13 PASS, 1 FAIL, 1 SKIP**.

| Stage | Result | Evidence |
|---|---|---|
| Repository checkout | PASS | 2 seconds |
| Python installation | PASS | 4 seconds |
| Python tests | PASS | 37 tests, 5.280 seconds |
| Frontend dependencies | PASS | 16 seconds; `npm ci` issue corrected |
| React/Vite build | PASS | 12 seconds; 1,586 modules transformed |
| FastAPI and compiled web UI | PASS | Health check and HTML page returned |
| Playwright Chromium installation | PASS | 58 seconds |
| Desktop/mobile browser tests | PASS | 8/8 tests, 25.3 seconds |
| Official llama.cpp CUDA 12.8 binaries | PASS | 44 seconds; both SHA-256 values verified |
| Dynamic library resolution | PASS | No missing libraries reported by `ldd` |
| Hugging Face package | PASS | 2 seconds |
| GGUF download | **FAIL** | HTTP 404 for the requested file |
| GPU benchmark | SKIP | Model never downloaded |

Hardware: **NVIDIA Tesla T4, 15,360 MiB VRAM**, **Python 3.13.16**, approximately **112.54 GiB** initial free disk. No TTFT, tokens/s, or inference VRAM use was measured because the model was never loaded. Browser screenshots show a working development UI with **mocked** narrative responses.

## Root cause of the failure

The notebook requested a nonexistent filename:

```text
Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

The real file in `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF` is:

```text
Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

The missing `Qwen_` prefix caused the 404. This result does **not** establish CUDA, VRAM, or download-speed failure. [Hugging Face file listing](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/tree/main).

## Fixes in v1.4

- Published [Colab QA notebook v1.4](../notebooks/noble_ai_colab_qa_integral_v1_4.ipynb).
- Resolve and verify the GGUF filename against the live repository catalog before downloading.
- Accept a uniquely matched alternative only if its quantization matches **exactly**; reject missing or ambiguous candidates.
- Pin the Hugging Face revision SHA and record the resulting GGUF SHA-256.
- Test exact names, prefix variants, missing quantization, and ambiguity offline.
- Corrected an older Colab worker notebook that requested the same missing filename.
- Export to a new `/content/noble_qa_v14/` workspace and `Noble_AI_Colab_QA_v1_4.zip`.

## Pending tests

Run v1.4 with a real Colab GPU and verify the download, llama-server launch, and FastAPI-to-LLM requests. Record GPU usage during inference, full SSE turn completion and persistence, TTFT, error rate, and repeated warm runs. Image/TTS/combined-resource benchmarks remain separate tasks.

An offline GitHub Actions run cannot substitute for actual remote GPU evidence.
