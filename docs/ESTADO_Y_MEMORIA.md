# Estado, memoria y coherencia narrativa

Estado: diseño v0.1.

## Problema que resolvemos

Una novela visual de IA puede generar diálogos brillantes y, 40 turnos después, olvidar una promesa, mover un personaje a un lugar imposible o cambiar la ropa entre imágenes. Noble AI no delega todo el canon a una ventana de contexto: registra hechos estructurados y versiones.

## Agregados de dominio

| Agregado | Propiedades importantes |
|---|---|
| Story | `id`, título, premisa, idioma, estilo, reglas, fecha de creación |
| Branch | `id`, `story_id`, `parent_branch_id`, `fork_turn_id`, `head_revision`, `active` |
| Turn | `id`, parent, input mode, input text, narration/dialogue, provider config, commit status |
| Event | `id`, `branch_id`, ordinal, tipo, actor, source_turn_id, payload JSON, timestamp |
| Character | `id`, roles, bio y reglas de conocimiento, canon visual por versión |
| Relationship | from/to + estado/revisión + hechos que la justifican |
| Location | `id`, geografía lógica, ocupantes, visual keys |
| Scene | estado derivado de sucesos; lugar, momento, reparto y revision |
| Memory | recuerdos confirmados, resúmenes derivados, importancia, procedencia |
| Asset | hash, tipo, versión de apariencia, prompt/workflow/model, estado y scene revision |
| Job | tipo, prioridad, idempotencia, provider, retry/cancel/lease |

**Fuente de verdad:** turnos y eventos confirmados por rama. Fichas y resúmenes son índices/materializaciones que pueden reconstruirse.

## Ensamblaje de contexto

Orden recomendado por turno:
1. Reglas del proyecto (no suplantar la decisión del jugador, idioma, contratos).
2. Premisa/mundo; reglas particulares de la historia.
3. Personajes activos: identidad, motivaciones, relación, conocimientos accesibles.
4. Estado actual: tiempo, lugar, inventario, heridas, objetivos, situación.
5. Hechos relevantes de canon recuperados por `story_id`, rama y relevancia (filtro temporal).
6. Últimos N turnos íntegros; resumen de episodios antiguos si hay presión de tokens.
7. Comando del jugador.

Presupuesto de tokens por perfil; no suponer contexto 128k libre de costo de KV. Medir con tokenizador de proveedor. Si excede, conservar canon+entrada reciente; comprimir pasado. Registrar qué memorias fueron inyectadas para depuración.

## Actualización de hechos

A partir de texto propuesto, un paso de extracción devuelve **propuestas** de eventos tipados: `character_entered`, `character_left`, `item_acquired`, `item_removed`, `relationship_changed`, `time_advanced`, `location_changed`, `fact_learned`, `appearance_changed`, `quest_updated`. Aplicar validaciones de tipo, IDs existentes, coherencia temporal y autorización narrativa.

Eventos de editor/jugador tienen prioridad explícita sobre inferencias de modelo. Si el modelo contradice canon, presentar narración sin aplicar estado conflictivo o regenerar una vez. Nunca crear hechos irreversibles sin enlazar turno fuente.

## Branching: reintentar y editar

```
rama main: turno1 -> turno2 -> turno3
                    \
                     retry-2: turno2b -> turno3b
```

Cada rama conserva su historial hasta el punto de bifurcación. Revisiones optimistas; `parent_branch_id` y `fork_turn_id` son obligatorios. La UI distingue rama activa y pasadas. No editar el texto de un evento ya committeado in situ.

Si se edita turno 2, los resúmenes desde turno 2, el estado derivado y las imágenes de escena antigua quedan obsoletos **solo en la nueva rama**. Assets antiguos continúan referenciados por la rama original. Evitar borrado automático sin GC con conteo de referencias.

## Memoria estructurada vs semántica

- P0/P1: SQLite, JSON de canon y búsqueda por tags/FTS5; esto basta para pocas historias.
- P2: resúmenes por ventana/episodio y recuperación top-k con relevancia temporal.
- Futuro: embeddings locales para recordar hechos remotos, pero no se anteponen a canon explícito.
- Los resúmenes reciben `source_event_range`, versión de prompt/modelo y `stale` para permitir recalcular.

## Pruebas narrativas obligatorias

- Un secreto no revelado no se atribuye a un personaje que lo desconoce.
- Cambiar objeto de dueño refleja inventario, narra consecuencias y persiste.
- `retry`/edición nunca modifica el original; ambos recargan correctamente después de reinicio.
- Con 100 turnos, el canon manual y el último estado no se pierden.
- Narración JSON corrupta no produce alteración de DB; queda registro de diagnóstico.
- Cambio de vestuario produce nueva `appearance_revision` visual, pero una frase sin cambio conserva el asset.

## Migraciones y copias

SQLite con migraciones Alembic en cada cambio de esquema. Copia transaccional/SQLite backup API antes de versiones destructivas, export JSON/ZIP con manifest+hash+schema_version, import con IDs mapeados y verificación de integridad.

## P1.4 — Canon y bifurcación real disponibles

**Estado verificado por tests de API/SQLite.** Cada historia posee el campo `canon`, texto editable hasta 5000 caracteres. Se guarda como atributo permanente de la historia, además de la premisa y protagonista. La generación narradora añade este canon al mensaje del sistema para mantener reglas del mundo y hechos confirmados, aunque el historial reciente ya no contenga esos turnos.

- `PATCH /api/v1/stories/{uuid}/canon` recibe `{"canon":"..."}` y retorna la historia.
- `POST /api/v1/stories/{uuid}/fork` con `{"until_turn_id":"uuid"}` crea una **historia nueva independiente** que copia todos los turnos hasta e incluyendo el indicado. `{}` copia el historial completo. Nunca borra el original.
- La copia tiene un UUID propio, conserva premisa, protagonista, canon y escena WebP; los turnos reciben IDs y request_id nuevos.
- Se guardan `origin_story_id` y `origin_turn_id` en SQLite para futura navegación mediante árbol de ramas.
- UI: **Biblioteca → Historial → Crear rama**; después puedes elegir original o alternativa en la biblioteca.
- La copia se realiza en una transacción SQLite. Aún no hay árbol visual interactivo, fusión de ramas ni estado automático derivado de los turnos.
- La memoria de corto plazo sigue usando una ventana de los 16 turnos más recientes. El canon es manual: Noble AI no deduce ni inventa automáticamente eventos canónicos nuevos.

**Preparación del motor:** `POST /api/v1/narrative/prepare` ejecuta una generación mínima y explícita para precalentar Ollama/KoboldCpp/worker. No añade capítulos, no actualiza canon y no se activa al abrir la aplicación. OpenRouter no ofrece esta precarga y queda excluido. El botón muestra el tiempo de espera, pero no garantiza que la GPU conserve indefinidamente el modelo cargado.

**Futuro:** memoria por escenas, inventario y relaciones, resúmenes semánticos auditables, identificación de cambios de escenario, decisiones visuales, árbol de ramas y control de conflictos.


## P1.5 — estado visual separado del canon narrativo

El texto canónico sigue siendo editable; los registros `visual_scenes` representan la línea temporal espacial. Una transición detectada no modifica el canon ni altera retroactivamente escenas antiguas. Las fichas `visual_characters` guardan rasgos coherentes como texto versionado. La galería `visual_assets` vincula escenas con resultados WebP permanentes, y `visual_current` apunta a la versión mostrada. Bifurcar una historia copia sus escenas, personajes y arte aplicable con IDs nuevos; no enlaza mutablemente los archivos con los del origen. El análisis semántico completo y el árbol de ramas siguen pendientes.

## Prioridades de memoria según auditoría Argon (2026-11-05)

Estado: la base actual persiste historias, canon, turnos y clones; **no constituye aún** memoria híbrida con aislamiento cognitivo ni snapshots completos del mundo. Seguir los checkboxes [AUD-005, AUD-006 y AUD-014](../TODO.md), con semántica de la tabla maestra §18.

1. **Fuente de verdad determinista:** el estado estructurado por `story_id`, `branch_id` y `turn_id` define ubicación, momento, personajes presentes, inventario, relaciones, flags, testigos y vínculos de arte. El LLM redacta la narración; no puede redefinir unilateralmente ese estado.
2. **Atomicidad y recuperación:** guardar turno, snapshot y cambios canónicos dentro de una unidad transaccional; no mezclar el delta visual asíncrono con el commit narrativo sin un protocolo de idempotencia. El retroceso debe restaurar el estado exacto del nodo, no copiar el estado actual de otra rama.
3. **Cuatro niveles de contexto:** prefijo fijo (instrucciones/canon/personajes), Lorebooks por claves/regex con límites, memorias episódicas relevantes con testigos y ventana FIFO reciente. El prefijo estable favorece la reutilización de KV-cache; cualquier métrica de acierto debe venir del proveedor.
4. **Recuperación:** FTS5 primero como fallback ligero; `sqlite-vec` opcional para embeddings CPU cuando sea instalable. Los episodios deben registrar `witness_character_ids`, `importance`, rango de turnos y procedencia; nunca inyectar a un personaje un secreto que no presenció.
5. **Presupuesto:** el servidor decide la asignación efectiva de tokens por bloque, conserva reserva de salida, informa el truncamiento y presenta un desglose al inspector en `NarrativeSettings.tsx`. El ejemplo 8192 tokens de la auditoría es un perfil inicial, no una regla universal.
6. **Validación:** historias simuladas de 100–120 turnos, hecho remoto recuperado, aislamiento de testigos, ramas sin contaminación, límite de contexto respetado y persistencia tras reinicio. Sin esta evidencia las tareas quedan abiertas.

Referencias: [auditoría §§09–10, 14, 19, 21](ARGON_AUDITORIA.md), [arquitectura](ARQUITECTURA.md), [roadmap](ROADMAP.md).


## Implementación P1: Lorebook local condicionado (2026-11-05)

El creador dispone de `GET/POST/PUT/DELETE /api/v1/stories/{uuid}/lorebook` y `POST .../lorebook/preview`. Cada entrada conserva contenido autoral privado, palabras clave primarias y secundarias, modo `any/all` para secundarias, coincidencia de palabra completa con `re.escape` (nunca regex arbitraria), estado habilitado o siempre activo, y prioridad de 0–100. Se limita el contenido por entrada (3500 caracteres) y el contexto activado (6000 caracteres). Los hechos se incluyen íntegros o se omiten si no caben. Es un límite por **caracteres**, no por tokens.

La activación del narrador analiza la intervención presente y los últimos cuatro turnos (sin utilizar `ai_plot` oculto como disparador), y añade los hechos pertinentes al mensaje de sistema sin enseñarlos como respuesta al jugador. `NarrativeService.fork_story` copia las entradas en filas UUID nuevas para poder editar ramas sin alterar la historia origen. Se ha comprobado una historia de 110 turnos: un hecho escrito previamente en Lorebook no se inyecta de forma omnipresente, pero vuelve a entrar cuando la acción actual contiene su clave.

La interfaz Creator Studio incluye pestaña propia de Lorebook con editor, prioridades, activadores y previsualización del texto exacto añadido. API y pruebas `tests/test_lorebook.py`; [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220): **151 Python + 30 Playwright PASS**.

**No implementado todavía:** scopes de personaje/testigos (control de omnisciencia), snapshots de canon por turno, recuperación semántica de memorias episódicas, regex con timeout, recursión de Lorebooks y reparto del contexto con tokenizador del runtime. Estas tareas siguen abiertas en [TODO](../TODO.md).
