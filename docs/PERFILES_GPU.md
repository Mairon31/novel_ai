# Perfiles de hardware — 12 GB y 16 GB VRAM

**Objetivos de ingeniería, no benchmarks medidos.** Los presupuestos son estimaciones dependientes de cuantización, backend, KV/cache, context, CUDA, grafo Comfy y presencia de navegador/Windows. La compatibilidad solo se declara tras pruebas reales documentadas.

## Hardware base

- **Objetivo mínimo**: NVIDIA 12 GB VRAM, CPU moderna, RAM recomendada >=32 GB. Mantener una porción reservada para sistema/driver/contexto y no intentar llenar 100 % de VRAM.
- **Objetivo recomendado**: NVIDIA 16 GB VRAM, RAM >=32 GB (64 GB mejora offload a CPU), SSD con suficiente espacio para checkpoints/cachés.
- **PC de referencia actual**: RTX 5060 Ti 16 GB, Ryzen 7 5800XT, 64 GB DDR4, Windows 11. **Aún no ejecutó benchmarks de Noble AI.**
- **Colab**: tamaño de GPU **no garantizado** ni equivalente a una NVIDIA de escritorio; registrar tipo real en cada sesión.

## Perfiles propuestos

| Preset | LLM de prueba | Imagen | TTS | Política |
|---|---|---|---|---|
| `minimum_12gb` | Qwen3-8B GGUF Q4_K_M; contexto inicial 4096–8192 | SDXL 768–1024 (ajustar según VRAM) | lazy, prioridad explícita | CPU offload/serializar GPU |
| `recommended_16gb` | Qwen3-8B Q5/Q6; 14B Q4 **solo experimento** | SDXL/Illustrious con batch 1 | lazy | cola, un motor pesado a la vez |
| `colab_probe` | modelo de smoke pequeño, benchmark 8B si GPU lo permite | proveedor opcional, smoke separado | opcional, smoke separado | pruebas secuenciales, nunca exigir UI pública en Colab gratis |
| `cpu_fallback` | cuantizado pequeño, offload 0 GPU | imágenes deshabilitadas | deshabilitado | continuidad del texto, rendimiento no garantizado |

**Estimar VRAM antes del experimento:** 8B Q4 pesos ≈4–6 GB (+runtime/KV); 14B Q4 ≈8–10+ GB (+runtime/KV), según quant/kernel; un workflow SDXL puede ocupar varios GB adicionales. **No sumarlos como si cupieran juntos**. Las cotas no son una promesa de velocidad o memoria pico.

## Scheduling

- Narrador **siempre accesible** a nivel de API durante la sesión; si no puede permanecer completamente en VRAM se ajusta offload desde arranque.
- Cargas de GPU bajo un único **lease** de alta demanda. `interactive_text > requested_audio > requested_image > background_image`.
- Mover TTS/imagen a modo `queued` hasta liberar margen. Responder al navegador con estado inmediato.
- Diseñar presupuestos de memoria por perfil: `reserve_vram_mb` configurable, `max_image_jobs=1`, `max_tts_jobs=1`, políticas de cancelación y OOM.
- Medir memoria reservada + asignada del proveedor y total GPU; el número de VRAM físico no es memoria usable garantizada.
- Cualquier transición de modelo debe preservar state/DB, jamás truncar historia.

## Experimentos mínimos por GPU

1. Arranque de LLM; idle VRAM y RAM, contexto real, estabilidad streaming.
2. 20 turnos: p50/p95 primero token, tokens/s, peak VRAM y RAM.
3. 5 ilustraciones secuenciales de 768 y 1024; tiempos/OOM/caché.
4. 3 diálogos TTS manuales; memoria pico y calidad.
5. Narración mientras job imagen en cola; el texto no se duplica ni corrompe.
6. 30 min de uso interactivo; leaks de memoria y recuperación tras cancelación.
7. Repetir en Colab **cuando GPU real exista**, registrar SKU y runtime/driver antes de comparar.

## Plantilla de medición

| Fecha | GPU | Perfil | LLM GGUF+hash | Contexto | Img model+workflow | TTS | peak VRAM MB | peak RAM MB | tokens/s | imagen s | audio s | errores |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pendiente | — | minimum_12gb | — | — | — | — | — | — | — | — | — | No medido |

No introducir números de rendimiento fabricados. Documentar versión de driver, CUDA, torch, cuantización, offload y parámetros de inferencia.
