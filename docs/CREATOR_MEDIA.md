# Noble AI — Medios visuales para autores

El módulo Creator Studio → Imágenes permite componer una novela visual utilizando archivos del creador, sin cargar ComfyUI ni otro modelo para elegir la ilustración.

## Importación

Abre Creator Studio, elige un proyecto y entra en Imágenes. Selecciona Portada editorial, Fondo de escenario o Personaje / primer plano. Escribe un nombre y una descripción breve (caption), como «castillo iluminado en la ciudad» o «Aira sonríe en el castillo». Puedes vincular el retrato a un NPC de la misma historia.

Los archivos admitidos son PNG, JPEG y WebP hasta 12 MiB. Se comprueba la imagen con Pillow y se limita la resolución. La portada y el fondo quedan como WebP RGB y el primer plano como PNG RGBA para conservar la transparencia.

## Portada de la historia

Una portada es un recurso editorial independiente de las imágenes que genera o selecciona el narrador. Al importar una imagen como `Portada editorial`, Creator Studio la elige para esa historia. Puedes subir varias, marcar otra con `Usar como portada` o desvincularla mediante `Quitar portada` sin borrar la historia.

La Biblioteca y la ficha de historia muestran `cover_image_url` cuando está disponible. En historias sin portada se sigue usando el arte de escena anterior como alternativa, sin pérdida de contenido. La selección se conserva en SQLite como `stories.cover_asset_id`; durante un fork se clona el archivo y se remapea a un ID propio de la nueva historia. Eliminar el archivo que está seleccionado desactiva la portada para esa historia. Las portadas no forman parte de la detección de escenas del lector.

## Selección durante la lectura

El lector consulta una ruta específica de presentación que examina la ubicación actual y el texto del último turno narrado. Compara palabras completas, requiere coincidencias múltiples en captions descriptivas y exige que un NPC vinculado aparezca explícitamente en la narración. Cuando coincide un fondo, se muestra en el escenario. Cuando coincide un primer plano, se superpone sobre él. Si no hay coincidencia, conserva la ilustración de historia ya existente o la escena vacía.

La operación usa archivos locales guardados. No solicita generación ni descarga de modelos, y no envía automáticamente la narración a terceros. La coincidencia lexical todavía puede fallar con sinónimos o expresiones ambiguas; no constituye clasificación semántica.

## API

- GET /api/v1/stories/{id}/creator/assets — lista de recursos y URLs.
- POST /api/v1/stories/{id}/creator/assets — multipart con kind, label, caption, file y character_id opcional.
- PUT /api/v1/stories/{id}/creator/cover — selecciona o quita la portada con `{"asset_id":"uuid"}` o `{"asset_id":null}`.
- GET /api/v1/stories/{id}/creator/assets/scene — background, foreground y selection.
- GET /api/v1/stories/{id}/creator/assets/{asset_id}/file — entrega el archivo validado según su historia.
- PUT /api/v1/stories/{id}/creator/assets/{asset_id} — actualiza nombre y caption.
- DELETE /api/v1/stories/{id}/creator/assets/{asset_id} — elimina el recurso.

Tablas SQLite: creator_media_assets y stories.cover_asset_id. Al crear una rama se copian los archivos con UUID propios y se remapean tanto la asociación del personaje como la portada.

## Próximas mejoras de este módulo

Compositor de hasta tres NPC y variantes por expresión/pose ya implementado. Siguen pendientes generación IA de hojas, selección manual avanzada de posición, rig 2D, recorte del fondo automático y validación visual de identidad en imágenes generadas. El diseño usa principios generales documentados por Isekai Zero, sin tomar sus recursos de imagen.

## Seguridad y evolución según auditoría Argon (2026-11-05)

- **Endurecimiento implementado en `master`:** los paths de recursos exigen UUID canónicos, tipo válido y directorio resuelto dentro del espacio administrado. Los enlaces simbólicos que desvíen archivos fuera de `story-assets` son rechazados, incluidos al acceder a registros antiguos importados. Ver `tests/test_creator_media.py::test_owned_asset_paths_reject_traversal_and_symlinked_directories` y [CI](https://github.com/Mairon31/novel_ai/actions/runs/41994792794).
- **Fase P1:** asociar a cada personaje una hoja de expresiones `neutral/joy/anger/sadness/surprise` con IDs de assets, poses y metadatos; separar portada, fondo, sprite y CG, manteniendo referencias al ramificar.
- **Fase P2:** importación/exportación de Character Card PNG V2/V3 (`chara`/`ccv3`), drag-and-drop, campos mapeados, Lorebook incrustado y límites de bytes/chunks; no ejecutar scripts ni suponer que un PNG contiene JSON seguro.
- **Validación:** pruebas de permisos de historia, symlink, traversal, clonación, borrado seguro, roundtrip de tarjetas y reproducción de la misma expresión sin llamar a la GPU.

Seguimiento: [TODO](../TODO.md), [auditoría §§08, 12, 16](ARGON_AUDITORIA.md).

## Identidad visual y hojas de expresiones importadas (2026-11-05/06)

En **Creator Studio → Personajes** se configura `visual_dna` independiente de la personalidad del narrador. Sus etiquetas normalizadas y semilla se fijan al guardarlas (si no estaban establecidas); los modelos LoRA se registran por nombre sin ruta y peso, pero **no se cargan ni se ejecutan**. Los datos viajan como parte del JSON de cada NPC en el canon, instantáneas, bifurcaciones y backups existentes.

**Importación de hoja**: en **Creator Studio → Imágenes**, selecciona el NPC, describe el contexto de la escena, elige pose y una fila de cinco (1 × 5) o columna de cinco (5 × 1). El PNG/WebP debe ser transparente, con cinco celdas de tamaño igual y ninguna celda vacía; orden: neutral → alegría → enojo → tristeza → sorpresa. Se crean cinco PNG RGBA y metadatos `foreground` asociados al NPC de la misma historia. Puedes importar otra hoja para otra pose sin sustituir la primera. Los archivos se preparan antes de insertar el conjunto en SQLite; un fallo SQL revierte los registros y elimina los archivos de esta operación.

Ruta: `POST /api/v1/stories/{id}/creator/characters/{character_id}/expression-sheet` (multipart `caption`, `pose`, `layout`, `file`). Respuesta `201` con `assets[]` y `count:5`. La selección de variante por el lector continúa siendo heurística y necesita captions compatibles con el texto narrado. Importar no genera recursos con IA ni garantiza consistencia artística entre dibujos distintos.

### Vinculación de NPC a fichas visuales

La sección **Personajes** ofrece el selector **Ficha visual vinculada**. Esta ficha pertenece a la Galería de la misma historia; su UUID une el NPC narrativo con el personaje del plan de escena. Cuando un autor utiliza un elenco explícito, la guía textual de ADN solo se añade a esos UUID vinculados y presentes; una coincidencia del nombre por sí sola no introduce otro personaje. El enlace no genera arte ni instala LoRA.

## LoRAs de NPC para nuevas ilustraciones

Desde Personajes, especifica un nombre de LoRA simple (`.safetensors`) y su intensidad; enlaza la ficha visual cuando el reparto de escena use UUID. El lector puede consultar los archivos que ComfyUI reconoce y activar manualmente la carga de hasta tres LoRAs por ilustración. Al avanzar turnos o cambiar de historia no se ejecuta difusión. Los resultados conservan sus LoRAs/intensidades en la galería. [Detalles](COMFY_LORAS.md).
