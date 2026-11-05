# Contribuir a Noble AI

Gracias por tu interés en Noble AI. Las contribuciones pueden cubrir la interfaz web, el motor narrativo, imágenes, voz, accesibilidad, compatibilidad, documentación y pruebas.

## Antes de comenzar

1. Revisa los [issues existentes](https://github.com/Mairon31/novel_ai/issues) para evitar trabajo duplicado.
2. Para cambios grandes, abre primero una propuesta con la motivación, el alcance y cómo se podrá comprobar.
3. Trabaja sobre una rama propia y procura que cada pull request tenga un objetivo claro.
4. No agregues checkpoints de varios gigabytes, credenciales, claves privadas, historias personales ni capturas con datos sensibles.

## Configurar entorno y ejecutar pruebas

Sigue [la guía de inicio](docs/QUICKSTART.md). Después:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
```

Playwright requiere Chromium instalado y los servicios de desarrollo activos, de acuerdo con [.github/workflows/p0-docs.yml](.github/workflows/p0-docs.yml).

## Requisitos de un pull request

- Explica el problema que resuelve y los cambios de interfaz o API.
- Incluye tests relevantes; no escondas fallos preexistentes ni simules benchmarks de GPU reales.
- Si modificas la interfaz, aporta capturas de escritorio y móvil.
- Si alteras proveedores, registra los límites, requisitos y posibles fallos sin exponer claves.
- Actualiza los contratos o documentos técnicos cuando cambie el comportamiento.

El README presenta el proyecto a usuarios y colaboradores. El progreso interno, las decisiones de ingeniería y las incidencias se documentan en \`docs/\` o en los issues.

## Reportar problemas

Abre un [issue](https://github.com/Mairon31/novel_ai/issues) con pasos para reproducirlo, comportamiento esperado y observado, sistema operativo y versión o commit. Elimina rutas privadas, claves, tokens y contenido personal de cualquier log.

¡Gracias por ayudar a construir Noble AI!
