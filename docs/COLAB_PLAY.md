# Noble AI — Google Colab todo en uno

**Notebook:** [Abrir Noble AI en Colab](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_ai_colab_play.ipynb)

Repositorio: [`notebooks/noble_ai_colab_play.ipynb`](../notebooks/noble_ai_colab_play.ipynb) · Instalador versionado: [`tools/colab_launch.py`](../tools/colab_launch.py).

## Inicio sin configuración técnica

1. Abre el enlace del notebook en Google Colab y conecta un entorno de ejecución. Selecciona **GPU T4/L4** si está disponible; sin GPU todavía puedes ejecutar la narración en CPU, con rendimiento inferior. No es obligatorio conectar Drive.
2. Pulsa **Ejecutar la única celda de código** o **Entorno de ejecución → Ejecutar todas**. No tienes que copiar comandos, archivos ni tokens.
3. La instalación muestra logs y un mensaje cada cierto tiempo mientras instala paquetes/descarga modelos. Al completarse aparece **Abrir Noble AI en una pestaña** y un marco incrustado en la salida.
4. Abre **Biblioteca → La estación de la última luna** para probar la historia de ejemplo, creada solo cuando la biblioteca estaba vacía. En bibliotecas que ya contienen historias, no se añade otra. Desde allí también puedes crear tu historia y sus personajes.

**No necesitas que termine la descarga de los modelos de imagen para empezar a leer.** Tras instalar la API y comprobar Ollama, el notebook abre la interfaz y después continúa preparando ComfyUI si elegiste imágenes. Mientras tanto puedes crear o abrir historias desde la UI.

El enlace a la interfaz usa **el proxy del kernel autenticado de la misma sesión Colab**. No se inicia Cloudflare Tunnel, ngrok ni una URL pública. Si tu navegador bloquea la pestaña o cookies de terceros, usa la vista incrustada; los enlaces del proxy dejan de ser válidos al desconectar Colab.

## Qué se instala automáticamente

| Componente | Configuración |
|---|---|
| Código Noble AI | `git clone/fetch` de `Mairon31/novel_ai` y verificación del commit exacto |
| API | Python y dependencias reales desde `apps/api/requirements.txt`; FastAPI/Uvicorn en `127.0.0.1:8000` |
| Frontend | Node.js compatible con Vite, `npm ci` si existe lockfile o `npm install`, `npm run build` |
| Acceso web | React estático servido **por el mismo puerto** de FastAPI, bajo el proxy Colab |
| Narración | Ollama local en `127.0.0.1:11434`; descarga un modelo y lo registra en `/api/v1/narrative/config`; después llama a `/api/v1/narrative/prepare` para confirmar inferencia real sin generar ningún turno |
| Historia de ejemplo | Solo si la biblioteca está vacía; no elimina ni sobrescribe historias previas |
| Ilustraciones (modo `auto`) | Si existe GPU NVIDIA, intenta instalar ComfyUI, su API loopback `8188` y un checkpoint de demostración **Stable Diffusion 1.5 FP16**. Configura `/api/v1/images/config` únicamente si todavía no había un checkpoint elegido |
| Copia Drive (opt-in) | Copia historias/medios a Drive mediante respaldo periódico con API `sqlite3.Connection.backup`; no copia modelos GPU pesados |

ComfyUI puede instalarse sin RMBG/LoRA/IPAdapter. Los recursos avanzados **necesitan** los plugins y pesos correspondientes. El checkpoint de ejemplo no es un modelo artístico especializado de nivel producción y no garantiza consistencia facial. Las ilustraciones siguen siendo **bajo demanda**, no se generan automáticamente durante cada diálogo.

El instalador verifica que el checkpoint de prueba descargado corresponde al SHA256 publicado en Hugging Face: [Comfy-Org/stable-diffusion-1.5 FP16](https://huggingface.co/Comfy-Org/stable-diffusion-1.5/blob/main/v1-5-pruned-emaonly-fp16.safetensors) (alrededor de 2,13 GB). Ollama usa [Qwen3 4B Instruct](https://ollama.com/library/qwen3/tags) cuando se detectan al menos 11.000 MiB de VRAM NVIDIA; en CPU/GPU más pequeña, `qwen3:1.7b`. **Esto es una elección de inicio, no un benchmark ni una garantía de calidad.**

## Ajustes al inicio (opcionales)

La única celda tiene cuatro campos:

- **`REVISION="master"`**: el notebook resuelve primero el HEAD de `master`, fija su SHA y descarga **el instalador de ese mismo commit**, evitando instalar una mezcla accidental de revisiones. En otra sesión, `master` buscará el código más reciente; puedes fijar un SHA completo de 40 caracteres para repetir una versión anterior.
- **`MODELO="auto"`**: selecciona automáticamente un modelo o escribe un tag instalado/disponible de Ollama (por ejemplo `qwen3:4b-instruct`, `qwen3.5:2b` u otros futuros tags válidos). El script pasa argumentos a subprocess como lista, no a un shell interpolado.
- **`IMAGENES="auto"`**: en GPU intenta instalar ComfyUI y un checkpoint de prueba; `off` inicia solo narración y frontend; `on` intenta instalar imágenes incluso sin NVIDIA, con consumo potencialmente elevado de RAM/CPU.
- **`COPIA_EN_DRIVE=False`**: cuando se cambia a `True`, Colab solicitará permiso de Drive. Los datos se restauran en disco local al iniciar; después se copian periódicamente a `Mi unidad/NobleAI-Colab/data`. La copia de la base de datos se hace online por SQLite, mientras que los medios se copian por archivos. **No es una transacción atómica global** y las modificaciones de los últimos minutos pueden perderse ante una interrupción súbita de Colab.

**El instalador conserva los ajustes de narración e imagen previamente guardados** si existen y son válidos. La carpeta de datos `/content/noble-ai-colab/data` queda **fuera** del checkout Git, por lo que actualizar `master` no ejecuta un reset sobre tus historias. Si termina el runtime de Colab sin Drive activado, esa carpeta desaparece junto con la sesión temporal. Puedes seguir usando el respaldo portátil `.noble.zip` desde la Biblioteca para exportar historias.

## Logs y resolución de problemas

Carpeta: `/content/noble-ai-colab/logs/`.

| Archivo | Qué revisar |
|---|---|
| `git.log` | Revisión descargada, conflictos de red y fetch del SHA |
| `python-deps.log` | Dependencias FastAPI |
| `npm-ci.log` o `npm-install.log` | Dependencias web actuales |
| `vite-build.log` | Compilación de React/TypeScript |
| `noble-api.log` | Errores del servidor FastAPI/SQLite |
| `ollama-install.log`, `ollama-pull.log`, `ollama.log` | Instalar, descargar y ejecutar LLM |
| `comfy-git.log`, `comfy-deps.log`, `comfyui.log` | Instalación e inicio de ComfyUI |
| `launch_state.json` | Commit ejecutado, GPU observada, modelo configurado y resultado del calentamiento |

Si Ollama no puede descargar/generar, el notebook muestra el error y mantiene la UI disponible. Si ComfyUI falla, sigue accesible el lector y el narrador; no se reporta como instalada una generación de imágenes que no inició. El instalador no ejecuta un bucle anti-AFK: Colab puede cerrar sesiones por límites/cuotas y no existe garantía de duración continua.

**Rendimiento:** la primera ejecución puede descargar varios GB; los modelos y el frontend se preparan dentro de Colab. La imagen IA opcional puede competir con Ollama por VRAM en T4, y no se promete 16 GB libres, duración ni calidad estable sin un benchmark real. No se expone el servidor local a `0.0.0.0`.

## Compatibilidad futura y pruebas

Cada ejecución sobre `master` obtiene las dependencias Python y el frontend de la revisión seleccionada; el instalador admite otros tags seguros de Ollama sin modificar el notebook. Los controles de configuración se mantienen en el frontend actualizado. No se suponen rutas/nodos de una versión futura de ComfyUI: si una versión de Noble deja de ser compatible, el registro debe mostrar el error, no cambiar silenciosamente el proveedor.

- `tests/test_colab_play.py`: integridad del JSON/AST, única celda obligatoria, revisión fijada, seguridad del proxy y URL de clone, selección de modelo, conservación de ajustes, historia demo idempotente, prueba de inferencia y respaldo SQLite/medios.
- **CI GitHub** usa simulaciones: verifica estructura/contratos y build, **no ejecuta realmente Google Colab, Ollama, downloads de 2+ GB, ni genera una imagen GPU**.
- Cuando pruebes el notebook en un runtime Colab verdadero, sus logs y `launch_state.json` permitirán cerrar el gate de instalación física con evidencia de GPU/modelo y eventuales errores.

### Reinicio seguro cuando cambia `master`

El instalador almacena el PID de Uvicorn que inició. Si vuelves a ejecutar el notebook mientras una versión anterior sigue activa, compara el SHA guardado con el nuevo; cuando difieren, comprueba en `/proc/<PID>/cmdline` que el proceso pertenece a `noble_api.main:app` bajo la carpeta del proyecto y en el puerto `127.0.0.1:8000`. Solo entonces envía `SIGTERM` a ese Uvicorn para cargar el código nuevo y ejecutar migraciones SQLite. Si la comprobación no coincide, **no mata procesos ajenos** y detiene la actualización con un diagnóstico. Historias y medios siguen fuera del checkout Git. ComfyUI y Ollama se reutilizan si están activos y saludables.
