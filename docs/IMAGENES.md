# Diseño de generación progresiva de ilustraciones

Estado: v0.1 — no implementado. Proveedor principal: ComfyUI.

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
| Primer acceso a historia sin ilustración | Mostrar portada o fondo neutro y encolar escena inicial en segundo plano **si imágenes están habilitadas** |
| Llega un nuevo personaje nunca visto | Reutilizar retrato si existe; sino planificar sprite al revelarse visualmente |
| Personaje cambia solo de emoción | Usar variante existente; generar solo si se pidió expresamente o falta una variante importante |
| Se cambia de localización | Buscar fondo compatible; si no existe, encolar fondo |
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
