# Noble AI — Contratos HTTP/SSE v0.1 (propuesta)

**Base** `/api/v1`. API externa propia del orchestrator; los endpoints de KoboldCpp, ComfyUI o TTS solo se consumen desde backend. Esta especificación es diseño para implementación, no una API disponible todavía.

## Convenciones

- JSON UTF-8, timestamps ISO-8601 UTC, UUID para `story_id`, `branch_id`, `turn_id`, `job_id`, `asset_id`, `character_id`.
- Errores estándar: `{code, message, request_id, retryable, details?}`.
- Escrituras mutantes incluyen `Idempotency-Key` y revisión esperada `base_revision` para evitar duplicados y ediciones concurrentes.
- `status` de jobs: `queued | running | completed | failed | cancelled`; estado de provider aparte.
- El body de una respuesta narrativa solo contiene contenido permitido para UI; el estado de mundo se valida y confirma en proceso separado.

## Endpoints

| Método/ruta | Propósito | Resultado |
|---|---|---|
| GET `/health` | salud del orchestrator | version, db, uptime, providers |
| GET `/providers` | capacidades disponibles | LLM/image/TTS statuses; GPU profile |
| GET/POST `/stories` | biblioteca y nueva historia | story_id, title |
| GET/PATCH `/stories/{id}` | detalle/edición de premisa y reglas | revision |
| POST `/stories/{id}/characters` | ficha de personaje | character_id |
| POST `/stories/{id}/branches` | crear bifurcación desde turno | branch_id |
| GET `/stories/{id}/timeline?branch_id=...` | historial de rama | ordered events |
| POST `/stories/{id}/turns` | texto Hacer/Decir/Narrar/Continuar | turn_id, stream_url |
| GET `/turns/{id}/events` | SSE de tokens/estado | event stream |
| POST `/turns/{id}/retry` | regeneración sin alterar original | new_branch_id, new_turn_id |
| POST `/turns/{id}/edit` | edición con nueva rama | new_branch_id |
| POST `/scenes/{id}/illustrations` | forzar ilustración on-demand | job_id |
| POST `/turns/{id}/speech` | voz opt-in para texto/voz determinada | job_id o asset cache hit |
| GET `/jobs/{id}` | progreso y errores | state, progress, asset_id? |
| POST `/jobs/{id}/cancel` | cancelación idempotente | state |
| GET `/assets/{id}` | descargar/visualizar asset | stream con MIME validado |
| POST `/stories/{id}/export` | exportar portable | archive_id |
| POST `/imports` | importar con validación/versiones | import_id |

## Esquema de un turno (ejemplo)

```json
{
  "story_id": "uuid",
  "branch_id": "uuid",
  "base_revision": 4,
  "input": {
    "mode": "say",
    "text": "¿Qué sabes de la torre?",
    "speaker_character_id": "uuid-del-protagonista"
  },
  "narration_settings": {
    "language": "es-419",
    "style": "fantasia",
    "max_new_tokens": 450
  }
}
```

Reglas: `mode` = `do | say | story | continue`; `text` opcional **solo** para continue. Respuesta asincrónica `202` con `turn_id` y URL de eventos. No permitir al usuario fijar `branch_revision` arbitraria.

## Eventos SSE (ejemplo)

```text
event: turn_started
data: {"turn_id":"uuid","request_id":"uuid"}

event: text_delta
data: {"turn_id":"uuid","delta":"Airi te mira..."}

event: turn_committed
data: {"turn_id":"uuid","branch_id":"uuid","revision":5,"scene_id":"uuid"}

event: job_queued
data: {"job_id":"uuid","kind":"image","scene_id":"uuid"}

event: done
data: {"turn_id":"uuid"}
```

Event ids secuenciales por turno; al reconectar ofrecer replay o consulta de snapshot. Nunca asumir entrega exactamente una vez desde SSE; los comandos deben ser idempotentes.

## Modelo de escena proyectada

```json
{
  "scene_id": "uuid",
  "revision": 12,
  "location_id": "shop_01",
  "time_of_day": "evening",
  "cast": [
    {"character_id":"uuid","appearance_revision":2,"expression":"concerned"}
  ],
  "background_asset_id": null,
  "sprite_asset_ids": [],
  "pending_image_job_ids": [],
  "narration": "Texto mostrado al usuario",
  "dialogue": [
    {"speaker_id":"uuid","text":"...", "emotion":"concerned"}
  ]
}
```

Campos visuales nunca determinan hechos de canon por sí mismos. Los cambios se proponen y validan del lado servidor.

## Contrato de proveedores (backend interno)

```python
class NarrativeProvider:
    async def stream(self, messages, config, request_id): ...
    async def cancel(self, request_id): ...
    async def health(self): ...

class ImageProvider:
    async def submit(self, workflow, variables): ...
    async def status(self, provider_job_id): ...
    async def fetch(self, provider_job_id): ...
    async def cancel(self, provider_job_id): ...

class SpeechProvider:
    async def synthesize(self, text, voice, language, options): ...
    async def health(self): ...
```

Los adaptadores declaran capacidades reales (`streaming`, `json_schema`, `interrupt`, `image_reference`, `latam_voice`), no se inventan. Tolerar proveedores sin cancelación.

## Validaciones mínimas

- Revisión antigua → HTTP 409 con `current_revision`; usuario decide rebasar/bifurcar.
- Turno duplicado (misma clave de idempotencia + payload) → mismo ID/estado, jamás doble narración.
- TTS prohibido si `requested_by` no es una acción explícita del jugador o autolectura opt-in.
- Generación visual automát. solo cuando planner encuentra cambio de firma; su solicitud explícita salta el umbral pero respeta deduplicación.
- Asset final se vincula únicamente a la revisión de escena para la que fue solicitado.
- Invalidaciones de ramas no borran archivos: referencias de manifest con eventual GC transaccional.

## Artefactos futuros

Publicar OpenAPI 3.1 y esquemas JSON verificables en `packages/contracts`. Generar cliente TypeScript desde contrato; `pytest` valida API y `vitest` valida cliente. Al implementar, sustituir los ejemplos UUID sintéticos por fixtures reproducibles.
