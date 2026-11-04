# ADR-0001 — Ensamblar motores existentes con orquestador propio

Fecha: 2026-11-04 · Estado: **aceptada para prototipo, sujeta a resultados de pruebas**.

## Contexto

Queremos Isekai-like local: historias persistentes, arte anime progresivo, voz bajo solicitud, escritorio/móvil, Google Colab primero y GPU NVIDIA de 12 GB mínimo recomendado. No compensa reimplementar inferencia LLM, difusión o síntesis de voz. Tampoco conviene copiar una aplicación AGPL completa dentro de un producto propio sin diseño previo de licencias.

## Decisión

- Frontend **React + Vite + TypeScript** específico para experiencia VN; patrón UX inspirado en Open Dungeon/SillyTavern, sin copiar sus assets.
- Backend/orquestación **Python FastAPI + Pydantic + SQLAlchemy/Alembic + SQLite**: encaja con integración Python de modelos, portable Linux/Colab y Windows.
- Proveedor LLM primario **KoboldCpp** por su facilidad con GGUF, contexto/streaming y API `/v1`. **Ollama** fallback.
- Proveedor de ilustración primario **ComfyUI HTTP/WS** con workflows guardados y validados. No intentar implementar difusión dentro del backend.
- TTS primario **Chatterbox Multilingual** (evaluar variante LatAm) **carga diferida**; **Qwen3-TTS** alternativa.
- **Open Dungeon (MIT)** es primer candidato para estudiar/reutilizar módulos de UX y ciclo narrativo según coste de adaptación. No asumir API estable ni que se pueda conectar directamente sin un spike.
- **Talemate (AGPL-3.0)** se evalúa como aplicación íntegra o fuente de patrones de estado/agentes; evitar copiar partes a Noble sin resolver obligaciones de AGPL.
- El scheduler controla memoria GPU y trabajos; narración primero, imágenes/TTS opt-in o progresivas.

## Alternativas consideradas

1. **Fork completo de Talemate**: fuerte en memoria pero licencia y estructura de agentes más intrusivas; candidato para experimento, no núcleo fijado.
2. **Fork completo de Open Dungeon**: MIT y buen ciclo narrativo; es Next.js/Node, modificarlo para un backend Python separado puede superar el coste de adaptar solo su UX. Spike medirá.
3. **SillyTavern como frontend final**: potente pero orientado a chat y AGPL; útil como referencia, no ideal para UX propia.
4. **Ollama como único proveedor**: fácil Colab/local, pero política explícita de carga y GGUF personalizado puede variar; conservar adapter.
5. **Monolito de IA con LLM+SDXL+TTS cargados**: falla en 12/16GB; rechazado.

## Consecuencias

Positivas: independencia del proveedor, fácil experimentación, menor bloqueo entre imagen/voz/texto, recursos reutilizables. Costes: integrar múltiples procesos y mantener contratos, métricas, seguridad, licencias. El backend propio sí contiene lógica nueva no trivial: estado/ramas, memoria, asset planner y scheduler.

## Evidencia necesaria para confirmar ADR

- Spike Open Dungeon: medir esfuerzo de extraer/reusar controles VN legalmente y sin ruptura.
- Spike API KoboldCpp: streaming real, cancelación, rendimiento en 12/16GB.
- Spike ComfyUI: manifest/cola y coherencia de personaje.
- Spike Chatterbox: calidad ES-LA, latencia y consumo de VRAM.
- Colab: tests sin UI externa en runtime gratuito y pruebas GPU solo cuando sea asignada.

Modificar la ADR y crear una nueva ADR si cambia el stack.
