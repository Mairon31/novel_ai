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

No copiar sprites, fondos, sonidos ni UI exacta de IsekaiZero. Las capturas son referencia de interacción, no una licencia. Mantener un registro de procedencia de todos los assets exportables.

## Controles para publicación futura

Antes de una release: SBOM, verificación de dependencias, NOTICE/attribution, archivos LICENSE por componente, controles de acceso, guía backup/import, tratamiento de datos, permisos de voz, test de path traversal y actualización de gate de licencias. Revisión explícita si se planea ofrecer Noble AI como servicio remoto, por efectos de AGPL.
