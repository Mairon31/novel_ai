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
