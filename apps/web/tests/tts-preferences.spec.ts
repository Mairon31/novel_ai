import { expect, test } from '@playwright/test';

test('Piper preferred voice is saved in settings and restored without auto-speech', async ({ page }) => {
  let selected = '';
  let writes = 0;
  let previewCalls = 0;
  let parameterWrites = 0;
  let synthesis = { length_scale: 1, noise_scale: 0.667, noise_w: 0.8 };
  await page.route('**/api/v1/tts/synthesis-config', async route => {
    if (route.request().method() === 'PUT') {
      synthesis = route.request().postDataJSON();
      parameterWrites++;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(synthesis) });
  });
  await page.route('**/api/v1/tts/preview', async route => {
    previewCalls++;
    const payload = route.request().postDataJSON();
    expect(payload.request_source).toBe('preview_button');
    expect(payload.voice_id).toBe('voice-b.onnx');
    await route.fulfill({ status: 200, contentType: 'audio/wav',
      body: 'RIFF........WAVEfmt ........data....' });
  });
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
    const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await welcome.isVisible()) {
      await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    }
    if (test.info().project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
    }
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Voz / TTS', exact: true }).click();
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
  expect(previewCalls).toBe(0);
  await expect(page.getByLabel('Velocidad Piper')).toHaveValue('1');
  await page.getByLabel('Velocidad Piper').fill('0.85');
  await page.getByLabel('Ruido de voz Piper').fill('0.75');
  await page.getByLabel('Ruido de fonemas Piper').fill('0.95');
  await expect(page.getByRole('button', { name: 'Probar voz seleccionada' })).toBeDisabled();
  await expect(page.getByText('Guarda los parámetros nuevos antes de probar la voz.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Piper settings' }).click();
  await expect(page.getByText('Parámetros Piper guardados para las próximas síntesis.')).toBeVisible();
  expect(parameterWrites).toBe(1);
  expect(synthesis).toEqual({ length_scale: 0.85, noise_scale: 0.75, noise_w: 0.95 });
  await page.getByRole('button', { name: 'Probar voz seleccionada' }).click();
  await expect(page.getByLabel('Reproducir prueba de voz')).toBeVisible();
  await expect(page.getByText('Muestra generada. Pulsa Reproducir para escucharla.')).toBeVisible();
  expect(previewCalls).toBe(1);
  await page.reload();
  await openSettings();
  await expect(page.getByLabel('Velocidad Piper')).toHaveValue('0.85');
  await expect(page.getByLabel('Ruido de voz Piper')).toHaveValue('0.75');
  await expect(page.getByLabel('Ruido de fonemas Piper')).toHaveValue('0.95');
  expect(parameterWrites).toBe(1);
  expect(previewCalls).toBe(1);
});
