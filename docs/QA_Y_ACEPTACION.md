# QA, evidencias y criterios de aceptación

## Evidencia P1 — motor narrativo sin GPU física

Suite `python -m unittest discover -s tests -p 'test_*.py' -v`: **21 PASS**. Incluye respuestas simuladas a APIs HTTP reales de Ollama y KoboldCpp, primer turno streaming, idempotencia sin doble inferencia, error sin commit, persistencia, endpoint loopback, start/stop del proceso propio simulado, validación del GGUF registrado, CPU `--gpulayers 0` y activación.

Playwright con backend FastAPI real y navegador Chromium: **6 PASS**, 3 por viewport escritorio y 3 móvil. Verifica catálogo, navegación, creación de historia y presentación de SSE con **respuesta ficticia** interceptada en el navegador. Artefactos contienen capturas de escritorio y móvil.

Evidencia: https://github.com/Mairon31/novel_ai/actions/runs/41905069185

**Gates aún abiertos:** descarga pública real de modelo grande, carga desde KoboldCpp/Ollama sin mocks, latencia y VRAM físicos, 12GB y 16GB, coherencia del canon, branching, imágenes y TTS. Los 21+6 tests **no certifican** estos gates.


## Gates de la auditoría Argon — 2026-11-05

El listado con casillas y dependencias se mantiene en [`TODO.md`](../TODO.md). Lo siguiente son **pruebas por ejecutar**, no resultados aprobados:

- **P0 persistencia:** `PRAGMA foreign_keys` comprobado en cada conexión; transacciones con rollback de turno+estado y 50 escrituras concurrentes sin corrupción ni `database is locked` persistente.
- **P0 modelos/medios:** traversal por IDs/rutas falsas y symlinks hacia fuera del directorio; no leer, sobrescribir ni borrar archivos ajenos; descarga parcial exacta con `206 Content-Range`, fallo de hash y reconexión controlada.
- **P0 streaming:** abortar en 3 momentos (antes del primer token, a mitad del stream y justo antes del commit), comprobar no duplicación/commit parcial y liberación de recursos de workers; ensayar cancelación del cómputo real, no solo desconexión HTTP simulada.
- **P0/P1 GPU:** registrar nombre de GPU, VRAM ocupada/libre, KV-cache y picos; ejecutar 20–25 alternancias LLM/ComfyUI sin OOM; comparar políticas de monitor/guard/descarga sobre NVIDIA.
- **P1 coherencia:** historia de 120 turnos, hecho recuperado del turno 3, testigo ausente sin acceso al secreto y bifurcación con snapshot intacto; validar límite de contexto.
- **P1 visual:** 10 turnos en una ubicación sin nuevos fondos; cambios de emoción solo con sprites; pruebas visuales en escritorio y móvil.
- **P2 interoperabilidad:** PNG V2/V3 export/import roundtrip, rechazo de tarjetas adulteradas, límites de tamaño/regex y preservación de archivos del usuario.
- **Rendimiento:** TTFT, TPS, latencia visual y uso GPU medidos en máquinas especificadas; las metas de la auditoría no constituyen datos reales. Comparar código y logs por commit.

Cada gate debe enlazar commit, comandos exactos, CI y, cuando aplique, logs de hardware en [`PROGRESO.md`](PROGRESO.md). Una prueba simulada no prueba los tiempos en una RTX 5060 Ti.
