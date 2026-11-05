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
- [ ] Ensayos de pausa/reanudación al 50%, interrupción durante verificación, carrera concurrente y renombrado atómico; no declarar «verificado» si el origen no aporta checksum.
- [x] Impedir asignación de un GGUF registrado fuera del directorio de modelos, incluido symlink externo; `Store.assign` y prueba de API aprobada ([CI #41997814690](https://github.com/Mairon31/novel_ai/actions/runs/41997814690): 113 Python + 24 Playwright PASS).
- [ ] Gestión de conflictos entre descargas, cuotas de disco, hashes y reintento sin pérdidas.

### AUD-004 — Streaming, cancelación y contratos
- [x] Endpoint narrativo SSE, streaming incremental y cliente con `AbortController` + control Detener existentes (inspección de `narrative.py`, `api.ts`, `StoryStudio.tsx`, `VisualReader.tsx`).
- [ ] Probar y garantizar que **Detener** cancela cómputo en Ollama/KoboldCpp/worker remoto (no solo fetch), propaga desconexión, no persiste turnos incompletos y libera VRAM en un tiempo medible.
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
- [ ] Snapshot **por turno y rama** de ubicación, tiempo/clima, personajes presentes, inventario, relaciones y flags; restauración exacta al bifurcar/rebobinar.
- [ ] Separar interpretación de entrada, narración visible y actualizaciones posteriores de estado; validación determinista de acciones.
- [ ] Restringir conocimiento por testigos y personajes presentes; prevenir omnisciencia, contradicciones, control del protagonista y escenas estancadas.
- [ ] Modos de intención *Acción / Diálogo / Dirección*, instrucciones y stops compatibles con proveedor.
- [ ] Test de rollback y restauración del canon en múltiples ramas sin fuga cruzada.

### AUD-006 — Lorebooks y memoria híbrida
- [ ] CRUD de Lorebooks por historia/personaje, claves primarias/secundarias, regex con límites, prioridades, recursión acotada y presupuestos.
- [ ] Contexto en cuatro niveles: canon fijo, World Info activado, episodios recuperados, ventana reciente.
- [ ] SQLite FTS5 y, de ser compatible, `sqlite-vec` opcional + embeddings CPU; fallback léxico sin obligar a instalar un servicio vectorial.
- [ ] Compresión y resúmenes de capítulos/arcos con procedencia, testigos e importancia; evitar conocimiento de testigos ausentes.
- [ ] Prefijo de prompt estable para KV cache, tokenizador apropiado y truncamiento consciente; prueba de 100–120 turnos con hechos remotos.

### AUD-014 — Inspector de contexto
- [ ] Medidor por sistema/canon/personajes/lorebook/episodios/historial/reserva de salida en `NarrativeSettings.tsx`.
- [ ] Previsualización del prompt final, activadores de Lorebook y advertencias de contexto; métricas KV-cache solo si el runtime las ofrece.

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
- [ ] Archivo portátil de historia `.noble.zip` con manifest versionado, imágenes, canon/ramas y recuperación segura.

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
- [ ] Exportación de rama a EPUB/HTML ilustrado, diferenciar claramente historias/branches.
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
