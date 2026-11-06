# Diseño TTS opt-in

Estado: **P1.4 — Piper local CPU implementado con reproducción explícita**; Chatterbox Multilingual, Qwen3-TTS y modos GPU/API son siguientes adaptadores, no implementados.

## Invariantes

**El TTS solo se ejecuta cuando el usuario lo solicita**. Por defecto `tts_enabled=false`, `auto_read=false`. Navegar, escribir, continuar, guardar o producir imágenes **no** puede cargar el modelo TTS ni encolar audio. Autolectura solo tras activación explícita de la preferencia; puede desactivarse instantáneamente.

## UX

- Botón **Escuchar** por intervención o por bloque; indicador de preparando / reproduciendo / pausa.
- Selector de voz por personaje, idioma (inicial `es-419`), velocidad y estilo; narrador puede tener voz propia.
- Botón **Detener** cancela reproducción y, si soporta, job aún no iniciado.
- Si cambia de rama, audio anterior deja de reproducirse aunque termine tarde.
- Lectura de diálogos largos por fragmentos oracionales para permitir streaming, pero **sin activar síntesis antes de que haya una petición**.
- Pronunciación de nombres y topónimos configurable por historia; evaluación para español latinoamericano natural.

## Tecnología y caché

- Chatterbox repo: https://github.com/resemble-ai/chatterbox
- Variante LatAm: https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam
- Alternativa Qwen3-TTS: https://github.com/QwenLM/Qwen3-TTS
- Caché por `SHA256(texto_normalizado + character_voice_revision + model_hash + locale + options)`. Guardar audio como recurso de escena o diálogo, no directamente en mensajes.
- TTL/GC por referencias; WAV original opcional, formato de distribución comprimido según licencia y calidad requerida.
- Voz de un usuario real: solo con consentimiento explícito del titular y procedencia registrada; sin extraer audios de terceros.
- TTS worker separado con lazy initialization, configurable para CPU/GPU y capaz de liberar VRAM al terminar.

## API

`POST /api/v1/stories/{story_id}/turns/{turn_id}/speech`: solo acepta `{"voice_id":"archivo.onnx","request_source":"listen_button"}` en esta primera versión. `GET /api/v1/tts/voices` detecta voces locales. Se requiere activar `tts_enabled`. No está disponible la autolectura.

## Tests obligatorios

- 50 turnos con audio desactivado → 0 llamadas TTS, 0 modelos TTS cargados.
- Pulsar Escuchar dos veces mismo texto/voz → audio cache hit, 1 síntesis.
- Cambiar voz invalida caché de voz, **no** imágenes ni canon.
- Cambiar/editar rama evita audios huérfanos que suenan en escena distinta.
- Proveedor TTS desconectado no afecta LLM/ComfyUI.
- Prueba subjetiva de 10 frases ES-LA (entonación, nombres, diálogos, pronombres), con logs de modelo/VRAM/latencia.


## P1.4 — Configuración real de Piper

- Instala el ejecutable `piper` en `PATH`. El backend no instala runtimes ni lo arranca al abrir Noble AI.
- Coloca cada voz ONNX y su archivo `.onnx.json` en `<NOBLE_DATA_DIR>/models/voices/`. La UI lista los archivos válidos del directorio, con protección contra nombres de voz que salgan de él.
- Activa **Ajustes → Imágenes y voz → Activar botones de voz bajo demanda** y selecciona una voz en **Lector → UI/UX**.
- Pulsa **Escuchar** en un turno guardado: Piper ejecuta la síntesis CPU de ese texto. Los WAV se guardan en `story-assets/{story_id}/speech/` y se reutilizan para la misma intervención/voz.
- No se ejecuta al continuar una historia ni cuando `tts_enabled=false`; tampoco se habilita `tts_autoread`. Si falta Piper o la voz, se devuelve un error y la historia permanece disponible.
- Solo una síntesis activa a la vez; límite de 3500 caracteres y 120 s por llamada; futuros adaptadores podrán chunkear frases y usar GPU.


## Backlog TTS multi-motor y voz por personaje — 2026-11-06 (PENDIENTE)

Noble AI debe operar como un producto integral con selección, descarga, configuración y pruebas de modelos TTS desde su propia interfaz. Los motores **Pocket TTS, OmniVoice, Kokoro TTS y Qwen3 TTS** se añaden como **candidatos de integración**, no como motores ya implementados ni como garantía de compatibilidad en español latinoamericano. Mantener Piper. Para cada uno verificar repositorio de origen, licencia de código/pesos, formato, instalación/runtime, voz/es-419, requisitos reales CPU/GPU, dependencias y compatibilidad Colab/Windows.

- **Contrato común de proveedor:** \`discover/capabilities/install/voices/configure/preview/synthesize/cancel/unload/health\`; mapear y validar únicamente parámetros que el motor realmente acepte (velocidad, tono, expresividad, idioma, temperatura, tipo de voz, etc.). Parámetros no soportados deben deshabilitarse o rechazarse, no ignorarse silenciosamente.
- **Voces diferenciadas por reparto:** narrador independiente, cada NPC con \`provider_id + model_id + voice_id + options\`, overrides por historia, persistencia y remapeo de ramas. Si falta la voz, fallback declarado por la UI; si no se puede atribuir el hablante, no inventar personaje.
- **Montaje de audio:** segmentar narración y líneas atribuidas a NPC, mantener orden/pausas y niveles consistentes; caché invalidada por cambios de texto, voz, proveedor y configuración. Probar reparto completo sin disparar síntesis al abrir historias.
- **UX interna:** catálogo/instalación/progreso, parámetros avanzados del motor seleccionado, voz por personaje, escucha de muestras, dispositivos, colas, fallos y métricas en un único apartado multimedia de Noble AI. No asumir que una UI externa del runtime es el panel de configuración del usuario.
- **Evidencia requerida:** 10 frases con pronunciación ES-LA, turno con narrador y 3+ NPC, cambio y ausencia de voz, sincronización, cancelación, memoria y latencia en Colab/Windows, y pruebas unitarias de los adaptadores.

Ver [plan detallado N-16/N-17/N-21](PLAN_HISTORIAS_ANIME_2026_11_06.md) y [tareas maestras](../TODO.md). Estas tareas no sustituyen ni marcan terminado el instalador parcial de voces Piper descrito en [PIPER_VOICES.md](PIPER_VOICES.md).
