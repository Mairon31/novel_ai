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
