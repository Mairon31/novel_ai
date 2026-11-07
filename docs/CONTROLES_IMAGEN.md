# Noble AI — Controles de muestreo y estética de las ilustraciones

**Estado:** primer tramo de N-21 implementado en `master`; [CI #42340226265](https://github.com/Mairon31/novel_ai/actions/runs/42340226265) aprobado (385 Python / 80 Playwright / Vite). Esto es una descripción del control local, no una prueba de calidad artística con GPU real.

## Configuración

En **Configuración → Imágenes** se mantienen los controles ComfyUI, checkpoint, dimensiones, pasos, CFG y prompt negativo. Ahora se suman:

| Campo API `/api/v1/images/config` | Valores admitidos | Efecto real |
|---|---|---|
| `sampler_name` | `euler`, `euler_ancestral`, `dpmpp_2m`, `dpmpp_sde`, `dpmpp_2m_sde`, `heun`, `uni_pc` | `KSampler.inputs.sampler_name` |
| `scheduler` | `normal`, `karras`, `exponential`, `sgm_uniform`, `simple` | `KSampler.inputs.scheduler` |
| `style_preset` | `anime_fantasy`, `anime_cinematic`, `anime_watercolor`, `none` | Condicionamiento positivo de texto aplicado al prompt visual antes de renderizar |

Los predeterminados son `euler`, `normal` y `anime_fantasy`. Los datos almacenados antes de crear estos campos siguen siendo válidos: el modelo de configuración los completa con defaults, sin migración destructiva. La lógica de grafo llamada directamente por otros módulos mantiene los antiguos valores Euler/Normal.

### Compatibilidad con el runtime

`GET /api/v1/images/sampler-options` consulta el ComfyUI realmente conectado en `/object_info/KSampler`, sin cargar modelo ni generar imagen. Devuelve `online`, `sampler_name[]`, `scheduler[]` y `error` (si corresponde). La UI informa si una selección concreta no figura entre los métodos detectados y no permite guardarla mientras la incompatibilidad confirmada persista.

La API valida de nuevo, justo antes del render, cualquier configuración **distinta** de Euler/Normal; si el runtime ha cambiado o no publica su inventario, devuelve HTTP 422 antes de ejecutar `/prompt`. En Euler/Normal se conserva el flujo legado sin dependencia obligatoria de introspección, porque puede existir un proveedor compatible con el grafo estándar que no publique ese endpoint.

La validación distingue entre métodos que acepta la API y métodos realmente disponibles. Guardar una configuración estando ComfyUI desconectado **no certifica su compatibilidad**: la generación la verificará.

### Presets anime y procedencia

`anime_fantasy` favorece ilustración 2D, escenarios de fantasía pintados y diseño coherente de personajes; `anime_cinematic` aplica encuadre/iluminación cinematográfica y `anime_watercolor` texturas acuarela. `none` deja sin modificar el prompt del planificador. El estilo se aplica en la solicitud de generación, no al texto narrativo ni a turnos ya guardados.

Se conserva el estilo, sampler y scheduler en la firma de caché y en `visual_assets.render_details_json` para trazabilidad. Los archivos/galerías anteriores sin esos campos siguen importándose; el importador rechaza valores adulterados y metadatos desconocidos. La generación no comienza solo por cambiar el desplegable.

### Pruebas y límites

- `tests/test_comfy_images.py`: persistencia, payload exacto de KSampler, prompt anime real, caché diferenciada, inventario inválido, rechazo HTTP 422 previo a la difusión y compatibilidad con valores por defecto.
- `tests/test_visual_render_provenance.py`: exportar/restaurar los parámetros de render sin permitir adulterar sampler, scheduler o preset en archivos de terceros.
- `apps/web/tests/multimedia.spec.ts`: selección desde interfaz, comprobación de compatibilidad, guardar y recuperar al alternar con Voz/TTS, con API de muestreo simulada.

**Pendiente:** prueba física ComfyUI en Windows/Colab, instalación de modelos y LoRAs desde interfaz, perfiles por historia/escena, batch/seed avanzado y calibración de rendimiento/identidad anime. Mantener las tareas maestras N-21 y N-24 sin completar.
