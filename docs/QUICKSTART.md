# Noble AI — Instalar y ejecutar la aplicación local

**Descripción:** aplicación web local React + FastAPI con Model Hub, historias persistentes, ramas, galería de ilustraciones, integración ComfyUI y síntesis Piper opcional. No requiere Google Colab. Las funciones externas necesitan sus motores instalados por separado.

## Requisitos

Windows 11 (o Linux para desarrollo), Python 3.11+, Node.js 22+, Git. Internet necesario para dependencias y para buscar/descargar pesos de Hugging Face. La narración puede funcionar offline si el motor y los modelos ya están presentes.

## Instalar y abrir Noble AI

PowerShell:

```powershell
git clone https://github.com/Mairon31/novel_ai.git
cd novel_ai
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
npm --prefix apps\web install
npm --prefix apps\web run build
.\.venv\Scripts\python.exe -m uvicorn noble_api.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Abre **http://127.0.0.1:8000**. Usa `Ctrl+C` para detener Noble AI.

## Ruta A — Usar KoboldCpp con el GGUF del Model Hub

1. En **Model Hub**, busca un modelo narrativo GGUF con cuantización adecuada a tu VRAM/RAM; abre una variante GGUF de **archivo único**, instálala y espera que aparezca en **Instalados**.
2. Obtén el ejecutable de KoboldCpp por su fuente oficial: https://github.com/LostRuins/koboldcpp/releases . **Noble AI no descarga ni instala el ejecutable todavía**.
3. Abre **Configuración → KoboldCpp administrado**. Selecciona el GGUF que acabas de instalar y escribe la ruta a `koboldcpp.exe` (p. ej. `C:\Tools\koboldcpp.exe`).
4. Elige capas GPU: **Automático (-1)**, **Solo CPU (0)** o 12/24/36/etc. Puedes elegir contexto y puerto local; inicia con 4096 tokens, puerto 5001.
5. Pulsa **Iniciar modelo**. Espera el estado **Modelo listo**. Si KoboldCpp falla, revisa `data/logs/koboldcpp.log`, el límite VRAM/RAM y la cuantización.
6. Pulsa **Usar como narrador**. El backend descubre la ID real informada por KoboldCpp y actualiza la configuración del narrador.
7. Ve a **Biblioteca**, pulsa **Nueva historia**, escribe título/premisa y después **Enviar intervención** o **Continuar**. El texto aparece progresivamente y se guarda en SQLite.
8. Al salir de Noble AI, el backend **solo cierra el KoboldCpp que inició**, nunca procesos de otro programa.

La ejecución real de esta ruta **todavía no se ha probado en una GPU física dentro de Noble AI**. La API y ciclo de vida están validados con procesos y motores simulados. `--host 127.0.0.1`, `--gpulayers`, `--contextsize` y `--model` provienen de los argumentos declarados por KoboldCpp.

## Ruta B — Conectar Ollama

1. Instala y ejecuta Ollama en el mismo equipo: https://ollama.com . Asegúrate de disponer de un modelo en su biblioteca local. Hasta incorporar la descarga de Ollama al Model Hub, puedes obtener uno con los controles/herramientas propios de Ollama (p. ej., `ollama pull qwen3:8b`).
2. Noble AI → **Configuración → Motor narrativo local**: selecciona `Ollama`, URL `http://127.0.0.1:11434`, pulsa **Guardar y probar conexión**.
3. Elige o escribe el ID que aparece en la lista real de Ollama, p. ej. `qwen3:8b`; configura temperatura, Top-P, contexto y máximo de tokens.
4. En Ollama, **Automático** deja la selección de GPU al motor; **Solo CPU** usa `num_gpu=0`. Guarda los ajustes.
5. Abre Biblioteca y crea una historia. Ollama carga el modelo cuando se inicia la generación; Noble AI envía `keep_alive: 30m` para mantenerlo listo durante el uso.

No se admiten endpoints remotos en este incremento. El backend solo permite direcciones HTTP loopback con puerto, y no envía historias a servicios externos.

## Cómo se guarda

- `data/noble.sqlite`: modelos/descargas/asignaciones, parámetros narrativos y tablas `stories` y `story_turns`.
- `data/models`: GGUF instalados por Noble AI.
- `data/logs/koboldcpp.log`: salida del proceso administrado.
- `apps/web/dist`: frontend compilado, servido por FastAPI.

Las historias guardan título, premisa, intervención del jugador y respuesta del motor, asociadas a un `request_id` idempotente. Se reutilizan hasta 16 turnos previos al construir el contexto. Todavía **no** hay seguimiento estructurado del canon, memoria semántica, reintentos, ramas ni assets visuales. No borrar `data/` para actualizar.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
npm --prefix apps\web run build
```

Playwright se ejecuta en GitHub Actions para escritorio y móvil. **Pruebas verificadas:** contratos simulados de Ollama/KoboldCpp, SSE, error sin commit parcial, idempotencia y reinicio de SQLite; comando de KoboldCpp, CPU (0 capas), proceso propio/stop y activación; 6 recorridos Playwright (dos de navegador básico, dos catálogo con fixtures, dos lector con respuesta LLM simulada). El funcionamiento real con pesos/GPU queda pendiente.

## Problemas frecuentes

- **API sin conexión:** verifica que FastAPI esté activo en puerto 8000.
- **El backend no detecta NVIDIA:** comprueba `nvidia-smi` desde PowerShell.
- **No aparece el GGUF:** revisa que terminó la descarga y existe en la biblioteca de Noble AI.
- **KoboldCpp no inicia:** comprueba exe, puerto, archivo y `data/logs/koboldcpp.log`.
- **KoboldCpp responde, pero no puedo narrar:** pulsa **Usar como narrador** después de que el estado sea *listo*.
- **Ollama no responde:** confirma servidor, modelo y URL loopback.
- **Error de modelo/VRAM:** reduce cuantización, contexto, capas GPU o usa CPU/Auto; el perfil todavía no está medido.
- **Historias sin imágenes o voces:** esas integraciones serán fases siguientes.

[Model Hub](MODEL_HUB.md) · [Bitácora](PROGRESO.md) · [Issues](https://github.com/Mairon31/novel_ai/issues).


## Referencias visuales y VRAM

Puedes generar nuevas variantes de una ilustración guardada usando **ComfyUI → Imagen de referencia** y el control **Transformación**, que utiliza un workflow de imagen-a-imagen nativo. En **Configuración → Imágenes y voz** puedes consultar la VRAM libre observada y establecer una reserva mínima para trabajos de imagen. Esta política no instala un scheduler de GPU ni elimina procesos existentes. Ver [Guía multimedia](MULTIMEDIA_LOCAL.md) y [Imágenes](IMAGENES.md).
