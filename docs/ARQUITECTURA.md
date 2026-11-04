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
