import { expect, test } from '@playwright/test';

const background = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGN0S2lioCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAMPtAWyW7XNMAAAAAElFTkSuQmCC', 'base64');
const sprite = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMklEQVR4nO3OQQEAMAjEsGO6EIZYxEwGn9RAU9Oby97pHQAAAAAAAAAAAAAAAAAAIMkHRDEB0BVmfGUAAAAASUVORK5CYII=', 'base64');

test('author art library overlays caption-matched background and transparent sprite', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Create story project' });
  const title = 'El castillo visual ' + test.info().project.name;
  await modal.getByLabel('Title').fill(title);
  await modal.getByLabel('World premise')
    .fill('Una viajera conoce a Aira en un castillo iluminado en la ciudad.');
  await modal.getByLabel('Protagonist').fill('Luna');
  await modal.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(modal).toBeHidden();

  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  await page.getByLabel('Image name').fill('Castillo soleado');
  await page.getByLabel('Image description').fill('castillo iluminado en la ciudad');
  await page.getByLabel('Visual asset file').setInputFiles({
    name: 'castillo.png', mimeType: 'image/png', buffer: background,
  });
  await page.getByRole('button', { name: 'Import image' }).click();
  await expect(page.getByRole('button', { name: /Images \(1\)/ })).toBeVisible();
  await expect(page.getByText('Castillo soleado')).toBeVisible();

  await page.getByLabel('Visual asset type').selectOption('foreground');
  await page.getByLabel('Sprite expression').selectOption('joy');
  await page.getByLabel('Sprite pose').fill('waving');
  await page.getByLabel('Image name').fill('Aira feliz');
  await page.getByLabel('Image description').fill('Aira sonríe en el castillo');
  await page.getByLabel('Visual asset file').setInputFiles({
    name: 'aira.png', mimeType: 'image/png', buffer: sprite,
  });
  await page.getByRole('button', { name: 'Import image' }).click();
  await expect(page.getByRole('button', { name: /Images \(2\)/ })).toBeVisible();
  await expect(page.getByText('Expression: joy · Pose: waving')).toBeVisible();

  await page.getByRole('button', { name: 'Openings' }).click();
  await page.getByLabel('New opening').fill(
    'Llegaron al castillo iluminado en la ciudad. Aira sonríe y se acerca a Luna.');
  await page.getByRole('button', { name: 'Add opening' }).click();
  await page.getByRole('button', { name: 'Save openings' }).click();
  await page.getByRole('button', { name: 'Use as story opening' }).click();
  await expect(page.getByText(/Opening saved as the first turn/)).toBeVisible();

  await page.getByRole('button', { name: 'Go to Library' }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  await expect(page.getByRole('region', { name: 'Details of ' + title })).toBeVisible();
  await page.getByRole('button', { name: 'Continue story' }).click();
  const portrait = page.getByRole('img', { name: 'Present character: Aira feliz' });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('data-expression', 'joy');
  await expect(portrait).toHaveAttribute('data-pose', 'waving');
  await expect(page.locator('.noble-scene-background'))
    .toHaveCSS('background-image', /creator\/assets/);
  // On narrow screens the stage footer may intentionally hide captions.
  await expect(page.getByText('Creator assets matched to the scene')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-creator-visual-stage.png', fullPage: true });
});
