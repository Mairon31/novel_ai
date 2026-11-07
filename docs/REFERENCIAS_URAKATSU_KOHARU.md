# Noble AI — Urakatsu and Koharu reuse analysis

**Research date:** November 4, 2026. This document records source-inspected functions, potential reuse, and boundaries. Both upstream projects primarily support manga translation/editing. Noble AI should not import their manga OCR/cleanup pipelines merely to build an interactive novel.

## Inspected revisions

| Project | Commit inspected | License | Source |
|---|---|---|---|
| **Urakatsu** | `fed313c70cf11afdba85ae2314c1a4a5b21f6bf7` | MIT `LICENSE` with Koharu contributions notice | [Repository revision](https://github.com/karrot0/Urakatsu/tree/fed313c70cf11afdba85ae2314c1a4a5b21f6bf7) |
| **Koharu** | `cd31ad2c7016b64d0ff0400a09e86cd13fb5df13` | MIT OR Apache-2.0 | [Repository revision](https://github.com/koharu-rs/koharu/tree/cd31ad2c7016b64d0ff0400a09e86cd13fb5df13) |

GitHub metadata reported `NOASSERTION` for Urakatsu in the original audit, despite an MIT `LICENSE` file. Inspect the actual copyright/notice when using code. Model, asset, and dependency licensing remains separate.

## Urakatsu — inspected components

| File or module | Observed role | Potential Noble AI adaptation |
|---|---|---|
| `docs/models.md` | Hugging Face catalog, hardware-fit advice, installed models | Model Hub requirements |
| `web/src/components/ModelsPage.tsx` | Search, detail, variants, download/install/use | Model Hub interface pattern |
| `web/src/components/ModelsStorage.tsx` | Model storage usage | Local inventory UX |
| `web/src/api/catalog.ts` | Typed JSON for catalog, fit, downloads, models | Separate narrator/image/speech contracts |
| `urakatsu/catalog/hf.py` | HF search, caching, partial GGUF inspection | Discovery adapter |
| `urakatsu/catalog/fit.py` | Weights, KV cache, runtime overhead, offload | Hardware estimate with 12/16 GB calibration |
| `urakatsu/catalog/service.py` | Provider/runtime matching and quantizations | Capability-based provider dispatch |
| `urakatsu/catalog/installed.py` | Installed registry, revision and jobs | Download/installer service pattern |
| `urakatsu/service/catalog_api.py` | FastAPI catalog, pause/resume/cancel and runtime routes | API/error design inspiration |
| `urakatsu/runtimes/{hardware,packages,manager,models_folder}.py` | Hardware discovery, runtime lifecycle, storage | Cross-platform feasibility spike |
| `web/src/components/SettingsPage.tsx` | Per-provider/step settings | Advanced preferences |
| `packaging/launcher`, `docs/app.md` | Rust webview/launcher | Compare with Tauri 2, do not blindly copy |

Urakatsu describes `gpu/partial/offload/cpu/too_large` tiers. Noble AI also needs `unknown`, a hard distinction between **estimated** and **physically measured** fit, and contention policies for LLM/image/TTS.

The catalog distinguishes `llama`, `diffusion`, `torch`, and `onnx` runtimes. Noble AI must further distinguish **role** (narration/image/speech) and **engine** (KoboldCpp/Ollama/ComfyUI/Piper/future providers). Not every GGUF is a narrator; not every safetensors file is a compatible ComfyUI checkpoint.

## Koharu — inspected components

| File or module | Observed role | Noble AI application |
|---|---|---|
| `packages/koharu/components/preferences/ProviderPreferences.tsx` | Provider connections and specialized fields | Multiple endpoint/provider settings |
| `packages/koharu/components/preferences/SettingsPage.tsx` | Settings navigation | Separated settings panels |
| `packages/koharu/components/preferences/GenerationPreferences.tsx` | Generation parameters | Advanced narrator controls |
| `packages/docs/models/providers.mdx` | Local/hosted/OpenAI-compatible choices | Provider registry and privacy |
| `packages/docs/reference/settings.mdx` | Persisted settings and model changes | Profile validation |
| `crates/koharu-runtime/src/download.rs` | Progress, retries, downloads | Robust installation jobs |
| `crates/koharu-runtime/src/source/hugging_face.rs` | Pinned HF revisions | Download integrity |
| `crates/koharu/tauri.conf.json` | Cross-platform Tauri shell | Future desktop packaging |
| `packages/ui/src/components/` | UI components | Reuse only with license compliance |

Koharu's remote credentials are stored through a secure OS mechanism. Noble AI should likewise use the operating-system keyring and show clearly when story content leaves the computer.

## Actual reuse and attribution

The verified adaptation began with Urakatsu's MIT session-cache patterns in `apps/web/src/modelCatalogCache.ts`; additional Model Hub UI patterns were later adapted. Koharu source has **not** been imported as a direct implementation in the cited commits. For further reuse:

1. Record origin repository, exact commit, upstream path, new path, and modifications.
2. Preserve original copyright/license/NOTICE, including Koharu contributions where applicable.
3. Resolve compatibility with Noble AI's eventual license before distribution.
4. Isolate adapted integrations and test them; do not depend blindly on private imports from Urakatsu.
5. Review transitive dependencies, network calls, and installers.
6. Check authorship and redistribution rights for images, sprites, screenshots, and icons individually.

## Technical selection priorities

**Priority 1:** search → variants → hardware estimate → install/resume → register → assign role → start/test. Compare focused reuse of `catalog/hf.py`, `fit.py`, and `installed.py` with official `huggingface_hub` and an independently maintained API.

**Priority 2:** use Koharu settings/provider patterns as an architecture reference, while retaining a Noble-specific Reader, Studio, Library, and Model Hub.

**Priority 3:** compare Urakatsu's Rust webview launcher with a Tauri 2 + Python FastAPI sidecar; verify packaging, permissions, and Windows CI before choosing a final desktop shell.

MIT/Apache-2.0 may permit close UI/code adaptations when their terms are satisfied. Attribution is not a prohibition on reuse. Manga OCR or translation should only be added if directly useful to Noble AI's actual narrative product.

## Research spikes — pending

- [ ] **AUD-URAKATSU-001:** verify standalone HF discovery, license notices, and automated tests.
- [ ] **AUD-URAKATSU-002:** calibrate fit estimates on physical 12/16 GB hardware.
- [ ] **AUD-URAKATSU-003:** simulate interrupted downloads, resume, hash, installation, and import.
- [ ] **AUD-KOHARU-001:** map provider capability/parameter contracts to Noble AI roles.
- [ ] **AUD-KOHARU-002:** prototype Tauri + FastAPI on Windows and review permissions/WebView2.

## Direct references

- [Urakatsu models](https://github.com/karrot0/Urakatsu/blob/main/docs/models.md)
- [Urakatsu Hugging Face](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/catalog/hf.py)
- [Urakatsu fit](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/catalog/fit.py)
- [Urakatsu catalog API](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/service/catalog_api.py)
- [Urakatsu ModelsPage](https://github.com/karrot0/Urakatsu/blob/main/web/src/components/ModelsPage.tsx)
- [Koharu providers](https://github.com/koharu-rs/koharu/blob/main/packages/docs/models/providers.mdx)
- [Koharu downloader](https://github.com/koharu-rs/koharu/blob/main/crates/koharu-runtime/src/download.rs)
- [Koharu Tauri](https://github.com/koharu-rs/koharu/blob/main/crates/koharu/tauri.conf.json)

## Confirmed Model Hub reuse (November 5, 2026)

- Origin: `karrot0/Urakatsu`, `web/src/components/ModelsPage.tsx`, commit `165bf592716019b8487249bf7ca3ff3b708a23e7`, MIT.
- Adaptations: per-session search/model-detail caches, short TTL for VRAM-sensitive estimates, typed role/context data, persistent list + side inspector on desktop, modal inspector on mobile, with separate GGUF download and assignment actions.
- The full upstream MIT permission notice is in [Third-party notices](THIRD_PARTY_NOTICES.md), with modifications traceable through Git history.
- Later priorities include model folder/volume inventory, per-runtime installs, download progress, cleanup, and providers.

## Additional implemented adaptations (November 5, 2026)

- **Urakatsu MIT — ModelsPage:** persistent master/detail pattern, search/detail caching, `FitCell`-style memory/offload estimates and accessible explanations, adapted into `apps/web/src/App.tsx`, `modelCatalogCache.ts`, and `styles.css`.
- **Urakatsu MIT — upstream model-card display:** on-demand README retrieval with a pinned revision and a 128 KiB proxy cap, implemented in `apps/api/noble_api/catalog.py` and `main.py`, then displayed safely as text.
- **Koharu MIT/Apache-2.0:** provider/settings controls remain candidates for source reuse; UX references are not claims that its code was imported.

There is no blanket prohibition on copying or adapting permitted open-source UI code. Preserve its copyright, license, attribution, and any other specific obligations.
