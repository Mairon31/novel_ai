import { expect, test } from '@playwright/test';

test('Downloads displays reconciled files and non-destructive startup conflicts', async ({ page }) => {
  await page.route('**/api/v1/downloads/recovery', async route => route.fulfill({
    status: 200,
    json: { recovered: 2, conflicts: 1, skipped: 3 },
  }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Descargas', exact: true }).click();
  const recovery = page.locator('.workspace-note[role="status"]');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('2 descarga(s) recuperada(s) tras un reinicio');
  await expect(recovery).toContainText('1 conflicto(s) detectado(s)');
  await expect(recovery).toContainText('sin sobrescribir archivos');
  await expect(page.getByRole('heading', { name: /^Descargas/ })).toBeVisible();
});
