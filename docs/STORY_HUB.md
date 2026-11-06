# Story Hub local — tres mundos originales listos para jugar

**Estado:** catálogo local incluido en Noble AI, instalable desde Biblioteca. **No es un marketplace comunitario remoto.** Las tres historias contienen texto estructurado, pero no portadas/sprites generados ni imágenes instaladas.

## Uso

Entra a **Biblioteca → Descubre un mundo para jugar**, selecciona un mundo, revisa personajes y tres aperturas, cambia si quieres el protagonista y pulsa **Añadir a mi biblioteca**. Se crea una nueva historia editable en Creator Studio y se abre su detalle. Elige un inicio: el primer turno se guarda sin llamar a un LLM. Seguir jugando requiere un narrador configurado. Repetir una instalación crea una copia distinta; no reemplaza tu progreso.

| Paquete v1.0.0 | Género | NPC | Lorebook | Aperturas |
|---|---|---:|---:|---:|
| `ultima-luna` — La estación de la última luna | Misterio sobrenatural | 4 | 3 | 3 |
| `mareas-de-vidrio` — Las mareas de vidrio | Ciencia ficción costera | 4 | 3 | 3 |
| `jardin-mecanico` — El jardín de las horas rotas | Fantasía de relojería | 4 | 3 | 3 |

Incluyen sinopsis, trama pública, **trama secreta para el narrador**, directrices, personajes con personalidad/diálogos, Lorebooks activados por palabras clave y tres aperturas diferentes. El catálogo público nunca incluye secretos, directrices privadas ni contenido del Lorebook. El atributo `has_images=false` aclara la ausencia de imágenes. Las fichas muestran autoría y versión, pero **no afirman una licencia CC0 de redistribución**.

## Contratos

- `GET /api/v1/story-hub` → `{packs,source:"bundled-original",community_online:false}`, solo campos públicos.
- `GET /api/v1/story-hub/{pack_id}` → ficha pública o 404.
- `POST /api/v1/story-hub/{pack_id}/install` con `{"protagonist_name":"Alex"}` opcional (1–60 caracteres) → 201 `{story,package_id,version,characters_installed,lore_installed,openings_installed}`. Rechaza pack desconocido, nombres inválidos y campos extra. La instalación usa `BEGIN IMMEDIATE` y crea historia, blueprint, NPC y Lorebooks con **UUID nuevos en una transacción única**. Si algún insert falla, se revierte todo.
- `POST /api/v1/stories/{story_id}/creator/opening` con `{index:0|1|2}` crea el primer turno narrativo y bloquea escoger otro cuando ya empezó.

No hay inferencia, descargas, ZIPs ajenos, ejecución de plugins ni red externa al instalar estos paquetes integrados. La historia se puede exportar usando el respaldo `.noble.zip` existente.

## Historia inicial de Colab

Cuando la Biblioteca está **vacía**, `tools/colab_launch.py` instala `ultima-luna` con 4 NPC, 3 Lorebooks y 3 aperturas, comprobando recuentos antes de declarar éxito. No toca bibliotecas que ya contienen historias ni reescribe una demo antigua. Si ya tienes el ejemplo simple, instala la versión enriquecida manualmente desde Biblioteca.

## Evidencia y límites

- `tests/test_story_hub.py`: 3 mundos, filtrado de secretos, 4 NPC, 3 Lorebooks y 3 aperturas; dos copias aisladas, nombre de protagonista, primer turno, rechazo de segundo inicio y rollback con trigger SQLite que aborta insert.
- `apps/web/tests/story-hub.spec.ts`: recorrido real Biblioteca → seleccionar → instalar → detalle → comenzar historia, en desktop y móvil.
- `tests/test_colab_play.py`: demo enriquecida solo en biblioteca vacía y guardas de recuentos.
- [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781), commit `a35e13b5`: **358 Python / 68 Playwright / build Vite PASS**. Solo se probaron contratos HTTP y UI; no generación real de imágenes, narración prolongada ni GPU.

**N-08 y N-09 siguen abiertos**: faltan arte de portada/fondos/sprites, manifiesto de paquetes externo versionado, actualización de fuentes sin perder ediciones, prueba real de 10–20 turnos, identidad/firmas/licencias de assets y compatibilidad de versiones. **N-10 (comunidad/Creators en línea)** continúa pendiente: requiere backend de publicación, permisos, moderación y distribución segura, no solo tres ejemplos locales.


## Descubrir como espacio independiente

Se añadió la página `#/descubrir` con un destino **Descubrir historias** propio del menú, accesible en desktop y móvil. La Biblioteca conserva una selección destacada, pero `#/descubrir` constituye una ruta compartible que no necesita abrir historias existentes ni Creator Studio. Instalar allí vuelve a `#/historia/{uuid}`, abre el detalle del nuevo proyecto y permite escoger apertura.

`apps/web/tests/story-hub.spec.ts` incluye pruebas adicionales de deep link, recarga y posterior navegación desde el catálogo al detalle de historia; no altera los enlaces previos de Biblioteca, Lector ni Creator.

- [CI #42170140099](https://github.com/Mairon31/novel_ai/actions/runs/42170140099): **358 Python y 70 Playwright**, compilación Vite PASS, incluido `#/descubrir` y navegación/recarga.
- [CI #42170420070](https://github.com/Mairon31/novel_ai/actions/runs/42170420070): test Python de roundtrip exportar/importar mundo con personajes/Lorebook/inicios aprobado (359 tests Python totales); frontend en validación al registrar.


## Creator Studio — propuesta completa con narrador configurado

Se incorporó **Crear con IA** como entrada independiente de Creator Studio. El usuario escribe una idea, protagonista, género y tono. El backend ejecuta tres generaciones en secuencia: (1) mundo con trama pública/privada y tres aperturas, (2) cuatro NPC con carácter y diálogo, (3) tres entradas activables del Lorebook. Se utiliza el proveedor/modelo del narrador configurado; no hay respuestas de relleno, catálogo remoto ni historia preescrita que se haga pasar por generada.

El servidor valida el JSON y los modelos tipados en cada etapa y aplica las mismas restricciones del instalador del Story Hub. **La generación no escribe SQLite.** La interfaz presenta un borrador, permite editar título, sinopsis, protagonista, género, etiquetas, trama pública/privada, directrices, recordatorio, fichas completas de NPC, entradas del Lorebook y las tres aperturas y requiere **Crear historia con esta propuesta** para instalarlo como una historia separada. Los datos anteriores permanecen intactos, y los nuevos campos se pueden modificar después en Creator Studio. El instalador usa una transacción para historia, blueprint, NPC y Lorebooks; un error en cualquier escritura revierte el mundo completo.

Contratos:
- POST /api/v1/creator/assistant/draft: idea (30–2500 caracteres), protagonist_name, genre y tone opcionales; devuelve draft, model, stages_completed=3 y saved=false; exige narrador configurado (409); valida cada respuesta (422) y error de proveedor/timeout (502).
- POST /api/v1/creator/assistant/install: recibe StoryDraft tipado, confirma creando la historia en SQLite y devuelve story, recuentos de NPC/lore/aperturas y generated_media=0. No consulta el modelo en esta fase.
- El API comparte la exclusión local GPU con la narración cuando se usa Ollama/KoboldCpp sin forzar CPU. Máximo 2048 tokens por etapa, hasta 180 s de lectura por etapa; esto no prueba capacidad de modelos concretos.
- Pruebas: `tests/test_story_generator.py` (generación simulada, fallo a mitad, esquema, rechazo de campos extras, rollback) y `apps/web/tests/creator-ai.spec.ts` (formulario, previsualización, edición de componentes, instalación y QA móvil/escritorio con propuesta mock). [CI #42180655437](https://github.com/Mairon31/novel_ai/actions/runs/42180655437): **365 Python / 72 Playwright / Vite PASS**.

**No equivale a N-07 completo:** aún no genera imágenes, voces ni plan editorial por escenas; la coherencia creativa de 10–20 turnos necesita ensayo con modelo y GPU reales.


## Regeneración selectiva de borradores (2026-11-06)

El asistente admite regenerar `plot`, `openings`, `characters` o `lore` mediante `POST /api/v1/creator/assistant/regenerate` con `{draft, section, instruction}`. La llamada utiliza el narrador configurado y el bloqueo GPU local existente. El canon y las secciones ajenas a la seleccionada se envían como contexto de referencia; el servidor solo sustituye la sección elegida tras validar esquema y paquete completo. Si el modelo devuelve JSON inválido, una cantidad incorrecta de elementos o falla la generación, el borrador anterior permanece intacto en la interfaz y no se escribe SQLite. No implica regeneración de imágenes, TTS ni control de costo/cancelación upstream. Estado de CI por verificar.

El contexto canónico se limita a 14 000 caracteres JSON para NPC/Lorebook/aperturas; al reescribir `plot`, el contexto fijo dispone de hasta 9 000 caracteres JSON y la trama anterior de otros 3 500, con compactación independiente. El backend compacta texto extenso y detalles secundarios de NPC, Lorebook y aperturas, sin mutar el borrador; rechaza canon que no pueda ajustarse. Es un presupuesto aproximado en caracteres, no un conteo real de tokens ni garantía de ventana de contexto del modelo.

### Reescritura de trama principal y reversión (2026-11-06)

La sección `plot` acepta una revisión estructurada de `synopsis`, `player_plot`, `ai_plot`, `guidelines` y `reminder`. El servidor exige todos los campos, valida longitudes y verifica el borrador entero antes de devolverlo; preserva título, género, tags, protagonista, cuatro NPC, tres entradas de Lorebook y las tres aperturas. La trama anterior se envía como texto revisable, separado del canon fijo. Para esta sección, el máximo de salida configurado es 3 072 tokens; para las otras secciones, 2 048. No se escribe SQLite hasta instalar.

La UI ofrece restaurar **una versión anterior** del borrador después de cada regeneración. La comprobación de revisión local evita aplicar respuestas tardías si hubo una edición durante la espera. El resultado incluye `generation_budget`: tamaño del prompt en caracteres, estimación de entrada por caracteres/4 y máximo configurado de salida. No mide consumo real, costo ni VRAM, y puede ser impreciso según el tokenizer.

Pruebas nuevas: rechazo de trama incompleta, preservación de NPC/Lorebook/aperturas y propiedades, rollback UI de aperturas y posterior reescritura de trama. Validado en [CI #42256256693](https://github.com/Mairon31/novel_ai/actions/runs/42256256693): 372 tests Python / 72 Playwright en escritorio y móvil, Vite PASS. La generación del modelo es simulada; no valida GPU o calidad narrativa real.
