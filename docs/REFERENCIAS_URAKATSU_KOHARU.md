# Análisis de reutilización: Urakatsu y Koharu

Investigación: 2026-11-04. Este documento registra **funciones verificadas en fuentes**, puntos de reuso y límites. Ambos proyectos se dedican principalmente a traducción/edición de manga: Noble AI no incorporará su pipeline OCR/limpieza como motor de novela.

## Versiones inspeccionadas

| Proyecto | Commit inspeccionado | Licencia | URL |
|---|---|---|---|
| **Urakatsu** | `fed313c70cf11afdba85ae2314c1a4a5b21f6bf7` | `LICENSE`: **MIT** + aviso de contribuciones Koharu | https://github.com/karrot0/Urakatsu/tree/fed313c70cf11afdba85ae2314c1a4a5b21f6bf7 |
| **Koharu** | `cd31ad2c7016b64d0ff0400a09e86cd13fb5df13` | `LICENSE-MIT` / `LICENSE-APACHE`: **MIT OR Apache-2.0** | https://github.com/koharu-rs/koharu/tree/cd31ad2c7016b64d0ff0400a09e86cd13fb5df13 |

**Revisión de licencia:** el API de GitHub muestra `NOASSERTION` para Urakatsu aunque su **archivo LICENSE** contiene explícitamente MIT. La lectura del archivo es más específica que el identificador inferido del API; registrar copyright/NOTICE si se incorpora código. La licencia de modelos externos, recursos y dependencias es independiente.

## Urakatsu: componentes concretos

| Archivo / módulo | Responsabilidad comprobada | Reutilización posible |
|---|---|---|
| `docs/models.md` | Catálogo HF, recomendación de cuantización según hardware, modelos instalados | Especificación funcional del Noble Model Hub |
| `web/src/components/ModelsPage.tsx` | Página de modelos React: búsqueda, detalles, variantes, estado de descarga, instalación y uso | Inspiración UI y potencial reuso **tras aislar dependencias y atribuir** |
| `web/src/components/ModelsStorage.tsx` | Uso de almacenamiento y carpetas de modelos | Patrones UX de almacenamiento |
| `web/src/api/catalog.ts` | Contratos JSON tipados para catálogo, fits, descargas, instalados | Adaptación de interfaces a dominio `narration/image/tts` |
| `urakatsu/catalog/hf.py` | Cliente de Hugging Face, búsqueda por runtime, caché y lectura parcial de metadata GGUF | Primer candidato a reusar algoritmo de descubrimiento |
| `urakatsu/catalog/fit.py` | Estimaciones de pesos, KV cache, overhead y niveles de offload | Reuso parcial, recalibrando presupuestos 12/16GB y colas |
| `urakatsu/catalog/service.py` | Asociación modelo→provider, cuantizaciones, comp. runtime y catálogo | Estudiar abstraer `Provider.accepts(facts)` |
| `urakatsu/catalog/installed.py` | Registro en `installed.json`, revisiones HF, descarga background y roles | Adaptación del esquema/gestión de trabajos |
| `urakatsu/service/catalog_api.py` | FastAPI JSON de búsqueda, instalados, descargas pause/resume/cancel, runtimes | Reusar patrones de API y errores, no asumir integración directa |
| `urakatsu/runtimes/{hardware,packages,manager,models_folder}.py` | Detección GPU, runtimes, carpetas, lifecycle | Spike de portabilidad, aislamiento |
| `web/src/components/SettingsPage.tsx` | Configuración de providers y modelos por etapa | Inspiración para configuración detallada |
| `packaging/launcher`, `docs/app.md` | Launcher/instalador Rust que aloja app en webview; rutas de instalación y modelos | Comparativa con Tauri 2; no copiar instalador íntegro |

Urakatsu describe niveles `gpu/partial/offload/cpu/too_large`. Para Noble: añadir `unknown` y distinguir **estimación** de **medición física**; considerar carga concurrente de LLM/imagen/TTS. No modificar internamente Urakatsu para simular un RPG: extraer ideas/módulos idóneos y adaptar.

Urakatsu obtiene **Hugging Face** como fuente de modelos, además de distinguir runtimes `llama`, `diffusion`, `torch`, `onnx`. Noble deberá detectar **función** (narración, imagen, TTS) y **motor** (KoboldCpp/Ollama/ComfyUI/Chatterbox/externo). No todo GGUF es LLM narrativo; no toda carpeta diffusion representa un checkpoint listo para ComfyUI; no todo modelo safetensors es TTS.

## Koharu: componentes concretos

| Archivo / módulo | Responsabilidad comprobada | Aplicación a Noble |
|---|---|---|
| `packages/koharu/components/preferences/ProviderPreferences.tsx` | Conexiones a proveedores y campos específicos | Ajustes de múltiples proveedores y endpoints |
| `packages/koharu/components/preferences/SettingsPage.tsx` | Secciones de configuración | Navegación de preferencias |
| `packages/koharu/components/preferences/GenerationPreferences.tsx` | Parámetros ajustables de generación | Modelo de controles avanzados del LLM |
| `packages/docs/models/providers.mdx` | Selección local, hospedada y OpenAI-compatible; descubrimiento del modelo; privacidad de credenciales | Adapter/provider registry |
| `packages/docs/reference/settings.mdx` | Config persistente por categoría, cambio de modelo y descarga de recursos | Guardar perfil y validarlo antes de activar |
| `crates/koharu-runtime/src/download.rs` | Descargas con eventos de progreso, reintentos y control | Referencia de downloads robustos |
| `crates/koharu-runtime/src/source/hugging_face.rs` | Descarga desde revisiones HF fijadas | Integridad y revisión inmutable |
| `crates/koharu/tauri.conf.json` | App escritorio Tauri (Windows, macOS, Linux) | Arquitectura de paquete desktop + web frontend |
| `packages/ui/src/components/` | Biblioteca reutilizable de controles | Patrones de componentes accesibles con licencia apropiada |

Koharu documenta que las credenciales remotas se almacenan en servicio seguro del SO. Noble debe hacer lo mismo y **mostrar cuándo el relato sale de la máquina**.

## Reuso real y atribución

**Estado actual: REFERENCIA / INVESTIGACIÓN. Ningún archivo de Urakatsu ni Koharu se ha copiado al código de Noble AI.** Todo código que se importe después debe:
1. Registrar repo + commit exacto + ruta de origen + archivos derivados + modificaciones.
2. Conservar avisos de copyright y licencia del archivo/proyecto, incluyendo notices de Koharu cuando aplique.
3. Especificar compatibilidad con licencia elegida para Noble antes de distribuir.
4. Aislar cambios propios en `integrations` o `apps` con pruebas específicas; no depender ciegamente de imports internos de Urakatsu.
5. Revisar transitive dependencies, instalaciones y llamadas de red.
6. Confirmar autoría de imágenes/sprites/UI; **no incorporar screenshots o iconos ajenos como recursos distribuidos por defecto**.

## Selección técnica

**Prioridad 1:** reproducir en Noble el flujo de `ModelsPage`: búsqueda → variantes → estimación hardware → instalar/reanudar → registrar → asignar a rol → probar → activar. Preferir reutilizar partes de `catalog/hf.py`, `fit.py` y `installed.py` **si el spike demuestra menor costo** que usar `huggingface_hub` oficialmente y diseñar API propia.

**Prioridad 2:** preferencias/providers de Koharu como guía de arquitectura; UI de Noble se diseñará para novela visual y tendrá sección Studio, Biblioteca y Model Hub.

**Prioridad 3:** comparar launcher webview de Urakatsu con Tauri 2 de Koharu. Elegir Tauri como candidato inicial, sujeto a prueba real con Python sidecar y CI Windows.

**No reutilizar por defecto:** detectores manga, OCR, inpainting de bocadillos, traductores por etapa, fuentes de lectura manga, UI exacta ni assets de terceros.

## Spikes (pendientes)

- [ ] AUD-URAKATSU-001: extraer la funcionalidad de HF search en un entorno Python limpio; licencias/atribución y tests.
- [ ] AUD-URAKATSU-002: comparar el algoritmo de fit con 12/16GB en hardware real; corregir sobreestimaciones.
- [ ] AUD-URAKATSU-003: simular descarga interrumpida, reanudación, hash, instalación, importación.
- [ ] AUD-KOHARU-001: estudiar contratos de provider/params y mapearlos a roles Noble.
- [ ] AUD-KOHARU-002: prototipo de shell Tauri+FastAPI en Windows y revisión de permisos/WebView2.

## Enlaces directos

- https://github.com/karrot0/Urakatsu/blob/main/docs/models.md
- https://github.com/karrot0/Urakatsu/blob/main/urakatsu/catalog/hf.py
- https://github.com/karrot0/Urakatsu/blob/main/urakatsu/catalog/fit.py
- https://github.com/karrot0/Urakatsu/blob/main/urakatsu/service/catalog_api.py
- https://github.com/karrot0/Urakatsu/blob/main/web/src/components/ModelsPage.tsx
- https://github.com/koharu-rs/koharu/blob/main/packages/docs/models/providers.mdx
- https://github.com/koharu-rs/koharu/blob/main/crates/koharu-runtime/src/download.rs
- https://github.com/koharu-rs/koharu/blob/main/crates/koharu/tauri.conf.json
