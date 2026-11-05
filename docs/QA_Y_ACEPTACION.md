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
- [x] `tests/test_world_state.py`: [CI #42074620459](https://github.com/Mairon31/novel_ai/actions/runs/42074620459): **162 Python y 32 Playwright PASS**, incluidos los dos navegadores, escritura concurrente con solo una revisión confirmada y rechazo de testigo de otra historia. `world-state.spec.ts` prueba edición del mundo, presencia, testigos, inventario, indicador, edición posterior, snapshot histórico y persistencia tras recarga.
- [ ] Rebobinado completo sin bifurcar, mutaciones del mundo derivadas del LLM validadas deterministicamente, afirmaciones del LLM auditadas contra testigos y pruebas con 100+ turnos con snapshots completos. La clonación multi-módulo se integró en una sola transacción con sus pruebas propias (ver gate de bifurcación abajo).


## Gates de bifurcación transaccional y recuperación post-crash (2026-11-05)

- [x] Inyectar excepción **después de cada clonación** (visual, creador, imagen editorial, Lorebook, estado del mundo, planner): no debe persistir ninguna fila en tablas del destino, ningún archivo de destino ni marcador colgante. La fuente no debe perder datos.
- [x] Fallo de escritura de archivo **después de haber copiado bytes**: revertir SQLite y eliminar toda carpeta UUID de la nueva rama, conservando galería y portada originales.
- [x] Dos bifurcaciones simultáneas del mismo origen: ambas deben persistir historia, turnos, galería, archivos editoriales, Lorebooks y snapshots independientes, sin sobrescribir identificadores ni dejar marcadores pendientes.
- [x] Reinicio con marcador UUID de una bifurcación fallida: solo se elimina la carpeta UUID marcada que carezca de registro de historia. Una carpeta sin marcador no debe borrarse.
- [x] Reinicio con marcador persistente de una rama ya **confirmada**: retirar marcador pero conservar filas SQLite, imagen de escena y portada; no confundir éxito del commit con un fallo al limpiar el marcador.
- [x] Symlink de carpeta UUID externa con marcador: rechazar recuperación, conservar bytes externos, registrar conflicto; ninguna operación de borrado sigue ese enlace.
- [x] Recurso editorial referenciado cuyo archivo ya no está: se rechaza clonación en vez de omitir su portada silenciosamente; no quedan filas ni archivos del intento de bifurcación.
- [x] `tests/test_fork_atomicity.py`: [CI #42078434977](https://github.com/Mairon31/novel_ai/actions/runs/42078434977), **171 Python + 32 Playwright PASS** y frontend compilado. Las pruebas de clonación utilizan SQLite y archivos reales; las imágenes de prueba son fixtures PNG, no modelos GPU.
- [ ] Cortes eléctricos reales, pérdida/corrupción de datos tras fsync incompleto, alta concurrencia multiproceso y validación de todas las llamadas a filesystem frente a ataques TOCTOU persistentes.


## Gates de memoria histórica y rebobinado no destructivo (2026-11-05)

- [x] Crear Lorebook con secreto A, confirmar turno N, editar A y crear B, confirmar turno N+1; bifurcar desde N incluye exclusivamente la versión anterior de A, sin B ni la edición futura. Bifurcar desde el presente conserva las versiones actuales.
- [x] Eliminar una entrada después de un turno: el snapshot antiguo y una rama creada desde él conservan esa entrada, mientras el estado actual no la contiene. IDs nuevos independientes y estables a lo largo de la cronología clonada.
- [x] Una instantánea fallida de Lorebook o Creator (inyección de excepción durante `append`) revierte **turno, transición visual y snapshots de todos los servicios**. Un reintento con la misma clave idempotente funciona.
- [x] `creator_turn_snapshots`: actualizar `ai_plot`, modificar descripción de NPC e incorporar un personaje después de un turno no modifica las fichas/instrucciones de una rama anterior; el prompt de la rama no contiene esos secretos. Un fork presente sí incorpora la versión vigente.
- [x] Un turno creado antes de este subsistema sin snapshot histórico no recibe secretos o NPC actuales por aproximación. Los registros de Lorebook históricos son propiedad estricta de su historia y sobreviven un reinicio.
- [x] Historial del lector: «Rebobinar aquí» abre un diálogo que explica que se crea una ruta nueva, consulta snapshots Lorebook/estado y muestra los turnos conservados por la historia original. Cancelar no crea rama; confirmar crea ruta independiente sin alterar el origen.
- [x] `tests/test_lorebook_timeline.py`, `tests/test_creator_timeline.py`, `apps/web/tests/story-rewind.spec.ts`: [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834) con **179 pruebas Python + 34 Playwright aprobadas**, desktop y móvil.
- [ ] Aún pendiente: rebobinado destructivo/opcional con archivado, restauración temporal de imágenes editoriales y planes de composición editados, aislamiento cognitivo por testigo de cada Lorebook y recuperación de memorias semánticas.


## P1 — Verificación de medios editoriales históricos · 2026-11-05

- [x] Creación posterior, cambio de descripción, cambio de portada, eliminación y recuperación histórica sin filtrar recursos futuros: `tests/test_creator_media_timeline.py`.
- [x] Snapshots del turno participan del rollback SQLite; los forks sin imagen histórica o sin snapshot fallan sin publicar una copia inconsistente.
- [x] [GitHub Actions #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045) para `dc124a1`: **184/184 Python y 34/34 Playwright PASS**, incluyendo escritorio y móvil. Sin GPU física.
- [ ] Aislamiento de recursos de galería y planes visuales por turno, pruebas de corte eléctrico y fsync.

## P1 — Regresiones de galería y composición por turno · 2026-11-05

- [x] `tests/test_visual_timeline.py` comprueba que rama antigua no recibe galería nueva, vestimenta futura, referencia asignada después ni cambios nuevos de plan; que se respeten medias y seleccionadas al bifurcar; y que los snapshots remapeados sostienen bifurcaciones posteriores.
- [x] Sin instantánea visual en un turno anterior a la migración, la nueva rama no consulta perfiles o imágenes actuales para inventar historia. Un error inyectado al guardar snapshot revierte turno y recursos del commit.
- [x] Tests de compatibilidad `tests/test_story_branches.py` dejan de considerar correcto que una imagen importada posteriormente aparezca en un turno previo.
- [x] Python CI: [#42094814974](https://github.com/Mairon31/novel_ai/actions/runs/42094814974), **189/189 PASS**. No incluye medición física de GPU.
- [x] [CI #42095465227](https://github.com/Mairon31/novel_ai/actions/runs/42095465227) completada en verde: 189 Python y 34 Playwright PASS para el mismo árbol de código, incluidos escritorio y móvil.


## P1 — Gate de Lorebook con testigos (CI verificada)

- [x] Entrada privada con palabra clave y `always_active` no se activa si no hay testigo presente; mención del nombre no cambia `WorldState`. Testigo presente permite el contexto con atribución explícita; personaje distinto lo excluye.
- [x] Rechazar testigos inexistentes, ajenos, repetidos y entradas `world` con IDs privados o `witnesses` sin testigos. Debe conservarse CRUD y activación de entradas generales antiguas.
- [x] Historia con dos NPC: bifurcar en turno antiguo restaura la versión anterior del secreto y remapea testigos; bifurcar desde presente conserva cambios nuevos, sin contaminar el origen.
- [x] Prueba Playwright en escritorio/móvil: UI de selector/testigos, vista previa sin presencia y activación tras confirmar la presencia por API de estado del mundo.
- [x] Pruebas por CI: `tests/test_lorebook_witness.py`, suite Python completa y Playwright; no confundir estas pruebas simuladas con una inferencia real que obedezca la atribución del conocimiento.

- [x] Evidencia: [CI #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216), `193/193` Python y `36/36` Playwright aprobadas; frontend compiló. Commits `cef3a99` (funcionalidad) y `cb687ec` (selector E2E corregido).
- [x] La primera CI [#42097551698](https://github.com/Mairon31/novel_ai/actions/runs/42097551698) falló solo por un selector Playwright que coincidía con el título de la ficha y con la entrada previsualizada. La aserción se restringió a `.creator-hint[role="status"]`; ambos proyectos (desktop/mobile) pasaron después.
- [ ] Pendiente: evaluación del contenido generado por un LLM real, aislamiento por testigos de resúmenes episódicos y diálogos, y detector de revelaciones/contradicciones. La prueba de ausencia verifica el prompt preparado, no la obediencia del modelo.


## P0 — Gate de durabilidad de bifurcaciones (fsync validado; crash físico pendiente)

- [x] Comprobar `os.fsync` real del marcador, archivos de portada/galería/legado y directorios POSIX antes del commit del fork. [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230): 197 Python PASS.
- [x] Forzar excepción de sincronización después de terminar copias, y de persistir el marcador antes del commit; verificar rollback de todas las tablas históricas, archivos de destino y ausencia de rama publicada.
- [x] Inyectar un symlink en la carpeta nueva y comprobar que el sincronizador se niega a recorrerlo sin borrar el archivo externo.
- [x] Suite Python 198/198 y Playwright 36/36 verde (CI #42099555453), GPU y power-loss físicos **no** cubiertos. Separar ensayos abruptos Linux/Windows.


### Evidencia fsync y crash de proceso

- [x] [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230) — 197 Python + 36 Playwright PASS y compilación frontend, commit `eca8166`; se verificó flush real de archivos/dir POSIX y rollback por error de `fsync`.
- [x] `test_real_process_crash_after_copy_recovers_without_partial_branch`: el proceso termina realmente con `os._exit(41)` tras copiar medios y antes del COMMIT; el reinicio elimina exclusivamente UUID huérfano, sin alterar historia fuente. [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453): **198 Python + 36 Playwright PASS**.
- [x] Crash después del COMMIT y antes de borrar el marcador cubierto por `test_sigkill_after_sqlite_commit_retains_complete_branch`, [CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771). Siguen pendientes apagones físicos.


### P0 — Tres escenarios nuevos de SIGKILL multiproceso (CI verificada)

- [x] **Fork anterior al commit con competidor:** proceso A mantiene el lock SQLite tras sincronizar medios; proceso B inicia otra instancia y espera. `SIGKILL` de A debe liberar el lock. B recupera el marcador de A, crea su propia rama completa y conserva la historia original sin ramas parciales.
- [x] **Fork confirmado, marcador aún presente:** proceso A se bloquea al entrar en `Path.unlink` del marcador, después del COMMIT. Al terminarlo con `SIGKILL`, una app nueva debe detectar la fila ya confirmada, conservar galería, medios, turnos y eliminar únicamente el marcador obsoleto.
- [x] **Dos procesos eliminados:** A queda detenido antes del COMMIT; B espera para iniciar. Tras matar A, B recupera sus archivos, alcanza su propia fase pre-COMMIT y también recibe `SIGKILL`. La tercera instancia recupera el segundo residuo y el origen sigue íntegro.
- [x] Handshakes de archivos con `Path.replace` atómico para conocer exactamente el estado del proceso, `Popen.kill()` (SIGKILL POSIX / TerminateProcess Windows), timeout y limpieza de todos los procesos hijos. No simular el kill con excepciones. No confundir esto con corte eléctrico ni fsync de directorio Windows.

- [x] [CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771) completada: **201 Python + 36 Playwright PASS**. Las tres pruebas nuevas funcionan con procesos OS reales; no implican pruebas de hardware de apagón físico ni cobertura de la totalidad de puntos internos del COMMIT.


### P0 — Gate de persistencia de la limpieza al reiniciar (CI verificada)

- [x] En recuperación mixta, sincronizar `story-assets` después de borrar carpeta huérfana y `fork-staging` después de quitar ambos marcadores, manteniendo la carpeta de la rama ya confirmada.
- [x] Ante fallo inyectado de `fsync` en `story-assets`, dejar `.pending`, registrar conflicto, no eliminar origen; un segundo arranque sin fallo debe limpiar el marcador restante sin inventar rama.
- [x] [CI #42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649) completada con 203/203 Python, 36/36 Playwright y build. Las excepciones `fsync` inyectadas no generan pérdida de la historia.
- [ ] Pendiente: durabilidad NTFS y resistencia demostrada a apagones eléctricos físicos.
