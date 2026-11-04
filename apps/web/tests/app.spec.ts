import { expect, test } from '@playwright/test';

test('setup, model browser, downloads and diagnostics in the real UI', async ({ page }) => {
  await page.goto('/');
  const wizard = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await wizard.isVisible()) {
    await expect(wizard.getByText('Tu estudio de historias empieza aquí.')).toBeVisible();
    await wizard.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    await expect(wizard).toBeHidden();
  }
  await expect(page.getByRole('heading', { name: /Centro de modelos/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar modelos' })).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-model-hub.png', fullPage: true });

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Descargas', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Descargas/ })).toBeVisible();
  await expect(page.getByText('Sin descargas todavía')).toBeVisible();

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Configuración' }).click();
  await expect(page.getByRole('heading', { name: /Configuración/ })).toBeVisible();
  await expect(page.getByText('Almacenamiento de modelos')).toBeVisible();

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Diagnóstico' }).click();
  await expect(page.getByRole('heading', { name: /Diagnóstico/ })).toBeVisible();
  await expect(page.getByText('ESTADO DEL BACKEND')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-diagnostico.png', fullPage: true });
});
