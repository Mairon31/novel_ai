# Noble AI — opt-in speech synthesis

**Current status:** the first Piper CPU adapter with explicit playback is implemented. Chatterbox Multilingual, Pocket TTS, OmniVoice, Kokoro TTS, Qwen3-TTS, and other GPU/API engines remain research or integration backlog items unless their adapters are separately verified.

## Invariants

Speech is **opt-in**. The default state is `tts_enabled=false` and `auto_read=false`. Opening a story, editing text, continuing narration, loading settings, or generating an image must not automatically load a speech engine or enqueue audio.

Automatic reading is a separate prospective user-enabled feature, not active in the first Piper flow. A provider being installed does not imply permission to play or generate audio.

## Reader experience

- **Listen** on a saved turn explicitly requests a recording; playback can be stopped in the browser.
- Future goals include distinct narrator and character voices, language and pronunciation preferences, emotional delivery, pacing, and chunked long dialogue.
- Changing branches should stop old audio from a different story state.
- Any future automatic speech segmentation must respect the explicit user activation boundary.
- Natural Latin American Spanish (`es-419`) is a target **story and speech language**, not the language of application controls. English is the default product UI language.

## Implemented Piper flow

1. Install the Piper CLI so `piper` is available in the backend's `PATH`.
2. Place an ONNX file and matching `.onnx.json` under `<NOBLE_DATA_DIR>/models/voices/` or install a supported catalog voice through the app.
3. Enable on-demand speech controls under **Settings → Voice / TTS** and select a voice.
4. Click **Listen** on a saved turn. The backend uses Piper on CPU and stores/reuses a WAV under `story-assets/{story_id}/speech/` for compatible text/voice/settings.
5. If the executable or voice is missing, return an error without blocking narrative play.

Only one synthesis runs at a time in the initial adapter. Requests are limited to 3,500 characters and 120 seconds. The first API contract is:

`POST /api/v1/stories/{story_id}/turns/{turn_id}/speech`

```json
{"voice_id":"voice.onnx","request_source":"listen_button"}
```

`GET /api/v1/tts/voices` lists installed compatible voices without triggering synthesis.

## Piper-specific synthesis settings (N-21)

The separate Voice/TTS panel exposes:

| Setting | Range | Default | Purpose |
|---|---:|---:|---|
| `length_scale` | 0.5–2 | 1.0 | Phoneme duration / speaking pace |
| `noise_scale` | 0–1.5 | 0.667 | Generator variation |
| `noise_w` | 0–1.5 | 0.8 | Phoneme-duration variation |

`GET/PUT /api/v1/tts/synthesis-config` stores these settings in SQLite. They affect both an explicitly requested preview and a saved-turn Listen operation. Changes must be saved before requesting a new sample. Different settings produce distinct WAV cache keys; already generated audio is not arbitrarily deleted. Invalid, unknown, or non-finite values are rejected.

References: [Piper Python CLI](https://github.com/rhasspy/piper/blob/master/src/python_run/piper/__main__.py), [Piper C++ CLI](https://github.com/rhasspy/piper/blob/master/src/cpp/main.cpp).

These controls are not equalization, voice cloning, automatic character attribution, or a new neural model. [CI #42340597543](https://github.com/Mairon31/novel_ai/actions/runs/42340597543) reported 387 Python and 80 Playwright tests passing, plus Vite; the CLI was simulated rather than assessed acoustically on physical hardware.

## Planned multi-engine architecture

Investigate each provider independently, checking code and weight licenses, CPU/GPU requirements, model format, Windows/Colab compatibility, voices, languages, dependency isolation, and expected VRAM:

- [Chatterbox](https://github.com/resemble-ai/chatterbox) and its [Latin American Spanish variant](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam)
- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
- Pocket TTS
- OmniVoice
- Kokoro TTS

A future shared provider contract should expose `discover / capabilities / install / voices / configure / preview / synthesize / cancel / unload / health`. Only genuine provider-supported parameters should appear in the UI; unsupported parameters must not be ignored silently.

### Distinct voices for narrator and characters

Each NPC and the narrator should eventually store a `provider_id + model_id + voice_id + options` mapping with per-story overrides and branch-safe persistence. Unknown speakers must not be assigned an invented identity. Missing voices need a visible, predictable fallback.

Dialogue assembly should preserve text order, pauses, consistent levels, and cache invalidation when text, model, voice, or options change. An upcoming implementation must never trigger synthesis just because a story opened.

### Privacy and caching

Use a content key derived from normalized text, model/voice revision, locale, and synthesis parameters. Store recordings as controlled story assets; garbage collect by references. Voice cloning or recordings of a real person require the person's explicit consent and recorded provenance. Consider separate lazy-loaded CPU/GPU workers that can release VRAM when idle.

## Acceptance tests

- Fifty story turns with TTS disabled must produce zero speech calls.
- Two identical explicit Listen requests should reuse a cached recording where applicable.
- Changing voices must invalidate the appropriate speech cache without altering canon or illustrations.
- Changing stories or branches must prevent stale playback in the new context.
- A disconnected speech provider must not block LLM or ComfyUI operations.
- Before claiming production readiness, test at least ten target-language sentences and one mixed narrator/3+ NPC turn on actual Windows/Colab hardware. Measure pronunciation, latency, memory, cancellation, and output levels.

See the [Piper voice installer](PIPER_VOICES.md), [narrative backlog](PLAN_HISTORIAS_ANIME_2026_11_06.md), and [master TODO](../TODO.md).
