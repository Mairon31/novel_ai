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
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.getByRole('button', { name: 'Images', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Voice / TTS' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'About Noble AI' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Updates', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Images', exact: true })).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toBeVisible();
  await expect(page.getByLabel('Default Piper voice')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'About and updates' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Images and voice' })).toHaveCount(0);
  expect(imageRequests).toBeGreaterThan(0);
  expect(voiceRequests).toBe(0);
  expect(downloadActions).toBe(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-images-separate.png',
    fullPage: true,
  });

  await nav.getByRole('button', { name: 'Voice / TTS' }).click();
  await expect(page).toHaveURL(/#\/configuracion\/voice$/);
  await expect(page.getByRole('heading', { name: 'Voice / TTS' })).toBeVisible();
  await expect(page.getByLabel('Default Piper voice')).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toHaveCount(0);
  expect(voiceRequests).toBeGreaterThan(0);
  expect(downloadActions).toBe(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-voice-separate.png',
    fullPage: true,
  });
  const imagesBeforeReload = imageRequests;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voice / TTS' })).toBeVisible();
  await expect(page.getByLabel('Default Piper voice')).toBeVisible();
  expect(imageRequests).toBe(imagesBeforeReload);
  await page.goBack();
  await expect(page).toHaveURL(/#\/configuracion\/images$/);
  await expect(page.getByRole('heading', { name: 'Images', exact: true })).toBeVisible();

  await nav.getByRole('button', { name: 'About Noble AI' }).click();
  await expect(page).toHaveURL(/#\/configuracion\/about$/);
  await expect(page.getByRole('heading', { name: 'About Noble AI' })).toBeVisible();
  await expect(page.getByText('Installation type')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-about-separate.png',
    fullPage: true,
  });
  await nav.getByRole('button', { name: 'Updates', exact: true }).click();
  await expect(page).toHaveURL(/#\/configuracion\/updates$/);
  await expect(page.getByRole('heading', { name: 'Updates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  await expect(page.getByText('Installation type')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Updates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-settings-updates-separate.png',
    fullPage: true,
  });
});

test('legacy combined multimedia deep link opens images without displaying TTS', async ({ page }) => {
  await page.goto('/#/configuracion/multimedia');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Images', exact: true })).toBeVisible();
  await expect(page.getByLabel('Checkpoint')).toBeVisible();
  await expect(page.getByLabel('Default Piper voice')).toHaveCount(0);
});
