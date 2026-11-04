# Noble AI — experiencia de aplicación, onboarding y diseño UI

Estado: especificación v0.1. **La interfaz aún no está implementada.**

## Objetivo de experiencia

El usuario descarga/instala Noble AI, abre **una aplicación visual** y configura modelos y herramientas sin escribir comandos, gestionar archivos `.env` ni utilizar Colab. Noble AI podrá ofrecer una web local con las mismas pantallas, y más adelante empaquetarse en escritorio.

**Navegación general:** `Inicio / Biblioteca`, `Crear historia`, `Mi estudio`, `Modelos`, `Descargas`, `Configuración`, `Diagnóstico`.

## Pantallas del primer inicio (wizard reanudable)

| Paso | Pantalla | Acción del usuario | Respuesta de la app |
|---|---|---|---|
| 0 | Bienvenida/idioma | Elegir idioma (ES-LA predeterminado) | Guardar preferencia local |
| 1 | Diagnóstico | Seleccionar GPU/CPU o Automático; revisar RAM/VRAM | Detectar dispositivos, drivers y estimar presets |
| 2 | Almacenamiento | Elegir carpeta de modelos/proyectos/caché | Ver espacio y permisos, aceptar discos externos |
| 3 | Narrador | Buscar/cargar GGUF o conectar Ollama/KoboldCpp/API remota | Mostrar quant, tamaño, compatibilidad y descargar si falta |
| 4 | Ilustraciones | ComfyUI/local, buscar modelo o saltar | Configurar política: escena progresiva u on-demand OFF |
| 5 | Voces | TTS local/remote, modelo y dispositivo opcionales | TTS OFF inicialmente y **sin carga** |
| 6 | Resumen | Ver selección y costos/compatibilidad | Descargar únicamente lo solicitado; probar conexión |
| 7 | Biblioteca | Crear una historia o importar una existente | Arrancar la historia; iniciar LLM asignado si está listo |

**Reanudar:** el asistente almacena step completado/validación y puede continuarse tras reinicio; un usuario avanzado puede abrir la interfaz sin completar medios opcionales. Si no hay LLM, la Biblioteca funciona para leer/importar/editar, pero el botón generar informa cuál falta y lleva al Model Hub.

## Model Hub — estructura visual propuesta

```text
╭─────────────────────────────────────────────────────────────────────────────────────────────╮
│ Noble AI   Biblioteca   Crear   Modelos*   Descargas   Ajustes   Diagnóstico                │
├───────────────┬──────────────────────────────────────────────────────┬──────────────────────┤
│ Categorías    │  Descubrir  Instalados  Descargas  Proveedores      │ Modelo seleccionado  │
│ Narración     │ [ Buscar en Hugging Face ...                🔎 ]    │ Nombre + versión     │
│ Imágenes      │ [GPU estimada ▼] [12/16GB] [Tipo] [Licencia]       │ Fuente + licencia    │
│ Voces         │                                                      │ Cuantizaciones       │
│              │  [ Modelo A  GGUF · Q4 · compatible estimado ]       │ Tamaño + VRAM/RAM    │
│ Opciones      │  [ Modelo B  SDXL · workflow requerido ]             │ Descarga/Instalar    │
│ Importar      │  [ Modelo C  TTS · ES-LA · prueba pendiente ]        │ Usar en narración    │
├───────────────┴──────────────────────────────────────────────────────┴──────────────────────┤
│ GPU: NVIDIA ...   Modelos: ruta elegida   Descargas: 1 activa   LLM: listo   TTS: inactivo    │
╰─────────────────────────────────────────────────────────────────────────────────────────────╯
```

Esto es **wireframe escrito**, no una captura, demo o UI funcional. Debe transformarse en componentes reales con pruebas visuales y validación de UX.

## Ajustes — categorías

**General:** idioma, tema, tipografía, accesibilidad, paths/backup, actualizaciones.
**Modelos:** default model assignments, instalados, dispositivos por modelo, profiles.
**Narración:** proveedor/URL, modelo/quant, contexto, sampling, reasoning, memoria/canon, estilo, parámetros avanzados.
**Imagen:** ComfyUI/workflow/checkpoint/LoRA/VAEs, prompts, cfg/steps, seed, resolución, escenarios auto/manual; opciones de contenido mediante checkpoint/metadata, sin promesa ficticia de filtro universal.
**Voces:** Chatterbox/Qwen3-TTS/Piper, voz por personaje, CPU/GPU/Auto según soporte, idioma, velocidad, calidad, cache; audio OFF al iniciar.
**Hardware/rendimiento:** GPU seleccionada, RAM/VRAM, prioridad narrativa, offload, límites de jobs y uso actual.
**Proveedores:** local vs remoto, API URL, claves en keyring, test de conexión, reglas de privacidad.
**Datos:** modelos/caché/proyectos, importar/exportar, desinstalar y recuperar archivos.
**Diagnóstico:** estado de motores, versiones, fallos, logs filtrados, benchmark reproducible.

## Plantillas de perfiles (config global + por historia)

Cada herramienta tendrá **perfil global** y **override por historia**:
- Global `default_narrator`, `default_image`, `default_voice`.
- Story `override_narrator`, `override_image`, `override_voice` opcionales y versionados.
- Perfil `Rápido` para VRAM 12GB, `Calidad` 16GB, `CPU` y `Personalizado`; nunca asumir que 12GB caben modelos ilimitados.
- **Mostrar configuración efectiva** y resolver precedencia `story override > global profile > provider defaults`.
- Parámetros de un modelo se validan contra `provider.capabilities` y se muestran deshabilitados si no aplica.
- Cambiar perfil no borra archivos ni reinventa el canon de historias anteriores.

## Modo novela visual

Una interfaz de juego distinta de Model Hub: escenario a pantalla, sprite/expresión según situación, diálogos y prosa diferenciados, modo lectura, continuar/reintentar/editar y entrada Hacer/Decir/Narrar. Los cambios de modelo se acceden desde menú rápido, pero los controles avanzados permanecen en Studio/Settings para no saturar el reproductor.

**Móvil:** navegación de drawers, panel de texto adaptable, botones de 44px, retratos sin tapar el texto, control de zoom/accesibilidad y fallback sin ilustraciones. **Desktop:** layout adaptable y paneles ajustables.

## Estado visual obligatorio

UI siempre diferencia `no configurado`, `descargando`, `instalado`, `cargando`, `listo`, `en uso`, `error`, `incompatible`, `desconocido`. No mostrar un botón "Instalado" si solo se descargó una parte; no afirmar "compatible" por el tamaño de fichero.

**No fake buttons:** cada control debe activar API real o indicar inhabilitación y motivo; los prototipos no cuentan como funcionalidades.

## Criterios de pruebas

- Wizard con 0 modelos funciona y se puede reanudar.
- Cambios de proveedor/modelo guardan perfil y persisten tras reinicio; sin editar archivos de configuración.
- Webview desktop y navegador usan **mismo backend** y contratos.
- GPU de 12/16GB: warning de modelo sin soporte y opción CPU/offload cuando realmente exista.
- Se puede desactivar medios opcionales y jugar texto.
- Todo estado de descarga/instalación se refleja sin refrescar manualmente.
- Capturas/Playwright en 390x844 y 1440x900, sin overflow, inputs ocultos ni controles de mentira.
- Logs de cargas: abrir Settings/TTS no carga modelo TTS por defecto.

Referencia: [Model Hub](MODEL_HUB.md), [Arquitectura](ARQUITECTURA.md), [Roadmap](ROADMAP.md).
