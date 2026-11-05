import { expect, test } from '@playwright/test';

test('Creator Studio Lorebook creates trigger, previews it and persists locally', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();

  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear proyecto narrativo' });
  const title = 'Archivo de los mapas ' + test.info().project.name;
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Premisa del mundo').fill(
    'Una exploradora visita las ruinas perdidas en un reino lleno de secretos.');
  await dialog.getByLabel('Protagonista').fill('Luna');
  await dialog.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: /Lorebook \(0\)/ }).click();
  await page.getByLabel('Título de Lorebook').fill('Mapa de las ruinas');
  await page.getByLabel('Contenido de Lorebook').fill(
    'Las ruinas esconden una puerta que solo Luna puede abrir con el mapa antiguo.');
  await page.getByLabel('Claves de Lorebook').fill('ruinas, mapa');
  await page.getByLabel('Prioridad de Lorebook').fill('95');
  await page.getByRole('button', { name: 'Crear entrada de Lorebook' }).click();
  await expect(page.getByText(/Entrada de Lorebook guardada/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Lorebook \(1\)/ })).toBeVisible();

  await page.getByLabel('Simular activación Lorebook').fill('Entro en las ruinas.');
  await page.getByRole('button', { name: 'Previsualizar Lorebook' }).click();
  await expect(page.getByText('1 entrada(s) activada(s)')).toBeVisible();
  await expect(page.locator('.creator-hint[role="status"]').getByText(
    'Mapa de las ruinas · prioridad 95')).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-lorebook.png', fullPage: true,
  });

  await page.getByLabel('Simular activación Lorebook').fill('Camino por el puerto.');
  await page.getByRole('button', { name: 'Previsualizar Lorebook' }).click();
  await expect(page.getByText('0 entrada(s) activada(s)')).toBeVisible();

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.locator('.creator-project').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: /Lorebook \(1\)/ }).click();
  await expect(page.getByText('Mapa de las ruinas · prioridad 95')).toBeVisible();
});
