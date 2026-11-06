# Noble AI — Borradores de expresiones IA con ComfyUI

## Alcance

Generación **a petición del autor** de cinco retratos de un NPC: `neutral`, `joy`, `anger`, `sadness`, `surprise`. Cada expresión se genera por separado y se guarda como borrador revisable. **Nada se publica al lector hasta aprobar las cinco**. No se inicia inferencia en segundo plano durante conversaciones. El generador usa el ComfyUI local ya configurado en Imágenes y voz; no instala modelos ni ejecuta nodos remotos.

## Uso en Creator Studio

1. Configura y arranca ComfyUI con un checkpoint activo desde **Ajustes → Imágenes y voz**. En Creator Studio, crea un NPC con `visual_dna.tags` y `visual_dna.seed` si quieres mantener atributos/semilla constantes; opcionalmente asocia un LoRA `.safetensors` instalado y su intensidad.
2. En **Imágenes → Generar expresiones con IA**, selecciona el NPC, escribe contexto (para la selección determinista posterior del lector), pose y estilo. Opcionalmente especifica otra semilla, una ilustración de referencia ya perteneciente a Galería (activa img2img) y el LoRA del NPC.
3. Haz clic en **Preparar borrador de cinco expresiones**. No se usa GPU aún. **Generar faltantes** ejecuta secuencialmente las solicitudes pendientes; también puedes generar o regenerar cada expresión de forma individual. El botón informará el slot en curso. Si uno falla, los anteriores quedan intactos.
4. Revisa las cinco imágenes PNG transparentes, bordes del cabello, ausencia de personajes extra, ropa, poses y consistencia del NPC. Puedes regenerar slots sin perder otras variantes. Cuando las cinco estén aceptables, pulsa **Aprobar cinco expresiones**. Las cinco se importan transaccionalmente como `foreground` de Creator; el lector puede seleccionarlas sin activar ComfyUI.
5. Un borrador no aprobado se puede descartar y puede retomarse después de recargar; caduca tras 48 horas de inactividad. Máximo tres borradores simultáneos por historia.

## Calidad y transparencia

El workflow estándar de ComfyUI genera imágenes opacas. Noble solicita un solo personaje aislado sobre un croma verde muy uniforme. `sprite_cutout.transparent_sprite` decodifica la salida, comprueba tamaño, contorno dentro del lienzo, croma de bordes y cobertura; elimina solo los componentes verdes conectados al fondo exterior. Si ComfyUI ya devuelve alfa real, se valida su cobertura y contorno. Los resultados dudosos se rechazan con error explícito. **No se trata de segmentación neuronal:** modelos que generen interiores, gradientes, cabello verde, múltiples figuras, sombras complejas o siluetas recortadas pueden necesitar regeneración o importación manual.

La semilla es compartida entre expresiones, pero las cinco condiciones de expresión alteran el prompt; una semilla estable ni LoRA global **garantizan** preservar el mismo rostro. Una referencia img2img conserva parcialmente composición pero puede dificultar el croma. El sistema evita prometer consistencia perfecta y requiere revisión visual humana.

## Estado duradero y protección

- SQLite `sprite_drafts`: UUID, historia/NPC, snapshot de configuración, cinco slots y fechas de actividad.
- Archivos temporales `sprite-drafts/<story-id>/<draft-id>/<expression>-<uuid>.png`, separados del árbol de archivos publicados y de backups `.noble.zip`.
- Un candado global comparte ComfyUI con ilustraciones normales y una reserva GPU opcional; no hay cinco generaciones paralelas ni una cola oculta. Faltan pruebas físicas de VRAM.
- `approve` compone una hoja horizontal RGBA, valida las cinco celdas y llama `CreatorMediaService.import_expression_sheet`. En caso de falla, mantiene los borradores anteriores para reintentar.
- Una imagen aprobada conserva `source=ai_reviewed` y `generation_json` por expresión: checkpoint, seed, LoRA, SHA256 del prompt, método de recorte y aprobación. Archivos anteriores conservan origen `manual`. Una bifurcación o respaldo copia los activos publicados y su procedencia, no las vistas previas sin aprobar.

## QA

La CI usa transporte ComfyUI simulado, Pillow para pruebas de transparencia, SQLite real y Playwright escritorio/móvil. No prueba un checkpoint físico, calidad visual real, continuidad facial ni la instalación de LoRA en la GPU. Ver `tests/test_sprite_cutout.py`, `tests/test_sprite_drafts.py`, `tests/test_sprite_provenance.py` y `apps/web/tests/sprite-drafts.spec.ts`.

### Endurecimiento del protocolo de difusión

Los nombres/ID recibidos de ComfyUI se validan antes de componer rutas `/history` o consultas `/view`. La plantilla propia de `SaveImage` no necesita subcarpetas, por lo que se rechazan respuestas con rutas arbitrarias. El archivo se obtiene únicamente por HTTP desde el loopback configurado; no hay lectura local de rutas indicadas por el proveedor.

### Resultado de aceptación de esta versión

[GitHub Actions #42152514498](https://github.com/Mairon31/novel_ai/actions/runs/42152514498): 283/283 pruebas Python y 64/64 Playwright (desktop/móvil) aprobadas, además de build Vite. La ejecución utiliza un proveedor ComfyUI simulado; no hay validación física de generación o extracción de fondos en una GPU.
