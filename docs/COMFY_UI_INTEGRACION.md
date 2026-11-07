# Integración de ComfyUI administrado por Noble AI

**Estado:** implementación de arranque y control de una instalación **existente** publicada en `master`; CI final de esta fase pendiente. No es un instalador del código ComfyUI ni del entorno PyTorch.

## Utilizar ComfyUI sin salir de Noble AI

1. Instala ComfyUI de forma normal en el equipo o en Colab y comprueba que incluya `main.py`, `server.py`, `folder_paths.py` y `comfy/cli_args.py`. Verifica que su entorno Python tenga las dependencias de ComfyUI.
2. Abre **Configuración → Imágenes → Ejecutar ComfyUI desde Noble AI**. Indica la carpeta que contiene `main.py`, la ruta opcional de su Python (puedes dejarla vacía para detectar entorno `venv`, `.venv`, Python embebido o Python del entorno), puerto y perfil de memoria.
3. Pulsa **Validar instalación**, luego **Guardar arranque de ComfyUI** y **Iniciar ComfyUI**. No se lanza un proceso al abrir Ajustes o guardar. Se inicia en loopback `127.0.0.1` sin shell ni apertura automática de navegador.
4. Pulsa **Consultar proceso** y verifica **Listo** (el backend inspecciona `/system_stats`), o **Ver registros ComfyUI** para diagnosticar errores de Python, drivers o módulos. El límite de texto de logs es 16 KiB.
5. Noble establece automáticamente la URL `http://127.0.0.1:<puerto>` de sus ajustes de imagen, preservando checkpoint, sampler, scheduler, CFG y preset anime. Pulsa **Buscar checkpoints** y selecciona el modelo reconocido antes de **Ilustrar**.
6. **Detener ComfyUI** detiene solo la instancia que Noble inició. Una instancia externa con ese puerto produce un rechazo y nunca se adopta como proceso propio. Cuando se cierra Noble AI, también se detiene el proceso creado por él.

## Contrato de seguridad y compatibilidad

Se acepta solo una carpeta local absoluta que parezca una instalación real de ComfyUI y un ejecutable Python, no un `.bat`, ruta relativa, archivo genérico ni comandos añadidos por el usuario. El arranque construye argv explícito y fijo, sin `shell=True`, con las banderas oficiales:
```text
<python> <comfyui>/main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch --extra-model-paths-config <noble-model-paths>
```
Se agrega exactamente un modo opcional entre `--lowvram`, `--normalvram`, `--highvram` o `--cpu`. Se comprueba que el puerto no esté ocupado o reservado para servicios Noble y que los archivos del runtime existan antes de comenzar. El puerto puede cambiarse, pero los parámetros de arranque no se pueden editar mientras Noble tenga ese proceso activo. El proceso no instala dependencias, ejecuta instaladores ni descarga código.

Referencia de flags: [ComfyUI — documentación oficial de opciones de arranque](https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/startup-flags.mdx).

## API interna

| Método | Endpoint | Responsabilidad |
|---|---|---|
| GET | `/api/v1/images/runtime/config` | Devuelve `install_dir`, `python_executable`, `port`, `memory_mode` |
| POST | `/api/v1/images/runtime/validate` | Verifica rutas/ejecutable y muestra ruta de modelos (no lanza procesos) |
| PUT | `/api/v1/images/runtime/config` | Guarda preferencias SQLite del runtime |
| GET | `/api/v1/images/runtime/status` | `stopped`, `starting`, `ready` o `exited`, propiedad y PID si corresponde |
| POST | `/api/v1/images/runtime/start` | Inicia exclusivamente por petición explícita y conecta la URL de imagen |
| POST | `/api/v1/images/runtime/stop` | Detiene solo el proceso propio |
| GET | `/api/v1/images/runtime/logs` | Devuelve tramo final de `data/logs/comfyui.log` |

El backend está en `apps/api/noble_api/comfy_process.py`; la UI está en `apps/web/src/ComfyRuntimePanel.tsx`, dentro de la pestaña exclusiva de Imágenes.

## QA y pendientes

`tests/test_comfy_process.py` valida sin GPU rutas inseguras, puertos, configuración, ausencia de autoinicio, argv y binding loopback, parada propia, logs y persistencia de parámetros de generación. `apps/web/tests/comfy-runtime.spec.ts` verifica flujo completo escritorio/móvil con API simulada y que la pestaña Voz/TTS permanezca independiente.

**Aún pendiente:** un ensayo de instalación real en Windows y Colab con PyTorch, CUDA, checkpoint compatible y render; manejo de instalación y actualización automática del programa ComfyUI, entorno Python/requirements y extensiones. La detección de `/system_stats` prueba que el servidor responde, **no** garantiza VRAM ni que el checkpoint pueda renderizar. Los hitos generales N-01 y N-21 permanecen abiertos.
