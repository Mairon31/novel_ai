import { expect, test } from '@playwright/test';

test('Piper preferred voice is saved in settings and restored without auto-speech', async ({ page }) => {
  let selected = '';
  let writes = 0;
  await page.route('**/api/v1/tts/voices', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      engine: 'piper', available: true, device: 'cpu', on_demand_only: true,
      models_dir: '/tmp/noble/models/voices',
      voices: [
        { id: 'voice-a.onnx', name: 'Narradora A' },
        { id: 'voice-b.onnx', name: 'Narradora B' },
      ],
    }),
  }));
  await page.route('**/api/v1/tts/config', async route => {
    if (route.request().method() === 'PUT') {
      selected = route.request().postDataJSON().default_voice_id;
      writes++;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ default_voice_id: selected }) });
  });
  const openSettings = async () => {
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
    if (await welcome.isVisible()) {
      await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    }
    if (test.info().project.name === 'mobile') {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
    }
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Imágenes y voz' }).click();
    await expect(page.getByLabel('Voz predeterminada de Piper')).toBeVisible();
  };
  await page.goto('/');
  await openSettings();
  await page.getByLabel('Voz predeterminada de Piper').selectOption('voice-b.onnx');
  await page.getByRole('button', { name: 'Guardar voz predeterminada' }).click();
  await expect(page.getByText('Voz predeterminada guardada para el lector.')).toBeVisible();
  expect(writes).toBe(1);
  expect(selected).toBe('voice-b.onnx');
  await page.reload();
  await openSettings();
  await expect(page.getByLabel('Voz predeterminada de Piper')).toHaveValue('voice-b.onnx');
  expect(writes).toBe(1);
});
