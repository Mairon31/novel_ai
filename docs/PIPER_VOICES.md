# Noble AI · instalación de voces Piper desde la aplicación

## Estado y alcance

El instalador de voces se encuentra en **Configuración → Imágenes y voz → Voces de español latinoamericano**. Es un primer flujo de instalación de modelos ONNX y archivos JSON de configuración que no necesita terminal. Solo descarga al pulsar **Instalar voz**, sin generar audio ni iniciar Piper. Los archivos terminan en `data/models/voices/`, y las voces instaladas son visibles en el lector.

Catálogo inicial restringido a dos paquetes de `rhasspy/piper-voices` (Hugging Face):
- `es_MX-ald-medium.onnx`: español de México, calidad medium. [Carpeta y modelo](https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/ald/medium).
- `es_MX-claude-high.onnx`: español de México, calidad high. [Carpeta y modelo](https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/claude/high).

Es un catálogo deliberadamente limitado: no instala otros idiomas, modelos de imagen ni checkpoints de terceros sin una ruta de instalación correspondiente. Los metadatos/versiones se consultan al iniciar la instalación, **no** hay revisiones SHA supuestas. Se debe revisar el `MODEL_CARD` de cada voz para conocer sus condiciones particulares; la licencia del repositorio no sustituye la de cada conjunto de datos/modelo.

## Seguridad e integridad

1. La API acepta únicamente los dos IDs anteriores y consulta la revisión inmutable SHA-1 de 40 caracteres del repositorio HF.
2. Consulta metadatos de la pareja ONNX/JSON de esa revisión; exige tamaño conocido, los dos archivos y los límites de 300 MiB para ONNX y 64 KiB para el JSON.
3. Transfiere únicamente desde `huggingface.co/rhasspy/piper-voices/resolve/{revision}/...` usando rutas fijadas por el servidor, no URLs arbitrarias del usuario.
4. Conservará el progreso en una tabla SQLite `tts_downloads` separada de las descargas GGUF. Soporta `Range` estricto para reanudar y reinicio completo cuando el servidor ignora Range.
5. Comprueba tamaño, SHA-256 cuando el servidor lo anuncia en los metadatos LFS, JSON válido e idioma `es_MX`; detecta páginas HTML que se hacen pasar por modelos. Si falta SHA-256 LFS, no puede afirmar verificación criptográfica del origen: continúa con tamaño, revisión fijada y hash local.
6. Descarga en un directorio temporal propiedad de Noble; publica el JSON **antes** del ONNX, y evita sobrescribir otra voz existente. Las voces solo se anuncian al detectar ambos archivos. Los archivos de instalaciones canceladas se limpian sin borrar voces anteriores.
7. Las descargas activas en un cierre se marcan pausadas al reiniciar. El usuario puede reanudarlas explícitamente; el programa no reanuda una transferencia sin permiso.

No ejecuta código remoto ni evalúa archivos JSON como scripts. La verificación por cabeceras no demuestra que los pesos ONNX sean compatibles con cada versión de Piper; eso requiere un ensayo real.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/v1/tts/catalog` | Listado y si las voces están instaladas |
| GET | `/api/v1/tts/downloads` | Progreso de trabajos recientes |
| GET | `/api/v1/tts/downloads/{uuid}` | Estado de un trabajo |
| POST | `/api/v1/tts/install` | `{"voice_id":"es_MX-ald-medium.onnx"}` |
| POST | `/api/v1/tts/preview` | `{"voice_id":"es_MX-ald-medium.onnx","text":"Hola, esta es una prueba.","request_source":"preview_button"}`; WAV no persistido |
| POST | `/api/v1/tts/downloads/{uuid}/pause` | Pausar transferencia o verificación |
| POST | `/api/v1/tts/downloads/{uuid}/resume` | Reanudar tras pausa o fallo |
| POST | `/api/v1/tts/downloads/{uuid}/cancel` | Cancelar instalación pendiente |

Estados: `queued`, `downloading`, `verifying`, `paused`, `failed`, `cancelled`, `completed`. El frontend consulta progreso periódicamente durante los estados activos y luego actualiza la lista de voces instaladas.

## Qué sigue pendiente

- Instalar/actualizar el **ejecutable Piper** desde la aplicación. Actualmente debe estar disponible en `PATH` (el modelo ONNX/JSON se descarga independientemente).
- Instalar modelos de imagen/checkpoints ComfyUI desde UI, con manifiestos, formatos, compatibilidad y verificaciones de suma de comprobación.
- Descripción/filtrado del catálogo por voces, tamaños, idiomas adicionales, licencias, ejemplos de audio aprobados, y asignación de voz por personaje.
- Pruebas físicas con la voz real de Hugging Face, Piper real y reproducción en Windows/Colab. La suite automatizada simula las respuestas HTTP y no prueba calidad de voz ni descarga real.

**Pruebas de contrato**: `tests/test_piper_voice_installer.py` reproduce metadatos Hugging Face, descargas completas y parciales, integridad, archivo ausente, reanudación y cancelación sin usar red real; `apps/web/tests/piper-installer.spec.ts` comprueba el ciclo de UI en escritorio y móvil con proveedor simulado. Resultado CI se registra en `docs/PROGRESO.md`.

## Evidencia de integración

[CI #42263945875](https://github.com/Mairon31/novel_ai/actions/runs/42263945875): 378/378 pruebas Python, 76/76 pruebas Playwright en escritorio/móvil y compilación Vite PASS (descarga HF y motor Piper simulados). Se incorporó después un test de bloqueo de sobrescritura sobre archivos manuales, y una corrección independiente de atajos del lector: ambos requieren confirmación de la nueva CI.

## Prueba de voz desde Ajustes

Después de instalar el motor Piper en el entorno y una voz válida, la sección **Texto para probar voz** permite generar un ejemplo WAV pulsando **Probar voz seleccionada**. La API requiere `request_source=preview_button`, un texto de 10–400 caracteres y un archivo ONNX/JSON realmente instalado. Responde `audio/wav` con `Cache-Control: no-store`. El backend usa un directorio temporal que se limpia al finalizar; el navegador muestra controles de reproducción, sin reproducir ni sintetizar automáticamente. Comparte el bloqueo de síntesis con el lector y tiene timeout de 60 segundos y tope de 16 MiB de salida. No es una prueba de clonación de voz ni de licencia/compatibilidad física: requiere ejecutar Piper real con el modelo.

Pruebas publicadas: `tests/test_piper_speech.py` cubre muestra WAV con ejecutable simulado, eliminación del temporal y rechazo de síntesis implícita; `apps/web/tests/tts-preferences.spec.ts` valida el clic explícito en desktop y móvil. CI [#42265155907](https://github.com/Mairon31/novel_ai/actions/runs/42265155907) **PASS** (381 Python y 76 pruebas de navegador, compilación Vite). La ejecución usa un ejecutable Piper simulado; la prueba física en Windows/Colab queda pendiente.
