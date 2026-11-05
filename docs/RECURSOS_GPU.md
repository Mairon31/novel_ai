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


## Coordinación de operaciones locales

La API ahora dispone de una **exclusión mutua opcional**, `serialize_local_gpu`, activada por defecto. Solo afecta a las operaciones que Noble AI sabe que pueden competir por una GPU local: narración de Ollama/KoboldCpp en modo auto, precalentamiento local y generaciones ComfyUI nuevas (no se reserva GPU al devolver una imagen ya guardada en caché).

`GET /api/v1/resources/active` muestra una operación local activa, su tipo y hora de inicio. Cuando la exclusión está habilitada, una segunda solicitud recibe HTTP 409; la narración vía SSE devuelve un evento de error legible. Los bloqueos se liberan en `finally`, también después de errores o cancelaciones del cliente. Se pueden deshabilitar en la interfaz de ajustes, por ejemplo si los proveedores utilizan GPUs distintas.

**Límite:** esto es coordinación de **solicitudes controladas por Noble AI**, no un planificador real de memoria. No libera tensores, reinicia motores, transfiere checkpoints ni impide que otra aplicación use la misma GPU. Los workers remotos y Piper CPU permanecen fuera del bloqueo local.
