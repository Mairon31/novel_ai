# Diseño de generación progresiva de ilustraciones

Estado: **P1.4 — adaptador ComfyUI local bajo demanda implementado**, workflow estándar integrado y almacenamiento WebP. Detección semántica avanzada de escenas, planner inteligente, LoRAs/ControlNet, workers remotos de imagen y scheduler multi-GPU siguen pendientes. **P1.5** agrega detección heurística de localizaciones, galería versionada y fichas visuales.

## Contrato de producto

**No se generarán todos los assets de una historia al crearla.** Las escenas se desarrollan con generación bajo demanda, reutilización de fondos/sprites y capacidad de continuar solo con texto. Una generación fallida nunca detiene el motor narrativo.

## Activos visuales

- **background**: lugar + clima + hora + estilo, reutilizable entre escenas.
- **portrait**: apariencia canónica de un personaje, con asset original de referencia.
- **sprite**: personaje separado/fondo transparente, pose y expresión; deriva de identidad.
- **cg**: ilustración de una escena extraordinaria, opcional y más costosa.
- **thumbnail**: miniatura de historia, generada una vez o por petición.
- **expression variant**: variación rápida de un sprite existente cuando es viable.

Cada recurso tiene `asset_id`, hash SHA-256, `story_id`, `character_id` si aplica, `appearance_revision`, `scene_revision`, modelo/hash, seed, prompt, negative prompt, LoRAs, dimensiones, workflow_hash, timestamp y licencia de modelo si corresponde.

## Reglas de planificación

| Evento | Acción por defecto |
|---|---|
| Primer acceso a historia sin ilustración | Mostrar fondo neutro; **no generar automáticamente en P1.4** |
| Llega un nuevo personaje nunca visto | Reutilizar retrato si existe; sino planificar sprite al revelarse visualmente |
| Personaje cambia solo de emoción | Usar variante existente; generar solo si se pidió expresamente o falta una variante importante |
| Se cambia de localización | Pendiente: detector de escena. **No genera automáticamente todavía** |
| Se avanza un diálogo sin cambios visuales | **No generar imagen** |
| Jugador pulsa "Ilustrar esta escena" | Crear/reusar imagen por revisión con prioridad explícita |
| Cambio de vestuario/forma | Incrementar `appearance_revision` y crear variante nueva si es visible |
| TTS pedido | No afecta al planner de imágenes |
| Reintentar turno | Nueva rama; no sobrescribir assets de rama antigua |

**Firma de caché**: hash normalizado de `art_style_version + location_id + lighting/weather + appearance_revision(s) + pose/expression + camera + image_kind + workflow_version`; se debe impedir que cambios irrelevantes (por ejemplo un simple adverbio de narración) disparen imagen.

La nueva generación tiene estados `missing / queued / running / ready / failed / cancelled`. UI conserva asset anterior hasta que se valide el nuevo. Si ya hay trabajo equivalente, reusar `job_id` y nunca encolar duplicado.

## Identidad consistente

Ficha visual canónica en lenguaje natural y atributos estructurados: color de cabello, ojos, accesorios, orejas/cuernos si aplican, atuendo, paleta y proporciones. Mantener referencia visual `portrait`, LoRA autorizado o workflow IPAdapter/ControlNet **solo cuando los nodos y checkpoints estén instalados**. No dar por hecho que un prompt solo logra consistencia perfecta. Las diferencias entre imágenes se auditan visualmente.

Para escenas con varios personajes: primero composición, reglas de identidad por personaje, guía de posiciones; si falla la asignación, preferir capas independientes o ilustración simplificada antes que presentar identidades intercambiadas.

## ComfyUI: contrato mínimo

- Exportar workflow en **formato API**, comprobar `object_info` y nodos disponibles; versionar JSON de workflow.
- Encolar vía `POST /prompt`, seguir `/ws` o polling, revisar `/history/{prompt_id}`, recuperar mediante `/view`.
- Guardar bytes con nombre determinado por hash, validar extensión/MIME, dimensiones, tamaño, integridad y hash.
- Configuración de workers independiente: modelo, LoRA, resolución, pasos, VAE, batch, backend y límite de RAM/VRAM.
- Imágenes en baja resolución para preview opcional; upscale diferido únicamente a pedido o criterio de calidad explícito.
- Retries 1–2 con backoff; OOM → marcar `failed:gpu_oom` y sugerir perfil; no bucle infinito.

## Control de VRAM

Perfiles 12/16GB con un worker de difusión como máximo; mantener LLM atendible (puede estar parcialmente en CPU). GPU scheduler impide carga simultánea no presupuestada. Si hay poco espacio, el image worker libera memoria tras completar y deja a la escena actual usando assets en RAM del navegador/disco.

## Pruebas

- 10 turnos en la misma taberna → **0 imágenes adicionales**, salvo solicitud del usuario.
- Cambio taberna → bosque → 1 fondo si no existe, 0 si cache hit.
- Dos solicitudes simultáneas de la misma escena → mismo trabajo y mismo hash.
- Una imagen que llega tarde a una rama descartada → se archiva, **no se muestra como actual**.
- ComfyUI offline → historia jugable con fallback visual, job recuperable.
- Consistencia: prueba de 10 escenas con mismo personaje, evaluación manual de identidad/ropa y metadatos.


## P1.4 — API implementada (local, solo bajo demanda)

- `GET /api/v1/images/config`: consulta configuración ComfyUI persistida.
- `PUT /api/v1/images/config`: valida endpoint HTTP loopback y parámetros, incluido checkpoint, tamaño, pasos, CFG y prompt negativo.
- `GET /api/v1/images/status`: consulta `GET /models/checkpoints` del ComfyUI local al pulsar «Buscar checkpoints».
- `POST /api/v1/stories/{uuid}/illustrate`: acepta `{"prompt":"...","seed":123}` (seed opcional), ejecuta el workflow estándar `CheckpointLoaderSimple` → `CLIPTextEncode` → `EmptyLatentImage` → `KSampler` → `VAEDecode` → `SaveImage`.
- Descarga del resultado mediante `/view`, validación Pillow y guardado WebP en `story-assets/{uuid}/scene.webp`, únicamente cuando el resultado es válido.
- Cola simple de **una solicitud simultánea**; si está ocupado devuelve 409 en lugar de sobrecargar GPU.
- El narrador nunca llama a ComfyUI al crear, abrir o continuar historias. El usuario debe pulsar «Ilustrar» y escribir el prompt.
- La generación que falla no elimina ni sobrescribe una ilustración previa.
- Workflow compatible principalmente con checkpoints que soportan los nodos estándar. Flux/SD3 y pipelines personalizados requieren plantillas específicas; no se afirma soporte universal.
- Los tests con ComfyUI simulado validan flujo HTTP y una imagen real decodificada mediante Pillow; falta probar un motor ComfyUI con GPU física.


## P1.5 — modelo de datos y cambios entregados

**Registro de escenas:** SQLite `visual_scenes` almacena `id`, `story_id`, `location`, `source_turn_id`, `detection` (`initial`, `heuristic`, `confirmed`) y fecha. Cada turno guardado se inspecciona **después** de producir narración: solo viajes/entradas con verbos en pasado y nombres de lugares conocidos disparan una nueva escena. No se consulta otro LLM ni se encola una imagen. Diálogos citados y negaciones evidentes se excluyen. El usuario puede confirmar o corregir el lugar en la galería. Como clasificador basado en expresiones regulares, todavía puede perder o interpretar mal cambios sutiles.

**Ilustraciones inmutables:** SQLite `visual_assets` incluye UUID, escena asociada, origen, prompt final, checkpoint, seed, SHA256 y firma determinista de configuración. Los archivos se conservan en `story-assets/<story_id>/images/<asset_uuid>.webp`; `scene.webp` funciona como puntero de compatibilidad al asset activo. `visual_current` determina qué imagen ve el lector. Cambiar la imagen activa no borra versiones anteriores. Las historias que solo tengan `scene.webp` migran al acceder a `visual-state`.

**Firma exacta de caché:** SHA256 de `scene_id + prompt enriquecido + checkpoint + configuración de difusión + seed + workflow_version`. Solo se busca la caché cuando el usuario proporciona una semilla; con semilla aleatoria se genera una versión nueva. Si el motor no está disponible y hay un recurso válido idéntico, se reutiliza sin conexión. Cambiar escenario o atributos de personaje nombrado invalida la firma.

**Identidad textual:** SQLite `visual_characters` almacena nombre, apariencia, vestuario, rasgos, revisión. Solo las fichas cuyos nombres aparecen en el prompt se incorporan a la escena. No hay embeddings visuales, IPAdapter, referencias de imagen, ControlNet ni garantías de rostro/ropa; las fotos consistentes deberán comprobarse con GPU real.

**Ramas de historia:** al bifurcar se clonan los recursos aplicables, escenas anteriores y fichas en espacio independiente. Una rama iniciada en un turno antiguo no muestra imágenes de escenarios posteriores. El canon y los perfiles son editables por rama.

### Rutas de la API P1.5

- `GET /api/v1/stories/{id}/visual-state`: devuelve escenas, escena actual, galería y fichas.
- `PUT /api/v1/stories/{id}/scene`: confirma una ubicación, sin generar imagen.
- `POST /api/v1/stories/{id}/visual-characters` y `PUT /.../visual-characters/{character_id}`: crea/actualiza rasgos.
- `POST /api/v1/stories/{id}/illustration-prompt`: muestra el prompt enriquecido, sin inferencia.
- `GET /api/v1/stories/{id}/gallery/{asset_id}`: entrega una versión WebP perteneciente a esa historia.
- `POST /api/v1/stories/{id}/gallery/{asset_id}/select`: selecciona una versión guardada.
- `POST /api/v1/stories/{id}/illustrate`: devuelve además `asset_id` y `cached`; cada respuesta nueva conserva su propia versión.

**Pruebas:** SQLite y Pillow reales para versión, sustitución, restauración, aislamiento entre historias, migración y bifurcación; transporte ComfyUI simulado para difusión/retorno y reutilización; Playwright desktop/móvil para la interfaz. **No son benchmarks de GPU.**


## ComfyUI img2img con una imagen guardada

Se puede usar cualquier imagen WebP de la galería de **la misma historia** como referencia visual de una nueva ilustración. Esta función utiliza únicamente nodos estándar: `LoadImage` → `VAEEncode` → `KSampler` (denoise configurable) → `VAEDecode` → `SaveImage`.

- En **Biblioteca → Galería**, importa una ilustración o selecciona una versión archivada. En el formulario «Ilustrar» selecciona «Imagen de referencia» y ajusta **Transformación de la referencia** entre 20% y 95%. Un valor bajo busca conservar más su composición.
- El backend verifica que la imagen pertenece a la misma historia y que el SHA256 almacenado coincide con sus bytes actuales. Después prepara un PNG al tamaño del checkpoint, lo sube al ComfyUI local mediante `POST /upload/image`, comprueba el nombre devuelto y envía el grafo img2img a `POST /prompt`.
- Las imágenes resultantes conservan su propia versión independiente; la fotografía de referencia nunca se sobrescribe. El cache de inferencia incorpora el SHA256 de referencia y el nivel de denoise.
- La identidad visual aproximada deriva del contenido de la referencia y las instrucciones del prompt. Esto es **img2img clásico, no IPAdapter, InstantID, FaceID ni entrenamiento LoRA**. No se promete preservación exacta del rostro.
- No se exige realizar nuevas instalaciones de nodos personalizados, pero el checkpoint seleccionado sí debe ser compatible con los nodos estándar y VAEEncode.

### Supervisión de VRAM por GPU

Con `nvidia-smi` disponible, Noble AI puede leer la VRAM global libre en MiB. **Configuración → Imágenes y voz → Memoria GPU y admisión** permite elegir `Solo supervisar` o `Bloquear si hay menos VRAM que la reserva`, además del índice de GPU y el mínimo libre. La reserva es un umbral definido por el usuario, no una estimación del consumo de un modelo.

- En `monitor` (predeterminado) muestra los valores y no bloquea.
- En `guard` devuelve HTTP 409 antes de contactar ComfyUI si la VRAM observada es inferior al mínimo.
- La opción «Ignorar la reserva mínima de VRAM solo para esta solicitud» permite intentar una generación específica. La opción no altera los valores persistidos.
- Si `nvidia-smi` no está disponible, el estado es `unknown` y no se bloquea a los proveedores CPU o no NVIDIA.
- La supervisión NO descarga modelos, libera la VRAM, detiene procesos, predice consumo de un checkpoint ni coordina VRAM con otro programa. Un scheduler multiproceso con offload seguirá requiriendo una implementación independiente.


## Plan visual persistente por escenario

La galería incluye ahora un editor para **composición y acción**, plano (general, medio o primer plano), iluminación, atmósfera, un reparto visible de hasta seis personajes y un protagonista de referencia. El plan es explícito y editable; no es una detección semántica de IA ni se ejecuta otro LLM en segundo plano.

- Cada plan está asociado al UUID de una escena en la tabla `scene_plans`; cambiar de ubicación abre un plan propio en blanco.
- `GET /api/v1/stories/{id}/scene-plan` devuelve un plan existente o valores iniciales sin crear imágenes.
- `PUT /api/v1/stories/{id}/scene-plan` actualiza el plan, valida que cada ID de personaje pertenezca a esa historia y que la referencia esté entre los personajes visibles. No se admiten duplicados.
- `POST /api/v1/stories/{id}/scene-plan/preview` compone un prompt sin inferencia. Los nombres y atributos de los integrantes del reparto se incorporan al prompt únicamente cuando los selecciona el usuario.
- Cada personaje puede asociar una versión visual canónica de la galería mediante `PUT /visual-characters/{id}/reference` con `{"asset_id":"uuid"}` o `{"asset_id":null}`. Se valida propiedad y SHA256 del archivo.
- Cuando un plan referencia a un personaje con una imagen asignada, ComfyUI puede utilizar automáticamente esa referencia mediante img2img, salvo que la solicitud indique otra imagen explícita. La respuesta informa `reference_asset_id` que realmente se utilizó.
- La clonación de una historia copia los planes de las escenas conservadas y remapea todos los IDs de personajes y arte. Los planes de escenas que quedaron fuera de una rama no se copian.

La referencia sigue utilizando el img2img básico de ComfyUI: una fotografía de referencia es condicionamiento espacial, pero no un identificador de rostro ni un control multi-personaje como IPAdapter. La vinculación sirve para continuidad explícita, no para prometer identidad perfecta.

## Director escénico multicapa — requisitos de Argon (2026-11-05)

**Decisión de producto:** priorizar reutilización de fondo y sprites sobre generar una imagen completa por cada turno. Las capacidades actuales de galería, fondo/primer plano del creador y plan escénico son una base, **no** un director emocional con caché por ubicación ni una hoja de sprites por NPC.

El contrato objetivo será un `VisualStageState` con `location_id`, `time_of_day`, `weather`, `lighting`, `camera_shot`, `visible_characters[]` (ID, posición, expresión, voz) y `is_climactic_cg`. El planificador deberá emitir una de estas decisiones deterministas:

- `REUSE_BACKGROUND`: mismo escenario/iluminación y recurso existente; no invocar ComfyUI.
- `UPDATE_SPRITE_EMOTION`: cambiar solo sprite del personaje y énfasis visual, sin tocar el fondo.
- `GENERATE_NEW_BACKGROUND`: no existe fondo compatible; conservar el anterior durante cola y fundir al concluir.
- `GENERATE_EVENT_CG`: imagen extraordinaria únicamente por evento narrativo o petición explícita.

La clave de caché prevista será `(location_id, time_of_day, weather, camera_shot)` con revisión del activo. Los sprites por expresión `neutral/joy/anger/sadness/surprise` se vincularán a identidad y apariencia inmutable (`visual_dna`, seed, LoRA opcional). `images.py` aceptará plantillas validadas para diferentes familias de ComfyUI y cargará referencias únicamente con consentimiento del usuario; no prometer consistencia facial perfecta.

**Criterio de aceptación:** 10 turnos sucesivos en una misma ubicación no invocan regeneración de fondo; un cambio de emoción actualiza el sprite sin llamada a ComfyUI; al cambiar de lugar, transición visible sin bloquear narración; completar QA desktop y mobile. Control de GPU serializado, sin dejar pesos innecesarios residentes. Ver [TODO](../TODO.md) y [auditoría §§12, 19](ARGON_AUDITORIA.md).

## ADN visual de Creator y hoja de sprites local

`CreatorCharacter.visual_dna` registra etiquetas inmutables de identidad (una vez fijadas), semilla opcional y nombre/intensidad de LoRA. No se inyecta todavía en `images.py`, los workflows ComfyUI ni en el prompt narrativo: separarlo de personalidad evita que la configuración visual aparezca como instrucciones ocultas de narración. Las llamadas de generación y los proveedores existentes no cambian.

`CreatorMediaService.import_expression_sheet` convierte bajo demanda un PNG/WebP alfa horizontal (1×5) o vertical (5×1) en cinco variantes `neutral/joy/anger/sadness/surprise` de un NPC identificado; cada variante sigue la caché editorial y el lector multicapa existentes. Todas las inserciones son una transacción SQLite con limpieza de archivos si se produce un error. La hoja importada es manual; ControlNet/IPAdapter, generación de hojas por IA, aplicación LoRA a checkpoints y cambios de apariencia versionados siguen pendientes.
