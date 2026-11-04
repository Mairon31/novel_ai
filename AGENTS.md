# AGENTS.md — guía para Codex/agentes y colaboradores de Noble AI

Lee **README.md**, `docs/GDD_TECNICO.md`, `docs/ARQUITECTURA.md`, `docs/ROADMAP.md`, `docs/PROGRESO.md` y `docs/SEGURIDAD_Y_LICENCIAS.md` antes de modificar código. Este repositorio inicialmente contiene **diseño**, no una implementación funcional.

## Misión

Construir y verificar una novela visual narrativa local-first usando **proveedores open source externos** para LLM, imagen y TTS. Meta Colab-first para prototipos reproducibles, Windows RTX 5060 Ti 16GB como máquina destino y 12GB como perfil mínimo a **validar**.

## Reglas obligatorias

1. **Inspeccionar repositorio y dependencias existentes** antes de agregar código; no duplicar motores de inferencia ya mantenidos.
2. Mantener módulos desacoplados con contratos/adapter; UI nunca llama directo a proveedores.
3. El **LLM** debe estar disponible durante la sesión; diseñar offload + scheduler, nunca prometer simultaneidad VRAM no medida.
4. **Imágenes solo por cambio de escenario/estado visual material o petición explícita**; reutilizar caché; no generar todo al crear historia ni por cada turno.
5. **TTS OFF por defecto**; solo explícito (Escuchar / autolectura activada conscientemente); no precargar worker/modelo sin solicitud.
6. SQLite event-log inmutable; retry/edit produce rama, no mutar originales; validación estricta de cambios de canon.
7. Mantener personajes, identidad visual y relaciones consistentes; no usar imágenes ajenas como assets redistribuidos.
8. Diseño de frontend **móvil y escritorio obligatorio**; cambios visuales requieren Playwright y evidencia en ambas vistas.
9. **No placeholders disfrazados de funcionalidad**. Mocks se permiten solo en tests identificados. Probar proveedores reales antes de declarar un módulo integrado.
10. Antes de vendorizar código: comprobar licencia de repo, modelo, custom node y assets. TaleWeaver está restringido a uso no comercial.
11. No subir pesos, datasets, audios personales, claves, modelos generados ni DB con historias. Usar `.env.example` y paths bajo `data/`.
12. No afirmar tests PASS sin haberlos ejecutado. Registrar salida real, entorno, commit y problemas.
13. Corregir errores preexistentes que bloqueen la tarea; no dejar fallos ocultos en suites.
14. Implementar con tests de invariantes/contratos y pruebas de error; cada PR actualiza docs relevantes y `docs/PROGRESO.md`.
15. Usar español latinoamericano para textos UX y documentación, con nombres de código/API en inglés consistentes.
16. Priorizar pequeños incrementos comprobables y commits cohesionados; no reemplazar grandes sistemas sin evaluación de su costo.

## Orden de trabajo para cada issue

1. Leer el scope y criterios de aceptación del roadmap.
2. Verificar versión/licencia de repos externos e interfaces reales.
3. Implementar el cambio mínimo que satisface el contrato completo, no solo una demo superficial.
4. Crear/ajustar tests CPU, contract, integración real cuando posible y QA visual si aplica.
5. Ejecutar tests, adjuntar comandos/resultados y hardware; clasificar SKIP explícitamente.
6. Actualizar README si cambia setup, ADR si cambia diseño, PROGRESO y pendientes.
7. Reportar funcionalidades completadas, no implementadas, fallos y riesgos.

## Estructura esperada

`apps/api`, `apps/web`, `integrations`, `packages/contracts`, `notebooks`, `tests`, `data` ignorado, `docs`, `.github/workflows`. No crear directorios vacíos por decoración.

## Comandos iniciales

`python -m unittest discover -s tests -p "test_*.py"` valida integridad documental una vez añadidas pruebas. Contratos/API, integración GPU y navegador se agregan por fases; no inventar outputs.

## Criterios de calidad por funcionalidad

- Story: estado persistente, ids, retries/branches idempotentes.
- LLM: respuesta real streaming, timeout, cancelación, medición.
- Imágenes: scene planner determinístico, caché, ComfyUI real, asset metadata.
- TTS: invocación explícita, 0 llamadas OFF, audio real en prueba manual.
- GPU: telemetría y modos 12/16GB sin promesas no medidas.
- UI: historia completa utilizable 390px/1440px, sin overlays rotos ni controles inoperantes.

## Importante

Si el entorno o permiso no permite probar GPU/Colab/Windows, describir la limitación, dejar test `SKIP` y no presentar el hito como verificado. Las decisiones pendientes se registran en roadmap/ADR, no se resuelven con suposiciones.
