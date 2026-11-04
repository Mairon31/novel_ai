# Noble AI — Roadmap APP-FIRST y Definition of Done

Actualizado 2026-11-04 tras [ADR-002](adr/0002-app-first-model-hub.md). Estado: **P1 — Model Hub y prototipo narrativo ejecutables; sin pruebas de inferencia GPU real**. El orden de dependencias ha cambiado: el **Model Hub/Onboarding precede al núcleo narrativo**; Colab es diagnóstico opcional, no interfaz principal.

## Principios de trabajo

1. Ensamblar herramientas open source donde sea conveniente, evaluar licencias/costos.
2. El usuario final **nunca** debe necesitar editar configuración, instalar pesos por consola o ejecutar notebook para usar el producto.
3. UI y API deben ser funcionales desde el primer incremento; los mock providers son solo de pruebas.
4. Todas las funciones se certifican con tests CPU, integraciones reales cuando correspondan, QA visual desktop/móvil y logs.
5. Narración persiste; imagen/TTS opcionales nunca bloquean; 12/16GB sin afirmaciones no medidas.
6. Cambios de arquitectura requieren ADR y actualización de progreso, junto con evidencia.

## Fase P0 — investigación de reusable code y contratos (DOCUMENTADA)

- [x] README, GDD, arquitectura, memoria, API y QA iniciales.
- [x] Inventario de herramientas OSS y licencias.
- [x] Investigación técnica de Urakatsu MIT y Koharu dual MIT/Apache, rutas de código y modelo manager documentadas.
- [x] ADR-002 app-first y specs de Model Hub, UI wizard, escritorio.
- [x] Prueba CI de documentos básica; **no GPU/LLM**.
- [ ] Spike de reuso del catálogo Urakatsu vs `huggingface_hub`, evaluación del coste real y atribución.
- [ ] Selección y revisión exacta de versión/base de componentes reusables.
- **Gate P0:** contratos y licencias claros; todo lo no probado identificado.

## Fase P0.5 — aplicación visual y Model Hub (PRIMER OBJETIVO EJECUTABLE)

[Issue #9](https://github.com/Mairon31/novel_ai/issues/9) · [Issue #10](https://github.com/Mairon31/novel_ai/issues/10)

- [x] Crear frontend React/Vite/TS inicial con Biblioteca (aún no jugable), Model Hub, Descargas, Settings, Wizard y Diagnóstico.
- [x] Crear FastAPI y detección de hardware, disco y settings. **Supervisor de runtimes pendiente.**
- [ ] Wizard reanudable, elegir directorio de modelos, política de descarga y dispositivo; no requiere modelo para abrir UI.
- [x] Implementar búsqueda HF/metadata GGUF/variantes. **Validación live pendiente.**
- [ ] Estimar compatibilidad 12/16 GB con incertidumbre explícita y filtros por función.
- [ ] Descargas durables verificadas con jobs, pausa/reanudar/cancelar, importación local, registros instalados; UI con estados reales.
- [ ] Model assignment `narrator/image/tts` y parámetros por rol/capacidades, presets globales y overrides por historia.
- [ ] Sin descarga/ejecución automática de TTS al abrir configuraciones.
- [ ] Pruebas contract, integración descarga pequeña real, Playwright 390x844 y 1440x900, capturas.
- **Gate P0.5:** abrir app sin modelo, instalar/importar peso, reabrir y seleccionar desde UI con tests y logs reales.

## Fase P1 — narrator engine y persistencia jugable

[Backend #3](https://github.com/Mairon31/novel_ai/issues/3), [LLM #4](https://github.com/Mairon31/novel_ai/issues/4), [Runtimes #11](https://github.com/Mairon31/novel_ai/issues/11)

- [x] Integrar **adaptadores** KoboldCpp/Ollama y conectar motores existentes desde Configuración. Instalador automático del motor pendiente.
- [x] Lanzador KoboldCpp básico con start/stop, health y GPU layers (incl. CPU). **Swap/rollback, descarga runtime y OOM pendiente**.
- [ ] SQLite/Alembic: historias, personajes, canon, eventos, memorias y branching/retry.
- [x] Historia nueva, streaming, intervención libre, Continuar y reabrir después de reinicio. **Reintentar/Editar/ramas pendientes**.
- [x] Lector VN de texto responsive móvil/escritorio sin arte obligatorio. **Sprites/fondo pendiente P2**.
- [ ] 10 turnos con LLM real en GPU; tests de proveedor **simulados** pasan; idempotencia y recuperación probadas con mocks.
- **Gate P1:** desde UI seleccionar LLM, iniciar, generar historia, guardar/reintentar con evidencia real.

## Fase P1.1 — ajustes completos, lectura visual y LLM remoto (IMPLEMENTACIÓN EXPERIMENTAL)

- [x] Configuración persistente de idioma objetivo, traducción del prompt, estilo narrativo y apariencia.
- [x] Adaptador OpenRouter con clave no guardada en SQLite.
- [x] Identidad del protagonista, reader con escena e inspector, carga de imagen manual validada.
- [x] Diagnóstico de runtimes y comprobación de publicaciones stable/beta/nightly.
- [x] Registro de worker LLM Cloudflare, proxy Bearer token, activación de modelo remoto, UI y pruebas simuladas.
- [ ] QA final sin fallos del lector y del panel de workers en desktop/móvil.
- [ ] Colab real: GPU, túnel, latencia, reconexión y transferencia de contexto con tamaño seguro.
- [ ] Cliente LAN autenticado (el backend principal continúa solo loopback).
- [ ] Worker de imágenes y TTS con reserva de GPU y protocolos separados.
- [ ] Instalación de runtimes y actualizador de aplicación firmado/rollback.
- **Gate P1.1:** CI PASS y una inferencia remota real reproducible (aún no alcanzado).

## Fase P2 — ComfyUI, identidad y recursos visuales progresivos

[Issue #6](https://github.com/Mairon31/novel_ai/issues/6)
- [ ] Selección checkpoint/workflow/LoRA/seed/sampler/steps/CFG/resolución desde UI con capacidades reales.
- [ ] ComfyUI job API, validación de workflow, cache/manifest, GPU leases, fallback.
- [ ] Generación por cambio visual material de escena o click; no una imagen por cada turno.
- [ ] Consistencia personaje con identity profile, versiones de vestuario y QA de 10 escenas.
- [ ] Prueba 10 diálogos en misma escena ⇒ 0 imágenes; cambio de escena ⇒ máximo 1 job.
- **Gate P2:** escena real generada, reutilizada y asociada a rama correcta sin bloquear narración.

## Fase P3 — TTS configurable bajo demanda

[Issue #7](https://github.com/Mairon31/novel_ai/issues/7)
- [ ] Seleccionar motor/voz/idioma/CPU/GPU/Auto desde ajustes si el motor lo soporta.
- [ ] Lazy worker, audio por personaje y caché por texto/voz/versiones.
- [ ] OFF por defecto, escuchar manual, autolectura solo opt-in.
- [ ] 50 turnos OFF ⇒ 0 llamadas a TTS; síntesis real y rendimiento registrados.
- **Gate P3:** audio real manual, controles funcionan y errores no afectan texto.

## Fase P4 — UI completa y empaquetado Windows

[Frontend #5](https://github.com/Mairon31/novel_ai/issues/5), [Desktop #12](https://github.com/Mairon31/novel_ai/issues/12)
- [ ] Biblioteca, editor visual de historias/personajes, galería, import/export.
- [ ] Tauri 2 (candidato) con sidecar FastAPI y launcher, instalación sin consola, datos en carpeta personalizable.
- [ ] Verificación de updates, permisos, LAN opt-in segura y fallos de proceso.
- [ ] QA visual mobile/desktop y pruebas reales del instalador/ejecutable.
- **Gate P4:** abrir app de escritorio y terminar un capítulo sin editar archivos a mano.

## Fase P5 — mediciones reales de memoria y portabilidad

[GPU #8](https://github.com/Mairon31/novel_ai/issues/8), [Colab #1](https://github.com/Mairon31/novel_ai/issues/1)
- [ ] Medir equipos NVIDIA 12 GB y RTX 5060 Ti 16 GB con modelos/versión/hashes exactos.
- [ ] Ensayar secuencia texto→imagen→voz, offload, OOM, RAM/VRAM/p95 y persistencia.
- [ ] Colab **opcional** para diagnósticos y modelos de laboratorio; no exigirlo para instalar/usar.
- [ ] CI de app, contract/integration/e2e, restauración, performance, documentación y licencias.
- **Gate P5:** informe reproducible 12/16GB y limitaciones; no marcar soporte sin hardware correspondiente.

## Definition of Done por issue/PR

- Código real, API/estados validados y test plan explícito.
- Comandos y resultados reales; capturas Playwright desktop/móvil para UI.
- Hash de pesos y revisión de proveedor; atribución de fuentes si reusamos código.
- Confirmar estados de botones y errores: no controles visuales vacíos.
- Verificar que no se carguen modelos por navegar Settings/Model Hub.
- En tests GPU indicar equipo, driver, backend, preset y pico VRAM.
- Actualizar README, ADR, `docs/PROGRESO.md`, mapa de issues; no ocultar FAIL.

## Enlaces

[Model Hub](MODEL_HUB.md) · [Onboarding](ONBOARDING_Y_UI.md) · [Referencias Urakatsu/Koharu](REFERENCIAS_URAKATSU_KOHARU.md) · [App desktop](DESKTOP_Y_DESPLIEGUE.md) · [Issues](https://github.com/Mairon31/novel_ai/issues)
