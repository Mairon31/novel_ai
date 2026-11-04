# Noble AI — Model Hub (catálogo, descargas, instalaciones y selección)

**Versión 0.1 · Contrato de implementación aprobado para diseño; funcionalidad pendiente.** Inspiración directa: Urakatsu Models + Koharu Providers. El usuario no debe instalar pesos o levantar engines por consola para usar Noble AI.

## 1. Requisito central

El usuario abre la **app de Noble AI** aunque no tenga modelos descargados. El **Model Hub** está integrado en el frontend, permite encontrar, instalar, importar, probar, activar, actualizar y desinstalar modelos para **Narración (LLM)**, **Ilustraciones (Image)** y **Voces (TTS)**. En Ajustes puede conectar servicios locales ya existentes o proveedores remotos.

**No equivale a "cargar todos los modelos al inicio".** La app inicia con un backend de control ligero; detecta rutas y dispositivos y presenta la UI. Solo el **LLM seleccionado** se carga al iniciar una sesión de historia. ComfyUI se activa según trabajo visual, TTS se instala/configura cuando se desee pero su modelo se **carga y ejecuta únicamente tras la solicitud de audio**. La pantalla Model Hub y el wizard funcionan sin ningún modelo instalado.

## 2. Vistas principales y navegación

**Navegación:** `Biblioteca | Crear historia | Modelo/Studio | Modelos | Descargas | Ajustes | Diagnóstico`.

**Centro de modelos**:
- Pestañas `Descubrir`, `Instalados`, `Descargas`, `Proveedores`.
- Categorías `Narración`, `Imágenes`, `Voces`, con filtros por runtime/uso.
- Campo de búsqueda Hugging Face + modelos locales importados; tarjetas de descripción, fuente y fecha, etiquetas de tarea/arquitectura, licencia, tamaño, versiones y cuantizaciones.
- Panel de detalle: modelo, archivos necesarios, compatibilidad **estimada** y grado de soporte del runtime; botón `Instalar`, `Probar`, `Usar para...`.
- Descargas visibles con progreso bytes/total, velocidad, ETA estimada solo si hay medición, pausar/reanudar/cancelar, fallas y motivo. Descargas grandes NO bloquean la UI.
- Instalados: versión/hash, rutas, tamaño, dependencia, estado `detenido/listo/cargando/error`; acciones activar, reemplazar, mover ubicación, comprobar y eliminar, con confirmación si está en uso.
- Recomendaciones filtradas por hardware, pero el usuario puede elegir manualmente modelos con advertencia de OOM/incompatibilidad estimada. "Compatible" nunca significa rendimiento verificado.

**Proveedor/personalización**:
- Elección explícita `Local` o `Remoto`, verificación de conexión/capacidades, test de generación.
- Asignaciones independientes de modelo por tarea: `narrator`, `world_state` (puede compartir), `scene_image`, `character_image`, `speech`.
- Presets globales y excepciones por historia. Cambiar una preferencia durante una sesión **no reescribe** turnos anteriores ni pierde canon.

## 3. Catálogo externo

**Primario: Hugging Face Hub** a través de API pública/`huggingface_hub`; opcionalmente otros registros en fases posteriores. Evitar un array cerrado de nombres de modelo. Descubrimiento basado en `repo`, metadata, config, arquitectura y lista de archivos; filtrar por rol y runtime. La búsqueda externa necesita conexión a Internet; lo instalado sigue operativo offline.

Tipos de resultado:
- `llm_gguf`: archivos `.gguf` con variantes (Q4_K_M, Q5_K_M, etc.), multipart, projector vision si aplica; contexto real y chat template.
- `image_checkpoint`: `.safetensors` con componentes compatibles (ComfyUI workflow), VAE, text encoder, LoRA, embeddings, control adapters; **NO** asumir que cualquier safetensors puede ejecutarse en ComfyUI.
- `tts_model`: checkpoints y configuración del motor específico (Chatterbox, Qwen3-TTS, Piper, etc.), voces, idiomas, ejemplos/idioma latino, dependencias. No marcar como compatible por la extensión de archivo.
- `external_provider_model`: modelos listados por API compatible o proveedor remoto; **no se descargan** como pesos locales.

Para todos los resultados, preservar `repo_id`, revision **commit SHA**, `files[]` (path, size, LFS sha), metadata de modelo, licencia fuente, aviso gated/edad/términos del proveedor, descargador y versión de adaptador.

## 4. Selección de modelo y recomendaciones hardware

Estimación de compatibilidad por: VRAM libre/total, RAM libre, reserva SO, tamaño de pesos y KV cache según longitud de contexto, backend/quant, overhead CUDA, modelos auxiliares de difusión, batch y configuraciones de offload. Estados:
`gpu` / `partial_gpu` / `cpu_offload` / `cpu_only` / `insufficient_memory` / `unsupported_runtime` / `unknown`.

Mostrar en la ficha **dos campos separados**: `fit_estimate` (calculado; puede fallar) y `measured_profile` (benchmark hecho realmente en esta máquina con versión exacta). El usuario puede forzar opciones avanzadas si el backend soporta fallback; mostrar riesgos sin impedir deliberadamente el uso de un modelo que pueda funcionar con offload.

**Preferencias:** 12 GB `balanced_12gb` y 16 GB `quality_16gb`; preset `cpu_fallback`. La carga de imagen y voz es bajo demanda, por eso la tarjeta del modelo indica **VRAM de ejecución aislada** y **estimación con el LLM activo**, no solo su peso en disco.

## 5. Instalación, actualización e importación

1. El usuario busca y elige **variant/quant** y componentes requeridos; la UI muestra tamaño, licencia y ruta.
2. Backend valida procedencia, repo, revisión, rutas relativas y tipos de archivo; nunca ejecuta código remoto recibido del catálogo. Modelos que necesitan `trust_remote_code` se marcan no soportados hasta revisión.
3. `download_job` durable en SQLite con `queued/downloading/paused/verifying/installing/complete/failed/cancelled`; guardar bytes parciales en archivo temporal, soportar Range/ETag y resume si servidor lo acepta. Retry con límites; nunca asumir que servidor admite Range.
4. Verificar tamaño y SHA-256/LFS antes del movimiento atómico al almacén final (o según política de checksum verificado); índice por hash; deduplicación de assets.
5. Registrar `installed_model` y `installed_files` con fuente, commit, variante, roles, hash, runtimes compatibles y consumo; no instalar "solo la mitad" de un modelo multiparte.
6. El selector `Usar para narración/imágenes/voz` aparece solo al verificar que el runtime está disponible, tiene capacidades y los archivos requeridos.
7. Se puede **importar** GGUF/safetensors local desde carpeta elegida; validar clasificación/compatibilidad, no copiar sin consentimiento. Si la ruta es externa, ofrecer modo `referenced` o `managed`.
8. `Desinstalar` informa uso, dependencias y referencias; nunca borrar archivos de otros programas o carpetas importadas que no pertenezcan a Noble.
9. Al inicio: revalidación ligera del registro; si falta archivo, marcar `missing` y ofrecer reparación, no eliminar la configuración.

**Seguridad:** aplicar saneamiento a nombres de repos y rutas, protección SSRF, bloqueo de paths absolutos/.., descargas con límite/timeout y autenticación de endpoints locales/remotos. API keys se almacenan en credenciales del SO, no en JSON versionado.

## 6. Perfiles y parámetros por motor

### Narración (LLM)

**Proveedor:** KoboldCpp, Ollama, llama.cpp server, LM Studio/OpenAI-compatible local, servicios remotos conectados manualmente. **Modelo:** catálogo instalado o ID de proveedor; **parámetros:** contexto, max new tokens, temperatura, top-p, top-k, min-p, penalización por repetición, frequency/presence según soporte, seed, modo reasoning si aplica, parámetros de system prompts y estilo literario; streaming y tokenización.

**GPU/CPU:** cuantización seleccionada en instalación (no cambiar en caliente sin artefacto nuevo), capas offload (cuando el backend lo permita), threads, batch, KV cache, límite VRAM. Presets `Rápido`, `Equilibrado`, `Calidad`, `Personalizado`. Deshabilitar campos no soportados por el provider; cada valor con rango seguro, defecto real y descripción.

### Imagen

**Proveedor:** ComfyUI (inicial), futuros sd.cpp/Forge si se documenta interfaz. **Modelo/checkpoint:** selector compatible + VAE, text encoders, LoRA, ControlNet/consistencia visual solo cuando workflow instalado soporta nodos. **Parámetros:** prompt/negative prompt, CFG/guidance, steps, sampler/scheduler, resolución, seed, formato y calidad, generación por escena auto ON/OFF, generación explícita, tamaño de batch=1 por defecto, outfit/expression policy y cache settings.

**Preferencia de contenido/estilo:** selección de checkpoints de comunidad (incluidos los promocionados como `uncensored`) como **etiqueta declarada por autor/metadata**, sin inventar un interruptor universal de censura. El resultado depende del modelo, workflow y políticas aplicables. La app no altera silenciosamente las etiquetas. Ver licencia y contenido permitido de cada proveedor.

**CPU/GPU:** backend `cuda/cpu` si es compatible, política de offload, límites de VRAM/workflow. Las variantes adicionales son opcionales.

### Voz/TTS

**Proveedor:** Chatterbox Multilingual, Qwen3-TTS, Piper/otros en fases, sin implicar compatibilidad automática. **Modelo + voz:** voz por narrador/personaje, locale, estilo/emoción, velocidad, chunk size, formato/sampling, volumen de reproducción, caché. Controles `CPU/GPU/Auto` expuestos únicamente si el motor lo permite; mostrar latencia aproximada **medida**, no supuesta. **TTS OFF por defecto**, sin cargar checkpoint hasta `Escuchar` o `autolectura` activada explícitamente.

## 7. Contratos propuestos (versionar en OpenAPI)

```text
GET  /api/v1/hardware                         # hardware, gpu, ram, drivers
GET  /api/v1/runtimes                         # lista + estado/versión/dispositivos
GET  /api/v1/providers                        # adapters, capacidades, salud
POST /api/v1/providers/connections             # URL/credenciales por clave segura
POST /api/v1/providers/{id}/test               # test real con salida
GET  /api/v1/models/search?role=&query=&page= # búsqueda federada/caché
GET  /api/v1/models/{catalog_id}               # detalles/revisions/variants
POST /api/v1/models/install                    # variant explícita
POST /api/v1/models/import                     # ruta local seleccionada
GET  /api/v1/models/installed                  # registro + estado
POST /api/v1/models/{id}/activate              # rol + scope + model_id
POST /api/v1/models/{id}/unload                # release GPU
DELETE /api/v1/models/installed/{id}           # desinstalar con confirmación
GET  /api/v1/downloads                         # queue durable
POST /api/v1/downloads/{id}/pause|resume|cancel
GET  /api/v1/settings                          # perfiles sin secretos
PATCH /api/v1/settings                         # cambios validados
GET  /api/v1/model-roles                       # narrator/image/tts assignments
PUT  /api/v1/model-roles/{role}                # actualiza selección
POST /api/v1/models/{id}/benchmark             # test real on demand
GET  /api/v1/jobs/{id}                        # seguimiento de trabajos
```

Separar **catalog ID** (modelo remoto, quizá no instalado), **installed ID** (archivos verificados), **runtime ID** (motor de ejecución), **provider ID** (conector/local-remoto), **model role** (función narrativa) y **profile ID** (parámetros asignados). No usar un mismo string ambiguo para todos.

## 8. Invariantes y pruebas

- App abierta y wizard usable con **cero modelos instalados**.
- No se descarga ni carga un modelo solo por abrir la lista.
- Búsqueda HF real, falla 429/offline y fallback a caché.
- Selección incorrecta TTS como LLM se rechaza en backend.
- Descarga interrumpida reanuda o se reinicia con explicación, sin falso completado.
- Un checkpoint fragmentado se marca instalado solo cuando **todos** los archivos requeridos se verifican.
- Import externo no borra carpetas ajenas al desinstalar.
- Cambio de modelo narrativo preserva DB/canon de historias.
- TTS OFF ⇒ 0 cargas/modelo/llamadas, incluso al configurar la voz.
- Ajustes CPU/GPU por motor: se muestran capacidades reales y no se asignan dispositivos no detectados.
- Compatible estimado no se transforma en benchmark verificado sin medición GPU.
- Playwright verifica el flujo `Discover → Details → Download/Install → Assign → Test` en desktop y móvil, con backend real para una variante pequeña.
- Errores de API y descargas se muestran en UI con opciones reales de recuperación.

## 9. Entrega por incrementos

**MH-0** schema + inventario + API providers/health + UI navegable sin modelos.
**MH-1** buscador HF real, metadatos, variantes y compatibilidad estimada.
**MH-2** cola real de descargas/resume/hash, registry, importación.
**MH-3** manager de runtimes y asignaciones por función, persistencia de perfiles.
**MH-4** arranque y swap real de modelo narrativo, GPU scheduling.
**MH-5** conectores imagen y voz, perfiles por escena/personaje y pruebas E2E.
**MH-6** instalación Windows y acabado de navegación.

**Issues:** [#9](https://github.com/Mairon31/novel_ai/issues/9), [#10](https://github.com/Mairon31/novel_ai/issues/10), [#11](https://github.com/Mairon31/novel_ai/issues/11).

## Implementación disponible — P0.5 (2026-11-04)

Código: `apps/api/noble_api/{main,catalog,hardware,store,downloads}.py`, `apps/web/src`, `apps/web/tests`. [Guía de ejecución](QUICKSTART.md).

**Funcionando en el prototipo:** API de catálogo HF, búsqueda/variantes GGUF, instalador de un único archivo GGUF, descargas en segundo plano con pausa/reanudación y SHA-256, SQLite, selector de narrador instalado, wizard sin modelos y vistas de diagnóstico. UI compilada por Vite; FastAPI sirve `apps/web/dist`.

**No disponible:** carga/ejecución LLM, compatibilidad VRAM calculada, importador de GGUF local, instalación de image/TTS, multiarchivo GGUF, modelos gated, launcher .exe. Las pruebas HTTP de descarga son deterministas con un origen simulado; no se ha medido un modelo público ni GPU.

CI: [Python/TypeScript/Playwright PASS](https://github.com/Mairon31/novel_ai/actions/runs/41900062946).
