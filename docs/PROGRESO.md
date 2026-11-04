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
