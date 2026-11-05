## 01 — Resumen ejecutivo

El proyecto auditado, denominado internamente Noble AI dentro del paquete del repositorio novel_ai, posee una arquitectura dividida entre un plano de control backend en Python y un cliente web en TypeScript con React y Vite. A diferencia de los clientes de chat elementales, el código fuente demuestra un diseño orientado a la producción de novelas visuales interactivas con soporte multimodal e infraestructura híbrida local y remota.

**Principales fortalezas estructurales:**

* Separación modular en el backend bajo **apps/api/noble_api/** que distingue catálogo, hardware, cálculo de ajuste de modelos, descargas, motor narrativo, planificador escénico, imágenes, voz y workers.


* Existencia de un sistema de pruebas amplio con 25 archivos de pruebas en Python bajo **tests/** y 10 especificaciones E2E de Playwright en **apps/web/tests/**.


* Documentación técnica y registros de decisiones de arquitectura (ADR) explícitos en **docs/** y **docs/adr/** que trazan el diseño del Model Hub, workers remotos y estado narrativo.


* Cobertura funcional que contempla integración con ComfyUI (**images.py**), síntesis de voz Piper (**speech.py**), ramas narrativas (**test_story_branches.py**) y canon de historia (**test_story_canon.py**).



**Principales debilidades y limitaciones detectadas:**

* **Limitación de evidencia estática:** La inspección directa del contenedor ZIP adjunto permite verificar el 100% del árbol de archivos y cabeceras, pero los bloques internos comprimidos requieren ejecución en vivo para medir latencias reales.


* **Acoplamiento en el frontend:** La interfaz concentra diez módulos de vistas (**App.tsx**, **CreatorStudio.tsx**, **StoryStudio.tsx**, **VisualReader.tsx**, **RuntimeManager.tsx**) en un único nivel de directorio sin separación por dominios.


* **Riesgo de contención de VRAM:** Ejecutar modelos de lenguaje junto con flujos de difusión de ComfyUI y síntesis de voz requiere un arbitraje estricto con descarga activa de pesos en **resource_policy.py** para evitar colapsos de memoria en GPUs de 8 GB a 16 GB.


* **Brecha de memoria semántica:** El sistema de estado y canon necesita evolucionar hacia una arquitectura híbrida con Lorebooks por palabras clave y búsqueda vectorial local sobre SQLite para sostener historias de cientos de capítulos.

**Conclusión técnica:** El proyecto no requiere una reescritura desde cero; su base en Python y React/TypeScript es sólida y debe evolucionar consolidando transacciones atómicas en **store.py**, memoria multicapa en **narrative.py**, composición visual por capas en **VisualReader.tsx** y un árbitro de recursos GPU determinista.

## 02 — Inventario del proyecto

El repositorio **novel_ai-1368e21f8f14684e02ef5661f296817124f5cd3f/** se estructura como un monorepo ligero que agrupa el plano de control API, la aplicación web, archivos de configuración declarativa, cuadernos de validación en Google Colab, herramientas de benchmarking y documentación técnica.

### Estructura verificada del repositorio

* **Raíz y gobierno del proyecto:** Incluye **.env.example**, **.gitignore**, **AGENTS.md**, **CONTRIBUTING.md**, **README.md** y flujos de integración continua en **.github/workflows/p0-docs.yml** y **publish-readme-screenshots.yml**.


* **Backend API (apps/api/noble_api/):** Compuesto por 20 módulos Python especializados y el archivo de dependencias **apps/api/requirements.txt**.


* Núcleo y persistencia: ****init**.py**, **main.py**, **control.py**, **store.py**, **secrets.py**.


* Gestión de modelos y hardware: **catalog.py**, **hardware.py**, **model_fit.py**, **model_storage.py**, **downloads.py**, **resource_policy.py**, **runtime.py**.


* Motor narrativo y autoría: **narrative.py**, **creator.py**, **creator_media.py**, **scene_planner.py**, **visual_state.py**.


* Multimodalidad y workers: **images.py**, **speech.py**, **media.py**, **workers.py**, **worker_server.py**, **worker_telemetry.py**.




* **Frontend Web (apps/web/):** Aplicación SPA construida con Vite (**vite.config.ts**), TypeScript (**tsconfig.json**) y Playwright (**playwright.config.ts**).


* Vistas y componentes en **apps/web/src/**: **main.tsx**, **App.tsx**, **VisualReader.tsx**, **StoryStudio.tsx**, **StoryDetail.tsx**, **CreatorStudio.tsx**, **NarrativeSettings.tsx**, **CreativeSettings.tsx**, **RuntimeManager.tsx**, **RemoteWorkers.tsx**, **WorkspaceSettings.tsx**.


* Capa de datos y estilos en **apps/web/src/**: **api.ts**, **types.ts**, **modelCatalogCache.ts** y **styles.css**.




* **Configuración declarativa (config/):** Contiene **gpu_profiles.json**, **model_assignments.example.json**, **model_assignments.schema.json** y **model_manifest.example.json**.


* **Documentación y arquitectura (docs/):** Alberga 21 documentos técnicos (incluyendo **ARQUITECTURA.md**, **CONTRATOS_API.md**, **ESTADO_Y_MEMORIA.md**, **GDD_TECNICO.md**, **IMAGENES.md**, **ISEKAI_ZERO_REFERENCIA.md**, **MODEL_HUB.md**, **WORKERS.md**), 3 ADRs en **docs/adr/** y capturas en **docs/assets/screenshots/**.


* **Infraestructura Colab y herramientas (notebooks/, scripts/, tools/):** Incluye 4 cuadernos Jupyter para pruebas y despliegue de GPU en Colab, **scripts/probe_hf_catalog.py**, **tools/colab_hf_model.py** y **tools/worker_benchmark.py**.


* **Suites de pruebas (tests/ y apps/web/tests/):** Reúne 25 suites de pruebas unitarias e integración para el backend y 10 suites E2E en Playwright para la interfaz web.



### Matriz de stack tecnológico real

| Capa | Tecnología / Módulos | Propósito en el proyecto | Estado |
| --- | --- | --- | --- |
| Backend API | Python, FastAPI (**noble_api**) | Plano de control local, API y orquestación | Confirmado |
| Frontend UI | React, TypeScript, Vite | Interfaz de usuario, estudios y lector visual | Confirmado |
| Multimodalidad | ComfyUI (**images.py**), Piper (**speech.py**) | Generación de escenas y síntesis de voz local | Confirmado |
| Infraestructura | Local + Colab (**workers.py**) | Ejecución híbrida de inferencia y benchmarks | Confirmado |
| QA y Testing | Pytest (**tests/**), Playwright (**apps/web/tests/**) | Validación de API, contratos, UI y regresiones | Confirmado |

La tabla resume la pila tecnológica verificada directamente a partir de los artefactos del repositorio.

## 03 — Mapa de funcionamiento

La reconstrucción funcional de extremo a extremo muestra cómo interactúan el frontend, el plano de control local y los servicios de inferencia a través de los módulos del sistema.

* **1. Inicio de la aplicación e inicialización de servicios:** El servidor arranca desde **apps/api/noble_api/main.py** apoyándose en **control.py** y **store.py** para cargar las preferencias del espacio de trabajo, el inventario de modelos en **model_storage.py** y los perfiles de hardware desde **hardware.py** y **config/gpu_profiles.json**. En paralelo, el cliente web monta **apps/web/src/main.tsx** y **App.tsx**, hidratando el catálogo mediante **modelCatalogCache.ts** y **api.ts**.


* **2. Instalación, evaluación y carga de modelos:** El usuario explora modelos en **RuntimeManager.tsx**; el backend consulta metadatos mediante **catalog.py** y evalúa la compatibilidad física contra la GPU detectada usando **model_fit.py**. Al solicitar una descarga, **downloads.py** gestiona la transferencia hacia el disco administrado por **model_storage.py**, mientras **runtime.py** y **resource_policy.py** asignan el modelo al rol activo según **config/model_assignments.schema.json**.


* **3. Creación de personajes y recursos de autor:** Desde **CreatorStudio.tsx**, el usuario define fichas de personajes y sube retratos o recursos gráficos. Las peticiones pasan por **api.ts** hacia **creator.py** y **creator_media.py**, los cuales validan los activos multimedia y los registran en **store.py**.


* **4. Creación de una historia y configuración de ramas:** En **StoryStudio.tsx** y **StoryDetail.tsx**, el autor establece la premisa, el canon inicial, las reglas narrativas (**NarrativeSettings.tsx**) y los personajes vinculados. Estos datos se estructuran y almacenan mediante **narrative.py** y **store.py**, habilitando el soporte de ramas validado en **tests/test_story_branches.py**.


* **5. Inicio de conversación y preparación de contexto:** Cuando el jugador envía una acción desde **VisualReader.tsx**, el backend ejecuta la fase de preparación narrativa (verificada por la existencia de **tests/test_narrative_prepare.py**) dentro de **narrative.py**. Esta etapa reúne el canon de la historia, el estado actual de la rama y el historial reciente para ensamblar el prompt final.


* **6. Selección e invocación del LLM y persistencia:** El módulo **narrative.py** delega la inferencia a **runtime.py**, el cual decide si ejecutar localmente o enrutar la petición a un nodo remoto registrado en **workers.py** y **worker_server.py**. Una vez generada la respuesta, **store.py** persiste el turno y actualiza los hechos canónicos de la sesión.


* **7. Planificación escénica, generación de imágenes y voz:** Tras el turno narrativo, **scene_planner.py** y **visual_state.py** evalúan la escena resultante para determinar los descriptores visuales. El coordinador **media.py** junto con **resource_policy.py** arbitran el uso de GPU para invocar a **images.py** (workflows de ComfyUI) y a **speech.py** (síntesis con Piper TTS), devolviendo los recursos al lienzo de **VisualReader.tsx**.



## 04 — Auditoría por módulos

La evaluación técnica clasifica cada módulo del repositorio diferenciando la arquitectura comprobada de los aspectos cuya validación interna requiere ejecución en vivo.

### Evaluación de módulos de Backend (apps/api/noble_api/)

| Módulo | Responsabilidad principal | Clasificación técnica | Pruebas asociadas |
| --- | --- | --- | --- |
| **main.py** y **control.py** | Punto de entrada API y plano de control | Implementado pero acoplado en rutas | **test_api_model_hub.py** |
| **catalog.py** y **model_fit.py** | Catálogo HF y cálculo de viabilidad en GPU | Implementado y bien estructurado | **test_model_hardware_fit.py** |
| **downloads.py** y **model_storage.py** | Descarga y gestión en disco de pesos | Implementado parcialmente (falta Range/SHA) | **test_model_storage.py** |
| **hardware.py** y **resource_policy.py** | Detección de GPU y política de recursos | Arquitectónicamente crítico | **test_resource_policy.py** |
| **runtime.py** y **workers.py** | Ejecución de inferencia local y remota | Implementado parcialmente (falta SSE nativo) | **test_runtime.py**, **test_workers.py** |
| **narrative.py** | Motor de historias, canon, ramas y prompts | Implementado con deuda en memoria RAG | **test_narrative.py**, **test_story_canon.py** |
| **creator.py** y **creator_media.py** | Fichas de personajes y activos de autor | Implementado (falta importador PNG V2/V3) | **test_creator_studio.py**, **test_creator_media.py** |
| **scene_planner.py** y **visual_state.py** | Traducción de narrativa a estado visual | Implementado pero requiere caché de sprites | **test_scene_planner.py**, **test_visual_state.py** |
| **images.py**, **speech.py**, **media.py** | Integración ComfyUI, Piper TTS y coordinación | Implementado y funcional por adaptadores | **test_comfy_images.py**, **test_piper_speech.py** |
| **store.py** y **secrets.py** | Persistencia de datos y manejo de credenciales | Arquitectónicamente débil sin SQLite WAL | **test_preferences.py** |

La tabla detalla el estado de cada módulo de **apps/api/noble_api/** junto con su suite de verificación en **tests/**.

### Evaluación de módulos de Frontend (apps/web/src/)

* **App.tsx (Implementado pero arquitectónicamente débil):** Con un tamaño de archivo significativamente superior al resto de vistas, actúa como concentrador de navegación y estado global, acoplando la lógica de infraestructura con la de lectura y creación.


* **VisualReader.tsx (Implementado parcialmente frente al estándar VN):** Proporciona la vista de lectura multimedia verificada en **docs/assets/screenshots/reader-desktop.webp** y **reader-mobile.webp**, pero necesita separar el renderizado en capas independientes de fondo, sprites de expresión y diálogo con streaming token a token.


* **StoryStudio.tsx, StoryDetail.tsx y CreatorStudio.tsx (Implementados y funcionales):** Cubren los flujos de creación de historias y personajes validados por **creator.spec.ts**, **story.spec.ts** y **story-detail.spec.ts**, aunque carecen de un editor visual de nodos para ramas y de importación directa por arrastre de tarjetas PNG.


* **RuntimeManager.tsx y RemoteWorkers.tsx (Implementados y funcionales):** Gestionan el Model Hub (**model-hub.webp**) y la conexión con workers de GPU (**workers.webp**), respaldados por **catalog.spec.ts**, **model-storage.spec.ts** y **workers.spec.ts**.


* **NarrativeSettings.tsx, CreativeSettings.tsx y WorkspaceSettings.tsx (Implementados pero fragmentados):** Dividen la configuración en tres paneles separados sin ofrecer un inspector unificado del presupuesto de tokens en tiempo real.



## 05 — Problemas y deuda técnica

A continuación se documentan los hallazgos arquitectónicos y funcionales principales siguiendo el formato de trazabilidad exigido:

### AUD-001 — Persistencia sin garantías transaccionales estrictas ni motor vectorial integrado

* **Área:** Persistencia de datos y almacenamiento narrativo.


* **Estado:** Implementado pero arquitectónicamente débil.


* **Prioridad:** P0.
* **Evidencia:** **apps/api/noble_api/store.py**, **tests/test_preferences.py**, **tests/test_story_branches.py** y **docs/ESTADO_Y_MEMORIA.md**.


* **Problema:** El almacenamiento unificado en **store.py** gestiona preferencias, historias, ramas, canon y estados visuales sin un esquema relacional SQLite en modo WAL ni índices vectoriales nativos.


* **Consecuencia:** Riesgo de corrupción de datos ante escrituras concurrentes (por ejemplo, cuando finaliza un trabajo asíncrono de imagen mientras se guarda un turno narrativo) y degradación lineal al buscar en historiales extensos.
* **Causa probable:** Diseño inicial orientado a prototipado rápido del plano de control (****init**.py**: "Noble AI control plane: app-first Model Hub prototype").


* **Solución recomendada:** Migrar **store.py** a SQLite con `PRAGMA journal_mode=WAL`, tablas normalizadas con claves foráneas y la extensión **sqlite-vec** para búsqueda semántica local.


* **Alternativas:** PostgreSQL local (descartado por sobrecarga de instalación para usuarios finales) o archivos JSON por sesión (descartado por falta de atomicidad).
* **Referencia externa:** Esquema SQLite embebido de Talemate y manejo de almacenamiento local en RisuAI.
* **Dependencias:** Ninguna.
* **Complejidad:** Media.
* **Validación:** Ejecutar pruebas de estrés con 50 escrituras paralelas desde **tests/test_story_branches.py** y **tests/test_media_coordination.py** verificando cero bloqueos y consistencia íntegra.



### AUD-002 — Contención de VRAM entre el motor LLM y la generación de imágenes con ComfyUI

* **Área:** Gestión de recursos GPU y multimodalidad.


* **Estado:** Implementado parcialmente.


* **Prioridad:** P0.
* **Evidencia:** **apps/api/noble_api/resource_policy.py**, **apps/api/noble_api/media.py**, **apps/api/noble_api/images.py**, **docs/RECURSOS_GPU.md** y **tests/test_resource_policy.py**.


* **Problema:** Aunque existe un módulo de políticas de recursos (**resource_policy.py**) y coordinación de medios (**media.py**), ejecutar un modelo LLM de 8B a 14B parámetros simultáneamente con un checkpoint SDXL o Flux en ComfyUI desborda los 16 GB de VRAM sino se fuerza el desalojo efectivo de pesos en el motor de inferencia.


* **Consecuencia:** Fallos CUDA Out-Of-Memory (OOM), caída del proceso worker o degradación severa por paginación hacia la RAM del sistema en cada turno ilustrado.
* **Causa probable:** Separación entre la política declarativa de asignación de modelos y el control imperativo del ciclo de vida de memoria de procesos externos como ComfyUI y Ollama/llama.cpp.


* **Solución recomendada:** Implementar en **resource_policy.py** un coordinador con bloqueo mutuo (`asyncio.Lock`) que consulte la VRAM libre real en **hardware.py** y envíe órdenes explícitas de descarga (`keep_alive: 0` en Ollama o `/free` en la API de ComfyUI) al cambiar de modalidad en GPUs con menos de 24 GB de VRAM.


* **Referencia externa:** Gestión de memoria compartida en SillyTavern y flags `--lowvram` / `/free` de ComfyUI.
* **Dependencias:** Detección precisa de VRAM libre en **hardware.py**.


* **Complejidad:** Alta.
* **Validación:** Completar 25 turnos consecutivos alternando generación de texto (modelo 12B Q4_K_M) e imagen (SDXL 1024x1024) en una GPU de 16 GB mediante **tests/test_media_coordination.py** sin superar el 92% de VRAM pico.



### AUD-003 — Riesgos de integridad y validación de rutas en descargas y activos locales

* **Área:** Seguridad local y administración de modelos.


* **Estado:** Implementado pero requiere endurecimiento.


* **Prioridad:** P0.
* **Evidencia:** **apps/api/noble_api/downloads.py**, **apps/api/noble_api/model_storage.py**, **apps/api/noble_api/creator_media.py** y **docs/SEGURIDAD_Y_LICENCIAS.md**.


* **Problema:** La descarga de archivos de varios gigabytes desde repositorios externos y la carga de recursos de creador requieren validación estricta contra saltos de directorio (`Path Traversal`), soporte de reanudación HTTP Range y comprobación de hash SHA-256.


* **Consecuencia:** Archivos de modelos corruptos ante microcortes de red o posible escritura fuera del directorio de almacenamiento configurado.
* **Causa probable:** Implementación de descargas directas sin máquina de estados persistente para fragmentos `.part` ni verificación criptográfica contra los encabezados `X-Linked-ETag` de Hugging Face.


* **Solución recomendada:** Incorporar descargas por bloques con cabeceras `Range`, verificación SHA-256 obligatoria al finalizar y validación `Path.resolve().is_relative_to(allowed_root)` en **model_storage.py** y **creator_media.py**.


* **Complejidad:** Baja.
* **Validación:** Pruebas automatizadas en **tests/test_model_storage.py** y **tests/test_creator_media.py** inyectando rutas con `../` e interrumpiendo flujos de descarga simulados.



### AUD-004 — Ausencia de streaming SSE bidireccional con cancelación de cómputo extremo a extremo

* **Área:** Backend API, inferencia e interfaz de lectura.


* **Estado:** Implementado parcialmente.


* **Prioridad:** P0.
* **Evidencia:** **apps/api/noble_api/runtime.py**, **apps/api/noble_api/main.py**, **apps/web/src/api.ts** y **apps/web/src/VisualReader.tsx**.


* **Problema:** La generación narrativa que espera la respuesta completa antes de actualizar la interfaz introduce una latencia percibida de varios segundos en modelos locales y no libera la GPU cuando el usuario decide abortar o regenerar un turno.


* **Consecuencia:** Sensación de lentitud en el modo novela visual y desperdicio de ciclos de GPU en workers locales o remotos.
* **Causa probable:** Contratos HTTP petición-respuesta tradicionales en **api.ts** en lugar de flujos Server-Sent Events (SSE) acoplados a `AbortController`.


* **Solución recomendada:** Exponer un endpoint SSE en **main.py** y **runtime.py** que emita tokens conforme se generan, monitoree la desconexión del socket y cancele inmediatamente la tarea en el worker.


* **Complejidad:** Media.
* **Validación:** Medir un tiempo hasta el primer token visible (TTFT) menor a 600 ms en **VisualReader.tsx** y verificar que al cancelar desde la UI el uso de GPU caiga a reposo en menos de 250 ms.



### AUD-005 — Degradación de coherencia en historias largas por ausencia de memoria híbrida y Lorebooks

* **Área:** Motor narrativo y gestión de contexto.


* **Estado:** Implementado parcialmente.


* **Prioridad:** P1.
* **Evidencia:** **apps/api/noble_api/narrative.py**, **tests/test_narrative.py**, **tests/test_narrative_prepare.py**, **tests/test_story_canon.py** y **docs/ESTADO_Y_MEMORIA.md**.


* **Problema:** Aunque el proyecto contempla hechos canónicos (**test_story_canon.py**) y preparación narrativa (**test_narrative_prepare.py**), carece de un motor completo de Lorebooks (activación recursiva por palabras clave con presupuesto de tokens) y de recuperación semántica de episodios antiguos.


* **Consecuencia:** Pasados 30 a 50 turnos, los modelos locales de 8k-16k de contexto olvidan eventos previos, confunden el estado de relaciones o saturan la ventana de contexto con texto irrelevante.
* **Solución recomendada:** Ampliar **narrative.py** con un ensamblador de contexto de cuatro capas: Canon inmutable en prefijo fijo, Lorebook activado por claves, RAG episódico vía **sqlite-vec** y ventana deslizante de mensajes recientes.


* **Referencia externa:** Motor de World Info de SillyTavern y memoria episódica de Talemate.
* **Dependencias:** AUD-001 (SQLite + sqlite-vec en **store.py**).


* **Complejidad:** Alta.
* **Validación:** Prueba automatizada en **tests/test_narrative_prepare.py** simulando una historia de 120 turnos donde un hecho del turno 3 se recupera por palabra clave y similitud semántica en el turno 120 sin exceder un presupuesto de 4096 tokens.



### AUD-006 — Regeneración visual redundante y falta de composición por capas en el planificador escénico

* **Área:** Planificación de escenas y novela visual.


* **Estado:** Implementado pero optimizable.


* **Prioridad:** P1.
* **Evidencia:** **apps/api/noble_api/scene_planner.py**, **apps/api/noble_api/visual_state.py**, **apps/api/noble_api/images.py** y **apps/web/src/VisualReader.tsx**.


* **Problema:** Si cada turno narrativo dispara la generación de una imagen completa en ComfyUI en lugar de distinguir entre el fondo del escenario y el sprite emocional del personaje en primer plano, la latencia se vuelve inaceptable (5 a 20 segundos por mensaje) y la apariencia del personaje varía entre cuadros.


* **Consecuencia:** Ruptura de la continuidad visual del personaje y saturación innecesaria de la GPU.
* **Solución recomendada:** Modificar **scene_planner.py** y **visual_state.py** para gestionar dos canales separados: un fondo persistente indexado por ubicación/clima y una capa de sprites transparentes por personaje y emoción (`neutral`, `joy`, `anger`, `sadness`, `surprise`), invocando a **images.py** solo ante cambios de escenario o eventos climáticos (CGs).


* **Complejidad:** Alta.
* **Validación:** Verificar en **tests/test_scene_planner.py** y **apps/web/tests/visual-gallery.spec.ts** que 10 turnos de diálogo en una misma habitación reutilicen el fondo en caché y cambien únicamente el sprite de expresión en 0 ms.



### AUD-007 — Monolitismo de estado e interfaz en App.tsx y ausencia de rutas desacopladas

* **Área:** Arquitectura Frontend y UX/UI.


* **Estado:** Implementado pero arquitectónicamente débil.


* **Prioridad:** P1.
* **Evidencia:** **apps/web/src/App.tsx**, **apps/web/src/styles.css** y **apps/web/tests/app.spec.ts**.


* **Problema:** El componente **App.tsx** centraliza la coordinación de múltiples estudios y paneles de configuración, acoplando el ciclo de vida del lector narrativo con el administrador de modelos y workers remotos.


* **Consecuencia:** Re-renderizados innecesarios, alta carga cognitiva para el usuario y dificultad para mantener o escalar vistas independientes.
* **Solución recomendada:** Dividir **App.tsx** mediante enrutamiento declarativo y stores de estado atómicos (Zustand), aislando el *Lector Inmersivo* en pantalla completa respecto al *Creator Studio* y la *Consola de Infraestructura*.


* **Complejidad:** Media.
* **Validación:** Ejecutar **apps/web/tests/app.spec.ts** comprobando la navegación directa por URL a cada espacio y cero re-renderizados del árbol de catálogo durante el streaming de mensajes en el lector.



## 06 — Comparación con Isekai Zero

El proyecto incluye el documento **docs/ISEKAI_ZERO_REFERENCIA.md** como guía de diseño. A continuación se contrastan las capacidades confirmadas de Isekai Zero frente a la implementación actual de Novel AI en el paquete adjunto.

### Matriz comparativa funcional frente a Isekai Zero

| Dimensión / Función | Isekai Zero (Referencia) | Novel AI (Estado actual) | Brecha funcional |
| --- | --- | --- | --- |
| Editor de historias | Básico/Avanzado, aperturas múltiples | **StoryStudio.tsx** + **narrative.py** | Falta selector de aperturas múltiples |
| Fichas de personajes | Apariencia, voz, expresiones, relaciones | **CreatorStudio.tsx** + **creator.py** | Falta hoja completa de sprites por emoción |
| Modo Novela Visual | Fondos + sprites + voz + transiciones | **VisualReader.tsx** + **visual_state.py** | Requiere composición multicapa en el lienzo |
| Memoria y Lorebooks | Recordatorios persistentes y contexto | Canon y ramas (**test_story_canon.py**) | Falta motor Lorebook por claves y RAG |
| Ejecución e IA | Nube propietaria cerrada con créditos | 100% Local + Workers Colab (**workers.py**) | Ventaja competitiva clara de Novel AI |

La tabla sintetiza las diferencias entre la plataforma comercial en la nube e implementación local verificada en el repositorio.

### Análisis detallado por área y arquitectura de paridad

* **1. Creación de historias (Story Studio):**
* *Funcionamiento en Isekai Zero:* Separa un modo rápido (título, portada, sinopsis, saludo inicial) de un modo avanzado (instrucciones del director, recordatorios persistentes, múltiples escenarios de inicio y vinculación de personas del jugador).
* *Equivalente en Novel AI:* Implementado a través de **StoryStudio.tsx**, **StoryDetail.tsx**, **NarrativeSettings.tsx** y **narrative.py**.


* *Cambios necesarios y arquitectura propuesta:* Ampliar el modelo de historia en **store.py** y **StoryStudio.tsx** para admitir un arreglo de `starting_scenarios` (cada uno con su mensaje inicial, ubicación de arranque y fondo predeterminado) y un bloque de `persistent_reminders` que **narrative.py** inyecte a poca profundidad (2 turnos antes del final del prompt) para evitar que los modelos locales olviden el estilo narrativo.




* **2. Creación de personajes (Creator Studio):**
* *Funcionamiento en Isekai Zero:* Define identidad, apariencia física estructurada para generación visual, personalidad, ejemplos de diálogo, voz asignada y retratos por expresión emocional.
* *Equivalente en Novel AI:* Implementado en **CreatorStudio.tsx**, **creator.py** y **creator_media.py**, con validación en **tests/test_creator_studio.py** y **tests/test_creator_media.py**.


* *Cambios necesarios y arquitectura propuesta:* Estructurar en **creator.py** el campo `visual_dna` (etiquetas invariables de apariencia, LoRA opcional y semilla base) separado de `personality_prompt`, y asociar en **creator_media.py** un mapa de sprites transparentes por emoción que pueda generarse en lote mediante ComfyUI al crear el personaje.




* **3. Modo Novela Visual y sincronización multimedia:**
* *Funcionamiento en Isekai Zero:* Presenta un escenario de ancho completo con personajes superpuestos que cambian de expresión según el sentimiento de su diálogo, caja de texto translúcida en la parte inferior, reproducción de voz por línea y generación de escenas bajo demanda.
* *Equivalente en Novel AI:* Implementado en **VisualReader.tsx**, **visual_state.py**, **scene_planner.py**, **images.py** y **speech.py**.


* *Cambios necesarios y arquitectura propuesta:* Evolucionar **VisualReader.tsx** hacia una arquitectura de tres capas DOM/Canvas superpuestas (`BackgroundLayer`, `CharacterStageLayer`, `DialogueHUDLayer`) gobernadas por los eventos emitidos desde **visual_state.py**, sincronizando la cola de audio de **speech.py** con el avance del texto.





## 07 — Investigación de proyectos externos

Además de la documentación en **docs/REPOSITORIOS_OPEN_SOURCE.md** y **docs/REFERENCIAS_URAKATSU_KOHARU.md**, se analizan técnicamente los seis repositorios obligatorios de referencia para extraer patrones verificables.

### 1. RisuAI ([https://github.com/kwaroran/Risuai](https://github.com/kwaroran/Risuai))

* **Problema que resuelve:** Cliente multiplataforma (Web y escritorio vía Tauri) para roleplay avanzado con soporte de tarjetas Character Card V2/V3, Lorebooks recursivos, scripts Regex y sprites emocionales.
* **Funcionamiento interno y módulos clave:** Escrito en TypeScript y Svelte (`src/ts/`). El ensamblaje de prompts y Lorebooks reside en `src/ts/process/index.svelte.ts` y `src/ts/process/lorebook.ts`; la integración de imágenes (ComfyUI/Stable Diffusion) está en `src/ts/process/stableDiff.ts`; el manejo de tarjetas V2/V3 e incrustación de activos se implementa en `src/ts/characterCards.ts`.
* **Madurez y licencia:** Muy alta madurez; licencia **MPL-2.0** (permite reutilizar y adaptar lógica en archivos separados manteniendo avisos de licencia).
* **Equivalente en Novel AI e integración:** Novel AI tiene **narrative.py**, **creator.py** e **images.py**. Conviene adaptar el algoritmo de escaneo recursivo de Lorebooks y el parser de chunks PNG de `src/ts/characterCards.ts` hacia Python en **creator.py** y **creator_media.py**.



### 2. SillyTavern ([https://github.com/SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern))

* **Problema que resuelve:** Orquestador universal de front-end para LLMs locales y remotos con gestión milimétrica del presupuesto de tokens, World Info, resúmenes, expresiones de personajes y TTS.
* **Funcionamiento interno y módulos clave:** Backend en Node.js/Express (`src/endpoints/`) y frontend modular en JavaScript (`public/scripts/`). El motor de World Info (`public/scripts/world-info.js`) implementa prioridades de inserción, claves primarias/secundarias, presupuesto porcentual de tokens y recursión controlada. La extensión de expresiones (`public/scripts/extensions/expressions/index.js`) clasifica la emoción del último mensaje y selecciona el sprite correspondiente del personaje.
* **Madurez y licencia:** Estándar de la industria open-source; licencia **AGPL-3.0** (exige que derivados distribuidos que incorporen su código directo compartan la misma licencia; se recomienda adaptar el diseño arquitectónico en Python limpio dentro de **noble_api** en lugar de copiar código fuente literal).


* **Equivalente en Novel AI e integración:** El diseño de presupuesto de tokens y prioridades de `world-info.js` debe inspirar directamente la evolución de **narrative.py** y **NarrativeSettings.tsx**.



### 3. Talemate ([https://github.com/vegu-ai/talemate](https://github.com/vegu-ai/talemate))

* **Problema que resuelve:** Motor de historias interactivas y juegos de rol dirigido por agentes especializados que separan la narración del seguimiento de estado de escena, personajes y memoria a largo plazo.
* **Funcionamiento interno y módulos clave:** Construido en Python (con interfaz frontend desacoplada). En `src/talemate/game/engine/` y `src/talemate/agents/`, divide las responsabilidades en agentes dedicados (`narrator`, `director`, `world_state`, `summarizer`, `visual`). Mantiene un estado estructurado de quién está en qué habitación, qué objetos porta y qué eventos han ocurrido.
* **Madurez y licencia:** Alta madurez arquitectónica en Python; el diseño de sus agentes y nodos de escena es directamente afín al stack de **apps/api/noble_api/**.


* **Equivalente en Novel AI e integración:** Novel AI ya posee **narrative.py**, **scene_planner.py** y **visual_state.py**. Se recomienda adoptar el patrón de Talemate donde el *Director/Scene Planner* actualiza incrementalmente el estado JSON de la escena tras el turno sin bloquear el streaming del diálogo principal.



### 4. Gamentic ([https://github.com/hec-ovi/gamentic](https://github.com/hec-ovi/gamentic))

* **Problema que resuelve:** Motor de aventuras conversacionales con reglas de juego deterministas, inventario, ubicaciones conectadas y validación de acciones del jugador antes de invocar al LLM.
* **Funcionamiento interno:** Separa la interpretación de la intención del usuario (`action parsing`), la verificación contra el estado del mundo (si una puerta está cerrada o el jugador no tiene un objeto) y la generación de la respuesta narrativa.
* **Equivalente en Novel AI e integración:** Útil para fortalecer **narrative.py** y **tests/test_story_canon.py**, evitando que el jugador altere arbitrariamente las reglas del mundo mediante prompts ("god-moding").



### 5. Open Dungeon ([https://github.com/newideas99/open-dungeon](https://github.com/newideas99/open-dungeon))

* **Problema que resuelve:** Experiencias de mazmorras e historias generativas al estilo AI Dungeon utilizando modelos ejecutados localmente y estructuras ligeras de memoria de mundo.
* **Funcionamiento interno:** Gestiona turnos de acción (`Do`, `Say`, `Story`) y mantiene un bloque de memoria persistente (`Remember` / `Author's Note`) inyectado dinámicamente en la ventana de contexto.
* **Equivalente en Novel AI e integración:** El patrón de modos de entrada (`Acción`, `Diálogo`, `Dirección Narrativa`) debe incorporarse en la barra de entrada de **VisualReader.tsx** y procesarse en **narrative.py**.



### 6. TaleWeaver ([https://github.com/TaleWeaverAdmin/TaleWeaver](https://github.com/TaleWeaverAdmin/TaleWeaver))

* **Problema que resuelve:** Plataforma de co-escritura y estructuración de historias por capítulos, arcos argumentales y fichas de entidades conectadas.
* **Funcionamiento interno:** Organiza la narrativa jerárquicamente (Historia -> Capítulo -> Escena -> Bloque) permitiendo resumir capítulos cerrados para alimentar el contexto de los capítulos futuros.
* **Equivalente en Novel AI e integración:** Aporta el modelo de datos para evolucionar **StoryStudio.tsx** y **StoryDetail.tsx** hacia una estructura por capítulos y escenas cuyos resúmenes alimenten la memoria episódica.



## 08 — Oportunidades de reutilización de código

Tras contrastar licencias, lenguajes y dependencias, se establecen las siguientes recomendaciones concretas de reutilización e integración para **apps/api/noble_api/** y **apps/web/**:

| Componente / Patrón | Proyecto origen | Licencia | Estrategia recomendada | Módulo destino en Novel AI |
| --- | --- | --- | --- | --- |
| Parser Character Card V2/V3 | RisuAI / Especificación V2 | MPL-2.0 / MIT | Adaptar lectura de chunks PNG en Python | **creator.py**, **creator_media.py** |
| Algoritmo de Lorebook recursivo | RisuAI (`lorebook.ts`) | MPL-2.0 | Portar lógica de claves y presupuesto | **narrative.py** |
| Estado de escena y agentes | Talemate (`talemate/agents`) | Open-Source | Adaptar contratos de estado de escena | **scene_planner.py**, **visual_state.py** |
| Extensión vectorial SQLite | **sqlite-vec** (asg017) | MIT / Apache-2.0 | Integrar dependencia directa vía pip | **store.py**, **requirements.txt** |
| Virtualización de listas DOM | **@tanstack/react-virtual** | MIT | Instalar paquete npm en el frontend | **VisualReader.tsx**, **RuntimeManager.tsx** |

La tabla detalla las bibliotecas y patrones externos compatibles con el stack Python + React/TypeScript del proyecto.

* **Lectura y escritura de metadatos PNG (Character Cards V2/V3):** En Python, utilizando únicamente la biblioteca estándar `zlib`, `struct`, `base64` y `json` (o `Pillow`), se puede extraer e incrustar el bloque `tEXt` con clave `chara` o `ccv3` en menos de 80 líneas de código dentro de **creator_media.py**, logrando compatibilidad instantánea con miles de personajes creados por la comunidad de SillyTavern y RisuAI sin arrastrar dependencias pesadas.


* **Búsqueda vectorial embebida con sqlite-vec:** Frente a levantar servidores externos como Qdrant, Milvus o Chroma (que consumen cientos de megabytes de RAM y complican la instalación en Windows), la biblioteca **sqlite-vec** (licencia MIT/Apache-2.0) se carga como una extensión dentro del mismo archivo SQLite administrado por **store.py**.



## 09 — Motor narrativo y personajes

El diagnóstico de **apps/api/noble_api/narrative.py**, **creator.py**, **scene_planner.py**, **tests/test_narrative.py**, **tests/test_story_canon.py** y **tests/test_story_branches.py** demuestra que el proyecto ya concibe la historia como una estructura con canon y bifurcaciones, superando el modelo de lista plana de mensajes. Sin embargo, para alcanzar la solidez de un motor de ficción interactiva profesional con modelos locales de 7B a 14B parámetros, es indispensable separar las responsabilidades cognitivas del turno narrativo.

### Separación de responsabilidades en el ciclo del motor narrativo

No se debe delegar la integridad del mundo únicamente a la creatividad libre del LLM. El motor en **narrative.py** debe estructurar cada turno en etapas claramente delimitadas:

1. **Interpretación y clasificación de la entrada del jugador (Código determinista + Heurística rápida):** Distinguir si el usuario ingresó una acción física (`*Abre el cofre oxidado*`), un diálogo (`"¿Dónde escondiste la llave?"`) o una directriz de autor (`[Nota: Haz que comience a llover]`).
2. **Recuperación de estado y recuerdos (Código Python + SQLite):** Consultar en **store.py** la ubicación actual de la rama activa, los personajes presentes en esa ubicación, sus actitudes hacia el jugador y los hechos canónicos vigentes. Ningún personaje ausente de la ubicación activa debe tener inyectada su ficha de diálogo completa como interlocutor presente.


3. **Generación de narración y diálogo (Inferencia principal del LLM en streaming):** Invocar al modelo local a través de **runtime.py** con un prompt enfocado exclusivamente en narrar la consecuencia inmediata de la acción del jugador y las respuestas de los personajes presentes, prohibiendo por instrucción de sistema y por paradas (`stop sequences` como `\nUsuario:` o `\nJugador:`) que el LLM hable o tome decisiones por el jugador.


4. **Extracción asíncrona de delta de estado y planificación visual:** Una vez completado el texto visible, **scene_planner.py** y el actualizador de canon evalúan el turno para registrar cambios estructurales (¿cambió de habitación?, ¿apareció o salió un personaje?, ¿cambió la emoción dominante?, ¿se reveló un hecho permanente nuevo?) y persisten el nuevo snapshot vinculado al nodo de la rama en **store.py**.



### Prevención técnica de los 10 fallos narrativos clásicos en modelos locales

* **Un personaje olvida información importante:** Se corrige extrayendo los hechos clave al final de cada escena como registros en la tabla `canon_facts` (validada conceptualmente por **test_story_canon.py**) e inyectándolos en el bloque fijo de memoria del personaje dentro de **narrative.py**.


* **Un personaje recuerda acontecimientos que nunca presenció (Omnisciencia artificial):** Se corrige etiquetando cada recuerdo episódico en **store.py** con la lista de `witness_character_ids` presentes en la escena cuando ocurrió el evento; durante la fase `prepare` (**test_narrative_prepare.py**), solo se inyectan como conocimiento de un personaje aquellos eventos donde figura como testigo.


* **Un personaje cambia de personalidad sin justificación:** Se evita anclando rasgos de personalidad, muletillas y ejemplos breves de diálogo (`mes_example`) a poca profundidad del final del prompt (Depth 2-4) en lugar de dejarlos únicamente al principio de un contexto de 16k tokens donde el modelo pierde atención.
* **Una ubicación cambia arbitrariamente:** La ubicación actual (`current_location_id`) se mantiene como una variable de estado explícita en **visual_state.py** y **narrative.py**; el encabezado del turno actual le recuerda al LLM: `[Escena actual: Taberna del Puerto | Hora: Noche | Clima: Tormenta]`.


* **La IA controla decisiones o diálogos del jugador:** Se soluciona combinando una directriz negativa al final del prompt (`Escribe únicamente la respuesta del mundo y de {{char}}. Nunca escribas acciones, pensamientos ni diálogos de {{user}}.`) con secuencias de parada automáticas (`["\n{{user}}:", "\nJugador:"]`) en **runtime.py**.


* **Repetición constante de frases o escenas estancadas:** Se mitiga aplicando penalización DRY (`dry_multiplier: 0.8`) o Min-P (`min_p: 0.05` con `temperature: 0.85`) en **runtime.py**, e inyectando desde **narrative.py** una directriz temporal de ritmo (`plot_beat_hint`) cuando el detector léxico observa tres turnos consecutivos sin cambio de estado ni avance de escena.



## 10 — Memoria, contexto y prompts

Para modelos locales que operan habitualmente entre 8192 y 16384 tokens de contexto efectivo en GPUs domésticas (dado que contextos de 32k-128k disparan el consumo de VRAM del KV cache y reducen drásticamente la velocidad de evaluación), **apps/api/noble_api/narrative.py** y **store.py** deben implementar una arquitectura de memoria híbrida de cuatro niveles.

### Arquitectura de memoria híbrida recomendada

1. **Nivel 1 — Canon Permanente y Estado Estructurado (Siempre presente en prefijo):** Contiene la premisa del mundo, las fichas condensadas de los personajes activos y el bloque JSON/YAML compacto del estado actual (ubicación, inventario, relaciones numéricas/descriptivas y objetivos activos).
2. **Nivel 2 — Lorebook / World Info Dinámico (Activado por claves):** Entradas del diccionario del mundo y secretos de personajes almacenados en SQLite que se inyectan solo cuando una palabra clave primaria o secundaria aparece en los últimos 3 turnos de la conversación.
3. **Nivel 3 — Memoria Episódica y Resumen Progresivo (SQLite FTS5 + sqlite-vec):** Cada vez que los mensajes antiguos salen de la ventana de corto plazo (por ejemplo, cada 10 turnos), un proceso de consolidación genera un resumen denso de 100-150 tokens del bloque cerrado, calcula su embedding local (usando un modelo ligero en CPU como `all-MiniLM-L6-v2` o `bge-small-en/es` de ~90 MB que no consume VRAM) y lo indexa en **store.py**. En cada turno se recuperan los 3 episodios pasados con mayor puntuación híbrida:



$$\text{Score} = 0.65 \cdot \text{SimilitudCoseno} + 0.20 \cdot \text{Importancia} + 0.15 \cdot e^{-\lambda \cdot \Delta \text{Turnos}}$$


4. **Nivel 4 — Memoria de Corto Plazo (Ventana deslizante FIFO):** Los últimos $N$ mensajes íntegros de la rama activa hasta completar el presupuesto de tokens disponible.

### Distribución del presupuesto de tokens y caché de prefijos

Para que motores como `llama.cpp` u Ollama reutilicen el KV cache entre turnos consecutivos (reduciendo el tiempo de procesamiento del prompt de segundos a milisegundos), el orden de ensamblaje en **narrative.py** debe mantener invariable la parte superior del prompt:

| Orden | Bloque del Prompt | Presupuesto (sobre 8192) | Política de mutación |
| --- | --- | --- | --- |
| 1 | Instrucciones de Sistema y Reglas de Formato | 400 tokens (5%) | Estático (100% acierto en KV Cache) |
| 2 | Canon del Mundo y Fichas Base de Personajes | 1200 tokens (15%) | Estático durante toda la escena |
| 3 | Resumen de Arco Argumental Consolidado | 600 tokens (7%) | Cambia solo cada 10-15 turnos |
| 4 | Lorebook Activado + Recuerdos RAG Recuperados | 1000 tokens (12%) | Dinámico según el turno actual |
| 5 | Historial Reciente de Conversación (FIFO) | 4000 tokens (49%) | Apendizado incremental |
| 6 | Estado de Escena Actual + Directriz de Ritmo | 292 tokens (4%) | Inyectado a profundidad 1 (Post-History) |
| 7 | Reserva para Generación de Respuesta (`max_tokens`) | 700 tokens (8%) | Salida del modelo |

La tabla muestra la asignación exacta para una ventana de 8192 tokens que preserva el prefijo estático en los bloques 1 a 3.

### Ejemplo concreto de construcción de contexto en una conversación larga (Turno 64)

En una partida que alcanza el **Turno 64** donde el jugador regresa a la *Posada del Cuervo* y menciona el *Relicario de Plata* que obtuvo en el **Turno 12**:

1. **narrative.py** mantiene intactos los Bloques 1 y 2 (Sistema + Ficha de la posadera Lyra).


2. El Bloque 3 incluye el resumen consolidado de los Capítulos 1 y 2 (Turnos 1 al 50).
3. El escáner de Lorebook detecta la palabra `"Relicario de Plata"` en la entrada del jugador e inyecta la entrada del Lorebook asociada (85 tokens); simultáneamente, la consulta en **sqlite-vec** dentro de **store.py** recupera el resumen del episodio del Turno 12: *"[Turno 12 | Testigos: Jugador, Lyra] El jugador recuperó el Relicario de Plata en las catacumbas y prometió entregárselo a Lyra"*.


4. El Bloque 5 inserta íntegros los turnos 51 al 63 desde la rama activa.
5. Justo antes del mensaje del turno 64 del jugador, el Bloque 6 inyecta: `[Estado actual: Ubicación = Posada del Cuervo | Presentes = Lyra (Actitud: Expectante, Confianza: +40) | Inventario = Relicario de Plata]`.
6. Cuando el contexto supera el límite, los turnos 51 a 60 se comprimen en un nuevo nodo episódico sin truncar abruptamente mitad de una oración ni contaminar los hechos permanentes.

## 11 — Model Hub e inferencia local

El Model Hub es uno de los pilares centrales de Novel AI, respaldado por **apps/api/noble_api/catalog.py**, **hardware.py**, **model_fit.py**, **model_storage.py**, **downloads.py**, **runtime.py**, **config/gpu_profiles.json** y **apps/web/src/RuntimeManager.tsx**.

### Evaluación sobre el equipo de referencia y adaptabilidad multi-hardware

Tomando como base la estación de trabajo de referencia (**Windows 11, NVIDIA RTX 5060 Ti 16 GB VRAM, AMD Ryzen 7 5800XT, 64 GB RAM DDR4**):

* **En VRAM pura (16 GB):** Reservando ~1.5 GB para Windows 11 y el navegador/WebView, quedan **14.5 GB de VRAM utilizables**.
* Un modelo **12B–14B en cuantización Q4_K_M o Q5_K_M** (ej. Mistral-Nemo-12B o Qwen2.5-14B) ocupa entre 7.5 GB y 9.0 GB de pesos, más ~1.5 GB de KV cache a 16k de contexto (con cuantización de caché Q8_0), dejando ~4 GB libres. Esto permite velocidades de 45 a 65 tokens/s con el 100% de las capas en GPU.
* Un modelo **22B–24B en Q4_K_M** (~13.5 GB) cabe ajustadamente solo en modo exclusivo de texto, pero colisionará si se mantiene ComfyUI cargado en VRAM.
* Gracias a los **64 GB de RAM DDR4**, el equipo puede ejecutar modelos **32B a 70B en modo híbrido (GPU + CPU Offloading)** cargando entre 20 y 35 capas en los 16 GB de la RTX 5060 Ti y el resto en la RAM del sistema, logrando entre 6 y 15 tokens/s para usuarios que prioricen calidad literaria sobre velocidad.


* **Adaptabilidad a otros equipos:** **hardware.py** y **model_fit.py** deben clasificar cualquier equipo en perfiles dinámicos (desde 4 GB/6 GB VRAM con modelos 3B-7B Q4_K_S, hasta 24 GB+ VRAM capaces de sostener LLM + ComfyUI en paralelo sin descarga) basándose en **config/gpu_profiles.json**.



### Comparativa técnica de motores de inferencia local

| Motor / Backend | Formato principal | Ventajas técnicas | Desventajas | Recomendación para Novel AI |
| --- | --- | --- | --- | --- |
| **llama.cpp** (`llama-server`) | GGUF | Binario único, CUDA/Vulkan, gramáticas GBNF, KV cache shift | Requiere gestionar el subproceso | **Integración nativa prioritaria** |
| **Ollama** | GGUF (Modelfile) | API de carga/descarga simple (`keep_alive`), muy popular | Oculta el control fino de KV cache shift | **Soportar como proveedor externo** |
| **KoboldCpp** | GGUF | Diseñado para narrativa, incluye SD/Whisper/TTS en un binario | Menos estándar en API empresarial | **Soportar vía adaptador API** |
| **LM Studio** | GGUF | Interfaz pulida, servidor OpenAI-compatible local | Cerrado, no redistribuible | **Conectar vía endpoint OpenAI** |
| **ExLlamaV2 / V3** | EXL2 / EXL3 | Máxima velocidad en GPUs NVIDIA puras y excelente cuantización | No soporta offloading a RAM ni GPUs AMD/Intel sin CUDA | **Opcional para modo avanzado CUDA** |
| **vLLM** | Safetensors / AWQ | Alto rendimiento en lotes multiusuario en Linux | Pesado en Windows, sin offloading flexible a CPU | **Reservar solo para workers remotos** |

La tabla evalúa los motores de inferencia frente a las necesidades de **apps/api/noble_api/runtime.py** y **workers.py**.

### Rediseño funcional del Model Hub (RuntimeManager.tsx y catalog.py)

1. **Catálogo con semáforo de compatibilidad real:** Cada tarjeta en **RuntimeManager.tsx** debe cruzar los metadatos de **catalog.py** con el cálculo de **model_fit.py** para mostrar una insignia clara: *Óptimo en tu GPU (100% VRAM)*, *Híbrido (VRAM + RAM)* o *Excede tu memoria disponible*.


2. **Selector interactivo de cuantización en la vista de detalle:** Mostrar una tabla comparativa de los archivos `.gguf` disponibles en el repositorio de Hugging Face (`Q4_K_M`, `Q5_K_M`, `Q6_K`, `Q8_0`, `IQ4_XS`) indicando para cada uno: tamaño en disco, VRAM estimada a 8k y 16k de contexto, retención de perplejidad y velocidad estimada.
3. **Gestor de descargas con cola e integridad:** Visualizar progreso real byte a byte, velocidad en MB/s, botón de pausa/reanudación, selector de ruta de almacenamiento (**model_storage.py**) y verificación automática de hash al completar.



## 12 — Generación visual y multimodalidad

El pipeline audiovisual de Novel AI está distribuido entre **apps/api/noble_api/scene_planner.py**, **visual_state.py**, **images.py**, **speech.py**, **media.py** y **creator_media.py**, con documentación específica en **docs/IMAGENES.md**, **docs/MULTIMEDIA_LOCAL.md**, **docs/CREATOR_MEDIA.md** y **docs/TTS.md**.

### Arquitectura recomendada: Narrativa → Interpretación de escena → Selección o generación → Presentación

Para lograr coherencia visual durante decenas de capítulos sin obligar al usuario a esperar 15 segundos en cada línea de diálogo, el pipeline debe priorizar la **composición de capas** sobre la regeneración monolítica:

* **Paso 1 — Interpretación en scene_planner.py:** Al finalizar un turno narrativo, el planificador extrae una tupla estructurada: `(location_id, lighting_state, active_characters[], character_emotions{}, is_climactic_cg)`.


* **Paso 2 — Árbol de decisión en visual_state.py y media.py:**
1. **Cambio de expresión sin cambio de escenario (~75% de los turnos):** Si `location_id` y `lighting_state` coinciden con el fondo ya renderizado en caché, **no se invoca a ComfyUI**. El backend devuelve el identificador del sprite transparente correspondiente a la emoción actual del personaje (`creator_media.py`), logrando una transición en **0 ms** en **VisualReader.tsx**.


2. **Cambio de escenario a una ubicación conocida (~15% de los turnos):** Si el jugador regresa a un lugar visitado previamente en la misma franja horaria, **visual_state.py** recupera instantáneamente el fondo almacenado en la caché de activos de la historia.


3. **Nueva ubicación o evento especial CG (~10% de los turnos):** Cuando se descubre un nuevo escenario o ocurre un momento climático (`is_climactic_cg = true`), **images.py** encola un trabajo asíncrono en ComfyUI.





### Consistencia visual de personajes en difusión local

Ningún método de consistencia es universal para todas las arquitecturas (SD 1.5, SDXL/Pony/Illustrious y Flux tienen requerimientos distintos). Por ello, **images.py** y **creator.py** deben soportar tres niveles escalables:

1. **Nivel Base (Universal, 0 MB de VRAM extra):** Bloque de etiquetas de apariencia inmutables (`appearance_tokens`: color/corte de pelo, color de ojos, rasgos faciales y vestimenta base) concatenado automáticamente al inicio del prompt positivo junto con una semilla fija por personaje.
2. **Nivel Intermedio — Generación previa de hoja de expresiones (Recomendado en 16 GB VRAM):** En **CreatorStudio.tsx**, al crear el personaje, un workflow de ComfyUI genera sus 6 expresiones base sobre fondo neutro, las recorta con transparencia (`rembg`) y las guarda en **creator_media.py**. Así la identidad del personaje es 100% consistente durante toda la historia.


3. **Nivel Avanzado — IP-Adapter FaceID / Reference-Only / LoRA:** Para ilustraciones de escena completa (CGs) en modelos SDXL/Illustrious, **images.py** inyecta el retrato de referencia del personaje en un nodo `IPAdapter` dentro del grafo JSON de ComfyUI para transferir sus rasgos faciales y vestimenta a la nueva pose.



## 13 — Rediseño UX/UI

La inspección de **apps/web/src/** y de las capturas en **docs/assets/screenshots/** (**gallery.webp**, **model-hub.webp**, **reader-desktop.webp**, **reader-mobile.webp**, **workers.webp**) evidencia una interfaz funcional pero sobrecargada por agrupar herramientas de infraestructura junto con vistas creativas y narrativas.

### Nueva arquitectura de navegación (4 espacios desacoplados)

En lugar de acumular todas las secciones en un único contenedor dentro de **App.tsx**, la aplicación debe dividirse en cuatro entornos con jerarquías visuales propias:

1. **Biblioteca y Exploración (Inicio):** Escaparate visual de historias guardadas, ramas recientes y personajes listos para jugar (**StoryDetail.tsx**).


2. **Lector Inmersivo (Modo Juego):** Lienzo de pantalla completa (**VisualReader.tsx**) sin barras laterales de administración, con conmutador instantáneo entre *Modo Novela Visual*, *Modo Libro Ilustrado* y *Modo Chat*.


3. **Creator Studio (Autoría):** Entorno de trabajo con pestañas limpias para el Editor de Historias (**StoryStudio.tsx**), Editor de Personajes y Sprites (**CreatorStudio.tsx**), Editor de Lorebooks y Ajustes Narrativos (**NarrativeSettings.tsx**, **CreativeSettings.tsx**).


4. **Infraestructura y Modelos (Consola Técnica):** Espacio dedicado para el Model Hub (**RuntimeManager.tsx**), Nodos de Cómputo (**RemoteWorkers.tsx**) y Ajustes del Sistema (**WorkspaceSettings.tsx**).



### Propuesta de rediseño pantalla por pantalla

* **1. Lector Inmersivo (VisualReader.tsx):**
* *Problemas actuales:* Necesita desacoplar el área de lectura de los controles de configuración global y soportar capas de sprites independientes sobre el fondo.


* *Objetivo:* Ofrecer inmersión total equivalente a un motor de novela visual nativo (Ren'Py / Isekai Zero).
* *Distribución y componentes:* Lienzo `100vw x 100vh`; capa inferior para el fondo escénico con transición `crossfade`; capa media para hasta 3 sprites de personajes con iluminación activa para quien habla; barra superior flotante minimalista (nombre del capítulo, botón de ramas, selector de modo VN/Novela/Chat y estado compacto de VRAM); caja de diálogo inferior translúcida con nombre del hablante, texto en streaming, controles de audio TTS, botón de *Backlog* (historial virtualizado) y barra de entrada con selector de modo (`Diálogo`, `Acción`, `Director`).
* *Wireframe textual del Lector Inmersivo:*



```
+-------------------------------------------------------------------------+
| [<- Biblioteca]  Cap. 2: Puerto Gris   [Rama: Principal v] [VN|Libro]   |
|                                                                         |
|                     [ CAPA DE FONDO ESCÉNICO 16:9 ]                     |
|                                                                         |
|              +-------------------+       +-------------------+          |
|              | Sprite Personaje A|       | Sprite Personaje B|          |
|              |   (Atenuado)      |       | (Activo: Hablando)|          |
|              +-------------------+       +-------------------+          |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | [ LYRA ]                                    [Voz] [Regen] [Ramas] |  |
|  | "No pensé que volverías con el relicario intacto..."              |  |
|  +-------------------------------------------------------------------+  |
|  | [Modo: Acción v] [ Escribe tu acción o diálogo...      ] [Enviar] |  |
+-------------------------------------------------------------------------+

```

* **2. Creator Studio — Historias, Personajes y Lorebooks (CreatorStudio.tsx y StoryStudio.tsx):**
* *Problemas actuales:* Separación entre **CreatorStudio.tsx**, **StoryStudio.tsx**, **NarrativeSettings.tsx** y **CreativeSettings.tsx** sin un previsualizador unificado del presupuesto de tokens ni generador de hojas de sprites.


* *Objetivo:* Permitir crear una historia o personaje en 2 minutos (Modo Básico) o ajustar cada variable de memoria, voz y difusión (Modo Avanzado).
* *Distribución y componentes:* Diseño de dos columnas en escritorio: a la izquierda (65% del ancho) el formulario por pestañas (*Identidad*, *Personalidad y Diálogo*, *Apariencia y Sprites*, *Lorebook y Canon*, *Escenarios Iniciales*); a la derecha (35% del ancho) una tarjeta de previsualización interactiva con importador drag-and-drop de PNG V2/V3, medidor de tokens en vivo y botón de prueba rápida de chat/imagen.


* **3. Model Hub y Gestor de Inferencia (RuntimeManager.tsx y RemoteWorkers.tsx):**
* *Problemas actuales:* Falta desglose comparativo de cuantizaciones GGUF y visualización unificada del arbitraje de VRAM entre texto, imagen y voz.


* *Objetivo:* Que cualquier usuario entienda qué modelo descargar, cuánta VRAM consumirá y qué rol cumple en la aplicación.
* *Distribución y componentes:* Barra superior con el medidor físico de hardware detectado (**hardware.py**: GPU, VRAM usada/libre, RAM) y ranuras de asignación rápida (*Rol LLM Narrativo*, *Rol ComfyUI Imagen*, *Rol Piper Voz*); panel central con buscador de Hugging Face, filtros por modalidad y semáforo de compatibilidad; cajón lateral deslizable (`Drawer`) para la vista de detalle técnico y tabla de cuantizaciones; barra inferior persistente para la cola de descargas activas.





### Recomendación de bibliotecas de interfaz sobre el stack actual

Dado que **apps/web/** ya utiliza React, TypeScript y CSS personalizado en **styles.css**, **no se debe migrar el framework**. Se recomienda incorporar incrementalmente **Radix UI Primitives** (para diálogos modales accesibles, selectores y pestañas sin imponer estilos ajenos) y **@tanstack/react-virtual** (para virtualizar el historial de mensajes y el catálogo de modelos).

## 14 — Backend, API y persistencia

La revisión de **apps/api/noble_api/** y **docs/CONTRATOS_API.md** confirma un diseño API REST limpio sobre FastAPI que ahora debe blindarse en persistencia, concurrencia y contratos de streaming.

### Esquema relacional y vectorial propuesto para store.py (SQLite WAL)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    synopsis TEXT,
    system_prompt TEXT,
    narrative_settings_json TEXT NOT NULL,
    active_branch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role_type TEXT NOT NULL, -- 'ai' | 'user_persona'
    personality TEXT,
    appearance_tokens TEXT,
    voice_profile_json TEXT,
    sprites_map_json TEXT NOT NULL,
    card_metadata_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    parent_branch_id TEXT REFERENCES branches(id),
    fork_message_id TEXT,
    name TEXT NOT NULL,
    current_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    parent_message_id TEXT REFERENCES messages(id),
    sender_role TEXT NOT NULL, -- 'user' | 'character' | 'narrator' | 'system'
    character_id TEXT REFERENCES characters(id),
    content TEXT NOT NULL,
    state_snapshot_json TEXT NOT NULL,
    visual_state_json TEXT,
    audio_asset_id TEXT,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE lorebook_entries (
    id TEXT PRIMARY KEY,
    story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
    keys_json TEXT NOT NULL,
    secondary_keys_json TEXT,
    content TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    insertion_depth INTEGER NOT NULL DEFAULT 4,
    enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE episodic_memories (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    witness_ids_json TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    turn_start INTEGER NOT NULL,
    turn_end INTEGER NOT NULL
);

CREATE INDEX idx_messages_branch_created ON messages(branch_id, created_at);
CREATE INDEX idx_lorebook_story ON lorebook_entries(story_id, enabled);

```

### Contratos de comunicación, concurrencia y seguridad local

* **Protocolos combinados (REST + SSE):** Mantener REST con validación Pydantic para operaciones CRUD en **catalog.py**, **creator.py** y **model_storage.py**, e implementar Server-Sent Events (SSE) para el turno narrativo y el progreso de descargas/imágenes. SSE es superior a WebSockets en este caso porque opera sobre HTTP estándar, atraviesa túneles de Google Colab (**workers.py**) sin desconexiones silenciosas y soporta reconexión nativa.


* **Seguridad en entorno local y workers remotos:** Forzar el bind de **main.py** a `127.0.0.1` por defecto; exigir cabeceras `Authorization: Bearer <token>` gestionadas por **secrets.py** en **worker_server.py**; validar todas las rutas de archivos en **model_storage.py** y **creator_media.py**; y limpiar cualquier etiqueta HTML/script en los metadatos importados desde tarjetas de personajes externas.



## 15 — Rendimiento y benchmarks

El proyecto dispone de infraestructura específica para mediciones en **tools/worker_benchmark.py**, **apps/api/noble_api/worker_telemetry.py** y **tests/test_worker_benchmark.py**.

### Análisis de cuellos de botella por capa

* **Frontend (apps/web/src/):** Renderizar cientos de burbujas de diálogo con imágenes en alta resolución dentro de **VisualReader.tsx** sin virtualización ni carga diferida (`loading="lazy"`, `decoding="async"`) degrada el hilo principal durante el streaming de tokens. Además, actualizar el estado del mensaje en cada token individual (50 veces por segundo) sin agrupar mediante `requestAnimationFrame` provoca micro-tirones.


* **Backend (apps/api/noble_api/):** Operaciones síncronas de disco o llamadas HTTP bloqueantes dentro de rutas `async def` congelan el bucle de eventos de FastAPI; todas las operaciones pesadas en **images.py**, **speech.py** y **downloads.py** deben ejecutarse con clientes asíncronos (`httpx.AsyncClient`) o delegarse a `asyncio.to_thread`.


* **IA Local:** El principal cuello de botella es la **reevaluación completa del prompt** cuando se altera el inicio del contexto en cada turno, seguida por la contención de PCIe al intercambiar pesos entre RAM y VRAM si no se reutilizan los sprites y fondos en caché.

### Protocolo de benchmarks reproducibles

Dado que este informe se elabora en modo de auditoría estática sin ejecutar procesos sobre hardware físico (Regla 2 y Regla 14), se define el procedimiento exacto para ejecutar y verificar las métricas utilizando **tools/worker_benchmark.py**:

| Métrica | Definición técnica | Objetivo Local (RTX 5060 Ti 16 GB) | Objetivo Worker Colab |
| --- | --- | --- | --- |
| **TTFT (Cache Hit)** | Tiempo hasta el 1er token con prefijo en KV cache | < 350 ms | < 900 ms (incluye red) |
| **TTFT (Cold Prompt)** | Tiempo hasta el 1er token evaluando 4096 tokens | < 1800 ms | < 2500 ms |
| **TPS Generación** | Velocidad sostenida de generación (modelo 12B Q4_K_M) | > 42 tokens/s | > 30 tokens/s |
| **Latencia Visual Caché** | Tiempo de cambio de expresión por sprite en caché | < 16 ms (1 frame) | < 50 ms |
| **Latencia Nuevo Fondo** | Renderizado 1024x576 en ComfyUI (20 pasos SDXL/Turbo) | < 6.5 s | < 9.0 s |

La tabla establece los umbrales de aceptación verificables al ejecutar **tools/worker_benchmark.py** en local y remoto.

## 16 — Funcionalidades faltantes

Evaluando fríamente la lista de oportunidades frente al estado actual del repositorio, se clasifica qué aporta valor real inmediato y qué debe descartarse o posponerse para evitar sobreingeniería:

* **Funcionalidades que SÍ deben implementarse ahora (Alto valor, viabilidad directa):**
* **Inspector de contexto y presupuesto de tokens en vivo:** Indispensable en **NarrativeSettings.tsx** para depurar prompts y evitar truncamientos silenciosos.


* **Importación/exportación de tarjetas PNG V2/V3 y paquetes de historia:** Crítico en **creator.py** para que el usuario tenga contenido inmediato sin escribir todo desde cero.


* **Bifurcación visual de ramas, edición de mensajes y regeneración selectiva:** Aprovecha la base ya existente en **tests/test_story_branches.py** para dar control total sobre la historia.


* **Hojas de expresiones por personaje y voces diferenciadas en Piper TTS:** Eleva inmediatamente la calidad de **VisualReader.tsx** y **speech.py** al nivel de Isekai Zero.


* **Perfiles de rendimiento y modo de bajos recursos:** Conecta **resource_policy.py** y **config/gpu_profiles.json** con un selector simple en la UI (*Modo Velocidad: Solo Sprites*, *Modo Equilibrado*, *Modo Cine: CGs Automáticos*).




* **Funcionalidades que deben POSPONERSE o DESCARTARSE en esta etapa (Riesgo de sobreingeniería):**
* **Editor complejo de nodos condicionales estilo motor de videojuegos:** Obliga al autor a programar lógica booleana en lugar de escribir narrativa; el estado canónico gestionado por **narrative.py** resuelve mejor el problema.


* **Mapas cartográficos interactivos y sistemas de comercio/misiones RPG pesados:** Desvían el foco de una plataforma de novelas visuales hacia un clon de motor RPG tradicional.
* **Marketplace de plugins ejecutando código arbitrario:** Introduce graves riesgos de seguridad local antes de tener estabilizados los contratos internos de la API.



## 17 — Diferenciadores de producto y matriz de investigación de repositorios

### Diez oportunidades de diferenciación frente a Isekai Zero y alternativas actuales

1. **Estudio Automático de Hojas de Sprites ("One-Click Sprite Sheet"):** Al crear un personaje en **CreatorStudio.tsx**, generar automáticamente en lote sus 6 expresiones emocionales con fondo transparente mediante ComfyUI y guardarlas en **creator_media.py** (Viabilidad: Alta | Utilidad: Muy alta).


2. **Memoria con Aislamiento Cognitivo por Testigo (Anti-Omnisciencia):** Etiquetar cada recuerdo en **store.py** con los personajes presentes para que un personaje nunca sepa un secreto revelado en otra habitación (Viabilidad: Alta | Utilidad: Muy alta).


3. **Máquina del Tiempo Visual con Restauración de Canon:** Al retroceder o bifurcar en el árbol de ramas (**test_story_branches.py**), restaurar instantáneamente la ilustración, música/voz, inventario y relaciones exactas de ese momento (Viabilidad: Alta | Utilidad: Alta).


4. **Cómputo Híbrido Transparente Local + Google Colab:** Aprovechar **workers.py** y **notebooks/noble_worker_colab_gpu.ipynb** para que el usuario mantenga su base de datos 100% privada en su PC mientras delega la carga pesada de ComfyUI a una GPU gratuita de Colab cuando usa una portátil modesta (Viabilidad: Ya iniciada en el repo | Utilidad: Muy alta).


5. **Director de Ritmo y Tensión ("Anti-Stagnation Pacing Engine"):** Detector en **narrative.py** que identifica bucles conversacionales e inyecta sutilmente giros o avances de escena basados en los objetivos del capítulo (Viabilidad: Media | Utilidad: Alta).


6. **Inspector de Rayos X del Prompt y KV Cache:** Panel en **NarrativeSettings.tsx** que muestra qué recuerdos del Lorebook se activaron en el turno actual y qué porcentaje del prompt se sirvió desde la caché de la GPU (Viabilidad: Alta | Utilidad: Alta).


7. **Doblaje Coral Local con Piper TTS + Lip-Sync de Sprites:** Asignar modelos de voz distintos en **speech.py** a cada personaje y animar la apertura de boca del sprite en **VisualReader.tsx** usando la envolvente de amplitud del audio (Viabilidad: Alta | Utilidad: Alta).


8. **Modo "Libro Ilustrado Exportable" (EPUB / HTML Interactivo):** Compilar cualquier rama de una historia jugada junto con sus ilustraciones generadas en un libro digital limpio para leer sin conexión (Viabilidad: Alta | Utilidad: Media-Alta).
9. **Simulador de Compatibilidad Matemática pre-descarga:** Mostrar en **RuntimeManager.tsx** (**model_fit.py**) exactamente cuántos tokens por segundo y cuánta VRAM consumirá un modelo en la GPU del usuario antes de descargar 10 GB (Viabilidad: Ya iniciada | Utilidad: Muy alta).


10. **Dirección Visual en Vivo ("Camera & Lighting Override"):** Permitir al usuario cambiar el ángulo de cámara, clima o iluminación de la escena actual en **VisualReader.tsx** con un clic sin alterar el texto narrativo (Viabilidad: Media | Utilidad: Media-Alta).



### Matriz comparativa de proyectos (Parte A: Plataformas principales)

| Categoría | Novel AI (Actual) | Isekai Zero | SillyTavern | RisuAI |
| --- | --- | --- | --- | --- |
| Gestión narrativa y ramas | Confirmado | Parcial | Confirmado | Confirmado |
| Memoria, Lorebooks y RAG | Parcial | Confirmado | Confirmado | Confirmado |
| Fichas de personajes y V2 | Parcial | Confirmado | Confirmado | Confirmado |
| Model Hub y ajuste GPU | Confirmado | No aplicable | Parcial | Parcial |
| Pipeline visual y sprites | Confirmado | Confirmado | Confirmado | Confirmado |
| Interfaz Novela Visual | Confirmado | Confirmado | Parcial | Confirmado |
| Ejecución local + Workers | Confirmado | Ausente | Confirmado | Confirmado |

La tabla A compara la evidencia verificada en el repositorio de Novel AI frente a Isekai Zero, SillyTavern y RisuAI.

### Matriz comparativa de proyectos (Parte B: Motores narrativos especializados)

| Categoría | Talemate | Gamentic | Open Dungeon | TaleWeaver |
| --- | --- | --- | --- | --- |
| Gestión narrativa y ramas | Confirmado | Confirmado | Parcial | Confirmado |
| Memoria, Lorebooks y RAG | Confirmado | Parcial | Parcial | Parcial |
| Fichas de personajes y V2 | Confirmado | Parcial | Ausente | Parcial |
| Model Hub y ajuste GPU | Parcial | Ausente | Parcial | Ausente |
| Pipeline visual y sprites | Confirmado | Ausente | Parcial | Ausente |
| Interfaz Novela Visual | Parcial | Ausente | Ausente | Ausente |
| Ejecución local + Workers | Confirmado | Confirmado | Confirmado | Parcial |

La tabla B resume las capacidades verificadas en los cuatro motores narrativos adicionales analizados.

### Las 3 funcionalidades más valiosas por repositorio de referencia y costo de adopción

* **De RisuAI (MPL-2.0):**
1. Importador/exportador de tarjetas PNG V2/V3 con activos incrustados (Costo: Bajo, 2 días en **creator_media.py**).


2. Escáner de Lorebooks con activación recursiva y claves regex (Costo: Medio, 3 días en **narrative.py**).


3. Empaquetado ligero de escritorio mediante Tauri v2 (Costo: Medio, 4 días en fase de distribución).


* **De SillyTavern (AGPL-3.0 — adaptar diseño conceptual):**
1. Asignador de presupuesto de tokens por capas con profundidades configurables (`Injection Depth`) (Costo: Medio, 3 días en **narrative.py**).


2. Clasificador de emociones acoplado al conmutador de sprites de personajes (Costo: Bajo, 2 días en **scene_planner.py** y **VisualReader.tsx**).


3. Perfiles de conexión y plantillas de instruct/contexto por familia de modelo (Costo: Bajo, 2 días en **runtime.py**).




* **De Talemate:**
1. Separación entre el agente narrador en streaming y el agente actualizador de estado de escena en segundo plano (Costo: Medio, 4 días en **narrative.py** y **scene_planner.py**).


2. Seguimiento explícito de personajes presentes por ubicación espacial (Costo: Bajo, 2 días en **visual_state.py**).


3. Consolidación jerárquica de escenas pasadas en nodos de memoria episódica (Costo: Medio, 3 días en **store.py**).




* **De Gamentic, Open Dungeon y TaleWeaver:**
1. Validación determinista de estado e inventario antes de resolver acciones críticas (Gamentic — Costo: Medio, 3 días en **narrative.py**).


2. Selector rápido de intención de entrada `Diálogo / Acción / Historia` (Open Dungeon — Costo: Bajo, 1 día en **VisualReader.tsx**).


3. Organización jerárquica por Capítulos y Escenas con resúmenes de arco (TaleWeaver — Costo: Medio, 3 días en **StoryStudio.tsx**).

## 18 — Matriz de prioridades y clasificación de mejoras

La priorización técnica de Novel AI (`noble_api` y `apps/web`) se estructura sobre la evidencia del árbol de módulos del paquete adjunto, distinguiendo la estructura de archivos confirmada de los flujos internos cuyos bloques comprimidos requieren verificación en tiempo de ejecución. El ordenamiento prioriza la integridad de la persistencia, la coherencia del estado narrativo y el arbitraje de memoria de video (VRAM) antes de escalar las capas visuales o multiagente.

### Tabla maestra de priorización (P0 a P3)

| ID | Mejora / Hallazgo | Categoría | Complejidad | Orden |
| --- | --- | --- | --- | --- |
| AUD-001 | Transacciones SQLite WAL en `store.py` | P0 Crítico | Media | 1 |
| AUD-002 | Arbitraje VRAM LLM/ComfyUI en `resource_policy.py` | P0 Crítico | Alta | 2 |
| AUD-003 | Saneamiento de rutas y descargas en `downloads.py` | P0 Crítico | Baja | 3 |
| AUD-004 | Streaming SSE y cancelación en `runtime.py` | P0 Crítico | Media | 4 |
| AUD-005 | Motor de estado canónico y ramas en `narrative.py` | P1 Alta | Alta | 5 |
| AUD-006 | Memoria híbrida y Lorebooks con `sqlite-vec` | P1 Alta | Alta | 6 |
| AUD-007 | Orquestación de escena determinista en `scene_planner.py` | P1 Alta | Media | 7 |
| AUD-008 | Desacoplamiento de rutas y estado en `App.tsx` | P1 Alta | Media | 8 |
| AUD-009 | Capas de sprites y caché visual en `VisualReader.tsx` | P1 Alta | Alta | 9 |
| AUD-010 | Gestor de procesos locales GGUF en `runtime.py` | P1 Alta | Alta | 10 |
| AUD-011 | Sondeo real de GPU/VRAM en `hardware.py` y `model_fit.py` | P2 Media | Media | 11 |
| AUD-012 | Importador Character Card V2/V3 en `creator.py` | P2 Media | Baja | 12 |
| AUD-013 | Cola asíncrona de audio y fonemas en `speech.py` | P2 Media | Media | 13 |
| AUD-014 | Inspector de presupuesto de tokens en `NarrativeSettings.tsx` | P2 Media | Baja | 14 |
| AUD-015 | Grafo visual de bifurcaciones en `StoryStudio.tsx` | P3 Evolutivo | Alta | 15 |
| AUD-016 | Consistencia facial IP-Adapter/LoRA en `images.py` | P3 Evolutivo | Muy alta | 16 |
| AUD-017 | Simulación autónoma de mundo en `narrative.py` | P3 Evolutivo | Muy alta | 17 |
| AUD-018 | SDK de plugins en sandbox para `apps/web` | P3 Evolutivo | Alta | 18 |

### Justificación multidimensional de prioridades

* **P0 — Crítico (Bloqueantes, integridad de datos y estabilidad de recursos):**
* **AUD-001 (`apps/api/noble_api/store.py`):** Sin escrituras atómicas bajo SQLite en modo WAL, un fallo durante la generación simultánea de texto y estado corrompe la sesión activa. Su impacto en el usuario es máximo y su resolución desbloquea toda la capa narrativa.


* **AUD-002 (`apps/api/noble_api/resource_policy.py` y `media.py`):** En GPUs de 8 GB a 16 GB (como la RTX 5060 Ti de referencia), ejecutar un LLM 8B-14B junto con ComfyUI sin descarga explícita de modelos provoca errores de memoria agotada (OOM).


* **AUD-003 (`apps/api/noble_api/downloads.py` y `model_storage.py`):** La gestión de pesos locales requiere verificación estricta de rutas (`Path.resolve()`) y validación SHA-256 con soporte de reanudación HTTP Range para evitar archivos truncados o escritura fuera del directorio autorizado.


* **AUD-004 (`apps/api/noble_api/runtime.py` y `apps/web/src/api.ts`):** Las peticiones bloqueantes degradan la experiencia percibida y carecen de un canal `AbortController` de extremo a extremo que libere cómputo en el worker cuando el usuario detiene o regenera una respuesta.




* **P1 — Prioridad alta (Núcleo narrativo, memoria y experiencia tipo Isekai Zero):**
* **AUD-005 (`apps/api/noble_api/narrative.py`):** Para superar un chat genérico, la generación debe separar el diálogo visible de la mutación del estado del mundo, respaldando los casos cubiertos en `tests/test_story_canon.py` y `tests/test_story_branches.py`.


* **AUD-006 (`apps/api/noble_api/narrative.py` y `store.py`):** Los modelos locales de contexto moderado (8k-16k tokens) colapsan en historias extensas si no cuentan con inyección selectiva por palabras clave (Lorebooks) y recuperación semántica ligera.
* **AUD-007 (`apps/api/noble_api/scene_planner.py` y `visual_state.py`):** La transición hacia novela visual exige que el planificador traduzca el estado narrativo en descriptores estructurados (ubicación, personajes en escena, emoción, pose e iluminación) antes de invocar a `images.py`.


* **AUD-008 (`apps/web/src/App.tsx`):** La concentración de vistas (`StoryStudio.tsx`, `CreatorStudio.tsx`, `RuntimeManager.tsx`, `RemoteWorkers.tsx`, `VisualReader.tsx`) requiere enrutamiento dedicado y estado segmentado para evitar re-renderizados globales.


* **AUD-009 (`apps/web/src/VisualReader.tsx`):** La inmersión visual depende de separar el fondo escénico, las capas de sprites con transparencia por expresión y la caja de diálogo sincronizada.


* **AUD-010 (`apps/api/noble_api/runtime.py` y `workers.py`):** Aunque el proyecto soporta workers remotos de Colab (`worker_server.py`, `notebooks/noble_worker_colab_gpu.ipynb`), la independencia local exige levantar y supervisar subprocesos de `llama-server` o conectar nativamente con Ollama/KoboldCpp.




* **P2 — Prioridad media (Calidad de vida, ajuste de hardware e interoperabilidad):**
* **AUD-011 (`apps/api/noble_api/hardware.py` y `model_fit.py`):** Cruzar las lecturas reales de NVML/ROCm y RAM del sistema con `config/gpu_profiles.json` permite estimar con precisión el consumo de KV cache y las capas delegadas a GPU.


* **AUD-012 (`apps/api/noble_api/creator.py` y `creator_media.py`):** La compatibilidad con fragmentos `tEXt`/`iTXt` en PNG (estándar de SillyTavern y RisuAI) permite poblar instantáneamente la biblioteca local de personajes.


* **AUD-013 (`apps/api/noble_api/speech.py`):** La síntesis con Piper TTS verificada en `tests/test_piper_speech.py` debe operar por fragmento de oración en segundo plano para reducir la latencia de reproducción.


* **AUD-014 (`apps/web/src/NarrativeSettings.tsx`):** Exponer un desglose visual del presupuesto de tokens evita que el usuario configure instrucciones que desborden o trunquen silenciosamente la memoria de la historia.




* **P3 — Evolutivo (Diferenciación competitiva avanzada):**
* **AUD-015 a AUD-018:** Incluyen el editor nodal de líneas temporales, pipelines avanzados de identidad visual en difusión, eventos de mundo fuera de cámara y arquitectura de extensiones. Se posponen hasta estabilizar los cimientos P0 y P1.



### Clasificación por tipo de intervención técnica

* **Quick wins (1 a 3 días de esfuerzo, bajo riesgo):**
* Bloqueo de seguridad en rutas de archivos locales dentro de `apps/api/noble_api/model_storage.py` y `creator_media.py`.


* Enlace por defecto del servidor FastAPI (`apps/api/noble_api/main.py`) a `127.0.0.1` en lugar de `0.0.0.0` salvo activación explícita del modo worker remoto.


* Caché en memoria y validación de esquemas JSON con `config/model_assignments.schema.json` al iniciar el plano de control.


* Controles de teclado rápido en `apps/web/src/VisualReader.tsx` (Espacio para avanzar texto, `H` para ocultar interfaz, `R` para regenerar turno).




* **Refactorizaciones necesarias (Saneamiento de deuda técnica):**
* Extracción de las llamadas `fetch` crudas en `apps/web/src/api.ts` hacia un cliente tipado con soporte de `AbortSignal`, reintentos exponenciales y manejo de flujos SSE.


* División de `apps/web/src/styles.css` en tokens de diseño modulares y variables CSS semánticas para separar el tema del área de administración respecto al lienzo inmersivo del lector.


* Unificación del manejo de excepciones en `apps/api/noble_api/main.py` para devolver respuestas de error estructuradas con códigos de dominio (`VRAM_EXHAUSTED`, `WORKER_UNREACHABLE`, `CONTEXT_OVERFLOW`).




* **Mejoras arquitectónicas (Rediseño estructural):**
* Migración de `apps/api/noble_api/store.py` hacia un repositorio transaccional SQLite con tablas relacionales para historias, ramas (`branches`), nodos de mensajes, entidades del canon y vectores de memoria.


* Implementación de un coordinador asíncrono de GPU en `apps/api/noble_api/resource_policy.py` que gestione bloqueos (`asyncio.Lock`) y políticas de desalojo (TTL y descarga bajo demanda) entre el motor LLM, ComfyUI y Piper TTS.


* Pipeline de ensamblaje de prompts por capas con caché de prefijos estáticos en `apps/api/noble_api/narrative.py` para evitar reevaluar todo el contexto en `llama.cpp` cada turno.




* **Funcionalidades nuevas (Expansión de producto):**
* Motor de Lorebooks / World Info con activación recursiva por palabras clave, prioridades de inserción y presupuesto máximo de tokens.
* Modo de composición por capas en `VisualReader.tsx` que combine fondos generados con sprites de personajes por emoción (neutral, feliz, enfadado, sorprendido, triste).


* Importador/exportador universal de historias y tarjetas de personajes en formatos PNG (`chara_card_v2` / `ccv3`) y paquetes `.noble.zip`.


* **Investigaciones pendientes (Sujetas a pruebas dinámicas fuera del análisis estático):**
* **Verificación dinámica de payloads comprimidos:** Dado que la inspección del paquete adjunto se realizó mediante análisis estático de la estructura del repositorio, los flujos exactos de resolución en `tests/test_colab_qa_v15.py` y la telemetría en `apps/api/noble_api/worker_telemetry.py` deben validarse ejecutando `pytest` y Playwright (`apps/web/playwright.config.ts`) en un entorno activo.


* **Pruebas de latencia de intercambio de VRAM en Windows 11:** Medir el tiempo real de descarga de pesos GGUF mediante la API de Ollama o `llama-server` antes de disparar un workflow SDXL/Flux en ComfyUI sobre la RTX 5060 Ti de 16 GB.



---

## 19 — Hoja de ruta

El plan de desarrollo se organiza en seis fases secuenciales diseñadas según las dependencias técnicas reales del sistema. Ninguna fase de interfaz o generación multimedia se inicia sin haber consolidado previamente las estructuras de estado, persistencia y control de hardware que la sustentan.

### Fase 1: Cimientos de persistencia, seguridad local y contratos de API (Semanas 1–2)

* **Objetivo:** Garantizar que ningún fallo de inferencia, corte de red con workers o cierre inesperado corrompa las historias, asegurando un contrato tipado y streaming reactivo entre backend y frontend.
* **Funcionalidades:**
1. Motor de base de datos SQLite en modo `WAL` (Write-Ahead Logging) con soporte de migraciones versionadas.
2. Streaming de respuestas de texto mediante Server-Sent Events (SSE) con soporte de cancelación inmediata.
3. Validación criptográfica SHA-256 y reanudación HTTP Range para el gestor de descargas de modelos.
4. Cifrado o almacenamiento seguro en el llavero del sistema operativo para tokens de Hugging Face y claves de workers remotos.


* **Problemas que corrige:** AUD-001, AUD-003 y AUD-004.
* **Componentes afectados:** `apps/api/noble_api/store.py`, `apps/api/noble_api/downloads.py`, `apps/api/noble_api/model_storage.py`, `apps/api/noble_api/secrets.py`, `apps/api/noble_api/main.py`, `apps/web/src/api.ts` y `apps/web/src/types.ts`.


* **Dependencias previas:** Ninguna (fase fundacional).
* **Arquitectura propuesta:** Reemplazar lecturas/escrituras monolíticas en `store.py` por un patrón Unit of Work sobre SQLite con tablas normalizadas (`stories`, `branches`, `messages`, `characters`, `story_characters`, `canon_facts`, `media_assets`). Implementar endpoints SSE en `main.py` que emitan eventos tipados (`token`, `state_delta`, `scene_plan`, `done`, `error`).


* **Referencias externas:** Esquema de persistencia local de RisuAI y manejo de flujos abortables en SillyTavern (`src/endpoints/backends/`).
* **Complejidad estimada:** Media.
* **Riesgos:** Bloqueos de escritura en SQLite si se abren múltiples conexiones sin un pool serializado de escritura; se mitiga con `busy_timeout = 5000` y una única cola de escritura asíncrona.
* **Pruebas necesarias:** Pruebas de concurrencia en `tests/test_story_branches.py`, pruebas de interrupción de descarga en `tests/test_model_storage.py` y verificación de contratos en `docs/CONTRATOS_API.md`.


* **Criterios de aceptación:**
1. El 100% de las mutaciones de mensajes y estado se ejecutan dentro de transacciones atómicas con rollback automático ante error.
2. La cancelación desde el cliente detiene la generación en el backend en menos de 200 ms.
3. Una descarga interrumpida al 50% se reanuda desde el byte exacto sin duplicar datos ni aceptar rutas relativas maliciosas (`../`).


* **Resultado esperado para el usuario:** Guardado instantáneo a prueba de fallos, generación de texto fluida palabra por palabra con botón de parada inmediata y descargas de modelos confiables.

### Fase 2: Orquestador de hardware, Model Hub V2 y gestor de procesos locales (Semanas 3–4)

* **Objetivo:** Convertir a Novel AI en una plataforma verdaderamente autónoma en escritorio, capaz de detectar el hardware real, recomendar cuantizaciones exactas y coordinar la VRAM entre texto, imagen y voz sin depender obligatoriamente de Google Colab.
* **Funcionalidades:**
1. Inspector de hardware real (NVML para NVIDIA, `rocm-smi`/`dxgi` como alternativa, CPU y RAM libre).
2. Calculadora matemática de ajuste de modelos (`model_fit.py`) considerando pesos, KV cache según longitud de contexto y sobrecarga de activaciones.


3. Supervisor de procesos locales para `llama-server` (binario GGUF) y adaptadores directos para Ollama, LM Studio y KoboldCpp.
4. Coordinador de recursos GPU (`resource_policy.py`) con modos de ejecución: *Exclusivo*, *Compartido* y *Secuencial con Offloading*.




* **Problemas que corrige:** AUD-002, AUD-010 y AUD-011.
* **Componentes afectados:** `apps/api/noble_api/hardware.py`, `apps/api/noble_api/model_fit.py`, `apps/api/noble_api/resource_policy.py`, `apps/api/noble_api/runtime.py`, `apps/api/noble_api/catalog.py`, `config/gpu_profiles.json`, `apps/web/src/RuntimeManager.tsx` y `apps/web/src/modelCatalogCache.ts`.


* **Dependencias previas:** Fase 1 (descargas reanudables en `downloads.py` y almacenamiento verificado en `model_storage.py`).


* **Arquitectura propuesta:** Introducir la abstracción `InferenceProvider` en `runtime.py` con implementaciones para `ManagedLlamaCppProvider`, `OllamaProvider`, `OpenAICompatibleProvider` y `RemoteColabWorkerProvider`. En `resource_policy.py`, implementar una máquina de estados de VRAM que reduzca las capas en GPU o descargue temporalmente el LLM mediante su API de ciclo de vida cuando `images.py` solicite un lote pesado en ComfyUI.


* **Referencias externas:** Estimador de VRAM de KoboldCpp y sistema de perfiles de contexto de SillyTavern.
* **Complejidad estimada:** Alta.
* **Riesgos:** Incompatibilidad de binarios CUDA/Vulkan según los drivers del usuario en Windows; se mitiga detectando capacidades con `hardware.py` y ofreciendo fallback automático a Vulkan o CPU.


* **Pruebas necesarias:** Ampliación de `tests/test_model_hardware_fit.py`, `tests/test_resource_policy.py`, `tests/test_runtime.py` y `apps/web/tests/catalog.spec.ts`.


* **Criterios de aceptación:**
1. En el equipo de referencia (RTX 5060 Ti 16 GB, 64 GB RAM), `model_fit.py` clasifica correctamente un modelo 12B Q4_K_M con 16k de contexto como "Ejecución 100% en VRAM" y alerta cuando se activa simultáneamente un modelo de difusión SDXL.


2. La ejecución secuencial de turno narrativo + generación de imagen en ComfyUI completa 20 ciclos seguidos sin errores CUDA OOM.
3. El usuario puede explorar, filtrar por cuantización, descargar y cargar un archivo GGUF desde Hugging Face sin tocar la terminal.


* **Resultado esperado para el usuario:** Un Model Hub transparente que indica qué modelos funcionarán rápidos en su PC y gestiona la memoria gráfica automáticamente sin cuelgues.

### Fase 3: Motor narrativo estructurado, memoria híbrida y Lorebooks (Semanas 5–7)

* **Objetivo:** Dotar a la aplicación de coherencia narrativa a largo plazo, separando el estado del mundo de la generación literaria e implementando memoria multicapa inspirada en Isekai Zero, Talemate y SillyTavern.
* **Funcionalidades:**
1. Estado narrativo canónico versionado por turno (ubicación actual, hora/clima, personajes presentes, inventario, relaciones y banderas de trama).
2. Sistema de Lorebooks / World Info con activación por palabras clave, claves secundarias, prioridades y límite de presupuesto de tokens.
3. Memoria episódica con resumen progresivo jerárquico y recuperación semántica local mediante `sqlite-vec`.
4. Ensamblador de prompts determinista optimizado para preservar el caché de prefijos (`KV cache shifting`) en motores locales.
5. Árbol de bifurcaciones narrativas (`branches`) con clonación de estado y retroceso a cualquier punto de la historia.


* **Problemas que corrige:** AUD-005, AUD-006 y AUD-014.
* **Componentes afectados:** `apps/api/noble_api/narrative.py`, `apps/api/noble_api/store.py`, `apps/api/noble_api/creator.py`, `docs/ESTADO_Y_MEMORIA.md`, `apps/web/src/NarrativeSettings.tsx` y `apps/web/src/StoryStudio.tsx`.


* **Dependencias previas:** Fase 1 (esquema transaccional en `store.py`) y Fase 2 (proveedores locales con soporte de gramáticas o JSON Schema en `runtime.py`).


* **Arquitectura propuesta:** Dividir el ciclo de `narrative.py` en tres etapas:
1. **Pre-procesamiento (`prepare`):** Calcula el presupuesto de tokens, activa entradas del Lorebook, consulta los $k$ recuerdos episódicos más relevantes en `sqlite-vec` y construye un prompt cuyo bloque inicial (System + Personajes + Canon fijo) permanece invariable para maximizar el acierto de KV cache.


2. **Generación principal:** Produce la narración y el diálogo en streaming SSE hacia el usuario.
3. **Post-procesamiento asíncrono:** Extrae deltas de estado (cambios de ubicación, actitud de personajes o hechos nuevos) mediante una llamada ligera con salida estructurada JSON o heurísticas deterministas, guardando el snapshot vinculado al ID del mensaje.


* **Referencias externas:** Arquitectura de estado de escena de Talemate (`src/talemate/game/engine/`) y motor de World Info de SillyTavern (`public/scripts/world-info.js`).
* **Complejidad estimada:** Alta.
* **Riesgos:** Que los modelos pequeños (7B-8B) generen JSON inválido al extraer el estado; se mitiga forzando gramáticas GBNF/JSON Schema en el motor de inferencia y aplicando un reparador tolerante a fallos antes de persistir.
* **Pruebas necesarias:** Suites unitarias y de integración en `tests/test_narrative.py`, `tests/test_narrative_prepare.py`, `tests/test_story_canon.py` y `tests/test_story_branches.py`.


* **Criterios de aceptación:**
1. En una simulación de 100 turnos, los hechos declarados como permanentes en el turno 5 y las relaciones modificadas en el turno 20 son recuperados sin contradicciones en el turno 100.
2. Crear una rama en el turno 15 restaura exactamente la ubicación, inventario y recuerdos vigentes en ese turno sin contaminar la línea temporal original.
3. La barra de presupuesto en `NarrativeSettings.tsx` muestra en tiempo real los tokens consumidos por instrucciones, personajes, Lorebook, memoria episódica e historial reciente.




* **Resultado esperado para el usuario:** Personajes que recuerdan promesas pasadas, respetan quién está presente en la habitación, mantienen su personalidad intacta y permiten explorar rutas alternativas ("¿qué habría pasado si...?").

### Fase 4: Pipeline de dirección escénica, generación visual y voz (Semanas 8–9)

* **Objetivo:** Transformar el flujo de texto en una experiencia audiovisual sincronizada donde los fondos, retratos expresivos y voces respondan dinámicamente a los acontecimientos narrativos sin latencias prohibitivas.
* **Funcionalidades:**
1. Director escénico (`scene_planner.py`) que determina cuándo reutilizar un fondo en caché, cuándo cambiar solo el sprite de expresión del personaje y cuándo solicitar una nueva ilustración a ComfyUI.


2. Gestor de plantillas de workflows de ComfyUI parametrizables (SD 1.5, SDXL, Pony/Illustrious, Flux Schnell/Dev) con inyección dinámica de semillas, prompts positivos/negativos, LoRAs de personajes y resoluciones.
3. Sistema de hojas de expresiones por personaje (sprites transparentes recortados automáticamente con `rembg` o cargados en `creator_media.py`).


4. Síntesis de voz multi-personaje en `speech.py` asignando modelos Piper TTS distintos al narrador y a cada personaje.




* **Problemas que corrige:** AUD-007, AUD-013 y AUD-016.
* **Componentes afectados:** `apps/api/noble_api/scene_planner.py`, `apps/api/noble_api/visual_state.py`, `apps/api/noble_api/images.py`, `apps/api/noble_api/speech.py`, `apps/api/noble_api/media.py`, `apps/api/noble_api/creator_media.py` y `docs/IMAGENES.md`.


* **Dependencias previas:** Fase 2 (arbitraje de VRAM en `resource_policy.py`) y Fase 3 (estado canónico de escena y emociones en `narrative.py`).


* **Arquitectura propuesta:** Implementar una clave de caché semántica en `visual_state.py` compuesta por `(location_id, time_of_day, weather, camera_shot)`. Si la ubicación no cambia en el turno actual, `scene_planner.py` evita llamar a ComfyUI para el fondo y únicamente actualiza la capa de sprite del personaje activo según la emoción detectada (`joy`, `anger`, `sadness`, `surprise`, `neutral`), reduciendo el tiempo de actualización visual a 0 ms en el 80% de los turnos. Cuando ocurre un cambio de escenario o un evento clave (CG), se encola un trabajo asíncrono en `images.py` que notifica al frontend mediante SSE al completarse.


* **Referencias externas:** Sistema de expresiones de SillyTavern (`public/scripts/extensions/expressions/`) y adaptador de ComfyUI de RisuAI.
* **Complejidad estimada:** Alta.
* **Riesgos:** Inconsistencia en la apariencia del personaje al generar imágenes libres desde cero; se mitiga fijando un bloque de rasgos físicos inmutables (`appearance_tokens`) + semilla bloqueada o LoRA específico en la ficha del personaje dentro de `creator.py`.


* **Pruebas necesarias:** `tests/test_scene_planner.py`, `tests/test_visual_state.py`, `tests/test_comfy_images.py`, `tests/test_media_coordination.py` y `apps/web/tests/multimedia.spec.ts`.


* **Criterios de aceptación:**
1. Los cambios de emoción dentro de una misma escena actualizan el retrato del personaje instantáneamente sin regenerar el fondo.
2. Al cambiar de ubicación narrativa, el fondo anterior se mantiene con un indicador sutil de renderizado hasta realizar un fundido cruzado (`crossfade`) automático hacia la nueva imagen generada.
3. El diálogo hablado por dos personajes distintos se sintetiza con sus respectivos timbres configurados en Piper TTS sin cortar la narración.


* **Resultado esperado para el usuario:** Sensación genuina de novela visual viva, con cambios de expresión inmediatos, ilustraciones coherentes con la escena y voces diferenciadas por personaje.

### Fase 5: Rediseño UX/UI, Lector Inmersivo y Estudio de Creación tipo Isekai Zero (Semanas 10–11)

* **Objetivo:** Reemplazar la interfaz acoplada actual por una arquitectura de navegación limpia, separando el entorno inmersivo de lectura/juego de los estudios de creación y la consola técnica de infraestructura.
* **Funcionalidades:**
1. Nueva estructura de navegación dividida en cuatro dominios claros: *Biblioteca y Exploración*, *Lector Inmersivo (Modo VN / Modo Novela / Modo Chat)*, *Creator Studio (Historias, Personajes y Lorebooks)* e *Infraestructura (Model Hub, Workers y Diagnóstico)*.
2. Lector de Novela Visual multicapa (`VisualReader.tsx`) con transiciones suaves, historial desplegable (`Backlog`), guardado/carga rápida de ramas y controles de reproducción de voz.


3. Estudio de creación con modo básico y modo avanzado, previsualización en vivo del prompt ensamblado e importador de tarjetas PNG V2/V3.
4. Virtualización de listas largas de mensajes y catálogos para garantizar 60 FPS constantes.


* **Problemas que corrige:** AUD-008, AUD-009 y AUD-012.
* **Componentes afectados:** `apps/web/src/App.tsx`, `apps/web/src/VisualReader.tsx`, `apps/web/src/CreatorStudio.tsx`, `apps/web/src/StoryStudio.tsx`, `apps/web/src/StoryDetail.tsx`, `apps/web/src/CreativeSettings.tsx`, `apps/web/src/WorkspaceSettings.tsx` y `apps/web/src/styles.css`.


* **Dependencias previas:** Fases 3 y 4 (endpoints de ramas, Lorebooks, estado visual por capas y streaming SSE).
* **Arquitectura propuesta:** Refactorizar `App.tsx` utilizando un enrutador declarativo y almacenes de estado independientes (Zustand o contextos segmentados para `useSessionStore`, `useVisualStageStore`, `useHardwareStore`). Incorporar `@tanstack/react-virtual` en el historial narrativo y en la cuadrícula del Model Hub para evitar montar cientos de nodos DOM pesados.


* **Referencias externas:** Flujo de creación y reproductor de Isekai Zero (`docs/ISEKAI_ZERO_REFERENCIA.md`) y diseño de tarjetas de Koharu/Urakatsu (`docs/REFERENCIAS_URAKATSU_KOHARU.md`).


* **Complejidad estimada:** Media-Alta.
* **Riesgos:** Regresiones en las pruebas E2E existentes al modificar selectores DOM; se mitiga manteniendo atributos `data-testid` semánticos y actualizando las pruebas de Playwright en paralelo.
* **Pruebas necesarias:** Suites E2E en `apps/web/tests/app.spec.ts`, `apps/web/tests/creator.spec.ts`, `apps/web/tests/story-detail.spec.ts`, `apps/web/tests/story.spec.ts` y `apps/web/tests/visual-gallery.spec.ts`.


* **Criterios de aceptación:**
1. El usuario puede alternar en caliente entre *Modo Novela Visual* (pantalla completa con fondo, sprites y caja inferior), *Modo Libro Ilustrado* (prosa continua con ilustraciones intercaladas) y *Modo Chat* sin perder el estado ni recargar la página.
2. Arrastrar una tarjeta de personaje PNG V2 en `CreatorStudio.tsx` rellena automáticamente nombre, descripción, personalidad, primer mensaje, saludos alternativos, retrato y Lorebook embebido.


3. El tiempo de renderizado por frame al recibir tokens en streaming en una historia de 500 mensajes se mantiene por debajo de 16 ms.


* **Resultado esperado para el usuario:** Una interfaz pulida, digna de un producto comercial de ficción interactiva, donde las herramientas técnicas no estorban durante la inmersión narrativa.

### Fase 6: Empaquetado de escritorio, benchmarks reproducibles y diferenciadores P3 (Semana 12+)

* **Objetivo:** Facilitar la instalación y ejecución con un solo clic en Windows/Linux, validar el rendimiento con métricas automatizadas e introducir funciones avanzadas que diferencien a Novel AI frente a Isekai Zero.
* **Funcionalidades:**
1. Lanzador de escritorio ligero (Tauri v2 o empaquetador portable con Python embebido) con asistente de configuración inicial (`docs/ONBOARDING_Y_UI.md` y `docs/DESKTOP_Y_DESPLIEGUE.md`).


2. Suite de benchmarks automatizados en `tools/worker_benchmark.py` que mida TTFT (Time to First Token), TPS (Tokens por segundo), velocidad de procesamiento de prompt y latencia de generación de imágenes.


3. Inspector interactivo de línea temporal y grafo de ramas narrativas en `StoryStudio.tsx`.




* **Problemas que corrige:** AUD-015, AUD-017 y fricciones de despliegue local.
* **Componentes afectados:** `tools/worker_benchmark.py`, `apps/api/noble_api/worker_telemetry.py`, `apps/web/src/RemoteWorkers.tsx`, `docs/DESKTOP_Y_DESPLIEGUE.md` y `docs/QA_Y_ACEPTACION.md`.


* **Dependencias previas:** Fases 1 a 5 completadas.
* **Arquitectura propuesta:** Mantener el backend FastAPI desacoplado para que pueda ejecutarse tanto en contenedor/servidor como invocado automáticamente como subproceso (`sidecar`) desde un contenedor Tauri v2 de bajo consumo de RAM, evitando la sobrecarga de Chromium duplicado de Electron si el sistema ya dispone de WebView2 en Windows 11.
* **Referencias externas:** Empaquetado multiplataforma de RisuAI (Tauri) y sistema de telemetría existente en `apps/api/noble_api/worker_telemetry.py`.


* **Complejidad estimada:** Media.
* **Riesgos:** Falsos positivos de Windows SmartScreen en ejecutables no firmados; se mitiga documentando la distribución portable verificada por hash y automatizando la compilación en GitHub Actions (`.github/workflows/`).


* **Pruebas necesarias:** `tests/test_worker_benchmark.py`, `tests/test_workers.py` y `apps/web/tests/workers.spec.ts`.


* **Criterios de aceptación:**
1. Un usuario en una instalación limpia de Windows 11 puede iniciar la aplicación, pasar el asistente de detección de GPU, descargar un modelo recomendado e iniciar una historia visual en menos de 5 minutos (excluyendo el tiempo de red de la descarga).
2. El módulo `worker_benchmark.py` genera un informe comparativo reproducible entre inferencia local (RTX 5060 Ti) y worker remoto (Colab).




* **Resultado esperado para el usuario:** Experiencia de aplicación de escritorio nativa, estable, sin necesidad de configurar entornos virtuales de Python ni consolas manualmente.

---

## 20 — Arquitectura objetivo

### Decisión arquitectónica fundamental: Evolución modular frente a reescritura

**No se recomienda reescribir el proyecto desde cero ni fragmentarlo en microservicios distribuidos.** La estructura actual del repositorio (`apps/api/noble_api` en Python/FastAPI y `apps/web` en React/TypeScript/Vite) es la elección técnica óptima para una aplicación de IA local por tres razones verificables:

1. **Ecosistema nativo de IA en Python:** El backend en Python permite interactuar directamente con `huggingface_hub`, NVML, SQLite, procesadores de imágenes (Pillow/`rembg`), clientes de ComfyUI y motores de inferencia sin puentes inter-lenguaje innecesarios.


2. **Separación clara del plano de control y workers:** La distinción existente entre el plano de control (`control.py`, `main.py`) y los nodos de ejecución (`workers.py`, `worker_server.py`) permite operar 100% en local o delegar carga pesada a una GPU en red local o Google Colab sin cambiar la lógica de negocio.


3. **Cobertura de pruebas establecida:** El proyecto ya cuenta con 25 archivos de prueba en backend (`tests/test_*.py`) y 10 especificaciones E2E en frontend (`apps/web/tests/*.spec.ts`) que validan contratos específicos.



La estrategia correcta es **evolucionar hacia un Monolito Modular con Orquestación Asíncrona de Workers Locales/Remotos**, reorganizando internamente las responsabilidades para eliminar el acoplamiento entre las vistas de React y las rutas de FastAPI.

### Diagrama de arquitectura objetivo

```
+-----------------------------------------------------------------------------------+
|                        CAPA DE INTERFAZ (apps/web - React/TS)                     |
|                                                                                   |
|  +-------------------+  +-----------------------+  +---------------------------+  |
|  |   Creator Studio  |  |   Lector Inmersivo    |  |   Consola Infraestructura |  |
|  | - Historias/Ramas |  | - Lienzo VN Multicapa |  | - Model Hub & Fit Calc    |  |
|  | - Personajes V2/3 |  | - Modo Libro / Chat   |  | - Gestor VRAM & Workers   |  |
|  | - Lorebook Editor |  | - Backlog & Inspector |  | - Benchmarks & Telemetría |  |
|  +---------+---------+  +-----------+-----------+  +-------------+-------------+  |
|            |                        |                            |                |
|  +---------v------------------------v----------------------------v-------------+  |
|  |        Estado Reactivo Segmentado (Stores) + Cliente API / SSE / WS         |  |
+-------------------------------------+---------------------------------------------+
                                      | HTTP REST + SSE Streaming (127.0.0.1)
+-------------------------------------v---------------------------------------------+
|                    PLANO DE CONTROL LOCAL (apps/api/noble_api)                    |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |             Capa de Transporte, Validación Pydantic y Seguridad             |  |
|  +------------------+---------------------------------------+------------------+  |
|                     |                                       |                     |
|  +------------------v------------------+ +------------------v------------------+  |
|  |       DOMINIO NARRATIVO Y MEMORIA   | |    ORQUESTACIÓN DE INFRAESTRUCTURA  |  |
|  |                                     | |                                     |  |
|  | - NarrativeEngine (narrative.py)    | | - HardwareInspector (hardware.py)   |  |
|  | - Canon & Branch Manager            | | - ModelFitEngine (model_fit.py)     |  |
|  | - Lorebook & RAG (sqlite-vec)       | | - VRAM Arbitrator (resource_policy) |  |
|  | - Prompt Assembler (Prefix Cache)   | | - DownloadManager (downloads.py)    |  |
|  | - ScenePlanner (scene_planner.py)   | | - WorkerCoordinator (workers.py)    |  |
|  +------------------+------------------+ +------------------+------------------+  |
|                     |                                       |                     |
|  +------------------v---------------------------------------v------------------+  |
|  |               CAPA DE PERSISTENCIA TRANSACCIONAL (store.py)                 |  |
|  |     SQLite (WAL Mode) + Índices FTS5 + Extensión Vectorial (sqlite-vec)     |  |
|  +----------------------------------+------------------------------------------+  |
|                                     |                                             |
|  +----------------------------------v------------------------------------------+  |
|  |             ADAPTADORES MULTIMODALES Y DE INFERENCIA (runtime.py)           |  |
|  +--------+-------------------------+-------------------------+----------------+  |
+-----------|-------------------------|-------------------------|-------------------+
            |                         |                         |
   +--------v--------+       +--------v--------+       +--------v--------+
   |  Motores LLM    |       | Pipeline Visual |       |  Síntesis Voz   |
   | - llama-server  |       | - ComfyUI API   |       | - Piper TTS     |
   | - Ollama / LMSt |       | - Caché Sprites |       | - Cola Audio    |
   | - Colab Worker  |       | - Workflows JSON|       | - Voces x Actor |
   +-----------------+       +-----------------+       +-----------------+

```

### Responsabilidades estrictas por capa y módulo

* **1. Interfaz (`apps/web/src/`):**
* **Responsabilidad:** Presentación visual, composición de capas en el lector (`VisualReader.tsx`), edición de entidades (`CreatorStudio.tsx`, `StoryStudio.tsx`) y visualización de telemetría (`RuntimeManager.tsx`, `RemoteWorkers.tsx`).


* **Regla de frontera:** El frontend nunca construye el prompt final, no concatena recuerdos ni calcula heurísticas de escenas; se limita a enviar intenciones del usuario y renderizar los estados y flujos SSE emitidos por el backend.


* **2. Dominio narrativo (`apps/api/noble_api/narrative.py`):**
* **Responsabilidad:** Gestionar el ciclo de turno, bifurcaciones de historia (`branches`), validación de acciones del jugador y actualización del estado canónico del mundo.


* **Regla de frontera:** No conoce detalles de protocolos HTTP de proveedores específicos (Ollama vs. Colab); invoca la interfaz abstracta de `runtime.py`.




* **3. Gestión de personajes y medios de autor (`apps/api/noble_api/creator.py` y `creator_media.py`):**
* **Responsabilidad:** CRUD de fichas de personajes, personas del usuario, diccionarios de expresiones (mapeo `emoción -> ruta de sprite`), validación de archivos subidos y conversión de tarjetas PNG V2/V3.




* **4. Memoria y contexto (Submódulo especializado dentro de `narrative.py` y `store.py`):**
* **Responsabilidad:** Administrar la memoria de corto plazo (ventana deslizante), memoria episódica (resúmenes jerárquicos y búsqueda en `sqlite-vec`), memoria semántica/Lorebooks (activación por palabras clave y relaciones) y el ensamblador de presupuesto de tokens.




* **5. Orquestación escénica y estado visual (`apps/api/noble_api/scene_planner.py` y `visual_state.py`):**
* **Responsabilidad:** Analizar la salida narrativa y el estado canónico para emitir un objeto `VisualStageState` (fondo activo, lista de personajes en pantalla con su posición y expresión, efecto climático y necesidad de nuevo renderizado).




* **6. Proveedores de IA e inferencia (`apps/api/noble_api/runtime.py`, `workers.py` y `worker_server.py`):**
* **Responsabilidad:** Unificar el acceso a motores locales (`llama.cpp`, Ollama, KoboldCpp) y workers remotos bajo una interfaz asíncrona común con soporte de streaming, gramáticas JSON estructuradas, control de timeouts y telemetría (`worker_telemetry.py`).




* **7. Generación visual y multimedia (`apps/api/noble_api/images.py`, `speech.py` y `media.py`):**
* **Responsabilidad:** Compilar grafos de ComfyUI, gestionar la cola asíncrona de generación de imágenes, almacenar metadatos de reproducibilidad (semilla, modelo, prompt) y sintetizar pistas de audio con Piper TTS.




* **8. Persistencia (`apps/api/noble_api/store.py` y `model_storage.py`):**
* **Responsabilidad:** Garantizar durabilidad transaccional en SQLite para todas las entidades de dominio y administrar el inventario físico de archivos de modelos en disco con verificación de integridad.




* **9. Infraestructura local y arbitraje (`apps/api/noble_api/hardware.py`, `model_fit.py`, `resource_policy.py`, `catalog.py` y `downloads.py`):**
* **Responsabilidad:** Sondear GPU/CPU/RAM, calcular la viabilidad matemática de cada modelo frente al hardware detectado, ejecutar descargas reanudables desde Hugging Face y aplicar políticas de arbitraje de VRAM antes de cada operación de inferencia.





---

## 21 — Primeras veinte acciones recomendadas

Esta lista constituye la secuencia operativa exacta para que un ingeniero o agente de codificación intervenga el repositorio respetando las dependencias entre archivos:

1. **Activar SQLite WAL y transacciones atómicas en `apps/api/noble_api/store.py`:** Configurar `PRAGMA journal_mode=WAL;`, `PRAGMA synchronous=NORMAL;` y `PRAGMA foreign_keys=ON;` al inicializar la conexión, envolviendo la escritura de mensajes y cambios de estado en un bloque transaccional único.


2. **Bloquear vulnerabilidades de Path Traversal en `apps/api/noble_api/model_storage.py` y `creator_media.py`:** Validar que toda ruta resuelta mediante `Path(target).resolve()` sea estrictamente hija del directorio raíz autorizado (`is_relative_to(base_dir)`) antes de leer, escribir o eliminar archivos.


3. **Restringir el bind de red por defecto en `apps/api/noble_api/main.py`:** Fijar el host predeterminado del servidor local en `127.0.0.1` y exigir autenticación por token (`secrets.py`) en todos los endpoints de `worker_server.py` cuando se exponga en red o Colab.


4. **Implementar descargas reanudables con verificación SHA-256 en `apps/api/noble_api/downloads.py`:** Añadir cabeceras HTTP `Range: bytes=<offset>-` sobre archivos parciales `.part`, emitir eventos de progreso real (bytes descargados, velocidad en MB/s, ETA) y validar el hash final contra la API de Hugging Face antes de renombrar el archivo.


5. **Incorporar streaming SSE y cancelación en `apps/api/noble_api/main.py` y `runtime.py`:** Crear el endpoint de generación en streaming que propague la desconexión del cliente (`request.is_disconnected()`) hacia el generador asíncrono del LLM para abortar el cómputo inmediatamente.


6. **Actualizar el cliente HTTP en `apps/web/src/api.ts` con soporte de `AbortController` y lector SSE:** Reemplazar las esperas bloqueantes en los turnos de historia por un consumidor `ReadableStream` que actualice el texto token a token y permita cancelar la petición desde `VisualReader.tsx`.


7. **Instrumentar la detección real de hardware en `apps/api/noble_api/hardware.py`:** Integrar consultas directas a `pynvml` / `nvidia-smi` (y fallback a `psutil` / WMI en Windows) para obtener el modelo exacto de GPU, VRAM total, VRAM libre en tiempo real y RAM disponible del sistema.


8. **Refinar las fórmulas de memoria en `apps/api/noble_api/model_fit.py`:** Calcular la VRAM requerida sumando el tamaño del archivo GGUF/safetensors, el costo del KV cache ($2 \times n\_layers \times n\_kv\_heads \times d\_head \times context\_length \times bytes\_per\_elem$) y un buffer de activación de 512 MB, contrastándolo contra `config/gpu_profiles.json`.


9. **Construir el árbitro de VRAM en `apps/api/noble_api/resource_policy.py`:** Implementar un semáforo asíncrono que verifique la VRAM libre antes de invocar a `images.py` (ComfyUI); si el margen es insuficiente, enviar la orden de descarga temporal (`keep_alive: 0` en Ollama o liberación de slots) al motor de texto.


10. **Formalizar el esquema de estado canónico y ramas en `apps/api/noble_api/narrative.py`:** Asociar cada mensaje de la historia a un `parent_message_id`, un `branch_id` y un snapshot JSON (`location`, `time`, `present_characters`, `relationships`, `inventory`, `flags`), asegurando que ramificar o rebobinar restaure el estado exacto de ese nodo.


11. **Implementar el motor de Lorebooks / World Info en `apps/api/noble_api/narrative.py`:** Añadir evaluación de entradas por palabras clave primarias y secundarias (con soporte de expresiones regulares e insensibilidad a mayúsculas) sobre los últimos $N$ mensajes, ordenando las inserciones por prioridad dentro del límite de tokens asignado.


12. **Optimizar el ensamblador de prompts para caché de prefijos en `apps/api/noble_api/narrative.py`:** Reordenar las secciones del prompt para que las instrucciones del sistema, la definición del mundo y las fichas base de personajes permanezcan estáticas al inicio, ubicando los recuerdos dinámicos y los turnos recientes al final.


13. **Integrar búsqueda vectorial ligera con `sqlite-vec` en `apps/api/noble_api/store.py`:** Almacenar embeddings locales de los resúmenes de escenas pasadas y recuperar los fragmentos más relevantes por similitud coseno combinada con decaimiento temporal durante la fase `prepare` de `narrative.py`.


14. **Desacoplar la máquina de estados visual en `apps/api/noble_api/scene_planner.py` y `visual_state.py`:** Hacer que `scene_planner.py` devuelva una decisión explícita (`REUSE_BACKGROUND`, `UPDATE_SPRITE_EMOTION`, `GENERATE_NEW_BACKGROUND`, `GENERATE_EVENT_CG`) basada en si cambió la ubicación o la emoción del hablante, evitando regenerar imágenes redundantes en cada turno.


15. **Parametrizar los workflows de ComfyUI en `apps/api/noble_api/images.py`:** Reemplazar prompts estáticos por plantillas de grafos JSON donde se inyecten automáticamente los tokens de apariencia fija del personaje (`creator.py`), el descriptor de la escena actual, el tamaño de imagen y la semilla.


16. **Implementar el importador de tarjetas PNG V2/V3 en `apps/api/noble_api/creator.py` y `creator_media.py`:** Leer los chunks `tEXt` (`chara` y `ccv3`) decodificados en Base64 desde archivos PNG para importar personajes completos con su Lorebook embebido y retratos en un solo paso.


17. **Refactorizar `apps/web/src/App.tsx` separando vistas y estado global:** Dividir el estado monolítico en stores independientes y estructurar la navegación principal en cuatro áreas desacopladas (*Biblioteca*, *Lector Inmersivo*, *Creator Studio* e *Infraestructura*).


18. **Rediseñar `apps/web/src/VisualReader.tsx` con composición multicapa:** Estructurar el lienzo visual en tres capas independientes (fondo escénico con crossfade, contenedor de sprites transparentes por personaje/expresión y caja de diálogo translúcida con controles de voz, ramas y ocultación de UI).


19. **Añadir el inspector de presupuesto de contexto en `apps/web/src/NarrativeSettings.tsx` y `StoryStudio.tsx`:** Conectar la salida del endpoint de preparación narrativa para mostrar una barra apilada con el consumo exacto de tokens por categoría y permitir inspeccionar el prompt final ensamblado.


20. **Automatizar el benchmark de extremo a extremo en `tools/worker_benchmark.py`:** Configurar la herramienta para medir y registrar en `worker_telemetry.py` el TTFT, los tokens por segundo, el porcentaje de acierto de KV cache y el tiempo de generación de imagen tanto en ejecución local como en workers remotos.



---

## 22 — Conclusión crítica

### Evaluación honesta del estado actual y potencial real

Novel AI (estructurado internamente como `noble_api` y `apps/web`) se distingue claramente de los envoltorios superficiales de chat que abundan en el ecosistema open-source. El proyecto demuestra una visión arquitectónica poco común: ya concibe la separación entre un plano de control local y workers de cómputo (`workers.py`, `worker_server.py`), incorpora módulos explícitos para planificación de escenas (`scene_planner.py`), estado visual (`visual_state.py`), políticas de recursos (`resource_policy.py`), ajuste matemático de modelos (`model_fit.py`), generación con ComfyUI (`images.py`) y síntesis de voz con Piper (`speech.py`), además de contar con una disciplina notable de documentación técnica (`docs/*.md`, `docs/adr/*.md`) y pruebas automatizadas en ambos extremos.

Sin embargo, el riesgo principal del proyecto en su estado actual es la **brecha entre la amplitud de su superficie arquitectónica y la profundidad de cohesión en tiempo de ejecución**. Tener módulos para catálogo, narrativa, imágenes, voz y workers remotos sin un motor de memoria multicapa consolidado, sin arbitraje estricto de VRAM en tiempo real y con una interfaz principal (`App.tsx`) que concentra demasiadas responsabilidades operativas amenaza con dejar la experiencia del usuario a medio camino: demasiado compleja para quien solo busca disfrutar una historia tipo Isekai Zero, pero aún sin la profundidad de memoria y formatos estándar que retienen a los usuarios avanzados de SillyTavern o RisuAI.

### Riesgos estratégicos y técnicos clave

1. **Cuello de botella de VRAM en hardware doméstico:** La promesa de ejecutar modelos de lenguaje capaces de mantener una narrativa rica junto con generación de imágenes en ComfyUI sobre una única GPU de 12 GB a 16 GB fracasará en sesiones reales si `resource_policy.py` y `scene_planner.py` no reducen drásticamente las generaciones innecesarias mediante composición por capas (fondos reutilizables + sprites de expresiones) y descarga coordinada de modelos.


2. **Degradación narrativa con modelos locales de 7B a 14B parámetros:** A diferencia de las plataformas en la nube que delegan todo el razonamiento en modelos gigantescos de 70B+ o propietarios, un motor local requiere que el software compense las limitaciones del modelo. Si no se separa el estado canónico estructurado de la prosa y no se protege el caché de prefijos, el modelo local olvidará hechos básicos o romperá la inmersión pasados los primeros 30 turnos.
3. **Fricción cognitiva en la interfaz de usuario:** Mezclar la configuración de workers remotos, telemetría de GPU y catálogos técnicos con el espacio de lectura y creación artística rompe la suspensión de la incredulidad que hace atractivo a Isekai Zero.

### Estrategia maestra recomendada

El camino más efectivo para que Novel AI iguale y supere a Isekai Zero desde una ejecución local consiste en aplicar tres principios rectores durante la ejecución de la hoja de ruta:

* **Composición inteligente sobre fuerza bruta generativa:** No intentar renderizar un cuadro completo por difusión en cada línea de diálogo. Utilizar el enfoque de novela visual clásica potenciado por IA: fondos persistentes por ubicación, hojas de sprites expresivos por personaje generadas durante la fase de creación (`CreatorStudio.tsx` + `creator_media.py`) e ilustraciones de eventos especiales (CGs) reservadas para momentos climáticos detectados por `scene_planner.py`. Esto elimina la latencia entre turnos y reduce el consumo de VRAM en más de un 75%.


* **Estado determinista en el código, creatividad literaria en el LLM:** Dejar que el código Python en `narrative.py` y SQLite en `store.py` sean la única fuente de verdad sobre dónde están los personajes, qué objetos poseen, qué hechos son canónicos y en qué rama temporal se encuentra el jugador, utilizando el LLM exclusivamente para dar vida al diálogo, la atmósfera y las decisiones dentro de esas restricciones.


* **Inmersión por defecto, potencia técnica bajo demanda:** Hacer que el *Lector Inmersivo* (`VisualReader.tsx`) y el *Creator Studio* sean el centro absoluto de la experiencia cotidiana, relegando el *Model Hub*, la calculadora de hardware y la orquestación de workers a un panel de infraestructura automatizado que tome decisiones seguras por defecto para el equipo del usuario.



Con los cimientos ya presentes en el repositorio y la ejecución disciplinada de las Fases 1 a 5 detalladas en este informe, Novel AI dispone de la base técnica necesaria para convertirse en el referente de código abierto en creación y reproducción local de novelas visuales interactivas impulsadas por inteligencia artificial.
