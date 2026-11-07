# Noble AI quickstart

Noble AI is a local-first React and FastAPI application for interactive stories, branching narrative state, optional ComfyUI images, and optional Piper speech. Google Colab is not required for local operation.

## Requirements

- Windows 11 for the primary local workflow; Linux is supported for development.
- Python 3.11+, Node.js 22+, and Git.
- Internet access for dependencies and model discovery/downloads. Previously installed local models can be used offline when their inference runtime supports it.

## Install and launch

PowerShell:

```powershell
git clone https://github.com/Mairon31/novel_ai.git
cd novel_ai
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
npm --prefix apps\web install
npm --prefix apps\web run build
.\.venv\Scripts\python.exe -m uvicorn noble_api.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. Use `Ctrl+C` to stop the API.

## Option A: use a GGUF model with KoboldCpp

1. Browse **Model Hub** and install a supported single-file GGUF variant that fits your VRAM/RAM budget. Wait for its installation to complete.
2. Download the KoboldCpp executable from its [official releases](https://github.com/LostRuins/koboldcpp/releases). Noble AI does not yet install that executable for you.
3. In the managed KoboldCpp settings, select the installed GGUF and provide the executable path (for example `C:\Tools\koboldcpp.exe`).
4. Choose GPU layers: automatic (`-1`), CPU-only (`0`), or a specific count. Set a local port (typically `5001`) and an initial context size such as 4096 tokens.
5. Start the model. If startup fails, inspect `data/logs/koboldcpp.log`, model compatibility, GPU memory, and the selected port.
6. Select the running model as the narrator. Noble AI reads the model ID exposed by KoboldCpp.
7. Open **Library**, create a story with a title and premise, and submit the first action. Narrative output streams to the reader and is saved to SQLite.
8. The managed launcher shuts down only processes it started; it should not terminate unrelated services.

The process-management and API contracts have automated coverage. End-to-end real-GPU behavior still requires testing on the target machine.

## Option B: connect Ollama

1. Install and start [Ollama](https://ollama.com). Make sure a suitable model is installed (for example, via `ollama pull qwen3:8b`).
2. In narrative-provider settings, select **Ollama** and `http://127.0.0.1:11434`; save and test the connection.
3. Select the model ID reported by Ollama. Configure temperature, top-p, context length, and output limit.
4. Choose an available GPU/CPU mode. The CPU-only option maps to `num_gpu=0`; otherwise Ollama manages device placement.
5. Create or reopen a story from the library. Noble AI requests a `keep_alive` of 30 minutes for supported Ollama requests.

Provider endpoints and remote access are subject to the backend's security policy. Configuring an arbitrary URL does not bypass local endpoint restrictions.

## Optional image and voice services

- **Images:** connect an already installed ComfyUI instance. You can install supported Hugging Face image checkpoints from the Images settings page; a downloaded checkpoint is usable only when ComfyUI recognizes it. See [checkpoint installation](CHECKPOINTS_IMAGEN.md).
- **Voice:** configure Piper and local ONNX voice assets. Audio is on demand and does not start on page load. See [speech](TTS.md).
- **Colab:** the [application notebook](../notebooks/noble_ai_colab_play.ipynb) can run a development environment on an ephemeral remote runtime.

## Data locations

| Path | Purpose |
|---|---|
| `data/noble.sqlite` | Stories, turns, canon, settings, models, download jobs, and related metadata |
| `data/models/` | Installed and managed model files, including supported image checkpoints |
| `data/logs/` | Logs for managed runtime processes |
| `apps/web/dist/` | Built frontend served by FastAPI |

**Keep the `data/` directory when upgrading.** A reinstall of application source files should not erase local stories and models.

## Run automated checks

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
npm --prefix apps\web run build
npm --prefix apps\web run test:e2e
```

Browser tests require Playwright browser dependencies and the relevant running services. The GitHub Actions workflow provides the reference CI environment. Mocked tests are not proof that a specific model generates correctly on a physical GPU.

## Navigation

- **Library:** story cards open a dedicated detail page with the synopsis, protagonist, tags, and actions. Continue into the reader without keeping the library in the background.
- **Creator Studio:** manage characters, story openings, creator-only information, and editorial assets.
- **Model Hub:** browse model details and quantizations, inspect installed files, and monitor downloads.
- **Settings:** distinct Images, Voice/TTS, About, and Updates panels, plus other provider and application settings.
- **Discover Stories:** install editable copies of the bundled original story worlds.

## Troubleshooting

- **Cannot connect to the API:** check that FastAPI is running on port 8000.
- **No NVIDIA device detected:** run `nvidia-smi` in PowerShell.
- **GGUF does not appear:** confirm download completion and the managed model directory.
- **KoboldCpp will not start:** check the executable, selected model, local port, and logs.
- **KoboldCpp responds but stories cannot generate:** select its loaded model as the active narrator.
- **Ollama does not respond:** check that Ollama is running and the model ID/loopback URL are correct.
- **Insufficient VRAM:** lower model quantization, context, or GPU layers as appropriate.
- **Images or speech unavailable:** verify that the relevant runtime and assets are installed and explicitly enabled.

[Model Hub](MODEL_HUB.md) · [Roadmap](ROADMAP.md) · [Issues](https://github.com/Mairon31/novel_ai/issues)
