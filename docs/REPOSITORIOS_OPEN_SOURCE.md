# Noble AI — open-source projects and reusable tools

**Research snapshot:** November 4, 2026. Sources are official where possible. This is an **inventory, not automatic integration**, and reported compatibility remains a hypothesis until independently tested. License descriptions must be checked against each exact upstream revision.

## 1. Comparison matrix

| Project | Source | Observed license | Relevant features | Proposed use | Research state |
|---|---|---|---|---|---|
| **Urakatsu** | [GitHub](https://github.com/karrot0/Urakatsu) | MIT `LICENSE`; Koharu notice | HF catalog, GPU fit, resumable installs, React UI, launcher | High-priority Model Hub reference/reuse | Inspected; master/detail and session cache adapted with notices |
| **Koharu** | [GitHub](https://github.com/koharu-rs/koharu) | MIT OR Apache-2.0 | Provider settings, downloads, Rust runtime, Tauri | UX and optional code reuse | Source/docs inspected; direct integration pending |
| **Open Dungeon** | [GitHub](https://github.com/newideas99/open-dungeon) | MIT | Local story loops, streaming, continue/retry/edit, images, SQLite | VN/gameplay reference or compatible UI parts | README reviewed; integration pending |
| **Talemate** | [GitHub](https://github.com/vegu-ai/talemate) | AGPL-3.0 | Agents, memory, world state, images, TTS | Evaluate architecture or standalone app | Research only |
| **Gamentic** | [GitHub](https://github.com/hec-ovi/gamentic) | MIT | Python/FastAPI/SQLite narrator and NPC agents | Orchestration reference | NVIDIA support not verified |
| **TaleWeaver** | [GitHub](https://github.com/TaleWeaverAdmin/TaleWeaver) | Restrictive noncommercial terms | VN scenes, sprites, expressions, ComfyUI | Study under restrictions; **do not bundle without permission** | Research only |
| **SillyTavern** | [GitHub](https://github.com/SillyTavern/SillyTavern) | AGPL-3.0 | Lorebooks, VN mode, plugins, images/speech | UX and prompt reference | Research only |
| **RisuAI** | [GitHub](https://github.com/kwaroran/Risuai) | GPL-3.0 | Expressions, multi-character chats | Character and UI reference | Research only |
| **KoboldCpp** | [GitHub](https://github.com/LostRuins/koboldcpp) | AGPL-3.0 | GGUF, CUDA/offload, streaming `/v1` | Recommended external LLM runtime | API documented; hardware checks required |
| **Ollama** | [GitHub](https://github.com/ollama/ollama) | MIT | Local inference, model management | Alternate LLM runtime | Integration exists; verify physical performance |
| **llama.cpp** | [GitHub](https://github.com/ggml-org/llama.cpp) | MIT | GGUF inference, batching, offload | Low-level runtime where needed | Colab QA experiments exist |
| **ComfyUI** | [GitHub](https://github.com/Comfy-Org/ComfyUI) | GPL-3.0 | Image graphs, HTTP/WebSocket | External image provider | Managed connection/start for existing installation; automatic installer pending |
| **ComfyUI examples** | [GitHub](https://github.com/comfyanonymous/ComfyUI_examples) | Check each asset | SDXL, LoRA, inpainting/control examples | Workflow references, not unreviewed asset redistribution | Resource |
| **Chatterbox** | [GitHub](https://github.com/resemble-ai/chatterbox) | MIT source; weights separately | Multilingual TTS and regional voices | Planned optional speech adapter | Research only; Piper is implemented |
| **Qwen3-TTS** | [GitHub](https://github.com/QwenLM/Qwen3-TTS) | Apache-2.0 source; weights separately | Expressive speech/voice design | Planned alternate adapter | Research only |

**Licensing:** code, model checkpoints, LoRAs, voices, images, and other assets can have different terms. Retain copyright and permission text, identify commit and adapted paths, and review distribution/hosting obligations. Running an external service is not a universal exemption from license conditions.

**App-first priority:** Urakatsu/Koharu are principal Model Hub/settings references; Open Dungeon remains a VN gameplay reference. See [upstream reuse analysis](REFERENCIAS_URAKATSU_KOHARU.md) and [Model Hub](MODEL_HUB.md).

## 2. Practical evaluation order

1. **Open Dungeon:** useful VN and story-loop reference in MIT-licensed Next.js/TypeScript. Compare (A) running its intact demo and (B) adapting individually licensed UI components; do not assume its database/state schema fits Noble AI.
2. **KoboldCpp:** well suited for Windows/RTX GGUF experiments. Its OpenAI-compatible API is generally exposed at `http://127.0.0.1:5001/v1`. Compare with Ollama using the **same** model and settings. Treat its AGPL requirements carefully and keep it an external runtime in this phase.
3. **ComfyUI:** flexible graph engine for anime generation. Need real scene scheduling, identity control, and GPU evidence. Relevant endpoints: `POST /prompt`, `GET /history/{id}`, `GET /view`, `/ws`. Keep process/distribution boundaries explicit.
4. **Chatterbox:** candidate multilingual speech including [Latin American Spanish variant](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam). Measure latency, VRAM, pronunciation, and per-model licensing before integration.
5. **Talemate:** strong conceptual agent/memory system, but AGPL and internal API coupling require explicit evaluation before importing code.
6. **Gamentic:** Python/FastAPI/SQLite inspiration; an AMD-focused reference environment does not prove NVIDIA support.
7. **TaleWeaver:** relevant VN patterns but restrictive noncommercial conditions; do not incorporate redistributable code without compatible permission.

## 3. Candidate test models (weights not bundled)

| Role | Candidate | Source | Verification |
|---|---|---|---|
| Narration, 12 GB | Qwen3-8B GGUF Q4_K_M/Q5_K_M | [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) | Proposed; verify exact GGUF uploader, license, and artifacts |
| Narration, 16 GB | Qwen3-8B larger quantization; Qwen3-14B Q4 as experiment | [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) | Physical benchmark pending |
| Anime illustration | ComfyUI-compatible SDXL/Illustrious checkpoint | [SDXL base](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | Verify chosen checkpoint/LoRA license |
| Latin American Spanish TTS | Chatterbox regional variant | [Hugging Face](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam) | Benchmark pending |
| Alternate speech | Qwen3-TTS | [GitHub](https://github.com/QwenLM/Qwen3-TTS) | Benchmark pending |

Total VRAM cannot be inferred from checkpoint quantization alone. Context, KV cache, batch, driver, CUDA backend, offload, and desktop overhead all matter.

## 4. Required provider checklist

- [ ] Record upstream URL, exact commit, and research date.
- [ ] Review code **and model** licenses.
- [ ] Verify real capabilities and endpoints.
- [ ] Test Windows setup, record installation failures.
- [ ] Test Colab where practical without bypassing platform limits.
- [ ] Measure latency, throughput, peak RAM/VRAM, and GPU identity.
- [ ] Verify streaming, retries, and cancellation when supported.
- [ ] Add automated API/compatibility contract tests.
- [ ] Record an ADR whenever a provider decision changes.

## 5. Comparative experiments

- **SPIKE-001:** Open Dungeon demo vs Noble design: VN UX, modularity, MIT reuse, integration effort.
- **SPIKE-002:** KoboldCpp vs Ollama with identical GGUF, context, prompt and settings: startup, TTFT, tokens/s, memory, OOM.
- **SPIKE-003:** simple ComfyUI SDXL: scene-triggered render, asset hash, gallery reuse.
- **SPIKE-004:** Chatterbox in Latin American Spanish: 3-character dialogue, speech latency, subjective pronunciation rating, cache hit, GPU.
- **SPIKE-005:** 12/16 GB stress with LLM, pending illustration and speech requests: measure actual scheduler behavior.

Record each experiment in [Progress](PROGRESO.md) with honest evidence and hardware versions.

## 6. Official technical references

- [KoboldCpp API](https://github.com/LostRuins/koboldcpp#apis-and-integrations), [API docs](https://lite.koboldai.net/koboldcpp_api)
- [ComfyUI HTTP/WS](https://docs.comfy.org/development/comfyui-server/comms_routes), [WebSocket example](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py)
- [Talemate](https://github.com/vegu-ai/talemate/blob/main/README.md)
- [Open Dungeon](https://github.com/newideas99/open-dungeon/blob/main/README.md)
- [Chatterbox](https://github.com/resemble-ai/chatterbox)
- [Colab usage FAQ](https://research.google.com/colaboratory/faq.html)

Before adoption, pin upstream revisions, review dependency security, and avoid blindly vendoring entire repositories.

## 7. App-first integration sequence

Research priority: **Urakatsu** catalog/fit/downloads → **Koharu** settings/desktop packaging → **Open Dungeon** VN patterns → **KoboldCpp** narration → **ComfyUI** illustration → **Chatterbox** optional speech. This is a dependency/research ordering, not a statement that no modules have since been implemented. See [ADR-0002](adr/0002-app-first-model-hub.md) and the current [TODO](../TODO.md).

Urakatsu publishes an MIT `LICENSE` even where some API metadata is inconclusive; Koharu uses MIT OR Apache-2.0. Document concrete imports and copyright notices in [Third-party notices](THIRD_PARTY_NOTICES.md).
