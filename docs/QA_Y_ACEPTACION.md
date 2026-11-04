undefined
## Evidencia P1 — motor narrativo sin GPU física

Suite `python -m unittest discover -s tests -p 'test_*.py' -v`: **21 PASS**. Incluye respuestas simuladas a APIs HTTP reales de Ollama y KoboldCpp, primer turno streaming, idempotencia sin doble inferencia, error sin commit, persistencia, endpoint loopback, start/stop del proceso propio simulado, validación del GGUF registrado, CPU `--gpulayers 0` y activación.

Playwright con backend FastAPI real y navegador Chromium: **6 PASS**, 3 por viewport escritorio y 3 móvil. Verifica catálogo, navegación, creación de historia y presentación de SSE con **respuesta ficticia** interceptada en el navegador. Artefactos contienen capturas de escritorio y móvil.

Evidencia: https://github.com/Mairon31/novel_ai/actions/runs/41905069185

**Gates aún abiertos:** descarga pública real de modelo grande, carga desde KoboldCpp/Ollama sin mocks, latencia y VRAM físicos, 12GB y 16GB, coherencia del canon, branching, imágenes y TTS. Los 21+6 tests **no certifican** estos gates.
