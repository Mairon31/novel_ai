# QA, evidencias y criterios de aceptación

## Evidencia P1 — motor narrativo sin GPU física

Suite `python -m unittest discover -s tests -p 'test_*.py' -v`: **21 PASS**. Incluye respuestas simuladas a APIs HTTP reales de Ollama y KoboldCpp, primer turno streaming, idempotencia sin doble inferencia, error sin commit, persistencia, endpoint loopback, start/stop del proceso propio simulado, validación del GGUF registrado, CPU `--gpulayers 0` y activación.

Playwright con backend FastAPI real y navegador Chromium: **6 PASS**, 3 por viewport escritorio y 3 móvil. Verifica catálogo, navegación, creación de historia y presentación de SSE con **respuesta ficticia** interceptada en el navegador. Artefactos contienen capturas de escritorio y móvil.

Evidencia: https://github.com/Mairon31/novel_ai/actions/runs/41905069185

**Gates aún abiertos:** descarga pública real de modelo grande, carga desde KoboldCpp/Ollama sin mocks, latencia y VRAM físicos, 12GB y 16GB, coherencia del canon, branching, imágenes y TTS. Los 21+6 tests **no certifican** estos gates.


## Gates de la auditoría Argon — 2026-11-05

El listado con casillas y dependencias se mantiene en [`TODO.md`](../TODO.md). Lo siguiente son **pruebas por ejecutar**, no resultados aprobados:

- **P0 persistencia:** `PRAGMA foreign_keys` comprobado en cada conexión; transacciones con rollback de turno+estado y 50 escrituras concurrentes sin corrupción ni `database is locked` persistente.
- **P0 modelos/medios:** traversal por IDs/rutas falsas y symlinks hacia fuera del directorio; no leer, sobrescribir ni borrar archivos ajenos; descarga parcial exacta con `206 Content-Range`, fallo de hash y reconexión controlada.
- **P0 streaming:** abortar en 3 momentos (antes del primer token, a mitad del stream y justo antes del commit), comprobar no duplicación/commit parcial y liberación de recursos de workers; ensayar cancelación del cómputo real, no solo desconexión HTTP simulada.
- **P0/P1 GPU:** registrar nombre de GPU, VRAM ocupada/libre, KV-cache y picos; ejecutar 20–25 alternancias LLM/ComfyUI sin OOM; comparar políticas de monitor/guard/descarga sobre NVIDIA.
- **P1 coherencia:** historia de 120 turnos, hecho recuperado del turno 3, testigo ausente sin acceso al secreto y bifurcación con snapshot intacto; validar límite de contexto.
- **P1 visual:** 10 turnos en una ubicación sin nuevos fondos; cambios de emoción solo con sprites; pruebas visuales en escritorio y móvil.
- **P2 interoperabilidad:** PNG V2/V3 export/import roundtrip, rechazo de tarjetas adulteradas, límites de tamaño/regex y preservación de archivos del usuario.
- **Rendimiento:** TTFT, TPS, latencia visual y uso GPU medidos en máquinas especificadas; las metas de la auditoría no constituyen datos reales. Comparar código y logs por commit.

Cada gate debe enlazar commit, comandos exactos, CI y, cuando aplique, logs de hardware en [`PROGRESO.md`](PROGRESO.md). Una prueba simulada no prueba los tiempos en una RTX 5060 Ti.

## Evidencia P0 incremental — 2026-11-05 (Argon)

- [x] **Atomicidad entre turno y transición visual:** `test_turn_and_inferred_scene_roll_back_together` fuerza un fallo de SQLite dentro del observador de escena, verifica ausencia de turno y escena y confirma un reintento idempotente exitoso. `test_scene_transition_and_turn_commit_once_under_same_idempotency_key` evita duplicaciones. Incluidas en [CI #41996621807](https://github.com/Mairon31/novel_ai/actions/runs/41996621807), completada exitosamente.
- [x] **Seguridad visual:** tests de symlinks hacia archivos externos en imagen de galería/legado, bloqueo de temporales, rollback del registro/selección en fallo de copia; [CI #41997120265](https://github.com/Mairon31/novel_ai/actions/runs/41997120265) **109 Python + 24 Playwright PASS**.
- [x] **HTTP Range completo:** pruebas con offset incorrecto, longitud total falsa, formato corrupto, 206 no solicitado y EOF de fragmento incompleto sin checksum upstream. [CI #41997636863](https://github.com/Mairon31/novel_ai/actions/runs/41997636863) **112 Python + 24 Playwright PASS**.
- [ ] **Persistencia integral:** validar intercalado real de canon/ramas/imagen/TTS con rollback y recuperación ante corte abrupto; la prueba de atomicidad de turno + transición no incluye todas esas capas.
- [ ] **Seguridad avanzada de archivos:** probar carreras entre chequeo de ruta y apertura del fichero, manipulación de directorios en caliente y política de archivos aportados por terceros.
- [ ] **Transferencia real:** cortes de red aleatorios a 25/50/75%, verificación SHA real de peso grande y publicación tras interrupción de proceso. Las pruebas anteriores usan transporte HTTP simulado; no verifican CDN en producción.
- [ ] **Cancelación/VRAM real:** desconectar lector a mitad del SSE, confirmar liberación de proceso/GPU en Ollama/KoboldCpp/worker y medir tiempos en hardware concreto.


## Gates de cancelación narrativa — auditoría Argon 2026-11-05

- [x] Prueba de interrupción **sin más tokens**: el proveedor simulado queda bloqueado tras el primer delta, el servidor observa la desconexión, cancela el siguiente `anext`, cierra el generador y no confirma el turno; lease local liberado.
- [x] Prueba de señal explícita por `story_id` y `request_id`: la operación correcta recibe `cancel_requested=true`; las no activas indican `false`; no se duplica la operación.
- [x] [CI #42050811867](https://github.com/Mairon31/novel_ai/actions/runs/42050811867): **118 Python + 24 Playwright aprobadas**, incluyendo las pruebas backend nuevas. La comprobación E2E específica del botón Detener se agregó posteriormente.
- [x] Playwright escritorio/móvil verificó el botón Detener con inferencia retenida: UUID exacto de historia y petición, POST al endpoint de cancelación, cierre del indicador de generación y ausencia de turno persistido. `story-cancellation.spec.ts` aprobó **2/2 viewports** en [CI #42051166584](https://github.com/Mairon31/novel_ai/actions/runs/42051166584), junto a 118 Python y 26 Playwright.
- [ ] Medir tiempo real hasta detener inferencia y bajar VRAM con un modelo local bajo carga, worker remoto/Colab y conexión abruptamente cortada. No confundir cancelación de HTTP con descarga física de pesos.


## Regresiones en descarga/instalación (2026-11-05)

- [x] Pausa en `verifying` y reanudación sin HTTP cuando `.part` completo y tamaño esperado: no reiniciar desde cero ni solicitar Range desde EOF.
- [x] Cancelar durante un `hashlib.update` bloqueado: el job queda `cancelled`, la transferencia parcial se conserva, el modelo no se registra y el archivo final no aparece.
- [x] Rechazo transaccional de INSERT en `installed` tras mover el archivo: rollback SQLite y restauración del `.part` con los bytes originales.
- [x] [CI #42052817678](https://github.com/Mairon31/novel_ai/actions/runs/42052817678): las tres pruebas nuevas aprobaron; **121 Python + 26 Playwright PASS**, ambos jobs completos y exitosos.
- [ ] Cortes físicos de proceso/energía, recuperaciones de metadatos de tamaño desconocido, cambios maliciosos de symlink durante la apertura y rollback de múltiples trabajadores simultáneos sobre el mismo fichero.


## Gate adicional: recuperación de crash post-rename (2026-11-05)

- [x] Simular caída **después de** `part.replace(target)` y **antes de** la confirmación SQLite: al abrir `Store` de nuevo la descarga se pausa; `DownloadManager` devuelve el fichero a `.part`, exige SHA y lo instala sin segunda descarga HTTP.
- [x] Confirmar conciliación idempotente: dos pasadas seguidas no duplican transferencias ni reinstalan modelos.
- [x] Conflicto entre GGUF final y `.part`: no modificar ninguno; reportar `failed`, y si el usuario presiona Resume, tampoco reemplazar el final.
- [x] Fichero ya instalado: no renombrarlo durante la conciliación ni sustituirlo durante un reintento de job incoherente.
- [x] Symlink externo y checksum SHA corrupto: archivo externo intacto, recuperación rechazada; bytes locales con SHA erróneo nunca se registran como verificados.
- [x] Pruebas reales en disco SQLite/Python: `tests/test_download_recovery.py`, **127 Python PASS** en [CI #42062222624](https://github.com/Mairon31/novel_ai/actions/runs/42062222624); verificar conclusión final del navegador por separado.
- [ ] No se han validado: cortes físicos de energía; corrupción del sistema de archivos, TOCTOU con un atacante que sustituye symlinks entre comprobación y apertura; dos instancias simultáneas y tamaño remoto desconocido sin metadatos HTTP suficientes. El caso EOF con 416 válido y 206 con longitud completa sí se probó.


## Gates del primer Lorebook real (2026-11-05)

- [x] CRUD local de Lorebooks con validación de claves, rechazo de parámetros inesperados y propiedad estricta por historia.
- [x] Palabras clave Unicode (palabra completa frente a subcadena), claves secundarias combinadas por `all/any`, entradas deshabilitadas o siempre activas y prioridades deterministas.
- [x] Límite de 6000 caracteres por contexto activado, descarte íntegro de entradas que no caben y vista previa del presupuesto gastado.
- [x] La intervención y los cuatro turnos recientes pueden activar hechos; la información privada de `ai_plot` por sí sola no activa entradas; la respuesta del jugador no recibe el texto privado.
- [x] Clonado independiente por rama y persistencia tras reinicio; recuperación por palabra clave de un hecho autoral tras 110 turnos narrativos.
- [x] Playwright escritorio/móvil crea una entrada y prueba coincidencia/no coincidencia desde Creator Studio. [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220): **151 Python + 30 Playwright PASS**.
- [ ] Testigos presentes/ausentes, scopes de personaje, memorias episódicas con FTS5/embeddings, regex con timeout, recursión y presupuestos **en tokens reales**. No atribuir estas capacidades al primer Lorebook.


## QA de mundo estructurado y bifurcaciones históricas (2026-11-05)

- [x] Estado manual con revisión inicial 0, compare-and-set, respuesta 409 a revisión obsoleta y rechazo 422 de NPC ajeno, testigo inexistente, duplicados o hecho privado sin testigos.
- [x] Prompt de sistema con hechos públicos y privados de testigos presentes; los hechos de testigos ausentes no aparecen ni en la entrada visible del jugador. El LLM no escribe el estado confirmado directamente.
- [x] Cada turno posee un snapshot inmutable de ubicación, inventario, relaciones, indicadores y canon. Editar después no modifica el pasado.
- [x] Crear rama desde un turno antiguo recupera su canon **sin revelaciones futuras** y mapea NPC/hechos a IDs propios. Una rama desde el presente conserva la versión reciente. UUID de hecho estables a través de sus snapshots de la rama.
- [x] Migración SQLite para añadir `canon_text` a `world_turn_snapshots` existentes y apertura tras reinicio.
- [x] Inyección de fallo en inserción de snapshot confirma rollback simultáneo de texto narrativo, escena y snapshot; reintento de la misma clave idempotente funciona.
- [x] `tests/test_world_state.py`: Python **160 PASS** en el código de la fase. Prueba nueva Playwright desktop/móvil `apps/web/tests/world-state.spec.ts`: edición del mundo, presencia, testigos, inventario, indicador, edición posterior y consulta de turno antiguo. El resultado final de CI se registra en PROGRESO.
- [ ] Rebobinado completo sin bifurcar, mutaciones del mundo derivadas del LLM validadas deterministicamente, afirmaciones del LLM auditadas contra testigos, atomicidad de **todas** las etapas de clonación y pruebas con 100+ turnos con snapshots completos.
