# Managed ComfyUI integration in Noble AI

**Status:** launching and controlling an **existing** ComfyUI installation is implemented on `master`. [CI #42343797171](https://github.com/Mairon31/novel_ai/actions/runs/42343797171) reported **398 Python tests / 84 Playwright tests / Vite PASS**, including cross-site request protections. This feature **does not install ComfyUI or PyTorch**.

## Start ComfyUI from Noble AI

1. Install ComfyUI on the local computer or Colab. Its directory should contain `main.py`, `server.py`, `folder_paths.py`, and `comfy/cli_args.py`. Make sure the Python environment has ComfyUI's dependencies.
2. Open **Settings → Images → Run ComfyUI from Noble AI**. Enter the installation directory (the one containing `main.py`), optional Python executable path, local port, and memory profile. If the Python field is empty, Noble AI can inspect a `venv`, `.venv`, embedded Python, or available Python environment.
3. Select **Validate installation**, save the runtime configuration, and explicitly start ComfyUI. Opening or saving settings never starts a process. The managed process binds to `127.0.0.1`, avoids a shell, and does not open a browser.
4. Check runtime status until it reports **Ready**, based on ComfyUI's `/system_stats`, or view the capped 16 KiB tail of runtime logs to diagnose Python, driver, and dependency errors.
5. Noble AI updates its image URL to `http://127.0.0.1:<port>` while retaining checkpoint, sampler, scheduler, CFG, and anime preset settings. Refresh checkpoints, select one recognized by ComfyUI, and then request an illustration.
6. **Stop ComfyUI** terminates only the process Noble AI started. An unrelated process already listening on that port is never adopted as a managed process. Application shutdown also cleans up the process it owns.

## Process and security contract

The backend requires an absolute local ComfyUI directory and an executable Python interpreter. It does not accept arbitrary `.bat` commands, relative paths, injected arguments, or generic files in place of the expected installation. The command uses a fixed argument vector without `shell=True`:

```text
<python> <comfyui>/main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch --extra-model-paths-config <noble-model-paths>
```

One optional memory flag can be applied: `--lowvram`, `--normalvram`, `--highvram`, or `--cpu`. Ports are checked against existing services and Noble AI reservations. Critical runtime settings cannot be edited while that process is active. Starting ComfyUI does not download code or install dependencies.

See the [official startup flags](https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/startup-flags.mdx).

Cross-site browser requests to the **start** and **stop** endpoints are checked using `Origin` and `Sec-Fetch-Site` metadata. Requests from Noble AI's local origin are allowed; local requests without an Origin header remain possible for local clients/tests. This is a browser cross-site protection, **not authentication against arbitrary malicious programs already running locally**.

## Internal API

| Method | Endpoint | Responsibility |
|---|---|---|
| GET | `/api/v1/images/runtime/config` | Return `install_dir`, `python_executable`, `port`, `memory_mode` |
| POST | `/api/v1/images/runtime/validate` | Validate paths and display the managed model path; no process start |
| PUT | `/api/v1/images/runtime/config` | Save SQLite runtime preferences |
| GET | `/api/v1/images/runtime/status` | Return stopped/starting/ready/exited, ownership, and PID when available |
| POST | `/api/v1/images/runtime/start` | Explicitly launch a managed local process |
| POST | `/api/v1/images/runtime/stop` | Stop only the owned process |
| GET | `/api/v1/images/runtime/logs` | Read the tail of `data/logs/comfyui.log` |

Backend: `apps/api/noble_api/comfy_process.py`. Frontend: `apps/web/src/ComfyRuntimePanel.tsx` within the independent Images settings section.

## QA and limits

`tests/test_comfy_process.py` covers unsafe paths, occupied ports, configuration, no autostart, command-line flags, loopback binding, owned-process shutdown, logs, persistence, and cross-site request rejection without requiring a physical GPU. `apps/web/tests/comfy-runtime.spec.ts` checks desktop/mobile flows with simulated API responses and separation from Voice/TTS.

Earlier evidence: [CI #42343555333](https://github.com/Mairon31/novel_ai/actions/runs/42343555333), 397 Python tests and 84 browser tests. Additional Origin protection passed [CI #42343797171](https://github.com/Mairon31/novel_ai/actions/runs/42343797171).

**Still required:** installing/upgrading ComfyUI itself, setting up Python/PyTorch/CUDA dependencies and extensions, and validating real rendering with a compatible checkpoint on Windows/Colab. An affirmative `/system_stats` result proves server responsiveness, not actual VRAM availability or generation success. N-01 and N-21 remain open.
