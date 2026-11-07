# Noble AI — optional Google Colab testing

**Status:** an experimental laboratory tool, not the default product interface. [ADR-002](adr/0002-app-first-model-hub.md) replaced the former Colab-first approach.

## Current product direction

End users should open the visual Noble AI application, browse and install supported models through Model Hub, configure providers and hardware from Settings, and play stories without opening Colab.

The early P0 notebook exists for reproducible experimental diagnostics and GPU tests, not to configure every application launch. Colab sessions are ephemeral and GPU availability is not guaranteed. Free Colab usage is subject to its published restrictions; do not add public tunnels or anti-idle behavior to bypass service limits. See the [Colab FAQ](https://research.google.com/colaboratory/faq.html).

## Appropriate notebook tasks

- Check out an exact commit and record hardware, CUDA/PyTorch/Python versions, VRAM, disk, and environment details.
- Run repository structural, documentation, and unit tests.
- Perform a **small** real inference experiment with `Qwen/Qwen3-1.7B` when a GPU is available; this does not represent production narrator quality or validate GGUF/ComfyUI/TTS.
- Export evidence as JSON with explicit `PASS / FAIL / SKIP / NOT_RUN` states.
- Test backend adapters separately when an experimental workload requires them.
- Avoid using Colab as a permanent server or a mandatory model-installation service.

## Primary development workflow

1. Develop and run the React/FastAPI application locally.
2. Run CPU-suitable automated tests through GitHub Actions.
3. Validate the complete Windows/NVIDIA user journey: setup → Hugging Face lookup → download/import → assignment → LLM start → first story turn.
4. Use Colab **optionally** for hardware-intensive comparisons, recording the exact model, GPU, hashes, and logs.
5. Plan the Windows desktop shell only after local web behavior is sufficiently stable.

## Optional evidence gates

- `COLAB_DIAG`: report environment and execution states accurately.
- `COLAB_CONTRACT`: run applicable project contract tests.
- `COLAB_LLM_GGUF_REAL`, `COLAB_IMAGE_REAL`, `COLAB_TTS_MANUAL`: not considered complete until real provider checks exist.
- `WINDOWS_16GB`, `WINDOWS_12GB`: separate physical machine targets; Colab results cannot substitute for them.

The original P0 smoke notebook remains available for diagnostics and must not block core UI or story development.

[Notebook P0](../notebooks/noble_ai_colab_smoke.ipynb) · [Model Hub](MODEL_HUB.md) · [Desktop deployment](DESKTOP_Y_DESPLIEGUE.md) · [QA](QA_Y_ACEPTACION.md)
