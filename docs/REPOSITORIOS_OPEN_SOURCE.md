# Catálogo de proyectos y herramientas reutilizables — Noble AI

**Corte de investigación:** 2026-11-04. Los enlaces son oficiales cuando fue posible. **Inventario, no incorporación automática.** El estado de compatibilidad expresa hipótesis hasta que exista un spike reproducible en el repositorio.

## 1. Matriz de selección

| Proyecto | URL | Licencia observada | Qué aporta | Uso propuesto | Estado |
|---|---|---|---|---|---|
| **Open Dungeon** | https://github.com/newideas99/open-dungeon | MIT | Historias locales, Continue/Retry/Edit, texto streaming, imágenes inline, SQLite, UI | **Candidato principal de referencia/reuso** UX y bucle | Revisado README; integración **pendiente** |
| **Talemate** | https://github.com/vegu-ai/talemate | AGPL-3.0 | Narrador, agentes, memoria, estado de mundo, imagen y TTS | Evaluar completo / estudiar arquitectura de agentes | Revisado README; integración **pendiente** |
| **Gamentic** | https://github.com/hec-ovi/gamentic | MIT | Narrador + agentes NPC, voz, imágenes, estado; FastAPI/SQLite | Referencia de orquestación Python, **portabilidad NVIDIA pendiente** | Investigación |
| **TaleWeaver** | https://github.com/TaleWeaverAdmin/TaleWeaver | **Licencia custom no comercial (NOASSERTION)** | Escenas/sprites/expresiones, visual novel y ComfyUI | **Solo estudiar o experimentar respetando restricciones**, no importar al core | Investigación |
| **SillyTavern** | https://github.com/SillyTavern/SillyTavern | AGPL-3.0 | Lorebooks, modo VN, extensiones, generación imagen y TTS | Referencia de UX, prompt y extensibilidad | Investigación |
| **RisuAI** | https://github.com/kwaroran/Risuai | GPL-3.0 | Expresiones de personaje, chats grupales, plataformas | Referencia de UI y fichas | Investigación |
| **KoboldCpp** | https://github.com/LostRuins/koboldcpp | AGPL-3.0 | Inferencia GGUF, CUDA/offload, streaming, API `/v1` | **Proveedor LLM recomendado**, servicio externo separado | API documentada; smoke pendiente |
| **Ollama** | https://github.com/ollama/ollama | MIT | Servicio de inferencia local, gestión de modelos, API | Proveedor LLM alternativo | Smoke pendiente |
| **llama.cpp** | https://github.com/ggml-org/llama.cpp | MIT | Motor GGUF, batching, inferencia y offload | Alternativa de bajo nivel si exige más control | Spike futuro |
| **ComfyUI** | https://github.com/Comfy-Org/ComfyUI | GPL-3.0 | Motor de workflows de imágenes con HTTP/WS | **Proveedor de imagen recomendado**, servicio externo | API documentada; smoke pendiente |
| **ComfyUI_examples** | https://github.com/comfyanonymous/ComfyUI_examples | Verificar licencia de recursos individuales | Ejemplos de SDXL, LoRA, control, inpaint | Base de workflows, no copiar modelos/outputs sin revisar | Recurso |
| **Chatterbox** | https://github.com/resemble-ai/chatterbox | MIT | TTS multilingüe, voces, variantes regionales (es-mx-latam) | **TTS primario, carga bajo demanda** | API Python documentada; smoke pendiente |
| **Qwen3-TTS** | https://github.com/QwenLM/Qwen3-TTS | Apache-2.0 | TTS expresivo y diseño de voz | TTS alternativo para evaluar | Investigación |

Verificación de licencias a fecha de corte: metadatos GitHub y README/LICENCIAS oficiales. **La licencia de un motor no sustituye la del checkpoint** que usa. Ejemplos: SDXL OpenRAIL++ y LoRAs con términos propios. Para adoptar código de terceros: conservar copyright, atribuciones y obligaciones; registrar commit exacto, archivos copiados/modificados y revisión de licencia. Los servicios externos no quedan exentos automáticamente de cualquier obligación de licencia.

## 2. Ranking operativo (no equivale a integración)

**1. Open Dungeon:** prueba de concepto excelente para controles y narrativa visual. MIT y Next.js/TypeScript. Evaluar dos rutas: (A) levantar demo intacta y medir UX/ciclo; (B) reutilizar componentes específicos documentando procedencia dentro del frontend propio. **No asumir** que su estado/DB sea compatible con Noble AI.

**2. KoboldCpp:** buen compromiso para Windows/RTX GGUF. API OpenAI-compatible documentada en `http://127.0.0.1:5001/v1`. Comparar contra Ollama con mismo modelo/prompt. **AGPL-3.0:** ejecutar como proveedor externo, sin fusionar fuentes al backend en esta fase.

**3. ComfyUI:** modular y capaz de usar workflows de anime; necesita diseñar identidad persistente y gestión de recursos. API oficial: `POST /prompt`, `GET /history/{id}`, `GET /view`, `/ws`. **GPL-3.0**; mantener límites de proceso claros y revisar distribución si se empaqueta.

**4. Chatterbox:** generación de voces español y variante LatAm documentada: https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam . Debe medirse latencia, consumo de VRAM y calidad. MIT en repositorio; revisar tarjeta de modelo particular.

**5. Talemate:** arquitectura avanzada para agentes y memoria. **No importarlo sin decisión explícita sobre AGPL**. Es un producto completo con posibles interfaces internas no estables, no una librería plug-and-play garantizada.

**6. Gamentic:** MIT, inspiración útil de FastAPI + SQLite + agentes; README orientado a AMD Strix Halo, por lo que el soporte real en NVIDIA no está demostrado por su perfil predeterminado.

**7. TaleWeaver:** experiencia VN muy pertinente, pero su licencia **no es una licencia open source aprobada por OSI para uso irrestricto**: restringe reventa/uso comercial. No incorporarlo a código distribuible de Noble sin permiso compatible.

## 3. Modelos recomendados para pruebas (pesos no incluidos)

| Función | Candidato | Origen | Estatus |
|---|---|---|---|
| Narración 12GB | Qwen3-8B GGUF Q4_K_M / Q5_K_M | https://huggingface.co/Qwen/Qwen3-8B | **Propuesto**; variantes GGUF de terceros requieren verificar uploader, artefactos/licencia |
| Narración 16GB | Qwen3-8B alta cuantización; Qwen3-14B Q4 como experimento | https://huggingface.co/Qwen/Qwen3-14B | **Benchmark pendiente** |
| Imagen anime | SDXL/Illustrious compatible con ComfyUI; checkpoint anime específico | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 | **Verificar licencia del checkpoint/LoRA seleccionado** |
| Voz ES-LA | Chatterbox Multilingual variante LatAm | https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-mx-latam | **Benchmark pendiente** |
| Voz alternativa | Qwen3-TTS | https://github.com/QwenLM/Qwen3-TTS | **Benchmark pendiente** |

No confundir cuantización del checkpoint con la VRAM total. Longitud de contexto, KV cache, batch, backend CUDA, offload y memoria de escritorio cambian resultados.

## 4. Checklist obligatorio por proveedor

- [ ] Repo/commit y fecha de auditoría registrados.
- [ ] Licencia del **código** y del **modelo** revisadas.
- [ ] Capacidad/endpoint verificados con llamada real.
- [ ] Configuración Windows probada; errores de instalación documentados.
- [ ] Configuración Colab probada (si factible) sin mecanismos que infrinjan sus límites.
- [ ] Latencia, RAM/VRAM pico y throughput medidos, con nombre de GPU.
- [ ] Streaming/cancelación/reintentos comprobados si están disponibles.
- [ ] Contratos y tests de compatibilidad automatizados.
- [ ] Se registra un ADR al decidir incorporar/cambiar proveedor.

## 5. Experimentos iniciales comparativos

**SPIKE-001:** Open Dungeon stock contra diseño Noble: puntuación UX VN, modularidad, posibilidad de extraer interfaces con MIT, tiempo de integración y mantenimiento.

**SPIKE-002:** KoboldCpp vs Ollama con **mismo GGUF, contexto, prompt y configuración**, medir arranque, primer token, tokens/s, RAM/VRAM y OOM. No extrapolar resultados entre modelos.

**SPIKE-003:** ComfyUI SDXL simple; disparar por evento de escena, obtener asset y SHA, verificar reuso.

**SPIKE-004:** Chatterbox ES-LA un diálogo de prueba de 3 personajes, latencia, MOS subjetivo, cache hit y GPU.

**SPIKE-005:** Stress 12GB/16GB: LLM preparado + trabajo imagen/TTS; medición real y scheduler. Cada spike queda en `docs/PROGRESO.md` con evidencia.

## 6. Fuentes técnicas oficiales de referencia

- KoboldCpp API: https://github.com/LostRuins/koboldcpp#apis-and-integrations y https://lite.koboldai.net/koboldcpp_api
- ComfyUI server HTTP/WS: https://docs.comfy.org/development/comfyui-server/comms_routes
- Ejemplo WS de ComfyUI: https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py
- Talemate funcionalidades: https://github.com/vegu-ai/talemate/blob/main/README.md
- Open Dungeon guía de Windows y proveedores: https://github.com/newideas99/open-dungeon/blob/main/README.md
- Chatterbox idiomas regionales: https://github.com/resemble-ai/chatterbox
- Reglas/recursos Colab: https://research.google.com/colaboratory/intl/es/faq.html

**Acciones pendientes:** verificar commits exactos antes de instalar; no vendorizar repositorios enteros sin evaluar licencia, seguridad de dependencias y coste de mantenimiento.
