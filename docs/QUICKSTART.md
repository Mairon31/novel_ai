# Noble AI P0.5 — ejecutar desde Windows

Esta es la primera versión del **Model Hub**, no un .exe ni la novela visual completa. No requiere Colab.

## Requisitos

Windows 11, Python 3.11+, Node.js 22+, Git, conexión a Internet para dependencias y modelos. La GPU **no es necesaria** para navegar el catálogo. Si tienes NVIDIA con `nvidia-smi` instalado, la API la detecta.

## Instalar y arrancar

En PowerShell:

```powershell
git clone https://github.com/Mairon31/novel_ai.git
cd novel_ai
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
npm --prefix apps\web install
npm --prefix apps\web run build
.\.venv\Scripts\python.exe -m uvicorn noble_api.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Abre **http://127.0.0.1:8000**. Al terminar pulsa `Ctrl+C` en la terminal.

El asistente inicial funciona sin modelos. Busca `Qwen` o una familia GGUF, abre un resultado, elige variante individual y pulsa **Instalar**. El progreso se ve en Descargas. Tras completar, aparece en Instalados y puedes **Elegir narrador**. La asignación no ejecuta el LLM: KoboldCpp/Ollama será la siguiente integración.

## Modo desarrollo

Terminal 1: ejecutar FastAPI con `--reload`; terminal 2: `npm --prefix apps/web run dev`. Abrir **http://127.0.0.1:5173** (proxy API automático).

## Almacenamiento y limitaciones

- DB: `data/noble.sqlite`; modelos: `data/models/hf/<autor>/<repo>/<sha>/<archivo>.gguf`; parciales: `.part`. `data/` está ignorado por Git.
- El backend acepta `NOBLE_DATA_DIR` para otro directorio de datos (solo ajuste de desarrollo). Selector visual de carpetas pendiente.
- Se instala **solo GGUF individual y público**, no modelos multipart o gated. Si Hugging Face anuncia SHA-256 LFS, el instalador lo verifica; si no, registra solamente hash local.
- El buscador de imágenes y voces es exploratorio, **sin instalación ni ejecución** por ahora.
- No hay inferencia de texto, imágenes, voces, ejecutable, importación local, ni benchmark 12/16GB.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
npm --prefix apps\web run build
```

Playwright escritorio/móvil está automatizado en [GitHub Actions](https://github.com/Mairon31/novel_ai/actions). Los tests de descargas son **con HF simulado** y checksum conocido, no con una descarga pública completa.

[Model Hub](MODEL_HUB.md) · [Progreso](PROGRESO.md) · [Issues](https://github.com/Mairon31/novel_ai/issues).
