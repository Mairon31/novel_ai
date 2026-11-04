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
