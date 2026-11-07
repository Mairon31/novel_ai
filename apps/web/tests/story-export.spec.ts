import { expect, test } from '@playwright/test';

test('reader exports its current story as a standalone HTML attachment', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  const title = 'HTML portátil ' + test.info().project.name;
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Premisa del mundo').fill(
    'Una exploradora descubre un reino antiguo y escribe sus recuerdos en un libro.');
  await dialog.getByRole('button', { name: 'Elegir protagonista' }).click();
  await dialog.getByLabel('Nombre del protagonista').fill('Luna');
  await dialog.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(dialog).toBeHidden();

  const link = page.getByRole('link', { name: 'Exportar historia HTML' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('download', 'noble-story.html');
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/api\/v1\/stories\/[a-f\d-]+\/export\.html$/);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain('attachment');
  const content = await response.text();
  expect(content).toContain('<!doctype html>');
  expect(content).toContain(title);
  expect(content).not.toContain('http://');
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('noble-story.html');

  const epubLink = page.getByRole('link', { name: 'Exportar historia EPUB' });
  await expect(epubLink).toBeVisible();
  const epubHref = await epubLink.getAttribute('href');
  expect(epubHref).toMatch(/^\/api\/v1\/stories\/[a-f\d-]+\/export\.epub$/);
  const epubResponse = await page.request.get(epubHref!);
  expect(epubResponse.status()).toBe(200);
  expect(epubResponse.headers()['content-type']).toContain('application/epub+zip');
  const epubBytes = await epubResponse.body();
  expect(epubBytes.slice(0, 2).toString()).toBe('PK');
  const epubDownload = page.waitForEvent('download');
  await epubLink.click();
  expect((await epubDownload).suggestedFilename()).toBe('noble-story.epub');
});
