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
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await expect(page.locator('.noble-reader-chapter')).toContainText(title);

    await page.getByRole('button', { name: 'Open story details' }).click();
    const inspector = page.locator('.noble-reader-inspector.is-open');
    await inspector.getByRole('button', { name: 'Gallery', exact: true }).click();
    await expect(inspector.getByText('Visual director and background cache')).toBeVisible();
    await inspector.getByRole('button', { name: 'Evaluate visual director' }).click();
    const result = inspector.locator('.noble-director-result');
    await expect(result).toContainText('Prepare new background');
    await expect(result).toContainText('bosque lunar');
    await result.getByRole('button', {
      name: 'Register manual background for this context',
    }).click();
    await expect(result).toContainText('Reuse background');

    const before = await (await page.request.get(base + '/visual-state')).json();
    await result.getByRole('button', { name: 'Reuse background without generating' }).click();
    await expect(inspector).toContainText('Fondo reutilizado desde la galería');
    const after = await (await page.request.get(base + '/visual-state')).json();
    expect(after.assets).toHaveLength(before.assets.length);
    expect(after.selected_asset_id).toBe(before.selected_asset_id);

    await inspector.getByRole('combobox', { name: 'Visual director intent' })
      .selectOption('emotion');
    await inspector.getByRole('button', { name: 'Evaluate visual director' }).click();
    await expect(result).toContainText('Update character expression');

    await inspector.getByRole('combobox', { name: 'Visual director intent' })
      .selectOption('event');
    await inspector.getByRole('button', { name: 'Evaluate visual director' }).click();
    await expect(result).toContainText('Suggest a special event illustration');
    await expect(result).toContainText('no se ha producido ninguna imagen automáticamente');

    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-visual-director.png',
      fullPage: true,
    });
  });
