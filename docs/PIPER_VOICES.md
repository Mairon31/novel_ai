# Install Piper voices from Noble AI

## Scope and available models

The first voice installer lives under the separate **Settings → Voice / TTS** panel. It installs eligible ONNX voice models and JSON configuration files without requiring a model-download command. Installation is an explicit click: browsing the catalog does not start downloads, synthesize audio, or launch Piper.

Installed voices are placed under `data/models/voices/` and can be selected in the reader. The initial catalog is intentionally limited to two Hugging Face `rhasspy/piper-voices` packages:

| Voice ID | Language | Quality | Source |
|---|---|---|---|
| `es_MX-ald-medium.onnx` | Mexican Spanish | Medium | [ald/medium](https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/ald/medium) |
| `es_MX-claude-high.onnx` | Mexican Spanish | High | [claude/high](https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/claude/high) |

These are model voice languages, **not** the default UI language. Check the individual model cards for voice/data usage conditions; repository-level licensing does not replace per-model documentation.

## Integrity and download safety

1. Only the two catalog IDs are accepted in this first version. The backend resolves an immutable 40-character Hugging Face revision.
2. Both ONNX and JSON metadata are required, with published sizes and limits of 300 MiB for ONNX and 64 KiB for JSON.
3. Download URLs use server-selected paths under `huggingface.co/rhasspy/piper-voices/resolve/{revision}/...`, not arbitrary user-provided URLs.
4. Job progress is stored in a separate `tts_downloads` SQLite table. Strict HTTP Range requests support resume; a server that ignores Range causes a controlled full restart.
5. Check size, available LFS SHA-256, parseable JSON, and `es_MX` locale. Reject HTML masquerading as an ONNX model. When a published LFS SHA-256 is absent, report a locally computed hash without claiming cryptographic source authentication.
6. Download to a Noble AI-owned temporary directory; publish JSON **before** ONNX and do not overwrite an unrelated existing voice. List a voice only when both files exist. Cancellation cleans up only its own temporary files.
7. On restart, interrupt active transfers to a paused state. Resume only on explicit user request.

Downloaded files are data, never executable code. Passing header checks is not proof that a specific ONNX file works with every Piper runtime version.

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/tts/catalog` | Supported voices and installation state |
| GET | `/api/v1/tts/downloads` | Recent jobs |
| GET | `/api/v1/tts/downloads/{uuid}` | One job |
| POST | `/api/v1/tts/install` | `{"voice_id":"es_MX-ald-medium.onnx"}` |
| POST | `/api/v1/tts/preview` | Explicit preview request |
| POST | `/api/v1/tts/downloads/{uuid}/pause` | Pause transfer or verification |
| POST | `/api/v1/tts/downloads/{uuid}/resume` | Resume or retry |
| POST | `/api/v1/tts/downloads/{uuid}/cancel` | Cancel pending installation |

Job states: `queued`, `downloading`, `verifying`, `paused`, `failed`, `cancelled`, `completed`. The UI polls active jobs and refreshes the installed voice list when appropriate.

## Preview from Settings

Once Piper and a valid voice are installed, **Test selected voice** explicitly requests a WAV sample. The preview endpoint requires `request_source=preview_button` and text between 10 and 400 characters, and returns `audio/wav` with `Cache-Control: no-store`. It uses a temporary file that is cleaned up, an output cap of 16 MiB, a 60-second timeout, and the shared synthesis lock. Opening the panel or selecting a voice does not play audio.

Example:

```json
{"voice_id":"es_MX-ald-medium.onnx","text":"Hello, this is a voice preview.","request_source":"preview_button"}
```

The first catalog contains Spanish models; use an appropriate Spanish sample to evaluate pronunciation on real hardware.

## Piper voice personalization

The Voice/TTS section also stores `length_scale`, `noise_scale`, and `noise_w` under `GET/PUT /api/v1/tts/synthesis-config`. Changes affect new previews and Listen operations, and participate in the speech cache key. Save the settings before testing. Voice settings do not modify story turns or image configuration.

## Testing and limitations

- `tests/test_piper_voice_installer.py`: mocked Hugging Face metadata, complete and partial downloads, integrity, missing files, resume, cancel, and security.
- `apps/web/tests/piper-installer.spec.ts`: desktop/mobile download UI with simulated provider responses.
- `tests/test_piper_speech.py`: preview API and cleanup with a mock WAV-producing executable.
- `apps/web/tests/tts-preferences.spec.ts`: explicit preview interaction and controls.

Earlier automated results: [CI #42263945875](https://github.com/Mairon31/novel_ai/actions/runs/42263945875), 378 Python / 76 Playwright; [CI #42265155907](https://github.com/Mairon31/novel_ai/actions/runs/42265155907), 381 Python / 76 Playwright; [CI #42340597543](https://github.com/Mairon31/novel_ai/actions/runs/42340597543), 387 Python / 80 Playwright. These used simulated Hugging Face/Piper behavior, not acoustic validation.

**Remaining:** install/upgrade Piper itself from within Noble AI, expand catalog filtering and languages, approved sample audio, per-character voices, and test real Hugging Face ONNX weights with real Piper on Windows/Colab. Broader image-model installation is documented separately and should not be conflated with the voice installer.
