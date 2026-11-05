# Noble AI — Control de recursos GPU

Noble AI separa el **estado medido de VRAM** de las **estimaciones de consumo de modelos**. El primer dato puede consultarse mediante `nvidia-smi`; el segundo depende de checkpoint, cuantización, contexto, kernels, batch y concurrencia, por lo que no se deduce con seguridad de una sola lectura.

## Monitor de recursos

`GET /api/v1/resources/status` devuelve la memoria total, usada y libre de cada GPU NVIDIA detectada, porcentaje de utilización observado y la política activa. No inicia modelos ni corre benchmarks.

La configuración persiste en `data/noble.sqlite` y se ajusta en la interfaz:

- `mode=monitor` (valor inicial): observa sin bloquear.
- `mode=guard`: antes de una **nueva** solicitud de ComfyUI compara la VRAM libre observada en el índice elegido con `minimum_free_mib`. Si es inferior, devuelve HTTP 409, sin enviar la petición.
- `allow_low_vram=true` en una solicitud permite una excepción puntual. No modifica la política general.
- Si la GPU configurada no existe o falta `nvidia-smi`, el estado es `unknown`; no impide ejecutar motores por CPU o hardware distinto de NVIDIA.

La gestión es deliberadamente conservadora: no detiene KoboldCpp, Ollama, ComfyUI ni aplicaciones de terceros; tampoco cambia el presupuesto de CUDA ni promete que un checkpoint quepa.

## Lo que falta para un scheduler completo

Los procesos LLM, ComfyUI y Piper pueden ejecutarse fuera de Noble AI. Un scheduler con transferencia real de memoria requerirá integración por motor, confirmación de propiedad del proceso, liberación de tensores/cachés y estado observable antes y después. Por ahora **solo la admisión de ComfyUI** utiliza el guard de VRAM. La elección de modelos y el offload siguen bajo control del usuario y del motor conectado.

## Pruebas

`tests/test_resource_policy.py` simula salidas de `nvidia-smi`, ausencia de GPU y distintos estados de memoria. Verifica monitor, bloqueo configurado, excepción explícita y persistencia tras reiniciar la API. No representa una prueba de rendimiento en GPU física.
