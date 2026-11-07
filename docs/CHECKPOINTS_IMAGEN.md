# Noble AI — Instalación de checkpoints de imagen desde la aplicación

**Estado:** primer flujo publicado en `master`; la validación de CI de la fase se actualizará en [PROGRESO.md](PROGRESO.md). **No es una instalación automática del runtime ComfyUI.**

## Qué hace

Abre **Configuración → Imágenes → Checkpoints desde Noble AI**. Escribe un identificador público de Hugging Face en formato `autor/modelo`, pulsa **Buscar archivos del checkpoint** y elige un archivo individual `.safetensors` disponible en la raíz del repositorio. Se muestran tamaño, licencia anunciada y revisión. **Instalar checkpoint** inicia una descarga con progreso, Pausar, Reanudar y Cancelar. No se descarga al entrar en Ajustes ni al consultar el repositorio.

La descarga final se coloca en el directorio propio `data/models/comfyui/checkpoints/autor/modelo/archivo.safetensors` (o dentro del `models_dir` configurado de la aplicación). Noble no sobrescribe archivos ajenos, comprueba SHA-256 declarado por Hugging Face y la estructura de cabecera/tensores safetensors, y solo publica el archivo verificado.

La API no admite archivos de otras extensiones ni rutas con subdirectorios en el nombre de archivo, checkpoints privados/gated ni modelos sin SHA-256 y tamaño declarado. No todos los archivos safetensors son compatibles con `CheckpointLoaderSimple`, por lo que pasar verificación de archivo **no** demuestra compatibilidad de arquitectura, VRAM ni calidad artística.

## Conectar los checkpoints con ComfyUI

Noble genera el archivo `data/models/comfyui/noble_extra_model_paths.yaml` con su carpeta de checkpoints. **ComfyUI, que por ahora es un proceso externo, debe arrancarse con:**

```text
--extra-model-paths-config "<ruta-absoluta-mostrada-por-Noble>"
```

La UI enseña la ruta exacta en tu instalación; ComfyUI quizá necesite reiniciarse para actualizar el catálogo. Después pulsa **Buscar checkpoints**. Solo cuando ComfyUI devuelve el nombre relativo `autor/modelo/archivo.safetensors` en su inventario se habilita **Seleccionar checkpoint**. Guarda entonces los ajustes de imagen; el botón Ilustrar utiliza exactamente el checkpoint reconocido, con el muestreador y el estilo anime que configuraste.

**No se debe editar manualmente la carpeta de otros programas** y Noble no mueve el archivo a una ruta ComfyUI elegida arbitrariamente. Arrancar/actualizar ComfyUI y gestionar modelos especializados desde el panel Noble continúan pendientes de N-01/N-21.

## Endpoints

| Método | Ruta | Acción |
|---|---|---|
| GET | `/api/v1/images/checkpoints/lookup?repo_id=autor/modelo` | Revisión y safetensors raíz con hash publicado |
| GET | `/api/v1/images/checkpoints/installed` | Inventario de archivos verificados y ruta ComfyUI |
| GET | `/api/v1/images/checkpoints/downloads` | Trabajos recientes |
| GET | `/api/v1/images/checkpoints/downloads/{uuid}` | Trabajo individual |
| POST | `/api/v1/images/checkpoints/install` | `{"repo_id":"autor/modelo","filename":"archivo.safetensors","revision":"<40 hex>"}` |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/pause` | Pausar |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/resume` | Reanudar o reintentar |
| POST | `/api/v1/images/checkpoints/downloads/{uuid}/cancel` | Cancelar |

La revisión se fija a un SHA de 40 caracteres; el hash de 64 caracteres es obligatorio. El trabajo se persiste en la tabla `image_checkpoint_downloads`. Se reanuda solo tras acción del usuario, y solo se aceptan respuestas HTTP 206 con `Content-Range` exacto. Si el origen devuelve HTTP 200 al reanudar, se reescribe el archivo parcial desde el inicio.

## Pruebas

`tests/test_checkpoint_installer.py` simula HF para validar integridad, cabeceras, descargas parciales, seguridad de nombres y rutas, cancelación y que no se contacte a HF al abrir el panel. `apps/web/tests/checkpoint-installer.spec.ts` recorre catálogo, instalación, pausa/reanudación, selección solo con confirmación ComfyUI y guardado real de ajustes, en escritorio y móvil. Estas pruebas no sustituyen el ensayo físico con GPU, modelo real y licencia concreta.

## Pendiente

Soporte de checkpoints almacenados en subcarpetas HF, filtros de familias compatibles (SD1.5/SDXL/Illustrious/Flux), administración de LoRA/VAE, instalación automática/launcher de ComfyUI y validación visual real en Windows/Colab. Los hitos maestros N-01 y N-21 siguen sin completarse.
