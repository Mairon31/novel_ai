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
