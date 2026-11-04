# Noble AI — despliegue app-first, escritorio y web

Estado: decisión técnica propuesta; no hay ejecutable construido todavía.

## Dos modos, una experiencia

**Modo desarrollo / web local (primer objetivo):**
- Vite/React presenta UI en navegador local. FastAPI ofrece REST/SSE, sesión y catálogo.
- Configuración inicial **dentro de la interfaz**; no exigir notebook o `.env` al usuario normal.
- Windows Linux pueden correr scripts para desarrolladores inicialmente; los usuarios finales no los necesitarán en release.

**Modo escritorio (futura compilación):**
- Candidato **Tauri 2**, empaquetar la UI web y el backend Python FastAPI como sidecar/executable autónomo, con recursos (manifests/config) e instalaciones opcionales de runtimes. Alternativa: launcher Rust de webview como Urakatsu, si el spike de Tauri falla.
- El shell detecta si Noble se está ejecutando, crea directorios de usuario y abre el wizard o biblioteca. Inicia API con puerto local efímero/controlado, token de sesión y healthcheck; cierra solo sus procesos al salir, no mata servicios externos compartidos.
- Los motores KoboldCpp/ComfyUI/TTS se ejecutan como **procesos administrados u externos** según elección, con rutas y puertos guardados en config segura. No asumir que empaquetarlos en un único binario sea trivial o recomendable.
- Modelos y assets en carpeta configurable independiente del ejecutable; actualizaciones no sobrescriben modelos/proyectos.
- No incluir pesos de varios GB en instalador. Instalador ofrece ruta y descarga guiada/consentida.

Documento Tauri 2 sobre sidecars: https://v2.tauri.app/develop/sidecar/ . Es posible empaquetar binarios auxiliares con `externalBin`, pero requiere build por plataforma, permisos y manejo de la vida del proceso.

## Modo Google Colab: secundario

Colab **no es interfaz principal ni paso obligatorio de instalación**. Conservamos notebooks como pruebas, benchmarks y experimentación con GPU temporal, respetando reglas de Colab. Una sesión puede simular/ejecutar llamadas del backend mediante celdas, pero la experiencia real será app web/desktop.

No establecer túneles públicos ni simular permanencia 24/7 en runtimes gratuitos. Un futuro proveedor de cómputo remoto podrá usar un **agente autenticado** en infraestructura permisiva; no mezclarlo con notebooks de test.

## Portabilidad

```text
            React UI (web)
              ↕ REST/SSE
     FastAPI Orchestrator (Python)
              ↕ adapters
     KoboldCpp | Ollama | ComfyUI | TTS workers
              ↕ hardware coordinator
       NVIDIA CUDA/CPU/offload

    + Tauri 2 WebView/launcher (Windows .exe futuro)
    + notebooks Colab (pruebas independientes)
```

Tauri no altera los contratos de historias, ni los provider IDs, ni los formatos de datos; solo empaqueta/orquesta localmente. El resultado debe funcionar en localhost sin necesitar Tauri para desarrollo.

## Entregables y prueba de aceptación

1. App web inicia y muestra wizard aunque no exista modelo.
2. Backend detecta NVIDIA/CPU y rutas disponibles.
3. Desde UI se selecciona/instala un modelo local permitido.
4. Desde UI se inicia narrador, se cambia modelo y se recupera historia tras reiniciar.
5. Imagen y TTS permanecen opcionales/cargados diferidamente.
6. Windows ejecutable abre sin terminal, muestra modelos ya instalados, inicia/para procesos de Noble y funciona offline con pesos cacheados.
7. CI y QA sobre web y escritorio; salida real de instalador, firma/aviso de OS documentados.

Ninguna de estas metas se marca como hecha antes de implementarse/probarse.
