# Colab QA v1.4 — primera inferencia GPU real de Noble AI

**Evidencia:** ZIP `Noble_AI_Colab_QA_v1_4.zip` suministrado por el usuario durante la revisión de Noble AI.
**Fecha:** 2026-11-04 (Costa Rica) / 2026-11-05 UTC.
**Commit ensayado:** `191a71ec428b23effaafec108f675976317f97e4`.
**Procedimiento:** notebook `notebooks/noble_ai_colab_qa_integral_v1_4.ipynb`, GPU de Google Colab, FastAPI local y servidor llama.cpp CUDA.
**Duración:** 279,4 segundos (4 minutos y 39 segundos).

## Resultado global

**20 PASS, 0 FAIL, 0 SKIP**, según el `report.json` enviado. El informe guarda `version: "1.3"` aunque procede de v1.4: es un error de metadatos heredado del notebook, **no del ensayo**. El nombre de ZIP, el directorio y los commits confirman que se ejecutó v1.4.

| Comprobación | Resultado |
|---|---|
| Dependencias y 42 pruebas Python | PASS |
| Frontend React/Vite | PASS |
| FastAPI + interfaz web compilada | PASS |
| Playwright desktop/móvil, 8 pruebas | PASS, **LLM simulado en estos tests** |
| Descarga binarios oficiales llama.cpp b12119 / CUDA 12.8 | PASS, SHA256 verificado |
| `ldd` y bibliotecas | PASS |
| Catálogo Hugging Face + GGUF | PASS, SHA de revisión y archivo registrados |
| Carga del motor + API de narración | PASS |
| Tres generaciones narrativas con el LLM real | **PASS (3/3)** |
| Generación automática de imágenes, TTS | **NO EVALUADOS / no implementados** |

### Entorno y artefactos

- GPU **NVIDIA Tesla T4**, VRAM total **15.360 MiB** (15 GiB).
- Python **3.13.16**.
- GGUF **Qwen3-4B-Instruct-2507 Q4_K_M** del repositorio `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF`.
- Revisión HF: `ae44f08e1392f39c0e474af10c3ff8355c8b6688`.
- Archivo: `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf`.
- Tamaño **2.381,59 MiB** (aprox. 2,33 GiB).
- SHA256 archivo: `2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e`.
- VRAM máxima observada mediante muestreo: **3.161 MiB** (20,58% de capacidad).
- Utilización GPU máxima observada: **96%**.
- No hay medición fiable de tokens/s (el stream no informa conteo de tokens). La longitud de respuesta está en caracteres.

### Rendimiento de la API Noble AI

| Turno | Resultado | Tiempo primer contenido (TTFT) | Tiempo total | Caracteres |
|---|---|---:|---:|---:|
| 1 | PASS | 51.255,2 ms | 53.528,8 ms | 490 |
| 2 | PASS | 159,0 ms | 2.431,2 ms | 547 |
| 3 | PASS | 146,1 ms | 2.430,7 ms | 560 |

**Interpretación:** la primera respuesta tras cargar el motor tuvo una espera muy alta, probablemente asociada al arranque en frío / preparación de inferencia, pero sin un log bruto del motor no puede aislarse la causa. Las dos respuestas posteriores completaron en aproximadamente 2,43 s, con TTFT 146–159 ms. Un percentil 95 de **46.145,6 ms**, calculado mezclando las tres, **no representa** la latencia típica con el motor ya activo. Se necesitan más muestras tras calentamiento y separar ambas fases. TTFT es primer fragmento de contenido de la API principal, no un conteo de tokens del motor.

El modelo fue anunciado por `/v1/models` unos **54 segundos** después del inicio del proceso (según marcas de etapa de notebook; no se mide por separado el primer kernel CUDA). Por tanto la primera experiencia tras instalar/lanzar un modelo fue sustancialmente más lenta que los turnos siguientes.

### Evidencia UI

El ZIP contiene capturas y trazas de Playwright desktop y móvil: Model Hub, catálogo, lector, workers y diagnóstico. En el lector se ve una **ilustración de reserva**, sin generación visual real; el contenido narrativo de la captura es una respuesta **simulada**. El ensayo GPU posterior sí probó la ruta real FastAPI → llama.cpp con 3 turnos y confirmación de `done`. Los archivos brutos de inferencia no se exportan, por lo que **no puede auditarse la calidad literaria o fidelidad al español latinoamericano a partir de este ZIP**.

## Gates y límites

**Alcanzado:** integración del primer LLM GGUF 4B en Colab T4, streaming de tres respuestas y capacidad de recopilar métricas reproducibles. El checkpoint P1.2 de inferencia remota específicamente por túnel Cloudflare **sigue pendiente**, puesto que este ensayo utilizó llama.cpp local dentro de Colab (sin un worker externo).

**Pendiente:** separar calentamiento inicial / estado estable con más muestras; medir tokens reales y calidad narrativa; ejecutar en hardware de 12 y 16 GB del usuario; despliegue real con worker de red; generar imágenes con ComfyUI; sintetizar TTS; empaquetar el instalador Windows.

## Próximas decisiones de producto

1. Mostrar estado **Preparando modelo** y progreso antes del primer turno; evitar que un tiempo de inicialización de 51 s se interprete como aplicación bloqueada.
2. Tratar primer TTFT como **cold**, y las posteriores como **warm**; no mezclar ambos en percentiles de experiencia estable.
3. Comparar distintos checkpoints/quant y contextos, pero **no** inferir que un GGUF 24B cabe en la T4 solo por medir 3.161 MiB con un 4B.
4. Evaluar el texto de escenas sintéticas, memoria y consistencia mediante un test separado de calidad. El ZIP actual solo informa métricas.
5. Mantener la app local como producto principal; Colab es laboratorio opcional, no dependencia obligatoria.

**Fuente interna:** `report.json`, `RESUMEN.md`, `modelo.json`, `logs/browser_tests.log` y capturas del ZIP del ensayo. No se han cargado textos privados ni los logs completos al repositorio.
