# ADR-0002 — App-first, Model Hub integrado y selección de proveedores por usuario

Fecha: 2026-11-04 · Estado: **Aceptada como nueva prioridad de producto** · Actualiza ADR-0001 donde se describía "Colab primero".

## Contexto

El proyecto original proponía Colab como primera interfaz de pruebas. El objetivo real es una app web que evolucionará a `.exe`, con wizard, búsqueda/descarga/instalación de modelos, selección de proveedores y parámetros, similar a los patrones encontrados en Urakatsu y Koharu. El usuario no quiere configurar pesos o instalaciones ejecutando manualmente celdas antes de poder utilizar el producto.

Fuentes estudiadas:
- Urakatsu MIT, commit `fed313c70cf11afdba85ae2314c1a4a5b21f6bf7`: ModelsPage + catalog + downloads + runtime management.
- Koharu MIT OR Apache 2.0, commit `cd31ad2c7016b64d0ff0400a09e86cd13fb5df13`: providers/settings, descarga, Tauri.

## Decisión

1. **Producto APP-FIRST**: UI React/Vite/TS + API FastAPI; setup visual y Model Hub son prerequisitos de UX. Colab pasa a **entorno de pruebas opcional** (benchmarks/diagnóstico, no app principal).
2. El núcleo propio administra **model roles** independientes: narration, image, tts; proveedor, modelo, device, settings y perfil son objetos separados.
3. **Descubrimiento HF + instalaciones** desde UI con metadatos/licencias/quant, hardware fit estimado y descarga segura/resumible, registro duradero y reuso offline.
4. **Proveedores locales/remotos** compatibles cuando se implementen; opciones se basan en capacidades declaradas por cada adapter, no toggles ficticios.
5. **Ejecución diferida**: UI y API ligeras al arrancar; LLM elegido se inicia para jugar, imágenes según escenas/solicitud, voz solo si el usuario la activa explícitamente.
6. **Tauri 2 candidato desktop** con sidecar FastAPI y motores como procesos externos/administrados. Continuar soportando navegador local.
7. Presets editables por rol, override por historia, prioridad narrativa y elegibilidad hardware 12/16GB.
8. Reutilizar con atribución, sin incorporar todavía código de Urakatsu/Koharu hasta spike y revisión de dependencias.

## Trade-offs

**Ventajas:** cero necesidad de editar config manual en producto; la app escala a nuevos motores, control real de GPU, experiencia coherente Colab/local y facilidad futura de distribución.

**Costes:** gestor de descargas + verificación + runtime supervisor + interfaces/persistencia complejos; mayor esfuerzo de inicio. Reducir mediante módulos MIT y `huggingface_hub`; no escribir un framework entero de ML.

## Implicaciones

**Prioridad cambia:** primero wizard y Model Hub funcionales, luego narrativa P1, después imagen/TTS. El notebook P0 previo se conserva como diagnóstico **no obligatorio** y se actualizan README/GDD/roadmap/AGENTS.

## Verificación

No basta con documentación: requiere prueba de búsqueda HF real, instalación de variante GGUF pequeña, selección/arranque del runtime, guardado de settings, y un turno narrativo jugable **sin tocar consola/Colab**.

Referencia [#9](https://github.com/Mairon31/novel_ai/issues/9), [#10](https://github.com/Mairon31/novel_ai/issues/10), [#11](https://github.com/Mairon31/novel_ai/issues/11), [#12](https://github.com/Mairon31/novel_ai/issues/12).
