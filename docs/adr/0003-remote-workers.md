# ADR-003 — Workers GPU separados del workspace principal

**Fecha:** 2026-11-04
**Estado:** aceptada como arquitectura experimental P1.1

## Problema
Noble AI debe ejecutar inferencia en una segunda PC o una sesión de Google Colab, sin trasladar al remoto la biblioteca de historias ni las credenciales de otros servicios.

## Decisión
1. El backend principal permanece en 127.0.0.1.
2. La máquina GPU inicia su servidor OpenAI-compatible local y un proxy Noble Worker, independiente del workspace.
3. Cloudflare Quick Tunnel publica únicamente ese proxy, con autenticación Bearer obligatoria. El registro principal guarda nombre, URL y rol en SQLite; el token vive en keyring del sistema operativo.
4. El backend valida HTTPS *.trycloudflare.com y prueba el rechazo de credenciales inválidas antes de activar un worker.
5. La narración usa streaming remoto sin modificar el almacenamiento de turnos en SQLite.
6. Imagen y voz necesitan protocolos distintos y colas de GPU; no se afirma que estén implementados.
7. No se habilita acceso LAN o WAN al servidor principal sin implementar autenticación de sesiones y permisos.

## Consecuencias y límites
Un worker recibe el contenido del prompt, pero no la DB ni los archivos. El túnel es temporal y puede desconectarse. No se ha probado inferencia real en Colab ni rendimiento con NVIDIA de 12/16 GB. Se inspira en el diseño por componentes de Urakatsu sin copiar su código ni su protocolo interno.

## Próximos gates
Benchmarks de GPU remota real, health/capabilities de workers por rol, reconexión, actualización de runtimes con hashes y rollback, acceso LAN autenticado y adapters de imagen/TTS.

[Guía de workers](../WORKERS.md)
