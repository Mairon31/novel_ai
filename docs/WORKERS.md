# Noble AI — remote GPU workers (experimental P1.1)

**Implemented:** registration, connection checks, and activation of an OpenAI-compatible remote LLM worker, plus a bearer-authenticated HTTP proxy that runs on the GPU machine. Tests currently simulate the remote protocol. This is **not** proof of a real Colab benchmark or a one-click Colab instance installer. Noble AI does not automatically install cloudflared.

## Architecture

```text
Main browser/PC → Noble AI FastAPI + SQLite → HTTPS Cloudflare Tunnel
                → authenticated Noble Worker proxy
                → local OpenAI-compatible inference service → remote GPU
```

Story data and unrelated credentials remain on the primary PC. The worker receives only the narrative context needed for generation. Cloudflare transports requests between machines.

- The primary API stays bound to `127.0.0.1`; this feature is **not** a way to publish the entire workspace to the internet.
- The worker proxy exposes `GET /v1/models` and `POST /v1/chat/completions`; the bearer token is mandatory on all paths, including unrecognized ones.
- Noble AI checks that a valid token succeeds and an invalid token is rejected with 401/403. A direct unauthenticated tunnel to Ollama/KoboldCpp is not an accepted worker.
- The token is kept in the operating-system keyring. A secure keyring backend is required for headless setups; there is no plaintext fallback.

## 1. Prepare a second PC or eligible Colab environment

You need Python 3.11+, Noble AI source, cloudflared installed separately, and a running OpenAI-compatible inference server on the GPU machine. For example, KoboldCpp at `127.0.0.1:5001` must expose `/v1/models` and `/v1/chat/completions`.

From the repository root:

```bash
python -m pip install -r apps/api/requirements.txt
```

Create a strong, private local token. Do not paste it in issues, shared terminals, or public notebook cells.

**Windows PowerShell:**

```powershell
$env:NOBLE_WORKER_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:NOBLE_WORKER_UPSTREAM = 'http://127.0.0.1:5001'
python -m uvicorn noble_api.worker_server:app --app-dir apps/api --host 127.0.0.1 --port 8765
```

**Linux/Colab:** export `NOBLE_WORKER_TOKEN` (at least 24 characters; use cryptographically random bytes) and `NOBLE_WORKER_UPSTREAM=http://127.0.0.1:5001`, then run the same Uvicorn command. Colab notebooks need an active session, which can disconnect or terminate.

## 2. Expose only the worker proxy

With cloudflared installed on the remote machine:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

The tunnel provides a temporary address such as `https://random-words.trycloudflare.com`. Do not use an inference server URL directly and never expose the primary Noble AI API. Quick Tunnel addresses may change after restart; persistent managed tunnels are not part of this release.

## 3. Connect in Noble AI

On the primary PC, open **Settings → Network & Workers → Remote GPU Workers**.

1. Enter a display name, temporary HTTPS Cloudflare URL, and the token configured on the GPU machine.
2. Explicitly register the worker.
3. Select it and test the connection. Check the returned model IDs and the verification that an invalid bearer token is rejected.
4. Choose a real remote model and activate it as the narrator.
5. Open Library and generate a story turn. Successful completed turns are stored in local SQLite.

If the remote service disconnects, Noble AI reports a generation error. It does not silently switch narration to a local GPU. Workers can be removed from the management panel.

## Feature support

| Feature | Current state |
|---|---|
| Register/remove remote worker URL and token | Implemented |
| `*.trycloudflare.com` HTTPS validation and 401/403 checks | Implemented |
| Model ID discovery and narrator selection | Implemented |
| Remote LLM streaming adapter | Implemented; mocked in automated tests |
| Authenticated local worker proxy | Implemented; mocked tests |
| One-click Colab/Kaggle startup | Pending |
| Permanent custom-domain tunnels | Pending |
| Remote ComfyUI image/TTS workers | Pending |
| Full LAN/internet workspace sharing with user accounts | Pending |
| Real large-model remote benchmark | Pending |

## Privacy and service requirements

The experimental transport depends on the third-party Cloudflare service and its current policies/quotas. Prompts transmitted through the tunnel are not entirely local. Tokens must never be committed to Git, returned in API logs, or stored in public notebooks.

## Real Colab GPU notebook and benchmarking (P1.2 experimental)

[Remote worker Colab notebook](../notebooks/noble_worker_colab_gpu.ipynb) · [Open in Google Colab](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_worker_colab_gpu.ipynb).

The notebook checks CUDA/NVIDIA state, prepares llama.cpp, obtains a Qwen3 4B GGUF, starts llama-server and the authenticated proxy, opens a temporary tunnel, and runs client-side benchmarks. **A real remote-tunnel GPU benchmark has not been verified here.**

Available metrics include client-observed **TTFT** (request to first actual narrative content, including tunnel overhead), p50/p95 across repeated runs, sampled `nvidia-smi` VRAM/utilization, active/completed/failed job counts, and runtime status. VRAM sampling is not an exact peak. Tokens/s is reported only if the provider returns `completion_tokens`; character counts are not equivalent.

The worker exposes bearer-protected `GET /v1/health`. Noble AI can surface telemetry after a connection test without persisting prompts, replies, credentials, or private worker addresses in the reported metrics.

To benchmark an already registered worker from the main PC:

```bash
export NOBLE_WORKER_TOKEN="LOCAL_PRIVATE_TOKEN"
python tools/worker_benchmark.py --url https://my-worker.trycloudflare.com --runs 3 --output worker-report.json
```

In PowerShell, set `$env:NOBLE_WORKER_TOKEN = "LOCAL_PRIVATE_TOKEN"` before running the Python command.

The script checks invalid-token rejection, reads live model IDs, submits test requests, and writes JSON containing duration, error counts, and sampled GPU metrics without generated story content.

## Quick response test from the UI

After registering, verifying, and selecting a remote model, **Test real response** explicitly requests one short generation without adding it to a story.

It can return client-to-GPU first-content latency, total duration, character count, available GPU health observations, and clear failure information. This is **one sample**, not a p95 benchmark or exact peak VRAM. For repeated measurements, use the notebook or `tools/worker_benchmark.py`.

An interrupted streaming response does not commit an incomplete narrative turn. This behavior has been tested with simulated disconnection; real network recovery is still a separate validation requirement.

## Troubleshooting

- Missing `nvidia-smi` or `nvcc`: check that a GPU runtime is actually allocated.
- Model cannot start: inspect `llama-server.log`, quantization, and context.
- HTTP 401 from `/v1/health`: recheck the bearer token; never publish port 5001 directly.
- Tunnel URL changed or disappeared: re-register it, since automatic reconnection is not available.
- Colab runtime expired: the primary PC still retains the saved local story.

**Code and references:** `apps/api/noble_api/workers.py`, `worker_server.py`, `tests/test_workers.py`, [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), and the concept references [Urakatsu workers](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/remote/workers.py) and [tunnels](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/remote/tunnel.py). Upstream implementations were not copied.
