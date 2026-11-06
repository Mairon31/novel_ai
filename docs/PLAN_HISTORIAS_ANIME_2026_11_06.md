# Noble AI — Experiencia anime, orquestación y creación completa (backlog 2026-11-06)

**Estado: especificación de trabajo pendiente; no constituye código implementado.** Este documento convierte la retroalimentación del uso real y las dos capturas del editor enviadas el 6 de noviembre de 2026 en requisitos verificables. Identificadores maestros: `N-16` a `N-24` en [TODO.md](../TODO.md). Referencias cruzadas: [TTS.md](TTS.md), [ROADMAP.md](ROADMAP.md), [QA_Y_ACEPTACION.md](QA_Y_ACEPTACION.md).

## 1. Norte del producto: novela y roleplay de fantasía anime

Noble AI debe priorizar **historias jugables de fantasía con estética anime/visual novel**, no un chat genérico ni un simulador de vida realista. La experiencia por defecto es inmersiva y narrativa: mundo, personajes, relaciones, conflictos, capítulos, escenas, ilustraciones y sonido coherentes.

- Dirección editorial predeterminada: anime estilizado, fantasía, isekai, aventura, misterio sobrenatural y otros subgéneros de ficción elegidos por el autor. **No** seleccionar fotorrealismo ni escenarios cotidianos realistas por defecto.
- Toda historia/preset debe declarar `genre`, `tone`, `art_style`, `setting`, reglas de mundo, objetivos narrativos y nivel de libertad. Evitar presentarlos como campos de texto inconexos; integrarlos en un contrato de historia.
- El Story Hub debe mejorar los mundos existentes con arcos, episodios, NPC con motivaciones, conflictos y decisiones interesantes; no sustituir mundos existentes silenciosamente ni sobrescribir las ediciones del jugador.
- Composición artística coherente: portada anime, fondos por localización, sprites de NPC, expresiones/poses, ADN visual, iluminación y paleta de cada historia. Usar prompts especializados en ilustración anime y consistencia; fotorrealismo solo cuando el autor lo selecciona expresamente.
- Diferenciar claramente arte faltante, arte en cola, arte fallido, arte verificado y arte aprobado. Nunca fingir que existe una ilustración con un marcador genérico.

## 2. N-18: Orquestador inteligente de historia, no complaciente

Crear una capa de **director narrativo** entre la entrada del jugador, el estado del mundo y el modelo LLM. No basta con un prompt de sistema genérico ni con preguntar siempre al mismo modelo qué pasa.

**Contrato mínimo por turno:** historia/arco/acto/escena actual, objetivos dramáticos, personajes presentes, motivaciones y conocimientos privados, reglas físicas y mágicas, eventos previos, hechos canónicos y restricciones narrativas, acción propuesta del usuario, consecuencias plausibles, decisiones aún abiertas y ritmo deseado.

1. **Interpretación de la entrada:** distinguir diálogo, acción, pensamiento, dirección narrativa y texto fuera de personaje. Detectar intentos sin relación con la historia o contradicciones de mundo antes de alterar canon, inventario o posiciones de NPC.
2. **Coherencia y límites del escenario:** establecer reglas de mundo y límites de poder; un jugador no puede declarar como hecho que vence a todos, obtiene cualquier poder, teletransporta NPC o reescribe el canon sin una causa válida. La IA puede describir fracaso, resistencia, costes, reacción de otros personajes o proponer una acción plausible.
3. **No dar siempre la razón:** los NPC deben tener personalidad, agenda y conocimiento independiente; pueden disentir, malinterpretar, negarse, mentir, negociar o antagonizar cuando sea consistente con la trama. Evitar halagos, cumplimiento automático y resultados garantizados.
4. **Libertad narrativa graduada:** modos `guiado` (por defecto), `flexible` y `estricto` configurables por historia. En modo guiado el usuario decide acciones **dentro del marco del mundo**; el director mantiene objetivos, consecuencias y continuidad. La historia puede incluir bifurcaciones planeadas, pero no saltos absurdos a otra trama.
5. **Entradas fuera de contexto:** no convertir mensajes meta, bromas externas o órdenes incompatibles en hechos históricos. Ofrecer reformulación en personaje o respuesta narrativa contextual breve; preservar la intención válida siempre que se pueda.
6. **Planificación y seguimiento:** act/book/scene plan, conflictos, pistas y objetivos, flags de progresión, timers narrativos, consecuencias duraderas y reglas de fin de arco; detectar estancamiento, repetición de escenas y objetivos olvidados.
7. **Ritmo y voz:** estilos narrativos y longitud variable según escena, diálogo natural de personajes, no explicar constantemente las reglas al jugador, sin repetir fórmulas de chat. Orquestar qué modelo/herramienta genera texto, imágenes y voz, con dependencias, reintentos, métricas y fallbacks explícitos.
8. **Observabilidad:** inspector opcional y no intrusivo para autor: estado de arco, regla bloqueante y causa, contexto inyectado, decisiones del director, errores de proveedor, costes y medición real si disponible; **no** revelar spoilers privados al jugador por accidente.

**Aceptación:** batería de sesiones 10–20 turnos con protagonistas que intentan acciones absurdas, contradicciones de lore y solicitudes fuera de personaje; las acciones no canónicas no deben reescribir el mundo. NPC con motivaciones opuestas deben poder rechazar al usuario. Comprobar progresión de arco y que el protagonista conserve decisiones legítimas.

## 3. N-19: Rediseño del editor y acciones roleplay

**Evidencia visual:** las dos capturas del 6/11 muestran una fila superior separada con herramienta, **CONTINUAR / REINTENTAR / BORRAR**, un campo «Habla como Kai, describe lo que haces o lo que sucede a continuación», pequeños iconos redondos debajo y un indicador de destellos a la derecha. La distribución es fragmentada, los iconos no explican su función y se mezclan acciones de turno con configuración.

**Propuesta de flujo (referencia funcional: Isekai Zero):**
- Caja de intervención protagonista en primer plano, con **barra de acciones de roleplay en la parte superior del propio editor**: `Hablar`, `Actuar`, `Pensar`, `Observar/Inspeccionar`, `Interactuar`, `Narrar/Dirigir` (esta última solo si las reglas de la historia la permiten); affordances claras y tooltips, no iconos opacos.
- Seleccionar una acción ajusta el modo de interpretación/placeholder y payload estructurado enviado al narrador. No debe insertar símbolos crípticos sin explicación ni alterar el mensaje del usuario inesperadamente.
- `Continuar` y `Enviar` como acciones primarias inequívocas; `Reintentar` sobre el turno correspondiente, con confirmación/recuperación segura si reemplaza resultado; `Borrar` separado del envío y protegido por confirmación/deshacer según alcance.
- Botón **Ajustes de historia** accesible en el lector: tono, dificultad, libertad narrativa, longitud, idioma, ritmo, reglas, generación de imágenes, voces, estilo visual, controles y lectura. Diferenciar ajustes globales, por historia y por escena.
- Entrada de texto con historial/borrador recuperable, deshabilitación contextual durante generación, indicadores de estado de narrador/imagen/TTS y acciones de reintento; evitar doble envío, mantener foco y scroll.
- Integrar el indicador de cuota/coste/destellos de forma comprensible, sin cubrir el cuadro de edición. Diseño responsivo desktop/móvil, targets táctiles mínimos de 44 px, etiquetas accesibles y atajos descubiertos.
- Ensayo visual de estados: escritorio y móvil, teclado desplegado, carga, error, sin conexión, sin imagen, modo guiado, lector VN/Libro/Chat, tipografía y contraste legible.

## 4. N-16 y N-17: TTS modular y voces por personaje

**Motores candidatos que deben investigarse e integrarse desde Noble AI:** **Pocket TTS, OmniVoice, Kokoro TTS y Qwen3 TTS**, manteniendo Piper. No considerar que un nombre implica soporte listo: validar identidad del proyecto, licencia, pesos/formato, dependencias, idioma ES-LA, dispositivo CPU/GPU, consumo de VRAM, funcionamiento local/Colab y API real antes de implementar cada adaptador.

**Contrato de adaptadores:** descubrir/modelar/instalar, consultar capacidades, listar voces, probar voz, configurar, sintetizar, cancelar, liberar memoria, telemetría, almacenamiento y gestión de errores. Parámetros expuestos **según motor**: voz, idioma, velocidad, expresividad, volumen, temperatura/referencia/estilo solo donde existan; no mostrar deslizadores que el motor ignore.

- Asignar voz **independiente por personaje** y **voz propia al narrador**, con prioridad `personaje → preset de historia → predeterminado global → fallback explícito`. Guardar mapeo en historia, incluir clonación/exportación, no perderlo al cambiar de rama.
- Distinguir acotaciones/narración de diálogos con atribución de hablante verificable; si el hablante no es inequívoco, no atribuirle una voz aleatoria. Soportar diálogos de varios NPC, segmentos y mezcla/pausas ordenadas.
- Muestras de voz individuales y prueba de reparto completo, caché versionada por modelo, voz, parámetros y texto, invalidación al editar diálogo/voz, normalización de niveles y cola que no bloquee la historia.
- Panel único de selección/modelos/instalación/progreso/previsualización/configuración/uso de recursos **dentro de Noble AI**, sin exigir al usuario operar otra interfaz para ajustes habituales. Los procesos runtime pueden ejecutarse aparte como infraestructura interna, pero la UX debe gestionarlos desde Noble.
- No generar audio solo por abrir una historia; respetar la preferencia bajo demanda y habilitar reproducción automática únicamente mediante ajuste explícito por historia.
- Pruebas específicas de continuidad de hablante, cambio de voz, fallos de motor, latencia, 10 frases de español latinoamericano y uso simultáneo con imagen/LLM.

## 5. N-21: Ajustes de imagen/TTS de extremo a extremo, todo en uno

- **Imágenes:** instalación y catálogo de checkpoints/LoRA/VAE/ControlNet/IPAdapter/matting compatibles con motores permitidos; parámetros de sampler, scheduler, CFG, steps, resolución/relación de aspecto, seed, denoise, prompts positivo/negativo, presets anime, identidad del NPC, referencias, consistencia por escena, batch, GPU/VRAM y selección de calidad.
- **Voces:** proveedor/modelo/voz, idioma/pronunciación, diccionario de nombres, velocidad, expresividad y controles admitidos por ese motor; voz narrador/personajes, preview, caché, almacenamiento, política de ejecución y salida.
- **UX integrada:** Model Hub con detalle de archivos, variantes, tamaños, compatibilidad con GPU y estado de instalación; panel de ajustes separados por función, perfiles globales y overrides por historia/escena, importar/exportar presets, guardar/restaurar sin romper ejecuciones en curso.
- **Gestión de recursos:** cola y dependencias visibles, barras de progreso, estimaciones **separadas** de mediciones reales, cancelar/reintentar/reanudar, comprobación de disco/VRAM y fallos accionables. Un ajuste que el backend no soporte debe quedar deshabilitado y explicar el motivo.
- Los runtimes externos (por ejemplo, ComfyUI) pueden permanecer como backend técnico, pero el usuario no debe salir de Noble AI para seleccionar modelo, configurar generación normal o consultar progreso.

## 6. N-22: Preparación visual obligatoria al abrir una historia ilustrada

Al entrar en una historia que no tiene portada, fondo inicial ni sprites/personajes preparados, **no mostrar el lector como listo ni ejecutar un primer turno LLM inmediatamente**. Primero abrir un flujo guiado de preparación de recursos.

Máquina de estados propuesta: `draft → validating → assets_planned → generating_assets → reviewing_assets → ready_to_play`, con `retry_required` y `text_only_by_choice` como salidas explícitas. Persistir estado y trabajos por ID de historia, con idempotencia tras recarga/reinicio y asociación inequívoca de cada imagen a historia/escena/NPC.

1. Detectar faltantes reales (portada, fondo de primera escena, imágenes del reparto que debe aparecer, expresiones mínimas, modelos disponibles), no regenerar assets correctos por cada apertura.
2. Mostrar «Preparando tu historia» con progreso por etapa y vista previa: descargando/configurando modelo, portada, fondo, personajes, revisión final; tiempo estimado solo si hay métricas, no porcentajes ficticios.
3. Planificar prompts y recursos conforme al estilo anime/fantasía y ADN visual de la historia; aprovechar imágenes/poses ya generadas y caché según identidad y versión.
4. **Bloquear el cuadro de envío del jugador y la ejecución inicial del LLM** hasta alcanzar `ready_to_play` en modo ilustrado. Mostrar por qué está bloqueado y permitir revisar recursos cuando estén listos.
5. Gestionar faltantes, poco almacenamiento, OOM, modelo de imagen no instalado, cancelación/reintento, corte de Colab y carga parcial; nunca quedar permanentemente en spinner. Ofrecer importar imágenes o cambiar **expresamente** a modo solo texto, sin degradación silenciosa.
6. Validar que el fondo inicial corresponde a la localización/escena y que el personaje aparece con sprite y expresión adecuados; el usuario puede aprobar/ajustar antes de empezar si la política de la historia lo requiere.
7. No sobrescribir arte existente, historias previas ni preferencias del jugador. Opciones de regeneración selectiva, revisión e historial de versiones.

**Aceptación:** abrir una historia vacía de arte muestra preparación y bloquea entrada/LLM hasta completarla; tras recarga se recupera el trabajo; un fallo de imagen permite reintentar o elegir texto explícitamente. Una historia con assets válidos abre sin trabajo redundante.

## 7. N-23: Wizard de creación y render automático al crear

El Creator Studio necesita un **formulario/flujo por etapas con validación semántica y de campos obligatorios**, no una colección de parámetros que pueda quedar vacía y generar una historia rota.

**Campos mínimos verificables para una historia jugable:** título, género/subgénero, estética anime y tono, premisa, reglas básicas/ambientación, protagonista y su papel, primer objetivo/conflicto, punto de inicio y una apertura jugable. Exigir personajes, lore o referencias visuales cuando lo demande la plantilla elegida; distinguir campos necesarios de opcionales. El asistente puede proponer valores, pero el autor debe verlos y confirmarlos.

**Validaciones:** campos no vacíos, coherencia entre premisa y apertura, roles e IDs válidos, nombre no duplicado según alcance, presupuesto de contexto, ausencia de personajes citados sin ficha cuando son obligatorios, recursos de imagen/TTS disponibles para el preset elegido y límites de hardware. Errores junto al campo y resumen antes de confirmar. Guardar borrador recuperable y no modificar una historia instalada hasta confirmar.

**Al pulsar Crear (modo historia ilustrada):** confirmar el plan de recursos y crear de forma transaccional la historia/plan/cola; **arrancar automáticamente la generación de portada, fondo inicial y sprites/expresiones necesarias**, con progreso y revisión. No declarar `ready_to_play` hasta que los recursos exigidos estén completos. La narración y respuesta del jugador comienzan después. En modo solo texto, permitirlo únicamente mediante selección consciente del autor.

**Manejo de errores:** rollback seguro si falla la creación del registro, reintentar assets individuales sin duplicar historia, colas reanudables y sin borrar imágenes previas, librería que distinga «Borrador», «Preparando imágenes», «Requiere atención» y «Lista para jugar».

**Aceptación:** un formulario incompleto no permite Crear y explica cada campo; uno válido en modo ilustrado inicia trabajos reales de generación, muestra progreso y aparece en biblioteca con su estado; no hay primer turno LLM ni input activo hasta terminar la preparación visual.

## 8. Orden propuesto, dependencias y pruebas

| Orden | Paquete de trabajo | Depende de | Evidencia mínima |
|---|---|---|---|
| 1 · P1 | N-23 Contrato y validación de historias | N-07 | API + UI rechazan datos inválidos sin persistencia parcial |
| 2 · P1 | N-21 modelos y ajustes internos imagen | N-01/N-03 | Configuración afecta generación, compatibilidad y errores |
| 3 · P1 | N-22 arranque/creación visual y estado de assets | N-21/N-13 | Prueba end-to-end vacío → imágenes → jugable, reinicios y fallos |
| 4 · P1 | N-18 orquestador de coherencia y progresión | Canon/Lorebook/memoria | 10–20 turnos con pruebas de incoherencia/yes-man |
| 5 · P1 | N-19 editor roleplay + ajustes de historia | N-18/lector | QA de UX y accesibilidad desktop/móvil |
| 6 · P1 | N-20 dirección anime y mejoras de Story Hub | N-18/N-22 | Galería consistente, mundo jugable, prompts y assets aprobados |
| 7 · P2 | N-16 motores TTS modulares | N-02/N-03 | Contratos y muestras reales por runtime |
| 8 · P2 | N-17 voces por personaje/narrador | N-16 | Diálogo multi-NPC con identidad y audio coherentes |
| Transversal | N-24 QA de integración | Todos | CI, pruebas físicas Colab/Windows y screenshots comparativos |

**No marcar como completadas las subtareas por redactar este documento.** Cada entrega exige código, pruebas de unidad/integración, evidencia UI escritorio/móvil y validación física cuando corresponda. Los módulos de TTS/imagen ya existentes son piezas de infraestructura, **no** satisfacen todavía estos requisitos de experiencia completa.

## 9. N-25: Separación de páginas de Configuración (2026-11-06)

**Retroalimentación adicional:** el usuario rechaza que elementos de naturaleza distinta compartan el mismo apartado de ajustes. Actualmente `WorkspaceSettings.tsx` contiene la pestaña **«Imágenes y voz»** (componente `CreativeSettings.tsx`, que reúne controles ComfyUI y Piper) y **«Sobre y actualizaciones»** (información del producto y búsqueda de releases). **Las cuatro áreas deben ser independientes**, no solo dos acordeones dentro del mismo panel.

**Estructura objetivo de navegación en Configuración:**
- **Imágenes:** modelo/checkpoint, instalación, LoRA y referencias, estilo anime, prompts, resolución, sampler/scheduler/CFG/semilla, integración ComfyUI, colas visuales y recursos GPU pertinentes. Su propia pantalla, ajustes y feedback. El control de recursos GPU compartido puede ubicarse en un apartado propio de Recursos/Runtimes, enlazado desde ambos sin duplicar inconsistencias.
- **Voz / TTS:** motores (Piper, y futuros Pocket TTS/OmniVoice/Kokoro/Qwen3 TTS), instalación y modelos, voces, selección para narrador/NPC, idioma/pronunciación, muestras, síntesis y colas de voz. No mezclar controles de imagen en esta pantalla.
- **Acerca de Noble AI:** versión instalada, identificador de compilación, información técnica, documentación, créditos, licencias y enlaces oficiales; solo información del producto.
- **Actualizaciones:** canal de versión, comprobación manual/automática, versión disponible, notas de cambios, estado/progreso, errores, instalación o instrucciones según plataforma. No mezclar contenido estático de «Acerca de».

**Contrato UX:** cuatro entradas navegables y rotuladas por separado, sin agrupaciones tipo «Imágenes y voz», «Imágenes y TTS» o «Sobre y actualizaciones»; accesibles desde escritorio y móvil con estado de pestaña activo, navegación por teclado, enlaces directos/recarga y rutas estables. Los componentes nuevos pueden compartir hooks o API, **pero no compartir un panel monolítico**. Conservar las preferencias y datos SQLite existentes, sin reiniciar modelos o descargas al cambiar pestañas. Las notificaciones de actualización pueden aparecer globalmente, pero su configuración debe residir en Actualizaciones.

**Aceptación QA:** capturas desktop/móvil muestran los cuatro destinos separados; entrar en **Imágenes** no presenta controles de voz y viceversa; entrar en **Acerca de** no presenta botones de actualización y viceversa; cada pantalla conserva cambios tras recarga y deep link, y los controles actuales de ComfyUI, Piper, la voz preferida y los avisos de release no se pierden durante la migración. Verificar navegación con Playwright, accesibilidad, APIs actuales y ausencia de duplicados.

**Estado:** implementación de cuatro pantallas separadas publicada en `master` y eliminación del antiguo componente combinado. Rutas `#/configuracion/images`, `/voice`, `/about` y `/updates` bajo el mismo workspace, pruebas Playwright escritorio/móvil y migración de pruebas previas. **N-25 implementado y CI validado** en [run #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131): 381 Python, 80 Playwright desktop/móvil y Vite PASS; screenshots automatizados de los cuatro paneles. Evaluación visual humana y nuevas opciones avanzadas siguen en N-21.

