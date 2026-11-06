# Noble AI — Retroalimentación de Colab y plan de producto centrado en historias

**Origen:** prueba de Noble AI por el propietario en un runtime de Google Colab, 5 de noviembre de 2026.  
**Estado:** **backlog solicitado; NO implementado ni validado por esta documentación**.  
**Alcance:** funcionalidades del producto, experiencia de usuario, arquitectura, estabilidad en hardware y distribución de historias.  
**Seguimiento:** [TODO.md](../TODO.md) y [PROGRESO.md](PROGRESO.md). Se desarrolla en \`master\` y solo se marca [x] después de pruebas y evidencia.

## Principio de producto

**Noble AI debe abrir mostrando historias para jugar y herramientas para crearlas.** El Model Hub, los runtimes, la descarga de pesos y la administración técnica deben ser herramientas claramente separadas, accesibles al necesitarlas, no el centro permanente de la aplicación.

La experiencia objetivo tiene tres recorridos independientes:

1. **Jugador:** Descubrir historias → revisar sinopsis, personajes, etiquetas, portada y requisitos → instalar/cargar mundo → elegir protagonista e inicio → jugar/leer con continuidad.
2. **Creador:** Describir idea → asistente IA propone mundo, trama, secretos, personajes, primeras escenas y plan de imágenes → revisar/editar cada elemento → generar o importar recursos → probar historia → publicar un paquete versionado si lo desea.
3. **Administrador técnico:** Explorar/instalar/asignar modelos de narración, imagen y TTS → configurar motores y presupuesto GPU → probar inferencia → inspeccionar descargas/logs/salud de proveedores.

No presentar una función como terminada porque exista un botón o un mock. Esta visión describe **trabajo pendiente**.

## Secuencia propuesta y criterios de aceptación

### P0 — Hacer el producto realmente utilizable desde la interfaz

**N-01 · Instalador de modelos de imagen integrado**

- Catálogo real de checkpoints/LoRA/ControlNet/VAEs y recursos necesarios según la familia de workflow; verificación de compatibilidad ComfyUI/nodos. Mostrar autor, licencia, formato, tamaño, familia, VRAM estimada *como aproximación* y requisitos.
- Instalar desde la UI con descarga reanudable, progreso y cancelación, hash cuando exista fuente fiable, nombres/rutas controladas, disco libre, aceptación de licencias/condiciones y detección de modelos que requieren autorización. No cargar ni ejecutar código arbitrario desde una ficha de modelo.
- Elegir modelo predeterminado por perfil, probar una imagen en el runtime realmente conectado, conservar generaciones previas ante fallo. Limpiar/desinstalar solamente archivos registrados y no referenciados; no eliminar archivos ajenos.
- **Gate:** descarga interrumpida/reanudada + hash + inventario ComfyUI + render físico 1 imagen real por familia admitida. Nunca declarar Flux/Illustrious soportado solo por aparecer en catálogo.

**N-02 · Instalador de TTS y biblioteca de voces**

- Catálogo de voces compatibles con Piper con idioma/acento, tamaño, muestras de voz de procedencia y calidad documentada; descarga de ambos archivos \`.onnx\` y \`.onnx.json\`, validación de compatibilidad, par de archivos y hash disponible.
- Progreso/pausa/reintento desde UI, asignación de voz general y por NPC, velocidades/pausas y prueba controlada «Escuchar muestra». Preferir voces español latinoamericano naturales; no inferir calidad solo por etiqueta \`es-MX\`.
- Retener la opción bajo demanda, no activar reproducción automática a escondidas; soportar colas y cancelación, y preservar preferencias tras reinicio.
- **Gate:** instalación desde UI → voz visible → síntesis WAV real → reproducir/pausar/detener en navegador → persistencia, multivoz, cancelación y desconexión.

**N-03 · Centro de configuración de motores**

- Separar navegación de **Narrador**, **Imágenes**, **Voces**, **Rendimiento/GPU**, **Proveedor**, **Descargas** y **Diagnóstico** con encabezados, estado claro, ayuda contextual y presets razonables para T4/8/12/16/24 GB; evitar lista monolítica de campos.
- Imagen: checkpoint/arquitectura, resolución múltiplo correcto, pasos, CFG, sampler, scheduler, seed, negativo, LoRAs y sus pesos, referencia/IPAdapter, matting, caché y rutas de output. Solo mostrar campos realmente implementados y compatibles con el modelo elegido.
- Voz: modelo/idioma/acento, asignación por NPC, velocidad, silencios, volumen si el motor lo soporta, dispositivo/carga, preview y política de autolectura independiente.
- Guardar/cancelar/revertir, validación de rangos antes de activar, cambios efectivos sobre los workflows y feedback de conexión/diagnóstico. Los ajustes futuros se añaden por capacidad del proveedor; no romper preferencias SQLite anteriores.
- **Gate:** cambios guardados realmente afectan el siguiente render y el siguiente WAV; API/Playwright desktop-móvil, validación de límites y migraciones.

**N-04 · Orquestador de narración + imagen + voz**

- Diseñar estados del trabajo y dependencias: narración/escena/fondo/sprite/event CG/TTS, con una cola visible, cancelación idempotente, reintentos acotados, salida al cambiar de historia y registro de fallos sin duplicar medios.
- Arbitraje real de GPU/memoria y CPU: T4 de Colab como mínimo; mecanismos verificables para pausar/liberar/descargar pesos entre Ollama/ComfyUI/Piper, evitar ejecutar tres modelos simultáneos de manera irreflexiva, gestionar OOM y hacer fallback **explícito**.
- Presets de recursos: texto prioritario / equilibrado / visual / solo CPU; priorizar que el usuario pueda seguir leyendo aunque falle una imagen o un TTS.
- **Gate:** 20 turnos con cambios de escena y voz bajo presupuesto medido, cancelación en cada etapa, resultados recuperables tras reinicio, 0 publicaciones parciales y logs de pico VRAM reales. No simular estas cifras.

**N-05 · Primer arranque y prueba de Colab real**

- Verificar el notebook en entorno T4: instalación de modelos desde app, endpoint, proxy, narrador, checkpoint, TTS, persistencia Drive, configuración y futuras migraciones. Probar un escenario sin GPU.
- No ocultar errores del instalador con banners «listo» cuando una dependencia sea obligatoria. Mostrar al usuario estado de narrador / imágenes / TTS por separado.
- **Gate:** reporte de instalación, logs, captura visual desktop/móvil, una imagen y una voz reales, primera historia jugable y reabrirla sin pérdida.

### P1 — Dar prioridad a historias jugables y Creator Studio

**N-06 · Rediseño de Biblioteca/Detalle/Lector y navegación principal**

- Página inicial de **historias**, no panel técnico de modelos. Biblioteca personal, Continuar, Descubrir, Creador y Ajustes como destinos diferenciados. Portadas, sinopsis, personajes, etiquetas, duración/estado e historia de lectura.
- Detalle inmersivo: portada, descripción, personajes, fondos, opciones de inicio, requisitos de modelos, idioma, autor/versión y vista previa. El lector conserva decisiones y progreso; móvil y escritorio.
- Estados vacíos útiles sin forzar al jugador a rellenar 10 campos técnicos. No mezclar jerarquía «Mis historias» con listados comprimidos debajo de secciones ajenas.
- **Gate:** capturas comparativas, pruebas de rutas directas/reload/back, Playwright móvil, crear/abrir/continuar/editar sin perder posición.

**N-07 · Creator Studio asistido por IA (story/world builder)**

- Solicitar concepto/tono/género/idioma, personajes y restricciones del creador. El asistente produce un **borrador estructurado y editable**: título, pitch, sinopsis pública, premisa privada, canon/verdades ocultas, reglas del mundo, arcos, escenarios iniciales, decisiones clave, elenco con personalidad/diálogo, Lorebooks y estado inicial.
- Validar esquema, referencias y longitudes antes de aceptar; no guardar directamente una respuesta LLM sin revisión ni sobrescribir creaciones existentes. Distinguir claramente lo que ve el jugador de información privada del narrador.
- Opción explícita para generar plan visual de portada, fondos y sprites por personaje, con prioridades para GPU, preview, reintento, selección editorial, coste/VRAM visible y referencias de identidad. No prometas todas las imágenes generadas si el usuario no dispone de modelo compatible.
- **Gate:** de una idea de una frase a historia completa **jugable**, editar cualquiera de sus entidades, generar recursos a solicitud, exportar/importar/fork sin perder nada, pruebas de esquema y render físico.

**N-08 · Historia de demostración completa y reproducible**

- Reemplazar el ejemplo superficial de «La estación de la última luna» por un paquete curado: trama pública y privada coherentes, 3–5 NPC diferenciados, fichas visuales, lugares, Lorebooks, estados, 3 comienzos alternativos y primeros eventos con decisiones significativas.
- Recursos visuales de muestra incluidos con licencia clara o generados en un paso editorial opcional; sin enlaces falsos ni espacios vacíos simulando contenido.
- Crear solo en biblioteca vacía (o mediante «Instalar historia de ejemplo»), nunca duplicar ni reescribir un ejemplo existente al actualizar. Mantener migración/idempotencia.
- **Gate:** jugar 10–20 turnos, probar diferentes decisiones y reapertura, revisar continuidad del canon y resultados visuales, verificar backup.

**N-09 · Hub de historias prearmadas (catálogo local inicial)**

- Catálogo de paquetes instalables con portada, creador, idioma, licencia, clasificación/etiquetas, versión, requisitos de recursos y sinopsis; historias con elenco y apertura real, no solo títulos y premisas.
- Instalar/desinstalar/importar/reparar como **copia independiente**, sin corromper progreso ni sobrescribir modificaciones; gestionar versiones y compatibilidad de esquema.
- Diferenciar **Descubrir historias** de «Mis historias»: la descarga de una historia no inicia automáticamente un proveedor remoto ni publica datos personales.
- **Gate:** tres paquetes originales completos que puedan instalarse, jugarse, exportarse y actualizarse sin modificar originales ni romper ramas.

**N-10 · Hub de comunidad y publicación por creadores (fase de distribución)**

- Tras cerrar el formato de paquetes locales: registro público o fuente configurable de historias de autores, fichas, búsqueda/filtros, versiones, dependencias, licencias y firmas/verificación; gestionar versiones incompatibles.
- Flujo de publicación con consentimiento, acceso y permisos, autoría/atribución, reportes/moderación, contenido no confiable, descarga segura, actualizaciones y restricciones de redistribución de imágenes/pesos. No montar subida comunitaria ni autenticación ficticias sin backend.
- Separar «instalación de paquete del creador» de «descarga de pesos de un modelo»; proteger rutas, ZIPs, tamaño/expansión, enlaces externos y recursos.
- **Gate:** integración real con registro comunitario y permisos, publicación/instalación/versiones reales, revisión moderación y pruebas adversariales de archivos.

**N-11 · Model Hub como aplicación propia al estilo funcional de Urakatsu**

- Sacarlo del panel técnico monolítico de \`App.tsx\`: exploración en una vista dedicada con navegación y detalle de pantalla completa o panel independiente, filtros, ordenamientos, categoría **Narrador / Imágenes / TTS**, tarjetas con información útil e historial de descargas.
- Ficha de modelo: README/detalles/variantes/archivos/autor/licencia/formatos, motor al que pertenece, cuantización si aplica, requisitos reales y recomendación de variante según GPU y familia; instalación/aplicación y pruebas.
- Tomar a Urakatsu como referencia de patrón de navegación/gestión. Antes de reutilizar código, auditar licencia de archivos y conservar atribución y avisos; no depender de sus servicios.
- **Gate:** experiencia end-to-end «buscar → comparar → ficha → instalar → elegir → probar» para las tres familias admitidas; responsive y navegación por URL. Evitar mostrar «instalable» cuando solo se explora.

**N-12 · División del frontend por dominios y UX coherente**

- Separar \`App.tsx\` y flujos enormes en rutas/componentes/hook de Biblioteca, Hub de historias, Creator Studio, Lector, Model Hub y Ajustes; reutilizar cards, detalle, filtros y estados de petición por dominio.
- Definir sistema de diseño (tipografía, espacios, badges reales, vacío/carga/error, móvil/tablet/escritorio, accesibilidad de formularios y teclado). Diseñar historias como producto principal.
- **Gate:** sin regresiones de enlaces/estado de lector/Story Creator; pruebas E2E y capturas comparativas. No atribuir un rediseño a un simple cambio de nombres o colores.

### P2 — Mejoras de inmersión y comunidad a escala

**N-13 · Plan visual narrativo automatizado con aprobación**

- Permitir que la IA extraiga escenarios, presencia y expresiones de escenas creadas, proponga fondos/sprites/CG y procese un lote explícitamente aprobado con caché y reutilización. Mantener identidad por referencia y variantes de escena versionadas.
- No generar una ilustración completa para cada línea: reutilizar fondos y sprites de escenas anteriores. Los trabajos fallidos no bloquean texto.
- **Gate:** historia creada desde idea con recursos revisados, 10 turnos misma escena sin regenerar fondo, cambios correctos al cambiar de lugar y coste/memoria medidos.

**N-14 · Comunidad madura, perfiles de Creator y ecosistema**

- Perfiles de creador, fichas/versiones públicas, favoritos/colecciones, ratings/reportes con moderación, descubrimiento, import/export y procedimientos de retirada. Diseñar privacidad y filtrado antes de habilitar publicación.
- **Gate:** flujos auténticos de publicación/autorización; no incorporar botones vacíos.

**N-15 · Observabilidad y evaluación del orquestador**

- Dashboard de colas, estados, RAM/VRAM, latencia TTFT/TPS/imágenes/TTS, errores por modelo y rendimiento de cada historia. Historial local, exportación de diagnóstico sin filtraciones de prompts privados.
- **Gate:** evidencia de sesiones reales Colab y Windows, escenarios de red interrumpida, CPU, GPU, versiones y recovery.

## Reglas de ejecución y corte

- **No intentar cerrar todo en un solo commit/sesión.** Trabajar en entregables funcionales verticales; primero contratos + tests, luego UX y validación real.
- No marcar funciones avanzadas como implementadas solo porque la auditoría, maqueta, notebook o un endpoint las describa.
- Cada tarea completada debe tener commit en \`master\`, pruebas de error y éxito, capturas de escritorio y móvil cuando sea UI, y registros de GPU reales cuando corresponda.
- El Hub comunitario **no se confunde** con un catálogo integrado de ejemplos: la red, publicación y moderación son entregables posteriores.
- Si la instancia Colab compartida no es accesible por el entorno, analizar el repositorio y usar evidencia de logs/capturas; no afirmar que se navegó o probó en vivo sin hacerlo.
- Mantener retrocompatibilidad con SQLite, historias antiguas, .noble.zip, snapshots, bifurcaciones y notebooks; cualquier migración debe probarse con datos previos.
