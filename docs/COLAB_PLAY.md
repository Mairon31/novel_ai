# Noble AI — all-in-one Google Colab launch

**Notebook:** [Open Noble AI in Colab](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_ai_colab_play.ipynb)  
**Source:** [Notebook](../notebooks/noble_ai_colab_play.ipynb) · [Versioned launcher](../tools/colab_launch.py)

Google Colab is an **optional remote environment**. The local web application is the primary product workflow.

## Launch without manual commands

1. Open the notebook and connect a Colab runtime. Select T4/L4 GPU if offered. The text-oriented app can still run on CPU at lower performance. Google Drive is optional.
2. Select **Run the single code cell** or **Runtime → Run all**. The launcher manages commands and downloads without asking the user to paste their own tokens.
3. The cell prints stage logs and periodic progress updates. Once the app is available, it shows **Open Noble AI in a new tab** and an embedded view.
4. Use **Library → La estación de la última luna** for the bundled demonstration story, installed only when the library was previously empty. Existing stories are never overwritten.

**You do not have to wait for optional image model downloads to finish to use the reader.** When the API and Ollama are ready, the UI becomes available while selected ComfyUI setup continues.

The UI is accessed through the **authenticated Colab kernel proxy**, not a public Cloudflare/ngrok tunnel. If browser pop-up or third-party-cookie policies block the new tab, try the embedded view. Session-proxy links expire with the runtime.

## Automated setup

| Component | What the launcher does |
|---|---|
| Noble AI source | `git clone/fetch` from `Mairon31/novel_ai`, with exact commit verification |
| API | Install Python dependencies from `apps/api/requirements.txt`, run FastAPI/Uvicorn on `127.0.0.1:8000` |
| Frontend | Install compatible Node/Vite dependencies using `npm ci` if a lockfile exists, otherwise `npm install`; build React |
| Web access | Serve built React assets through the **same FastAPI port** via Colab's session proxy |
| Narrator | Install/start local Ollama on `127.0.0.1:11434`, select/download a model, save `/api/v1/narrative/config`, call `/api/v1/narrative/prepare` to verify real inference without committing a turn |
| Demo story | Install only into an empty library |
| Images (`auto`) | On available NVIDIA GPU, attempt ComfyUI installation and a test **Stable Diffusion 1.5 FP16** checkpoint on loopback port 8188, without replacing an already selected checkpoint |
| Drive backup (opt-in) | Back up story SQLite using `sqlite3.Connection.backup` and media files, not multi-GB model weights |

ComfyUI may be installed without optional RMBG, LoRA, or IPAdapter extensions. Those require separately installed plugins/models. The test checkpoint is not a production anime model and does not guarantee character identity. Illustration generation stays on demand, not once per dialogue response.

For the demo checkpoint, the launcher compares the download with the published SHA-256 of [Comfy-Org stable-diffusion-1.5 FP16](https://huggingface.co/Comfy-Org/stable-diffusion-1.5/blob/main/v1-5-pruned-emaonly-fp16.safetensors) (approximately 2.13 GB). With at least 11,000 MiB observed NVIDIA VRAM, the initial Ollama selection uses a [Qwen3 4B Instruct](https://ollama.com/library/qwen3/tags) variant; smaller/CPU environments use `qwen3:1.7b`. This is a setup default, **not a benchmark or output-quality guarantee**.

## Optional notebook configuration

The single notebook cell provides four settings:

- **`REVISION="master"`**: resolve the branch's current HEAD SHA first and fetch the launcher from **that exact commit**. Set a full 40-character SHA to reproduce an older revision. This avoids mixing script and application versions.
- **`MODELO="auto"`**: choose an Ollama model based on available resources or specify an installed/available valid Ollama tag such as `qwen3:4b-instruct` or `qwen3.5:2b`. Launcher subprocess commands use an argument list, not interpolated shell text.
- **`IMAGENES="auto"`**: attempt ComfyUI and demo checkpoint on an NVIDIA GPU. `off` uses narration/frontend only; `on` attempts images even without NVIDIA (potentially expensive in CPU/RAM).
- **`COPIA_EN_DRIVE=False`**: explicitly set True to ask for Drive authorization. The launcher restores available data to local storage and periodically backs it up under `My Drive/NobleAI-Colab/data`. SQLite backup is online, while media are copied as files; **the combined backup is not globally atomic**, and a sudden disconnect can lose the last minutes of unbacked-up changes.

The launcher preserves previously saved, valid narrator/image settings. User data live at `/content/noble-ai-colab/data`, **outside** the Git checkout, so updating `master` must not reset story data. Without Drive backup, this directory expires with the temporary Colab runtime. Users can also export portable `.noble.zip` archives through the Library.

## Logs and troubleshooting

Log directory: `/content/noble-ai-colab/logs/`.

| File | What it records |
|---|---|
| `git.log` | Revision and fetch/network errors |
| `python-deps.log` | FastAPI dependencies |
| `npm-ci.log` / `npm-install.log` | Frontend installation |
| `vite-build.log` | React/TypeScript build |
| `noble-api.log` | FastAPI and SQLite errors |
| `ollama-install.log`, `ollama-pull.log`, `ollama.log` | LLM installation, download, execution |
| `comfy-git.log`, `comfy-deps.log`, `comfyui.log` | ComfyUI installation/startup |
| `launch_state.json` | Exact revision, observed GPU, model choice, warmup result |

Ollama installation/inference failures should be reported while preserving the UI. If ComfyUI fails, readers and the narrator remain accessible; the launcher must not report image generation as installed when no runtime started.

The launcher does not use anti-idle loops. Colab can terminate sessions under its quota and usage policies. Large model downloads, warmups, and image inference can consume significant time, disk, and VRAM; there is no performance guarantee without physical runtime measurements. The local app is not bound to `0.0.0.0`.

## Portability and test contracts

The launcher checks out the selected revision and installs that revision's Python/frontend dependencies. Future Ollama tags can be selected through validated model names. Do not silently assume ComfyUI nodes or paths exist after upstream changes; report actionable errors.

- `tests/test_colab_play.py`: notebook JSON/AST, one executable cell, pinned revision, proxy safety, checkout URL, model choice, persisted settings, idempotent demo story, explicit inference check, and SQLite/media backup.
- GitHub Actions uses simulated external providers, verifies syntax/contracts/build, but **does not actually run Colab, download multi-GB weights, or render on GPU**.
- Real Colab validation should preserve stage logs and `launch_state.json` to prove device/runtime behavior.

## Safe restart when `master` changes

The launcher records the Uvicorn PID it starts. On a later run with a different commit SHA, it checks `/proc/<PID>/cmdline` for the exact Noble `noble_api.main:app` process, project directory, and loopback port `8000` before sending SIGTERM to restart and apply SQLite migrations. A mismatch prevents termination and produces diagnostics; unrelated processes are not killed. Story and media data remain outside the source checkout. Existing healthy ComfyUI and Ollama services are reused when appropriate.

## Enriched demonstration story

On a fresh library, `ensure_demo_story()` installs **La estación de la última luna** through `POST /api/v1/story-hub/ultima-luna/install`, verifying four NPCs, three Lorebook entries, and three alternative openings. The launcher does not modify any existing story. A previous simple demo remains intact; use **Library → Discover Stories** to add the richer pack separately. The pack contains no preinstalled illustrations. See [Story Hub](STORY_HUB.md).
