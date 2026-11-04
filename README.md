# Noble AI

**Noble AI** es una futura aplicación de escritorio y web local para **historias interactivas tipo novela visual**, con narración mediante LLM, memoria de personajes y mundo, imágenes anime generadas por escena y voces **opcionales**. Combina herramientas open source existentes con una interfaz propia: **no es un notebook**, ni un chat ordinario.

> **Estado: P1.1 experimental.** Model Hub, lectura narrativa con presentación visual, identidad del protagonista, ilustración manual por historia, Ollama/KoboldCpp/OpenRouter y worker LLM GPU remoto con proxy autenticado. Configuración organizada por idioma, apariencia, proveedores, runtimes, atajos, red y actualizaciones. **El código y las pruebas automáticas no demuestran inferencia real con GPU, generación de imágenes/TTS, Colab administrado ni actualizador instalado.**

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
  ├─ Story Engine, event log, canon, ramas, memoria
  ├─ Model Hub (Hugging Face/archivos locales/licencias/compatibilidad)
  ├─ Runtime supervisor (dispositivos, arranque/parada, cambio seguro)
  ├─ Narrador: KoboldCpp / Ollama / server compatible (texto interactivo)
  ├─ Imágenes: ComfyUI (por evento de escena / explícito, caché)
  └─ TTS: Chatterbox / otros (solo opt-in, lazy)
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
| [Imágenes](docs/IMAGENES.md) · [TTS](docs/TTS.md) | Políticas media |
| [Perfiles GPU](docs/PERFILES_GPU.md) | 12/16GB, VRAM y límites |
| [Colab diagnóstico](docs/COLAB_A_LOCAL.md) | Pruebas opcionales, no UI |
| [Workers GPU remotos](docs/WORKERS.md) | Proxy autenticado, Cloudflare, conexión desde otras PC/Colab y limitaciones |
| [QA](docs/QA_Y_ACEPTACION.md) · [Seguridad](docs/SEGURIDAD_Y_LICENCIAS.md) | Criterios y límites |
| [Roadmap](docs/ROADMAP.md) · [Progreso](docs/PROGRESO.md) | Hitos, evidencia y problemas |
| [ADR-001](docs/adr/0001-stack-modular.md) · [ADR-002](docs/adr/0002-app-first-model-hub.md) | Decisiones |
| [AGENTS.md](AGENTS.md) | Instrucciones de implementación por agentes |

**Backlog GitHub:** [Issues #1–#12](https://github.com/Mairon31/novel_ai/issues). Prioridades nuevas: [Model Hub #9](https://github.com/Mairon31/novel_ai/issues/9), [Onboarding #10](https://github.com/Mairon31/novel_ai/issues/10), [Runtimes #11](https://github.com/Mairon31/novel_ai/issues/11), [Desktop #12](https://github.com/Mairon31/novel_ai/issues/12).

## Próximo resultado comprobable

**Siguiente hito:** ejecutar la primera inferencia real con un GGUF en la RTX 5060 Ti, registrar tiempo hasta el primer token y VRAM pico, mejorar importación y configuración de runtimes, y después implementar memoria de canon, reintento/ramas e ilustraciones progresivas. Los tests de motores utilizan simuladores de protocolos; una prueba real de GPU sigue pendiente.

## Laboratorio opcional de Colab

[Notebook de diagnóstico P0](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_ai_colab_smoke.ipynb). **No es el producto**: solo diagnóstico, tests de documentación y posibilidad de una inferencia real pequeña por separado.

No se incluyen checkpoints pesados, credenciales ni datos privados en Git. Respeta copyright/licencias de fuentes, modelos y recursos.
