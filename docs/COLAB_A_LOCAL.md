# Noble AI — plan Colab primero, Windows después

Estado: v0.1, documentación y notebook de diagnóstico pendientes de validación en GPU real.

## Qué significa Colab primero

La primera validación se hace **en celdas de notebook**, con API y pruebas automatizadas reproducibles. No implica hospedar indefinidamente una web pública en Colab: las sesiones son efímeras y GPU/tipos de hardware no están garantizados. **Colab gratuito limita explícitamente el uso de una web UI como forma primaria de interacción**; evitaremos tunneling/SSH/anti-AFK para esquivar reglas. En lugar de eso, la UI se valida con Playwright en CI/local y los adaptadores se prueban desde celdas/localhost dentro del runtime. Colab pago con saldo positivo cambia algunos límites pero no garantiza GPU concreta.

Fuente oficial: https://research.google.com/colaboratory/intl/es/faq.html

## Secuencia de experimentos

**C0. Diagnóstico**: registrar `platform`, Python, torch, versión CUDA, `nvidia-smi`, nombre GPU, VRAM libre, disco libre y librerías; no falla solo porque Colab no asignó GPU.

**C1. Contratos sin GPU**: clonar Noble AI, instalar dependencias del backend cuando existan; `pytest tests/contract`; esquema DB/migraciones y lógica de ramas. Todo ejecutable en CPU.

**C2. LLM real**: instalar proveedor Linux compatible (Ollama/llama.cpp o KoboldCpp compilado con CUDA si soportado), descargar GGUF con hash y licencia; ejecutar 10 turnos de narración; verificar persistencia y respuesta. En diagnóstico se usa un modelo menor cuando hay restricciones; prueba de rendimiento con 8B por separado. **No afirmar que C2 pasó si solo se probó mock**.

**C3. Imágenes reales**: cargar ComfyUI y un workflow API mínimo, ejecutar solicitud **desde celdas** y descargar/guardar asset. No hay necesidad de web pública. Medir VRAM.

**C4. TTS real**: cargar modelo solo tras ejecutar celda/acción de síntesis manual; guardar audio de prueba y registrar métricas. El test de opt-in verifica 0 cargas antes de esa petición.

**C5. Integración**: prueba de narrativa + estado + imagen demandada + audio demandado, secuencialmente; errores de provider/timeout; artefactos y logs.

**C6. Portabilidad**: exportar manifest de dependencias, datos/escenas de prueba, resultados sin pesos; ejecutar los mismos contratos en Windows con RTX 5060 Ti y comparar.

## Diseño de notebook

`notebooks/noble_ai_colab_smoke.ipynb` será el punto de entrada; debe:
- mostrar diagnóstico sin requerir secreto/API key;
- clonar repositorio cuando se ejecute en Colab;
- correr tests presentes, sin inventar resultados;
- ejecutar un probe LLM real opcional solo cuando se configura un modelo;
- guardar `results.json` con tipo de GPU, versiones y PASS/FAIL/SKIP;
- nunca imprimir tokens de acceso o rutas privadas;
- funcionar sin GPU para C0/C1 y hacer SKIP explícito para inferencia;
- no iniciar túneles públicos automáticamente.

## Pasaje a Windows

1. Clonar mismo commit SHA, crear venv y poner configuración local `.env`.
2. KoboldCpp Windows con GGUF y CUDA, validar `http://127.0.0.1:5001/v1/models`.
3. Levantar ComfyUI y comprobar `/object_info` y workflow instalado.
4. Instalar Chatterbox en venv/worker separado; correr prueba manual ES-LA.
5. Iniciar API Noble + frontend con URLs del backend, no conectar UI directamente a motores.
6. Correr mismos contract/integration/e2e tests, medir VRAM con `nvidia-smi`.
7. Registrar diferencias entre Colab y Windows (driver, torch, CUDA, paths, checkpoints y stack).

## Artefactos transferibles

Versionar: schemas, código, tests, workflows JSON (sin datos sensibles), prompt templates, perfiles GPU, hashes, metrics JSON, fixtures con permisos. **No** versionar pesos GGUF/safetensors, exports de audio privados, claves ni datos de historia personales. Modelos en `data/models` ignorado por Git; descargas controladas por `model_manifest.json` con checksums y licencias.

## Gates

- `COLAB_DIAG`: notebook ejecutó diagnóstico (PASS o SKIP si GPU ausente, no inventar)
- `COLAB_CONTRACT`: tests reales del repo pasan
- `COLAB_LLM_REAL`: al menos una inferencia real validada
- `COLAB_IMAGE_REAL`: al menos una generación de imagen real validada
- `COLAB_TTS_MANUAL`: audio generado **solo tras solicitud**
- `WINDOWS_16GB`: misma suite en RTX 5060 Ti; log de VRAM y conclusiones

No avanzar el estado de un gate sin la salida verificable.
