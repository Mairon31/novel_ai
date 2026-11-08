import { expect, test } from '@playwright/test';

test('UI locale persists across reload and leaves the story language untouched', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('noble-ui-language', 'en'));
  await page.goto('/#/configuracion/languages');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await page.goto('/#/configuracion/languages');
  }
  const top = page.locator('.topbar .noble-interface-language select');
  const settings = page.locator('.workspace-settings-body .noble-interface-language select');
  await expect(top).toHaveValue('en');
  await expect(settings).toHaveValue('en');
  const original = await page.getByRole('combobox', { name: 'Output language' }).inputValue();

  await settings.selectOption('es-419');
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Biblioteca', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Idioma de narración' })).toHaveValue(original);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.reload();
  await expect(top).toHaveValue('es-419');
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();

  await top.selectOption('pt-BR');
  await expect(page.getByRole('button', { name: 'Biblioteca', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await top.selectOption('zh-CN');
  await expect(page.getByRole('button', { name: '书库', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await top.selectOption('en');
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
