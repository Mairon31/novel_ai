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

Editor de capas de personajes, varias expresiones por NPC, selección manual de escena, recorte del fondo automático, reglas de transición explícitas y validación de múltiples personajes. El diseño usa principios generales documentados por Isekai Zero, sin tomar sus recursos de imagen.

## Seguridad y evolución según auditoría Argon (2026-11-05)

- **Endurecimiento implementado en `master`:** los paths de recursos exigen UUID canónicos, tipo válido y directorio resuelto dentro del espacio administrado. Los enlaces simbólicos que desvíen archivos fuera de `story-assets` son rechazados, incluidos al acceder a registros antiguos importados. Ver `tests/test_creator_media.py::test_owned_asset_paths_reject_traversal_and_symlinked_directories` y [CI](https://github.com/Mairon31/novel_ai/actions/runs/41994792794).
- **Fase P1:** asociar a cada personaje una hoja de expresiones `neutral/joy/anger/sadness/surprise` con IDs de assets, poses y metadatos; separar portada, fondo, sprite y CG, manteniendo referencias al ramificar.
- **Fase P2:** importación/exportación de Character Card PNG V2/V3 (`chara`/`ccv3`), drag-and-drop, campos mapeados, Lorebook incrustado y límites de bytes/chunks; no ejecutar scripts ni suponer que un PNG contiene JSON seguro.
- **Validación:** pruebas de permisos de historia, symlink, traversal, clonación, borrado seguro, roundtrip de tarjetas y reproducción de la misma expresión sin llamar a la GPU.

Seguimiento: [TODO](../TODO.md), [auditoría §§08, 12, 16](ARGON_AUDITORIA.md).
