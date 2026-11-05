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
