# ADR-0001 — Assemble existing engines behind a Noble AI orchestrator

**Date:** 2026-11-04  
**Status:** partially superseded by [ADR-0002](0002-app-first-model-hub.md) for product priorities and first-run UX. Keep the adapter/engine selection as an architectural decision; Colab is no longer the mandatory entry point.

## Context

Noble AI aims to provide persistent interactive stories, progressive anime-style illustration, optional speech, responsive desktop/mobile UI, and local inference on available hardware. Reimplementing LLM inference, diffusion, or speech synthesis would add unnecessary complexity. Copying an entire AGPL application into an independently licensed project would also require a separate licensing review.

The original research proposed Colab-first testing and a 12 GB NVIDIA minimum target; later decisions prioritize an app-first workflow. Hardware targets are not performance guarantees.

## Decision

- **Frontend:** React + Vite + TypeScript, with a dedicated visual-novel experience informed by relevant open-source UX patterns.
- **Backend/orchestration:** Python FastAPI, typed models, migrations, and SQLite, chosen for portability and access to existing ML tools.
- **LLM adapters:** KoboldCpp for GGUF and streaming/OpenAI-compatible APIs, with Ollama and other providers as supported alternatives.
- **Image adapter:** ComfyUI over local HTTP and validated saved workflows, rather than embedding the entire diffusion engine.
- **Speech candidates:** Chatterbox Multilingual and Qwen3-TTS were initial research targets; the first implemented opt-in CPU adapter is Piper. Other providers require individual integration.
- **Research sources:** evaluate MIT-licensed Open Dungeon patterns; assess Talemate (AGPL-3.0) separately instead of copying its code without satisfying license obligations.
- **Resources:** narrate first, schedule images/speech on demand, and measure the real memory budget before concurrent GPU use.

## Alternatives considered

1. Forking **Talemate**: useful narrative memory concepts, but higher adaptation and licensing cost.
2. Forking **Open Dungeon**: permissive license but a different Next.js/Node stack; a focused UX adaptation may be cheaper.
3. Using **SillyTavern** as the final UI: capable, but chat-centric and subject to its own licensing obligations.
4. Using **Ollama only**: simpler initially, but less explicit control over particular GGUF and runtime policies.
5. Loading LLM, diffusion, and TTS into one monolith: unsuitable for modest VRAM targets without robust resource scheduling.

## Consequences

Benefits: provider independence, incremental integration, reusable assets, and separately testable narrative/image/speech systems. Costs: orchestrating multiple processes, contracts, telemetry, permissions, upgrades, and licenses. Noble AI still needs substantial original logic for world state, branches, memory, planning, and resource management.

## Evidence required

- Evaluate reusable VN controls and compliance with upstream licenses.
- Measure real KoboldCpp streaming, cancellation, and 12/16 GB behavior.
- Validate ComfyUI model inventory, job flow, and character-consistency behavior.
- Assess real speech pronunciation, latency, and VRAM use for target languages.
- Run reproducible Colab experiments when resources are assigned, without making Colab the required UI.

Update this ADR or add a successor when major stack decisions change.
