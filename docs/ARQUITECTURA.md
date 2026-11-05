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
