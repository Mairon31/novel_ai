undefined
## 11. P1 implementado: separación real de narración y control de procesos

**Código disponible:**
- `apps/api/noble_api/narrative.py`: configuración local, validación loopback, adaptadores Ollama chat NDJSON y KoboldCpp OpenAI SSE; persistencia SQLite de historia/turnos; bloqueo por historia y `request_id` idempotente.
- `apps/api/noble_api/runtime.py`: administrador KoboldCpp `Popen(shell=False)`; archivo GGUF **registrado**, ejecutable KoboldCpp proporcionado expresamente, `--host 127.0.0.1`, `--gpulayers -1/0/N`, `--contextsize`, status/stop propio y activación del modelo real reportado por `/v1/models`.
- `apps/web/src/StoryStudio.tsx`: lector narrativo y entrada libre; `NarrativeSettings.tsx`: LLM/provider/params; `RuntimeManager.tsx`: motor administrado.
- `tests/test_narrative.py`, `tests/test_runtime.py`, `apps/web/tests/story.spec.ts`.

**Límites precisos:** sigue sin existir un supervisor multiplataforma que descargue/instale automáticamente KoboldCpp u Ollama. Tampoco hay streaming persistente de eventos con replay por secuencia después de una desconexión; la idempotencia guarda el resultado final, sin memoria/canon estructurado ni ramificaciones. Los modelos externos permanecen gestionados por su propio proveedor y nunca se matan al cerrar Noble.

**Validación:** 21 Python PASS y 6 Playwright PASS usando motores simulados; ninguna sesión real de GPU física probada. Ver [Progreso](PROGRESO.md).

## 12. P1.1 — Control plane / GPU worker

El registro local mantiene URL/nombre/rol de worker en SQLite y token en keyring. El backend usa HTTPS a Quick Tunnel y prueba que un token incorrecto sea rechazado. El proxy remoto autentica el acceso y reenvía las llamadas de LLM OpenAI-compatible al servidor local de la GPU.

Componentes: `noble_api/workers.py`, `worker_server.py`, `narrative.py`, `RemoteWorkers.tsx` y `tests/test_workers.py`. El navegador gestiona el registro, pero jamás obtiene el token previamente guardado. El contenido de contexto narrativo sí viaja a la GPU externa. No hay servidor LAN compartido ni workers de difusión/TTS.

Estado: protocolos simulados con pruebas; sin sesión real de GPU. Detalles en [ADR-003](adr/0003-remote-workers.md).

## Decisión técnica — Aplicación de auditoría Argon (2026-11-05)

**Evolución modular, no reescritura:** conservar el monolito modular Python/FastAPI (`apps/api/noble_api`), React/Vite (`apps/web`), SQLite local, adaptadores de inferencia y workers. Separar responsabilidades sin convertir un producto local-first en microservicios. Ver la [arquitectura objetivo y fronteras por capa (§20)](ARGON_AUDITORIA.md) y [tareas priorizadas](../TODO.md).

**Fronteras obligatorias:**
- UI: envía intenciones, muestra estado visual y consume REST/SSE; no ensambla el prompt canónico.
- Narrativa: canon, ramas, testigos, estado por turno, presupuesto/contexto y postprocesamiento de cambios.
- Infraestructura: hardware, modelos, lifecycle de procesos, descarga, VRAM, workers; no contamina la interfaz inmersiva.
- Escena: decisión explícita de reutilizar fondo, cambiar sprite, generar fondo nuevo o ilustración especial.
- Persistencia: transacciones coherentes para mutaciones relacionadas y esquema versionado; no confundir WAL con atomicidad de operaciones **entre servicios**.

Orden de migración: cimientos P0 → coordinación GPU y modelos → narrador estructurado/memoria → composición visual → navegación VN/Creator/infraestructura → empaquetado y benchmarks. API externa estable y cobertura E2E durante la transición. El informe estático contiene hallazgos ya parcial o totalmente implementados; comprobar `master` antes de abrir tareas duplicadas.


## Unit of Work para bifurcaciones (2026-11-05)

`NarrativeService.fork_story` centraliza el commit de un nuevo branch: usa una sola conexión a `noble.sqlite` con `BEGIN IMMEDIATE`, y llama a los clonadores de VisualState, ScenePlanner, CreatorService, CreatorMediaService, LorebookService y WorldStateService con `conn` opcional. Los servicios reutilizan esa conexión mediante `nullcontext` sin confirmaciones parciales; solo el método orquestador realiza COMMIT o ROLLBACK. Se preservan los remapeos UUID del historial/scene/NPC/fact, y el punto de bifurcación determina el estado/canon histórico.

Al no poder transaccionar archivos físicos con SQLite, el orquestador compensa errores borrando únicamente la carpeta de destino UUID recién creada. Para interrupciones de proceso, un marcador de staging `fork-staging/<UUID>.pending` se crea bajo el bloqueo SQLite antes de copiar; la rutina de arranque recorre solo estos marcadores, conserva ramas con fila SQLite confirmada y elimina carpetas de operaciones no confirmadas, verificando paths y symlinks. La recuperación reutiliza `BEGIN IMMEDIATE` para no competir con una clonación en curso.

La estrategia conserva límites de durabilidad ante corte eléctrico abrupto y TOCTOU. Los tests `tests/test_fork_atomicity.py` incluyen fallos tardíos por módulo, error de filesystem, recuperación por marcador y bifurcaciones concurrentes. Véanse [QA](QA_Y_ACEPTACION.md), [TODO](../TODO.md) y [PROGRESO](PROGRESO.md).


## Aislamiento temporal de recursos editoriales — 2026-11-05

`CreatorMediaService` conserva el inventario de recursos, metadatos y selección de portada en `creator_media_turn_snapshots` por turno confirmado, en la misma transacción SQLite que la narración. Un fork parcial obtiene únicamente el inventario del turno elegido; un fork completo conserva el estado editorial actual y clona los checkpoints anteriores, remapeando los UUID. Ante historia legacy sin snapshot, no se importa arte futuro.

La eliminación borra el registro activo y deja de servir la URL, pero conserva los bytes físicos si existe un turno que los referencie. Una rama histórica puede restaurarlos; si falta el archivo requerido, el fork se revierte por completo. Este mecanismo se apoya en el staging y la compensación de archivos de la bifurcación. La recolección de basura deberá considerar los recursos históricos y la seguridad TOCTOU de rutas sigue pendiente.

**Verificación de medios editoriales:** [CI #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045), **184 Python + 34 Playwright PASS**.

## Snapshots por turno de galería, referencias y composición

`VisualState` también dispone de `visual_turn_snapshots`: al confirmar el turno registra fichas visuales (incluidas referencias de imagen), IDs de galería existentes, selección de imagen y filas de `scene_plans`. Se usa la conexión SQLite de `NarrativeService.append`, sin segundo commit independiente. El clonador de una rama parcial restringe galería y perfiles a lo que existía en el turno de corte y pasa un plan histórico a `ScenePlanner.clone`; no importa la imagen o edición de referencia posterior. Una rama total copia el estado vivo y reescribe la cadena de snapshots con nuevos identificadores para que se pueda rebobinar también desde ella.

Ante un turno heredado sin checkpoint visual, el fork parcial no adivina perfiles, imágenes ni planes mirando el presente. Se mantiene la limitación de que los archivos externos a SQLite necesitan compensación y recuperación tras interrupciones. No se han añadido workers GPU, generación automática de escenas ni un mecanismo de expiración/GC para los bytes históricos.

**Evidencia backend:** commit [`a49ca05`](https://github.com/Mairon31/novel_ai/commit/a49ca0591222837d28b344798646dd113ea567c4), [CI #42094814974](https://github.com/Mairon31/novel_ai/actions/runs/42094814974) con **189 Python PASS**; Playwright estaba pendiente al registrar esta nota.


## Lorebooks con acceso por testigos — P1

Además del alcance clásico `world` (conocimiento general), cada entrada puede declarar `visibility=witnesses` y hasta 16 UUID de personajes narrativos de Creator. Antes del presupuesto y selección por prioridad, `LorebookService.activate` cruza estos IDs con los personajes presentes de `WorldStateService.current`. Si no hay testigo presente, ni las palabras clave ni `always_active` permiten inyectar ese secreto. Los IDs se comprueban al guardar contra `creator_characters` de la misma historia, bajo bloqueo `BEGIN IMMEDIATE`.

Se preserva la estructura existente de Lorebook y sus snapshots: el JSON nuevo se conserva por turno; al bifurcar, los testigos privados se remapean usando los mismos IDs destino de `CreatorService.clone`, incluidos los checkpoints copiados. Una entrada privada que no tenga ningún testigo destino se omite por seguridad, no se transforma en conocimiento general.

El alcance es de **control de inclusión de datos en el prompt**, no un sistema completo de cognición individual: un modelo puede inferir o verbalizar secretos desde otras fuentes ya inyectadas, como descripciones NPC, el blueprint o diálogos. Para garantías más fuertes faltan recuperación episódica con procedencia y separación de mensajes/conocimiento por actor, más pruebas semánticas del texto generado.


**Evidencia de regresión para Lorebook por testigos:** commit `cef3a99`, fix E2E `cb687ec`, [GitHub Actions #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216): **193 Python y 36 Playwright PASS**. Es un filtro explícito y determinista de contexto, no una garantía de que la IA nunca produzca un secreto por inferencia.


## Unidad de bifurcación: orden de durabilidad de archivos y WAL

La bifurcación escribe un marcador UUID antes de copiar y lo sincroniza con `os.fsync`; en POSIX también sincroniza el directorio `fork-staging` y su padre para persistir la entrada. Tras clonar la galería, portada y recursos editoriales, recorre solamente el directorio UUID destino, rechaza symlinks y sincroniza todos sus archivos y entradas de directorio **antes** de confirmar la conexión SQLite. `fork_story` usa `PRAGMA synchronous=FULL` para ese commit WAL, sin cambiar el comportamiento general del Store (`NORMAL`). Los fallos de sincronización antes del commit se tratan como fallos de fork, con rollback y compensación de archivos.

En Windows no hay `fsync` portable para directorios en Python; se sincronizan archivos accesibles pero el flush de metadatos se registra como límite. En ambos sistemas, incluso con `FULL`, SQLite y filesystem siguen siendo dominios de fallo distintos: no existe una transacción distribuida atómica, ni prueba de hardware físico, ni garantía frente a controladores que mientan sobre flush. El marcador y recuperación de inicio continúan como segunda barrera.


**Primera verificación:** [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230) — 197 Python + 36 Playwright PASS (commit `eca8166`). Se añadió como segundo nivel una prueba de `os._exit(41)` en un proceso externo después de copiar los archivos, pendiente de validación CI. No se debe interpretar como prueba de durabilidad contra fallo eléctrico.


**Recuperación probada con proceso externo:** [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453) — 198 Python y 36 Playwright PASS. Una terminación con `os._exit(41)` después de copiar datos y antes del COMMIT deja el marcador durable y bytes sin fila SQLite. Al crear otra app, `recover_incomplete_forks` elimina solo esa carpeta marcada y conserva el proyecto original. La prueba no demuestra durabilidad física ante un apagón ni protección completa ante carreras de symlinks.


## Recovery multiproceso — gates de interrupción real

Los tests nuevos ejercitan varias **instancias reales** de `create_app` sobre el mismo `Store`. La coordinación se implementa fuera del producto en el harness de pruebas con archivos de handshake publicados atómicamente. `Popen.kill()` interrumpe intérpretes Python independientes en el punto declarado (después de fsync antes del COMMIT o después del COMMIT antes de borrar el marcador), mientras un segundo escritor compite por el lock SQLite. Tras la caída, `recover_incomplete_forks` debe distinguir las rutas realmente abandonadas de aquellas confirmadas en `stories`.

No se añadieron retardos ni modos de prueba a la API de producción. El mismo comportamiento real de `BEGIN IMMEDIATE`, `synchronous=FULL`, `fork-staging/*.pending` y recuperación de inicio se usa para el ensayo. Ninguno de estos mecanismos constituye una transacción distribuida con el filesystem ni una simulación de un apagón físico.


**Gate multiproceso confirmado:** [CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771) aprobó 201/201 Python y 36/36 Playwright para el commit `f684580`. Se verificaron tres puntos: antes del COMMIT con otro escritor esperando, después del COMMIT antes de limpiar marcador, y recuperación serializada de dos procesos eliminados. No sustituye pruebas de apagón eléctrico, durabilidad NTFS ni kill dentro del COMMIT.


## Sincronización en la fase de recuperación

El protocolo de staging ya fuerza las copias y metadatos antes del COMMIT. El **protocolo inverso** de recuperación completa ese ciclo: una vez determinada la ausencia de fila confirmada de la rama, se elimina su carpeta UUID y se sincroniza `story-assets`; tras eliminar un marcador `.pending` de rama abandonada o confirmada, se sincroniza `fork-staging`. Los contadores de recuperación exitosa se incrementan únicamente si terminan estos pasos. Un `fsync` fallido en la carpeta principal conserva el marcador para el siguiente inicio; las operaciones son seguras al repetirlas con carpeta ya ausente. El comportamiento sigue condicionado a plataformas con sincronización de directorios (POSIX), sin prometer atomicidad entre SQLite y el filesystem ni durabilidad ante cortes reales de energía.


**Gate de recuperación de borrados validado:** [CI #42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649) — **203 Python y 36 Playwright PASS**, commit `c2dbbca`. Las pruebas confirman el orden de sincronización de metadatos de directorio durante la limpieza y el reintento después de un error de flush; se ejecutaron en Linux, no en hardware con corte eléctrico.


## Exportación portátil de historias — HTML (P1)

`story_export.py` implementa el contrato de lectura/exportación sin modificar SQLite. Selecciona turnos desde la historia/ramificación elegida, incluye en un archivo HTML autocontenido una portada administrada por Creator y los WebP del `selected_asset_id` de snapshots visuales históricos, solo si sus IDs pertenecen a la galería de la misma rama. No reconstruye imágenes históricas usando selecciones futuras. `html.escape` impide interpretar texto narrativo o del usuario como etiquetas HTML, y los datos de Illustrator no contienen rutas remotas. Hay límites de recursos para impedir lecturas masivas.

El archivo HTML es una exportación de **una sola línea narrativa**, con marca «Rama independiente» cuando corresponde. No incluye secretos/instrucciones de Creator, Lorebooks completos ni estados administrativos; el EPUB y el ZIP de toda la familia son funciones distintas. Exportar HTML solo lee el contenido de la rama elegida; el respaldo incluye los datos de autor y requiere importación explícita.


## Memoria episódica: búsqueda FTS5 limitada a entradas del jugador

El índice `narrative_turn_fts` contiene `turn_id,story_id,mode,input_text` y utiliza tokenizador `unicode61`; se reconstruye en archivos SQLite legados sin sobreescribir escenas. `story_turns` sigue siendo el registro de verdad. Nuevos turnos e índices y copias por rama se confirman juntos; ningún turno posterior al corte se recupera en una bifurcación. Al buscar, se filtra por `story_id` y se valida cada ID de turno contra `story_turns`; la alternativa léxica analiza como máximo los últimos 2500 turnos y usa los mismos límites de consultas.

Se indexa **solo la entrada del jugador**, no el texto del LLM ni material privado de Creator/Lorebook. La recuperación automática de hasta tres recuerdos remotos los introduce con rol `user`, separadamente del prompt de sistema y del historial reciente, evitando la promoción directa de texto no confiable a instrucciones de sistema. Esto no atribuye hechos a NPC ni certifica causalidad; siguen pendientes búsqueda semántica, resúmenes con procedencia/testigos y tokenización real.


## Inspector de mensaje enviado al adaptador

`context_inspector.py` consume `NarrativeService.messages` directamente para reproducir el arreglo exacto de mensajes que se prepara para Ollama/KoboldCpp/OpenRouter/worker. La operación es solo lectura y no instancia modelos ni guarda mensajes. Secciona el contenido sin reescribirlo para desglose de sistema/preferencias, premisa, canon, datos del creador, Lorebook, estado del mundo, episodios e historial. Las secciones tienen conteos exactos de caracteres; la estimación `ceil(caracteres/4)+overhead` es **heurística**, no tokenización por modelo, y el límite de contexto solo se usa para mostrar una advertencia informativa de posible exceso. No se publican contadores inventados de KV-cache.

El inspector forma parte de `NarrativeSettings` y es una herramienta local **para el autor** porque muestra instrucciones confidenciales de la novela. No se incorpora al lector público ni a la exportación HTML.


## EPUB3 local sin dependencias externas

La exportación EPUB utiliza `zipfile` y `xml.etree.ElementTree` de la biblioteca estándar. `mimetype` es la primera entrada ZIP sin compresión; `META-INF/container.xml` apunta al package OPF, que define metadata, manifest con todos los WebP, XHTML de capítulos, navegación e índice. `chapter.xhtml` contiene títulos, escenas y intervenciones ordenados; la portada y las imágenes de cada capítulo se leen desde rutas administradas por UUID y snapshots. Los archivos no incluyen peticiones a redes externas ni contexto privado de Creator. La variante EPUB se descarga desde el lector junto al HTML portátil.


**Verificación conjunta de extensiones P1:** [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352) — 217 Python, 42 Playwright (escritorio y móvil), compilación frontend PASS. Se validaron exportaciones EPUB3/HTML, recuperación de episodios del jugador y desglose privado del prompt.


## Archivo `.noble.zip` — formato v1, límites y recuperación

La exportación de una historia desde su raíz o rama sigue `origin_story_id` hasta la raíz y recorre sus descendientes. El respaldo versionado almacena un `manifest.json` con raíz, 18 tablas SQLite de dominio (sin tablas globales ni índices FTS de implementación) y un listado firmado de bytes con `sha256`, tamaño y ruta administrada por UUID. Solo se incluyen archivos regulares en `story-assets/{uuid}/scene.webp`, `images/{uuid}.webp`, `creator/{uuid}.webp` y `creator/{uuid}.png`. La restauración reindexa automáticamente las intervenciones del jugador en FTS.

El importador valida tipo, versión, estructura, conexión del árbol, columnas SQLite permitidas, propiedad `story_id`, `turn_id` de snapshots, canon de UUID, miembros ZIP y SHA antes de crear archivos. Limita número de historias (64), registros (25 mil), archivos (1200), bytes de recursos (192 MiB), tamaño por archivo (16 MiB) y manifest (24 MiB). No extrae nombres ZIP como rutas de disco: reconstruye exclusivamente rutas permitidas dentro del almacenamiento de Noble. Si alguna historia o carpeta existe, devuelve 409 y no modifica datos del usuario.

Para restaurar, obtiene el bloqueo de escritor SQLite, comprueba colisiones, crea marcadores durables `fork-staging/{uuid}.pending` y carpetas nuevas `story-assets/{uuid}`. Escribe los recursos y sincroniza archivos/directorios antes del COMMIT. Inserta tablas y reconstruye FTS en la misma transacción; errores permiten rollback de SQL y eliminación compensatoria de carpetas creadas. La recuperación de startup reutiliza el protocolo de marcadores ya probado para forks. Este diseño no garantiza atomicidad eléctrica entre FS y SQLite ni restauración sobre historias con el mismo UUID.


## Navegador del árbol de ramas

`branch_map.py` reutiliza la lectura de familia conectada (raíz y descendientes), conserva identificadores existentes y devuelve nodos con padre, corte de turno, profundidad y número de intervenciones. Es API de solo lectura y rechaza datos cíclicos. Biblioteca → Detalle muestra las rutas con sangría; el lector ofrece un selector para cambiar a la ruta vinculada al mismo árbol. Cambiar de ruta solicita sus datos e historial existentes sin editar ni generar turnos ni fusionar líneas.
