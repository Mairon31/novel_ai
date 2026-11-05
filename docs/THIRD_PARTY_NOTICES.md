# Third-party attribution and notices

## Urakatsu — MIT License

Noble AI's model quantization/hardware-fit evaluation is **adapted from concepts and algorithms** in the Urakatsu catalog implementation, in particular:

- \`urakatsu/catalog/fit.py\` — GPU/full vs partial offload, CPU and model size + KV-cache evaluation.
- \`urakatsu/catalog/hf.py\` — reading GGUF metadata from partial model files, avoiding a whole-model download.
- \`web/src/components/ModelsPage.tsx\` — hardware-aware list/detail interaction references.

Upstream repository: https://github.com/karrot0/Urakatsu

Copyright (c) 2026 Urakatsu contributors.

The original MIT permission and copyright notice are preserved below.

> MIT License
>
> Copyright (c) 2026 Urakatsu contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Isekai Zero

Isekai Zero's publicly documented creation workflows and the user-supplied
interface references informed **product design and information architecture**.
No Isekai Zero code, images, brand elements, or story text are included in
Noble AI. See [research notes](ISEKAI_ZERO_REFERENCIA.md).


## Urakatsu frontend — direct session-cache adaptation

The Noble AI module `apps/web/src/modelCatalogCache.ts` adapts the
`recentSearches` and `recentDetails` in-memory Maps used in
Urakatsu `web/src/components/ModelsPage.tsx`.

- Upstream commit: `165bf592716019b8487249bf7ca3ff3b708a23e7`
- Original copyright: Copyright (c) 2026 Urakatsu contributors.
- License: MIT; its copyright and full permission notice are retained above.
- Changes in Noble AI: bounded caches, TTL for hardware-sensitive fit reports,
  typed keys across roles and context windows, and protection from stale requests.
- Upstream: https://github.com/karrot0/Urakatsu/blob/165bf592716019b8487249bf7ca3ff3b708a23e7/web/src/components/ModelsPage.tsx

The desktop master/detail UX follows this same authorized open-source model,
adapted to Noble AI's story-narration model categories and independent runtimes.


## Reutilización de interfaz Urakatsu (2026-11-05)

- `web/src/components/ModelsPage.tsx` — patrón master/detail de catálogo y ficha, caché de resultados y detalles de sesión, explicación de compatibilidad `FitCell` (porcentaje GPU, memoria de pesos y KV), y sección desplegable `Model card`.
- Archivos de Noble AI derivados/adaptados: `apps/web/src/App.tsx`, `apps/web/src/modelCatalogCache.ts`, `apps/web/src/styles.css`, `apps/api/noble_api/catalog.py`, `apps/api/noble_api/main.py`.
- Origen: https://github.com/karrot0/Urakatsu/tree/main/web/src/components/ModelsPage.tsx
- Licencia aplicable: MIT, con aviso íntegro y copyright preservados en este documento. Se adaptaron dependencias a React/FastAPI de Noble AI; no se importa su editor de traducción ni es requisito ejecutar la aplicación Urakatsu.

## Urakatsu — ModelsStorage and UsageBar UI patterns

Noble AI `apps/api/noble_api/model_storage.py` and its installed-model
dashboard adapt the **behavior and visual presentation concepts** of
`web/src/components/ModelsStorage.tsx` and `web/src/components/UsageBar.tsx`
from Urakatsu (copyright (c) 2026 Urakatsu contributors, MIT). The
implementation uses Noble AI's SQLite records, its own endpoints and
independently written React/CSS, not an unmodified component import.

Upstream revision: `165bf592716019b8487249bf7ca3ff3b708a23e7`.
The original MIT permission and copyright notice for Urakatsu is retained
in the first section of this document.
