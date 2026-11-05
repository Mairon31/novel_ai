import { expect, test } from '@playwright/test';

test('library exports an archive and rejects duplicate restoration without losing story', async ({ page }) => {
  const title = 'Respaldo portátil ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', { data: {
    title, premise: 'Una exploradora conserva el diario de un reino antiguo.',
    protagonist_name: 'Nora',
  } });
  expect(created.status()).toBe(201);
  const story = await created.json();
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Importar respaldo .noble.zip' })).toBeVisible();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  await expect(page.getByRole('region', { name: 'Detalle de ' + title })).toBeVisible();
  const archiveLink = page.getByRole('link', { name: 'Descargar respaldo completo' });
  await expect(archiveLink).toHaveAttribute('download', 'noble-family.noble.zip');
  await expect(archiveLink).toHaveAttribute('href',
    '/api/v1/stories/' + story.id + '/archive.noble.zip');
  const response = await page.request.get('/api/v1/stories/' + story.id + '/archive.noble.zip');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/zip');
  const archive = await response.body();
  expect(archive.subarray(0, 2).toString()).toBe('PK');
  const save = page.waitForEvent('download');
  await archiveLink.click();
  expect((await save).suggestedFilename()).toBe('noble-family.noble.zip');

  await page.getByRole('button', { name: 'Volver a biblioteca' }).click();
  await page.getByLabel('Archivo de respaldo Noble')
    .setInputFiles({ name: 'noble-family.noble.zip', mimeType: 'application/zip',
      buffer: archive });
  await expect(page.getByRole('alert')).toContainText('ya existe');
  await expect(page.locator('.noble-library-cover').filter({ hasText: title })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-archive-guard.png',
    fullPage: true,
  });
});
