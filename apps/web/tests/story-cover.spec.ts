import { expect, test } from '@playwright/test';

const coverPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGN0S2lioCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAMPtAWyW7XNMAAAAAElFTkSuQmCC', 'base64');

test('creator uploads a fixed book cover, bookshelf displays it and removing it preserves the story', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const wizard = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await wizard.isVisible()) {
    await wizard.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  const title = 'La biblioteca de las constelaciones ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', {
    data: { title, premise: 'Una ciudad de observatorios guarda secretos de las estrellas.',
      protagonist_name: 'Luna' },
  });
  expect(created.status()).toBe(201);
  const storyId = (await created.json() as { id: string }).id;

  async function navigate(label: string) {
    if (test.info().project.name === 'mobile')
      await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
  }

  await navigate('Creator Studio');
  await page.locator('.creator-project').filter({ hasText: title }).click();
  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  const section = page.locator('.creator-media-library');
  await expect(section.getByText('No custom cover')).toBeVisible();
  await page.getByLabel('Tipo de recurso visual').selectOption('cover');
  await page.getByLabel('Image name').fill('La luna sobre la torre');
  await page.getByLabel('Image description').fill('Cubierta con una luna violeta y una torre');
  await page.getByLabel('Archivo de recurso visual').setInputFiles({
    name: 'cover.png', mimeType: 'image/png', buffer: coverPng,
  });
  await page.getByRole('button', { name: 'Import image' }).click();
  await expect(section.getByText('Custom cover')).toBeVisible();
  await expect(section.getByRole('img', { name: 'Portada de ' + title })).toBeVisible();

  const story = await page.request.get('/api/v1/stories/' + storyId);
  expect(story.ok()).toBeTruthy();
  const selected = await story.json() as { cover_asset_id: string; cover_image_url: string;
    scene_image_url: string | null };
  expect(selected.cover_asset_id).toBeTruthy();
  expect(selected.cover_image_url).toContain('/creator/assets/');
  expect(selected.scene_image_url).toBeNull();

  await page.getByRole('button', { name: 'Go to Library' }).click();
  const book = page.locator('.noble-library-cover').filter({ hasText: title });
  await expect(book).toBeVisible();
  await expect(book.locator('.noble-library-cover-art'))
    .toHaveCSS('background-image', /creator\/assets/);
  await book.click();
  await expect(page.getByRole('region', { name: 'Details of ' + title })
    .locator('.noble-story-detail-cover')).toHaveCSS('background-image', /creator\/assets/);
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-fixed-editorial-cover.png', fullPage: true });

  await page.getByRole('button', { name: 'Editar en Creator Studio' }).click();
  await page.getByRole('button', { name: /Images \(1\)/ }).click();
  await page.getByRole('button', { name: 'Remove cover' }).click();
  await expect(page.getByText('No custom cover')).toBeVisible();
  const updated = await page.request.get('/api/v1/stories/' + storyId);
  expect((await updated.json() as { cover_asset_id: string | null }).cover_asset_id).toBeNull();
  await page.getByRole('button', { name: 'Go to Library' }).click();
  await expect(page.locator('.noble-library-cover').filter({ hasText: title })).toBeVisible();
  await expect(page.locator('.noble-library-cover').filter({ hasText: title })
    .locator('.noble-library-cover-art')).not.toHaveCSS('background-image', /creator\/assets/);
});
