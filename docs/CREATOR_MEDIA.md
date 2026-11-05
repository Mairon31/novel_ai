# Noble AI — Medios visuales para autores

El módulo Creator Studio → Imágenes permite componer una novela visual utilizando archivos del creador, sin cargar ComfyUI ni otro modelo para elegir la ilustración.

## Importación

Abre Creator Studio, elige un proyecto y entra en Imágenes. Selecciona un Fondo de escenario o Personaje / primer plano. Escribe un nombre y una descripción breve (caption), como «castillo iluminado en la ciudad» o «Aira sonríe en el castillo». Puedes vincular el retrato a un NPC de la misma historia.

Los archivos admitidos son PNG, JPEG y WebP hasta 12 MiB. Se comprueba la imagen con Pillow y se limita la resolución. El fondo queda como WebP RGB y el primer plano como PNG RGBA para conservar la transparencia.

## Selección durante la lectura

El lector consulta una ruta específica de presentación que examina la ubicación actual y el texto del último turno narrado. Compara palabras completas, requiere coincidencias múltiples en captions descriptivas y exige que un NPC vinculado aparezca explícitamente en la narración. Cuando coincide un fondo, se muestra en el escenario. Cuando coincide un primer plano, se superpone sobre él. Si no hay coincidencia, conserva la ilustración de historia ya existente o la escena vacía.

La operación usa archivos locales guardados. No solicita generación ni descarga de modelos, y no envía automáticamente la narración a terceros. La coincidencia lexical todavía puede fallar con sinónimos o expresiones ambiguas; no constituye clasificación semántica.

## API

- GET /api/v1/stories/{id}/creator/assets — lista de recursos y URLs.
- POST /api/v1/stories/{id}/creator/assets — multipart con kind, label, caption, file y character_id opcional.
- GET /api/v1/stories/{id}/creator/assets/scene — background, foreground y selection.
- GET /api/v1/stories/{id}/creator/assets/{asset_id}/file — entrega el archivo validado según su historia.
- PUT /api/v1/stories/{id}/creator/assets/{asset_id} — actualiza nombre y caption.
- DELETE /api/v1/stories/{id}/creator/assets/{asset_id} — elimina el recurso.

Tabla SQLite: creator_media_assets. Al crear una rama se copian los archivos con UUID propios y se remapea la asociación del personaje.

## Próximas mejoras de este módulo

Editor de capas de personajes, varias expresiones por NPC, selección manual de escena, recorte del fondo automático, reglas de transición explícitas y validación de múltiples personajes. El diseño usa principios generales documentados por Isekai Zero, sin tomar sus recursos de imagen.
