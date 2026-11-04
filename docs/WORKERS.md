# Noble AI — Worker GPU remoto (P1.1 experimental)

**Estado real:** registro, comprobación y activación de un worker LLM compatible con OpenAI implementados. También se incluye un **proxy HTTP con Bearer token** que se ejecuta en la máquina GPU. Las pruebas están simuladas, no hay benchmark real en Google Colab, ni botón de *iniciar instancia Colab*, ni instalación automática de Cloudflared.

## Arquitectura

Navegador/PC principal → Noble AI local (FastAPI + SQLite) → HTTPS Cloudflare Tunnel → proxy autenticado en worker → servidor local compatible con OpenAI → GPU remota.

- Historias y credenciales se conservan en el equipo principal. Se envía al worker el **contexto narrativo necesario** para producir la respuesta. Cloudflare transporta el tráfico entre máquinas.
- La API principal permanece ligada a **127.0.0.1**: no es una opción para servir el workspace entero en red.
- El worker solo publica **GET /v1/models** y **POST /v1/chat/completions**. Su token se exige en todas las rutas (incluidos los endpoints no reconocidos).
- Noble AI comprueba tanto que el token correcto funcione como que un token incorrecto sea rechazado con 401/403. Un túnel que expone directamente Ollama/KoboldCpp sin autorización **no es admitido**.
- El token se guarda en el almacén de credenciales del sistema mediante Python keyring; en sistemas headless sin keyring se debe configurar un backend seguro antes de registrar. No existe fallback de texto plano.

## 1. Preparar la segunda PC / Google Colab

Necesitas **Python 3.11+**, el código Noble AI, una instalación de cloudflared y un servidor compatible con OpenAI ya ejecutándose localmente en el worker. Por ejemplo, si KoboldCpp está ejecutándose en `127.0.0.1:5001` y publica `/v1/models` y `/v1/chat/completions`, puedes usarlo como upstream.

En el equipo GPU, desde la raíz del repositorio:

```bash
python -m pip install -r apps/api/requirements.txt
```

Establece un token fuerte en una variable **local** (sin pegarlo en issues, terminales compartidas ni celdas públicas):

**Windows PowerShell:**

```powershell
$env:NOBLE_WORKER_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:NOBLE_WORKER_UPSTREAM = 'http://127.0.0.1:5001'
python -m uvicorn noble_api.worker_server:app --app-dir apps/api --host 127.0.0.1 --port 8765
```

**Linux/Colab:** exporta `NOBLE_WORKER_TOKEN` (al menos 24 caracteres, preferentemente aleatorios) y `NOBLE_WORKER_UPSTREAM=http://127.0.0.1:5001`. Ejecuta el mismo comando con Python/Uvicorn dentro del entorno GPU. En Colab necesitas mantener el notebook activo; el runtime gratuito puede suspenderse o desconectarse.

### 2. Exponer únicamente el proxy

Con **cloudflared** instalado en el equipo remoto:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Obtendrás una URL como `https://palabras-aleatorias.trycloudflare.com`. No uses la URL directamente del servidor de inferencia ni publiques puertos de Noble AI.

Los Quick Tunnels son temporales y pueden cambiar de dirección al reiniciar. Para una instalación persistente, más adelante se añadirá un proveedor con túnel administrado y controles más avanzados.

### 3. Conectar desde Noble AI

En el PC principal: **Configuración → Red y workers → Workers GPU remotos**.

1. Escribe un nombre para identificar el worker, la URL HTTPS de Cloudflare y el token que configuraste en el equipo GPU.
2. Pulsa **Registrar worker**.
3. Selecciónalo y pulsa **Probar conexión**. Debe mostrar los modelos anunciados por el servidor remoto y confirmar que se exige token Bearer.
4. Selecciona un modelo real y pulsa **Usar modelo remoto como narrador**.
5. Ve a **Biblioteca**. El siguiente turno narrativo usará el worker. Los turnos confirmados se guardan en el SQLite local.

Si se cae la sesión remota, Noble AI indica un error al generar; no intenta ejecutar automáticamente el LLM en tu tarjeta local. El registro puede quitarse del panel.

## Límites de esta versión

| Función | Estado |
|---|---|
| Registro de URL + token y eliminación | Implementado |
| Validación de URL `*.trycloudflare.com` y comprobación 401/403 | Implementado |
| Descubrimiento de IDs de modelos y activación | Implementado |
| Envío de peticiones LLM streaming a GPU remota | Adaptador implementado y simulado en pruebas |
| Proxy de inferencia local autenticado | Implementado; pruebas simuladas |
| Inicio automático Colab / Kaggle | Pendiente |
| Túneles permanentes con dominio propio | Pendiente |
| Workers de ComfyUI/imágenes y TTS | Pendiente |
| Compartir interfaz en LAN o Internet con cuentas y permisos | Pendiente |
| Inferencia real de modelos grandes y benchmark | Pendiente |

## Seguridad y gastos

Este modo requiere un servicio Cloudflare de terceros que enruta tráfico narrativo y depende de las políticas/cuotas vigentes. Los workers no deben exponer archivos o claves. La aplicación permite solo HTTPS `*.trycloudflare.com` en este primer contrato, no URLs arbitrarias. No se publican claves en respuestas de la API. Nunca subas el token a Git ni a un notebook público.

## Referencias

- [Urakatsu — enfoque de workers](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/remote/workers.py) (inspiración conceptual; sin copiar código).
- [Urakatsu — túneles](https://github.com/karrot0/Urakatsu/blob/main/urakatsu/remote/tunnel.py).
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
- Backend: `apps/api/noble_api/workers.py`, `worker_server.py`.
- Pruebas: `tests/test_workers.py`.

## Colab GPU real: notebook y benchmark (P1.2 experimental)

[Notebook para Colab](../notebooks/noble_worker_colab_gpu.ipynb) · [Abrir directamente en Google Colab](https://colab.research.google.com/github/Mairon31/novel_ai/blob/master/notebooks/noble_worker_colab_gpu.ipynb).

El notebook verifica NVIDIA/CUDA, compila llama.cpp con GPU, descarga Qwen3-4B-Instruct-2507 Q4_K_M, lanza llama-server y el proxy Bearer de Noble AI, crea un túnel HTTPS temporal y ejecuta un benchmark desde el cliente contra esa URL. **No se ha ejecutado aquí con hardware real**; no existe una medición de Colab hasta que se corra el notebook.

### Nuevas métricas

- TTFT real: tiempo desde que el cliente solicita texto hasta que recibe el primer contenido narrativo (incluye túnel y proxy), P50/P95 por ensayos.
- GPU: VRAM utilizada y utilización obtenidas de `nvidia-smi`, muestreadas mientras genera. **No es el pico exacto garantizado**.
- Estado: motor disponible, solicitudes activas/completadas/fallidas y tiempo medio de los ensayos.
- Velocidad: solo se informa tokens por segundo si el servidor reporta `completion_tokens`; no se equiparan caracteres a tokens.

El worker ahora ofrece `GET /v1/health`, protegido con el mismo token Bearer. Noble AI muestra esas estadísticas al pulsar **Configuración → Red y workers → Probar conexión**. No se guardan prompts, respuestas, direcciones o credenciales en la telemetría.

Para medir un worker ya registrado, usa una terminal en la PC principal:

```bash
export NOBLE_WORKER_TOKEN="TOKEN_LOCAL"
python tools/worker_benchmark.py --url https://mi-worker.trycloudflare.com --runs 3 --output informe-worker.json
```

En PowerShell establece `$env:NOBLE_WORKER_TOKEN = "TOKEN_LOCAL"` antes del segundo comando. El benchmark exige rechazo 401/403 ante un token incorrecto, lee el catálogo real, genera escenas de prueba y guarda un JSON con tiempos, errores y VRAM muestreada, sin contenido textual.

### Diagnósticos

- Si faltan `nvidia-smi` o `nvcc`, verifica que activaste la GPU en Colab.
- Si el modelo no inicia, revisa `llama-server.log` y cuantización/contexto.
- Si `/v1/health` responde 401, comprueba el token; **no publiques directamente el puerto 5001**.
- Si el túnel desaparece o cambia, vuelve a registrarlo en Noble AI; todavía no hay reconexión automática.
- En Colab la sesión GPU puede desconectarse. El producto principal seguirá conservando la historia localmente.

Los tests CI de este incremento usan mocks del protocolo y comprueban la sintaxis de las celdas. **No son una prueba real de GPU**.

## Prueba rápida desde la propia interfaz

Después de registrar, verificar y seleccionar un modelo remoto en **Configuración → Red y workers**, puedes pulsar **Medir respuesta real**. Esta acción ejecuta **una generación corta y explícita** con el modelo de la GPU remota, sin añadir texto a una historia ni guardarlo en SQLite.

Devuelve:
- tiempo del primer fragmento de contenido (TTFT cliente → túnel → GPU),
- tiempo total de la petición y cantidad de caracteres recibidos,
- GPU reconocida durante la comprobación previa (si existe telemetría),
- un estado de error claro si falla la inferencia.

Esta medición representa **una única generación**, no un promedio ni un pico exacto de VRAM. Para múltiples repeticiones P50/P95, VRAM muestreada y evidencia en JSON utiliza el notebook de Colab o `tools/worker_benchmark.py`.

Si una conexión falla después de empezar a transmitir, el turno incompleto **no se confirma** en el historial. La siguiente intervención puede reintentarse después de recuperar la conexión. Esa recuperación está probada con una desconexión simulada; no sustituye ensayos de red reales.
