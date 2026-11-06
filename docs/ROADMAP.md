# Hoja de ruta de Noble AI

## Plan operativo actualizado — Auditoría Argon (2026-11-05)

La ruta anterior que aparece a continuación refleja los hitos históricos P0–P5. A partir de esta revisión, la ejecución se sigue en [`TODO.md`](../TODO.md), derivado de las 22 secciones de [`ARGON_AUDITORIA.md`](ARGON_AUDITORIA.md); no se duplican allí fechas ni se marcan funcionalidades completas por mera presencia de un módulo. El trabajo se integra directamente en `master` y se evidencia en [`PROGRESO.md`](PROGRESO.md).

| Secuencia de dependencias | Entregable demostrable | Prueba o criterio de cierre |
| --- | --- | --- |
| Fase 1 / P0 | SQLite transaccional, contención de rutas, descargas resilientes, SSE cancelable y seguridad de credenciales | Rollback y 50 escrituras; rutas/links adversariales; transferencia interrumpida; GPU liberada al abortar |
| Fase 2 / P0–P1 | Arbitraje VRAM, ciclo de procesos gestionados, Model Hub V2 y ajuste según hardware real | 20–25 turnos texto/imagen sin OOM; comparación real de cuantizaciones y uso de memoria |
| Fase 3 / P1 | Canon por turno, testigos, Lorebooks, resumen y memoria híbrida con contextos presupuestados | Historia de 100–120 turnos, restauración exacta al bifurcar y presupuestos visibles |
| Fase 4 / P1 | Director de escena, caché de fondo, sprites emocionales, ComfyUI reproducible y voces por personaje | 10 turnos misma escena sin regenerar fondo, sprites instantáneos y TTS multivoz |
| Fase 5 / P1–P2 | Cuatro espacios de navegación, VN/Libro/Chat, Studio básico/avanzado, tarjetas PNG V2/V3 y mobile | URLs directas, importación válida, pruebas Playwright en desktop/móvil, sin falsas funciones |
| Fase 6 / P2–P3 | Paquete escritorio, benchmarks versionados y diferenciadores de producto | Instalador/portable real, informes reproducibles, exportación y regresiones medidas |

**Importante:** el código de `store.py` ya usa WAL, `narrative.py` ya transmite SSE y `downloads.py` ya usa Range y SHA-256 cuando hay hash anunciado. Ninguno de estos hechos certifica que las condiciones completas de su fase estén resueltas. La tabla de Argon usa etiquetas AUD-005/006/007 distintas de §05: el identificador estable y las subtareas se mantienen en el TODO.

## Cambio de prioridad por uso real en Colab — 2026-11-05

El usuario ejecutó Noble AI y verificó que aún faltan funciones esenciales de instalación/gestión de modelos de **imagen y TTS**, opciones completas, un orquestador fiable, un Model Hub comparable en profundidad al de Urakatsu y recorridos atractivos para **jugar y crear historias**. También pidió un Hub de historias completas de la comunidad y un Creator Studio capaz de producir una historia estructurada con sus recursos visuales; la historia de ejemplo actual no cumple esa expectativa.

**Nueva prioridad funcional:** producto **story-first / creator-first**. La administración de modelos no debe dominar el inicio. El plan **no se considera implementado** por incluirlo en documentación.

| Orden | Hito | Estado |
| --- | --- | --- |
| P0 | Instaladores UI de imágenes/TTS, ajustes específicos, orquestador de memoria/colas, QA Colab real | **Pendiente** |
| P1-A | Biblioteca y detalle centrados en jugar historias; historia demo completa y Story Hub local | **Pendiente** |
| P1-B | Creator Studio «idea → mundo/NPC/lore/escenas/imágenes» editable y verificable | **Pendiente** |
| P1-C | Model Hub independiente con detalle profundo, instalaciones reales y UX tipo Urakatsu; modularización del frontend | **Pendiente** |
| P1-D | Publicación/Hub remoto de creadores con permisos, moderación, paquetes versionados y licencias | **Pendiente** |
| P2 | Director visual automático, marketplace/colecciones más amplias y métricas reales del orquestador | **Pendiente** |

**Fuente detallada para la nueva etapa:** [FEEDBACK_COLAB_Y_BACKLOG.md](FEEDBACK_COLAB_Y_BACKLOG.md) (N-01 a N-15); checklist operativo en [TODO.md](../TODO.md). Hacer entregas verticales en \`master\`, sin forzar estas iniciativas en una única sesión.

---



## P1.5 — estado visual persistente y galería sin sobrescrituras (IMPLEMENTADO EN CÓDIGO)

- [x] Detector conservador de cambios de lugar en respuestas narrativas finalizadas; no consulta otro modelo.
- [x] Registro persistente de escenas con origen y modo de detección, corregible manualmente.
- [x] Cada importación y render crea versión WebP independiente, con SHA256 y selección por galería.
- [x] Migración no destructiva de `scene.webp` de versiones antiguas.
- [x] Fichas visuales y revisión de apariencia por personaje, integradas en prompts únicamente cuando se le nombra.
- [x] Previsualización del prompt enriquecido sin usar inferencia.
- [x] Caché exacta por seed/configuración/checkpoint/escena y rasgos pertinentes.
- [x] Clonación de galería y fichas por rama sin mezclar versiones de etapas posteriores.
- [ ] Extracción semántica estructurada de escenarios y presencia de personajes con validación humana.
- [ ] Consistencia visual respaldada por imagen de referencia, IPAdapter/LoRA, no solo prompts.
- [ ] Planner inteligente de imágenes con colas cancelables, límites de GPU y deduplicación multiworker.
- [ ] Proveedores de imágenes comerciales por API y generadores TTS por GPU/cloud.
- [ ] Administrador de VRAM real y prioridades entre LLM, difusión y TTS, incluyendo offload.
- [ ] Validación visual/multimedia con motores reales. Los benchmarks se harán agrupados.


## P1.4 — multimedia local conectable y canon permanente (IMPLEMENTADO EN CÓDIGO)

- [x] Editor de canon persistente por historia; se incluye en los mensajes de contexto del narrador. Memoria automática derivada, reconciliación de estado y ramas todavía pendientes.
- [x] Eventos SSE \`status\` para preparar contexto, conectar y transmitir; UI muestra segundos transcurridos y permite abortar.
- [x] ComfyUI bajo demanda: checkpoint por UI, workflow de difusión estándar, seed, parámetros, polling y WebP local validado; motor desconectado no bloquea LLM.
- [x] Piper CPU bajo demanda: detección de voces locales ONNX, validación de rutas, WAV por intervención con caché y botón Escuchar/Detener.
- [x] UI de multimedia responsive, accesos a ilustración desde el lector, controles independientes en Ajustes.
- [x] Pruebas simuladas ComfyUI + Pillow y Piper CLI falso + lectura WAV para verificar contratos.
- [ ] ComfyUI real con un modelo de imagen instalado (sin benchmark por ahora).
- [ ] Piper real con voz ES-LA, pruebas de entonación (sin benchmark por ahora).
- [ ] Detección automática de escenas y planificación visual por cambios de estado.
- [ ] Narración multicarácter, voces por personaje y TTS GPU/API.
- [ ] Identidad visual consistente, caché por versión de escena y planner GPU 12/16 GB.
- [ ] Ramas, resúmenes y mantenimiento automático del canon.
- **Gate P1.4:** CI verde en pruebas Python/React/Playwright, seguido de validación funcional con herramientas reales.

# Noble AI — Roadmap APP-FIRST y Definition of Done

Actualizado 2026-11-04 tras [ADR-002](adr/0002-app-first-model-hub.md). Estado: **P1 — Model Hub y prototipo narrativo ejecutables; sin pruebas de inferencia GPU real**. El orden de dependencias ha cambiado: el **Model Hub/Onboarding precede al núcleo narrativo**; Colab es diagnóstico opcional, no interfaz principal.

## Principios de trabajo

1. Ensamblar herramientas open source donde sea conveniente, evaluar licencias/costos.
2. El usuario final **nunca** debe necesitar editar configuración, instalar pesos por consola o ejecutar notebook para usar el producto.
3. UI y API deben ser funcionales desde el primer incremento; los mock providers son solo de pruebas.
4. Todas las funciones se certifican con tests CPU, integraciones reales cuando correspondan, QA visual desktop/móvil y logs.
5. Narración persiste; imagen/TTS opcionales nunca bloquean; 12/16GB sin afirmaciones no medidas.
6. Cambios de arquitectura requieren ADR y actualización de progreso, junto con evidencia.

## Fase P0 — investigación de reusable code y contratos (DOCUMENTADA)

- [x] README, GDD, arquitectura, memoria, API y QA iniciales.
- [x] Inventario de herramientas OSS y licencias.
- [x] Investigación técnica de Urakatsu MIT y Koharu dual MIT/Apache, rutas de código y modelo manager documentadas.
- [x] ADR-002 app-first y specs de Model Hub, UI wizard, escritorio.
- [x] Prueba CI de documentos básica; **no GPU/LLM**.
- [ ] Spike de reuso del catálogo Urakatsu vs `huggingface_hub`, evaluación del coste real y atribución.
- [ ] Selección y revisión exacta de versión/base de componentes reusables.
- **Gate P0:** contratos y licencias claros; todo lo no probado identificado.

## Fase P0.5 — aplicación visual y Model Hub (PRIMER OBJETIVO EJECUTABLE)

[Issue #9](https://github.com/Mairon31/novel_ai/issues/9) · [Issue #10](https://github.com/Mairon31/novel_ai/issues/10)

- [x] Crear frontend React/Vite/TS inicial con Biblioteca (aún no jugable), Model Hub, Descargas, Settings, Wizard y Diagnóstico.
- [x] Crear FastAPI y detección de hardware, disco y settings. **Supervisor de runtimes pendiente.**
- [ ] Wizard reanudable, elegir directorio de modelos, política de descarga y dispositivo; no requiere modelo para abrir UI.
- [x] Implementar búsqueda HF/metadata GGUF/variantes. **Validación live pendiente.**
- [ ] Estimar compatibilidad 12/16 GB con incertidumbre explícita y filtros por función.
- [ ] Descargas durables verificadas con jobs, pausa/reanudar/cancelar, importación local, registros instalados; UI con estados reales.
- [ ] Model assignment `narrator/image/tts` y parámetros por rol/capacidades, presets globales y overrides por historia.
- [ ] Sin descarga/ejecución automática de TTS al abrir configuraciones.
- [ ] Pruebas contract, integración descarga pequeña real, Playwright 390x844 y 1440x900, capturas.
- **Gate P0.5:** abrir app sin modelo, instalar/importar peso, reabrir y seleccionar desde UI con tests y logs reales.

## Fase P1 — narrator engine y persistencia jugable

[Backend #3](https://github.com/Mairon31/novel_ai/issues/3), [LLM #4](https://github.com/Mairon31/novel_ai/issues/4), [Runtimes #11](https://github.com/Mairon31/novel_ai/issues/11)

- [x] Integrar **adaptadores** KoboldCpp/Ollama y conectar motores existentes desde Configuración. Instalador automático del motor pendiente.
- [x] Lanzador KoboldCpp básico con start/stop, health y GPU layers (incl. CPU). **Swap/rollback, descarga runtime y OOM pendiente**.
- [ ] SQLite/Alembic: historias, personajes, canon, eventos, memorias y branching/retry.
- [x] Historia nueva, streaming, intervención libre, Continuar y reabrir después de reinicio. **Reintentar/Editar/ramas pendientes**.
- [x] Lector VN de texto responsive móvil/escritorio sin arte obligatorio. **Sprites/fondo pendiente P2**.
- [ ] 10 turnos con LLM real en GPU; tests de proveedor **simulados** pasan; idempotencia y recuperación probadas con mocks.
- **Gate P1:** desde UI seleccionar LLM, iniciar, generar historia, guardar/reintentar con evidencia real.

## Fase P1.1 — ajustes completos, lectura visual y LLM remoto (IMPLEMENTACIÓN EXPERIMENTAL)

- [x] Configuración persistente de idioma objetivo, traducción del prompt, estilo narrativo y apariencia.
- [x] Adaptador OpenRouter con clave no guardada en SQLite.
- [x] Identidad del protagonista, reader con escena e inspector, carga de imagen manual validada.
- [x] Diagnóstico de runtimes y comprobación de publicaciones stable/beta/nightly.
- [x] Registro de worker LLM Cloudflare, proxy Bearer token, activación de modelo remoto, UI y pruebas simuladas.
- [ ] QA final sin fallos del lector y del panel de workers en desktop/móvil.
- [ ] Colab real: GPU, túnel, latencia, reconexión y transferencia de contexto con tamaño seguro.
- [ ] Cliente LAN autenticado (el backend principal continúa solo loopback).
- [ ] Worker de imágenes y TTS con reserva de GPU y protocolos separados.
- [ ] Instalación de runtimes y actualizador de aplicación firmado/rollback.
- **Gate P1.1:** CI PASS y una inferencia remota real reproducible (aún no alcanzado).

## Fase P1.2 — ensayo remoto GPU (HERRAMIENTAS DISPONIBLES)

- [x] Medición autenticada de TTFT, duración, errores y VRAM muestreada.
- [x] Pantalla de estado remoto con GPU y latencia al comprobar worker.
- [x] Notebook Colab reproducible con llama.cpp CUDA y Cloudflare Quick Tunnel.
- [x] CLI de benchmark más tests offline de sus contratos.
- [ ] Medir inferencia de un GGUF real en Colab T4/L4 y conservar reporte.
- [ ] Probar fallos de red reales, recuperación de sesión y OOM.
- [ ] Medir perfiles reales de tarjetas de 12/16 GB.
- **Gate P1.2:** benchmark real ejecutado y adjuntado. Sigue pendiente.

## Fase P1.3 — Informe GPU real y siguiente validación de calidad (PARCIAL)

- [x] Primer LLM GGUF real funcionando con la API Noble AI: Qwen3-4B-Instruct-2507 Q4_K_M / Tesla T4, 3 generaciones completadas.
- [x] Registro reproducible del entorno, SHA256 del modelo y métricas de TTFT, duración, caracteres, uso GPU y VRAM muestreada.
- [x] Informe de hallazgos cold vs. warm con limitaciones de la muestra.
- [ ] Explicar y minimizar demora del primer turno en frío; progreso de inicialización en interfaz.
- [ ] Mejorar medición: estado de calentamiento, más respuestas steady-state y calidad textual.
- [ ] Confirmar narrador por túnel Cloudflare desde otra computadora (el benchmark local de Colab NO cubre conexión remota).
- [ ] Modelos mayores y 12/16 GB reales; difusión y TTS bajo control de GPU.
- **Gate P1.3:** calidad narrativa y arranque frío medidos separadamente en escenarios repetibles, sin falsear tokens/s.

## Fase P2 — ComfyUI, identidad y recursos visuales progresivos

[Issue #6](https://github.com/Mairon31/novel_ai/issues/6)
- [ ] Selección checkpoint/workflow/LoRA/seed/sampler/steps/CFG/resolución desde UI con capacidades reales.
- [ ] ComfyUI job API, validación de workflow, cache/manifest, GPU leases, fallback.
- [ ] Generación por cambio visual material de escena o click; no una imagen por cada turno.
- [ ] Consistencia personaje con identity profile, versiones de vestuario y QA de 10 escenas.
- [ ] Prueba 10 diálogos en misma escena ⇒ 0 imágenes; cambio de escena ⇒ máximo 1 job.
- **Gate P2:** escena real generada, reutilizada y asociada a rama correcta sin bloquear narración.

## Fase P3 — TTS configurable bajo demanda

[Issue #7](https://github.com/Mairon31/novel_ai/issues/7)
- [ ] Seleccionar motor/voz/idioma/CPU/GPU/Auto desde ajustes si el motor lo soporta.
- [ ] Lazy worker, audio por personaje y caché por texto/voz/versiones.
- [ ] OFF por defecto, escuchar manual, autolectura solo opt-in.
- [ ] 50 turnos OFF ⇒ 0 llamadas a TTS; síntesis real y rendimiento registrados.
- **Gate P3:** audio real manual, controles funcionan y errores no afectan texto.

## Fase P4 — UI completa y empaquetado Windows

[Frontend #5](https://github.com/Mairon31/novel_ai/issues/5), [Desktop #12](https://github.com/Mairon31/novel_ai/issues/12)
- [ ] Biblioteca, editor visual de historias/personajes, galería, import/export.
- [ ] Tauri 2 (candidato) con sidecar FastAPI y launcher, instalación sin consola, datos en carpeta personalizable.
- [ ] Verificación de updates, permisos, LAN opt-in segura y fallos de proceso.
- [ ] QA visual mobile/desktop y pruebas reales del instalador/ejecutable.
- **Gate P4:** abrir app de escritorio y terminar un capítulo sin editar archivos a mano.

## Fase P5 — mediciones reales de memoria y portabilidad

[GPU #8](https://github.com/Mairon31/novel_ai/issues/8), [Colab #1](https://github.com/Mairon31/novel_ai/issues/1)
- [ ] Medir equipos NVIDIA 12 GB y RTX 5060 Ti 16 GB con modelos/versión/hashes exactos.
- [ ] Ensayar secuencia texto→imagen→voz, offload, OOM, RAM/VRAM/p95 y persistencia.
- [ ] Colab **opcional** para diagnósticos y modelos de laboratorio; no exigirlo para instalar/usar.
- [ ] CI de app, contract/integration/e2e, restauración, performance, documentación y licencias.
- **Gate P5:** informe reproducible 12/16GB y limitaciones; no marcar soporte sin hardware correspondiente.

## Definition of Done por issue/PR

- Código real, API/estados validados y test plan explícito.
- Comandos y resultados reales; capturas Playwright desktop/móvil para UI.
- Hash de pesos y revisión de proveedor; atribución de fuentes si reusamos código.
- Confirmar estados de botones y errores: no controles visuales vacíos.
- Verificar que no se carguen modelos por navegar Settings/Model Hub.
- En tests GPU indicar equipo, driver, backend, preset y pico VRAM.
- Actualizar README, ADR, `docs/PROGRESO.md`, mapa de issues; no ocultar FAIL.

## Enlaces

[Model Hub](MODEL_HUB.md) · [Onboarding](ONBOARDING_Y_UI.md) · [Referencias Urakatsu/Koharu](REFERENCIAS_URAKATSU_KOHARU.md) · [App desktop](DESKTOP_Y_DESPLIEGUE.md) · [Issues](https://github.com/Mairon31/novel_ai/issues)

### P1.4 — ampliación funcional completada

- [x] Canon editable por historia, reinyectado al contexto del narrador.
- [x] Ramas independientes desde cualquier turno guardado con copia de historia/imagen y enlace a origen.
- [x] Preparación manual del modelo vía API sin escribir turnos de prueba ni cargar GPU en startup.
- [x] UI de progreso de inferencia, espera y cancelación.
- [ ] Árbol de ramas, merge/rewind, gestión de conflictos y cache por rama.
- [ ] Extracción automática, auditable y configurable de hechos de los capítulos.
- [ ] Controlador GPU/CPU multinivel de ComfyUI, LLM y TTS.



## Referencias de imagen y recursos GPU

- [x] Img2img con VAEEncode de ComfyUI; cargar una versión WebP de la galería como composición inicial.
- [x] Control seguro del archivo de referencia por historia y firma SHA256.
- [x] Denoise seleccionable y cache reproducible por referencia, semilla, prompt y configuración.
- [x] Consulta bajo demanda de VRAM global observada con nvidia-smi, sin presuponer modelos concretos.
- [x] Opción de admisión por reserva mínima y sobreescritura explícita por solicitud.
- [ ] IPAdapter/FaceID, consistencia visual a nivel identidad sin cambios indeseados.
- [ ] Gestor de prioridades/orquestación para offload y transferencia LLM-ComfyUI-TTS.
- [ ] Telemetría de memoria por proceso, GPUs múltiples y CUDA con checkpoints heterogéneos.


## Motor visual y tareas locales (implementado en código)

- [x] Planes específicos por escena: composición, plano, luz, atmósfera y reparto con referencias persistentes.
- [x] Referencia visual asignable a cada personaje desde una imagen de la galería, validada y copiable a ramas.
- [x] Previsualización del prompt planificado sin cargar modelos.
- [x] Bloqueo opcional de generación simultánea local de LLM y difusión, liberado al finalizar o fallar.
- [x] Protección frente a duplicación concurrente de escena inicial en SQLite.
- [ ] Conditioning multi-referencia y control consistente de identidad (IPAdapter/LoRA/etc.).
- [ ] Cola persistente y scheduler consciente de GPU disponible, prioridades/cancelación y descarga real de pesos.

## Crear historias con capas visuales — módulo autor

- [x] Gestionar fondos WebP y sprites PNG alfa por historia.
- [x] Captions de aparición, selección conservadora por palabras completas y mapeo a NPC.
- [x] Compositor visual básico en el lector con archivos existentes; no genera imágenes automáticamente.
- [x] Aislamiento de recursos y remapeo de personajes al bifurcar historias.
- [x] Model Hub con filtros interactivos de compatibilidad y medidor visual de demanda de memoria.
- [ ] Visor de expresión y pose múltiple por personaje; animaciones, capas y posicionamiento.
- [ ] Motor de coincidencias semánticas revisable, con reglas por escena y sin invenciones.
- [ ] Instalación efectiva de modelos de imagen, TTS y reportes de compatibilidad por runtime.


### N-08/N-09 — avance parcial en Story Hub local

Existe un catálogo de tres historias originales de texto, instalables como copia independiente con NPC, aperturas y Lorebooks desde Biblioteca. La demo de Colab puede usar el paquete enriquecido sin sobrescribir una biblioteca anterior. [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781) supera 358 Python y 68 Playwright. **N-08 y N-09 continúan abiertas** hasta tener arte, paquetes externos y QA real de inmersión. N-10 (publicación/comunidad online) no se implementó. [Documentación](STORY_HUB.md).

- [x] Navegación `#/descubrir` independiente agregada como base para descubrimiento remoto futuro; el contenido actual continúa siendo local y sin servidor comunitario.


### N-07 — primer corte implementado, alcance restante abierto (2026-11-06)

Creator Studio ya incluye asistente de propuesta narrativa de 3 etapas mediante el proveedor de LLM configurado: mundo público/privado, cuatro NPC, tres Lorebooks y tres aperturas, con previsualización y confirmación de instalación SQLite. No confundir con generación integral de novelas ilustradas. Faltan edición granular del borrador, regeneración por componente, planes visuales, portadas, fondos, sprites, TTS y QA de historias extensas con GPU real. Ver STORY_HUB.md y TODO.md.
