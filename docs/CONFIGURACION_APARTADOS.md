# Configuración de Noble AI — cuatro apartados independientes

**Estado:** implementación UI publicada directamente en `master` el 6 de noviembre de 2026 y verificada en [CI #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131): 381 Python / 80 Playwright / Vite PASS. Seguimiento: [N-25 en TODO](../TODO.md).

## Navegación

| Menú de Configuración | Dirección directa | Componente |
|---|---|---|
| Imágenes | `#/configuracion/images` | `apps/web/src/ImageSettingsPanel.tsx` |
| Voz / TTS | `#/configuracion/voice` | `apps/web/src/VoiceSettingsPanel.tsx` |
| Acerca de Noble AI | `#/configuracion/about` | `apps/web/src/AboutSettingsPanel.tsx` |
| Actualizaciones | `#/configuracion/updates` | `apps/web/src/UpdatesSettingsPanel.tsx` |

Se conserva `#/configuracion` para el resumen de ajustes y `#/configuracion/multimedia` como enlace heredado que abre la nueva sección de Imágenes. Los enlaces de cada apartado utilizan la navegación hash de la propia app, compatible con el servidor local de FastAPI sin reescrituras de URL.

## Qué contiene cada área

**Imágenes:** política de ilustración por escena/manual/off, URL y checkpoint de ComfyUI, resolución, pasos de difusión, CFG, prompt negativo, inventario de modelos y política de reserva GPU (esta última se relaciona con imágenes aunque coordina el LLM local).

**Voz / TTS:** voces Piper instaladas, catálogo y trabajos de descarga, pausa/reanudación/cancelación, voz predeterminada del lector, activación de botones de voz y prueba de audio explícita. No contiene opciones ComfyUI.

**Acerca de Noble AI:** versión, commit, instalación, directorios de usuario/modelos y versión Python. No consulta releases al abrir su pantalla; el resumen global muestra la versión básica de la aplicación.

**Actualizaciones:** canal estable/beta/nightly, comprobación automática al iniciar, releases y revisión manual. No ofrece todavía instalación automática de nuevas versiones: pendiente de empaquetado, integridad y rollback.

## Contratos que deben conservarse

- La separación es **de navegación, responsabilidades de componentes y cargas de API**, no de bases de datos: los valores existentes permanecen en SQLite/API.
- Abrir Imágenes no debe solicitar voces ni iniciar Piper. Abrir Voz no debe consultar la configuración de ComfyUI. Ningún cambio de pestaña puede generar voz, imagen ni descarga sin clic explícito.
- Volver/adelante o recargar debe conservar el apartado activo. Tras iniciar sesión desde un enlace directo no se debe redirigir al Model Hub sin solicitud.
- Proteger la accesibilidad: nombre visible y único de cada panel, botones identificables, estado activo y navegación móvil.
- Test principal: `apps/web/tests/settings-separation.spec.ts`, además de `app.spec.ts`, `multimedia.spec.ts`, `tts-preferences.spec.ts` y `piper-installer.spec.ts`.

**Pendiente N-21:** ampliar las configuraciones internas de imagen y voz por modelo, además de otros motores TTS. La separación N-25 no equivale a completar N-21.

## Evidencia de implementación

La suite genera **capturas de los cuatro apartados para escritorio y móvil** en `test-results/` como artefacto de GitHub Actions. La prueba `settings-separation.spec.ts` valida rutas persistentes, navegador Atrás, compatibilidad `/multimedia`, aislamiento de APIs imagen/voz y ausencia de descargas automáticas al abrir ajustes. `multimedia.spec.ts`, `tts-preferences.spec.ts` y `piper-installer.spec.ts` confirman que siguen operativos los controles anteriores. [Run #42280194131](https://github.com/Mairon31/novel_ai/actions/runs/42280194131).

La revisión visual manual de las capturas sigue disponible para mejoras de estética; no se confunde con validación de motores reales en GPU.
