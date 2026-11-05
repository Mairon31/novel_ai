# AGENTS.md — instrucciones de ingeniería Noble AI

Leer `TODO.md`, `docs/ARGON_AUDITORIA.md`, `README.md`, `docs/GDD_TECNICO.md`, `docs/ARQUITECTURA.md`, `docs/MODEL_HUB.md`, `docs/ONBOARDING_Y_UI.md`, `docs/ROADMAP.md`, `docs/PROGRESO.md`, `docs/REFERENCIAS_URAKATSU_KOHARU.md`, `docs/SEGURIDAD_Y_LICENCIAS.md` y ambas ADR antes de cambiar código.

**Misión:** crear app web/desktop local-first con novela visual, catálogo/descargas de modelos dentro de la UI, proveedores intercambiables y memoria persistente. La experiencia final es **APP-FIRST**, no un notebook; el primer vertical slice debería ser Model Hub + wizard + narrador real. El repositorio ya contiene un frontend React, API FastAPI, almacenamiento SQLite y pruebas automatizadas. Nunca asumir que un módulo falta sin inspeccionar el `master` actual.

## Reglas no negociables

1. **Empezar inspeccionando GitHub y el trabajo existente**. Nunca reimplementar por descuido librerías maduras que podamos usar con licencia apropiada.
2. Estudiar Urakatsu MIT (`catalog/hf.py`, `fit.py`, `installed.py`, `ModelsPage.tsx` y FastAPI) y Koharu MIT/Apache (Settings/Providers, Tauri). **No copiar código hasta decidir el reuso**, registrar commit fuente, licencia y copyright/NOTICE.
3. **Wizard sin modelos**: app abre aun con 0 checkpoints, permite elegir destino/CPU/GPU/providers y buscar/instalar desde UI; no exigir `.env`, Colab, consola ni descargar manualmente al usuario final.
4. **Separar catálogo / descarga / modelo instalado / runtime / provider / rol / perfil**. Validar compatibilidad real, ruta, checksum, revisión, esquema, y jobs; no suponer que una safetensors es un TTS válido.
5. Los proveedores exponen capacidades reales; campos incompatibles deben quedar deshabilitados con explicación; CPU/GPU elegible solo cuando lo permita el backend.
6. LLM narrativo disponible al jugar; puede estar parcialmente CPU offloaded. **12GB mínimo objetivo y 16GB recomendado** requieren medición. No cargar LLM+ComfyUI+TTS a la vez sin scheduler/VRAM budget.
7. **Imágenes** solo por cambio visual material de escena o solicitud; reutilizar caché; historia puede funcionar sin ellas.
8. **TTS OFF por defecto**: nada de precarga, llamadas ni síntesis sin clic/autolectura autorizada por el usuario.
9. Presets globales + overrides por historia; cambiar un modelo nunca destruye canon ni datos.
10. Mantener SQLite event log inmutable; retry/edit crea rama; idempotencia y revisión optimista.
11. Interfaz VN responsive móvil/escritorio; cada cambio UI requiere Playwright/capturas 390x844 y 1440x900. **No botones ficticios ni placeholders en producción**.
12. Tauri 2 es candidato de futuro `.exe`, **no implementación asumida**. El shell solo debe cerrar procesos propios y proteger acceso local/LAN.
13. No descargar/ejecutar código Python remoto a partir de manifest de modelo. Secrets en keychain, URL/procedencia verificadas. No guardar pesos, proyectos privados o `.env` en Git.
14. Colab sirve para pruebas con GPU, no entorno principal; respetar limitaciones de runtimes y evitar túneles/anti-AFK.
15. Cada PR exige código, contrato, pruebas unit/integration reales si factible, error paths, QA visual, docs/ADR/PROGRESO, sha/licencias de modelos y regresión.
16. Respetar español latinoamericano natural en UX y narrativa, usar identificadores de código/API consistentes en inglés.
17. Sin afirmaciones 'PASS' sin ejecución y evidencia; mock PASS no es una integración real. Si hay FAIL, arreglarlo o reportarlo como bloqueo.
18. Cambios en issues/milestones deben reflejarse en roadmap.

## Orden técnico obligatorio

**P0**: estudiar reuso + contrato y licencias. **P0.5**: backend health/hardware, UI wizard + Models Hub, búsqueda HF/descargas/revisión real. **P1**: runtime supervisor + LLM/narración/SQLite y VN. **P2**: imágenes ComfyUI progresivas. **P3**: TTS opt-in. **P4**: empaquetado Tauri y editores. **P5**: GPU 12/16 y calidad.

## Reporte de cierre de cada tarea

- Qué se implementó y **qué sigue sin implementarse**.
- Archivos y commits; proveedores/versions/licencias.
- Pruebas corridas (comando, resultado, entorno, screenshots/benchmark); tests no corridos en SKIP/NOT_RUN.
- Fallos/limitaciones/preferencias de perfil por GPU.
- `docs/PROGRESO.md` actualizado, link a issue y siguiente paso medible.

## Integración obligatoria de la auditoría Argon (2026-11-05)

- `TODO.md` es el backlog operativo con casillas y criterios verificables; `docs/ARGON_AUDITORIA.md` contiene los 22 apartados de diagnóstico, fases y arquitectura objetivo. **Trabajar directamente en `master`** salvo instrucción explícita en contrario; no crear una rama por tarea.
- Antes de implementar, comprobar si el hallazgo sigue vigente: el código existente ya incluye WAL, SSE, Range/SHA-256 condicional y bloqueo básico GPU, pero no completa todas sus garantías.
- Distinguir diseño, código, suite CI y validación sobre GPU real. Cerrar una casilla solo con pruebas y citar commit/resultado en `docs/PROGRESO.md`.
- P0: rutas de archivos, atomicidad/rollback, cancelación y seguridad de workers. P1: VRAM, estado canónico, Lorebooks, escena multicapa. P2: V2/V3, Model Hub avanzado, medidor de contexto. No priorizar P3 por encima de estabilidad.
- Las etiquetas `AUD-005/006/007` están duplicadas con otros sentidos dentro de la auditoría: `TODO.md` usa la nomenclatura estable de su §18. Citar §05 para los hallazgos homónimos.
- Reutilizar implementaciones open-source compatibles y registrar su origen/licencia en `docs/THIRD_PARTY_NOTICES.md`; no inventar prohibiciones de copia de interfaz, ni asumir que atribución por sí sola cubre todas las obligaciones de licencia.
