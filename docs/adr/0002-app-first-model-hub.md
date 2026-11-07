# ADR-0002 — App-first product, integrated Model Hub, and user-selected providers

**Date:** 2026-11-04  
**Status:** accepted as the product direction. Supersedes the Colab-first priority in [ADR-0001](0001-stack-modular.md).

## Context

The initial concept treated Colab as the main testing interface. The actual product goal is a local web application that can later become a Windows executable, offering in-app setup, model lookup/download/installation, provider selection, and runtime settings. Users should not need to run notebook cells or manually download weights before opening the application.

Research sources at the time:
- Urakatsu (MIT), revision `fed313c70cf11afdba85ae2314c1a4a5b21f6bf7`: model catalog, downloads, and runtime management.
- Koharu (MIT/Apache-2.0 components), revision `cd31ad2c7016b64d0ff0400a09e86cd13fb5df13`: provider settings, downloads, and desktop-shell patterns.

## Decision

1. **APP-FIRST:** React/Vite/TypeScript UI and FastAPI backend, with an integrated setup flow and Model Hub. Colab becomes an **optional test/benchmark environment**.
2. Keep **model roles** (narration/image/speech), providers, installed files, devices, profiles, and settings as distinct concepts.
3. Support Hugging Face discovery with metadata/licenses/quantizations, cautious fit estimates, resumable verified downloads, durable records, and offline reuse when available.
4. Enable local and remote providers only when adapters actually support the requested features. Do not display misleading controls.
5. Start light: load a selected LLM when needed for play, images only on request or eligible scene changes, and audio only with explicit user action or preference.
6. Consider **Tauri 2** for future desktop packaging, with FastAPI as a sidecar and other engines as managed/external processes. Preserve local browser mode.
7. Support role presets, per-story overrides, narrative-first priorities, and real measurements on 12/16 GB GPU profiles.
8. Reuse compatible upstream modules with required attribution and license review, not on the assumption that all reference code can be copied unchanged.

## Trade-offs

Advantages: a coherent user workflow, easier provider evolution, guided model management, and a clearer path to desktop distribution.

Costs: download validation, process supervision, settings persistence, hardware assessment, and more complicated UX. Reduce unnecessary scope by reusing suitable libraries such as `huggingface_hub`, not by implementing a new ML framework.

## Implications

Prioritize a real setup and model catalog, then persistent narrative play, then image and optional speech enhancements. Preserve the early Colab notebook as an optional diagnostic artifact. Keep README, design documents, roadmap, and engineering guidance aligned.

## Acceptance evidence

Documentation alone is insufficient. Verify real Hugging Face lookup, installation of a small supported GGUF, provider start/assignment, settings persistence, and at least one playable narrative turn without requiring the end user to run Colab or the terminal.

Related issues: [#9](https://github.com/Mairon31/novel_ai/issues/9), [#10](https://github.com/Mairon31/novel_ai/issues/10), [#11](https://github.com/Mairon31/novel_ai/issues/11), [#12](https://github.com/Mairon31/novel_ai/issues/12).
