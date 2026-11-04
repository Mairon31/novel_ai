# Noble AI

**Noble AI** es un laboratorio abierto de arquitectura para una novela visual / RPG narrativo interactivo **local-first**, con personajes persistentes, historias editables, ilustraciones bajo demanda y voces opcionales.

> Estado: **P0 — planificación técnica e investigación**. La documentación define diseño y criterios de aceptación; **no implica que el motor, los conectores o las pruebas de GPU ya estén implementados**.

## Principios de producto

- **Ensamblar antes de reescribir**: motores existentes para LLM, imágenes y TTS; el código propio se concentra en orquestación, estado y experiencia de usuario.
- **Una historia puede comenzar sin imágenes**; cada escena nueva evalúa si necesita fondo/sprite/CG, reutiliza assets anteriores y solo genera bajo demanda.
- **TTS desactivado por defecto**: únicamente al solicitarlo explícitamente (pulsación o ajuste de autolectura activado por el usuario).
- **LLM siempre disponible** mientras dure la sesión: servicio iniciado y modelo residente cuando sea viable; uso de offload y cola de GPU sin perder el contexto narrativo.
- **Hardware objetivo**: GPU NVIDIA de **12 GB** como mínimo de diseño y **16 GB** recomendado; RAM, contexto y tamaños de modelos determinan el perfil real. Almacenamiento no es un límite de producto.
- **Colab primero** para pruebas reproducibles en cuaderno; **Windows/NVIDIA después** con la misma API/contratos. La disponibilidad de GPU de Colab no está garantizada.
- **Español latinoamericano natural** como idioma inicial; arquitectura preparada para localización.
- **No se da por hecho el funcionamiento**: cada componente se marca como propuesto, integrado, verificado o bloqueado, con pruebas reproducibles.

## Documentación

| Documento | Finalidad |
|---|---|
| [GDD técnico](docs/GDD_TECNICO.md) | Juego, UX, reglas de historia y requisitos |
| [Arquitectura](docs/ARQUITECTURA.md) | Módulos, colas, eventos y despliegue |
| [Catálogo de repositorios](docs/REPOSITORIOS_OPEN_SOURCE.md) | Herramientas, licencias, enlaces, decisiones y pruebas pendientes |
| [ADR-001: stack](docs/adr/0001-stack-modular.md) | Selección inicial y alternativas |
| [Contratos API](docs/CONTRATOS_API.md) | Endpoints y esquemas acordados |
| [Estado y memoria](docs/ESTADO_Y_MEMORIA.md) | Persistencia, episodios, continuidad y regresión |
| [Imágenes bajo demanda](docs/IMAGENES.md) | Activación, identidad y políticas de caché |
| [TTS opt-in](docs/TTS.md) | Reglas, voces, caché, consentimiento |
| [Perfiles GPU](docs/PERFILES_GPU.md) | Presupuestos orientativos 12/16 GB |
| [Colab a local](docs/COLAB_A_LOCAL.md) | Estrategia reproducible y límites |
| [Pruebas y aceptación](docs/QA_Y_ACEPTACION.md) | Matriz de pruebas, métricas y criterios |
| [Seguridad y licencias](docs/SEGURIDAD_Y_LICENCIAS.md) | Aislamiento de servicios y obligaciones |
| [Plan por fases](docs/ROADMAP.md) | Hitos, tareas y definiciones de terminado |
| [Bitácora](docs/PROGRESO.md) | Hechos verificables, pendientes y bloqueos |
| [Guía para agentes](AGENTS.md) | Convenciones de implementación y documentación |

## Primera meta tangible

Un **vertical slice** reproducible: iniciar una historia, escribir como protagonista, recibir texto en streaming, persistir eventos/estado, continuar o reintentar sin contradicciones y generar **solo a pedido** una ilustración de escena; TTS únicamente si el usuario pulsa escuchar. Todo con un único endpoint de aplicación y adaptadores intercambiables, primero probado en Colab y luego en Windows.

## Repositorio

Origen: https://github.com/Mairon31/novel_ai

Ningún modelo pesado ni archivo sensible se incorpora a Git; los pesos se descargan por separado. El inventario de terceros no equivale a permiso para copiar su código ni a validación de sus modelos.
