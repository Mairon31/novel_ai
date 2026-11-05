# TODO — Noble AI | Auditoría Argon + ejecución en `master`

> Fuente: [Auditoría integral de Gemini Argon](docs/ARGON_AUDITORIA.md), secciones 01–22 (5 de noviembre de 2026). Este archivo es la **fuente de verdad del trabajo pendiente**, no una lista de promesas. Consultar también [bitácora](docs/PROGRESO.md), [roadmap](docs/ROADMAP.md) y [criterios QA](docs/QA_Y_ACEPTACION.md).
>
> **Regla de verificación:** `[x]` solo cuando el código/documento existe y se ha observado su comportamiento con una prueba apropiada. Un módulo o API existente no equivale a que todos los criterios de la auditoría estén satisfechos. Registrar el commit, la prueba y el resultado en `docs/PROGRESO.md`. Si falta ejecución física con GPU, marcarla pendiente. Trabajar directamente en `master`; no generar una rama por cada tarea.

## Convenciones y discrepancias del informe

- `P0`: integridad, seguridad y bloqueo operativo. `P1`: núcleo narrativo, memoria y experiencia inmersiva. `P2`: interoperabilidad, gestión y UX. `P3`: investigación/evolución.
- Los identificadores **AUD-005/006/007 se reutilizan con significados diferentes** en las secciones 05 y 18. Para evitar ambigüedad, **esta lista sigue la tabla maestra de la sección 18**; al citar hallazgos de la sección 05, usar `§05/AUD-005` (memoria), `§05/AUD-006` (composición visual), `§05/AUD-007` (App.tsx).
- **Correcciones verificadas frente al informe estático:** `store.py` ya activa SQLite WAL y `busy_timeout`; `narrative.py` emite SSE `status/delta/done/error`; `downloads.py` admite HTTP Range, `.part`, y verifica SHA-256 **si se proporciona un digest fiable**; `model_storage.py` ya comprueba rutas al contabilizar almacenamiento; `resource_policy.py` ya tiene `asyncio.Lock` y VRAM observada mediante `nvidia-smi`. Las garantías de extremo a extremo y el rendimiento siguen pendientes.
- No se considera completado un objetivo por estar diseñado, documentado o parcialmente disponible. Los objetivos temporales de Argon (semanas 1–12) se usarán como **orden de dependencia**, no como plazos comprometidos. Las cifras de TPS/latencia/VRAM de la auditoría son **hipótesis de benchmark**, no resultados medidos.

## Fase 1 — P0: datos, rutas, transferencias y streaming

### AUD-001 — Persistencia y transacciones
- [x] Base SQLite con `journal_mode=WAL` inicializado una vez y `synchronous=NORMAL`, `foreign_keys=ON` y `busy_timeout` por conexión; PRAGMAs comprobados por `test_sqlite_connection_enforces_integrity_pragmas` (CI #41994792794).
- [x] Turno narrativo e inferencia de transición visual en **una misma transacción SQLite**, con rollback completo ante fallo e idempotencia de `request_id` (`narrative.py`, `visual_state.py`, `test_sqlite_concurrency.py`; CI #41996621807).
- [ ] Completar snapshots canónicos, medios y cambios de personajes/ramas dentro de unidades transaccionales coherentes; las mutaciones fuera del turno aún requieren coordinación y pruebas de fallos.
- [ ] Migraciones versionadas, índices adecuados y plan seguro de upgrade/backups; no reemplazar ni borrar bases existentes.
- [x] Primera prueba de **50 escrituras narrativas concurrentes**, rollback por excepción y rechazo de FK inválida: `tests/test_sqlite_concurrency.py` (104 Python OK en run #41995580802; GPU/multimedia no cubiertos por esta prueba).
- [ ] Prueba conjunta de 50 escrituras con trabajos multimedia reales, recuperación tras interrupción y coherencia entre turno/escena; no cubierta por la suite concurrente básica.

### AUD-003 — Seguridad de rutas, descargas e integridad
- [x] Instalación GGUF de archivo único con validadores de repo/revisión/nombre y reanudación HTTP Range con `.part` (código existente).
- [x] Cálculo de SHA-256 y comparación cuando catálogo aporta checksum; estado diferenciado `local_hash_only` cuando no existe checksum publicado.
- [x] El inventario del Model Hub excluye enlaces simbólicos y rutas externas de los bytes computados.
- [x] Primer endurecimiento P0: medios de creador exigen UUID/tipo y rechazan symlink externo; descargas revalidan identificadores/rutas `.part`/destino; tres pruebas nuevas PASS (CI #41994792794).
- [x] Endurecimiento de galería: rutas UUID, lectura de versiones y legacy, bloqueo de symlink en archivos temporales, rollback del registro/selección si falla la copia; pruebas en `tests/test_visual_state.py` (CI #41997120265).
- [ ] Ampliar protección de archivos a **todos** los módulos y evitar carreras TOCTOU bajo cambio concurrente de symlinks; probar importación, clonación y borrados manipulados.
- [x] Contrato HTTP 206 reforzado: validar offset, fin, tamaño total y longitud entregada; rechazar un `206` no solicitado y evitar registrar descargas incompletas. Pruebas offline en `tests/test_api_model_hub.py` ([CI #41997636863](https://github.com/Mairon31/novel_ai/actions/runs/41997636863): 112 Python + 24 Playwright PASS).
- [x] Estados de descarga con transiciones compare-and-set; pausa/cancel durante la verificación SHA, comprobación periódica del estado, y publicación coordinada de archivo + SQLite bajo `BEGIN IMMEDIATE`. Ante fallo de registro, el archivo se devuelve a `.part` (commits `0d626c95e84b`, `871d7e6b4c4c`, `4eb57f992b7b`).
- [x] Pruebas de cancelación durante hashing, pausa→reanudación sin HTTP Range desde EOF para tamaño conocido y rollback con `RAISE(ABORT)` en SQLite. `tests/test_api_model_hub.py`: [CI #42052817678](https://github.com/Mairon31/novel_ai/actions/runs/42052817678): **121 Python + 26 Playwright PASS**, build correcto.
- [x] Conciliación de descargas **al reiniciar**: buscar únicamente trabajos persistidos en SQLite (sin escaneo destructivo ni red), detectar GGUF final huérfano por corte entre rename y commit, devolverlo a `.part` y exigir nueva comprobación SHA antes de registrarlo. Conflictos y symlinks se rechazan sin modificar los archivos (`Store.restore_orphaned_download`, `DownloadManager.reconcile_interrupted`; commits `eafaab6d4f83`, `b3aed9db02f8`).
- [x] Reanudar tras conflicto no puede sobrescribir un GGUF final ni uno registrado previamente; protección tanto en `_run` como en `complete_download`, con pruebas de integridad sobre ambos archivos (commits `4186b4f011a5`, `1532e4555f53`, `0f78ec26e1f8`).
- [x] Suite `tests/test_download_recovery.py`: simula interrupción tras rename, recuperación idempotente y verificación offline sin segundo GET, archivo corrupto con SHA incompatible, `.part` conflictivo, symlink externo y modelo ya instalado. **127 Python PASS** en [CI #42062222624](https://github.com/Mairon31/novel_ai/actions/runs/42062222624) (frontend pendiente de confirmación al documentar).
- [x] Reanudación GGUF **sin tamaño publicado**: HTTP 416 con Content-Range `bytes */N` válido en EOF → verificar SHA sin perder `.part`; Range 206 exige tramo final completo, HTTP 200 comprueba Content-Length, se rechazan HTTP 204, compresión inesperada y contenido sin cabecera GGUF. [CI #42068338409](https://github.com/Mairon31/novel_ai/actions/runs/42068338409): **142 Python + 28 Playwright PASS**; `tests/test_unknown_size_resume.py`.
- [ ] Ensayos adicionales: pausa/reanudación exactamente al 50% en CDN real, tamaño remoto desconocido **sin** Content-Range suficiente, corte real de proceso/energía, reconciliación multiservidor y carreras TOCTOU de ruta; nunca declarar autenticidad «verificada» si el origen no aporta checksum.
- [x] Impedir asignación de un GGUF registrado fuera del directorio de modelos, incluido symlink externo; `Store.assign` y prueba de API aprobada ([CI #41997814690](https://github.com/Mairon31/novel_ai/actions/runs/41997814690): 113 Python + 24 Playwright PASS).
- [ ] Gestión de conflictos entre descargas, cuotas de disco, hashes y reintento sin pérdidas.

### AUD-004 — Streaming, cancelación y contratos
- [x] Endpoint narrativo SSE, streaming incremental y cliente con `AbortController` + control Detener existentes (inspección de `narrative.py`, `api.ts`, `StoryStudio.tsx`, `VisualReader.tsx`).
- [x] El backend comprueba la desconexión SSE antes de confirmar el turno y entre deltas; el cierre anticipado del generador libera el lease local y no persiste texto incompleto. Pruebas `test_disconnect_between_tokens_prevents_commit_and_releases_gpu` y `test_closing_sse_generator_after_delta_rolls_back_unfinished_turn` (**115 Python PASS** en CI #41998507145).
- [x] Cancelación SSE **durante espera sin tokens**: lectura upstream concurrente con sondeo de desconexión cada 200 ms, cierre de generador HTTP, eliminación del turno parcial y liberación del lease local; prueba `test_idle_upstream_disconnection_cancels_pending_read_without_commit` (CI #42050811867).
- [x] Señal explícita de cancelación por `story_id + request_id`: `POST /api/v1/stories/{story_id}/generate/{request_id}/cancel`, registro temporal de operaciones y conexión desde **Detener**, cambio de historia y salida del lector. Pruebas de señal/aislamiento y stream bloqueado: [CI #42050811867](https://github.com/Mairon31/novel_ai/actions/runs/42050811867), **118 Python y 24 Playwright PASS**. La prueba visual de botón en `story-cancellation.spec.ts` pasó en escritorio y móvil: [CI #42051166584](https://github.com/Mairon31/novel_ai/actions/runs/42051166584), **118 Python + 26 Playwright PASS**.
- [ ] Verificar y garantizar que **Detener** cancela físicamente cómputo en Ollama/KoboldCpp/worker remoto (no solo fetch/HTTP upstream), incluidas desconexiones sin nuevos tokens, y medir caída de VRAM/latencia de cancelación en hardware real.
- [ ] Pruebas con cliente que desconecta a mitad del stream: no persistir turno incompleto, liberar recursos, no dejar worker generando.
- [ ] Eventos tipados `token/state_delta/scene_plan/done/error`, gestión de reconexión y códigos estructurados `VRAM_EXHAUSTED`, `WORKER_UNREACHABLE`, `CONTEXT_OVERFLOW`.
- [ ] Medir TTFT y tiempo de cancelación en hardware real: metas de Argon sujetas a validación, no valores garantizados.

### Seguridad operativa transversal
- [ ] Confirmar `127.0.0.1` como bind por defecto de **todos** los lanzadores locales, no solo la función FastAPI; acceso remoto solo por configuración explícita.
- [ ] Auditar autenticación Bearer y transporte de secretos de todos los endpoints de workers; conservar validación de endpoints locales y acceso mínimo.
- [ ] Revisar `secrets.py` y completar cifrado/keyring nativo cuando corresponda; evitar secretos en logs, respuestas y respaldos.
- [ ] Modelos, metadatos de tarjetas y archivos importados nunca deben ejecutar código; validar tamaño, MIME, contenido y HTML.

## Fase 2 — P0/P1: recursos y Model Hub V2

### AUD-002 — Arbitraje físico de VRAM
- [x] Detección observada con `nvidia-smi`, reserva mínima configurable y `asyncio.Lock` para operaciones GPU locales (código existente).
- [ ] Reservas por capacidad para LLM/ComfyUI/Piper, control real del ciclo de vida y descarga explícita de pesos administrados (sin matar procesos ajenos).
- [ ] Modos *Exclusivo*, *Compartido* y *Secuencial/offloading*; política de prioridades, cola, cancelación, errores OOM y reinicio seguro.
- [ ] Pruebas de 20–25 ciclos narración/imagen en 16 GB y métricas VRAM pico sin OOM.

### AUD-010 y AUD-011 — Inferencia local e inspección de hardware
- [ ] Supervisor robusto para `llama-server`: proceso, puertos, readiness, reinicio, apagado y compatibilidad CUDA/Vulkan/CPU.
- [ ] Completar adaptadores Ollama/KoboldCpp/OpenAI-compatible y workers Colab con comportamiento de cancelación uniforme.
- [ ] VRAM/RAM disponible realmente observada + fórmulas KV-cache por arquitectura, contexto y cuantización; explicar margen reservado.
- [ ] Simulador de compatibilidad matemática y benchmarks propios por cuantización; **no presentar TPS estimadas como medición**.

### Experiencia Model Hub
- [ ] Ficha detallada por modelo, modalidad y roles; selector de cuantización GGUF y comparación peso/VRAM/compatibilidad 8k–16k.
- [ ] Estados *Óptimo*, *Híbrido* e *Inviable* sustentados por estimación reproducible y lectura de GPU.
- [ ] Cola visible: bytes, MB/s, pausa/reanudar, integridad, ubicación; panel de infraestructura separado de lectura.
- [ ] Reutilizar código/UI open-source cuando su licencia sea compatible y registrar licencia, archivo y cambios en `docs/THIRD_PARTY_NOTICES.md`.

## Fase 3 — P1: motor narrativo, canon y memoria

### AUD-005 — Estado de mundo y ramas
- [x] CRUD de historias, canon, turnos, streaming y bifurcaciones básicas; apertura editorial seleccionable (código y pruebas existentes).
- [x] **Snapshots inmutables por turno y rama** de ubicación, hora/clima, NPC presentes, inventario, relaciones, flags, hechos con testigos y **canon textual histórico**. El turno, escena y snapshot se confirman en una transacción SQLite; bifurcar desde un turno usa ese estado y canon históricos, con UUID nuevos y remapeo de NPC. `world_state.py` + `test_world_state.py` ([CI #42074620459](https://github.com/Mairon31/novel_ai/actions/runs/42074620459): **162 Python + 32 Playwright PASS**, frontend y API aprobados).
- [x] **Rebobinado seguro no destructivo** desde el historial del lector: cuadro de confirmación con turno, turnos posteriores preservados en origen, consulta de snapshots históricos Lorebook/estado y creación de ruta independiente sin borrar el original. `VisualReader.tsx` y `apps/web/tests/story-rewind.spec.ts`, [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834): **179 Python + 34 Playwright PASS**.
- [x] **NPC y directrices del creador históricos**: `creator_turn_snapshots` captura blueprint privado y perfiles de personaje en el commit del turno; la rama antigua restaura su versión original y remapea UUID de NPC entre snapshots. `tests/test_creator_timeline.py` comprueba que una revelación posterior no entra al prompt de una rama antigua y que errores de snapshot revierten el turno.
- [ ] Rebobinado **destructivo/opcional** de la misma línea con archivado y recuperación de turnos futuros, recursos y decisiones. El botón actual crea una ruta segura: **no trunca la historia original**.
- [x] **Corte temporal de imágenes y escenas:** editoriales/portadas, galería, fichas y referencias de personajes, y planes de composición se restauran desde snapshots del turno histórico. Verificaciones: [CI #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045) (184 Python + 34 Playwright PASS) y [CI #42095465227](https://github.com/Mairon31/novel_ai/actions/runs/42095465227) (189 Python + 34 Playwright PASS). El archivado/undo destructivo y durabilidad física permanecen separados.
- [x] Medios editoriales históricos verificados en [CI #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045): 184 Python y 34 Playwright PASS, incluidos cambios de descripción, portada, eliminación, ramas anidadas, rollback y ausencia de archivo histórico.
- [ ] Separar interpretación de entrada, narración visible y actualizaciones posteriores de estado; validación determinista de acciones.
- [x] Hechos privados del **estado confirmado** filtrados por testigos presentes antes de construir el prompt; hechos públicos visibles y datos de personajes de otras historias rechazados. `GET/PUT /world-state` con revisión CAS para evitar perder ediciones. La respuesta del LLM no puede mutar directamente el estado. Pruebas de API en `test_world_state.py`.
- [ ] Imponer **aislamiento cognitivo completo** también sobre Lorebooks/episodios/diálogos generados, detectar contradicciones y control indebido del protagonista; la instrucción al LLM no garantiza obediencia.
- [ ] Modos de intención *Acción / Diálogo / Dirección*, instrucciones y stops compatibles con proveedor.
- [x] Tests SQLite de rollback total si falla la escritura del snapshot; migración de tablas antiguas, canon histórico por turno, prevención de revelaciones futuras al crear rama anterior, remapeo estable de hechos y aislamiento de ediciones de ramas (suite `test_world_state.py`).
- [x] **Bifurcación transaccional integral**: historia, turnos, galería, personajes visuales y editoriales, planes de escena, medios, portada, Lorebooks y snapshots/estado del mundo se clonan en **una única transacción SQLite**. En fallo de cualquier módulo se hace rollback y se limpian archivos de la nueva rama; pruebas inyectadas en seis etapas, fallo de copia y bifurcación concurrente, `tests/test_fork_atomicity.py`. [CI #42078434977](https://github.com/Mairon31/novel_ai/actions/runs/42078434977): **171 Python + 32 Playwright PASS**, build web correcto.
- [x] **Recuperación post-crash de archivos de ramas**: marcador `fork-staging/<UUID>.pending` antes de copiar; el inicio reconcilia bajo `BEGIN IMMEDIATE`, elimina solo carpetas UUID marcadas sin fila de historia, conserva ramas confirmadas y rechaza enlaces simbólicos externos. Tests reales de archivos, marcador obsoleto, aislamiento y archivos no marcados.
- [x] **Bifurcación: fsync de marcador, bytes y directorios POSIX antes del COMMIT** y `synchronous=FULL` por conexión; errores antes del commit provocan rollback. [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230): **197 Python + 36 Playwright PASS**. No implica atomicidad de SQLite y archivos ante apagón físico.
- [x] **Crash real entre copia y COMMIT:** prueba en otro proceso Python terminado con `os._exit(41)`, sin `finally`; recuperación de carpeta y marcador UUID huérfanos al reiniciar, conservando la fuente. [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453): **198 Python + 36 Playwright PASS**.
- [ ] **Resiliencia restante:** cortes forzados durante el COMMIT, corrupción real de filesystem, sincronización de metadatos de directorio en Windows y apagones físicos. Los `SIGKILL` antes y después del COMMIT se prueban aparte; el hardware no ha sido validado.
- [x] **SIGKILL multiproceso antes/después de COMMIT:** tres pruebas deterministas con intérpretes Python independientes, bloqueos SQLite reales, marcadores huérfanos y rutas confirmadas. [CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771): **201 Python + 36 Playwright PASS**. `tests/test_fork_atomicity.py`. Siguen abiertos crash en mitad del COMMIT y pérdida de energía/metadata en Windows.
- [x] **Recuperación durable de marcadores:** `fsync` de `story-assets` tras borrar carpeta huérfana y de `fork-staging` tras borrar `.pending`, contabilizando éxito solo al terminar el flush. [CI #42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649): **203 Python + 36 Playwright PASS**; incluye reintento tras falla de `fsync`. Validado en Linux/POSIX, no implica garantía equivalente en Windows.

### AUD-006 — Lorebooks y memoria híbrida
- [x] **Lorebooks por historia** persistentes: CRUD SQLite/API, activadores primarios/secundarios (any/all), coincidencia Unicode de palabra completa o subcadena, siempre activo/deshabilitado, prioridades deterministas y presupuesto de 6000 caracteres sin cortar entradas. Sin ejecutar regex arbitrarias. `lorebook.py` y `test_lorebook.py`; [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220): **151 Python + 30 Playwright PASS**.
- [x] Copia independiente del Lorebook al bifurcar, activación desde intervención y últimos cuatro turnos **sin usar secretos del autor como disparador**, persistencia al reiniciar y reactivación explícita de un hecho remoto tras 110 turnos. QA Python en `tests/test_lorebook.py`.
- [x] **Lorebook temporal por turno**: `lorebook_turn_snapshots` conserva contenido exacto antes de futuras modificaciones/eliminaciones; rama desde corte antiguo clona solo ese snapshot, remapea IDs estables y no inventa información de turnos anteriores a la migración. `GET /stories/{id}/lorebook/turns/{turn_id}`, `tests/test_lorebook_timeline.py`, [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834): **179 Python + 34 Playwright PASS**.
- [x] **Lorebooks por personaje/testigo**: filtro por presencia confirmada, pertenencia de UUID, remapeo histórico y controles en Creator Studio. [CI #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216): **193 Python + 36 Playwright PASS** (escritorio/móvil). Es filtrado de entradas hacia el prompt; no garantiza obediencia del LLM ni aísla secretos en otros contextos.
- [ ] Lorebook avanzado: regex autorales con timeout/límites seguros, recursión controlada y presupuesto por tokens reales (hoy usa límite por caracteres), más aislamiento cognitivo en todas las fuentes de contexto.
- [x] **Contexto de cuatro niveles integrado**: canon/instrucciones del autor, estado y Lorebook activado por testigos, episodios recuperados desde acciones del jugador y ventana reciente. Pruebas de persistencia/aislamiento en [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352), **217 Python + 42 Playwright PASS**. No se generan resúmenes semánticos automáticos.
- [x] **Memoria episódica FTS5 y fallback**: índices transaccionales de las intervenciones del jugador, recuperación tras 115 turnos, aislamiento de bifurcaciones, migración de históricos y buscador en el lector. [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352), **217 Python + 42 Playwright PASS**. No se indexan respuestas del modelo ni secretos privados del autor.
- [ ] Búsqueda semántica avanzada: `sqlite-vec` opcional, embeddings CPU, ranking híbrido y resúmenes episódicos verificables con procedencia/testigos.
- [ ] Compresión y resúmenes de capítulos/arcos con procedencia, testigos e importancia; evitar conocimiento de testigos ausentes.
- [ ] Prefijo de prompt estable para KV cache, tokenizador apropiado y truncamiento consciente; prueba de 100–120 turnos con hechos remotos.

### AUD-014 — Inspector de contexto
- [x] **Medidor de contexto por bloques** en `NarrativeSettings.tsx`: sistema, canon, fichas, Lorebook, mundo, episodios, historial y reserva de salida; advertencia estimada de desbordamiento. [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352). Cuenta caracteres exactos y tokens **solo aproximados**.
- [x] Creator Studio: pestaña separada de Lorebook con alta/edición/eliminación, prioridad, activadores y previsualización del contexto realmente seleccionado; QA Playwright escritorio y móvil [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220), **30/30 PASS**.
- [x] **Inspector completo de mensajes previos a la inferencia**: endpoint read-only y panel local privado de autor; muestra exactamente `NarrativeService.messages` y no escribe turnos. [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352), **217 Python + 42 Playwright PASS**.
- [ ] Inspector avanzado por proveedor: tokenizadores reales por modelo/cuántización, lectura efectiva de KV-cache, advertencias de truncamiento reportadas por runtime y reservas medidas.

## Fase 4 — P1/P2: dirección escénica y multimedia

### AUD-007 y AUD-009 — Composición visual
- [x] Estado visual, galería de escenas y recursos de creador `background/foreground/cover` reutilizables; portada editorial independiente.
- [ ] Director determinista con decisiones `REUSE_BACKGROUND / UPDATE_SPRITE_EMOTION / GENERATE_NEW_BACKGROUND / GENERATE_EVENT_CG`.
- [ ] Caché de fondos por ubicación, hora, clima y cámara; no generar nuevo fondo por un cambio de emoción.
- [ ] Escenario VN multicapa con fondo, hasta 3 sprites por emoción/pose, iluminación de hablante, transición crossfade y caja inferior.
- [ ] Caché de sprites y expresiones `neutral/joy/anger/sadness/surprise`; pruebas de 10 turnos sin regeneración de fondo.

### Imágenes, personajes y voz
- [ ] `visual_dna`, etiquetas inmutables, semilla y LoRAs opcionales; hoja de expresiones generada o importada por personaje.
- [ ] Workflows parametrizados ComfyUI (SD/SDXL/Illustrious/Flux según disponibilidad) y referencias/consistencia opcionales.
- [ ] Voces Piper por personaje, síntesis segmentada bajo demanda, control de cola y sincronización visual; lip-sync opcional.
- [ ] Modos de recursos *Solo sprites / Equilibrado / Cine*, con presupuesto GPU y configuración transparente.

## Fase 5 — P1/P2: UX, compatibilidad e inmersión

### AUD-008 — Interfaz por espacios
- [ ] Navegación profunda y desacoplada por URL: Biblioteca, Lector, Creator Studio, Infraestructura.
- [ ] Separar estado de `App.tsx` por dominio y vistas; medir renders y preservar rutas existentes.
- [ ] Lector con VN/Libro/Chat, backlog, ocultar HUD, teclado, regeneración y selector rápido de rama.
- [ ] UX móvil y escritorio verificadas visualmente; virtualización cuando la lista lo requiera (500 mensajes).
- [ ] Creator Studio básico/avanzado con previsualización, personajes, historia, canon y Lorebook sin sobrecargar una página.

### AUD-012 — Interoperabilidad
- [ ] Importación/exportación **Character Card PNG V2/V3** con metadatos `chara`/`ccv3` y validación de límites, tipos y caracteres.
- [ ] Arrastrar tarjeta a creador, mapa de campos/persona, activos incrustados y Lorebook, exportación redonda.
- [ ] **Respaldo y restauración portátil `.noble.zip` (implementado, pendiente CI):** manifest v1, árbol completo de ramas, turnos/estado/Lorebook/Creator/instantáneas/recursos, SHA-256 por archivo, importación transaccional sin sobrescribir UUID existentes y recuperación de staging. Pruebas API y Playwright añadidas. Queda por verificar CI y, posteriormente, ampliación para importar como copia renombrada cuando existan IDs.

## Fase 6 — P2/P3: distribución, QA, investigación

### AUD-013, AUD-015 a AUD-018
- [ ] AUDIO: cola asíncrona multivoz con instrumentación de tiempos y descarte de segmentos cancelados.
- [ ] P3: visualizador de árbol/linea temporal de ramas (antes que un editor nodal complejo).
- [ ] P3: soporte opcional IP-Adapter/LoRA evaluado contra workflows instalados, sin suponer identidad perfecta.
- [ ] P3: simulación de mundo fuera de cámara **solo después** de consolidar estado determinista.
- [ ] P3: SDK/plugin sandbox investigado, **sin marketplace de ejecución arbitraria** en esta etapa.

### Distribución, observabilidad y estándares
- [ ] Empaquetado Tauri v2/sidecar o instalador portable validado en Windows 11 limpio, sin terminal para el usuario.
- [ ] Benchmark reproducible TTFT, TPS, VRAM pico, carga KV, generación de fondos y latencia de sprites local/Colab.
- [ ] Reportes JSON/Markdown con versión de modelo, cuantización, GPU, commit y entorno; no extrapolar resultados de un equipo a todos.
- [x] **Exportación HTML y EPUB3 ilustrada** por historia o rama: descarga directa, portada, WebP históricos, OPF/índice XML EPUB3 válido, HTML escapado y aislamiento temporal. [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352): **217 Python + 42 Playwright PASS**. Exportación de backup `.noble.zip` y grafo de ramas sigue separada.
- [ ] QA Playwright visual responsive, regresión E2E/API y perfil real de rendimiento por fase.

## Referencias y reutilización a investigar

- [ ] RisuAI: Character Card V2/V3, Lorebooks, sprites, empaquetado; revisar MPL-2.0 al copiar archivos.
- [ ] SillyTavern: World Info, presupuesto de tokens, expresiones, presets; **AGPL-3.0 exige revisión de compatibilidad** antes de copiar código.
- [ ] Talemate: agentes narrador/director/world-state y memorias episódicas; verificar licencia del archivo exacto.
- [ ] Gamentic / Open Dungeon / TaleWeaver: validación de acciones, modos de entrada, capítulos/arcos; verificar estado y licencia upstream.
- [ ] `sqlite-vec`, Radix UI y `@tanstack/react-virtual`: introducir solo al entregar la función probada que los utiliza.

## Política de ejecución y seguimiento

1. Cada tarea entra aquí antes o junto con el cambio; enlazar el commit, la prueba y su resultado en `docs/PROGRESO.md`.
2. Priorizar **P0 verificable** sobre rediseños cosméticos; luego P1 de memoria/escena, P2 de UX e interoperabilidad, P3 al final.
3. No duplicar funcionalidades ya presentes: verificar primero contra el `master` actual, no solo el ZIP estático auditado.
4. Documentar de forma separada **implementado en código**, **probado en CI** y **validado en hardware GPU real**.
5. Cerrar una casilla solo con evidencia reproducible; los problemas parciales conservan subtareas abiertas. 
