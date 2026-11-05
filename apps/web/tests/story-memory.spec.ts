import { expect, test } from '@playwright/test';

test('history inspector searches local story memory without model or GPU', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();
  const creator = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  const title = 'Índice de memoria ' + test.info().project.name;
  await creator.getByLabel('Título').fill(title);
  await creator.getByLabel('Premisa del mundo').fill(
    'Una exploradora investiga leyendas de una ciudad antigua y olvidada.');
  await creator.getByRole('button', { name: 'Elegir protagonista' }).click();
  await creator.getByLabel('Nombre del protagonista').fill('Luna');
  await creator.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(creator).toBeHidden();

  await page.getByRole('button', { name: 'Abrir información de historia' }).click();
  const inspector = page.locator('.noble-reader-inspector.is-open');
  await inspector.getByRole('button', { name: 'Historial' }).click();
  await inspector.getByRole('textbox', { name: 'Buscar recuerdos de la historia' })
    .fill('medallón de cristal');
  await inspector.getByRole('button', { name: 'Buscar en toda la historia' }).click();
  await expect(inspector.getByText('0 recuerdos encontrados')).toBeVisible();
  await expect(inspector.getByText('Solo intervenciones del jugador')).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-memory-search.png',
    fullPage: true,
  });
});
