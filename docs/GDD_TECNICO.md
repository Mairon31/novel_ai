# Noble AI — GDD técnico (v0.1)

Fecha: 2026-11-04 · Estado: **propuesta de diseño; no implementado** · Responsable: proyecto Noble AI. **Enmienda APP-FIRST:** [ADR-002](adr/0002-app-first-model-hub.md) hace del wizard y Model Hub el primer hito ejecutable. El motor narrativo jugable viene después; Colab no es obligatorio.

## 1. Visión y diferenciadores

Noble AI es un entorno **local-first** para crear y jugar historias interactivas tipo novela visual con IA. Une **narración libre** (el jugador decide qué decir o hacer) y **mundo persistente** (personajes, relaciones, tiempo, objetos, lugares, eventos). Imágenes anime contextualizadas enriquecen las escenas; **no** hay obligación de dibujar un frame por respuesta. Las voces se producen **solo si se solicitan**. Debe funcionar en pantallas de escritorio y móvil dentro de la red local, con un backend portable Colab/Linux ↔ Windows.

No se pretende reproducir código, personajes, interfaz exacta o recursos protegidos de IsekaiZero. Sus capturas sirven para estudiar patrones de UX: sprite central, escena de fondo, modo lectura, diálogo/narración, nombre y comandos continuar/reintentar.

## 2. Alcance

**Incluir en el primer vertical slice:** crear historia desde premisa, protagonista y 1–3 personajes; introducir texto (hacer/decir/narrar); continuar; reintentar; editar evento con bifurcación; texto en streaming; capítulos/escenas; historial; memoria de hechos; pantalla VN responsiva; assets placeholder **funcionales y etiquetados como temporales** en desarrollo; generar fondo o sprite solo cuando cambie el escenario o cuando el usuario lo pida; botón de audio opt-in; guardado SQLite; proveedor LLM intercambiable.

**Después del slice:** editor visual de personajes y escenarios, canon/lorebook, múltiples historias, variantes de expresión, model selector, import/export, QA visual, cola avanzada de GPU, acceso móvil controlado, versionado de assets, narración avanzada en capítulos.

**Fuera del primer slice:** vídeo generativo en tiempo real; multijugador en línea; marketplace; generación obligatoria de imagen por turno; TTS automático sin consentimiento; clonación de voces ajenas sin derechos.

## 3. Bucle jugable (user journey)

1. Biblioteca → crear historia: título, género, premisa, reglas, idioma, estilo de arte.
2. Crear protagonista: nombre, identidad, motivación, descripción visual y relaciones iniciales.
3. Comenzar escena: narrador crea situación y contexto; se usa ilustración existente o se solicita una bajo demanda. **Una historia debe arrancar incluso sin servidor de imágenes**.
4. Jugador escoge **Hacer**, **Decir** o **Narrar** (texto libre); también puede pulsar **Continuar** sin entrada.
5. LLM redacta bloque de narración + diálogos. Validador propone cambios de estado según evidencia y reglas; backend aplica transacción atómica.
6. UI reproduce texto en streaming. Si el lugar, personaje, apariencia o composición de escena cambia, el planificador consulta caché y decide crear un **trabajo de imagen**; escena anterior permanece visible mientras tanto.
7. Jugador puede **Reintentar**, **Editar**, **Retroceder**, **Guardar**, cambiar el modo de lectura o escuchar el texto; cada acción preserva trazabilidad del canon.
8. En cambios de capítulo, se resume memoria sin borrar acontecimientos originales.

## 4. Componentes de experiencia

**Pantallas:** Inicio/Biblioteca, Creador de mundo, Ficha de personaje, Reproductor VN, Historial/ramas, Galería de assets, Configuración/Proveedores, Diagnóstico de GPU.

**Reproductor VN:** fondo en capas, sprite(s) con nombre y emoción, panel de texto con contraste y scroll, narración diferenciada de diálogo, botones Continuar/Reintentar/Editar/Historial/Guardar/Escuchar, área Hacer/Decir/Narrar, controles accesibles para móvil (objetivo táctil >=44 px), opción ocultar panel para ver arte completo. Animaciones UI discretas; no parpadeos al cambiar assets.

**Texto:** español latinoamericano inicial; voces, idioma y tratamientos deben respetar la configuración del mundo. No forzar español peninsular. Diálogos atribuidos al personaje correcto, narrador claramente separado; el modelo puede narrar escenas y NPC pero **no se apropia de decisiones explícitas del jugador**.

**Personajes:** identificador estable; nombre, pronombres, rol, trasfondo, rasgos, metas, estado físico/mental de ficción, relaciones, secretos y hechos conocidos; ficha visual canon (peinado, ropa, colores, rasgos); expresiones/poses seleccionadas según el estado. No regenerar la identidad del personaje por un simple turno de diálogo.

**Mundo:** mapa lógico de localizaciones, tiempo diegético, inventario, eventos, restricciones, hechos conocidos, consecuencias y objetivos activos. El jugador puede permitir modo libre (sin estadísticas rígidas) o reglas RPG opcionales posteriores.

## 5. Diseño de narración y canon

- Separar **texto presentado** de **cambios estructurados de estado**. La prosa no es fuente única de verdad.
- Política de conocimiento: cada personaje habla solo de hechos que conoce o que pueda inferir.
- No revivir un personaje o restaurar un objeto destruido sin un evento explícito que lo justifique.
- Reintentar no borra el pasado: crea nueva rama y activa una revisión.
- Editar un evento invalida derivados (resúmenes, imágenes y audio posteriores) de la nueva rama, preservando la rama antigua.
- El usuario puede establecer canon manual; tiene prioridad sobre inferencias del LLM salvo reglas de seguridad/aplicación.
- Resúmenes como material derivado y regenerable; historial de eventos como fuente primaria.
- Memoria híbrida: ventana reciente + fichas de mundo + hitos confirmados + resúmenes + recuperación semántica **opcional**, no vector DB obligatoria en P0.
- Si el modelo devuelve JSON inválido o acciones contradictorias: reintento controlado y/o marcar el cambio como **pendiente de validación** sin corromper DB.

## 6. Imágenes y audio (criterios de diseño)

**Imágenes:** generación progresiva. Disparadores: escena nueva, personaje nuevo, cambio material de fondo/ropa, elección explícita de ilustrar. No generar automáticamente cuando se modifica solo una línea de diálogo. Preferir reusar fondo/sprite/expresión; cola con prioridad, cancelación y caché por firma de escena + identidad + estilo. Primera fase: fondo y sprite. CG compleja después. Revisiones visuales con consistencia de personaje, composición, proporciones y texto ausente.

**Audio:** desactivado por defecto y sin precarga de modelos TTS si nadie lo pide. Botón escuchar para línea/fragmento; autolectura solamente por opción explícita. Audio por personaje; caché por voz/modelo/configuración/texto. Si falla, el texto sigue disponible y el capítulo no se bloquea.

## 7. Requisitos no funcionales

- **12 GB VRAM mínimo de diseño; 16 GB recomendado.** No suponer que texto + difusión + TTS caben juntos. LLM siempre atendible con offload CPU si corresponde; cola GPU.
- Offline tras obtener pesos/dependencias; sin llaves de APIs obligatorias para jugar local.
- Contratos únicos para Colab/Linux y Windows.
- Estado persistido y recuperable tras reinicio del navegador/servidor.
- Servicio local por defecto 127.0.0.1; permitir LAN solo con configuración explícita y protección.
- No persistir prompts con secretos; no ejecutar comandos derivados del texto del modelo.
- Observabilidad: ID de turno/trabajo, duración, VRAM/RAM, fallo, caché hit/miss, versiones.
- Accesibilidad de lectura, tamaños ajustables y controles para teclado/táctil.

## 8. Criterios de aceptación del primer vertical slice

1. Crear historia + protagonista + personaje secundario y guardarla; al reiniciar, se recupera íntegra.
2. Generar 10 turnos de texto mediante **un LLM real** (prueba integrada) con eventos vinculados y sin pérdida de estado.
3. Reintentar el turno N crea rama, cambia rama activa y no altera el historial de la anterior.
4. Desconectar ComfyUI no impide escribir ni guardar; imagen queda 'queued/failed' con reintento.
5. Un diálogo sin cambio visual **no encola imagen**; evento de cambio de escenario sí produce a lo sumo un trabajo deduplicado.
6. Sin clic/autolectura TTS: **0 llamadas de síntesis**. Con clic: voz generada o error visible sin perder historia.
7. Capas del VN, lectura, controles de móvil y retorno desde galería comprobados en navegador.
8. Perfiles 12/16 GB: smoke tests reales separados, VRAM pico registrado; no declarar compatibilidad completa sin medición.
9. Exportación/recarga de historia respeta IDs, eventos, ramas, canon y recursos.
10. Fallas de red, timeout y JSON inválido no producen doble turno ni estado inconsistente.

## 9. Métricas (objetivos, no resultados)

- 100 % de eventos aceptados con identificadores, timestamps y rama.
- 0 llamadas TTS sin petición expresa.
- 0 generaciones visuales innecesarias en un test de 10 turnos sin cambio de escena.
- 0 corrupción de DB en reintento/edición concurrente.
- Latencias de primer token, turno total e imagen registradas como distribuciones p50/p95, **sin prometer valores hasta medir hardware**.
- QA de fidelidad: pronombres, inventario, conocimiento por personaje, continuidad del vestuario y del lugar; evaluación con rúbrica y casos reproducibles.

## 10. Entregables técnicos vinculados

Ver [Arquitectura](ARQUITECTURA.md), [Estado y memoria](ESTADO_Y_MEMORIA.md), [Contratos](CONTRATOS_API.md), [QA](QA_Y_ACEPTACION.md), [Roadmap](ROADMAP.md) y [Progreso](PROGRESO.md). Actualizar GDD cuando una decisión implementada difiera del diseño.

## 11. Experiencia de instalación, modelos y personalización (ADR-002)

**Requisito de producto incorporado:** Noble AI debe ser una **aplicación** con ajustes visuales, no una secuencia de celdas Colab ni un asistente que exige predescargar pesos. Pantallas obligatorias: Setup/Wizard, Model Hub, Installed/Downloads, Providers, Model Assignments, Performance/Devices, Story Studio, Novel Viewer y Diagnóstico. El navegador local y el futuro shell escritorio usarán los mismos contratos.

- **Primer arranque sin pesos:** detectar hardware, escoger carpeta, elegir proveedor, buscar/importar/instalar modelos desde UI, guardar y reanudar wizard. Se puede editar/importar historias sin LLM.
- **Personalización narrativa:** elegir proveedor (local/remoto), GGUF/quant, contexto, max tokens, temperatura, top-p, top-k, repetition, razonamiento/visión solo si soportado, offload/CPU/GPU, perfil rápido/equilibrado/calidad/personalizado.
- **Personalización de imágenes:** checkpoint/workflow/LoRA/negative prompt/resolución/seed/steps/CFG/sampler y modo progresivo por escena vs manual. Los modelos comunitarios con etiqueta «uncensored» son opciones de checkpoint y política de contenido del proveedor, **no** un filtro mágico de todo el sistema.
- **Personalización de voces:** motor TTS, voz y dispositivo CPU/GPU/Auto según soporte real, idioma, velocidad/estilo/emoción y caché. Configurar no equivale a cargar; synth **solo por petición**.
- **Perfiles globales y por historia** con precedencia explícita, sin cambiar hechos de ramas anteriores al sustituir un modelo.
- **Estado visible por módulo:** no configurado, descargando, instalado, cargando, listo, incompatible (estimación vs medición), error, sin conexión.
- **Estética:** visual novel anime para jugar; panel Studio y Model Hub distinguibles; accesibilidad y responsive 390x844/1440x900 obligatorios. Inspiración técnica en Urakatsu/Koharu, no copiar su identidad visual ni assets.

**Criterios de aceptación añadidos:** abrir app con 0 modelos; búsqueda HF real; un GGUF pequeño descargado/verificado desde la UI; cambiar modelo sin consola; seleccionar CPU/GPU según compatibilidad; persistir settings; cero cargas TTS no autorizadas; Playwright móvil/desktop y recuperación de descarga fallida.

Ver [Model Hub](MODEL_HUB.md), [Onboarding](ONBOARDING_Y_UI.md), [Arquitectura de escritorio](DESKTOP_Y_DESPLIEGUE.md).
