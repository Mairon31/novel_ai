# Noble AI — estrategia de pruebas y aceptación

Estado: plan de QA; no todas las suites existen todavía.

## Pirámide

**Unitarias/contrato (CPU):** eventos, contexto, BranchManager, cache keys, escena visual, TTS-gating, request idempotency, validaciones Pydantic, migraciones, contrato del provider (fake controlado).

**Integración real (GPU opcional):** KoboldCpp/LLM real, ComfyUI/workflow exportado, Chatterbox TTS real. Separar rigurosamente 'mock PASS' de 'GPU REAL PASS'.

**E2E:** Playwright en Chromium escritorio 1440x900 y móvil 390x844; story create/play/continue/retry/save/reopen, accesibilidad/contraste, diseño sin scroll accidental y botón Escuchar controlado.

**Regresión de narrativa:** guiones fijos de conflictos de inventario, conocimiento secreto, relación/identidad, permanencia de personaje, tiempo y decisiones del jugador. Determinismo parcial con seed/temperature baja; evaluar eventos estructurados en lugar de comparar prosa exacta.

**Resiliencia:** backend reiniciado, proveedor desconectado, timeout, SSE reconecta, 409 concurrente, rama editada durante generación visual, trabajo duplicado, OOM. Cada error debe ser visible/recuperable y no corromper DB.

## Matriz de escenarios

| Caso ID | Setup | Acción | Comportamiento esperado |
|---|---|---|---|
| NA-001 | Historia nueva | 1 turno real | Narración visible y guardada |
| NA-002 | 10 turnos mismo lugar | Continuar | 0 nuevos trabajos de imagen automáticos |
| NA-003 | Cambio de lugar | Continuar | 1 trabajo de fondo máximo, caché al reingresar |
| NA-004 | Audio OFF | 50 turnos | 0 calls/loads TTS |
| NA-005 | Audio OFF | Pulsar Escuchar | Único job TTS, audio o error recuperable |
| NA-006 | Turno 3 | Reintentar | Nueva rama, antigua intacta |
| NA-007 | Evento antiguo | Editar | Nueva rama; stale assets no se muestran |
| NA-008 | Encolado imagen | Caer ComfyUI | Texto continúa, job failed/retry |
| NA-009 | Stream activo | Cortar SSE | Estado final recuperable sin doble commit |
| NA-010 | Peticiones duplicadas | Misma Idempotency-Key | 1 turno, misma respuesta |
| NA-011 | GPU 12GB | Texto + imagen secuencial | Sin OOM o límite medido y fallback explícito |
| NA-012 | GPU 16GB | Texto + imagen + voz manual | Proveedor texto sigue atendible |
| NA-013 | Personaje secreto | Interacción NPC ignorante | No revela hechos no conocidos |
| NA-014 | LLM JSON inválido | Proponer estado | No aplicar cambios inválidos |
| NA-015 | Comfy job viejo | Editar rama durante imagen | Asset no aparece en nueva rama por error |
| NA-016 | Reinicio servicio | Volver a abrir | Event log/canon/revisión idénticos |
| NA-017 | Export/import | Roundtrip | Mismos eventos, hashes y ramas |
| NA-018 | UI móvil | Navegar/play/editar | Accesible sin controles fuera de viewport |

## Evidencia de prueba

Cada reporte registra:
```json
{
  "test_id":"NA-001",
  "status":"NOT_RUN",
  "environment":"colab | windows | ci",
  "commit":"<sha>",
  "model_id":"<model/checkpoint + hash>",
  "gpu_name":null,
  "vram_total_mb":null,
  "vram_peak_mb":null,
  "duration_ms":null,
  "logs":[],"screenshots":[],"issues":[]
}
```

Estados válidos: `PASS`, `FAIL`, `SKIP`, `NOT_RUN`. PASS exige ejecución; SKIP exige explicación. No afirmar "100% conforme" por pasar solo mock/fixture.

## Presupuestos/QA visual

- Comparar captura inicial vs diseño objetivo (VN de retrato, panel de texto, visibilidad de nombres y controles).
- Inspeccionar 390x844, 768x1024 y 1440x900; soporte teclado, botón táctil >=44px, foco visible, scroll robusto.
- Confirmar que no se muestre un sprite de personaje diferente tras una generación tardía.
- Evaluar identidad de personaje en 10 escenas: ojos/cabello/ropa/rasgos; registrar defectos con vínculo al asset y prompt.
- Registrar que texto con varios personajes atribuya diálogos correctamente.

## Comandos previstos por fase

```bash
python -m unittest discover -s tests -p 'test_*.py'
pytest tests/contract
pytest tests/integration -m 'gpu'       # solo cuando infraestructura existe
npm --prefix apps/web run test
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
```

Los comandos de rutas todavía no creadas son **objetivos**, no verificaciones corridas. Implementar setup de proyecto antes de ejecutarlos.

## Bloqueos

No se habilita GPU compatibility badge sin logs de modelo y hardware reales. Error reproducible abierto bloquea la fase a la que pertenece hasta arreglarlo o documentarlo como limitación aceptada.

## Suite APP-FIRST / MODEL HUB obligatoria (fase P0.5)

| Caso ID | Entrada | Resultado esperado |
|---|---|---|
| MH-001 | Primer inicio sin modelos | Wizard + biblioteca + Model Hub funcionan |
| MH-002 | Buscar HF (red disponible) | Resultado real con repo/revision/variants/licencia |
| MH-003 | HF offline/429 | Error visible o caché marcado stale, nunca éxito falso |
| MH-004 | Seleccionar Q4/Q5 | Mostrar tamaño, dependencias, fit estimado y razones |
| MH-005 | Descarga pequeña interrumpida | Reanudar o reiniciar correctamente, hash antes de registrar |
| MH-006 | Descargar modelo multiparte | No aparece como instalado hasta verificar todas las partes |
| MH-007 | Importar archivo GGUF externo | Registro y preview; desinstalar no borra origen externo |
| MH-008 | Cambiar narrador desde UI | Runtime valida, perfil persiste y historia no pierde canon |
| MH-009 | Ajustes TTS OFF | 0 cargas/llamadas al abrir y cambiar opciones |
| MH-010 | Seleccionar CPU para TTS | Ajuste solo si el motor admite CPU, y se respeta en tarea real |
| MH-011 | Modelo de imagen comunitario | Metadata/licencia claras, configuración checkpoint sin falso switch universal |
| MH-012 | Proveedor remoto | Keyring, test de conexión, indicador de salida de datos |
| MH-013 | UI mobile 390x844/desktop 1440x900 | Wizard, filtros, progreso y settings accesibles sin overflow |
| MH-014 | Swapping con job activo | Pausa/cancel/replan seguro, rollback y no corrupción |
| MH-015 | 12GB vs 16GB | Fit estimado ≠ verified; logs reales por GPU antes de marcar soporte |

**Gate de integración real:** buscar en Hugging Face y descargar/verificar/importar al menos un GGUF pequeño y utilizarlo para inferencia real desde la app; no basta con fixtures HTTP mock. El frontend debe conectarse a backend verdadero y cada control debe tener una función operativa. Ver issues [#9](https://github.com/Mairon31/novel_ai/issues/9) y [#10](https://github.com/Mairon31/novel_ai/issues/10).
