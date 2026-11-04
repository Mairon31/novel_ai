undefined
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
