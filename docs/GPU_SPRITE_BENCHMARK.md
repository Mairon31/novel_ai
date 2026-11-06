# Benchmark físico de sprites (ComfyUI / RMBG / BiRefNet)

Esta herramienta **no ejecuta benchmarks en CI**. Es un ensayo opcional, local y reproducible para comparar tiempos de generación, transparencias y lecturas de VRAM de las expresiones del mismo personaje. Usa la API de Noble AI y ComfyUI **ya instalados**. No modifica ajustes del proyecto, no instala modelos y **no aprueba ni publica imágenes**. Los 5 resultados por método permanecen como borradores revisables en Creator Studio, salvo que solicites borrarlos explícitamente.

Código: [`tools/sprite_gpu_benchmark.py`](../tools/sprite_gpu_benchmark.py). Pruebas automáticas: `tests/test_sprite_gpu_benchmark.py` (con HTTP y telemetría simulados, sin uso físico de GPU).

## Requisitos

1. Arranca Noble AI desde su entorno virtual con la API en `http://127.0.0.1:8000` y ComfyUI local según **Ajustes → Imágenes y voz**. Selecciona allí un checkpoint existente y la resolución/steps/CFG que quieres comparar. El benchmark **no cambia** la configuración ni descarga pesos.
2. Crea una historia y un NPC en Creator Studio. Elige una semilla constante para todas las pruebas.
3. Si quieres probar RMBG o BiRefNet, instala antes [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) y sus pesos/modelos compatibles. Es necesario que Noble pueda consultar `/models/rmbg` y los nodos instalados. Si quieres combinar con IPAdapter y/o LoRA, debes haber preparado esos recursos y un asset de referencia.
4. Para registrar VRAM en NVIDIA, `nvidia-smi` debe estar disponible desde la misma terminal/host. Si está ausente o ComfyUI usa otra GPU/servidor, el resultado carecerá de telemetría fiable y dejará métricas GPU en `null`, en lugar de inventarlas.

## Uso paso a paso — Windows PowerShell

Desde la raíz del repositorio:

```powershell
# 1) Descubrir los UUID locales de historias (solo lectura)
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --list-stories

# 2) Descubrir los NPC de la historia escogida (solo lectura)
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --list-characters UUID_DE_HISTORIA

# 3) Comprobar modelos/nodos/compatibilidad, sin generar ni ocupar GPU
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id UUID_DE_HISTORIA --character-id UUID_DEL_NPC --modes chroma_green,neural_rmbg2,neural_birefnet_portrait --check-only --out reports\sprites-preflight

# 4) Comparar los 3 métodos bajo el MISMO checkpoint, semilla y configuración
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id UUID_DE_HISTORIA --character-id UUID_DEL_NPC --modes chroma_green,neural_rmbg2,neural_birefnet_portrait --seed 1407 --out reports\sprites-comparativa
```

Reemplaza los dos `UUID_` por los identificadores listados. El ejemplo compara **hasta 15 imágenes** (3 métodos × 5 expresiones) y puede consumir tiempo de inferencia considerable; no hay límite de duración predicho. Puedes comenzar más pequeño con `--expressions neutral,joy`. Si algunos métodos carecen de pesos instalados, quedarán explícitamente `skipped` y no se iniciará su inferencia.

Para comparar **los cuatro modos** sin dejar cuatro borradores abiertos, añade `--discard-after` y cambia `--modes`:

```powershell
.\.venv\Scripts\python.exe tools\sprite_gpu_benchmark.py --story-id UUID_DE_HISTORIA --character-id UUID_DEL_NPC --modes chroma_green,neural_rmbg2,neural_birefnet_portrait,neural_birefnet_matting --seed 1407 --discard-after --out reports\sprites-cuatro-modelos
```

Este último comando **sí elimina los borradores que creó el propio ensayo**, después de guardar sus PNG e informes en `--out`. Nunca elimina sprites ya publicados ni borradores anteriores de otros proyectos. Si omites `--discard-after`, los borradores del ensayo permanecen en Creator Studio para revisión, pero Noble AI limita la cantidad a tres borradores por historia. Puedes borrarlos desde la interfaz cuando termines.

## Linux/macOS

Sustituye el ejecutable de Windows por `.venv/bin/python`. Ejemplo:

```bash
.venv/bin/python tools/sprite_gpu_benchmark.py --list-stories
.venv/bin/python tools/sprite_gpu_benchmark.py --story-id UUID_DE_HISTORIA --character-id UUID_DEL_NPC --modes chroma_green,neural_birefnet_matting --seed 1407 --out reports/sprites
```

## Referencia visual, LoRA y recursos de GPU

Para probar identidad con IPAdapter, añade `--reference-mode ipadapter` y **uno solo** entre `--reference-asset-id UUID` (Galería) y `--reference-sprite-asset-id UUID` (sprite aprobado del mismo NPC). El preset predeterminado es `PLUS FACE (portraits)`; se puede modificar con `--ipadapter-preset` y `--ipadapter-weight`. `--use-lora` aplica el LoRA guardado en el ADN visual del NPC cuando existe y está instalado. Las pruebas nunca garantizan que el rostro o el vestuario permanezcan idénticos.

El benchmark usa `--gpu-index 0` por defecto para `nvidia-smi`. Con varias tarjetas, elige el índice real de la GPU usada por ComfyUI. `--timeout 360` establece el límite del cliente por solicitud; el propio backend tiene también su límite de historial. `--allow-low-vram` únicamente habilita la política explícita del gestor de recursos, no crea memoria adicional.

## Salidas generadas

La carpeta `--out` contiene:

| Archivo | Contenido |
|---|---|
| `report.json` | Estado por modo/expresión, checkpoint y parámetros consultados, latencias medidas por solicitud, método de alfa y métricas de geometría/transparencia, estado de preflight, datos GPU muestreados si existen, fallos y descartes |
| `review.html` | Comparativa visual local en cuadrícula con fondo tipo tablero para ver transparencia, neutral/alegría/enojo/tristeza/sorpresa y controles visuales orientativos |
| `review.csv` | Hoja para rellenar **manualmente** calidad de cabello/bordes, coherencia de rostro y vestuario y notas por variante |
| `<modo>-<expresión>.png` | PNG RGBA del preview existente, generado solo si el servidor lo entregó y el análisis del archivo pasó |

`report.json` se actualiza tras cada expresión, para conservar avances si un proceso se interrumpe. El documento HTML y el CSV se construyen al terminar. El informe no copia texto del NPC, del argumento, de los prompts ni los UUID de la historia o personaje. Los previews PNG, por supuesto, **sí contienen el arte generado**: compártelos solo si deseas que otra persona lo inspeccione.

El reporte marca `simulated=true` únicamente en pruebas con transporte HTTP inyectado, y `false` al ejecutar con HTTP real; esto **no prueba por sí solo** que ComfyUI haya utilizado hardware dedicado. Los valores de `nvidia-smi` son muestras temporales del **host**, no una medición perfecta del consumo atribuible al proceso: pueden incluir otra aplicación y no capturar picos breves.

### Interpretación y criterios

- **Tiempo/latencia:** segundos o milisegundos transcurridos desde la solicitud HTTP de generar hasta la descarga y validación del preview; incluye overhead API/ComfyUI. No es tiempo puro de GPU. Medir repetidamente en ejecuciones separadas ayuda a distinguir cold-start de cacheo, pero cada run utiliza la política de ComfyUI existente y puede cachear nodos.
- **VRAM:** máximo observado en `nvidia-smi` durante las muestras; `null` cuando no existe. Sin muestras no se puede afirmar que cupo en 16 GB ni que hubo cero OOM.
- **Fracción de alfa suave / cobertura / bounding box:** geometría verificable de imágenes PNG, no calidad de segmentación ni consistencia facial. Una máscara blanca constante, por ejemplo, puede dar valores numéricos altos pero ser visualmente mala; el servidor rechaza varias formas de máscaras inválidas, pero la revisión humana continúa obligatoria.
- **Comparación visual:** abre `review.html`, anota decisiones en `review.csv` y examina zonas críticas: bordes de pelo, accesorios, mangas, transparencia interior, ojos, proporciones, paleta y vestuario. No son datos que el benchmark pueda certificar automáticamente.

## Fallos seguros y privacidad

El cliente solo acepta `http://127.0.0.1:<puerto>`, `http://localhost:<puerto>` o `http://[::1]:<puerto>`, sin credenciales, rutas externas ni redirecciones. No usa proxies de entorno ni contacta APIs externas. Ante modelo ausente, error de una expresión, timeout o máscara de baja calidad, registra el fallo, no genera las expresiones restantes de ese modo y no publica activos; las imágenes ya obtenidas se conservan. El ensayo `--check-only` sale con código no cero si los modos requeridos no están listos. En ejecuciones reales puede haber descargas automáticas propias de plugins de ComfyUI ajenos a Noble cuando **otros** workflows los activan: administra tus pesos y extensiones desde ComfyUI.

La integración se prueba en CI con transporte HTTP simulado y NVIDIA simulado. **La validación real de checkpoints, familias SD/SDXL/Illustrious/Flux, latencia, VRAM, calidad visual y peso compatible exige ejecutar estos comandos localmente** y revisar sus archivos.
