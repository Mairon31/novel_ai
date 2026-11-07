# Noble AI — bitácora de progreso

**Regla:** un check marcado [x] significa un hecho observado (archivo creado, investigación documentada, ejecución con logs, etc.). No confundir **diseño completado** con **módulo implementado o probado**. Registrar commit, fecha, comandos, resultados y fallos.

## 2026-11-04 · P0: documentación fundacional

**Estado general:** `P0_DOCUMENTACION`. Repositorio GitHub inicializado desde vacío; sin versión ejecutable de Noble AI y sin benchmark real de Colab/Windows.

### Entregado

- [x] README inicial con visión y reglas de producto.
- [x] GDD técnico y criterios de aceptación.
- [x] Arquitectura de servicios/adapters/colas.
- [x] Contratos HTTP/SSE propuestos y eventos.
- [x] Política de canon, memoria, branching y esquema conceptual.
- [x] Investigación de repositorios y advertencias de licencias.
- [x] Políticas imagen por escena y TTS solo con solicitud.
- [x] Perfiles GPU 12/16GB **teóricos** y estrategia Colab→Windows.
- [x] Roadmap, QA, seguridad y guía para agentes de implementación.
- [x] Notebook de diagnóstico Colab y checks de documentación agregados al repositorio (cuando se confirme su commit).
- [x] GitHub Actions de integridad documental **PASS**, ejecución [#41894085644](https://github.com/Mairon31/novel_ai/actions/runs/41894085644) para commit `9d87341d` (esto **no** prueba GPU/LLM).
- [x] Backlog registrado en GitHub Issues [#1–#8](https://github.com/Mairon31/novel_ai/issues).
- [ ] Ejecutar notebook en Colab con GPU real.
- [ ] Prueba real de KoboldCpp / Ollama.
- [ ] Prueba real de ComfyUI.
- [ ] Prueba real de Chatterbox.
- [ ] Backend/frontend de producto.
- [ ] Benchmarks 12/16GB.
- [ ] QA visual del producto (no existe todavía UI ejecutable).

### Decisiones

- Arquitectura por adaptadores, sin incorporar de entrada un repo entero con GPL/AGPL.
- Open Dungeon (MIT) primer candidato de reutilización para UX y loop.
- KoboldCpp + ComfyUI + Chatterbox como servicios; Ollama/Qwen3-TTS alternativas.
- La disponibilidad de API del LLM no significa que todas las capas deban residir en VRAM.
- Imágenes progresivas y audio opt-in son invariantes no negociables.

### Riesgos abiertos

1. **R1** — 12GB: coexistencia LLM/SDXL; requiere offload/scheduler/bench.
2. **R2** — coherencia visual anime entre escenas; se probará con identidad versionada.
3. **R3** — Open Dungeon permite MIT pero arquitectura interna puede costar adaptar; spike pendiente.
4. **R4** — licencias GPL/AGPL/no-comercial; no copiar código sin revisión.
5. **R5** — Colab GPU y duración variables; pruebas en celdas sin prometer servicio permanente.
6. **R6** — voz español latinoamericano, calidad y consumo; benchmark TTS pendiente.

### Próxima acción técnica

Ejecutar `notebooks/noble_ai_colab_smoke.ipynb` en Colab y guardar JSON de diagnóstico/resultado; luego implementar y verificar contrato P1 de historia/eventos y primer adaptador narrativo.

## 2026-11-04 · ADR-002 — experiencia APP-FIRST y catálogo de modelos

**Estado**: nueva arquitectura documentada, sin runtime/UI de producto implementados. Cambio confirmado de prioridad: Colab pasa de supuesto punto de entrada a herramienta de pruebas opcional; el usuario configura todo desde un futuro wizard y Model Hub integrados.

**Investigación realizada:** Urakatsu `fed313c70` con licencia **MIT en LICENSE** (GitHub API marca NOASSERTION) y Koharu `cd31ad2c` dual MIT/Apache; se inspeccionaron módulos de catálogo HF, compatibilidad/descargas, API, Settings y empaquetado. **No se ha copiado código**.

- [x] Nuevo documento de análisis de repos, commits, licencias y rutas de reutilización.
- [x] Especificación detallada Model Hub con búsqueda, descarga, importación, quant, licencias, registrador y asignaciones.
- [x] Wizard, configuración de proveedores, dispositivos CPU/GPU por herramienta y parámetros por motor.
- [x] Diseño de futuro shell Tauri 2 + backend FastAPI sidecar; acceso web local.
- [x] ADR-002 y roadmap APP-FIRST, nuevos issues #9–#12.
- [x] Esquema y ejemplo de asignaciones de modelos en config (propuesta, sin conexión a runtime).
- [ ] Navegación/frontend operativo.
- [ ] Catálogo/descarga reales.
- [ ] Proveedor LLM cargado desde UI.
- [ ] Empaquetado Windows.
- [ ] Tests GPU 12/16GB.

**Riesgos nuevos:** mantener referencias de modelos/proveedores separadas; instalar archivos/ejecutables no verificados; soportar proveedores con capacidades distintas; mover/suprimir modelo sin borrar archivos ajenos; compatibilidad cuant estimada vs real; empaquetar un backend Python como sidecar en Windows.

**Siguiente tarea prioritaria:** implementar Model Hub y wizard desde UI (issues #9 y #10), comenzando por `/health`, `/hardware`, `/models/search` real, registros y contratos. Colab ya no bloquea P0.5.

## 2026-11-04 · P0.5 — primer Model Hub ejecutable

- [x] Backend FastAPI real: health, hardware NVIDIA/CPU, settings, catálogo Hugging Face, detalle GGUF, instalación/descargas, roles.
- [x] Gestor SQLite: registro de modelos, jobs, reanudación HTTP Range, SHA-256 contra metadata cuando disponible.
- [x] Frontend React/Vite con wizard, catálogo, detalles, instalaciones, descargas, ajustes, diagnóstico.
- [x] Python API unit/integration **simulados** PASS (incluye descarga parcial/reanudación y SHA).
- [x] Frontend Vite/TypeScript build PASS.
- [x] Playwright **4 PASS**: 2 recorridos desktop/móvil con backend real, 2 pruebas de tarjetas/detalle con catálogo simulado para QA visual (no confundir con respuestas HF live). Capturas inspeccionadas.
- [x] **Búsqueda LIVE** en la API pública de Hugging Face y lectura del detalle: script `scripts/probe_hf_catalog.py`, **PASS** en [CI #41901149116](https://github.com/Mairon31/novel_ai/actions/runs/41901149116). Consulta `Qwen` devolvió 6 repositorios, con revisión y 1 variante GGUF inspeccionada del primer resultado.
- [ ] Descarga completa de GGUF público a un equipo y ejecución LLM con hardware real.
- [ ] Importar archivos locales y estimar RAM/VRAM, menú completo de parámetros, runtime KoboldCpp/Ollama.
- [ ] Integración imagen/TTS y novela jugable, ejecutable Windows.

**CI auditada:** [#41901149116](https://github.com/Mairon31/novel_ai/actions/runs/41901149116) API/frontend + HF live probe + **4 e2e PASS**, [#41901267472](https://github.com/Mairon31/novel_ai/actions/runs/41901267472) CI final API/frontend/Playwright PASS. Artefactos `noble-ai-visual-qa` con capturas desktop/móvil. No equivale a inferencia ni descarga real de pesos.

**Defectos detectados y corregidos:** regex GGUF, transacción SQLite, cantidad de columnas en INSERT, ruta raíz de la aplicación, expression GitHub Actions, carrera de reanudación.

**No afirmar como verificado:** carga de modelos reales, throughput, GPU 12/16GB, calidad de historias, ComfyUI o TTS.

## 2026-11-04 · P1 — primer lector narrativo y runtime local

**Objetivo:** conectar modelos existentes y generar turnos de historias desde Noble AI, con persistencia sin duplicar respuestas.

### Implementado

- [x] Adaptador Ollama `/api/tags` y `/api/chat` NDJSON, adaptador KoboldCpp `/v1/models` y `/v1/chat/completions` SSE.
- [x] Configuración narrador persistente por UI: proveedor, modelo, URL loopback, temperatura, top-p, contexto, tokens, Auto/CPU para Ollama.
- [x] Nuevas tablas SQLite `llm_preferences`, `stories`, `story_turns` con idempotencia por historia/request_id.
- [x] API de creación/listado de historias, historial y generación `POST /stories/{id}/generate` como SSE (`delta`, `done`, `error`).
- [x] Lector frontend responsive: biblioteca, creador de historia, premisa, Hacer/Decir/Dirigir, Continuar, streaming de texto y recuperación del historial.
- [x] Lanzador KoboldCpp administrado con archivo instalado, ruta al ejecutable seleccionada por usuario, capas GPU `-1 / 0 / N`, contexto, puerto y host 127.0.0.1; detener proceso **solo si fue iniciado por Noble** y activar narrador.
- [x] Endpoints de runtime: status, modelos registrados, start/stop/activate.
- [x] **21 pruebas Python PASS** (motor y proceso simulados, DB real SQLite, stream, error, persistencia, validaciones), **6 Playwright PASS** (desktop/móvil, rutas y lector con respuesta LLM ficticia).
- [x] Capturas reales frontend desktop/móvil generadas por Playwright.
- [ ] Probar KoboldCpp/Ollama con un **modelo realmente cargado** en RTX 5060 Ti; aún no existe benchmark 12/16 GB.
- [ ] Installer de runtime/ejecutable desde la UI, auto detección de GPU/layers, importación local, supervisor robusto con recuperación de OOM.
- [ ] Branching/Retry/Edit, memoria estructurada, canon y eventos; ComfyUI/TTS.
- [ ] Instalador Windows .exe y Tauri sidecar.

**Evidencias:** [GitHub Actions #41905069185](https://github.com/Mairon31/novel_ai/actions/runs/41905069185) — Python y build web PASS; Playwright 6/6 PASS, capturas en artefacto `noble-ai-visual-qa`. **No confundir** adapter simulado, binario mock y UI renderizada con inferencia real.

**Errores corregidos durante esta etapa:** fixture NDJSON mal escapado producía SyntaxError; tests de runtime modificaban por error `socket.socket` global e interrumpían el event loop de TestClient; se aisló el chequeo de puerto. No se dejan suites fallando en commit final validado.

### Próxima prioridad

1. Ejecutar P1 **en GPU real** con GGUF seleccionado; medir y guardar parámetros/hash, VRAM/RAM pico, latencias y captura del resultado.
2. Integrar importador de modelos locales / descarga de runtime desde UI y recuperación de fallo de proceso.
3. Añadir branching/Retry/Edit y memoria de personajes/canon; continuar hacia ComfyUI para generación de escena progresiva.
4. QA visual recurrente de los nuevos paneles y estabilidad móvil.

## 2026-11-04 · P1.1 — continuación, lector inmersivo y worker remoto

**Recuperación:** la sesión anterior terminó en `5d6a08a` con Python en verde y frontend fallido por contrato `worker_id` faltante. Se corrigió la definición frontend y el selector de la prueba visual. No se ocultaron las ejecuciones con fallos: [Actions](https://github.com/Mairon31/novel_ai/actions).

### Implementación publicada

- [x] Configuración de salida de idioma y estilo narrativo en SQLite; OpenRouter mediante clave de almacén del sistema o entorno, y parámetros específicos del proveedor.
- [x] Centro de configuración organizado: idiomas, apariencia, proveedor, runtimes de solo lectura, atajos, red, About y consulta de canales stable/beta/nightly. La instalación/rollback de builds y runtimes continúa sin implementar.
- [x] Lector inmersivo: panel visual de escena, cuerpo narrativo con diálogos destacados, panel lateral Resumen/Historial/Galería/UI-UX, modo responsive móvil y creación en dos etapas (mundo y nombre de protagonista).
- [x] Importación segura PNG/JPG/WebP como WebP local por historia, sin generación de difusión ni descarga de imágenes no solicitadas.
- [x] Worker GPU remoto: URL HTTPS Cloudflare validada, token fuera de SQLite, test de autenticación, descubrimiento de modelos y selección para narrador.
- [x] Proxy autenticado con dos rutas OpenAI compatibles. Solamente se conecta a un upstream loopback.
- [x] Panel de workers: registrar, comprobar, seleccionar y activar modelo o eliminar credencial.
- [x] Tests Python de persistencia, proxy y media con motores simulados; corrección de selector Playwright obsoleto.
- [ ] Ejecutar y medir worker real con un LLM real en Colab o segunda PC.
- [ ] Worker automático que inicie Colab, instalación cloudflared y recuperación de desconexión.
- [ ] TTS, ComfyUI y generación progresiva de escenas: pendientes.
- [ ] Compartir el servidor Noble AI con otros dispositivos mediante autenticación de sesiones: pendiente.
- [ ] Instalar/aplicar releases stable/beta/nightly desde un binario empaquetado: pendiente.

**Referencia operativa:** [WORKERS.md](WORKERS.md). Registrar siempre evidencia CI del commit final; no declarar PASS hasta el estado final de GitHub Actions.

## 2026-11-04 · P1.2 — telemetría, Colab y validación pendiente en GPU

- [x] Telemetría de solicitudes/errores y GPU NVIDIA opcional mediante nvidia-smi, sin guardar prompts.
- [x] Proxy con `GET /v1/health` autenticado, TTFT, tiempos y límite de solicitud de 1 MB (también fragmentada).
- [x] Registro de workers con latencia y salud remota, visualización VRAM en desktop/móvil.
- [x] `tools/worker_benchmark.py`: verificación autenticación, SSE, P50/P95 y JSON sin secretos.
- [x] `notebooks/noble_worker_colab_gpu.ipynb`: arranque CUDA llama.cpp, GGUF Qwen, proxy y Quick Tunnel, benchmark.
- [x] Pruebas offline de protocolo, parsing y sintaxis del notebook. Sus datos GPU son simulados.
- [ ] Ejecutar notebook en **Colab real** y conservar su JSON, logs y versión NVIDIA.
- [ ] Verificar desconexión de túnel real, OOM, latencia de contexto largo y 12/16 GB.
- [ ] Implementar adaptadores de imagen (ComfyUI) y TTS con roles de worker propios.

- [x] Prueba de resiliencia simulada: corte de túnel después de un fragmento, cero turnos parciales persistidos y reintento con el mismo request_id.
- [x] Botón de prueba explícita **Medir respuesta real** desde UI con resultado TTFT/duración/caracteres, sin persistir texto de ensayo.
- [ ] Ejecutar este botón conectado a un Colab verdadero y comparar con el benchmark CLI.

**Importante:** herramientas y tests automatizados no equivalen a un benchmark físico; registrar el CI del commit final y la futura sesión real por separado.

## 2026-11-04 · QA v1.3 — 13 PASS, 1 FAIL, 1 SKIP

- [x] Reporte real Colab T4 v1.3: 37 tests Python, 8 Playwright y build FastAPI/React correctos.
- [x] Instalar llama.cpp CUDA precompilado, verificar SHA256 de binarios y resolver bibliotecas: PASS.
- [x] Diagnóstico de 404 Hugging Face: prefijo GGUF solicitado incorrecto (`Qwen3-` en vez de `Qwen_Qwen3-`).
- [x] v1.4: consulta del catálogo Hugging Face antes de descargar, revisión pinneada y SHA256 de archivo.
- [x] Pruebas de contrato sin red para archivo exacto, prefijo corregido, cuantización ausente y ambiguo.
- [ ] Repetir Colab v1.4 con GPU real para obtener la primera generación de texto.
- [ ] Verificar VRAM/TTFT, SSE y guardar reporte JSON real.

Ver [Resultados QA v1.3](COLAB_QA_V13_RESULTADOS.md). **No se generó contenido en v1.3; benchmarks vacío.**

## 2026-11-04 (CR) / 2026-11-05 (UTC) · Primer benchmark real del narrador en Colab

- [x] ZIP v1.4 revisado: **20 PASS, 0 FAIL, 0 SKIP**; duración 279,4 segundos; commit ensayado `191a71e`.
- [x] Tesla T4 con Qwen3 4B Instruct Q4_K_M, carga real vía llama.cpp CUDA 12.8 y API FastAPI.
- [x] Modelo: 2.381,59 MiB, revisión HF `ae44f08e1...`, SHA256 verificado y registrado.
- [x] **3/3 turnos narrativos reales**: primer TTFT 51,255 s; segundos TTFT 159 ms y 146 ms; respuesta completa de cada uno en 53,53/2,43/2,43 s.
- [x] Pico de VRAM **muestreado** 3.161 MiB; uso GPU máximo observado 96%.
- [x] Frontend React, 42 pruebas Python y 8 de navegador aprobados (navegador con LLM fixture).
- [ ] Medir fase cold vs. warm con intervalos confiables (n=2 para warm, insuficiente para percentiles robustos).
- [ ] Obtener muestras de texto sintético para evaluar calidad, coherencia y español latinoamericano.
- [ ] Medir workers **por túnel**: este ensayo utilizó localhost en Colab, no conexión remota real.
- [ ] Ejecutar imagen/TTS y hardware RTX 5060 Ti 16 GB u otros perfiles con evidencia física.
- [ ] Corregir campo de metadatos `version: 1.3` heredado en el notebook v1.4.

Ver [informe del primer ensayo GPU real](COLAB_QA_V14_RESULTADOS.md). Los números de VRAM/latencia se refieren solamente al Qwen 4B en Tesla T4, no a cualquier modelo.

## 2026-11-04 · P1.4 — servicios multimedia y canon sin nueva ronda de benchmarks GPU

- [x] Servicio ComfyUI local exclusivamente por botón; ninguna carga al inicio de la app.
- [x] Pipeline API nativo con checkpoint y prompt explícitos, polling y WebP validado; se conserva la escena previa ante error.
- [x] Servicio Piper CPU bajo demanda, voces instaladas en modelos/voices, WAV cacheado y rechazo de voz deshabilitada.
- [x] Lector con diálogo Escuchar/Detener, solicitud Ilustrar, estados de preparación, tiempo transcurrido y opción de cancelar.
- [x] Canon de historia editable y persistente; integración del contexto confirmado en el siguiente prompt LLM.
- [x] Tests independientes para imágenes, síntesis ficticia, almacenamiento, flujo SSE y ataques de ruta.
- [ ] Motor de detección automática del cambio de escena y de identidad de personajes.
- [ ] Entorno ComfyUI real, TTS Piper real y capacidad de compartir VRAM.
- [ ] Modelos especializados y voz GPU/servicios por API, instalador Windows.

**Evidencia:** commits del historial \`master\` y GitHub Actions. Tests de contrato con proveedores simulados, no benchmark real ComfyUI/Piper.

## 2026-11-04 · P1.4 (extensión) — ramas independientes y preparación del narrador

- [x] Migración de SQLite para \`origin_story_id\` y \`origin_turn_id\` sin perder historias anteriores.
- [x] Servicio \`fork_story\`: copia premisa, canon, protagonista, turnos históricos y WebP; turnos futuros no cambian el original.
- [x] UI Historia → Historial → Crear rama con cambio automático a la nueva historia.
- [x] \`POST /api/v1/narrative/prepare\`: llamada breve bajo demanda al LLM, sin registrar datos como turnos.
- [x] Pruebas de aislación de rama/SQLite/imagen y pre-calentamiento con motores simulados.
- [ ] Árbol de ramas, variantes por personaje, diffs de canon, editor avanzado de estado.
- [ ] Test ComfyUI/Piper con motores y checkpoints reales (pospuesto hasta fase de QA agrupada).

## 2026-11-04 — P1.5 visual: escenas, galería e identidad textual

- [x] Tablas `visual_scenes`, `visual_assets`, `visual_current` y `visual_characters`, migración SQLite idempotente.
- [x] Heurística de localizaciones explícitas con corrección manual, sin consumo de modelos.
- [x] Assets WebP versionados, restauración de versiones anteriores y compatibilidad `scene.webp`.
- [x] Galería en lector y fichas visuales editables con número de revisión.
- [x] Prompt ComfyUI enriquecido solo con personajes nombrados, nunca con todo el reparto.
- [x] Firma de render y reuso de imagen con seed/config/checkpoint/estado visual idénticos.
- [x] Bifurcación que clona líneas de tiempo y assets visuales sin compartir IDs ni revelar escenas posteriores.
- [x] Pruebas offline de registros, regeneración controlada, recuperación, imágenes antiguas y ramas.
- [ ] Detector semántico robusto, con localización, cast, cambios de vestuario y estado temporal.
- [ ] Referencias visuales reales (IPAdapter, LoRA), proveedor imagen cloud, TTS GPU y scheduler VRAM.
- [ ] Ensayos GPU reales de ComfyUI/Piper/OpenRouter solo después de completar varios módulos, según la decisión de QA.

**Nota:** «detección automática» aquí significa detección **heurística**; no hay garantía de comprender todo cambio de escena. No se crea imagen automáticamente al guardar o reproducir un turno.

## 2026-11-04 — Referencias de imágenes y control de VRAM (P1.6)

- [x] README rediseñado como presentación profesional: banner propio, badges, Mermaid, capturas reales de Playwright (escritorio/móvil) y enlace a la guía de colaboración.
- [x] Capturas auténticas optimizadas WebP en `docs/assets/screenshots/` mediante workflow de publicación de artefactos.
- [x] ComfyUI img2img con ilustración de la galería como referencia, VAEEncode y denoise 0.2–0.95.
- [x] Verificación de ownership y SHA256 de referencia; subida HTTP multipart al ComfyUI local, nombre validado.
- [x] Caché incluye el hash de la imagen de referencia y denoise; nunca escribe encima del asset original.
- [x] `ResourceController`: telemetría real mediante nvidia-smi bajo demanda; supervisor de VRAM y modo opcional de admisión.
- [x] Ajustes para supervisión o bloqueo por reserva, GPU seleccionable y excepción explícita de una generación.
- [x] Tests offline: grafos img2img, caché, aislamiento, proveedor inválido, telemetría y política; CI frontend/móvil.
- [ ] IPAdapter/LoRA/consistencia de rostro, rutas de provider multimodal comercial, scheduler con control real de memoria compartida y offload.
- [ ] Ensayos de GPU ComfyUI/Piper agrupados cuando varias integraciones estén listas.

Ninguna fase de esta entrada representa un nuevo benchmark físico; se trata de API, archivos de imagen, UI y tests de integración simulados.

## Plantilla para futuras entradas

```md
## YYYY-MM-DD · Fase / issue / commit
Objetivo:
Archivos cambiados:
Pruebas ejecutadas (comandos):
Entorno y GPU:
Resultados PASS/FAIL/SKIP con evidencia:
Capturas/logs:
Problemas/regresiones:
Cambios de alcance/ADR:
Siguiente tarea:
```

No editar entradas anteriores para borrar un fallo; agregar una corrección fechada con referencia.


## 2026-11-04 — Planes visuales y coordinación de trabajo local

- [x] Tabla `scene_plans` por escena con plano, iluminación, dirección, atmósfera, reparto validado y personaje de referencia.
- [x] UI de edición, selección de integrantes y previsualización del prompt del plan.
- [x] Migración de referencias visuales por personaje; verificación de integridad SHA256 y propiedad por historia.
- [x] Remapeo de planes, perfiles y referencias en forks sin exponer escenas eliminadas por el punto de bifurcación.
- [x] ComfyUI integra el plan guardado y una imagen vinculada al personaje focal cuando existe.
- [x] Coordinación opcional de GPU local entre narración, precalentamiento y ComfyUI, con estado activo y bloqueo 409.
- [x] Corrección de condición de carrera SQLite al crear la escena inicial; nuevas lecturas concurrentes no crean escenas duplicadas.
- [x] Tests de contratos, persistencia, concurrencia, aislamiento y Playwright móvil/escritorio.
- [ ] Integrar IPAdapter/FaceID o LoRA real para identidad multiimagen y combinaciones de varias referencias.
- [ ] Scheduler con cola/cancelación de jobs, gestión por dispositivo y offload de memoria entre motores.
- [ ] Benchmarks físicos de estabilidad y rendimiento de modelos multimedia en GPU.


## UX/Creator/Model Hub — estructura de lectura y autoría independiente

- Biblioteca con portadas y sin entrar automáticamente a la última historia.
- Lector exclusivo de historia con navegación de vuelta a Biblioteca y panel de inspección secundario.
- Creator Studio dedicado: sinopsis pública, trama para jugador, mundo secreto de IA, instrucciones, recordatorios, fichas NPC y múltiples aperturas.
- Corrección de bug crítico: `NarrativeService.messages` conserva la acción actual del jugador en vez de sustituirla por preferencias de idioma.
- Model Hub con ranking del catálogo, detalle enriquecido, estimación por cuantización/VRAM/RAM/KV y recomendación de GGUF.
- Configuración organizada por inteligencia, multimedia, aplicación y conexión.
- Documentación de investigación propia sobre Creator/Player de Isekai Zero y atribución MIT a Urakatsu.
- Pendientes separados: compositor de sprites por expresión, capítulos/arcos con resúmenes, capas de publicación/distribución, instalador multimedia y pruebas físicas por GPU.

## 2026-11-04 — Medios del creador y comparador de Model Hub

- [x] Investigación de los campos de creación de historias/personajes y la separación visual de fondos y sprites, basada en guías de Isekai Zero.
- [x] Creator Studio: biblioteca independiente para importar fondos y PNG de primer plano con captions editables y asociación opcional al NPC.
- [x] API de medios con subida, listado, selección por contexto, eliminación y entrega de PNG/WebP; almacenamiento propio por historia.
- [x] Lector: composición de fondo y sprite de personaje cuando las descripciones coinciden con el último texto narrativo. No ejecuta difusión.
- [x] Bifurcaciones: remapeo de vínculos narrativos, personajes visuales y recursos multimedia para evitar compartir IDs mutables.
- [x] Model Hub: comparación visual de memoria estimada frente a presupuesto disponible y filtros de cuantizaciones.
- [x] Tests de Pillow, PNG alfa, permisos, selección de captions y navegador (desktop/mobile).
- [ ] Portada editorial propia, editor de expresiones/poses, posicionamiento de múltiples sprites y triggers semánticos auditables.
- [ ] Validación con GPU real y motor de paquetes para difusión/TTS.

No se añadieron bitácoras ni advertencias internas a la portada pública README.


## 2026-11-05 — Reutilización directa de interfaz MIT en Model Hub

- [x] Investigación de licencia Urakatsu MIT y Koharu MIT/Apache; registrada la reutilización sin prohibiciones innecesarias en las referencias técnicas.
- [x] Integración de inspección lateral de modelos y caché de sesión inspirados/adaptados del `ModelsPage.tsx` de Urakatsu.
- [x] Adaptación del indicador `FitCell`: porcentaje aproximado de GPU, VRAM/RAM estimada, caché de contexto y estado de espacio en disco.
- [x] Consulta de `README.md` de modelos por SHA de revisión y hasta 128 KiB, con presentación textual segura.
- [x] Pruebas de ruta, límites, validación, acceso restringido y renderizado en lector de fichas de modelos.
- [ ] Comparación detallada multi-modelo, soporte de información técnica de runtimes de imágenes y voces y sincronización real con una instalación de GPU.

## 2026-11-05 — Rediseño de Model Hub, biblioteca y configuraciones

- [x] Revisión del código fuente de Urakatsu con licencia MIT y verificación
  de su commit de origen `165bf592716019b8487249bf7ca3ff3b708a23e7`.
- [x] Adaptación real del patrón de caché de descubrimiento y detalles en
  `apps/web/src/modelCatalogCache.ts`; atribución y licencia preservadas.
- [x] Model Hub con inspector lateral interactivo en escritorio, panel
  superpuesto para móvil, caché con caducidad y protección contra respuestas
  tardías al cambiar de modelo/contexto.
- [x] Vista editorial de historia: Biblioteca → Detalle (sinopsis, género,
  tags, protagonista, últimos turnos) → Lector inmersivo, con acceso directo
  a la edición en Creator Studio.
- [x] Página general de Configuración con tarjetas de acceso a subsistemas,
  estado del idioma, modo de imagen, proveedor y versión.
- [x] Backend de almacenamiento administrado: tamaños reales de modelos
  registrados y archivos parciales, estado del disco, exclusión de symlinks y
  rutas externas; UI de inventario y bloqueo de asignación de archivos faltantes.
- [x] Pruebas en Python y Playwright de historia, caché de modelos, parámetros
  y almacenamiento en disco; regresiones detectadas en CI y pruebas corregidas.
- [ ] Panel de portada editorial propio, gestor de modelos por runtime para
  imagen/TTS, cola de generación de trabajos y scheduler con offload auténtico.
- [ ] Benchmarks físicos agrupados en CUDA/ComfyUI/TTS.


## 2026-11-05 — Ficha editorial con elenco y elección de aperturas

- [x] Pantalla de detalle de historia conectada con `creatorBlueprint`, `creatorCharacters` y `creatorAssets`, con solicitudes independientes; una galería ausente no bloquea la sinopsis ni los NPC.
- [x] Elenco con retratos PNG vinculados al personaje; si no tiene recurso asociado se muestra una ficha sin fotografía. Galería de fondos y primeros planos con nombres reales del catálogo local.
- [x] Separación editorial: sinopsis y trama del jugador visibles; reglas, instrucciones, recordatorios y trama privada de IA no se imprimen en la ficha.
- [x] Hasta seis escenas de apertura del creador se presentan como elecciones antes del primer turno. El botón llama la API existente y abre el lector con el turno persistido; al retomar una partida ya iniciada no se ofrecen aperturas de reemplazo.
- [x] Diseño responsive para escritorio y 390 px, con selección deshabilitada durante la operación; protección para navegación concurrente.
- [x] Se agregó `apps/web/tests/story-editorial.spec.ts` para probar apertura #2, sustitución de `{{user}}`, persistencia del primer turno, privacidad del contexto interno, retratos y galería con FastAPI real.
- [x] Documentación de licencias: se eliminó la prohibición general de reutilizar interfaces de proyectos open source. Las licencias de código se aplican según su texto, y los assets externos se revisan por separado.
- [ ] QA: ejecutar `npm run build` y Playwright desktop/móvil en GitHub Actions; **no se declara PASS antes de la evidencia del workflow**.
- [ ] Siguiente evolución: portadas editoriales dedicadas (sin usar la primera escena como portada), poses/expresiones multi-sprite y disparadores semánticos con control manual.

**Alcance:** integración de datos y experiencia de lectura; no se añadió inferencia de imágenes, se duplicó la persistencia de historias ni se publicaron assets de terceros.


## 2026-11-05 — Portadas editoriales persistentes (implementación directa en `master`)

- [x] Migración incremental de SQLite: `stories.cover_asset_id` independiente de `scene.webp`.
- [x] Recurso `kind=cover` importable desde Creator Studio: PNG/JPEG/WebP se valida, normaliza y guarda como WebP; no se usa como fondo narrativo.
- [x] Endpoint `PUT /api/v1/stories/{story_id}/creator/cover` para seleccionar o quitar portada con verificación de pertenencia, tipo de archivo y formato UUID.
- [x] `cover_image_url` en la lista y detalle de historias. Biblioteca y ficha editorial priorizan portada persistente; sin portada mantienen la imagen narrativa anterior como fallback.
- [x] Eliminar una portada seleccionada actualiza el registro; crear una rama clona el recurso y remapea `cover_asset_id` a un asset independiente de la historia original.
- [x] Creator Studio presenta vista previa de la portada, importación con selección automática, selección manual de portada alternativa y opción de quitar portada.
- [x] Pruebas de API en `tests/test_creator_media.py`: formato, validación, identidad, eliminación, fork y separación de imágenes narrativas.
- [x] Prueba Playwright `apps/web/tests/story-cover.spec.ts` en perfiles desktop/móvil: importación, portada en biblioteca y detalle, quitarla sin borrar la historia.
- [ ] Verificar cierre de CI del commit final y conservar enlace a ejecución antes de declarar todos los tests aprobados.
- [ ] Evolución posterior: editor de composición de portada (título, recorte, tipografía, variantes), preferencias por historia y administración de recursos de modelos de difusión/TTS.

**Flujo Git:** implementación directa sobre `master`, sin abrir ramas adicionales. Los assets, las escenas y el estado del narrador se mantienen separados.

## 2026-11-05 — Incorporación integral de la auditoría Gemini Argon y primeros fixes P0

**Fuente:** [Auditoría Argon, 22 secciones](ARGON_AUDITORIA.md). **Backlog operativo:** [`TODO.md`](../TODO.md). Se adoptó la tabla maestra §18 como nomenclatura de tareas porque §05 reutiliza las etiquetas AUD-005/006/007 para asuntos distintos.

### Incorporado a documentación (directamente en `master`)

- [x] Se creó `TODO.md` con prioridades P0–P3, seis fases, requisitos por subsistema, casillas cerrables con pruebas, criterios de aceptación, licencias y diferenciadores. Commit `c8a212597c6f`.
- [x] Se vinculó el seguimiento desde `README.md`, `AGENTS.md`, `ROADMAP.md` y `QA_Y_ACEPTACION.md`; `AGENTS.md` dejó de describir erróneamente el repo como vacío.
- [x] Se incorporaron requisitos concretos, límites de evidencia y contratos futuros en `ESTADO_Y_MEMORIA.md`, `MODEL_HUB.md`, `IMAGENES.md`, `SEGURIDAD_Y_LICENCIAS.md` y `CONTRATOS_API.md`.
- [x] Se corrigió la interpretación del informe estático: **ya existían** SQLite WAL, SSE, streaming en cliente con AbortSignal, descargas HTTP Range/`.part`/hash cuando HF lo aporta, inventario de modelos protegido y serialización GPU local. Nada de eso implica que estén concluidas las garantías P0 de extremo a extremo.

### Primer trabajo de código P0 — Integridad de archivos y SQLite

- [x] `store.py`: se añadieron `PRAGMA synchronous=NORMAL` y `PRAGMA foreign_keys=ON` en cada conexión, manteniendo WAL y `busy_timeout` (commit `46f164605fd9`).
- [x] `creator_media.py`: validar UUID canónicos, clase de recurso y ruta resuelta bajo el directorio de medios antes de leer/escribir/eliminar; rechazar symlinks que salgan del espacio propio (commit `e2ec06bf9e1f`).
- [x] `downloads.py`: volver a validar ruta y metadatos de trabajo persistidos y bloquear destino/parcial con enlaces simbólicos externos **antes de crear carpetas** (commit `3125ef3ba83c`).
- [x] Se agregaron tests de traversal/UUID, directorio enlazado fuera de la historia, `.part` enlazado fuera del almacén y PRAGMAs SQLite (commits `50f12950121c` y `1bfca72d02ce`).

### Evidencia CI

- [x] [GitHub Actions #41994792794](https://github.com/Mairon31/novel_ai/actions/runs/41994792794) para `1bfca72d02ce`: **101 pruebas Python OK**; **24 pruebas Playwright PASS** con API real y navegadores para escritorio/móvil; frontend build PASS. Las pruebas nuevas `test_owned_asset_paths_reject_traversal_and_symlinked_directories`, `test_download_rejects_symlink_escape_without_writing` y `test_sqlite_connection_enforces_integrity_pragmas` se ejecutaron y aprobaron.
- La CI usa proveedores mock en pruebas Python; **no hay validación GPU física** en este registro.
- Las ejecuciones CI de los commits adicionales de documentación deben comprobarse por separado; una CI de un SHA anterior **no certifica** otro SHA.

### Próximos bloqueantes (no concluidos)

- [ ] Transacciones del turno narrativo + cambios de estado/escena con rollback único, migraciones y estrés concurrente; WAL aislado no resuelve todos esos casos.
- [ ] Cancelación de inferencia y liberación efectiva de GPU upstream, incluido worker remoto, comprobada con desconexión de cliente y carga real.
- [ ] Descarga interrumpida a mitad de archivo, verificación de Content-Range y checksum adversarial, protección frente a carreras entre procesos locales.
- [ ] Arbitraje VRAM con descarga voluntaria de pesos propios y medición real de 20–25 ciclos texto/imagen; testigos/Lorebook/contexto y sprite-caché en fases siguientes.

## 2026-11-05 — P0 SQLite: concurrencia, WAL y rollback (continuación)

- [x] `store.py` inicializa WAL **una vez** en el arranque, y configura `busy_timeout`, `foreign_keys`, `synchronous=NORMAL` por conexión; evita repetir una operación que puede competir con escritores activos. Commit `5baa2c12a5ce`.
- [x] Nueva suite `tests/test_sqlite_concurrency.py` prueba 50 commits de turnos concurrentes en 12 threads, unicidad/lectura completa, rollback ante error intermedio y FK de historia inexistente. Commit `676e79387378`.
- [x] [CI run #41995580802](https://github.com/Mairon31/novel_ai/actions/runs/41995580802) — ejecución **completa y exitosa**: Python **104/104 OK**, frontend compilado y **24/24 Playwright PASS**, incluidas las tres pruebas nuevas. No hubo benchmark físico de GPU.
- [ ] Esta prueba concurrente **no** certifica simultaneidad con imágenes/ComfyUI, atomicidad de turno + escena, ni comportamiento GPU; las tareas correspondientes siguen abiertas en `TODO.md`.

## 2026-11-05 — P0: commit atómico narrativo, galería segura y descargas HTTP Range

**Rama:** `master`, sin PR ni rama adicional. **Referencia:** `TODO.md` (AUD-001 y AUD-003), `ARGON_AUDITORIA.md` §§05, 18, 19, 21.

### Entregado y probado

- [x] `narrative.py` ahora guarda el turno, `stories.updated_at` y la transición heurística de escenario en una sola transacción. `visual_state.py` ofrece `observe_turn_in_transaction(conn, ...)`, sin abrir otra conexión ni confirmar por separado. Fallar en esa operación revierte el turno. Commits `0ac1eaf3ecea`, `855a18201dd8`.
- [x] `tests/test_sqlite_concurrency.py`: pruebas de rollback por fallo visual, reintento idempotente tras rollback y ausencia de transición duplicada. Commit `7c47226e0800`. [CI #41996621807](https://github.com/Mairon31/novel_ai/actions/runs/41996621807): exitosa.
- [x] `visual_state.py` exige UUID canónico y rutas bajo `story-assets` para versiones de galería y arte legado, rechazando symlinks que salgan de la carpeta. `media.py` aplica esa validación antes de entregar `scene.webp`. Las rutas inválidas responden 404. Commits `5149d75fa349`, `329949af2ccb`, `f65911fb04fd`.
- [x] Los archivos temporales de escritura (`*.webp.part`) se validan antes de usarse; si falla `legacy_copy`, la publicación de imagen revierte la nueva fila de galería y su selección, sin dejar un registro activado a medias. Commits `c664d0c7649d`, `4dc27ae329a6`.
- [x] `tests/test_visual_state.py` añade ataques de enlace simbólico a galería/legacy, rechazo de temporal enlazado y rollback de publicación. Commit `3d770ec4a076`. [CI #41997120265](https://github.com/Mairon31/novel_ai/actions/runs/41997120265): **109/109 Python + 24/24 Playwright PASS**.
- [x] `downloads.py` valida respuesta 206 completa (`start/end/total`, `Content-Length` si existe y bytes entregados), rechaza 206 sin solicitud de Range y no registra fragmentos truncados como modelo instalado. Commits `6e4725d6e085`, `9334c83df501`, `81cb36acd232`.
- [x] `tests/test_api_model_hub.py` añade escenarios de Content-Range corrupto, rango no solicitado y descarga truncada incluso sin tamaño/hash upstream. Commits `35c34856a078`, `21bf0d94e238`, `accf29454aa5`. [CI #41997636863](https://github.com/Mairon31/novel_ai/actions/runs/41997636863): **112/112 Python + 24/24 Playwright PASS**.
- [x] `Store.assign` ahora rechaza archivos GGUF de registros externos y symlinks fuera de `models_dir`; prueba nueva `test_installed_model_outside_storage_cannot_be_assigned` (commits `6ebde66a6fd0`, `f4e5a4871906`). [CI #41997814690](https://github.com/Mairon31/novel_ai/actions/runs/41997814690): **113/113 Python + 24/24 Playwright PASS**, frontend build correcto.

### Límites y próxima intervención

- [ ] La atomicidad recién introducida cubre el turno y la **transición visual heurística**, no todas las mutaciones del canon, de `scene_plans` ni las copias de activos entre ramas. Aún falta migración/Unit of Work integral.
- [ ] Aunque se validan rutas antes de operar, quedan posibles carreras TOCTOU con symlinks manipulados entre comprobación y apertura; para máxima protección revisar apertura por descriptor de archivo y modo sin seguimiento de enlaces.
- [ ] Completar pruebas de pausa durante red, interrupción de hash, checksum no anunciado y recuperación tras corte, con registro de byte y commit. Los tests actuales son offline/mocks, **no descargas reales de modelos enormes**.
- [ ] Cancelación real de cómputo en runtime/worker, VRAM bajo ciclos LLM/ComfyUI, memoria híbrida, Lorebooks y sprites siguen abiertos en `TODO.md`.

## 2026-11-05 — P0 SSE: interrupción sin commit de turnos incompletos

- [x] `narrative.stream_turn` acepta la señal asíncrona de desconexión del cliente (`Request.is_disconnected`) y la verifica antes de iniciar, entre fragmentos del proveedor y justo antes del commit. FastAPI inyecta `Request` en `/api/v1/stories/{id}/generate`. La cancelación de la tarea por `StreamingResponse` mantiene el cierre de los contextos asíncronos de HTTP upstream y la liberación del lease local en `finally`. Commit `df7549f55e20`.
- [x] Dos nuevas pruebas en `tests/test_narrative.py`: corte de flujo tras un delta y desconexión entre tokens, ambas sin registro de turno parcial y con reserva GPU local liberada; el mismo `request_id` se puede reintentar. Commit `6febbf0353a4`.
- [x] [GitHub Actions #41998507145](https://github.com/Mairon31/novel_ai/actions/runs/41998507145): **ejecución completa exitosa**, **115/115 pruebas Python**, **24/24 Playwright** y compilación frontend correcta. Incluye ambas pruebas de cancelación sin commit parcial.
- [ ] **No certificado:** stop inmediato de procesos Ollama/KoboldCpp/Colab con GPU física, desconexión cuando el motor no entrega más tokens y objetivos de TTFT o cancelación menores a 250 ms. El siguiente hito requiere instrumentación y una prueba física real de los proveedores; los mocks no permiten afirmarlo.

## 2026-11-05 — P0: cancelación activa de SSE y model upstream sin tokens

**Rama** `master`. Partida de auditoría Argon: AUD-004. Esta fase amplía el cierre de stream previo, sin confundir un abort HTTP con apagado físico de los pesos de un proveedor.

- [x] `narrative.py` incorpora `_generate_until_disconnect`: mientras espera el siguiente chunk del proveedor, comprueba periódicamente la desconexión, cancela la lectura pendiente y cierra el generador HTTP en `finally`. Se corrigió una regresión por comprobaciones duplicadas de desconexión antes de cerrar el cambio. Commits `637a92e8469f`, `03014753f903`, `4fda845ee7d5`.
- [x] `tests/test_narrative.py` reproduce una generación que deja de enviar tokens, espera a que se inicie la siguiente lectura y comprueba cierre, ausencia de turno incompleto y liberación de lease local. Commits `4bf6af25e52d`, `283b6af7c94c`, `4fda845ee7d5`.
- [x] Nuevo registro de generaciones temporales por pareja `story_id/request_id` y endpoint `POST /api/v1/stories/{story_id}/generate/{request_id}/cancel`, que señala la petición activa antes y durante la espera SSE, y elimina el registro al terminar. La misma petición activa no se registra dos veces. Commit `97543923198f`.
- [x] API frontend y `StoryStudio.tsx`: botón Detener, cambio de historia y regreso a Biblioteca abortan fetch **y** envían señal HTTP al servidor. El UUID activo se guarda y limpia con verificación de pertenencia para evitar carreras con una generación nueva. Commits `20676baf43e8`, `b65744b20859`.
- [x] Pruebas Python de endpoint, cancelación de upstream bloqueado y liberación de recursos. [CI #42050811867](https://github.com/Mairon31/novel_ai/actions/runs/42050811867): **118 Python OK + 24 Playwright PASS**, build frontend aprobado.
- [x] Playwright específico del botón Detener en desktop/móvil: `apps/web/tests/story-cancellation.spec.ts` (commit `277752b046b3`), comprueba URL, UUID de historia/solicitud, petición HTTP POST de cancelación y que no se guarde turno mientras la inferencia está bloqueada. [CI #42051166584](https://github.com/Mairon31/novel_ai/actions/runs/42051166584): **118 Python + 26 Playwright PASS**, ambos proyectos navegador.
- [ ] La orden `cancel_requested=true` **solo indica señal entregada**. Queda pendiente medir, con GPU real, si los motores Ollama/KoboldCpp/worker detienen el cálculo y cuándo pueden liberar pesos; no se garantiza una latencia concreta con estos mocks.

## 2026-11-05 — P0 Model Hub: concurrencia de descargas, SHA cancelable y publicación

- [x] Se implementaron `Store.transition_download` (actualización condicional del estado) y `Store.complete_download` (confirmación de archivo GGUF y fila SQLite bajo bloqueo `BEGIN IMMEDIATE`). El cambio de estado `completed` no puede intercalarse con otro control de descarga. Si falla el registro SQLite, se intenta devolver el fichero final a `.part`. Commit `0d626c95e84b`.
- [x] `DownloadManager.control` admite pausa/cancelación durante `verifying`; la verificación SHA consulta el estado durante el procesamiento, y la transición a `verifying` no sobrescribe una cancelación anterior. El cierre de la aplicación usa el mismo mecanismo condicional. Commit `871d7e6b4c4c`.
- [x] Un `.part` de tamaño exactamente conocido y completo se verifica directamente tras reanudar sin HTTP 416 por `Range` desde el EOF. Commit `4eb57f992b7b`. La recuperación con tamaño upstream desconocido sigue pendiente.
- [x] `tests/test_api_model_hub.py` incorpora tres pruebas: pausa/resume en la fase SHA sin segundo GET, cancelación inyectada dentro de `hashlib.update` y error SQL forzado mediante trigger `RAISE(ABORT)` después del renombrado, con restauración del `.part`. Commits `9f3b84e099ca`, `8b6790708fd9`, `1a976b5eb3e1`.
- [x] [CI #42052817678](https://github.com/Mairon31/novel_ai/actions/runs/42052817678): **121 pruebas Python y 26 pruebas Playwright aprobadas**, incluidas las tres nuevas; frontend compilado correctamente. Ejecución completa exitosa.
- [ ] Quedan pendientes: reconciliación ante corte **físico** de energía y manipulación de archivos simultánea (TOCTOU), pausas de transferencia sin tamaño upstream conocido y pruebas físicas de un GGUF grande. El caso de rename ya está cubierto en el siguiente registro.

## 2026-11-05 — P0: conciliación de GGUF huérfano al reiniciar

- [x] Problema corregido: entre el rename del `.part` y el commit del modelo en SQLite, una caída inesperada podía dejar el fichero final sin registro; la reanudación anterior intentaba una nueva descarga. `Store.restore_orphaned_download` ahora devuelve el archivo a `.part` bajo `BEGIN IMMEDIATE`, con compensación si falla SQLite, y marca el trabajo `paused` para **verificación completa posterior**, sin declararlo instalado. Commit `eafaab6d4f83`.
- [x] `DownloadManager.reconcile_interrupted` corre al iniciar el gestor **sin contactar Hugging Face, sin cargar GPU ni recorrer archivos ajenos**; consulta todos los jobs pausados/fallidos persistidos, valida identificadores y rutas y genera un resumen `recovered/conflicts/skipped`. Ante symlinks externos, `.part` y GGUF simultáneos o instalación ya registrada, no mueve ni elimina archivos. Commit `b3aed9db02f8`.
- [x] Reanudar una descarga marcada como conflictiva ya no puede sobrescribir silenciosamente el GGUF final. Dos defensas: validación antes de transferir y negativa a renombrar en `Store.complete_download`, con actualizaciones de estado condicionales. Commits `4186b4f011a5`, `1532e4555f53`.
- [x] Nueva suite `tests/test_download_recovery.py`: recuperación y re-verificación SHA sin red; conciliación idempotente; archivo corrupto rechazado; conservación de ambos archivos conflictivos; bloqueo de symlink externo; preservación de instalación previa y prueba de intento de reanudación tras conflicto. Commits `31187c27241d`, `0f78ec26e1f8`.
- [x] Python **127/127 PASS** en [CI #42062222624](https://github.com/Mairon31/novel_ai/actions/runs/42062222624). La fase de navegador se comprueba por separado antes de atribuir un resultado completo a esta ejecución.
- [ ] Límites: no hay garantía de seguridad ante sustitución concurrente de symlinks entre validación y operación (TOCTOU), no se simularon cortes de alimentación reales, no hay reconciliación de múltiples instancias escribiendo el mismo almacén ni recuperación específica de archivos completos sin tamaño publicado.


## 2026-11-05 — Integridad de GGUF sin tamaño publicado (P0 AUD-003)

- [x] HTTP `416` con `Content-Range: bytes */N` se interpreta como final válido solamente si `N` coincide con los bytes `.part`; se vuelve a verificar SHA antes de publicar el GGUF. Si el encabezado es ausente, inválido o indica otro tamaño, se conserva `.part` y se marca error. Commit `2e73b86bf843`.
- [x] Una respuesta `206` se acepta únicamente si entrega el tramo final completo y su longitud real corresponde a `Content-Range`; no se registra una respuesta intermedia como archivo completo. Se rechazan respuestas `204`, compresión binaria inesperada, longitud `Content-Length` inconsistente en `200` y archivos sin cabecera `GGUF`. Commits `e1d9efb0a245`, `431d97d030fb`.
- [x] `tests/test_unknown_size_resume.py` valida EOF 416, 416 falso, 206 completo e incompleto, `200` que ignora Range, ausencia de metadata/estado `local_hash_only`, SHA diferente, encabezado GGUF incorrecto y codificación. Se corrigió un fixture HTTP de compresión válido. Commits `686d4d76b23e`, `c625c2045002`, `377290500295`.
- [x] [CI #42068338409](https://github.com/Mairon31/novel_ai/actions/runs/42068338409): **142 Python + 28 Playwright PASS**, build frontend aprobado.
- [ ] No cubierto: servidor que no proporciona longitud total fiable por ningún método, corrupción física, carrera de archivos/symlinks, cortes de red CDN real y publicación multiinstancia.

## 2026-11-05 — Lorebook por historia y editor de contexto (P1 AUD-006/AUD-014)

- [x] `lorebook.py`: tabla SQLite por historia, CRUD por UUID bajo propiedad de historia, palabras claves primarias y secundarias (any/all), coincidencia Unicode completa/subcadena con escape de regex, `always_active`, `enabled`, prioridades de 0 a 100 y selección determinista bajo tope de 6000 caracteres. No se ejecutan expresiones arbitrarias, scripts ni embeddings. Commit `3ae50e7a9491`.
- [x] `NarrativeService.messages` activa entradas únicamente desde la intervención actual y cuatro turnos recientes; no utiliza el contexto secreto del creador como disparador, mantiene el contenido privado dentro del mensaje de sistema y conserva la ventana de 16 turnos. Las ramas reciben copias con IDs nuevos e independencia de escritura. Commits `99d32712b5de`, `2b68d37cd33c`.
- [x] `CreatorStudio.tsx`: pestaña Lorebook independiente, creación/edición/borrado, claves y prioridad, flags de activación, previsualización de selección con el texto realmente inyectado y uso de presupuesto; vista responsive. Commits `46a3c65dcaf4`, `6566b830ab3a`, `10e9f0f9c5de`, `7a7d29dbc733`, `1911486a011f`.
- [x] Suite `tests/test_lorebook.py`: valida activación/aislamiento, palabra completa con Unicode, prioridades, budget, CRUD, ramas aisladas, persistencia al reiniciar, secretos del autor no activadores, y recuperación explícita de un hecho después de 110 turnos. Playwright `apps/web/tests/lorebook.spec.ts` valida creación y previsualización desde escritorio y móvil. Commits `bcd29b0b16ef`, `905c3698af67`, `7c12d087a576`.
- [x] [CI #42069895220](https://github.com/Mairon31/novel_ai/actions/runs/42069895220): **151 pruebas Python + 30 Playwright PASS**, build web.
- [ ] Faltan lorebooks por personaje/testigos, regex con timeout, recursión acotada, tokenización real, memoria episódica con procedencia y KV-cache inspeccionable. Ninguna de estas tareas se marca como implementada.


## 2026-11-05 — P1: estado confirmado del mundo, snapshots y canon histórico

- [x] `world_state.py`: nuevo servicio y tablas SQLite `world_states`, `world_turn_snapshots`, `world_state_edits`. Datos confirmados por el autor: ubicación, hora, clima, NPC presentes, inventario, relaciones, indicadores booleanos y hechos públicos o con testigos específicos. Validación de propiedad por historia y compare-and-set de revisiones (409 ante sobrescritura concurrente). Commits `10f9cdb11b00`, `7546bbafb46e`, `6d61f6f27850`.
- [x] `NarrativeService.append` registra snapshot **en la misma transacción** que el turno y la transición visual: fallo SQLite revierte todo. `WorldStateService.context` filtra hechos privados cuando ninguno de sus testigos figura presente; nunca se autoconfirma estado a partir de salida no validada del modelo. Commit `d2f6f60d6270`.
- [x] `fork_story` clona snapshots con UUID remapeados; el punto de bifurcación define estado pasado. Se encontró y corrigió fuga del **canon textual futuro**: cada snapshot lleva `canon_text`, se restaura el canon del turno seleccionado y se migra la tabla antigua. Commits `c940fffdd843`, `470a5d871c42`, `52e25e9bda76`, `7669f9899f08`.
- [x] `WorldStateEditor.tsx`: nueva pestaña en Creator Studio con edición manual, testigos, relaciones, flags, inventario y hechos; visor de snapshots (incluye canon antiguo). CSS responsive, tipos API y validación de UI. Commits `1c21a8a2db63`, `bbe7bf817b5c`, `6d4ed8ce63b6`, `1d0894406b35`, `7e45d2e04a07`.
- [x] `tests/test_world_state.py`: pruebas de revisiones, propiedad de NPC, hechos privados/públicos, instantáneas inmutables, rama desde cutoff, canon histórico, hechos con IDs estables en snapshots, migración de base antigua, reinicio y rollback total. **162 Python PASS** en [CI #42074620459](https://github.com/Mairon31/novel_ai/actions/runs/42074620459), incluidos los ensayos de escritura concurrente y bloqueo de testigo de otra historia.
- [x] `apps/web/tests/world-state.spec.ts`: edición y guardado real de datos, personajes/testigos, indicador, hecho privado, creación de turno y comprobación de snapshot antiguo, recarga desde disco; desktop y móvil PASS. El selector ambiguo de confirmación inicial se corrigió en `3e0c3dd5803b`. [CI #42074620459](https://github.com/Mairon31/novel_ai/actions/runs/42074620459): **162 Python + 32 Playwright PASS**, build frontend correcto, ejecución completa exitosa.
- [ ] Límites: todavía no existe rebobinado destructivo integral ni validación semántica de las respuestas del modelo. La clonación multi-módulo ya está unificada en una transacción (ver siguiente fase); siguen pendientes los ensayos de durabilidad ante corte eléctrico real y fsync de directorios.


## 2026-11-05 — P0/P1: bifurcaciones multi-módulo atómicas y recuperación de archivos tras crash

- [x] `NarrativeService.fork_story` cambió de seis o más transacciones independientes a **una sola transacción SQLite `BEGIN IMMEDIATE`** para insertar historia, turnos, historial visual, galería, perfiles visuales, planes, blueprint, personajes del creador, imágenes editoriales, portada, Lorebooks y snapshots/estado estructurado. El ID de la rama no es visible desde otra conexión hasta confirmar el conjunto. Los métodos de clonación reciben `conn` opcional y usan `nullcontext` cuando se integra en el Unit of Work; el resto de la API conserva compatibilidad. Commits `6376d9472a88`, `670de26a0b7c`, `0665378713dc`, `0e13934c257a`, `ddcc1b108c58`, `94bcbe4b911f`, `c3394b7e39c2`.
- [x] Las copias físicas se realizan dentro del ciclo transaccional; ante una excepción de cualquier clonador, se revierte toda la base y se limpia la carpeta UUID de la rama nueva. Un archivo editorial referenciado que desapareció o es symlink no se omite silenciosamente: la operación falla, sin publicar una rama incompleta.
- [x] Un cierre de proceso en medio de la copia puede dejar archivos externos a SQLite. Ahora se crea `fork-staging/<UUID>.pending` antes de copiar (flush + fsync de marcador); `recover_incomplete_forks` corre al crear la API, toma el mismo bloqueo de escritura SQLite, borra exclusivamente carpetas UUID de ramas marcadas **sin fila confirmada**, elimina marcadores obsoletos de ramas confirmadas sin borrar imágenes y no toca carpetas no marcadas. Los symlinks externos quedan excluidos. Commits `5b1d373148d2`, `7708550a85f9`.
- [x] Nueva suite `tests/test_fork_atomicity.py`: inyecta fallo **después de escribir** en visual, creator, creator_media, Lorebook, world y planner; fallo parcial de copia de archivo; éxito con módulos completos; recuperación de marcador huérfano, preservación de rama confirmada, rechazo de symlink y dos bifurcaciones simultáneas sin mezclas. Commits `37cf8b571b49`, `d90ca3ccc468`, `1320512db1bc`, `dee6ffdca156`.
- [x] [CI #42078434977](https://github.com/Mairon31/novel_ai/actions/runs/42078434977): **171 Python y 32 Playwright PASS** con compilación frontend correcta. La última prueba comprueba que un recurso editorial referenciado y ausente impide publicar una rama incompleta. Las fallas iniciales por referencia de variable de conexión y firma del mock de copia se corrigieron; las CI intermedias fallidas no se cuentan como aprobadas.
- [ ] La atomicidad SQLite no asegura persistencia física de imágenes tras un corte eléctrico. Quedan pruebas de fallo real de proceso, fsync del directorio de staging y de archivos copiados, corrupción de filesystem, y uso multi-proceso en condiciones de energía inestable.


## 2026-11-05 — P1: Lorebook/NPC por turno y rebobinado seguro en el lector

- [x] **Lorebook histórico:** nueva tabla `lorebook_turn_snapshots` en `lorebook.py`, inserción **dentro del commit del turno**, endpoint `GET /api/v1/stories/{id}/lorebook/turns/{turn_id}`, clones con remapeo de UUID consistente y fuente histórica según `until_turn_id`. No se copian entradas actuales a un turno que carece de snapshot por ser anterior al subsistema. Commits `bd00b47c6640`, `573beff23609`.
- [x] **NPC e instrucciones de autor históricos:** `creator_turn_snapshots` guarda `ai_plot`/blueprint y perfiles de NPC en el turno. En forks antiguos `CreatorService.clone` selecciona exactamente ese snapshot, no las descripciones actuales; en full fork copia el estado presente. Los IDs de NPC se mantienen estables dentro de los snapshots clonados y se remapean en el estado del mundo. Commits `85a92b8ca4d0`, `bc86306efd4e`.
- [x] **Rebobinado no destructivo:** desde Historial, botón «Rebobinar aquí» → diálogo con turno, número de turnos futuros que se conservan en la línea original y vista previa de snapshots de Lorebook/mundo → confirmación para crear ruta alternativa. Cancelación sin efectos. La interfaz reutiliza `fork_story` (el Unit of Work transaccional probado) y no elimina turnos. Commits `80da849dcaeb`, `b1f51f9a7f55`, `93ad87d423be`, `b7df92f8f5d7`.
- [x] **Pruebas nuevas:** `tests/test_lorebook_timeline.py` comprueba creación/edición/eliminación temporal, idempotencia, rollback y protección de historias antiguas; `tests/test_creator_timeline.py` comprueba secretos futuros en blueprint/diálogos NPC y snapshots estables; `apps/web/tests/story-rewind.spec.ts` recorre UI real en desktop y móvil, verifica que cancelar no crea rama y que confirmar preserva la historia original. Commits `a81df310759d`, `8c6972c39eaf`, `08861385c0da`, `d1532a8658c9`, `5dc77b6c5ec7`.
- [x] [CI #42084535834](https://github.com/Mairon31/novel_ai/actions/runs/42084535834): **179 Python y 34 Playwright PASS**, build web aprobado. Las primeras CI de la nueva prueba Playwright fallaron por sintaxis de fixture y expectativa HTTP 200 frente a 201 del endpoint de apertura; ambos errores fueron corregidos antes de declarar éxito.
- [ ] Faltan snapshots históricos completos de medios del creador, referencias de galería/fichas visuales y planes de composición, rebobinado destructivo con archivo/undo, Lorebooks con conocimiento por testigo y recuperación episódica semántica. Estos elementos no se marcan terminados.


## 2026-11-05 — Corrección de resolución npm/Playwright en CI

- [x] Se detectó una regresión externa de instalaciones de CI: con `"@playwright/test": "^1.58.0"`, algunas ejecuciones resolvían una versión no disponible de `playwright-core@1.65.0` y fallaban con `npm ERR! ETARGET` **antes de compilar o ejecutar pruebas**. No era una regresión de las funciones narrativas. Los logs de GitHub Actions identificaron el paquete y la etapa exacta.
- [x] `apps/web/package.json` fija `"@playwright/test": "1.64.1"`, versión estable publicada. Commit `686f7151a174`.
- [x] [CI #42085965085](https://github.com/Mairon31/novel_ai/actions/runs/42085965085) para ese commit: **179 pruebas Python + 34 Playwright PASS**, `npm install`, compilación web y navegador escritorio/móvil correctos.
- [ ] Se recomienda incorporar `apps/web/package-lock.json` generado con npm en un entorno con registro accesible y migrar CI a `npm ci` para fijar **todas** las dependencias transitivas; por ahora se ha fijado únicamente Playwright y siguen existiendo otros rangos semver sin archivo de bloqueo.


## 2026-11-05 — Aislamiento temporal de imágenes editoriales (pendiente de CI)

- [ ] `creator_media_turn_snapshots` guarda inventario de medios del creador, metadatos y portada seleccionada en el commit SQLite del turno. La bifurcación parcial restaura exclusivamente ese checkpoint (sin traer medios futuros); la completa mantiene el estado presente.
- [ ] Se remapean UUID de medios y NPC en toda la línea de snapshots; los bytes históricos de un medio borrado se conservan cuando hay turnos que lo referencian, aunque el recurso deje de estar disponible desde la biblioteca activa. La falta de un archivo requerido aborta la bifurcación sin publicar media ni filas parciales.
- [ ] Pruebas creadas en `tests/test_creator_media_timeline.py`; hasta obtener CI, **no declarar PASS**. Continúa pendiente la recuperación histórica de referencias visuales y planes de escena, GC de medios históricos y durabilidad tras apagón.


### Resultado definitivo de la fase editorial

- [x] [GitHub Actions #42093293045](https://github.com/Mairon31/novel_ai/actions/runs/42093293045) finalizó con **184/184 Python y 34/34 Playwright PASS** para el commit `dc124a1`, verificados en logs de ambos jobs. Incluye `tests/test_creator_media_timeline.py`, backend SQLite/Pillow y frontend escritorio/móvil.
- [ ] El aislamiento temporal de `visual_state.py` y `scene_planner.py` sigue pendiente: **la CI verde no demuestra que imágenes de galería ni planes de composición antiguos estén correctamente versionados**.

## 2026-11-05 — P1: memoria visual histórica y planes de escena

- [x] Commit [`a49ca05`](https://github.com/Mairon31/novel_ai/commit/a49ca0591222837d28b344798646dd113ea567c4): `visual_turn_snapshots` persiste por turno las fichas visuales de personaje, referencia de imagen, inventario de galería, selección y planes de escena. La misma transacción SQLite confirma el turno y los snapshots; una falla revierte la escritura.
- [x] El clonador `VisualState.clone_branch` filtra recursos con el checkpoint del turno elegido y restaura la versión histórica de las fichas. El clonador `ScenePlanner.clone` puede recibir el plan histórico (sin importar cambios futuros); la bifurcación completa conserva el presente y remapea snapshots para futuros rebobinados de esa rama.
- [x] Nueva suite `tests/test_visual_timeline.py`: identidad/vestimenta, nuevo arte en misma escena, selección de imagen, referencia, plan escénico, ramas anidadas, turno antiguo sin snapshot y rollback inyectado. Se corrigió `tests/test_story_branches.py` para no exigir arte importado después del turno de corte.
- [x] **Python CI verificada:** [#42094814974](https://github.com/Mairon31/novel_ai/actions/runs/42094814974), **189/189 PASS**, backend SQLite/Pillow real; inferencia de modelos simulada.
- [ ] **Playwright CI:** al registrar esta entrada, el job frontend seguía instalando Chromium. No afirmar 34/34 hasta la conclusión oficial del workflow. Sin cambios visuales de UI en este bloque.
- [ ] Pendiente de la auditoría: rebobinado destructivo con archivado/restauración, aislamiento cognitivo de Lorebooks por testigo, recolección segura de bytes históricos, fsync de directorios y pruebas de corte eléctrico y GPU reales.


## 2026-11-05 — P1: Lorebooks restringidos a testigos y presencia (CI pendiente)

- [x] Se comprobó que la línea visual histórica de los commits `a49ca05` / `598aff2` tiene [CI #42095465227](https://github.com/Mairon31/novel_ai/actions/runs/42095465227) **189 Python + 34 Playwright PASS**. Ya no está bloqueada por instalación de Chromium.
- [ ] `LorebookEntryInput` introduce `visibility: world|witnesses` y `witness_character_ids` (UUID propios del proyecto, no duplicados). `world` mantiene el comportamiento existente. Las entradas `witnesses` solo pueden entrar al prompt si al menos un testigo se encuentra en `world_states.present_character_ids` confirmado por el autor. Ni mención de nombre ni `always_active` anulan la ausencia.
- [ ] Validación estricta de propiedad al guardar bajo `BEGIN IMMEDIATE`; snapshots históricos guardan el campo y `LorebookService.clone` remapea testigos con el mapa de personajes de Creator, omitiendo entradas privadas sin testigos válidos en la rama. Creator Studio permite seleccionar testigos y ver cuántas entradas quedaron fuera por ausencia; la UI conserva entradas anteriores de tipo `world`.
- [ ] `tests/test_lorebook_witness.py` cubre presencia/ausencia, testigo distinto, visibilidad general, UUID inválidos/extranjeros, rama histórica vs presente, remapeo de snapshots y persistencia al reiniciar. Se amplió `apps/web/tests/lorebook.spec.ts` para escritorio y móvil.
- [ ] **No marcar CI aprobada hasta observar el workflow**, ni declarar aislamiento cognitivo completo: otras fuentes del prompt (blueprint, diálogo o memoria externa) pueden introducir secretos sin pasar por este filtro. Sigue faltando analizador de contradicciones y presupuesto por tokens.


### Gate final — Lorebook con testigos (2026-11-05)

- [x] [CI #42097953216](https://github.com/Mairon31/novel_ai/actions/runs/42097953216) completada en **success** para `cb687ec`: `193/193` pruebas Python, `36/36` Playwright escritorio/móvil y compilación React/Vite correcta. Las cuatro pruebas nuevas de testigos pasaron en SQLite/FastAPI real y proveedor de narración simulado.
- [x] La primera [CI #42097551698](https://github.com/Mairon31/novel_ai/actions/runs/42097551698) registró 193 Python PASS, pero solo 34/36 Playwright debido a una aserción ambigua: coincidía con el título de la entrada y con la vista previa. `cb687ec` limitó el selector al panel de activación; no ocultar la ejecución inicial fallida.
- [x] Criterios verificados: entradas generales anteriores siguen activándose, las privadas requieren testigo del mismo proyecto presente en el estado del mundo, no se activan por mención/always_active cuando nadie las conoce, y remapean IDs de testigo en bifurcaciones parciales/completas. Las restricciones persisten al reiniciar.
- [ ] Sin medir GPU ni evaluar generación semántica con modelo real; falta aislamiento de otras fuentes de contexto del narrador y presupuesto por tokens.


## 2026-11-05 — P0: cierre de ventana crash de archivos en fork (CI pendiente)

- [ ] En `NarrativeService.fork_story` solo se activa `PRAGMA synchronous=FULL` para su conexión SQLite, conservando el valor `NORMAL` para el resto de operaciones. Los archivos nuevos y entradas de directorio se sincronizan antes del COMMIT. Un fallo de `fsync` inicia el mismo rollback SQLite y limpieza de archivos de staging; no se publica una rama parcial.
- [ ] `_fsync_directory` fuerza metadatos de directorio en POSIX con `O_DIRECTORY/O_NOFOLLOW` cuando están disponibles; Windows no proporciona esta primitiva de forma portable y continúa como best-effort. `_sync_fork_files` recorre únicamente carpeta UUID de la nueva rama, rechaza symlinks y sincroniza contenidos, subdirectorios y directorio propietario.
- [ ] `tests/test_fork_atomicity.py` se amplió para contar las tablas de snapshots históricas en rollback y probar fsync real, inyección de fallo de disco/metadata, rechazo de symlink externo y conservación de la fuente.
- [ ] **No declararlo resistente a apagón físico ni CI PASS todavía.** Pendientes ejecución de corte eléctrico real, procesos independientes terminados con `SIGKILL`, análisis de journaling Windows/NTFS, corrupción filesystem, copias de seguridad y restauración.


### Gate fsync inicial confirmado

- [x] [CI #42098969230](https://github.com/Mairon31/novel_ai/actions/runs/42098969230) finalizada con **197/197 Python y 36/36 Playwright PASS**, build React/Vite PASS. Cuatro regresiones nuevas en `test_fork_atomicity.py` ejercitan `os.fsync` real y fallos inyectados de sync/metadata con rollback de todos los snapshots.
- [x] Prueba **`os._exit(41)`** tras copiar medios validada posteriormente en [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453) (198 Python + 36 Playwright PASS): sin fila confirmada, nueva instancia reconcilia el UUID sin dañar origen. No equivale a ensayo eléctrico.


### Gate de proceso externo terminado abruptamente — verificado

- [x] Commit [`dea96ac`](https://github.com/Mairon31/novel_ai/commit/dea96ac6c62ce1289bdfc3626197f29472b5f55e): `tests/test_fork_atomicity.py` ejecuta un intérprete Python independiente, fuerza `os._exit(41)` después de copiar medios, comprueba rollback SQLite implícito por cierre del proceso, conserva el marcador UUID y archivos huérfanos, y verifica recuperación al iniciar otra instancia sin modificar la historia original.
- [x] [CI #42099555453](https://github.com/Mairon31/novel_ai/actions/runs/42099555453): **198/198 pruebas Python + 36/36 Playwright PASS**, compilación Vite correcta, ambos jobs GitHub Actions en éxito.
- [ ] Limitación explícita: `os._exit` no es un corte de corriente ni prueba que el filesystem persista bytes ya confirmados; la recuperación tras abortar en COMMIT/limpieza, fallos multi-proceso simultáneos, filesystem corrupto, guardado duradero de metadatos Windows y pruebas físicas continúan pendientes.


## 2026-11-05 — P0: SIGKILL multiproceso en bifurcaciones (CI verificada)

- [x] Tres pruebas de integración multiproceso añadidas a `tests/test_fork_atomicity.py` para evaluar el bloqueo de escrituras SQLite y la recuperación del staging durante distintas interrupciones. La señal de cada hijo se publica con `Path.replace`, para que el padre sepa si el fork está antes o después del COMMIT sin depender del reloj ni de un `sleep` arbitrario.
- [x] En escenario A el hijo permanece detenido al finalizar el fsync previo al COMMIT; un segundo proceso inicia el mismo proyecto, espera el lock, y tras matar al primero recupera el huérfano y confirma una única rama válida.
- [x] En escenario B la historia ya fue confirmada en la base, pero el proceso muere al iniciar `marker.unlink`; el siguiente arranque conserva los recursos y limpia el marcador sin borrar la rama.
- [x] En escenario C dos procesos son terminados con `SIGKILL` en secuencia antes de confirmar. La instancia B debe limpiar el huérfano A; una instancia C limpia el huérfano B; ninguna fila parcial debe aparecer.
- [x] [CI #42101497771](https://github.com/Mairon31/novel_ai/actions/runs/42101497771) verificada para `f684580`: **201/201 Python + 36/36 Playwright PASS**, frontend compilado. Todos los tres nuevos ensayos de procesos muertos por `SIGKILL` aprobaron.
- [ ] No cubierto: corte eléctrico real, corrupción filesystem, Windows y terminación exactamente dentro del COMMIT WAL.


## 2026-11-05 — P0: durabilidad de la limpieza de staging al recuperar (CI verificada)

- [x] `NarrativeService.recover_incomplete_forks` sincroniza con `fsync` el directorio padre de recursos al eliminar carpeta de rama abandonada, antes de eliminar el marcador UUID. Después de `marker.unlink`, sincroniza el directorio `fork-staging` (POSIX); solo entonces incrementa `removed_orphans` o `retained_stories`.
- [x] Si falla el flush del directorio tras eliminar archivos, el proceso deja el marcador para un intento posterior y cuenta `conflicts` en lugar de informar eliminación exitosa. La recuperación al reiniciar es idempotente cuando los archivos ya se eliminaron.
- [x] Regresiones añadidas a `tests/test_fork_atomicity.py`: recuperación mixta de rama confirmada+huérfana verificando sincronización de los dos directorios; fallo de `fsync` de la carpeta de recursos seguido de recuperación sin pérdida de la historia original. **CI aprobada: [#42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649), 203 Python + 36 Playwright PASS.**
- [ ] Límites: aunque el test verifica `fsync` real en runner Linux, no simula pérdida de energía, corrupción real de filesystem ni flush portable de directorio Windows.

- [x] GitHub Actions [#42102315649](https://github.com/Mairon31/novel_ai/actions/runs/42102315649): **203/203 Python y 36/36 Playwright aprobadas**, compilación web correcta.


## 2026-11-05 — P1: exportación HTML ilustrada y portable (CI pendiente)

- [ ] Nueva ruta `GET /api/v1/stories/{story_id}/export.html` genera un HTML UTF-8 totalmente autónomo con estilos integrados, portada del proyecto, intervenciones y narración, y una ilustración WebP por cambio de escena cuando existe `visual_turn_snapshots`. No incluye instrucciones privadas de Creator ni URL remotas. No sustituye la galería del turno por el arte actual cuando falta una instantánea histórica.
- [ ] Los textos se escapan con `html.escape`. Imágenes se resuelven por UUID usando rutas seguras de `VisualState` y `CreatorMediaService`, con chequeo de firma WebP y límites por archivo (6 MiB), número (48) y volumen (28 MiB), evitando exportaciones descontroladas.
- [ ] El botón de descarga está dentro de la barra del lector, tanto en escritorio como móvil. La respuesta envía `Content-Disposition: attachment`, `Cache-Control: no-store`, `nosniff`. Una rama se exporta separadamente y el HTML se puede abrir sin Noble AI.
- [ ] `tests/test_story_export.py`: validar escapes, ausencia de instrucciones internas, imágenes WebP base64, reversión temporal de imagen en rama anterior, datos corruptos y 404. `apps/web/tests/story-export.spec.ts`: verificar enlace y descarga real.
- [ ] **CI pendiente**. EPUB, exportación integral de árbol de ramas y límites de impresión/artes de mayor tamaño siguen abiertos.


## 2026-11-05 — P1: índice episódico FTS5 y recuperación aislada (CI pendiente)

- [ ] Nuevo `EpisodicMemory`: FTS5 Unicode sobre **solo las acciones/diálogos del jugador**; no indexa hechos privados de Creator ni respuestas del LLM. Inserción del índice en la transacción SQLite del turno y clonación de entradas con nuevos IDs al bifurcar, sin copiar acciones futuras desde el origen.
- [ ] Migración no destructiva: al iniciar se crea el índice FTS5 y se incorporan los turnos legados faltantes; si SQLite no ofrece el módulo, búsqueda léxica local limitada a 2500 turnos sin obligar a instalar servicio externo.
- [ ] Nuevo `GET /api/v1/stories/{story_id}/memory/search?q=...&limit=...`: resultados con `turn_id`, modo, texto de intervención y fecha, **sin** texto generado por el narrador. Los términos pasan por tokenización Unicode limitada, no aceptan sintaxis FTS arbitraria.
- [ ] `NarrativeService.messages` puede recuperar hasta 3 intervenciones antiguas fuera de la ventana reciente de 16 turnos. No sube estos recuerdos al mensaje de sistema: se insertan como mensajes históricos con rol `user` y etiqueta que prohíbe tratarlos como conocimiento confirmado de NPC.
- [ ] UI de lector → «Historial» agrega consulta y resultados de búsqueda; pruebas `tests/test_episodic_memory.py` cubren recuperación tras 115 turnos, aislamiento de ramas, fallback, reinicio/migración, sanitización de consulta y rollback. E2E escritorio/móvil `story-memory.spec.ts`.
- [ ] **CI pendiente**; la búsqueda es léxica, no hay embeddings ni resúmenes automáticos ni validación semántica de respuestas de modelos reales.


## 2026-11-05 — P1: Inspector de contexto y presupuesto (CI pendiente)

- [ ] Nuevo `POST /api/v1/stories/{story_id}/context/preview` llama al mismo `NarrativeService.messages` de producción, **sin inferencia ni escritura de turnos**. Devuelve mensajes completos para los adaptadores, desglose por secciones, ventana configurada, reserva de salida y posible exceso.
- [ ] Segmentos del prompt: sistema/preferencias, premisa/protagonista, canon, directrices y fichas NPC, Lorebook activo, hechos de mundo, episodios recuperados (si existen), historial y entrada actual. El desglose conserva el número de caracteres; los tokens son **estimaciones explícitas** por `ceil(caracteres/4)` y overhead heurístico por mensaje. Nunca se atribuye esta cifra a un tokenizer de Gemma/Qwen/Llama ni se declara medición de KV-cache.
- [ ] `NarrativeSettings.tsx` incorpora un panel para seleccionar historia, intervención y modo, consultar y desplegar secciones/prompt exacto. Los textos privados del creador solo se presentan en la configuración local de autor y no se exportan con el HTML público.
- [ ] `tests/test_context_inspector.py` valida igualdad exacta de mensajes, desglose sin pérdida de caracteres, advertencia de overflow estimado, contrato de modos y ausencia de mutaciones. E2E `apps/web/tests/context-inspector.spec.ts` comprueba navegador desktop/mobile sin cargar GPU.
- [ ] **CI pendiente**, incluidos los fixes de pruebas de exportación y memoria en la misma rama `master`.


## 2026-11-05 — P1: EPUB3 válido y offline (CI pendiente)

- [ ] `GET /api/v1/stories/{id}/export.epub` genera ZIP EPUB3 con `mimetype` al principio sin compresión, `META-INF/container.xml`, `OEBPS/content.opf` (manifest, spine, metadata y portada), `nav.xhtml` e `chapter.xhtml` en XML estricto, CSS y archivos WebP internos. Permite abrir la novela fuera de Noble sin llamar servicios remotos.
- [ ] Cada EPUB exporta solo la historia/rama indicada y usa `visual_turn_snapshots` para ilustraciones por escena; jamás reemplaza una selección antigua por una imagen futura. La portada del proyecto es opcional, los textos se codifican mediante ElementTree, y se aplican los mismos límites de bytes, cantidad y rutas seguras que en HTML.
- [ ] El lector muestra enlaces separados «Exportar historia HTML» y «Exportar historia EPUB». Se extendieron `tests/test_story_export.py` para verificar estructura ZIP, validez OPF/XHTML, portada, historial de rama, texto escapado y 404. `apps/web/tests/story-export.spec.ts` descarga ambos formatos en desktop y móvil.
- [ ] **CI pendiente**; `.noble.zip` con restauración completa y grafo de ramas, DRM y validación con lectores físicos quedan pendientes.


## Verificación final de cuatro funciones — 2026-11-05

- [x] [CI #42107613352](https://github.com/Mairon31/novel_ai/actions/runs/42107613352) validó los commits `5ccab50` (HTML), `157267d` (FTS5), `d34b58e` (inspector), `ef801a9` (EPUB3) y `c7220d5` (fix E2E): **217 Python y 42 Playwright PASS**, UI escritorio/móvil y compilación web.
- [x] Editor/lector exportan historias y ramas como HTML o EPUB3 autocontenidos, sin material interno del creador, con imágenes históricas y títulos. Tests verifican XML/ZIP, HTML escapado, firma WebP, ramas y 404.
- [x] La memoria FTS5 recupera acciones del jugador después de 115 turnos, preserva aislamiento transaccional al bifurcar, se reconstruye en upgrades y utiliza fallback léxico. No almacena respuestas privadas del narrador ni las eleva al rol de sistema.
- [x] Inspector read-only presenta mensajes exactos de `NarrativeService.messages`, desglose por bloques, advertencias de overflow estimado; no ejecuta modelo ni simula métricas KV-cache.
- [ ] Pendientes explícitos: embeddings, resúmenes con procedencia, estimación tokenizadora real y runtime KV-cache, backup integral `.noble.zip` y compatibilidad con lectores EPUB físicos.


## 2026-11-05 — P1: Respaldo portable del árbol de ramas + importador seguro (CI verificada)

- [ ] `story_archive.py` agrega `GET /api/v1/stories/{story_id}/archive.noble.zip` y `POST /api/v1/stories/archive/import`. Exportar desde una rama incluye su raíz, ancestros y descendientes, hasta 64 historias, preservando UUID y referencias entre ramas. El `manifest.json` versión 1 contiene 18 tablas permitidas, incluida historia, turnos, visual/escenas/selecciones, fichas Creator, medios, Lorebooks, mundo, revisiones y snapshots de todos los turnos.
- [ ] Los archivos `story-assets/<uuid>` se seleccionan únicamente por rutas conocidas (escena, galería WebP y Creator WebP/PNG), y cada uno tiene tamaño y SHA-256 verificable. Nunca se exportan los modelos descargados, las credenciales, los workers ni la base de datos completa.
- [ ] El importador rechaza ZIP corrupto, rutas transversales, miembros duplicados, UUID no canónicos, datos de historias externas, checksums fallidos, tablas desconocidas, tamaños excesivos y colisiones de IDs. No descomprime nombres ZIP directamente. Se comprueban todas las entradas antes de cualquier escritura.
- [ ] Importación no destructiva: bloqueo `BEGIN IMMEDIATE`, staging UUID por historia, `fsync` de marcadores y archivos antes del COMMIT, inserción de 18 tablas y reconstrucción transaccional de FTS para las acciones del jugador. Si falla, se revierte SQLite y se eliminan exclusivamente nuevas carpetas y marcadores; si se interrumpe el proceso, recuperación de Noble limpia los marcadores pendientes.
- [ ] La Biblioteca tiene «Importar respaldo .noble.zip»; la ficha de historia, «Respaldar historia y ramas». `tests/test_story_archive.py` prueba roundtrip a una segunda instalación, árbol y archivos, aislamiento de turnos, colisiones 409, ZIP manipulado y rollback. E2E desktop/mobile prueba descarga real y rechazo de duplicación.
- [ ] **CI pendiente**. Importar sobre una historia con UUID existente se rechaza (no hay sobrescritura ni remapeo automático). El formato no empaqueta modelos GGUF ni configuración global y no equivale a prueba de apagón físico o de compatibilidad con versiones futuras del esquema.


## 2026-11-05 — P2: Visualizador de rutas narrativas (CI verificada)

- [ ] Nuevo `branch_map.py` expone `GET /api/v1/stories/{story_id}/branches`: árbol completo de raíz, hijas y nietas, con `origin_story_id`, `origin_turn_id`, profundidad, conteo de intervenciones, título y datos de actualización. La lectura es solo consulta SQLite y detecta ciclos; no altera ramas o escenas.
- [ ] `StoryDetail.tsx` muestra el árbol de rutas con profundidad visual y permite abrir cualquier bifurcación conectada. `StoryStudio.tsx` incorpora selector rápido de ruta mientras se lee; cambia el identificador activo, carga el historial de esa rama y cancela la lectura anterior sin borrar ninguna decisión.
- [ ] La UI se adapta a móvil y escritorio con controles accesibles; las rutas distintas de la familia seleccionada no se mezclan. Pruebas `tests/test_branch_map.py` y `apps/web/tests/branch-tree.spec.ts` verifican profundidad, independencia, 404, detección de ciclos, navegación de detalle y selector del lector.
- [ ] **CI pendiente** y editor nodal fuera del alcance; el árbol de ramas sigue siendo una vista/navegador, no un sistema destructivo de rebobinado.


## 2026-11-05 — Cierre de recuperación de archivos y árbol de ramas

- [x] [CI #42115183293](https://github.com/Mairon31/novel_ai/actions/runs/42115183293), commit `abf114e`: **226/226 pruebas Python y 46/46 Playwright PASS**, compilación web correcta. Incluye backup/restauración de familias conectadas con imágenes reales fixture, manifest SHA, rechazo 409 de duplicación, path traversal/ZIP manipulado y rollback tras error de FTS.
- [x] El lector y la página editorial navegan rutas conectadas con controles adaptados a escritorio/móvil. El botón «Volver a biblioteca» dejó de quedar cubierto por la cabecera en móvil; se corrigió su `z-index`.
- [x] Las regresiones previas se corrigieron: `d65d9da` detectó expresión JSX sin cierre; `1b6740c` pasó compilación pero el botón volver estaba interceptado en móvil; `ce52550` añadió el mapa, y `abf114e` fijó la selección exacta de historia raíz en el E2E.
- [ ] Limitaciones declaradas: el respaldo v1 no importa colisiones como copias renombradas, admite hasta 64 historias y 192 MiB de recursos, no incluye pesos de modelos ni configuración global. No se han validado apagones físicos/NTFS, hardware GPU ni compatibilidad de archivo con versiones futuras del esquema.


## 2026-11-05 — P1: Importar familia repetida como copia independiente (CI verificada)

- [x] `POST /api/v1/stories/archive/import?as_copy=true` mantiene validación original de ZIP y SHA, crea **un UUID nuevo por cada entidad y referencia de la familia**, incluido material histórico solo presente en snapshots JSON, medios y nombres de archivos. Actualiza `origin_story_id` y `origin_turn_id` para que los nuevos nodos formen un árbol independiente; texto literario, diálogos y canon libre permanecen intactos.
- [x] El modo sin parámetro conserva IDs originales y rechaza duplicación con 409. El modo copia renombra títulos con «(copia)», devuelve `story_id_map` y usa el mismo staging, `fsync`, transacción e indexación FTS que la importación original. Biblioteca ofrece checkbox visible para solicitar explícitamente la duplicación sin sobreescribir.
- [x] `tests/test_story_archive.py` verifica la duplicación repetida del mismo ZIP, independencia de familias, remapeo de instantáneas, recursos WebP/portadas, búsqueda FTS por rama, preservación de texto libre con UUID literal y rechazo sin escritura de hash corrupto. Playwright comprueba el checkbox en escritorio y móvil.
- [x] [CI #42117963321](https://github.com/Mairon31/novel_ai/actions/runs/42117963321): **230/230 Python y 46/46 Playwright PASS**, build frontend correcto.

## 2026-11-05 — P2: Enlaces profundos mediante URL local (CI verificada)

- [x] `workspaceRoute.ts` define parseo y serialización de rutas hash con UUID canónico. Admite `#/biblioteca`, `#/historia/<uuid>`, `#/historia/<uuid>/leer`, `#/creator/<uuid>`, `#/modelos`, `#/descargas`, `#/configuracion`, `#/diagnostico` y alias `#/infraestructura`.
- [x] `App.tsx` sincroniza menú, atajos de teclado, back/forward del navegador y enlaces externos con el hash. `StoryStudio.tsx` carga una historia por UUID desde la URL al iniciar o recargar; selección, lectura, retorno, bifurcación y cambio de rama actualizan la ruta. `CreatorStudio.tsx` sincroniza proyecto seleccionado y nuevos proyectos.
- [x] Ruta hash elegida para que los enlaces funcionen en backend/instalación empaquetada **sin configurar fallback de servidor web**. Una ruta desconocida abre Model Hub; las rutas con ID válido pero inexistente muestran error sin tocar datos.
- [x] `apps/web/tests/workspace-route.spec.ts` comprueba carga directa, recarga, navegación de detalle→lector→otra ruta, Back/Forward, Creator Studio y enlace de infraestructura en ambos tamaños.
- [x] **CI aprobada**: [#42120432384](https://github.com/Mairon31/novel_ai/actions/runs/42120432384), 231 Python + 52 Playwright y build. Navegación de inicio, detalle, lector, rutas hijas, Creator Studio, atrás/adelante y cambio de sección validados.
- [ ] Queda abierta la separación del estado interno por dominios de `App.tsx`, y no se agrega una URL por cada escena/turno.


## 2026-11-05 — Cierre de importaciones duplicadas y rutas directas

- [x] [CI #42120432384](https://github.com/Mairon31/novel_ai/actions/runs/42120432384): **231/231 Python y 52/52 Playwright PASS**, compilación frontend correcta. Rama publicada: únicamente `master`.
- [x] La conversión `_copy_archive_ids` remapea **claves UUID de diccionarios JSON**, esenciales para `WorldState.relationships`, además de los valores y los identificadores de snapshots. `test_copy_remaps_uuid_dictionary_keys_in_world_relationships` comprueba estado actual, snapshot histórico y preservación de la historia original.
- [x] `workspaceRoute.ts` conserva enlace directo al lector al completar onboarding en una instalación nueva y no deja seleccionado un proyecto si el usuario navega a `#/creator` sin ID. `workspace-route.spec.ts` verifica ambos estados y abre menú de navegación antes de pulsar Creator Studio en móvil.
- [x] Commits principales de esta fase: `7f265dc` importación como copia, `1dd4681` rutas compartibles, `9ef0440` claves UUID en JSON, `3429f2a` persistencia del enlace durante onboarding, `18cc08e` navegación de prueba móvil.
- [ ] Pendientes separados: compatibilidad automática de schemas futuros, respaldos de más de 192 MiB, tokenización real por modelo y desacoplamiento interno de `App.tsx`.


## 2026-11-05 — P2: Lector VN/Libro/Chat, backlog y HUD — CI verificada

- [x] `WorkspacePreferences.reader_layout` acepta `immersive` (VN), `classic` (Libro) y `chat` (burbujas de intervención/respuesta); `ControlPlane` valida y persiste el modo en SQLite, sin alterar turnos. Opciones disponibles en Apariencia/lector y UI/UX del lector.
- [x] `VisualReader.tsx` incorpora backlog como diálogo accesible de escenas **ya cargadas**, búsqueda Unicode casefold del texto del jugador/narrador, salto al turno y botón en toolbar. No modifica el historial ni mezcla otras ramas; pendiente paginación de escenas más antiguas y virtualización de 500+ mensajes.
- [x] HUD ocultable/revelable: el lector conserva la narración visible y ofrece botón de recuperación. Atajos opcionales `Alt+1/2/3` para VN/Libro/Chat, `Alt+B` backlog, `Alt+H` HUD, `Escape` cerrar/revelar. Los atajos no interceptan escritura en textareas/inputs y se deshabilitan al apagar shortcuts en preferencias.
- [x] Estilos diferenciados con lector de libro sin panel lateral, modo chat con burbujas y fondo VN. Responsive desktop/móvil y `role=dialog` para backlog.
- [x] `tests/test_preferences.py` valida persistencia real, 422 de valor inválido y reinicio; `apps/web/tests/reader-modes.spec.ts` comprueba recarga, tres vistas, búsqueda/backlog, HUD y teclado. [CI #42125311967](https://github.com/Mairon31/novel_ai/actions/runs/42125311967): **232/232 Python, 56/56 Playwright y build Vite PASS**. [CI #42127083317](https://github.com/Mairon31/novel_ai/actions/runs/42127083317) confirma **239 Python y 58 Playwright PASS**.
- [ ] La regeneración de una escena versionada, un backlog con scroll sobre el historial completo y la virtualización de 500 mensajes todavía no están implementados.

## 2026-11-05 — P2: Director visual determinista y caché de fondos — CI verificada

- [x] `visual_director.py` expone una vista previa determinista y cuatro acciones: `REUSE_BACKGROUND`, `UPDATE_SPRITE_EMOTION`, `GENERATE_NEW_BACKGROUND`, `GENERATE_EVENT_CG`. El intent puede ser explícito (`auto/background/emotion/event`); el servidor devuelve `inference_used=false` y `generation_started=false`. Es orientación de planificación, **no ejecución de modelos de sprites/CG**.
- [x] La clave `noble-bg-v1:SHA256` se forma con ubicación confirmada (WorldState o escena), hora, clima, plano y luz del ScenePlanner; excluye emoción/gesto, que no deben crear un fondo nuevo. Las imágenes de fondo se registran **explícitamente desde la galería manual** en el `render_signature` existente; no se modifica firma ComfyUI de un recurso generado.
- [x] Cache hit devuelve referencia al fondo y permite seleccionar su archivo WebP existente sin generar arte ni añadir otra versión. Se verifica contexto y recurso en el servidor antes de aplicar; cambio del contexto o de recurso retorna `409`, otro UUID ajeno/missing retorna `422`. Reutilizar recurso de otra rama es imposible sin poseer el asset de dicha rama.
- [x] Los clones y respaldos `.noble.zip` transportan la firma de caché en `visual_assets` existente, evitando migración y pérdidas de metadata. `test_background_reuse_cache_survives_restore_and_as_copy` comprueba restore/copy y aislamiento de fondos. `test_visual_director.py` verifica invalidez por hora/clima/luz/plano, repetición por emoción, evento/expresión como planes, colisión de historia, firma de ComfyUI no destruida y no-inferencia.
- [x] `VisualReader.tsx` muestra director en el panel Galería: intención, acción traducida, contexto, botón de registrar fondo manual o reutilizarlo. `visual-director.spec.ts` recorre estas acciones con API local real en escritorio/móvil.
- [x] [CI #42127083317](https://github.com/Mairon31/novel_ai/actions/runs/42127083317) **239/239 Python, 58/58 Playwright y build PASS**.
- [ ] Límites: no se registran automáticamente fondos de un render ComfyUI ni se actualizan sprites o CG por el mero hecho de previsualizarlos. Siguen pendientes sprites multi-expresión, capas y procesamiento GPU coordinado.


## 2026-11-05/06 — Escenario VN multicapa, expresiones, poses y reproducción de fondos

- [x] El Editor de imágenes de Creator Studio guarda en `creator_media_assets` una expresión controlada (`neutral`, `joy`, `anger`, `sadness`, `surprise`) y una pose identificada con caracteres seguros. Las ilustraciones `foreground` preservan alfa en PNG; se valida tipo/carácter/propiedad y se rechaza añadir pose o emoción a fondos y portadas. Los retratos antiguos migran con valores `neutral/standing`.
- [x] `CreatorMediaService.presentation` devuelve `sprites[]` ordenados, como máximo tres personajes únicos con nombre mencionado en el **último turno visible guardado**, más `foreground` para clientes antiguos. La expresión se decide mediante pistas lexicales cercanas al personaje, sin atribuir emociones al siguiente NPC; el recurso se elige por coincidencia de pie de foto y variante, con fallback a neutral. Nunca se generan archivos de imagen ni se invoca el proveedor.
- [x] La iluminación del foco se activa cuando hay un verbo de habla explícitamente atribuido (por ejemplo, `Aira dice` o `preguntó Aira`). Una mención de personaje sin atribución no se considera diálogo; la caja inferior se identifica como «Narrador» para no atribuir toda la prosa a un NPC.
- [x] `VisualReader.tsx` y CSS VN componen fondo, hasta tres PNG transparentes, destacado visual de hablante y caja inferior legible. Los fondos emplean **dos capas** durante 560 ms para transición cruzada; se limpia la anterior y se limita el estado de medios al ID de historia para no revelar imágenes de otra rama durante navegación interna. `prefers-reduced-motion` elimina animaciones.
- [x] La clonación y los snapshots editoriales conservan expresión/pose e IDs remapeados. `story_archive.py` admite tanto respaldos recientes como manifests v1 de nueve columnas anteriores, rellenando únicamente `expression=neutral` y `pose=standing` en el importador, sin aceptar otras columnas desconocidas ni omitir validación SHA.
- [x] `test_creator_media_sprites.py` valida 10 turnos de narración sin nuevos fondos ni ComfyUI, selección de tres personajes, pose y emoción, aislamiento de secretos, fallback, atribución explícita, migración de SQLite, fork histórico y exportación/importación como copia. `test_story_archive.py` cubre manifiestos de medios de formato anterior. Playwright cubre la capa VN y el formulario Creator Studio en escritorio/móvil.
- [x] [CI #42136052387](https://github.com/Mairon31/novel_ai/actions/runs/42136052387): **247/247 Python + 60/60 Playwright PASS** y build Vite sobre corrección de UI/atribución (`c010333`). La ejecución [CI #42137444723](https://github.com/Mairon31/novel_ai/actions/runs/42137444723) confirmó **247/247 Python, 60/60 Playwright y build Vite PASS**, incluido editor de pose/expresión en móvil y escritorio, crossfade de dos fondos y ausencia de filtración entre historias.
- [ ] No hay sprites generados automáticamente, hoja de expresiones **por IA**, rig 2D ni garantía de identidad facial; la ejecución de LoRA, animaciones de labios y edición de expresiones por visión permanecen pendientes. Las etiquetas/semilla de `visual_dna` y la importación **manual** de hojas se desarrollan en la fase posterior.

## 2026-11-05/06 — Identidad visual canónica y hojas de expresiones de autor

- [x] `CreatorCharacter.visual_dna` separa identidad gráfica de personalidad narrativa: hasta 16 etiquetas de aspecto normalizadas, semilla opcional de 32 bits, nombre de archivo LoRA sin ruta y peso acotado. Las etiquetas y semillas fijadas se rechazan si un PUT intenta alterarlas. Clientes anteriores que omiten `visual_dna` pueden actualizar diálogos sin perderla; los registros antiguos se leen con defaults. Persistencia en `config_json` existente, por lo que snapshots, forks y respaldos conservan los datos sin una migración de tabla.
- [x] `CreatorMediaService.import_expression_sheet` decodifica una hoja PNG/WebP con alfa, exige cinco celdas iguales transparentes y no vacías, permite orden horizontal/vertical, conserva RGBA en PNG, valida personaje/pose/caption, crea cinco assets con los metadatos de emoción existentes y revierte archivos y transacción si falla cualquier INSERT. La API y React ya exponen esta operación explícita, sin cargar ComfyUI.
- [x] Tests añadidos: `tests/test_visual_dna_expression_sheet.py` (immutabilidad, compatibilidad de clientes antiguos, validación de LoRA, rechazo de hoja opaca/recurso ajeno, rollback ante trigger SQLite, PNG, selección VN y fork) y `apps/web/tests/visual-dna-sheets.spec.ts` (Creator Studio escritorio/móvil, importación y captura).
- [x] [CI #42141685494](https://github.com/Mairon31/novel_ai/actions/runs/42141685494) del commit `4ce9d5c`: **252/252 Python + 62/62 Playwright PASS** (desktop/móvil), build Vite PASS. Los commits `1777d12` y `66bdbec` tuvieron regresiones detectadas y corregidas antes de esta ejecución; no se consideran gates aprobadas. Sin ejecución física con ComfyUI/GPU: LoRA sigue siendo metadata, no está conectada a checkpoint/workflow. No se generan hojas con IA, y una hoja importada necesita nombre/contexto compatible para aparecer en el lector.

## 2026-11-05/06 — ADN de Creator integrado con el prompt de escenas (gate pendiente)

- [x] `VisualState.creator_visual_identity_lines` lee etiquetas canónicas exclusivamente del NPC local, evita nombres duplicados ambiguos y no incluye NPC sin presencia. Sin plan, exige coincidencia exacta de nombre en texto del prompt. Con plan persistente, exige vínculo por `visual_character_id` al elenco visual elegido: un nombre en la instrucción no puede incorporar datos de personajes excluidos. El prompt no incluye el nombre de LoRA ni la semilla del personaje, que permanecen metadatos.
- [x] `ScenePlanner.prompt`, `VisualState.enriched_prompt` y `/illustration-prompt` componen los mismos atributos según estado. El cambio de etiquetas canónicas invalida automáticamente la firma `render_signature` derivada del prompt al solicitar ilustrar con semilla explícita, evitando devolver un render viejo después de establecer la identidad. No se consulta ComfyUI si el usuario solo previsualiza.
- [x] Creator Studio carga las fichas visuales propias de la historia y muestra un selector visible para vincularlas a cada NPC narrativo; el vínculo ya existía en API, pero no en el formulario. Pruebas nuevas exigen vinculaciones por UUID, aislamiento entre historias, exclusión de personajes ausentes, coincidencia por límites de palabra y caché coherente con render mock.
- [x] [CI #42142959825](https://github.com/Mairon31/novel_ai/actions/runs/42142959825), commit `eb6e3fb`: **256/256 Python + 62/62 Playwright PASS**, build Vite PASS, incluyendo creación/actualización de vínculo entre NPC y ficha visual en escritorio/móvil. El commit anterior `f7494ec` falló una prueba por escape erróneo de la expresión regular y se corrigió en `bd03aa1`; la gate aprobada es la posterior. Sin GPU física ni evaluación de continuidad de identidad visual; añadir tags a CLIPTextEncode es guía textual, no IPAdapter/FaceID ni LoRA cargado en ComfyUI. No usar la semilla del NPC para reemplazar la semilla de un render con múltiples personajes.

## 2026-11-05/06 — LoRA real opt-in y procedencia por versión

- [x] `comfy_loras.py`: selección por pertenencia a historia y visibilidad; validaciones de nombre/intensidad, tres modelos como máximo, sin duplicar archivo en un mismo render. ComfyUI usa `LoraLoader` como nodo nativo para modificar MODEL y CLIP en una cadena ordenada. Se comprueban `/models/loras` y `/object_info/LoraLoader` solo cuando se pidió generar con LoRAs; petición normal mantiene `comfy-native-v2` y su firma SHA de caché. Un request mal configurado falla antes de enviar `/prompt`.
- [x] Checkbox y consulta de modelos en `VisualReader.tsx`, parámetro `apply_character_loras` de API, mensaje de modelos usados y prueba Playwright desktop/móvil. **CI #42145790071 aprobada: 261 Python y 62 Playwright, build Vite PASS**. Pruebas HTTP simuladas; no se probaron pesos ni GPU reales.
- [x] `VisualState.publish` almacena versión de workflow/nombres/intensidades en `visual_assets.render_details_json`, visible por versión en Galería. Migración de SQLite anterior, clonación a nuevas ramas, export/restore y copia de archivo v1 mantienen los metadatos; respaldos previos sin la columna usan `{}`. `render_provenance.py` limita forma, tamaño, nombres y pesos, e importación rechaza payload corrupto.
- [x] Gate de procedencia aprobada: [CI #42146552556](https://github.com/Mairon31/novel_ai/actions/runs/42146552556) para `b18c297`, **266/266 Python + 62/62 Playwright y Vite build PASS**. Incluye fork, restore, respaldo antiguo, validación de JSON y UI de galería. No equivale a inferencia ComfyUI/GPU real, identidad estable multi-NPC ni verificación criptográfica de pesos externos.

## 2026-11-05/06 — Borradores IA de cinco expresiones, revisión y procedencia

- [x] `sprite_cutout.py`: croma verde solo desde bordes, alfa RGBA y métricas de cobertura; rechaza fondos no aptos/cortes visibles. El primer test reveló que un MinFilter ocultaba un borde cortado y se adelantó la validación previa al suavizado; no se oculta una regresión detectada.
- [x] `comfy_runtime.py`: contrato HTTP de generación compartido con ilustrador existente; `sprite_drafts.py`: snapshots de ADN/checkpoint/semilla, preflight LoRA y referencia del mismo proyecto, GPU serializada, cinco expresiones por solicitudes separadas, capacidad de reanudar/regenerar/descartar y aprobación transaccional de cinco activos. Nunca se dispara al generar turnos del narrador.
- [x] UI Creator Studio con crear borrador, progreso secuencial, previsualización y controles por expresión para escritorio/móvil, LoRA y referencia opcionales. `test_sprite_drafts.py` agrega 8 escenarios HTTP y `sprite-drafts.spec.ts` agrega 2 escenarios Playwright, dejando las imágenes sin publicar hasta aprobar.
- [x] [CI #42152134496](https://github.com/Mairon31/novel_ai/actions/runs/42152134496) del fix UI `bc93016`: **279 Python, 64 Playwright y build Vite PASS** con proveedor ComfyUI simulado. Los commits anteriores `4db7542`, `b2efc89`, `e75e8dd`, `172cf73`, `5ba037b` registraron regresiones detectadas y corregidas; no contarlos como gates aprobadas.
- [x] `creator_media_assets.source/generation_json` conserva procedencia por activo, migrada en SQLite, copiada por forks y respaldos v1 y validada ante entradas alteradas. `test_sprite_provenance.py` incluye cuatro regresiones de origen, copia/fork/restore/compatibilidad y rechazo malicioso. [CI #42152514498](https://github.com/Mairon31/novel_ai/actions/runs/42152514498) del commit `c3b6d1e`: **283/283 Python + 64/64 Playwright PASS**, build Vite correcto.
- [ ] Verificación física con checkpoint + LoRA y GPU real; pruebas de identidad/coherencia visual, calidad de croma complejo y fondos que no puedan matizarse sin segmentador neuronal.

## 2026-11-05/06 — IPAdapter Plus en borradores y revisión de geometría

- [x] `comfy_identity_adapter.py` construye el grafo real de `IPAdapterUnifiedLoader` + `IPAdapter` (mapeo y campos contrastados contra el código fuente del plugin) encadenado tras `LoraLoader` en el puerto MODEL. Nuevo `identity_adapter_status` consulta explícitamente los esquemas de ambos nodos y la presencia de modelos `ipadapter` y `clip_vision`; si falta algo rechaza con 422 antes de enviar `/prompt`, sin fallback silencioso. Presets admitidos: STANDARD, PLUS, PLUS FACE.
- [x] Borradores de sprites admiten referencias guardadas de Galería o un `foreground` publicado del mismo NPC. Referencias mutuamente excluyentes, por UUID propio, SHA256 verificado antes de generar; borrado o sustitución detectados. Con `reference_mode=ipadapter` se usa una referencia RGB con *letterbox* sin recortar rostros, pero se inicia con `EmptyLatentImage` para permitir variación de emociones sin copiar el mismo lienzo. `img2img` anterior se conserva y permite también sprites propios.
- [x] `comfy-sprite-v2-ipadapter` añade procedencia opcional validada (preset, fuerza, clase de referencia y hash) a los sprites aprobados, sin alterar respaldos `comfy-sprite-v1`. Los metadatos se incluyen en el backup/fork de assets editoriales; no se exportan previews sin aprobar.
- [x] Creator Studio dispone de modo IPAdapter y selección de imagen de referencia, preset/fuerza, comprobación manual del plugin y texto que distingue condicionamiento de identidad frente a composición img2img. `tests/test_comfy_identity_adapter.py`, `tests/test_sprite_drafts.py`, `tests/test_reference_preparation.py`, `tests/test_sprite_provenance.py` y `sprite-ipadapter.spec.ts` comprueban rutas/casos.
- [x] Se fijó una versión **publicada** de `electron-to-chromium` (`1.5.476`) en `apps/web/package.json` para evitar fallos transitorios de `npm install` contra un tarball `1.5.478` ausente. [CI #42155018903](https://github.com/Mairon31/novel_ai/actions/runs/42155018903), commit `47c0cf8`: **298/298 Python, 66/66 Playwright y Vite build PASS** para este bloque. Las ejecuciones previas `42154306992`, `42154422774`, `42154552308` tuvieron fallo de instalación npm, no de tests Python. No reclamar que fueron CI completas exitosas.
- [x] `sprite_alignment.py` mide siluetas alfa (bbox, posición, escala) sin identificar rostros, muestra advertencias y exige confirmación editorial explícita para aprobar desalineaciones. Verifica además SHA256 de cada PNG temporal contra modificaciones anteriores a la publicación. [CI #42155457588](https://github.com/Mairon31/novel_ai/actions/runs/42155457588), commit `8fcd976`: **307/307 Python + 66/66 Playwright PASS**, Vite build PASS.
- [ ] Verificación con instalación física: compatibilidad de plugin/modelo/checkpoint, memoria VRAM, fidelidad facial, control regional en multi-NPC y máscara neuronal robusta. Ninguna prueba mock avala fidelidad visual.

## 2026-11-05/06 — Recorte neuronal opcional de personajes, sin fallback silencioso

- [x] Contraste con el código upstream de `1038lab/ComfyUI-RMBG` (v3.3.0): clases `RMBG` y `BiRefNetRMBG` usan `image/model` y retornan `IMAGE, MASK, MASK_IMAGE`. `comfy_matting.py` añade un nodo real de matting, `MaskToImage` y un segundo `SaveImage`, seleccionando explícitamente `RMBG-2.0`, `BiRefNet-portrait` o `BiRefNet-matting`. Se comprueban esquema del nodo y todos los pesos/auxiliares del inventario `/models/rmbg` antes de enviar el trabajo.
- [x] `comfy_runtime.render_outputs` permite recuperar `7` y `25` del **mismo prompt**, sin rutas arbitrarias ni mezcla de historial; el uso anterior `render` conserva su contrato. Si falta máscara, respuesta o formato, devuelve error y evita publicar arte.
- [x] `sprite_cutout.transparent_sprite_from_matte` reconstruye RGBA en Pillow a partir de imagen procesada y máscara en escala de grises, preservando bordes semitransparentes. Gating de tamaño/dimensiones, cobertura, contorno, máscara invertida/vacía y tipo de archivo. Pruebas deterministas sin GPU con fondos no verdes y píxeles semitransparentes.
- [x] Creador: `NewSpriteDraft.cutout_mode` opt-in con predeterminado `chroma_green`, cambios de prompt por método, preflight antes de generar, snapshot/caché de borrador, lo mismo para LoRA+IPAdapter; nuevo GET `/api/v1/images/matting/status`. UI Creator Studio muestra selector, botón de comprobación y calidad por expresión; Playwright lo prueba en escritorio/móvil sin inferencia.
- [x] `sprite_provenance` valida y conserva `matting:{mode,model}` y `comfy-sprite-v3-matting/v4-matting-ipadapter`, con compatibilidad v1/v2, backups/forks y rechazo de metadatos manipulados.
- [x] [CI #42158275044](https://github.com/Mairon31/novel_ai/actions/runs/42158275044) del commit funcional `63db653c`: **326/326 Python + 66/66 Playwright (desktop/móvil) + Vite build PASS**. La ejecución anterior `42158080563` tuvo 1 fallo intermitente de atajo `Alt+1` en `reader-modes.spec.ts`; se documenta como flakiness aún no reproducida en el siguiente run, no como un fallo del matting. El run posterior pasa completo; no hay validación de hardware físico.
- [ ] Ensayo con checkpoint, extensión RMBG real y pesos ya instalados para comprobar calidad de pelo/vestuario, consumo VRAM, latencia y necesidad de segmentación mejorada. También quedan pendientes matting regional multi-NPC y consistencia automática de rasgos faciales. Ver `docs/COMFY_SPRITE_DRAFTS.md`.

## 2026-11-05/06 — Herramienta de benchmark físico para sprites (sin resultados de hardware todavía)

- [x] `tools/sprite_gpu_benchmark.py` implementa ensayos reproducibles contra API Noble en loopback con checkpoint y resolución **realmente configurados**: `--list-stories`/`--list-characters` solo lectura, `--check-only` sin GPU, selección de modos/expresiones con semilla fija, referencias opcionales de IPAdapter/LoRA, no aprobación automática y descarte condicionado por `--discard-after`. Hasta tres borradores retenidos por historia; con descarte se pueden comparar cuatro modos sin superar el límite. URL estrictamente loopback, sin credenciales, sin proxies ni redirecciones.
- [x] Informe actualizado tras cada expresión: latencia HTTP hasta preview validado, imagen PNG RGBA, alfa suave/cobertura/bordes/bbox, lecturas de `nvidia-smi` si existen (no se inventa VRAM), modo/checkpoint usados, estado y errores sanitizados. `review.html` y `review.csv` para evaluación humana de rostro, vestuario y pelo; no incluye UUID ni texto privado de historia/NPC en JSON. Ausencia de modelo o máscara marca fallo/omisión, no `PASS`.
- [x] `tests/test_sprite_gpu_benchmark.py` usa API/nvidia-smi simulados en CI para probar descubrimiento, preflight, rechazo URL insegura, informes en disco, métricas PNG, GPU como medición o `null`, ausencia de aprobación/descarte implícito, limpieza explícita y manejo de fallos parciales. Pruebas de hardware físico: **NO ejecutadas**; guía de ejecución en `docs/GPU_SPRITE_BENCHMARK.md`.
- [x] [CI #42161285281](https://github.com/Mairon31/novel_ai/actions/runs/42161285281), commit `8b5a3aac`: **337/337 Python + 66/66 Playwright PASS; build Vite PASS**. La versión final también genera la comparativa HTML **por expresión**, con resumen de P50/P95 y picos NVIDIA muestreados, y protege los reportes privados por `.gitignore`. Este gate verifica solamente la lógica del cliente con transporte y GPU simulados.
- [ ] Sin ensayo real de la GPU todavía: rendimiento, calidad de pelo/rostro/vestuario, soportes de familias de checkpoints y VRAM pico real continúan sin medirse.

## 2026-11-05/06 — Noble AI jugable en Colab (implementación, no ensayo físico)

- [x] Nuevo notebook `notebooks/noble_ai_colab_play.ipynb` con **una celda ejecutable** y cuatro parámetros opcionales: `REVISION`, `MODELO`, `IMAGENES`, `COPIA_EN_DRIVE`. El notebook resuelve `master` a SHA fijo con `git ls-remote` y descarga el instalador de ese mismo commit para evitar mezcla entre versiones. El enlace se abre directamente desde Colab; sin copiar tokens ni configurar Cloudflare.
- [x] `tools/colab_launch.py` clona/fetchea SHA en checkout separado de los datos, lee requisitos vigentes Python/React, instala Node compatible, compila Vite, inicia FastAPI+StaticFiles por puerto 8000 en loopback. Usa el proxy del kernel autenticado de Colab, iframe y enlace de sesión. Instala Ollama y selecciona Qwen3 Instruct 4B o 1.7B según VRAM; admite otros tags seguros y prueba inferencia real vía `POST /narrative/prepare` sin guardar turnos.
- [x] La primera biblioteca vacía recibe una historia de demostración editable; bibliotecas existentes se conservan. Con GPU y opción `auto`, el instalador intenta ComfyUI y un checkpoint SD1.5 FP16 cuyo SHA256 está publicado; si el paso opcional falla, Noble AI y Ollama siguen ejecutables. Configuraciones de narración/imagen existentes se respetan. Se generan logs separados y `launch_state.json`.
- [x] Opt-in Google Drive restaura datos locales y crea copia periódica de archivos más respaldo online SQLite. Respaldo no atómico frente a un apagón; default desactivado para mantener el arranque de una sola celda sin permisos. No ejecuta túnel público ni bucle anti-AFK.
- [ ] CI `tests/test_colab_play.py` y ejecución física Colab pendientes de validar. Pruebas automatizadas son offline; no se ha ejecutado aún el notebook con GPU, Ollama o ComfyUI reales desde esta sesión.

- [x] Actualizaciones en el mismo runtime: `restart_api_for_revision` compara SHA, verifica el PID/argv real del Uvicorn propio y reinicia solo esa API para ejecutar los módulos/migraciones del commit nuevo. Si el puerto 8000 es ajeno, falla sin matar procesos desconocidos. Las preferencias y las historias SQLite/media se conservan fuera del checkout Git. Tres pruebas unitarias adicionales simulan PID correcto, PID ajeno y mismo commit.


## 2026-11-05 — Feedback de usuario tras ejecutar Noble AI en Google Colab

**Alcance de este registro: documentación y planificación, NO desarrollo ni cierre de funcionalidades.** El usuario señala que la app sigue demasiado centrada en la gestión técnica, que la historia demostrativa es incompleta y que Creator Studio/las historias deberían ser el foco. Pide además instalación real desde la UI de modelos de imagen y voces, configuración por motor, orquestación robusta, catálogo de historias de la comunidad y un Model Hub profundo de estilo Urakatsu.

- [x] Retroalimentación descompuesta en entregables **N-01 a N-15**, con dependencias, fases P0/P1/P2 y criterios de QA en [FEEDBACK_COLAB_Y_BACKLOG.md](FEEDBACK_COLAB_Y_BACKLOG.md); checklist nuevo en [TODO.md](../TODO.md), estrategia actualizada en [ROADMAP.md](ROADMAP.md).
- [ ] Modelos de imagen instalables directamente desde Noble AI; selección/activación verificada.
- [ ] Voces TTS instalables desde Noble AI; prueba WAV real y asignación por NPC.
- [ ] Configuraciones de motores y política GPU aplicadas realmente; orquestador de cola y memoria.
- [ ] Rediseño story-first de Biblioteca, detalle, Creator y Model Hub estilo Urakatsu.
- [ ] Generación asistida de historia completa y recursos visuales editables por el autor.
- [ ] Historia de ejemplo enriquecida y catálogo de paquetes locales jugables.
- [ ] Hub remoto de comunidad/Creators con publicación, licencias, permisos y moderación.
- [ ] QA real en Colab y desktop/móvil; la URL temporal del runtime no se toma como evidencia de navegación por parte de este asistente.

**No se han marcado implementaciones como completas en este registro.** Las funcionalidades existentes de catálogo HF, ComfyUI, Piper y Creator son base parcial; **no** satisfacen todavía los criterios ampliados solicitados. El trabajo futuro deberá desglosarse en cambios verificables, sin prometer entrega de todo el alcance en una sesión.


## 2026-11-05/06 — Primer Story Hub local jugable (texto y autoría)

- [x] `story_hub.py`: catálogo original offline con tres historias de 4 NPC, 3 Lorebooks y 3 aperturas, metadatos públicos aislados de la trama privada. No incluye imágenes ni servicio comunitario.
- [x] `StoryHub.tsx`: Biblioteca permite elegir historia, ver detalles/inicios, cambiar protagonista, instalar como copia independiente y abrir detalle para comenzar. Transacción única de SQLite para historia, blueprint, personajes y conocimiento; un fallo revierte todo.
- [x] Colab `ensure_demo_story()` instala `ultima-luna` con contenido real si la biblioteca está vacía; conserva historias anteriores. [CI #42169215781](https://github.com/Mairon31/novel_ai/actions/runs/42169215781): **358 Python, 68 Playwright escritorio/móvil y Vite PASS**.
- [ ] N-08/N-09 todavía necesitan portadas/sprites y paquetes externos con versiones, mejoras de tramas/recursos y QA de 10–20 turnos. N-10 comunitario continúa pendiente. [Detalles](STORY_HUB.md).

- [x] Espacio de navegación `#/descubrir` y entrada «Descubrir historias» separada de Biblioteca/Creator Studio, con deep links, recarga y redirección a detalle tras instalar. Nuevo E2E desktop/móvil añadido; cerrar cuando CI final de este bloque termine.

- [x] Ruta dedicada `#/descubrir` probada con recarga y navegación tras instalar. [CI #42170140099](https://github.com/Mairon31/novel_ai/actions/runs/42170140099): **358 Python, 70 Playwright y Vite PASS**.
- [x] Regresión adicional `test_bundled_world_roundtrip_portable_archive_preserves_lore_and_npcs`: instalación de paquete → exportación `.noble.zip` → importación `as_copy=true` → comprobación de NPC, Lorebooks, tres aperturas y aislamiento de UUID → primera escena del mundo restaurado. [CI #42170420070](https://github.com/Mairon31/novel_ai/actions/runs/42170420070): **359 Python PASS**, prueba frontend aún en ejecución al redactar esta nota.


## 2026-11-06 — Creator Studio: asistente IA narrativo, con confirmación

- [x] Código publicado en master: a3bf20c (API StoryGenerator, tres etapas y validación; instalación transaccional compartida con Story Hub); f7b86c6 (formulario, previsualización y confirmación desde Creator Studio). Ningún borrador se persiste sin la acción explícita del creador.
- [x] Pruebas offline añadidas para tres etapas simuladas, JSON truncado, campos inesperados y rollback forzado de SQLite. Nuevo test Playwright escritorio/móvil para generación simulada y commit real en API.
- [x] Resultado final de integración: [CI #42180655437](https://github.com/Mairon31/novel_ai/actions/runs/42180655437), commit `3be0b5c`: **365/365 Python, 72/72 Playwright en desktop/móvil y Vite build PASS**. La prueba del asistente usa LLM simulado pero realiza una instalación real mediante API/SQLite. Regresiones E2E previas detectaron y corrigieron dos selectores/datos de prueba (`d69df8b`, `3be0b5c`).
- [x] Edición granular de todas las fichas NPC/Lorebook, aperturas, directrices y trama pública/privada antes de instalar; activadores y etiquetas conservan comas/espacios mientras se escribe (`10cbf6a`, `f235a9c`).
- [ ] El asistente aún no produce portadas ni sprites ni sintetiza TTS y no tiene cancelación física del modelo/worker verificada. La regeneración selectiva de texto se desarrolló después de este hito; proveedor real, VRAM y calidad narrativa sostenida pendientes.


## 2026-11-06 · Creator Studio: regeneración selectiva y reversión

- [x] Regeneración de aperturas, NPC y Lorebook con canon contextual, validación tipada y confirmación explícita de instalación, más prueba UI y presupuesto de caracteres: [CI #42254112191](https://github.com/Mairon31/novel_ai/actions/runs/42254112191) PASS.
- [x] Revisión de trama principal `plot` publicada en `master`: reescribe cinco campos de narrativa y preserva secciones no seleccionadas; [CI #42256256693](https://github.com/Mairon31/novel_ai/actions/runs/42256256693): 372 Python / 72 Playwright y build Vite PASS.
- [x] UI: restauración de una versión previa, descarte de respuestas obsoletas y estimación etiquetada como aproximada; Playwright PASS escritorio y móvil en [CI #42256256693](https://github.com/Mairon31/novel_ai/actions/runs/42256256693).
- [x] Refactorización de `StoryGenerator` para mover la regeneración de función asociada dinámicamente a método propio de la clase; contexto de trama con saltos de línea legibles.
- [ ] Pruebas físicas de narrador real, cancelación del proveedor, medición real de tokens y efectos narrativos sostenidos; imágenes y TTS siguen pendientes.


## 2026-11-06 · Ajustes TTS: voz Piper preferida

- [x] Conectada la preferencia `default_voice_id` ya persistida por el backend a Generación multimedia: seleccionar una voz realmente detectada o recuperar fallback, guardar explícitamente y recibir validación del servidor.
- [x] Lector: al entrar, utiliza preferencia persistida si existe en las voces instaladas; de lo contrario utiliza la primera voz, sin activar TTS ni sintetizar. Se mantiene la selección manual de voz mientras dure la vista.
- [x] Test Python de API sobre persistencia, rechazo de voz inexistente y ausencia de síntesis; test Playwright de elección y relectura tras recarga en desktop/móvil. [CI #42257447516](https://github.com/Mairon31/novel_ai/actions/runs/42257447516) PASS.
- [ ] N-02 sigue abierto: falta instalador desde UI de archivos Piper ONNX/JSON con integridad, progreso de descarga, catálogos y opción de prueba de voz real.

- [x] Robustecimiento de GitHub Actions: validación del paquete nativo de Rollup en Linux y recuperación de la misma versión antes de invocar Vite; responde a fallo de instalación intermitente en CI #42257230770. Cambio publicado, ejecución posterior aún pendiente de resultado.


## 2026-11-06 · Primer instalador Piper desde la UI

- [x] Backend `voice_installer.py`: catálogo inicial de dos voces mexicanas verificables, trabajo SQL independiente, revisión HF fijada al instalar, descarga binaria por pareja ONNX/JSON con integridad y tamaño, pausa, Range, cancelación y publicación solo después de verificar.
- [x] Frontend en Generación multimedia: catálogo, enlace a ficha/licencia, botón Instalar, barra de progreso MiB, pausar/reanudar/cancelar y actualización de las voces seleccionables; no hay descarga al abrir Ajustes.
- [x] Pruebas Python (Hugging Face simulado) y Playwright (escritorio/móvil, proveedor mock) aprobadas en [CI #42263945875](https://github.com/Mairon31/novel_ai/actions/runs/42263945875): 378 Python, 76 Playwright y Vite PASS. No equiparar cobertura simulada a instalación física.
- [ ] Instalación del motor Piper, otros idiomas/voz por personaje y prueba real Windows/Colab pendientes. Checkpoint de imagen desde interfaz pendiente.

- [x] Arreglo del contador de descarga: los bytes del JSON de configuración estaban buffered y no se reportaban al 100 %. Corregido, verificado en CI #42263945875.
- [x] Protección adicional ante archivos ONNX/JSON del usuario preexistentes, antes de transferir bytes, con prueba Python específica. Última ejecución CI pendiente.
- [x] Fix de atajos del lector: si un cambio de modo aún se guarda, conserva el último Alt+1/2/3 para aplicarlo después, en lugar de ignorarlo por carrera. Última ejecución CI pendiente.


## 2026-11-06 · Prueba de voz puntual en Generación multimedia

- [x] API `/api/v1/tts/preview`: texto limitado a 400 caracteres, fuente `preview_button`, verificación de voz y binario, bloqueo compartido de síntesis, timeout y WAV temporal (se elimina, no se escribe historia).
- [x] Interfaz: texto de prueba, botón explícito y reproductor de audio nativo tras recibir WAV, sin autoplay ni activación accidental.
- [x] Pruebas Python con motor ficticio y Playwright escritorio/móvil aprobadas: [CI #42265155907](https://github.com/Mairon31/novel_ai/actions/runs/42265155907), 381 Python / 76 navegador y Vite PASS. Pruebas con Piper real y voz real pendientes.


## 2026-11-06 · Feedback de producto documentado (solo backlog, sin implementaciones nuevas)

- [x] Registrados nuevos requisitos de usuario **N-16 a N-24** en [TODO.md](../TODO.md), todos **[ ] pendientes** en la fuente maestra: Pocket TTS/OmniVoice/Kokoro/Qwen3 TTS, reparto de voces NPC/narrador, dirección narrativa con reglas de mundo y NPC no complacientes, editor roleplay/ajustes de historia, estética anime/fantasía, paneles de imagen/TTS integrados, preflight visual al abrir historia sin arte y generación de recursos al confirmar creación con campos obligatorios.
- [x] Especificación funcional y criterios de aceptación en [PLAN_HISTORIAS_ANIME_2026_11_06.md](PLAN_HISTORIAS_ANIME_2026_11_06.md), vinculados a [ROADMAP.md](ROADMAP.md), [TTS.md](TTS.md) y [QA_Y_ACEPTACION.md](QA_Y_ACEPTACION.md). Dos capturas del editor recibidas por chat y descritas; **no se han añadido los archivos de imagen al repositorio**.
- [ ] Ninguna de esas nuevas capacidades N-16 a N-24 ha quedado implementada, ni se ha realizado en esta entrada ensayo de modelos TTS/imagen o prueba de historia ilustrada completa. La disponibilidad previa de módulos parciales no debe usarse para marcar estos puntos como resueltos.

## 2026-11-06 · Feedback adicional de separación de Ajustes (solo documentación)

- [x] Se agregó **N-25** al TODO y al plan de experiencia anime: separar «Imágenes y voz» en dos apartados independientes **Imágenes** y **Voz / TTS**, y «Sobre y actualizaciones» en **Acerca de Noble AI** y **Actualizaciones**, manteniendo la configuración dentro de Noble AI.
- [x] Se precisaron criterios QA y orden de trabajo en `ROADMAP.md`, `QA_Y_ACEPTACION.md` y `PLAN_HISTORIAS_ANIME_2026_11_06.md`, tras verificar que los dos nombres combinados existen en `WorkspaceSettings.tsx` y que `CreativeSettings.tsx` reúne imágenes y voz.
- [ ] **No se modificó el código de la UI** ni se crearon pantallas nuevas. Pendiente N-25 y pruebas de navegación/guardado desktop+móvil. No marcar como implementación.


## 2026-11-06 · Implementación real N-25 — configuración separada (CI verificada)

- [x] Refactor del panel multimedia a `ImageSettingsPanel.tsx` y `VoiceSettingsPanel.tsx`: carga independiente de API, guardado y diagnóstico ComfyUI/GPU frente a catálogo, preferencias y prueba Piper. Eliminado `CreativeSettings.tsx` combinado.
- [x] `WorkspaceSettings.tsx` ofrece cuatro destinos separados: Imágenes, Voz / TTS, Acerca de Noble AI y Actualizaciones. Los dos últimos tienen ahora sus propios componentes independientes, y las consultas de releases ocurren en Actualizaciones.
- [x] URLs directas `#/configuracion/images`, `/voice`, `/about` y `/updates`, soporte de recarga/atrás/adelante y enlace heredado `/multimedia` que abre Imágenes; no se alteraron preferencias SQLite, API ni motores.
- [x] Tests antiguos de imágenes, Piper y Ajustes migrados; nuevo `settings-separation.spec.ts` con validación de cuatro pantallas, APIs aisladas, recarga, navegación e interfaz móvil/escritorio. Corregidos selectores ambiguos detectados por CI intermedia.
- [x] **N-25 cerrado en código y CI:** [run #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131) con **381/381 Python + 80/80 Playwright** desktop/móvil y Vite PASS, incluyendo capturas de Imágenes, Voz, Acerca y Actualizaciones y pruebas de deep link/aislamiento API. Las pruebas de navegador usan API local, pero no incluyen revisión humana de capturas ni instalaciones físicas GPU/Piper (pendientes N-21/N-24).


## 2026-11-06 · N-21, controles avanzados de ilustración anime (CI aprobada)

- [x] `ImageSettings` extiende persistencia SQLite con `sampler_name`, `scheduler` y `style_preset`; validación Pydantic restringe los valores admitidos. Configuraciones anteriores se leen aplicando defaults y utilidades antiguas de grafo conservan Euler/Normal.
- [x] `workflow()` usa realmente los valores en KSampler; `styled_prompt()` añade ADN visual elegido solo al invocar una ilustración, con anime de fantasía como preset global inicial, y `none` que no modifica el prompt.
- [x] Endpoint explícito `GET /api/v1/images/sampler-options`: inspecciona el `object_info/KSampler` del ComfyUI configurado, expone intersección de métodos probados y valida métodos no predeterminados antes de enviar el prompt, fallando con 422 si no están instalados.
- [x] Metadatos del render y firma de caché guardan muestreador, scheduler y estilo, con compatibilidad de archivos antiguos; pruebas de importación de procedencia malformada previenen datos no autorizados.
- [x] UI Imágenes incluye desplegables, comprobación manual de compatibilidad, guardado y aviso de no compatibilidad sin abrir otra interfaz. Test navegador verifica persistencia entre paneles y bloqueo de ajustes conocidos no compatibles.
- [x] CI [#42340226265](https://github.com/Mairon31/novel_ai/actions/runs/42340226265) PASS (385 Python / 80 Playwright escritorio-móvil / Vite). La prueba física con ComfyUI real sin mocks sigue pendiente. N-21 completo sigue abierto: instalación de modelos de imagen y ajustes por historia/escena y TTS de múltiples proveedores.


## 2026-11-06 · N-21, controles avanzados Piper (CI verificada)

- [x] API `GET/PUT /api/v1/tts/synthesis-config` con Pydantic y SQLite, `length_scale` (0.5–2), `noise_scale` (0–1.5) y `noise_w` (0–1.5). Rechazo de campos inválidos y persistencia sin afectar a voz predeterminada.
- [x] Previsualización puntual y lectura de turnos comparten parámetros Piper reales `--length_scale`, `--noise_scale`, `--noise_w` y respetan la ejecución bajo demanda. La firma del audio cacheado incorpora la configuración para generar nuevas versiones sin perder originales.
- [x] Voz/TTS (panel separado de Imágenes) expone los controles, guardado explícito, señal de cambios pendientes y deshabilitación de muestra hasta guardarlos; audio previo invalidado tras cambiar parámetros.
- [x] Pruebas Python con ejecutable falso validan argumentos, persistencia, rechazo de valores, cambios de caché y WAV temporal; test Playwright valida guardar/recargar y ausencia de síntesis implícita.
- [x] CI **[#42340597543](https://github.com/Mairon31/novel_ai/actions/runs/42340597543) PASS: 387 Python / 80 Playwright / Vite**. El ensayo real con una voz ONNX y el ejecutable Piper en Windows/Colab, motores adicionales y voces por personaje siguen abiertos.

- [x] Corrección independiente de test Colab intermitente: comparar tokens completos de `git` en lugar de buscar fragmentos `rm`/ `clean` dentro de rutas temporales aleatorias; código publicado en `master` y nuevo CI pendiente.
