# Diseño TTS opt-in

Estado: propuesta. Proveedor inicial: Chatterbox Multilingual; Qwen3-TTS alternativa.

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

`POST /api/v1/turns/{id}/speech`: exige intención explícita `request_source = "listen_button" | "user_enabled_autoread"` y `voice_id`. El servidor valida `tts_enabled`/permiso y texto de turno actual antes de encolar. Caché puede devolver asset inmediato sin sintetizar.

## Tests obligatorios

- 50 turnos con audio desactivado → 0 llamadas TTS, 0 modelos TTS cargados.
- Pulsar Escuchar dos veces mismo texto/voz → audio cache hit, 1 síntesis.
- Cambiar voz invalida caché de voz, **no** imágenes ni canon.
- Cambiar/editar rama evita audios huérfanos que suenan en escena distinta.
- Proveedor TTS desconectado no afecta LLM/ComfyUI.
- Prueba subjetiva de 10 frases ES-LA (entonación, nombres, diálogos, pronombres), con logs de modelo/VRAM/latencia.
