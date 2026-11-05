# Noble AI — contratos de API

## Endpoints reales disponibles en P1 (2026-11-04)

Los bloques anteriores describen **diseño futuro**, no deben confundirse con implementación completa. Esta es la tabla de endpoints **implementados ahora** para la etapa narrativa:

| Método/ruta | Uso real |
|---|---|
| GET/PUT `/api/v1/narrative/config` | Proveedor Ollama/Kobold, URL loopback, modelo y parámetros |
| GET `/api/v1/narrative/models` | Lista local del motor o `online:false` + error |
| GET/POST `/api/v1/stories` | Biblioteca y alta de historia con premisa |
| GET `/api/v1/stories/{story_id}` | Ficha de historia |
| GET `/api/v1/stories/{story_id}/turns` | Turnos confirmados |
| POST `/api/v1/stories/{story_id}/generate` | SSE `delta/done/error` de LLM; idempotente por UUID de solicitud |
| GET `/api/v1/runtime/kobold/status` | Estado del proceso gestionado y salud del endpoint |
| GET `/api/v1/runtime/kobold/installed` | GGUF registrados aptos para intentar arrancar |
| POST `/api/v1/runtime/kobold/start` | Arranca **solo** ejecutable KoboldCpp seleccionado con GGUF registrado |
| POST `/api/v1/runtime/kobold/stop` | Detiene proceso propio |
| POST `/api/v1/runtime/kobold/activate` | Adopta el modelo anunciado por runtime en configuración del narrador |

**Entrada de generación:**
```json
{"mode":"do","input_text":"Examino la biblioteca.","request_id":"7053aead-3e62-411f-a5d5-598c5609dbfb"}
```
`mode` = `do | say | story | continue`; `input_text` vacío solo permitido con continue. La respuesta puede enviar varios `event: delta`, exactamente un `event: done` **si el turno se confirmó** o `event: error` en caso de fallo. No hay un API de reintento con branching todavía.

**Arranque de KoboldCpp (ejemplo de contrato):**
```json
{"executable":"C:\\Tools\\koboldcpp.exe","installed_id":"uuid-de-modelo-registrado","gpu_layers":-1,"contextsize":4096,"port":5001}
```

No se suministran URLs/ejecutables arbitrarios. La narrativa limita el endpoint a HTTP loopback con puerto, el runtime acepta binarios con nombre KoboldCpp, y los GGUF deben existir en el directorio administrado. La conexión no exige GPU. La API del juego usa historial reciente y no implementa aún eventos estructurados ni revision/branch. Esos contratos anteriores permanecen como objetivos futuros.

Ver [Quickstart](QUICKSTART.md), [Progreso](PROGRESO.md) y pruebas `tests/test_narrative.py` y `tests/test_runtime.py`.

## Endpoints reales P1.1: workers y preferencias

| Método | Ruta | Función |
|---|---|---|
| GET/POST | `/api/v1/workers` | Lista o registra worker LLM |
| GET | `/api/v1/workers/{uuid}/probe` | Verifica token y anuncia modelos |
| POST | `/api/v1/workers/{uuid}/activate` | Elige el modelo del narrador |
| DELETE | `/api/v1/workers/{uuid}` | Elimina metadatos y token |
| GET/PATCH | `/api/v1/workspace/preferences` | Idioma, lectura, apariencia y atajos |
| GET | `/api/v1/about` | Versión fuente, commit, carpetas |
| GET | `/api/v1/runtime/diagnostics` | Paquetes/binarios, solo lectura |
| GET | `/api/v1/updates` | Consulta de releases; no instala |
| GET | `/api/v1/network/capabilities` | Red principal loopback; límites |
| GET/PUT/DELETE | `/api/v1/provider-credentials/openrouter` | Gestión de clave sin lectura del secreto |
| PATCH | `/api/v1/stories/{uuid}/protagonist` | Nombre del protagonista |
| GET/POST | `/api/v1/stories/{uuid}/scene-image` | Leer/importar ilustración |

**Proxy remoto separado:** `GET /v1/models` y `POST /v1/chat/completions`, ambos requieren Bearer. No hay servicio remoto para archivos, procesos, imágenes o TTS. El backend principal sigue limitado a loopback. Ver [WORKERS.md](WORKERS.md).

## P1.2 — generación corta de benchmark desde interfaz

`POST /api/v1/workers/{uuid}/benchmark` recibe `{"model":"id-anunciado"}`. Realiza una única inferencia explícita con prompt de prueba, **no** un turno de historia. Devuelve éxito/fracaso, TTFT, duración total y caracteres, con GPU disponible en el sondeo de salud. No devuelve ni persiste el texto generado; el servidor exige worker ya registrado, autenticado, online y modelo anunciado.

`GET /v1/health` en el **proxy remoto** devuelve contadores agregados y GPU/VRAM (best-effort), y también exige Bearer. El endpoint principal `GET /api/v1/workers/{uuid}/probe` recoge esa telemetría si está disponible sin fallar frente a una versión vieja de worker.

La prueba no es una medición p95 ni una certificación de compatibilidad GPU. Ver [WORKERS.md](WORKERS.md).


## P1.4 — generación bajo demanda y canon

- \`PATCH /api/v1/stories/{uuid}/canon\` con \`{"canon":"..." }\` (hasta 5000 caracteres). Se guarda en SQLite y se añade al contexto del narrador; no reescribe turnos antiguos.
- \`GET/PUT /api/v1/images/config\`: configuración persistente de ComfyUI.
- \`GET /api/v1/images/status\`: sondeo del checkpoint instalado, conexión local con tiempo limitado.
- \`POST /api/v1/stories/{uuid}/illustrate\` con \`{"prompt":"...","seed":123}\`: genera imagen SOLO si el usuario lo solicita. ComfyUI debe estar instalado y en marcha por separado. Puede devolver 409 ocupado, 422 config inválida, 503 offline y 502/504 error/timeout.
- \`GET /api/v1/tts/voices\`: voces Piper detectadas (ONNX + JSON) en el directorio de modelos.
- \`POST /api/v1/stories/{uuid}/turns/{uuid}/speech\` con \`{"voice_id":"es_MX.onnx","request_source":"listen_button"}\`: devuelve WAV, exige \`tts_enabled=true\`. No hay autolectura.
- La narración \`POST /api/v1/stories/{uuid}/generate\` ahora emite eventos SSE adicionales \`status\` con \`phase=preparing|connecting|streaming\`, antes de \`delta/done/error\`. Los clientes anteriores pueden ignorar \`status\`.


## P1.4 — canon, ramificación y preparación explícita

| Método | Ruta | Estado |
|---|---|---|
| PATCH | `/api/v1/stories/{uuid}/canon` | Guarda notas persistentes de historia (hasta 5000 caracteres) |
| POST | `/api/v1/stories/{uuid}/fork` | Clona la historia hasta `until_turn_id` incluido, o completa si null |
| POST | `/api/v1/narrative/prepare` | Inferencia corta para preparar motor local/worker sin crear un turno |

La operación fork retorna una historia con `origin_story_id` y `origin_turn_id`, además de otros campos. No edita ni borra el origen. No existe todavía API de fusionar ramas. La llamada de preparación no está habilitada para OpenRouter; debe solicitarse explícitamente desde la UI y no sustituye pruebas de calidad/rendimiento reales.


## P1.5 — journal visual y galería inmutable

`GET /stories/{uuid}/visual-state` responde `{current_scene, scenes, assets, characters, selected_asset_id}`, con URLs individuales de recursos, `origin`, `content_sha256`, `seed` y `selected`. `PUT /stories/{uuid}/scene` recibe `{location}`. `POST /stories/{uuid}/visual-characters` y `PUT /stories/{uuid}/visual-characters/{uuid}` reciben `{name, appearance, outfit, distinguishing_features}`. `POST /stories/{uuid}/illustration-prompt` devuelve `{prompt, inference_used:false}`; `GET /stories/{uuid}/gallery/{uuid}` obtiene el WebP, `POST /stories/{uuid}/gallery/{uuid}/select` selecciona el archivo anterior. Los IDs deben pertenecer a la historia solicitada.

`POST /stories/{uuid}/illustrate` acepta `{prompt,seed?}` y ahora responde también `cached` y `asset_id`. Si el seed, parámetros, prompt enriquecido y escena no cambian, puede devolver el recurso de caché sin contactar ComfyUI. La detección de un cambio de lugar **nunca** equivale a iniciar difusión ni a cargar GPU.


## Imagen de referencia y recursos (P1.6)

`POST /api/v1/stories/{uuid}/illustrate` acepta campos adicionales opcionales `reference_asset_id:uuid`, `denoise:0.2..0.95` y `allow_low_vram:boolean`, junto a `prompt` y `seed`. Sin `reference_asset_id` se mantiene el modo texto-a-imagen. Con referencia se verifica autoría de historia, integridad SHA256 y se utiliza `POST /upload/image` del ComfyUI local antes del grafo de imagen-a-imagen.

- `GET /api/v1/resources/config`: `{mode:"monitor"|"guard",gpu_index:number,minimum_free_mib:number}`.
- `PUT /api/v1/resources/config`: persiste configuración validada.
- `GET /api/v1/resources/status`: GPU(s) observadas, MiB libres/usados, índice, porcentaje de utilización, `status=above_reserve|below_reserve|unknown`, política y tiempo de consulta.

El modo guard consulta `nvidia-smi` **solo** antes de enviar una generación de ComfyUI explícita que no haya sido servida por caché. No bloquea a los proveedores sin telemetría NVIDIA y no garantiza que el modelo quepa. `allow_low_vram=true` permite una excepción por solicitud, pero no edita la configuración persistida.


## Planificador de escenas e identidad visual

- `GET /api/v1/stories/{uuid}/scene-plan`: plan del escenario actual. Incluye `scene_id`, `revision`, `shot`, `lighting`, `mood`, `direction`, `visible_character_ids` y `reference_character_id`.
- `PUT /api/v1/stories/{uuid}/scene-plan`: guarda `{"shot":"medium","lighting":"natural","mood":"","direction":"","visible_character_ids":[],"reference_character_id":null}`. Son válidos `shot=wide|medium|closeup` y `lighting=natural|sunset|night|interior|dramatic`.
- `POST /api/v1/stories/{uuid}/scene-plan/preview`: con `{"prompt":"..."}`, compone el prompt enriquecido y expone la referencia automática sin generar imágenes.
- `PUT /api/v1/stories/{uuid}/visual-characters/{char_uuid}/reference`: asigna `{"asset_id":"uuid"}` o elimina una referencia con `null`. Solo admite imágenes verificadas pertenecientes a la historia.
- `POST /api/v1/stories/{uuid}/illustrate`: puede elegir automáticamente la referencia del personaje focal del plan si no se envía una referencia explícita; informa `reference_asset_id` usado.
- `GET /api/v1/resources/active`: operación multimedia local en curso, si existe.
- `PUT /api/v1/resources/config`: además de la política de VRAM acepta `serialize_local_gpu:boolean` (predeterminado `true`). Una operación local ocupada devuelve HTTP 409. No hay cola de jobs oculta.

Los cambios de escena no realizan ningún trabajo de GPU automáticamente. Las rutas anteriores mantienen sus parámetros originales compatibles.

## Evolución de contratos según Argon (2026-11-05)

**Actual:** `POST /api/v1/stories/{id}/generate` devuelve SSE `status`, `delta`, `done`, `error` a través de `narrative.stream_turn`, no un JSON completo; los proveedores Ollama/Kobold emiten stream; el cliente web consume los fragmentos. No marcar «streaming inexistente». **Pendiente:** desconexión y cancelación efectiva de inferencia, telemetría TTFT y SSE adicionales para multimedia/descargas.

**Contrato objetivo (sin declarar implementado):**

- `POST /api/v1/stories/{id}/generate`: recibir `request_id` idempotente, `mode`, `input_text`; devolver eventos tipados progresivos, errores estructurados y `done` solo cuando el turno se confirmó transaccionalmente. `AbortSignal` debe cerrar el upstream y liberar la reserva de GPU.
- `GET /api/v1/stories/{id}/context/preview` (propuesto): desglose de tokens y recuerdos activados, sin efectuar inferencia ni filtrar secretos de otros personajes a consumidores no autorizados.
- `/api/v1/stories/{id}/lorebook` (propuesto): CRUD validado por historia, claves, secundarios, prioridad, presupuesto, activación y límites de regex.
- `/api/v1/stories/{id}/stage` (propuesto): estado multicapa, decisión de reutilizar/generar fondos, personajes/expresiones y revisiones de assets.
- `/api/v1/models/downloads/*` (evolución de endpoints existentes): bytes, velocidad y reanudación verificada; hashes con estado distinguible.

El frontend no construirá prompts ni inferirá estados canónicos: esas decisiones pertenecen al backend. Ver [TODO](../TODO.md), [auditoría §§14, 20](ARGON_AUDITORIA.md) y [QA](QA_Y_ACEPTACION.md).

## Contrato SSE tras endurecimiento P0 (2026-11-05)

El endpoint ya implementado `POST /api/v1/stories/{story_id}/generate` mantiene eventos `status`, `delta`, `done` y `error`. Recibe un UUID `request_id` idempotente y no confirma un mensaje por el mero hecho de haber emitido deltas.

- La ruta entrega `Request.is_disconnected` al generador. El servidor verifica el estado de conexión antes de generar, entre fragmentos y antes del commit. Si se desconecta el lector, el flujo se abandona sin persistir el texto parcial; el `finally` libera la reserva local de GPU.
- La escritura de un turno completo y la transición heurística de escenario comparten una transacción SQLite; un fallo del observador visual implica rollback de ambos. El evento `done` solo se emite tras confirmar el turno. Un reintento de `request_id` confirmado se responde sin nueva inferencia.
- El cierre del generador y las comprobaciones de desconexión están cubiertos por pruebas con proveedor simulado. El tiempo necesario para detener **el cómputo del motor** y liberar pesos en Ollama/KoboldCpp/worker remoto sigue pendiente de certificación física; no prometer cancelación en menos de 250 ms.
- Descargas GGUF: una respuesta HTTP 206 solo se acepta tras una petición `Range` explícita, verificando inicio, final, longitud total si conocida y longitud real de la respuesta. El modelo se registra únicamente tras comprobaciones de tamaño/hash disponibles.

Referencias: [TODO](../TODO.md), [QA](QA_Y_ACEPTACION.md), [PROGRESO](PROGRESO.md).


## Cancelación explícita de generación (implementación P0, 2026-11-05)

- `POST /api/v1/stories/{story_id}/generate/{request_id}/cancel`: devuelve `{"request_id":"uuid","cancel_requested":true|false}`. `true` significa que la operación registrada recibió la señal; **no** certifica que los pesos hayan sido descargados ni que el cómputo físico se haya detenido. `false` indica que la operación ya no está en el registro, aún no estaba disponible o ya concluyó.
- `POST /api/v1/stories/{story_id}/generate` registra la operación antes de abrir el `StreamingResponse`, rechaza el mismo `request_id` simultáneo con HTTP 409 y elimina el registro en `finally`. La señal por otro `request_id` o historia no alcanza una operación distinta.
- El sondeo de desconexión y cancelación se realiza durante una espera del proveedor sin tokens, con intervalo de ~200 ms para detectar el corte en el servidor. El cierre cancela el siguiente `anext()` y cierra la respuesta HTTP upstream. No se persiste un turno incompleto ni se emite `done` por una solicitud cancelada.
- Frontend: `AbortController` + señal explícita a este endpoint al presionar Detener, cambiar de historia o regresar a Biblioteca. La señal es de mejor esfuerzo si no existe conexión con el servidor.
- Pruebas Python de cancelación por solicitud, upstream bloqueado y limpieza del lease aprobadas en [CI #42050811867](https://github.com/Mairon31/novel_ai/actions/runs/42050811867). **La parada inmediata del cómputo en Ollama/KoboldCpp/worker real no está certificada**.


## Contrato Lorebook de Creator Studio (2026-11-05)

Todas las rutas se limitan al UUID de una historia existente. El contenido es privado de la autoría y se inyecta en el mensaje **system**, nunca como turno visible del jugador.

- `GET /api/v1/stories/{story_id}/lorebook` → `{entries: LorebookEntry[]}`.
- `POST /api/v1/stories/{story_id}/lorebook` → 201 + entrada con ID UUID.
- `PUT /api/v1/stories/{story_id}/lorebook/{entry_id}` → entrada actualizada, 422 si no pertenece a la historia.
- `DELETE /api/v1/stories/{story_id}/lorebook/{entry_id}` → 204, 404 si no existe en esa historia.
- `POST /api/v1/stories/{story_id}/lorebook/preview` recibe `{"query":"Entro al bosque","budget_chars":6000}` y devuelve `{entries:[{id,title,priority,content}],context,used_chars,budget_chars,skipped_budget}`. Este preview activa únicamente por la cadena `query` proporcionada; la generación real incluye además cuatro turnos recientes.

Campos de entrada: `title` (2–100), `content` (10–3500), `keys` (hasta 12), `secondary_keys` (hasta 8), `secondary_mode: any|all`, `match_whole_words`, `priority` 0–100, `enabled`, `always_active`. Es obligatorio definir claves primarias salvo con `always_active`; nunca se evalúan regex proporcionadas por el usuario. Los hechos activados respetan prioridad y se omiten completos si superan el límite de 512–6000 caracteres. El fork crea copias con IDs nuevos.


## Estado del mundo y snapshots confirmados (2026-11-05)

- `GET /api/v1/stories/{story_id}/world-state` → `{story_id, revision, updated_at, state}`. Una historia nueva devuelve revisión 0 y estado vacío, no inventa personajes ni hechos.
- `PUT /api/v1/stories/{story_id}/world-state` recibe `{expected_revision: número, state: WorldStateInput}` y retorna la siguiente revisión completa. Dos actualizaciones concurrentes con la misma revisión no pueden confirmarse ambas: la posterior responde **409**. Datos inválidos o UUID de NPC ajenos responden 422.
- `GET /api/v1/stories/{story_id}/world-state/turns/{turn_id}` → `{story_id, turn_id, created_at, canon, state}`. Responde 404 si el snapshot no pertenece a la historia o nunca se registró.
- `WorldStateInput`: cadenas `location` (0–200), `time_of_day` (0–80), `weather` (0–100); arrays `present_character_ids` (hasta 30 UUID de NPC), `inventory` (hasta 60 objetos de 1–100 caracteres), `relationships` (hasta 30 mapeos UUID→texto 1–160), `flags` (hasta 60 claves booleanas) y `facts` (hasta 120).
- `WorldFact`: `id` UUID, `text` (10–360), `public` booleano, `witness_character_ids` (hasta 16 UUID). Un hecho privado necesita testigos, todos de esa misma historia.
- El guardado del turno inserta instantáneamente una fila inmutable de estado y canon bajo la misma transacción SQLite que el texto y escena. Las bifurcaciones en un turno histórico remapean personajes y restauran el canon de ese turno; los snapshots de turnos anteriores a la migración no se reconstruyen con estado futuro.

Estos contratos describen hechos **confirmados por el autor**, no cambios que el narrador pueda ejecutar sin aprobación. El contexto enviado a la IA omite los hechos privados cuyos testigos están ausentes, aunque todavía no garantiza que una IA jamás atribuya mal otro conocimiento.


## Contratos temporales de Lorebook y Creator (2026-11-05)

- `GET /api/v1/stories/{story_id}/lorebook/turns/{turn_id}` → `{story_id,turn_id,created_at,entries:[LorebookEntry,...]}`. Cada entrada incluye el ID original **de esa historia**, claves, contenido y prioridad tal como existían cuando se confirmó el turno. 404 si no hay snapshot o ese turno pertenece a otra historia.
- `POST /api/v1/stories/{story_id}/fork` con `{"until_turn_id":"<UUID>"}` mantiene el contrato 201 + `Story`; **ahora** selecciona versiones de Lorebook y Creator privadas de ese turno, además del canon y el estado del mundo histórico. Los identificadores de las entradas y NPC cambian por rama; dentro de los snapshots copiados se mantiene estable el nuevo identificador correspondiente. `{"until_turn_id":null}` continúa creando una rama de la historia **actual** completa.
- `creator_turn_snapshots` registra el blueprint y las fichas NPC al confirmar cada turno; por ahora es una tabla interna transaccional, sin endpoint público para exponer instrucciones privadas del narrador al lector.
- Los turnos antiguos sin `lorebook_turn_snapshots` o `creator_turn_snapshots` se tratan con **fallback vacío** al bifurcar desde ese punto: copiar valores presentes hoy produciría spoilers imposibles de verificar.
- El botón «Rebobinar aquí» del lector no llama una acción destructiva: usa `fork` tras confirmación. La historia origen y sus turnos posteriores siguen intactos; la pantalla solo muestra el resumen de instantáneas del Lorebook y del estado del mundo. Sigue pendiente el contrato de una operación destructiva/archivable con undo.

Referencia de pruebas: [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834) con 179 Python y 34 Playwright aprobadas. Esta recuperación temporal no cubre cambios antiguos en imágenes editoriales, referencias visuales y planes de escena.


## Alcance por testigo de Lorebook — ampliación compatible

- `POST/PUT /api/v1/stories/{story_id}/lorebook`: parámetros opcionales `visibility: "world"|"witnesses"` (predeterminado `world` para compatibilidad con entradas existentes) y `witness_character_ids: string[]` (máximo 16 UUID). En modo `witnesses` se exige al menos un NPC propio de la historia; no se admiten repetidos. Modo `world` exige lista de testigos vacía. Los errores de validación responden 422.
- `POST /api/v1/stories/{story_id}/lorebook/preview`: incluye el campo adicional `skipped_visibility` para entradas privadas descartadas porque los testigos no están presentes. Los hechos privados solo entran en `entries/context` cuando intersectan `GET /world-state` → `state.present_character_ids`; las palabras clave o los nombres mencionados en el texto de consulta no establecen presencia.
- `GET .../lorebook/turns/{turn_id}` conserva el alcance y testigos exactos del checkpoint; en una rama todos los IDs de testigos y de entradas se remapean a su destino, sin consultar NPC actuales de la historia original.
- Este filtrado gobierna únicamente la selección de entradas Lorebook hacia el prompt y no restringe el acceso administrativo a su editor. No evita por sí solo que el LLM genere una revelación incorrecta desde otros contextos.


**Verificación de la extensión:** [CI #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216) — 193 Python + 36 Playwright PASS. La semántica de `visibility=world` y las rutas existentes no cambiaron.


## Exportación HTML ilustrada (P1)

`GET /api/v1/stories/{story_id}/export.html` → `200 text/html; charset=utf-8`, `Content-Disposition: attachment; filename="noble-story.html"`, `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`; `404` si no existe la historia. HTML autocontenido con portada cuando existe, intervenciones/diálogos y escenas ilustradas según snapshots visuales guardados. Escapa contenido textual antes de emitir HTML. Solo incluye datos de la rama solicitada, sin el árbol completo ni contextos privados de Creator.


## Memoria episódica de intervenciones del jugador

`GET /api/v1/stories/{story_id}/memory/search?q=<texto>&limit=6` → `{episodes:[{turn_id,story_id,mode,input_text,created_at,matched_terms},...],fts5:boolean,source:"player_input"}`. `q` exige 2–500 caracteres; `limit` 1–12. Error 404 para historia desconocida. Las búsquedas se limitan al proyecto solicitado y **no** exponen `assistant_text`, secretos del creador ni Lorebooks. Un índice FTS5 está disponible cuando lo soporta SQLite; el fallback léxico es local y no requiere modelos IA.


## Inspector de contexto del narrador

`POST /api/v1/stories/{story_id}/context/preview` con `{input_text: string (0–3000), mode: "do"|"say"|"story"|"continue"}` (entrada obligatoria salvo `continue`) → `{story_id,messages:[{role,content}],sections:[{name,characters,approx_tokens}],total_characters,estimated_prompt_tokens,reserved_output_tokens,context_window_tokens,estimated_total_tokens,estimated_overflow,token_counts_exact:false,token_estimate_method,runtime_kv_cache_measured:false}`. `404` historia inexistente; `422` solicitud inválida. Sin inferencia ni persistencia. Los mensajes contienen material privado del creador: interfaz solo para el autor.


## EPUB3

`GET /api/v1/stories/{story_id}/export.epub` → `200 application/epub+zip`, `Content-Disposition: attachment; filename="noble-story.epub"`, `Cache-Control:no-store`, `X-Content-Type-Options:nosniff`; `404` si la historia no existe. EPUB3 autónomo con archivos XML/OPF, índice `nav.xhtml`, portada y WebP de snapshots por turno, restringidos a la rama indicada.


**Gate de exportación, memoria e inspector:** [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352) — 217 Python + 42 Playwright PASS. Las nuevas rutas son de lectura; no exponen instrucciones privadas en los archivos HTML/EPUB.


## Respaldo/restauración del árbol de historias (.noble.zip v1)

`GET /api/v1/stories/{story_id}/archive.noble.zip` → `200 application/zip`, `Content-Disposition: attachment; filename="noble-family.noble.zip"`; `404` si no existe la historia; `422` en caso de límite o datos corruptos. El ZIP contiene `manifest.json` con `{format:"noble-story-family",version:1,root_story_id,tables,files:[{path,size,sha256}]}` y archivos administrados `story-assets/<uuid>/...`. Incluye el árbol conectado de historias y ramas, sin configuración global ni claves secretas.

`POST /api/v1/stories/archive/import` con multipart `file=...noble.zip` → `201 {root_story_id,restored_stories,restored_files,story_ids}`. `409` ante historias/carpetas/identificadores ya existentes, sin sobrescritura. `422` ante ZIP inválido, checksum fallido, esquema inesperado o contenido externo. Se validan todos los miembros antes de la restauración transaccional.


## Árbol de rutas de una historia

`GET /api/v1/stories/{story_id}/branches` → `200 {root_story_id,selected_story_id,branches:[{id,title,protagonist_name,origin_story_id,origin_turn_id,depth,turn_count,created_at,updated_at,is_selected}]}`. Incluye raíz y todos los descendientes relacionados, en orden padre-antes-de-hijos. La ruta es de solo lectura, máximo 64 nodos, error 404 si la historia no existe, 422 si el árbol es cíclico/inválido.
