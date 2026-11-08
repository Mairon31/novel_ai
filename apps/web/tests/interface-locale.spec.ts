import { expect, test } from '@playwright/test';

test('UI locale persists across reload and leaves the story language untouched', async ({ page }) => {
  await page.goto('/#/configuracion/languages');
  // Set the initial preference once: addInitScript would overwrite a newly
  // selected language on every navigation and reload.
  await page.evaluate(() => localStorage.setItem('noble-ui-language', 'en'));
  await page.reload();
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
  await expect(page.locator('.nav-item').first()).toContainText('Biblioteca');
  await expect(page.getByRole('combobox', { name: 'Idioma de narración' })).toHaveValue(original);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.reload();
  await expect(top).toHaveValue('es-419');
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();

  await top.selectOption('pt-BR');
  await expect(page.locator('.nav-item').first()).toContainText('Biblioteca');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await top.selectOption('zh-CN');
  await expect(page.locator('.nav-item').first()).toContainText('书库');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await top.selectOption('en');
  await expect(page.locator('.nav-item').first()).toContainText('Library');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('Model Hub and Downloads follow the selected interface locale', async ({ page }) => {
  await page.goto('/#/modelos');
  await page.evaluate(() => localStorage.setItem('noble-ui-language', 'en'));
  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await page.goto('/#/modelos');
  }

  const selector = page.locator('.topbar .noble-interface-language select');
  await expect(selector).toHaveValue('en');
  await selector.selectOption('es-419');
  await expect(page.locator('.page-heading h1')).toContainText('Centro de modelos');
  await page.goto('/#/descargas');
  await expect(page.locator('.page-heading h1')).toContainText('Descargas');

  await selector.selectOption('pt-BR');
  await page.goto('/#/modelos');
  await expect(page.locator('.page-heading h1')).toContainText('Central de modelos');

  await selector.selectOption('zh-CN');
  await expect(page.locator('.page-heading h1')).toContainText('模型中心');
  await page.goto('/#/descargas');
  await expect(page.locator('.page-heading h1')).toContainText('下载');

  await selector.selectOption('en');
  await page.goto('/#/modelos');
  await expect(page.locator('.page-heading h1')).toContainText('Model Hub');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('Narrator example follows the UI locale without overwriting author input', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Locale sample ' + test.info().project.name + ' ' + Date.now(),
    premise: 'A local test story with enough detail to open the narrator inspector.',
    protagonist_name: 'Alex',
  } });
  expect(created.status()).toBe(201);
  await page.goto('/#/configuracion/narration');
  await page.evaluate(() => localStorage.setItem('noble-ui-language', 'en'));
  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await page.goto('/#/configuracion/narration');
  }

  const sample = page.locator('.narrative-context-inspector textarea');
  const language = page.locator('.topbar .noble-interface-language select');
  await expect(sample).toHaveValue('I observe the scene.');
  await language.selectOption('es-419');
  await expect(sample).toHaveValue('Observo la escena.');
  await sample.fill('Custom text should not be overwritten.');
  await language.selectOption('pt-BR');
  await expect(sample).toHaveValue('Custom text should not be overwritten.');
  await language.selectOption('zh-CN');
  await expect(sample).toHaveValue('Custom text should not be overwritten.');
});
