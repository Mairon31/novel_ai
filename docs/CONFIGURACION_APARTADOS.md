# Noble AI settings — independent sections

**Status:** the four-section settings UI shipped to `master` on November 6, 2026. [CI #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131) reported 381 Python tests, 80 Playwright tests, and a passing Vite build. Related backlog: N-25 in [TODO](../TODO.md).

## Navigation and deep links

| Settings section | Existing URL | Component |
|---|---|---|
| Images | `#/configuracion/images` | `apps/web/src/ImageSettingsPanel.tsx` |
| Voice / TTS | `#/configuracion/voice` | `apps/web/src/VoiceSettingsPanel.tsx` |
| About Noble AI | `#/configuracion/about` | `apps/web/src/AboutSettingsPanel.tsx` |
| Updates | `#/configuracion/updates` | `apps/web/src/UpdatesSettingsPanel.tsx` |

The existing `#/configuracion` overview URL and legacy `#/configuracion/multimedia` redirect to Images are retained for backward compatibility. These hash routes work with the local FastAPI server without URL rewrite rules. They are **stable URLs**, even when labels are translated.

## Responsibilities

**Images:** on-demand illustration policy, local ComfyUI URL and checkpoint, dimensions, diffusion steps, CFG, negative prompt, installed model inventory, sampling choices, anime style presets, checkpoint downloads, and a related minimum-free-VRAM setting.

**Voice / TTS:** installed Piper voices, catalog and download jobs, pause/resume/cancel, default reader voice, explicit speech controls, and local test playback. This panel has no ComfyUI controls.

**About Noble AI:** application version, commit, build type, data paths, model directory, and Python version. Visiting this page does not check remote releases.

**Updates:** stable/beta/nightly channel, startup release-check preference, release information, and manual refresh. Automatic update **installation** is not available until packaging, integrity verification, and rollback exist.

## Behavioral contracts

- Separation applies to navigation, component boundaries, and API calls, not necessarily separate databases: existing settings remain stored through SQLite/API.
- Opening Images must not query voices or launch Piper. Opening Voice must not query ComfyUI configuration. Navigating between tabs must never generate media or start a download without explicit action.
- Browser back/forward, reload, and deep links must preserve the selected section.
- Each section needs a distinct accessible name, identifiable controls, an active-state indicator, and responsive mobile navigation.
- The main regression test is `apps/web/tests/settings-separation.spec.ts`. Additional coverage includes `app.spec.ts`, `multimedia.spec.ts`, `tts-preferences.spec.ts`, and `piper-installer.spec.ts`.

N-25 (section separation) is not equivalent to completing N-21 (advanced per-model image and voice settings).

## Image sampling and anime presets

The Images panel exposes persisted sampler, scheduler, and anime style settings. Defaults are `euler`, `normal`, and `anime_fantasy`. The `anime_cinematic` and `anime_watercolor` presets modify image-generation conditioning; `none` leaves the scene planner's prompt untouched. These changes do not rewrite user dialogue.

**Check ComfyUI sampling** requests `GET /api/v1/images/sampler-options`, which queries the local `/object_info/KSampler` endpoint. Non-default sampler/scheduler choices are checked again before rendering. The default Euler/Normal pair retains compatibility with runtimes that do not expose introspection. Generation seeds are still chosen per request, not as a global setting. See [image controls](CONTROLES_IMAGEN.md).

## Piper controls

Piper's `length_scale`, `noise_scale`, and `noise_w` parameters are configured only under Voice/TTS. They affect explicit voice tests and playback, do not belong to Images, and do not synthesize any audio when a settings page is opened or saved. Related regression evidence: [CI #42340597543](https://github.com/Mairon31/novel_ai/actions/runs/42340597543).

## Managed ComfyUI runtime

Images also contains `ComfyRuntimePanel.tsx`, which validates, configures, starts, monitors, and stops an **existing** ComfyUI installation. Its local installation path, Python interpreter, port, and memory mode persist in SQLite. Noble AI supplies the managed `noble_extra_model_paths.yaml` automatically and only stops processes it created. Opening the panel does not start ComfyUI. See [runtime integration](COMFY_UI_INTEGRACION.md).

Automatic ComfyUI installation/upgrading, dependency management, extension installation, and real GPU validation remain separate work.
