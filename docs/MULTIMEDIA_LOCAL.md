# Noble AI — Conectar imágenes y voces locales (P1.4)

Este documento cubre los **adaptadores reales ya conectados al código**, no un benchmark ni un asistente de instalación automática.

## Requisitos

Para generar una imagen, ejecuta ComfyUI por tu cuenta, escuchando en el mismo equipo que el backend Noble AI, normalmente `http://127.0.0.1:8188`. Instala un checkpoint compatible con workflow estándar de Stable Diffusion (CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode y SaveImage).

Para sintetizar voz, instala `piper` en PATH del backend. Coloca los pares `voz.onnx` y `voz.onnx.json` en `data/models/voices` (o la ruta derivada de NOBLE_DATA_DIR). Piper se ejecuta con CPU en esta etapa; no es necesario disponer de NVIDIA para usarlo.

## Imagen paso a paso

1. Inicia Noble AI y abre **Configuración → Imágenes y voz**.
2. Escribe la URL local de ComfyUI y pulsa **Buscar checkpoints**.
3. Selecciona uno de los checkpoints instalados y ajusta ancho/alto, pasos, CFG y prompt negativo. Guarda configuración.
4. Abre una historia en **Biblioteca → Galería** o pulsa **Ilustrar con IA** desde el panel de escena.
5. Describe personajes, fondo, luz, clima y estilo. Pulsa **Ilustrar escena con ComfyUI**. Se realizará una petición explícita, se esperará la finalización y se guardará WebP.
6. Si ComfyUI falla, la narración sigue funcionando, y una ilustración anterior permanece disponible.

El backend acepta exclusivamente endpoints HTTP loopback, con un único trabajo de difusión simultáneo y límite de 180 segundos. No se soportan todavía workflows arbitrarios, nodos personalizados, LoRAs, Flux/SD3, colas multiusuario ni difusión remota.

## Voz paso a paso

1. Instala Piper compatible con tu sistema y comprueba que `piper` funciona desde terminal.
2. Coloca ONNX y JSON de la voz en la carpeta de voces. Pulsa **Actualizar voces**.
3. Activa **Activar botones de voz bajo demanda**. No se activa autolectura.
4. En el lector, abre la pestaña **UI/UX** para seleccionar la voz.
5. Usa **Escuchar** junto a un turno ya guardado. Se sintetiza WAV si no hay caché; una segunda petición usa el archivo local.
6. Usa **Detener** para pausar la reproducción en el navegador. La aplicación no inicia síntesis al crear escenas, generar texto o entrar a una historia.

El motor Piper CPU usa hasta 120 s por petición y admite textos de hasta 3500 caracteres por turno. Se exige solicitud explícita y la configuración TTS activada. No hay clonación de voz ni soporte multicarácter automático.

## Diagnóstico y alcance

- `GET /api/v1/images/status` consulta ComfyUI sin generar ni cargar un modelo de difusión desde Noble AI.
- `GET /api/v1/tts/voices` enumera voces instaladas sin sintetizar nada.
- `GET /api/v1/health` declara `comfyui_on_demand` y `piper_on_demand`, que describen los adaptadores integrados, **no la disponibilidad garantizada** de herramientas externas.
- Todos los tests del adaptador ComfyUI utilizan transporte HTTP simulado, pero Pillow procesa una imagen PNG auténtica y la convierte a WebP.
- Los tests Piper utilizan un CLI ficticio que escribe WAV válido; todavía falta confirmar una voz Piper real.
- Si solo tienes 12–16 GB VRAM, no arranques ComfyUI y un LLM grande simultáneamente sin comprobar presupuesto. Un programador de recursos de GPU es trabajo pendiente.
- Los modelos externos y voces pueden tener licencias específicas; Noble AI no los distribuye automáticamente.

## Próximas implementaciones

Detector de cambios de escena, identidad consistente con retratos/LoRA, versiones de escena, jobs con cancelación y progreso, motores TTS GPU (Chatterbox/Qwen3-TTS), servicios API seleccionables, lector con capas y scheduler VRAM.
