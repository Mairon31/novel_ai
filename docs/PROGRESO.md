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
