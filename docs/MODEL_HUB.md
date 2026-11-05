# Noble AI — Model Hub: quantization and hardware analysis

Noble AI queries Hugging Face and presents results, model metadata and GGUF files. It does **not** silently execute third-party model code, install a runtime or start inference when a repository is opened.

## Detailed model view

- Repository, author, pipeline, library, tags, base model, downloads, likes, license, SHA revision, access classification.
- Single-file GGUF variants with filename, size, optional announced SHA-256, and current installer support.
- Preferred variant for the local machine (when memory is known), per-variant estimated memory/fit, disk capacity and reason.
- Selectable context of 2K, 4K, 8K, 16K, 32K tokens, which recalculates KV demand.

## Hardware recommendation algorithm

1. Read detected NVIDIA GPU total and **current free** VRAM, available RAM and free disk. No fabricated GPU if `nvidia-smi` is missing.
2. Probe **at most 512 KiB** of a single supported GGUF variant through a pinned-revision HTTP Range request. Never download a multi-GiB GGUF just to open its detail page.
3. Parse supported GGUF header fields without loading tensors: architecture, parameter count, layers, KV heads, head dimensions. Use them to estimate fp16 KV-cache size for the selected context. If unavailable, fall back to a cautious synthetic reserve and explicitly label it.
4. Estimate `weights + compute overhead + KV context`; leave headroom for desktop/driver and the runtime.
5. Rank fully GPU-fit variants before partial offload, then CPU; within a tier prefer a larger quantized variant before F16/BF16 if quality/size permits. Warn for insufficient disk.
6. Never claim that model will *definitely* load or run at a particular speed. Multimodal projectors, exotic architectures, offload layer policies, KV quantization and external GPU use can invalidate an estimate.

### Classifications

| Fit label | Meaning |
|---|---|
| `full_gpu` | Estimated memory fits measured free VRAM after overhead |
| `partial_offload` | Estimated combination of free GPU memory and RAM; slower, runtime-dependent |
| `cpu` | Estimated RAM-only execution |
| `too_large` | Memory likely insufficient |
| `unsupported` | The current Noble installer cannot handle this file |
| `unknown` | Not enough information (e.g. missing file size) |

**Scope:** Current downloader supports **single-file GGUF narrators** only. Search for image and TTS models remains discovery-only until their installer manifests and runtime compatibility are implemented. Sharded GGUF and multipart repositories are not misleadingly labeled installed.

Adapted with MIT attribution from Urakatsu; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Tests and known limitations

`tests/test_model_hardware_fit.py` tests synthetic GGUF header fields, 16GiB GPU and CPU fallback, API detail, and unknown file safety. These are analytical unit tests, not empirical performance measurements. GPU tests with actual checkpoint/driver belong to the later batch benchmark notebook.

## Comparación visual de cuantizaciones

La ficha de un GGUF muestra una medición de VRAM libre observada y demanda de memoria estimada. La persona puede elegir 2K–32K tokens y filtrar variantes: Todas / GPU / GPU + RAM / CPU. La cuantización recomendada es una sugerencia calculada por memoria, no una prueba empírica.

La barra de comparación distingue presupuesto de GPU, memoria combinada o RAM según el tipo de ejecución. El resultado no predice velocidad ni descarga modelos para comprobarlos. Imágenes y TTS siguen en modalidad de catálogo hasta incorporar instaladores compatibles por motor.


## Fichas de autor completas

La ficha de modelo ofrece un botón **Leer ficha completa** que consulta bajo demanda el `README.md` publicado en Hugging Face para el commit SHA del modelo. Noble AI lee hasta 128 KiB y muestra el contenido como texto plano; no interpreta HTML incrustado ni ejecuta scripts publicados por el repositorio. El usuario puede ocultarla sin perder la variante seleccionada o la comparativa de hardware.

Ruta: `GET /api/v1/model-cards/{namespace}/{model}?revision={sha40}`. El servidor valida los identificadores, utiliza únicamente el host de Hugging Face y limita tanto la lectura de red como la respuesta. Un repositorio sin README devuelve `available:false`; un modelo restringido informa el error correspondiente.

El indicador de compatibilidad también expone la memoria estimada del archivo, la memoria KV asociada al contexto y el porcentaje aproximado de descarga GPU/RAM en su información accesible. Implementado mediante adaptación de `FitCell` del componente `ModelsPage.tsx` de Urakatsu (MIT). No se afirma compatibilidad empírica de CUDA ni medición de tokens por segundo.

## Almacenamiento local registrado (API y UI reales)

La pestaña **Instalados** muestra ahora un inventario de disco inspirado en
`ModelsStorage.tsx` y `UsageBar` de Urakatsu. Es una implementación adaptada
al almacenamiento SQLite propio de Noble AI, sin depender de las rutas y
componentes de Urakatsu.

- Ruta: `GET /api/v1/models/storage`.
- Se obtiene capacidad usada, total y libre con `shutil.disk_usage` sobre
  la carpeta de modelos. El espacio utilizado por el sistema puede incluir
  ficheros no administrados por Noble AI y, en Linux, bloques reservados.
- Los modelos registrados se contabilizan por tamaño **real** del archivo
  cuando se encuentra dentro de la raíz administrada. Los enlaces simbólicos
  y las rutas externas no suman almacenamiento.
- Los trabajos incompletos se contabilizan por sus archivos `.part`
  existentes, sin confundirlos con modelos instalados.
- Si un archivo registrado ya no está presente, el Model Hub muestra su
  estado y no permite elegirlo como narrador desde esa lista.
- La lista de archivos permite inspeccionar los tamaños registrados; el
  panel no borra ni mueve ficheros silenciosamente.

El inventario no pretende medir todo el contenido no registrado de la carpeta
ni calcula la capacidad GPU necesaria para cargar cada archivo. Es independiente
del estimador de GGUF y del consumo real de VRAM.

## Master/detail en escritorio y modal móvil

En escritorio, la ficha del modelo se presenta a la derecha manteniendo la
lista interactiva. En móvil continúa como un panel modal. Las búsquedas
y fichas recientes se conservan de forma temporal dentro de la sesión
(adaptación directa del patrón `recentSearches`/`recentDetails` de
Urakatsu MIT). Los ajustes de compatibilidad tienen un TTL corto porque la
VRAM libre es variable.

Las pruebas funcionales comprueban apertura de ficha, sugerencia de GGUF,
filtro, caché, descripción extendida del modelo, inventario de disco, rutas
ajenas a la instalación y controles móviles.

## Auditoría Argon: Model Hub V2 y recursos (2026-11-05)

Estado confirmado en `master`: catálogo HF, fichas GGUF de archivo único, estimador local, persistencia de descargas `.part`, validación de revisión y SHA-256 **condicional al checksum publicado**, medidor físico de almacenamiento y monitor GPU con `nvidia-smi`. No confundir la métrica de *ajuste estimado* con velocidad medida ni con garantía de carga simultánea con ComfyUI.

**Próximos entregables, por orden de dependencia (ver [TODO](../TODO.md)):**

1. Proteger la ruta efectiva de toda operación de descarga/copia/borrado y probar enlaces simbólicos, nombres falsos, Range incorrecto y fallos de checksum.
2. Completar la comparación por cuantización (Q4/Q5/Q6/Q8/IQ) con tamaño físico, memoria estimada de pesos y KV a 8k/16k, margen de seguridad y clasificación **Óptimo / Híbrido / Inviable**. Mostrar fuente y grado de incertidumbre de los cálculos.
3. Exponer roles separados de narrador, imagen y voz; políticas de VRAM **Exclusivo / Compartido / Secuencial** y el runtime responsable de descargar pesos *propios* antes de ComfyUI. El `asyncio.Lock` actual serializa solicitudes pero no libera pesos del motor ya cargado.
4. Ficha técnica ampliada y detalle sin perder la búsqueda, cola visible con MB/s, progreso exacto, pausa/reanudación y diagnóstico al usuario, escritorio y móvil.
5. Benchmarks reales de ciclo LLM+ComfyUI sobre 16 GB y fallback para equipos inferiores; ninguna cifra de TPS inferida debe presentarse como resultado experimental.

Para reutilizar UI y lógica de Urakatsu bajo MIT, documentar los archivos copiados, su revisión y licencia en [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). Referencias: [auditoría §§11, 18–19](ARGON_AUDITORIA.md), [gestión GPU](RECURSOS_GPU.md).
