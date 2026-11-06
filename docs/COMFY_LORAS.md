# Noble AI — Integración de LoRAs de personajes con ComfyUI

Estado: **carga real bajo demanda implementada y verificada con transporte HTTP simulado**; validación de GPU, pesos concretos y calidad visual pendiente.

## Cómo se usa

1. Instala el LoRA compatible con tu checkpoint en `ComfyUI/models/loras` (esta primera versión admite nombres simples `.safetensors`, sin subcarpetas).
2. En **Creator Studio → Personajes**, selecciona el NPC, especifica `visual_dna.lora_name` y `lora_strength` entre 0 y 2. La aplicación efectiva exige fuerza superior a cero. Si usas un plan de escena guardado, enlaza el NPC con la ficha visual correspondiente en Galería: la selección posterior se hace por UUID, no por texto.
3. En **Lector → Galería**, pulsa **Ver LoRAs instalados**. Comprueba el catálogo que informa ComfyUI. Marca **Aplicar LoRAs de personajes** para la ilustración concreta y pulsa **Ilustrar escena con ComfyUI**. El checkbox se desactiva de nuevo al cambiar de historia.

## Flujo técnico

El backend acepta `apply_character_loras=false` por defecto. Con `true`, toma solo el reparto válido de la historia, resuelve hasta tres nombres LoRA distintos, consulta `GET /models/loras` y `GET /object_info/LoraLoader`, y valida los archivos/nodos antes de emitir `POST /prompt`. Si falta un LoRA, hay duplicidad, no existe reparto compatible o ComfyUI no soporta el nodo, se devuelve un error sin crear nuevas imágenes.

Los nodos `LoraLoader` conectan secuencialmente los puertos MODEL y CLIP desde `CheckpointLoaderSimple`; el último alimenta `KSampler` y ambos codificadores `CLIPTextEncode`. La rama img2img usa el mismo modelo, con `LoadImage` y `VAEEncode`. No se usa un nodo personalizado ni se descarga/ejecuta código arbitrario.

## Versionado, respaldos y límites

Cada render guarda `render_details_json` con `workflow_version` y la lista de `loras` (nombre de NPC, nombre de archivo, intensidad). La Galería expone esa procedencia; cambia la firma de caché si cambia la lista/intensidad. El esquema migra bases SQLite anteriores con valor `{}`, y los archivos `.noble.zip` preservan metadatos, incluidos forks y copias. Un archivo antiguo sin esta columna sigue importándose. Se rechazan metadatos malformados.

ComfyUI solo proporciona los nombres disponibles, no un digest SHA256 de pesos. Reemplazar un LoRA bajo el mismo nombre no invalida automáticamente las imágenes en caché. Los efectos de varias LoRAs son **globales al modelo y CLIP**: no asignan una región del lienzo por personaje ni garantizan mantener el mismo rostro en diez escenas. El checkpoint debe ser compatible con el LoRA, y las generaciones en GPU real siguen siendo una validación distinta.

## QA

La CI integra tests Python con transporte ComfyUI simulado y Playwright desktop/móvil. Ver `tests/test_comfy_images.py`, `tests/test_visual_render_provenance.py` y `apps/web/tests/visual-gallery.spec.ts`.

Referencia de implementación: [ComfyUI LoraLoader](https://github.com/Comfy-Org/docs/blob/main/built-in-nodes/LoraLoader.mdx). No se copió código de ese repositorio, se utiliza su contrato de nodos.
