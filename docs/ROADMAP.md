# Noble AI — roadmap, backlog y Definition of Done

Versionado: 2026-11-04 · **Sin implementación de runtime aún**. Las fases son dependencias, no plazos ficticios. Actualizar `PROGRESO.md` al verificar cada tarea.

## Principios de ejecución

- Integrar herramientas existentes antes de construir alternativas.
- Cada fase debe entregar software probada con pruebas automatizadas **y** visuales si cambia UX.
- No declarar "PASS" sin salida, GPU, versión, commit y artefactos enlazados.
- No introducir placeholders presentados como funcionalidad completada. Los fixtures y mocks de **prueba** se etiquetan como tales y se diferencian de los proveedores reales.
- Mantener funcionamiento de narración aunque imagen/TTS fallen.
- Dejar las tareas, deudas, errores conocidos y decisiones registrados.

## P0 — investigación / especificación / Colab diagnóstico

- [x] Inicializar repo, README y documentación de arquitectura.
- [x] Definir diseño GDD, contratos API y estado.
- [x] Catalogar repos/servicios y sus licencias observadas.
- [x] Definir política de imágenes progresivas y TTS opt-in.
- [x] Definir hardware 12/16GB y gates de validación.
- [ ] Ejecutar notebook de diagnóstico en una sesión **real** de Colab; adjuntar resultados.
- [ ] Elegir modelo narrativo GGUF inicial con versión/hash, licencia y benchmark plan.
- [ ] Spike Open Dungeon: comparar reutilización contra frontend propio con esfuerzo medido.
- [ ] ADR-002: confirmar alcance de reuso y componentes fijos.
- **Gate P0:** notebook ejecutado con diagnóstico y evidencia; elecciones documentadas y catálogo de licencias revisado.

## P1 — vertical slice narrativo sin imágenes/TTS

- [ ] Crear `apps/api` FastAPI, Alembic, SQLAlchemy, schemas OpenAPI y service health.
- [ ] Crear `apps/web` Vite/React/TS con reproductor VN adaptativo.
- [ ] Implementar story CRUD, personajes, eventos, revisión optimista y branch/retry/edit.
- [ ] Implementar adaptador KoboldCpp (stream/chat/cancel/health) y Ollama alternativo.
- [ ] Implementar ensamblador de contexto y validación de cambios de canon.
- [ ] Persistir/reabrir historias; mostrar streaming/Hacer/Decir/Narrar/Continuar.
- [ ] Contract tests, integration con LLM **real** en Colab cuando hardware lo permita.
- [ ] Playwright móvil y escritorio local/CI sin GPU.
- **Gate P1:** 10 turnos con modelo real, retry/branch, persistence y zero duplicate commits, capturas funcionales.

## P2 — imagen progresiva, identidad y caché

- [ ] Diseñar workflow ComfyUI API versionado, sin nodos personalizados no inventariados.
- [ ] Implementar adapter ComfyUI `/prompt`, WS, history, asset store SHA.
- [ ] Asset planner distingue cambio de lugar/identidad de diálogo ordinario.
- [ ] Scheduler GPU con lease, prioridades, OOM/timeout/cancel.
- [ ] Fondos/sprites cacheados y manifests por escena/versión.
- [ ] Introducir canon visual y evaluaciones de coherencia.
- [ ] Pruebas: 10 diálogos = 0 imágenes; cambio de escena = 1; cache hit = 0.
- **Gate P2:** imagen real tras evento/solicitud, caché y recuperación comprobados, sin bloquear texto.

## P3 — TTS bajo solicitud

- [ ] Adapter Chatterbox y worker lazy load, idioma ES-LA, voice_id estable.
- [ ] Botón Escuchar, detener, audio por personaje y caché.
- [ ] Autolectura solo habilitable explícitamente por usuario, por defecto OFF.
- [ ] Medición de calidad/VRAM y failover a texto; evaluar Qwen3-TTS.
- [ ] Tests de invocación 0 sin permiso, reintento y rama activa.
- **Gate P3:** audio real manual, ninguna invocación previa y narración conservada si TTS falla.

## P4 — experiencia y editores

- [ ] Creador de mundos/personajes, biblioteca, galería y fichas.
- [ ] Gestor de capítulos/escenas/ramas, versiones visuales, preferencias por historia.
- [ ] Modo pantalla completa VN y controles táctiles/escritorio; accesibilidad/QA visual.
- [ ] Import/export con integridad e historial; búsqueda/recuperación de memoria.
- [ ] Selector de modelos/configuraciones y diagnóstico de conexión/VRAM.
- **Gate P4:** juego completo de comienzo a fin con interfaz móvil/PC, restauración de estado y captura/registro QA.

## P5 — Colab→Windows y optimización

- [ ] Repetir contract/integration/end-to-end Colab en máquinas GPU disponibles.
- [ ] Benchmarks 12 GB físicos y 16 GB RTX 5060 Ti, sin inferir compatibilidad de 12GB a partir de 16GB.
- [ ] Empaquetado/start scripts Windows, instalación guiada, healthchecks.
- [ ] GPU profiles reales, retry/resume ante OOM, migraciones seguras.
- [ ] CI lint, typechecks, unit/integration/e2e, safety, licencia/atribuciones.
- [ ] Release candidata con notas, limitaciones reales, guía de usuario.
- **Gate P5:** demo reproducible Windows 16GB y validación explícita de 12GB o límite documentado.

## Backlog priorizado (orden de decisión)

| Prioridad | Tarea | Evidencia de terminado |
|---|---|---|
| P0 | Notebook Colab ejecutado en GPU disponible | log JSON + commit + modelo |
| P0 | Spike Open Dungeon reuso | comparativa, ADR, código referenciado |
| P0 | Spike KoboldCpp/Ollama | 1 inferencia real + metrics |
| P1 | SQLite events + branch | 100 % tests de invariantes |
| P1 | API story/turn SSE | OpenAPI + 10 turnos + idempotencia |
| P1 | Frontend VN responsive | Playwright escritorio/móvil + capturas |
| P2 | ComfyUI adapter | output PNG + workflow/sha + error test |
| P2 | Asset planner/cache | test 10 diálogos/1 escena |
| P2 | GPU scheduler | VRAM telemetry + cancel/timeout/oom |
| P3 | Chatterbox manual | archivo audio + 0 llamadas no solicitadas |
| P4 | Editor/historia portable | roundtrip export/import |
| P5 | Windows RTX 5060 Ti | informe de benchmark reproducible |

## Plantilla Definition of Done para PR

1. Implementación y archivos afectados listados.
2. Tests locales con comandos **y resultados reales**.
3. Capturas/QA visual de frontend cuando aplica.
4. Pruebas 12/16GB o declaración explícita 'sin probar' si afecta GPU.
5. Contratos, documentación, changelog, bitácora y ADR actualizados.
6. Licencias/auditoría de dependencias con source/commit.
7. No secretos/pesos/archivos generados en Git.
8. No degradar el flujo narrativa si falla imagen o voz.
