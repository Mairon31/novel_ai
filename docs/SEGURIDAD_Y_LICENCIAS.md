# Seguridad, privacidad, licencias y distribución

Estado: controles de diseño para un sistema local-first.

## Seguridad de runtime

- En local vincular API/LLM/ComfyUI a `127.0.0.1` por defecto; no abrir host `0.0.0.0` ni túneles automáticamente.
- Al habilitar LAN para móvil: token/credenciales, origen explícito, rate limit y no confiar en redes Wi-Fi abiertas.
- En Colab: evitar exponer las interfaces de los motores mediante túneles públicos; ejecutar pruebas en notebook.
- Las rutas para assets se generan desde IDs/manifest, nunca desde texto enviado por LLM. Prevenir path traversal, SSRF, URLs remotas arbitrarias y cargas gigantes.
- Nunca ejecutar shell/code del LLM como parte de la historia; contenido del jugador es dato no instrucción de sistema.
- Validación de schema y longitud de entradas; limitar contexto/máximo de tokens, GPU job size, bytes de imágenes/audio y cuotas por historia.
- SQLite no accesible desde frontend; backups y export sanitizados; no registrar prompts completos con secretos.
- TTS: no sintetizar voz sin intención explícita, y no clonar voces ajenas sin autorización/consentimiento.
- Dependencias de terceros: registrar versión/hash, revisar supply chain y custom nodes ComfyUI. Evitar instalar paquetes automáticamente a partir del texto de una historia.
- Fallos de proveedor no dan lugar a reintentos infinitos ni pérdida de eventos.

## Licencias — código vs modelos vs assets

**No asumir que 'GitHub público' significa libre para copiar.**

| Componente | Licencia de código observada | Decisión preliminar |
|---|---|---|
| Urakatsu | MIT (LICENSE, metadata GitHub NOASSERTION) | Catálogo/panel candidato a reuso con NOTICE y atribución a Koharu |
| Koharu | MIT OR Apache-2.0 | Configuración/Tauri candidato a reuso con licencias por archivos |
| Open Dungeon | MIT | Reuso posible con atribución/copyright |
| Gamentic | MIT | Reuso condicionado a revisión de archivos/versiones |
| Talemate | AGPL-3.0 | Candidato standalone/referencia; verificar obligaciones antes de copiar |
| KoboldCpp | AGPL-3.0 | Ejecutar servicio externo; estudiar implicaciones si se distribuye/hostea |
| ComfyUI | GPL-3.0 | Integrar vía API como proceso, revisar distribución/paquetes |
| SillyTavern | AGPL-3.0 | Referencia/external, no copiar sin revisión |
| RisuAI | GPL-3.0 | Referencia/external, no copiar sin revisión |
| TaleWeaver | Restricción no comercial | **No incorporarlo al producto distribuible** sin permiso explícito |
| Chatterbox | MIT | Evaluar licencia del modelo/voz y atribución |
| Qwen3-TTS | Apache-2.0 | Evaluar código/modelos/atribuciones |

Licencias verificadas a fecha de investigación; consultar `LICENSE` de cada **versión exacta**, incluyendo submódulos y custom nodes. Modelos de Hugging Face, LoRAs, embeddings, voces y fondos pueden tener licencias distintas. Documentar modelo + versión + checksum + fuente + atribuciones y permisos de redistribución.

**Noble AI no define todavía su licencia propia.** No añadir automáticamente MIT/GPL hasta decidir si se incorporará código copyleft a un conjunto distribuido, el objetivo comercial/no comercial, y obligaciones correspondientes.

## Privacidad

Modo offline por defecto una vez descargados modelos. Toda historia se guarda en SQLite en equipo del usuario salvo exportación explícita. Cada proveedor declara si es local o remoto, con indicador claro antes de enviar contenido a una API externa.

## Uso de recursos visuales

Se permite reutilizar y adaptar componentes de interfaz, estilos y código de repositorios open source cuando su licencia lo autorice (por ejemplo MIT o Apache-2.0), incluso si la presentación visual resulta muy similar. Conservar los avisos originales y documentar archivos, versión y modificaciones en `THIRD_PARTY_NOTICES.md`. La licencia del código no se extiende automáticamente a marcas, imágenes, sprites, fondos, sonidos o contenido de otros servicios; verificar por separado la procedencia de cada asset exportable. Para interfaces de servicios cuya licencia de código no se haya comprobado, distinguir referencias visuales de código reutilizable.

## Controles para publicación futura

Antes de una release: SBOM, verificación de dependencias, NOTICE/attribution, archivos LICENSE por componente, controles de acceso, guía backup/import, tratamiento de datos, permisos de voz, test de path traversal y actualización de gate de licencias. Revisión explícita si se planea ofrecer Noble AI como servicio remoto, por efectos de AGPL.

## Seguridad adicional del Model Hub y desktop

- El catálogo externo de Hugging Face no es lista de código confiable. Aceptar solo repos, archivos y rutas válidos; no resolver URLs arbitrarias ni aceptar referencias `../` al escribir archivos. Metadatos y README externos se muestran como datos, nunca como instrucciones de agente.
- Descargas solo desde origen permitido, commit fijado, manifest con tamaño/hash, bytes parciales en carpeta controlada, publicación atómica después de verificar. Implementar límites y respuesta correcta a 401/403 (gated), 404, 429, timeout y mirror sin confianza.
- Evitar cargar pickle o ejecutar `trust_remote_code` por defecto; dar prioridad a GGUF y safetensors cuando el proveedor real los soporte. La extensión por sí sola no confirma que el modelo sea seguro/compatible.
- Credenciales de proveedores remotos en **keyring del sistema operativo**; base de datos almacena referencias de secreto, no API keys. Mostrar salida de texto privado antes de enviar una historia a proveedor externo.
- Importar modelos externos no concede derecho de borrar carpeta de origen; uninstall solo borra assets administrados por Noble y verifica referencias.
- El launcher de escritorio usa token de sesión/loopback, puerto controlado y lifecycle de procesos propios, no habilita LAN sin consentimiento/credenciales. WebView no ejecuta comandos por contenido de novela.
- Respetar licencias del **modelo** y de las voces además del código; una etiqueta `uncensored` es metadato del modelo, no permiso de infringir términos ni una garantía del comportamiento.

## Seguridad de túneles remotos P1.1

- La API principal Noble AI se conserva exclusivamente en 127.0.0.1. No publiques su puerto por un túnel.
- El worker requiere token Bearer, almacenado en keyring local; no se devuelve por API ni se almacena en SQLite. No hay fallback a un fichero plano.
- Los hosts de túnel se limitan a HTTPS con dominio trycloudflare.com; redirects deshabilitados.
- El proxy remoto solo admite listado de modelos y chat completions con streaming, no acciones sobre archivos o procesos.
- Los prompts narrativos salen del equipo principal y se transmiten por Cloudflare, por lo que no son completamente locales.
- Autenticación de usuarios para LAN, permisos de lectura de historias, CORS por origen y actualización segura de builds permanecen sin implementar. La interfaz no debe sugerir que el workspace completo se puede compartir todavía.

## Seguimiento P0 de la auditoría Argon (2026-11-05)

El inventario de `model_storage.py` ya ignora archivos ajenos/symlinks y `downloads.py` ya implementa Range/`.part`/hash condicional. Estas defensas **no sustituyen** el saneamiento antes de *toda operación real de archivo*. Ver [TODO](../TODO.md) y [QA](QA_Y_ACEPTACION.md).

- **Rutas de propiedad:** validar IDs y rutas persistidas (no confiar en SQLite importado), resolver destino y sus padres bajo el directorio autorizado y rechazar enlaces simbólicos que salgan de él antes de escribir, leer, clonar o borrar; probar symlinks y `../` adversariales.
- **Descargas confiables:** comprobar revisión fijada y `Content-Range` real, tamaños permitidos, hash upstream si se anuncia, y publicación atómica. Si no existe hash upstream, registrar **`local_hash_only`**, sin sugerir autenticidad criptográfica certificada.
- **Persistencia:** habilitar y probar foreign keys y transacciones de varios registros; las actualizaciones de historia y estado derivado necesitan consistencia o reconstrucción idempotente tras fallos.
- **GPU y procesos:** los recursos externos del usuario no se matan ni descargan sin autorización. Gestionar solo procesos y modelos controlados por Noble, con bloqueos, timeouts y cancelación efectiva.
- **Workers:** loopback por defecto y Bearer obligatorio al habilitar la red; keyring, redacción de logs, validación de URLs y alcance mínimo; nunca publicar un worker accesible por cualquier cliente sin credenciales.
- **Código de terceros:** la existencia de un repositorio público no equivale a permiso universal; copiar implementación e interfaz si la licencia lo permite, cumplir NOTICE, copyright y copyleft de archivos concretos. Registrar origen, versión, modificaciones y comprobación de licencia; especial revisión para AGPL-3.0 y MPL-2.0.
- **Importaciones:** PNG V2/V3 y paquetes de historias deben tener límites de tamaño, chunks y campos, evitar descompresión descontrolada y no ejecutar expresiones externas.

Cierre condicionado a pruebas de regresión y auditoría del runtime real, no solo análisis de archivos.


## Protección de integridad de instalaciones de modelos (2026-11-05)

Las operaciones `pause/cancel/resume` y los cambios internos `queued→downloading→verifying→completed` usan transiciones condicionales sobre el estado persistido, evitando resucitar trabajos cancelados por carreras entre la interfaz y el worker. Durante SHA-256, la operación consulta el estado antes de continuar, y la publicación exige que aún esté en `verifying` bajo `BEGIN IMMEDIATE`. Un error de SQLite posterior al renombrado activa restauración del archivo parcial cuando es posible.

**Límite de seguridad:** una transacción de SQLite no ofrece atomicidad frente a un corte eléctrico entre operaciones de archivos y base de datos; todavía se requiere conciliación de `model_dir`/jobs en arranque, validación de hashes de artefactos huérfanos y protección contra TOCTOU (sustitución de symlinks entre la comprobación y el uso). No declarar esas garantías como alcanzadas.

Pruebas de falsificación de rutas, renombrado + SQL fallido y pausa/cancel durante hash: [QA](QA_Y_ACEPTACION.md), [TODO](../TODO.md).
