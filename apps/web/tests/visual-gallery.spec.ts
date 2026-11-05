import { expect, test } from '@playwright/test';

const first = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64');
const second = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64');

test('persistent visual characters, gallery versions and prompt preview (real API)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();
  const creation = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  await creation.getByLabel('Título').fill('Galería y personajes');
  await creation.getByLabel('Premisa del mundo').fill(
    'Una hechicera visita un pueblo escondido entre montañas y ríos.');
  await creation.getByRole('button', { name: 'Elegir protagonista' }).click();
  await creation.getByLabel('Nombre del protagonista').fill('Luna');
  await creation.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(creation).toBeHidden();

  await page.getByRole('button', { name: 'Abrir información de historia' }).click();
  await page.getByLabel('Nombre visual').fill('Aira');
  await page.getByLabel('Apariencia visual').fill('Cabello plateado largo, ojos verdes intensos.');
  await page.getByLabel('Vestuario visual').fill('Túnica azul oscura');
  await page.getByLabel('Rasgos visuales').fill('Cicatriz bajo el ojo derecho');
  await page.getByRole('button', { name: 'Añadir personaje visual' }).click();
  await expect(page.getByRole('button', { name: /Aira.*Revisión 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Galería' }).click();
  await page.getByLabel('Lugar actual').fill('Biblioteca antigua');
  await page.getByRole('button', { name: 'Confirmar escenario' }).click();
  await expect(page.getByText('Escenas registradas: 2.')).toBeVisible();
  await page.getByLabel('Describe la escena que quieres ilustrar')
    .fill('La biblioteca iluminada por velas antiguas');
  await page.getByRole('button', { name: 'Ver prompt completo y fichas' }).click();
  await expect(page.getByText(/Cabello plateado largo, ojos verdes intensos/)).toBeVisible();

  const upload = page.getByLabel('Subir ilustración de escena');
  await upload.setInputFiles({ name: 'primera.png', mimeType: 'image/png', buffer: first });
  await expect(page.getByText('Galería versionada (1)')).toBeVisible();
  await upload.setInputFiles({ name: 'segunda.png', mimeType: 'image/png', buffer: second });
  await expect(page.getByText('Galería versionada (2)')).toBeVisible();
  const restore = page.getByRole('button', { name: 'Usar esta versión' });
  await expect(restore).toHaveCount(1);
  await restore.click();
  await expect(page.getByText('Galería versionada (2)')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-visual-version-gallery.png', fullPage: true });
});
