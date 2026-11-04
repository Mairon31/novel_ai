# Noble AI — pruebas opcionales en Google Colab

**Estado:** herramienta de laboratorio, no interfaz del producto. [ADR-002](adr/0002-app-first-model-hub.md) reemplazó la antigua estrategia de "Colab primero".

## Diseño actual

**El usuario final abrirá una aplicación visual.** Podrá buscar, descargar, seleccionar e instalar modelos en el Model Hub, escoger hardware y parámetros en Ajustes y jugar una historia sin visitar Colab.

El notebook de P0 existe para **comprobar entornos experimentales** y ejecutar pruebas reproducibles con GPUs disponibles, no para configurar antes de cada ejecución ni para operar Noble AI desde celdas. Las sesiones de Colab son efímeras y el hardware no está garantizado. Colab gratuito restringe la interacción principalmente mediante una web UI remota; no habilitamos túneles/anti-AFK para evitar sus límites. Fuente: https://research.google.com/colaboratory/intl/es/faq.html

## Qué se permite en el notebook P0

- Clonar un commit y registrar hardware, Python/CUDA/torch, VRAM, disco, versionado.
- Ejecutar tests estructurales/documentales existentes.
- Probar inferencia real *pequeña* con `Qwen/Qwen3-1.7B` si hay GPU (no representa al narrador de producción ni certifica GGUF/ComfyUI/TTS).
- Exportar JSON de evidencia `PASS/FAIL/SKIP/NOT_RUN`.
- Probar **separadamente** motores del backend a nivel de API cuando existan.
- No descargar modelos para cada usuario de la aplicación ni convertir Colab en servidor permanente.

## Flujo principal de desarrollo/uso

1. Construir frontend + backend local con setup visual.
2. Ejecutar pruebas automáticas en GitHub Actions; sin GPU si no hace falta.
3. Probar en Windows/NVIDIA el wizard → buscar HF → instalar/importar modelo → asignar → cargar LLM → generar relato.
4. Para cargas pesadas o diagnóstico comparativo, ejecutar el notebook en Colab de manera **optativa**. Guardar hashes, scripts, GPUs y logs para comparar, sin confundirlo con distribución.
5. Preparar shell Tauri Windows una vez que la web local funciona.

## Gates de Colab opcionales

- `COLAB_DIAG`: diagnóstico, con evidencia y estado real.
- `COLAB_CONTRACT`: tests de proyecto una vez implementados.
- `COLAB_LLM_GGUF_REAL`, `COLAB_IMAGE_REAL`, `COLAB_TTS_MANUAL`: **no realizados** hasta verificar los proveedores.
- `WINDOWS_16GB`, `WINDOWS_12GB`: independientes de Colab; se exige medición física de cada perfil antes de validar.

El notebook actual de P0 es un artefacto de diagnóstico; mantenerlo compatible con el repositorio, pero **no bloquear** la implementación de UI ni la primera historia por una sesión Colab no ejecutada.

Enlaces: [Notebook P0](../notebooks/noble_ai_colab_smoke.ipynb), [Model Hub](MODEL_HUB.md), [Desktop](DESKTOP_Y_DESPLIEGUE.md), [QA](QA_Y_ACEPTACION.md).
