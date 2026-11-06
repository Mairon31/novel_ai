import { expect, test } from '@playwright/test';

test('four settings panels are independent, deep-linkable and responsive', async ({ page }) => {
  let imageRequests = 0;
  let voiceRequests = 0;
  let downloadActions = 0;
  await page.route('**/api/v1/images/config', async route => {
    imageRequests++;
    await route.continue();
  });
  await page.route('**/api/v1/tts/voices', async route => {
    voiceRequests++;
    await route.continue();
  });
  await page.route('**/api/v1/tts/install', async route => {
    downloadActions++;
    await route.continue();
  });
  await page.goto('/#/configuracion/images');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  const nav = page.getByRole('navigation', { name: 'Apartados de configuración' });
  await expect(nav.getByRole('button', { name: 'Imágenes', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Voz / TTS' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Acerca de Noble AI' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Actualizaciones', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Imágenes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toBeVisible();
  await expect(page.getByLabel('Voz predeterminada de Piper')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sobre y actualizaciones' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imágenes y voz' })).toHaveCount(0);
  expect(imageRequests).toBeGreaterThan(0);
  expect(voiceRequests).toBe(0);
  expect(downloadActions).toBe(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-images-separate.png',
    fullPage: true,
  });

  await nav.getByRole('button', { name: 'Voz / TTS' }).click();
  await expect(page).toHaveURL(/#\/configuracion\/voice$/);
  await expect(page.getByRole('heading', { name: 'Voz / TTS' })).toBeVisible();
  await expect(page.getByLabel('Voz predeterminada de Piper')).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toHaveCount(0);
  expect(voiceRequests).toBeGreaterThan(0);
  expect(downloadActions).toBe(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-voice-separate.png',
    fullPage: true,
  });
  const imagesBeforeReload = imageRequests;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voz / TTS' })).toBeVisible();
  await expect(page.getByLabel('Voz predeterminada de Piper')).toBeVisible();
  expect(imageRequests).toBe(imagesBeforeReload);
  await page.goBack();
  await expect(page).toHaveURL(/#\/configuracion\/images$/);
  await expect(page.getByRole('heading', { name: 'Imágenes', exact: true })).toBeVisible();

  await nav.getByRole('button', { name: 'Acerca de Noble AI' }).click();
  await expect(page).toHaveURL(/#\/configuracion\/about$/);
  await expect(page.getByRole('heading', { name: 'Acerca de Noble AI' })).toBeVisible();
  await expect(page.getByText('Tipo de instalación')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprobar actualizaciones' })).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-about-separate.png',
    fullPage: true,
  });
  await nav.getByRole('button', { name: 'Actualizaciones', exact: true }).click();
  await expect(page).toHaveURL(/#\/configuracion\/updates$/);
  await expect(page.getByRole('heading', { name: 'Actualizaciones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprobar actualizaciones' })).toBeVisible();
  await expect(page.getByText('Tipo de instalación')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Actualizaciones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprobar actualizaciones' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-updates-separate.png',
    fullPage: true,
  });
});

test('legacy combined multimedia deep link opens images without displaying TTS', async ({ page }) => {
  await page.goto('/#/configuracion/multimedia');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Imágenes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toBeVisible();
  await expect(page.getByLabel('Voz predeterminada de Piper')).toHaveCount(0);
});
