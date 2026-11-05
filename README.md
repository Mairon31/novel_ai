# Noble AI

**Noble AI** es una futura aplicación de escritorio y web local para **historias interactivas tipo novela visual**, con narración mediante LLM, memoria de personajes y mundo, imágenes anime generadas por escena y voces **opcionales**. Combina herramientas open source existentes con una interfaz propia: **no es un notebook**, ni un chat ordinario.

> **Estado: P1.4 experimental — desarrollo activo.** Model Hub, narración real (ensayo GGUF Colab T4 documentado), historias persistentes, canon editable, ramas alternativas por intervención, preparación opcional del modelo y estados visibles de generación; ComfyUI **bajo demanda** para checkpoints compatibles y Piper CPU **bajo demanda** para voces locales ONNX. También hay trabajadores remotos LLM autenticados y configuración de proveedores. **ComfyUI y Piper tienen código y pruebas de contrato, pero aún no benchmarks reales en GPU/CPU con estos proveedores.** El detector automático de cambios de escena, workflows avanzados, TTS GPU/API, árbol visual de ramas avanzado, reconciliación automática del canon y empaquetado Windows siguen pendientes.

## Ejecutar prototipo en Windows (sin Colab)

Requiere Python 3.11+, Node.js 22+ y Git. Abre PowerShell:

```powershell
git clone https://github.com/Mairon31/novel_ai.git
cd novel_ai
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
npm --prefix apps\web install
npm --prefix apps\web run build
.\.venv\Scripts\python.exe -m uvicorn noble_api.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Abre **http://127.0.0.1:8000**. Busca y descarga un GGUF desde Model Hub; en **Configuración** puedes iniciar KoboldCpp con ese archivo o conectar Ollama, y en **Biblioteca** crear y continuar una historia. Todavía hay que suministrar el ejecutable de KoboldCpp o un servidor Ollama existente. [Guía detallada P1](docs/QUICKSTART.md).

## Experiencia final propuesta

1. **Instalar y abrir Noble AI**: app web local con futuro paquete Windows `.exe`, sin que el usuario final tenga que editar `.env` ni descargar modelos a mano.
2. **Asistente de configuración inicial**: idioma, detección CPU/GPU y VRAM, carpeta de modelos/proyectos, modelos/proveedores opcionales.
3. **Model Hub integrado**: descubrir modelos en Hugging Face, comparar cuantizaciones, ver licencias y compatibilidad estimada, descargar con progreso/reanudar, importar archivos locales, elegir modelo para narración, imágenes y TTS.
4. **Personalizar cada proveedor**: KoboldCpp/Ollama/API compatible; ComfyUI y checkpoints/LoRAs/workflows; Chatterbox y otras voces, CPU/GPU/Auto **si el backend lo permite**; perfiles por defecto y por historia.
5. **Crear y jugar**: biblioteca, editor de mundo/personajes, pantalla VN con sprites, fondo, historia, Hacer/Decir/Narrar, Continuar, Reintentar, historial y ramas.
6. **Medios progresivos**: las ilustraciones se crean cuando cambia una escena/identidad o se solicitan y se reutilizan; **TTS OFF por defecto** y sin carga hasta que el usuario pulse Escuchar/active conscientemente la autolectura.
7. **Usar sin Internet** una vez obtenidos modelos y dependencias compatibles; Colab queda para benchmarks y experimentos opcionales, **no como entorno principal del producto**.

## Arquitectura

```text
Noble AI UI (React/Vite/TS)
  ├─ Biblioteca / Studio / Novela visual
  ├─ Asistente inicial / Model Hub / Descargas / Ajustes
  └─ Diagnóstico CPU/GPU y proveedores
           │ REST + SSE / localhost
           ▼
FastAPI Orchestrator + SQLite + Model Registry + Download Queue
  ├─ Story Engine, turnos SQLite + canon persistente + fork de ramas (estado automático pendiente)
  ├─ Model Hub (Hugging Face/archivos locales/licencias/compatibilidad)
  ├─ Runtime supervisor (dispositivos, arranque/parada, cambio seguro)
  ├─ Narrador: KoboldCpp / Ollama / server compatible (texto interactivo)
  ├─ Imágenes: ComfyUI local (ilustrar explícitamente, WebP validado)
  └─ TTS: Piper CPU (solo botón Escuchar, caché WAV); GPU/TTS cloud pendientes
           │
  Tauri 2 (candidato futuro de .exe; shell/sidecar, NO implementado)
```

Diseño dirigido a GPUs NVIDIA de **12 GB VRAM como perfil objetivo** y **16 GB recomendado**; compatibility real depende del modelo/configuración/offload, y se validará con benchmarks registrados, sin inventar rendimiento.

## Documentación

| Archivo | Contenido |
|---|---|
| [GDD técnico](docs/GDD_TECNICO.md) | Qué es el juego, gameplay/UX y criterios |
| [Arquitectura](docs/ARQUITECTURA.md) | Servicios, estado, colas y contratos |
| [Model Hub](docs/MODEL_HUB.md) | Catálogo, variantes, descargas, registros, proveedores, parámetros y API |
| [Primer inicio e interfaz](docs/ONBOARDING_Y_UI.md) | Wizard, Model Hub y diseño VN |
| [Urakatsu y Koharu](docs/REFERENCIAS_URAKATSU_KOHARU.md) | Análisis de código/licencias/reuso |
| [Empaquetado escritorio/web](docs/DESKTOP_Y_DESPLIEGUE.md) | React, FastAPI, Tauri sidecar y estrategia |
| [Repositorio OSS](docs/REPOSITORIOS_OPEN_SOURCE.md) | Catálogo completo de componentes existentes |
| [API](docs/CONTRATOS_API.md) | Endpoints y eventos |
| [Estado y memoria](docs/ESTADO_Y_MEMORIA.md) | Historias, continuidad, ramas |
| [Imágenes](docs/IMAGENES.md) · [TTS](docs/TTS.md) | Adaptadores disponibles y planes |
| [Integración multimedia](docs/MULTIMEDIA_LOCAL.md) | Preparar ComfyUI/Piper, configurar modelos, límites y fallos |
| [Perfiles GPU](docs/PERFILES_GPU.md) | 12/16GB, VRAM y límites |
| [Colab diagnóstico](docs/COLAB_A_LOCAL.md) | Pruebas opcionales, no UI |
| [Colab worker GPU](notebooks/noble_worker_colab_gpu.ipynb) | GPU CUDA + llama.cpp + túnel autenticado + benchmark |
| [Benchmark de workers](tools/worker_benchmark.py) | TTFT, fallos y VRAM sin registrar texto o claves |
| [Workers GPU remotos](docs/WORKERS.md) | Proxy autenticado, Cloudflare, conexión desde otras PC/Colab y limitaciones |
| [QA](docs/QA_Y_ACEPTACION.md) · [Seguridad](docs/SEGURIDAD_Y_LICENCIAS.md) | Criterios y límites |
| [Roadmap](docs/ROADMAP.md) · [Progreso](docs/PROGRESO.md) | Hitos, evidencia y problemas |
| [ADR-001](docs/adr/0001-stack-modular.md) · [ADR-002](docs/adr/0002-app-first-model-hub.md) | Decisiones |
| [AGENTS.md](AGENTS.md) | Instrucciones de implementación por agentes |

**Backlog GitHub:** [Issues #1–#12](https://github.com/Mairon31/novel_ai/issues). Prioridades nuevas: [Model Hub #9](https://github.com/Mairon31/novel_ai/issues/9), [Onboarding #10](https://github.com/Mairon31/novel_ai/issues/10), [Runtimes #11](https://github.com/Mairon31/novel_ai/issues/11), [Desktop #12](https://github.com/Mairon31/novel_ai/issues/12).

## Próximo resultado comprobable

**Siguiente hito:** validar los adaptadores ComfyUI y Piper con procesos reales, implementar identificación de escenas, administrar la VRAM compartida entre narrador/difusión/voz y avanzar en árbol visual de ramas, consistencia de personajes y empaquetado. El primer LLM GGUF real se validó en Colab T4; sigue pendiente probarlo en la RTX 5060 Ti y medir multimedia real.

## Laboratorio opcional de Colab

[Notebook de diagnóstico P0](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_ai_colab_smoke.ipynb). **No es el producto**: solo diagnóstico, tests de documentación y posibilidad de una inferencia real pequeña por separado.

No se incluyen checkpoints pesados, credenciales ni datos privados en Git. Respeta copyright/licencias de fuentes, modelos y recursos.

### Colab QA — versión vigente

El notebook oficial es **[Noble AI QA Integral v1.5](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_ai_colab_qa_integral_v1_5.ipynb)**, ubicado en `notebooks/noble_ai_colab_qa_integral_v1_5.ipynb`.

Despliega React y FastAPI en Colab, prueba Python y Playwright, descarga un GGUF Qwen3 4B con revisión y SHA256 fijados, ejecuta inferencia en NVIDIA cuando está disponible y exporta `Noble_AI_Colab_QA_v1_5.zip` con logs y métricas. **Separa la primera generación en frío de las posteriores**, comprueba turnos guardados en SQLite y puede incluir muestras del texto ficticio generado para evaluar coherencia (solo historia de prueba del notebook; se puede desactivar con `CAPTURE_SYNTHETIC_TEXT = False`).

**Primera evidencia GPU real:** [Informe QA v1.4](docs/COLAB_QA_V14_RESULTADOS.md) — Tesla T4, 20 etapas PASS, 3/3 respuestas narrativas reales, 3.161 MiB de VRAM máxima observada. La primera respuesta tardó 53,53 s y las dos siguientes 2,43 s; todavía no se conoce la causa precisa del tiempo en frío. No demuestra automáticamente rendimiento en una RTX 5060 Ti de 16 GB, generación de imágenes, TTS ni uso del túnel de workers.

Historial de fallos conservado: [v1.2](docs/COLAB_QA_2026-11-05.md) (dependencias y compilación CUDA), [v1.3](docs/COLAB_QA_V13_RESULTADOS.md) (archivo GGUF 404). Los notebooks antiguos fueron retirados; los tests de regresión sobre logs y CUDA ahora comprueban la versión vigente para que GitHub Actions no dependa de archivos archivados.
