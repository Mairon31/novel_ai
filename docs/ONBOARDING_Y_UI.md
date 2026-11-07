# Noble AI — application experience, onboarding, and UI design

**Status:** product specification and UX research. Library, Creator Studio, Model Hub, and reader already have functioning UI flows; several planned capabilities below are not yet implemented.

## Experience goal

The intended user downloads Noble AI, opens a graphical application, and manages supported models and services without editing `.env` files or running Colab. Today there is a local web interface; a packaged desktop application is a later milestone.

**Primary spaces:** Library / Discover Stories, Reader, Creator Studio, Model Hub, Downloads, Settings, and Diagnostics. The reader should not be visually embedded inside the library or infrastructure screens.

## First-run onboarding concept

| Step | Screen | User action | App response |
|---|---|---|---|
| 0 | Welcome and language | Select preferred UI and story language; **English UI is the product default** | Persist preference without forcing story content to English |
| 1 | Hardware diagnostics | Choose GPU/CPU/Auto if supported | Detect devices and report estimated fit |
| 2 | Storage | Choose model/project/cache directories | Inspect free space, permissions, external disks |
| 3 | Narrator | Find/install a GGUF or connect Ollama/KoboldCpp/API | Show quantization, sizes, capability estimates, and installation actions |
| 4 | Images | Configure ComfyUI and supported checkpoint or skip | Set manual/on-demand/disabled image policy |
| 5 | Voice | Configure an optional speech engine/model | Speech OFF by default and no engine preload |
| 6 | Review | Confirm settings, compatibility, and external service use | Download only explicitly chosen components |
| 7 | Library | Create or import a story | Open story and initialize the selected narrator when ready |

**Resume:** the future setup flow should persist validated progress. Users can access the app without completing optional image or voice steps. Without an LLM configured, the library remains available for reading/import/editing while new generation explains which model connection is missing.

## Model Hub information architecture

The intended desktop UI has a model list and detail inspector; mobile uses a detail modal. Provide: categories by role; Discover, Installed, and Downloads; Hugging Face search; provider/source/license; variants and quantization; estimated GPU/CPU fit; disk capacity; and explicit install/select controls.

This is a **design target**, not proof that every filter, installer, or engine exists. Do not present a design wireframe as a runtime screenshot.

## Independent settings areas

- **General:** UI language, themes, typography, accessibility, paths, backups, and updates.
- **Narrative:** provider URL, model/quantization, context, sampling, optional reasoning, canon/memory, style, and effective parameters.
- **Images:** ComfyUI workflow/checkpoint/LoRA/VAE, prompts, CFG, steps, seed, resolution, explicit/scene policies. Do not pretend a universal content filter exists.
- **Voice / TTS:** Piper, future engines, per-character voices, device options only if supported, pronunciation, speed, quality, and cache.
- **Model management:** installed models, per-role device assignments, download queues, and profiles.
- **Hardware:** observed GPU/RAM/VRAM, offload, job limits, and contention.
- **Providers and network:** local or remote endpoints, keyring secrets, connection tests, privacy.
- **Data:** stored projects, models, caches, import/export, recovery, and uninstall.
- **Diagnostics:** engine status, dependencies, sanitized errors/logs, reproducible benchmarks.
- **About:** version, build, paths, installation type.
- **Updates:** release channel and checks, kept separate from About.

Image and Voice/TTS **must be independent navigation destinations**. About and Updates **must also remain separate**. These separations already have UI implementation; they are not reasons to combine unrelated controls in a single page. See [settings sections](CONFIGURACION_APARTADOS.md).

## Global and per-story profiles

The target model is global defaults plus optional versioned overrides for individual stories:

- Global `default_narrator`, `default_image`, and `default_voice`.
- Story `override_narrator`, `override_image`, and `override_voice`.
- Named target presets such as Fast (12 GB), Quality (16 GB), CPU, and Custom. Do not guarantee heavy models fit just because the hardware has 12/16 GB.
- Show **effective configuration** with precedence `story override > global profile > provider defaults`.
- Validate only supported `provider.capabilities`; disable unavailable controls with an explanation.
- Changing profiles must not erase checkpoints, story state, or authored canon.

## Visual novel reader

A separate immersive scene surface with backgrounds, sprites/expressions, distinguishable dialogue and narration, book/chat modes, backlog, continue/edit/branch actions, and action/speech input. Keep advanced Model Hub and runtime management outside the reader canvas.

**Mobile:** drawer navigation, adaptive text panel, minimum comfortable touch target (~44 px), portraits that do not obscure reading, zoom/accessibility options, and fallback without images. **Desktop:** responsive multi-panel layouts.

## Truthful product states

Distinguish `unconfigured`, `downloading`, `installed`, `loading`, `ready`, `busy`, `error`, `incompatible`, and `unknown`. A partially downloaded file must not appear installed, and a file size alone must not imply runtime compatibility. No fake buttons or production placeholders; disabled actions need a visible reason.

## Acceptance criteria

- First-run UI opens with zero models.
- Settings persist across restarts without requiring manual config-file edits.
- Browser and future desktop shell use the same API/storage contracts.
- 12/16 GB compatibility warnings and CPU/offload options are accurate and capability-based.
- Text stories work with optional media disabled.
- Download progress and state changes remain visible without manual page reload.
- Desktop/mobile Playwright checks at 1440×900 and 390×844, without overflow or inaccessible controls.
- Opening Settings/Voice does not launch TTS synthesis or load media models.

## Post-Argon information architecture

Organize the product as **four distinct experiences**, not one long combined settings column:

1. **Library / discovery:** editorial covers, public synopsis, cast, alternate openings, recent activity, and continue actions.
2. **Immersive reader:** full-scene VN canvas with background/sprites/dialogue, VN/Book/Chat modes, backlog, actions, cancellation, and branches.
3. **Creator Studio:** basic/advanced character and world editing, canon, Lorebooks, sprites, voice plans, story openings, and previews without forced inference.
4. **Infrastructure:** Model Hub, quantizations, downloads, workers, hardware policy, budgets, and benchmarks.

Do not rewrite the entire frontend in a single pass. Preserve states, deep links, tests, and mobile support while introducing improvements. Adopt Radix or virtualization only where accessibility/performance benefits can be demonstrated. See [TODO](../TODO.md), [Argon audit](ARGON_AUDITORIA.md), [QA](QA_Y_ACEPTACION.md), and [Model Hub](MODEL_HUB.md).
