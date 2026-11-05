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
