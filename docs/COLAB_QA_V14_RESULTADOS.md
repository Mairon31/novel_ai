# Noble AI — first successful Colab GPU inference, QA v1.4

**Evidence:** user-provided `Noble_AI_Colab_QA_v1_4.zip`.  
**Test date:** November 4, 2026 (Costa Rica) / November 5, 2026 UTC.  
**Tested commit:** `191a71ec428b23effaafec108f675976317f97e4`.  
**Method:** `notebooks/noble_ai_colab_qa_integral_v1_4.ipynb` with Colab GPU, local FastAPI, and CUDA llama.cpp server.  
**Elapsed time:** **279.4 seconds (4 minutes 39 seconds)**.

## Summary

The submitted `report.json` reports **20 PASS, 0 FAIL, 0 SKIP**. Its embedded `version: "1.3"` is inherited metadata despite the v1.4 notebook, output directory, and ZIP name; it does not indicate a different executed test.

| Check | Result |
|---|---|
| Dependencies and 42 Python tests | PASS |
| React/Vite frontend | PASS |
| FastAPI and compiled UI | PASS |
| Playwright desktop/mobile | PASS, 8 tests using **mocked LLM** |
| Official llama.cpp b12119 / CUDA 12.8 binaries | PASS, pinned SHA-256 |
| `ldd` libraries | PASS |
| Hugging Face catalog and GGUF | PASS, revision and filename recorded |
| LLM launch and narrative API | PASS |
| Three story generations with real model | **PASS, 3/3** |
| Automatic image generation and TTS | **NOT TESTED / not implemented in this test** |

## Hardware and model

- GPU: **NVIDIA Tesla T4**, **15,360 MiB VRAM** (15 GiB).
- Python: **3.13.16**.
- GGUF: **Qwen3-4B-Instruct-2507 Q4_K_M**, from `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF`.
- Hugging Face revision: `ae44f08e1392f39c0e474af10c3ff8355c8b6688`.
- File: `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf`.
- File size: **2,381.59 MiB** (approximately 2.33 GiB).
- SHA-256: `2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e`.
- Sampled maximum VRAM: **3,161 MiB** (20.58% of the GPU's capacity).
- Sampled maximum GPU utilization: **96%**.
- No reliable tokens-per-second result: the stream did not expose token counts.

## Narrative API performance

| Turn | Result | Time to first content (TTFT) | Total time | Characters |
|---|---|---:|---:|---:|
| 1 | PASS | 51,255.2 ms | 53,528.8 ms | 490 |
| 2 | PASS | 159.0 ms | 2,431.2 ms | 547 |
| 3 | PASS | 146.1 ms | 2,430.7 ms | 560 |

The first response had substantial **cold-start** latency (possibly engine initialization, which cannot be isolated without the engine's raw logs). Subsequent warm turns finished in approximately 2.43 seconds with 146–159 ms TTFT. A percentile computed from all three observations would mix cold and warm behavior and should not be presented as typical warm performance.

The model appeared through `/v1/models` around **54 seconds** after process start according to notebook stage timestamps. This reflects startup experience, not an isolated measurement of the first CUDA kernel.

## UI and evidence boundaries

The archive includes desktop/mobile screenshots and Playwright traces for Model Hub, catalog, reader, workers, and diagnostics. These are real UI tests with **simulated narrative output** and a fallback illustration. Separately, the physical GPU experiment validated the FastAPI → llama.cpp narrative path for three completed turns.

The raw generated passages were not exported, so literary quality, canon consistency, or Latin American Spanish fidelity **cannot be audited** from the report. This was not a Cloudflare-tunneled remote-worker test, and it does not establish behavior on a user's Windows GPU.

## Conclusions and next gates

Achieved: a first reproducible GGUF 4B inference experiment on Colab T4 with real API streaming and concrete measurements. Still open: separate cold/warm sampling, actual token counters, long-form narrative quality, 12/16 GB desktop hardware tests, remote worker deployment, ComfyUI renders, TTS audio, and Windows packaging.

Product recommendations from the evidence:

1. Display **Preparing model** or similar status before the first generation.
2. Measure cold and warm TTFT independently.
3. Compare quantizations and context windows, but do not infer 24B compatibility from a 4B model's VRAM results.
4. Run a dedicated consistency/literary-quality benchmark rather than treating performance logs as story evaluation.
5. Keep the local-first application as the primary product; Colab remains an optional laboratory.

**Private source artifacts:** `report.json`, `RESUMEN.md`, `modelo.json`, `logs/browser_tests.log`, and images from the diagnostic ZIP. Raw private story text and complete logs were not uploaded to the repository.
