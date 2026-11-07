import { expect, test } from '@playwright/test';

test('Piper voice catalog installs only after click and tracks pause/resume/completion', async ({ page }) => {
  let downloads = 0;
  let status: 'queued' | 'paused' | 'downloading' | 'completed' = 'queued';
  let started = false;
  let installed = false;
  const voice = 'es_MX-ald-medium.onnx';
  const job = () => ({
    id: '04ccf2aa-74ac-4526-a58b-12deabc43829', voice_id: voice,
    revision: 'a'.repeat(40), status,
    received_bytes: status === 'completed' ? 1050000 : 300000,
    total_bytes: 1050000, error: null, created_at: 1, updated_at: 2,
  });
  await page.route('**/api/v1/tts/catalog', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      source: 'rhasspy/piper-voices', language_focus: 'es_MX', runtime: 'piper',
      engine_installed: false, note: 'El motor Piper se instala por separado.',
      voices: [
        { id: voice, name: 'Ald · Español mexicano', language: 'es_MX',
          quality: 'medium', path: 'es/es_MX/ald/medium',
          installed, model_card: 'https://huggingface.co/rhasspy/piper-voices' },
      ],
    }),
  }));
  await page.route('**/api/v1/tts/voices', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ engine: 'piper', available: false, device: 'cpu',
      on_demand_only: true, models_dir: '/tmp/models/voices',
      voices: installed ? [{ id: voice, name: 'es_MX-ald-medium' }] : [] }),
  }));
  await page.route('**/api/v1/tts/downloads', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ downloads: started ? [job()] : [] }),
  }));
  await page.route('**/api/v1/tts/install', async route => {
    downloads++; started = true; status = 'queued';
    await route.fulfill({ status: 202, contentType: 'application/json',
      body: JSON.stringify(job()) });
  });
  await page.route('**/api/v1/tts/downloads/*/*', async route => {
    const action = route.request().url().split('/').pop();
    if (action === 'pause') status = 'paused';
    if (action === 'resume') status = 'downloading';
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(job()) });
  });

  await page.goto('/');
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
  await expect(page.getByRole('heading', { name: 'Latin American Spanish voices' })).toBeVisible();
  expect(downloads).toBe(0);  // opening settings must not trigger a download
  await page.getByRole('button', { name: 'Instalar voz' }).click();
  await expect(page.getByRole('button', { name: 'Pausar descarga' })).toBeVisible();
  expect(downloads).toBe(1);
  await page.getByRole('button', { name: 'Pausar descarga' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar descarga' })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar descarga' }).click();
  await expect(page.getByRole('button', { name: 'Pausar descarga' })).toBeVisible();
  status = 'completed'; installed = true;
  await page.getByRole('button', { name: 'Actualizar voces' }).click();
  await expect(page.getByText('Lista para seleccionar')).toBeVisible();
  await page.getByLabel('Voz predeterminada de Piper').selectOption(voice);
  expect(downloads).toBe(1);
});
