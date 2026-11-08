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
        { id: 'voice-a.onnx', name: 'Narratora A' },
        { id: 'voice-b.onnx', name: 'Narratora B' },
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
      await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
    }
    if (test.info().project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Voice / TTS', exact: true }).click();
    await expect(page.getByLabel('Default Piper voice')).toBeVisible();
  };
  await page.goto('/');
  await openSettings();
  await page.getByLabel('Default Piper voice').selectOption('voice-b.onnx');
  await page.getByRole('button', { name: 'Save default voice' }).click();
  await expect(page.getByText('Default reader voice saved.')).toBeVisible();
  expect(writes).toBe(1);
  expect(selected).toBe('voice-b.onnx');
  await page.reload();
  await openSettings();
  await expect(page.getByLabel('Default Piper voice')).toHaveValue('voice-b.onnx');
  expect(writes).toBe(1);
  expect(previewCalls).toBe(0);
  await expect(page.getByLabel('Piper speed')).toHaveValue('1');
  await page.getByLabel('Piper speed').fill('0.85');
  await page.getByLabel('Piper voice noise').fill('0.75');
  await page.getByLabel('Piper phoneme noise').fill('0.95');
  await expect(page.getByRole('button', { name: 'Preview selected voice' })).toBeDisabled();
  await expect(page.getByText('Save the updated settings before testing the voice.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Piper settings' }).click();
  await expect(page.getByText('Piper settings saved for future synthesis.')).toBeVisible();
  expect(parameterWrites).toBe(1);
  expect(synthesis).toEqual({ length_scale: 0.85, noise_scale: 0.75, noise_w: 0.95 });
  await page.getByRole('button', { name: 'Preview selected voice' }).click();
  await expect(page.getByLabel('Play voice preview')).toBeVisible();
  await expect(page.getByText('Sample generated. Press Play to listen.')).toBeVisible();
  expect(previewCalls).toBe(1);
  await page.reload();
  await openSettings();
  await expect(page.getByLabel('Piper speed')).toHaveValue('0.85');
  await expect(page.getByLabel('Piper voice noise')).toHaveValue('0.75');
  await expect(page.getByLabel('Piper phoneme noise')).toHaveValue('0.95');
  expect(parameterWrites).toBe(1);
  expect(previewCalls).toBe(1);
});
