# Noble AI — Investigación de flujos de Isekai Zero

> Documento de investigación de producto. No es un informe de avance ni una especificación de API de Isekai Zero.

## Fuentes analizadas

- [Documentación oficial](https://docs.isekaizero.ai/shelves/english)
- [Storyline Creation Guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/storyline-creation-guide)
- [Character Creation Guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/character-creation-guide)
- [Visual Novel Mode](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/visual-novel-mode)
- [Prepare a storyline for visual novel mode](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/how-to-get-your-storyline-ready-for-visual-novel-mode)
- [Summarization and Arc](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/summarization-and-arc)

También se compararon las capturas del flujo de jugador compartidas por el usuario: pantalla de elección/nombre del personaje, escena y texto narrativo, panel de ajustes y vista adaptada a teléfono. Son **referencias de interacción**, no recursos gráficos reutilizables.

## Hallazgos: dos experiencias distintas

**Creator / Author:** la creación contempla una ficha general de historia, presentación para jugadores, configuración privada de historia y comportamiento de IA, personajes, imágenes, mensajes de apertura y metadatos. La creación y administración de obras ocurre en un espacio propio.

**Player / Reader:** primero se elige a qué personaje se interpreta (persona/player), luego se entra a la historia. La interfaz de novela visual mantiene la narración como centro, con imagen/escena de apoyo, controles para continuar/reintentar/editar y un panel secundario de configuración. Una lista de otras historias **no** debe invadir el espacio de lectura.

Estas observaciones se implementan en Noble AI por separación de páginas, no reproduciendo imágenes, marcas, personajes ni textos de Isekai Zero.

## Datos del creador y su relación con la generación

| Concepto | Propósito | Tratamiento propuesto en Noble AI |
|---|---|---|
| Título, género, tags | Descubrimiento y organización | Metadatos de historia |
| Sinopsis | Presentación al jugador | `synopsis`, **no** inyectar secretos |
| Trama visible | El punto de partida que conoce el jugador | `player_plot` / texto público |
| Plot privado de la IA | Historia del mundo, reglas y secretos | `ai_plot` en el mensaje de sistema |
| Directrices del autor | Voz, ritmo, decisiones que la IA no debe apropiarse | `guidelines` en contexto del narrador |
| Recordatorios | Reglas que deben seguir vigentes | `reminder` persistente |
| Mensajes de apertura | Variantes del comienzo para elegir antes del turno 1 | `opening_scenarios` (0–6) |
| NPCs | Motivación, personalidad y forma de hablar | `creator_characters` con ejemplos de diálogo |
| Persona / protagonista | Identidad y control del jugador | `protagonist_name` distinto de NPC |
| Representación visual | Escenas, fondos, personaje, expresiones | `scene_plans`, `visual_characters` y `creator_media_assets`; composición básica implementada |
| Memoria | Conservar acontecimientos importantes entre capítulos | Canon editado a mano; resúmenes por capítulo y arco por implementar |

La documentación de Isekai Zero distingue texto para el usuario del contenido orientado al modelo. Noble AI **no** debe incluir en la introducción visible todos los secretos del `ai_plot`, ni permitir que la IA dicte las decisiones de la persona interpretada.

## Recomendación de arquitectura del contexto

La construcción del mensaje de narración sigue este orden lógico:

1. **Reglas base** del sistema: control del protagonista en manos del jugador, límites de rol del narrador y estructura de respuesta.
2. **Preferencias de idioma y estilo**: configuración de usuario, no una acción de juego.
3. **Premisa y canon confirmado**: hechos persistentes; los datos del autor complementan el canon, no lo sustituyen.
4. **Biblia del autor (privada)**: trama AI, directrices, NPCs y recordatorio.
5. **Memoria a largo plazo**: resúmenes de capítulos y arcos revisables, cuando exista el subsistema.
6. **Historial reciente**: ventana de mensajes con presupuesto de contexto.
7. **Acción del jugador actual**: último mensaje de usuario, conservado textualmente.

Una auditoría del código anterior detectó que el paso 7 estaba sobrescrito por la cadena «Idioma de salida obligatorio». Se corrigió conservando variables separadas para la acción y las preferencias. Las pruebas verifican explícitamente que la última acción esté presente.

## Separación de vistas

- **Biblioteca:** carátulas/historias; no inicializar automáticamente el primer lector ni renderizar el historial entero.
- **Lector:** usar el ancho y alto de la ventana, composición legible, panel secundario ocultable, navegación para regresar a biblioteca. No mostrar el listado de obras.
- **Creator Studio:** administrar historias por proyecto, con secciones **Trama y contexto**, **Personajes** y **Aperturas**. No generar narración ni llamar a la GPU por editar.
- **Model Hub:** cuadro de resultados, ficha de detalle y una recomendación de cuantización basada en el equipo.
- **Configuración:** separar proveedores, idiomas, experiencia de lectura, runtime, almacenamiento y conexión.

## Imágenes: arquitectura para una novela visual real

Una imagen ilustrativa por historia no equivale a un sistema de novela visual. El diseño completo debería permitir:

- Fondo de la ubicación, separado del personaje.
- Sprites en primer plano por personaje, expresión, pose, vestuario y posición en pantalla.
- Vincular imágenes existentes a un evento/escena sin regenerarlas.
- Captions/condiciones para seleccionar escenario y expresión, con confirmación del creador.
- Generación de assets opcional bajo demanda; no disparar difusión al pasar de capítulo.
- Referencias visuales persistentes y, para identidad real, un adaptador IPAdapter/FaceID/LoRA validado.
- Galería independiente por escena y por personaje, no una sola imagen global.

Noble AI tiene planificador, galería de versiones y fichas de referencia; el compositor de sprites por captions ya está implementado; todavía faltan expresiones múltiples, editor de capas y triggers semánticos.

## Memoria: capítulos y arcos

La documentación oficial describe resúmenes periódicos (por capítulos y agrupación en arcos) para controlar contexto. La propuesta para Noble AI incluye artefactos editables por autor/jugador, asociaciones con IDs de turnos, reversiones, auditoría de origen y verificación contra contradicciones. **No** deben inventarse hechos que el narrador nunca generó.

## Límites y atribución

La implementación se inspira en **interacciones y separación de funciones**, no copia código, gráficos, nombres de personajes, textos de las historias ni identidad visual de Isekai Zero. Los flujos observados en las imágenes aportadas son ejemplos de UX, no evidencia de una implementación interna específica.

Mantener las especificaciones propias y contrastar los contratos con la documentación oficial al desarrollar funciones nuevas.

## Actualización de investigación — 2026-11-04

Se verificaron las guías oficiales de creación de historias, personajes y novela visual. Isekai Zero separa la sinopsis de la trama visible, el prompt privado, las directrices y recordatorios; permite varias aperturas y campos opcionales de personaje jugable. Para los recursos visuales distingue fondos de localizaciones y personajes transparentes en primer plano, con captions para seleccionar una imagen al producirse un evento.

Correspondencia actual de Noble AI:
- Creator Studio: títulos, sinopsis, trama pública, contexto de IA, directrices, recordatorio, NPC y aperturas.
- Biblioteca y lector: colecciones y lectura separados; el lector muestra imágenes sobre el escenario, no una lista de historias.
- Medios del autor: fondos WebP, sprites PNG alfa, nombres, captions y vinculación opcional a NPC; selección por coincidencia lexical en el último turno guardado. Es un algoritmo propio, no un componente de Isekai Zero.
- Model Hub: catálogo con detalle, variantes GGUF y memoria estimada por CPU, GPU completa y combinación GPU+RAM.

Diferencias pendientes: portada independiente de la historia, elenco de varias personas simultáneas, selector avanzado de expresión/pose, editor por capas, perfiles de personaje jugable, resúmenes por capítulo/arco y publicación multiusuario. La publicación pública de Isekai Zero incluye controles y revisión que Noble AI no ofrece por tratarse de una app local.

Fuentes verificadas:
- https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/storyline-creation-guide
- https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/character-creation-guide
- https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/visual-novel-mode

No se copiaron gráficos ni código de Isekai Zero; la documentación pública describe una experiencia, no sus algoritmos internos.
