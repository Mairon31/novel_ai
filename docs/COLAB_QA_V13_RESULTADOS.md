# Google Colab QA — segundo ensayo real (v1.3)

**Fecha de los registros:** 2026-11-05 UTC (2026-11-04 en Costa Rica).
**Evidencia:** ZIP de diagnóstico v1.3 facilitado por el usuario en la conversación.
**Commit ejecutado:** `2d1d40d1c3db80a7291397f8a66049dadbd2b02e`.
**Alcance:** este informe solo resume datos técnicos no sensibles; no publica el ZIP ni el contenido del directorio de historias.

## Resultado

Duración total **178,7 segundos** (2 min 59 s). **13 PASS, 1 FAIL, 1 SKIP**.

| Etapa | Resultado | Evidencia |
|---|---|---|
| Obtener repo | PASS | 2 segundos |
| Instalar Python | PASS | 4 segundos |
| Tests Python | PASS | 37 tests, 5,280 segundos |
| Dependencias frontend | PASS | 16 segundos; se corrigió `npm ci` |
| Build React/Vite | PASS | 12 segundos, 1586 módulos transformados |
| FastAPI + UI compilada | PASS | Health y página HTML |
| Instalar Chromium Playwright | PASS | 58 segundos |
| QA navegador escritorio y móvil | PASS | 8/8 pruebas, 25,3 segundos |
| Binarios oficiales llama.cpp CUDA 12.8 | PASS | 44 segundos; ambos SHA256 verificados |
| Resolución dinámica de bibliotecas | PASS | No faltan bibliotecas según `ldd` |
| Paquete Hugging Face | PASS | 2 segundos |
| Descargar GGUF | **FAIL** | 404 en el archivo especificado |
| Benchmark GPU | SKIP | Sin modelo descargado |

**Hardware:** NVIDIA Tesla T4 (15.360 MiB VRAM), Python 3.13.16, disco libre inicial ~112,54 GiB. **No hay TTFT, tokens por segundo o consumo GPU durante inferencia**, ya que el modelo nunca llegó a descargarse ni cargarse. Las capturas de QA sí muestran la interfaz funcional en escritorio y móvil, pero la generación narrativa sigue simulada durante Playwright.

## Causa raíz del único fallo

El notebook solicitó el archivo inexistente:

`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`

El repositorio de Hugging Face `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF` publica en realidad:

`Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf`

La diferencia es el **prefijo `Qwen_`**. El endpoint de Hugging Face respondió HTTP 404 inmediatamente. **No implica problema de CUDA, Tesla T4, VRAM ni de velocidad de descarga.**

La lista oficial de archivos del repositorio demuestra la existencia del archivo correcto:
https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/tree/main

## Corrección implementada (v1.4)

- Nuevo notebook independiente: [Noble AI Colab QA v1.4](../notebooks/noble_ai_colab_qa_integral_v1_4.ipynb).
- Selección y validación de GGUF previa a la descarga usando el catálogo real de Hugging Face; evita volver a pedir archivos inexistentes.
- Si el prefijo cambia, solo se selecciona un archivo alternativo cuando su cuantización coincide **exactamente** y el candidato es único.
- Descarga anclada al SHA de revisión del repositorio de modelos y generación del SHA256 de los bytes GGUF.
- Pruebas offline para nombre exacto, variación de prefijo, cuantización ausente y ambigüedad.
- También se corrigió el notebook antiguo del worker de Colab para evitar el mismo HTTP 404.
- Carpeta de resultados separada: `/content/noble_qa_v14/` y archivo `Noble_AI_Colab_QA_v1_4.zip`.

## Pendiente

1. Ejecutar v1.4 en una GPU Colab real y comprobar la descarga del archivo (~2,5 GB), carga de llama-server y peticiones reales FastAPI → LLM.
2. Confirmar GPU usada realmente (memoria y utilización durante inferencia), que el backend SSE devuelva un turno completo y que el contexto persista.
3. Comparar TTFT, duración, errores y VRAM observada en las repeticiones.
4. Diagnóstico real de modelos de imagen, TTS y tiempos de transición GPU: aún no integrados.

**Distinción de evidencia:** la validación en GitHub Actions usa simuladores y tests de código. Solo un nuevo ZIP de Colab puede confirmar el desempeño real del LLM.
