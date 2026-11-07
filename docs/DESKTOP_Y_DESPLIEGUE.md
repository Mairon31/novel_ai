# Noble AI — app-first deployment and desktop packaging

**Status:** architectural proposal. A packaged desktop executable has **not** been released.

## One product, two delivery modes

### Local web application — current development target

- React/Vite provides the browser UI; FastAPI provides REST/SSE, sessions, narrative state, and model management.
- Initial setup belongs in the UI rather than requiring a notebook or a manually edited `.env`.
- Developer scripts can be used on Windows/Linux while a guided desktop installer is not available.

### Desktop application — future target

**Tauri 2** is the leading candidate to bundle the web UI with a Python/FastAPI sidecar and optional runtime integration. A Rust-based WebView launcher is an alternative if a Tauri prototype proves impractical.

A future desktop shell should detect existing Noble AI instances, create user data directories, open setup/library, start a local API on a controlled port with appropriate session access, monitor health, and terminate **only processes it owns**. It should never kill unrelated Ollama, KoboldCpp, ComfyUI, or speech processes.

Model weights and story assets must live in user-configurable directories outside the executable so application upgrades do not overwrite them. Multi-gigabyte weights should not be bundled by default: model installation should be explicit and visible to the user.

Official reference: [Tauri 2 sidecar binaries](https://v2.tauri.app/develop/sidecar/). Using `externalBin` still requires per-platform builds, permissions, and robust process lifecycle handling.

## Colab is optional

Colab is for temporary GPU diagnostics, experiments, and repeatable benchmarks, not the required installation path. An authenticated remote worker may be supported where the infrastructure allows it; test notebooks must not be treated as always-on application servers.

## Portability

```text
           React UI (browser)
                ↕ REST/SSE
      FastAPI orchestration (Python)
                ↕ adapters
     KoboldCpp | Ollama | ComfyUI | TTS
                ↕ resource policies
         NVIDIA CUDA / CPU / offload

    + Future Tauri 2 desktop shell
    + Optional Colab test notebooks
```

Desktop packaging must preserve existing story formats, API contracts, and provider IDs. Development and local browser usage must continue to work without Tauri.

## Acceptance targets

1. The local web UI starts with no model installed.
2. The backend exposes available hardware and model storage paths.
3. Users can select and install supported models through the application.
4. A selected narrator can start, generate a turn, and restore the story after restart.
5. Image generation and speech remain optional and lazy-loaded.
6. A future Windows executable opens without requiring a terminal, preserves data, manages its own processes, and works offline with previously cached weights.
7. CI and device QA cover the packaged result, integrity, rollback, and any required OS signing notices.

Do not mark the desktop acceptance targets complete before implementation and evidence exist.
