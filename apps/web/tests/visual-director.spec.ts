import { expect, test } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=',
  'base64');

test('visual director registers and reuses existing background without ComfyUI',
  async ({ page }) => {
    const title = 'Director del bosque ' + test.info().project.name;
    const created = await page.request.post('/api/v1/stories', { data: {
      title,
      premise: 'Una exploradora visita un bosque y escucha los rumores del valle.',
      protagonist_name: 'Aira',
    }});
    expect(created.status()).toBe(201);
    const story = await created.json() as { id: string };
    const base = '/api/v1/stories/' + story.id;
    const current = await page.request.put(base + '/world-state', {
      data: { expected_revision: 0, state: {
        location: 'Bosque lunar', time_of_day: 'noche', weather: 'lluvia',
      }},
    });
    expect(current.status()).toBe(200);
    const upload = await page.request.post(base + '/scene-image', {
      multipart: { file: { name: 'background.png', mimeType: 'image/png', buffer: png } },
    });
    expect(upload.status()).toBe(200);

    await page.goto('/#/historia/' + story.id + '/leer');
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    await expect(page.locator('.noble-reader-chapter')).toContainText(title);

    await page.getByRole('button', { name: 'Abrir información de historia' }).click();
    const inspector = page.locator('.noble-reader-inspector.is-open');
    await inspector.getByRole('button', { name: 'Galería', exact: true }).click();
    await expect(inspector.getByText('Director visual y caché de fondos')).toBeVisible();
    await inspector.getByRole('button', { name: 'Evaluar director visual' }).click();
    const result = inspector.locator('.noble-director-result');
    await expect(result).toContainText('Preparar un fondo nuevo');
    await expect(result).toContainText('bosque lunar');
    await result.getByRole('button', {
      name: 'Registrar fondo manual para este contexto',
    }).click();
    await expect(result).toContainText('Reutilizar fondo');

    const before = await (await page.request.get(base + '/visual-state')).json();
    await result.getByRole('button', { name: 'Reutilizar fondo sin generar' }).click();
    await expect(inspector).toContainText('Fondo reutilizado desde la galería');
    const after = await (await page.request.get(base + '/visual-state')).json();
    expect(after.assets).toHaveLength(before.assets.length);
    expect(after.selected_asset_id).toBe(before.selected_asset_id);

    await inspector.getByRole('combobox', { name: 'Intención visual del director' })
      .selectOption('emotion');
    await inspector.getByRole('button', { name: 'Evaluar director visual' }).click();
    await expect(result).toContainText('Actualizar expresión del personaje');

    await inspector.getByRole('combobox', { name: 'Intención visual del director' })
      .selectOption('event');
    await inspector.getByRole('button', { name: 'Evaluar director visual' }).click();
    await expect(result).toContainText('Proponer ilustración especial de evento');
    await expect(result).toContainText('no se ha producido ninguna imagen automáticamente');

    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-visual-director.png',
      fullPage: true,
    });
  });
