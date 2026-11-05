import { expect, test } from '@playwright/test';

const background = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGN0S2lioCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAMPtAWyW7XNMAAAAAElFTkSuQmCC', 'base64');
const sprite = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMklEQVR4nO3OQQEAMAjEsGO6EIZYxEwGn9RAU9Oby97pHQAAAAAAAAAAAAAAAAAAIMkHRDEB0BVmfGUAAAAASUVORK5CYII=', 'base64');

test('author art library overlays caption-matched background and transparent sprite', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Crear proyecto narrativo' });
  const title = 'El castillo visual ' + test.info().project.name;
  await modal.getByLabel('Título').fill(title);
  await modal.getByLabel('Premisa del mundo')
    .fill('Una viajera conoce a Aira en un castillo iluminado en la ciudad.');
  await modal.getByLabel('Protagonista').fill('Luna');
  await modal.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  await expect(modal).toBeHidden();

  await page.getByRole('button', { name: /Imágenes \(0\)/ }).click();
  await page.getByLabel('Nombre de imagen').fill('Castillo soleado');
  await page.getByLabel('Descripción de imagen').fill('castillo iluminado en la ciudad');
  await page.getByLabel('Archivo de recurso visual').setInputFiles({
    name: 'castillo.png', mimeType: 'image/png', buffer: background,
  });
  await page.getByRole('button', { name: 'Importar imagen' }).click();
  await expect(page.getByRole('button', { name: /Imágenes \(1\)/ })).toBeVisible();
  await expect(page.getByText('Castillo soleado')).toBeVisible();

  await page.getByLabel('Tipo de recurso visual').selectOption('foreground');
  await page.getByLabel('Nombre de imagen').fill('Aira feliz');
  await page.getByLabel('Descripción de imagen').fill('Aira sonríe en el castillo');
  await page.getByLabel('Archivo de recurso visual').setInputFiles({
    name: 'aira.png', mimeType: 'image/png', buffer: sprite,
  });
  await page.getByRole('button', { name: 'Importar imagen' }).click();
  await expect(page.getByRole('button', { name: /Imágenes \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: 'Aperturas' }).click();
  await page.getByLabel('Nueva apertura').fill(
    'Llegaron al castillo iluminado en la ciudad. Aira sonríe y se acerca a Luna.');
  await page.getByRole('button', { name: 'Añadir apertura' }).click();
  await page.getByRole('button', { name: 'Guardar aperturas' }).click();
  await page.getByRole('button', { name: 'Utilizar como inicio de esta historia' }).click();
  await expect(page.getByText(/apertura se guardó como primer turno/)).toBeVisible();

  await page.getByRole('button', { name: 'Ir a Biblioteca' }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  const portrait = page.getByRole('img', { name: 'Personaje presente: Aira feliz' });
  await expect(portrait).toBeVisible();
  await expect(page.locator('.noble-scene-art'))
    .toHaveCSS('background-image', /creator\/assets/);
  // On narrow screens the stage footer may intentionally hide captions.
  await expect(page.getByText('Recursos del creador según la escena')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-creator-visual-stage.png', fullPage: true });
});
