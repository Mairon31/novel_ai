import { expect, test } from '@playwright/test';

test('configure on-demand image/voice and illustrate a story explicitly', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/images/status', async route => {
    await route.fulfill({ status: 200, json: {
      online: true, provider: 'comfyui',
      checkpoints: ['story-model.safetensors'], error: null,
    } });
  });
  let samplingChecks = 0;
  await page.route('**/api/v1/images/sampler-options', async route => {
    samplingChecks++;
    await route.fulfill({ status: 200, json: {
      online: true, sampler_name: ['euler', 'dpmpp_2m'],
      scheduler: ['normal', 'karras'], error: null,
    }});
  });
  await page.route('**/api/v1/tts/voices', async route => {
    await route.fulfill({ status: 200, json: {
      engine: 'piper', available: true, device: 'cpu', on_demand_only: true,
      models_dir: 'fixture voices', voices: [{ id: 'es_MX-test.onnx', name: 'es_MX-test' }],
    } });
  });
  await page.route('**/api/v1/stories/*/illustrate', async route => {
    requests.push('illustrate');
    const payload = route.request().postDataJSON() as { prompt: string };
    expect(payload.prompt).toContain('biblioteca');
    // Persist the screenshot fixture through the real backend. A mocked
    // response alone would claim success without actually creating gallery art.
    const storyId = route.request().url().split('/').at(-2);
    expect(storyId).toBeTruthy();
    const uploaded = await page.request.post('/api/v1/stories/' + storyId + '/scene-image', {
      multipart: {
        file: { name: 'fixture.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64') },
      },
    });
    expect(uploaded.ok()).toBeTruthy();
    const story = await uploaded.json();
    await route.fulfill({ status: 200, json: {
      story, seed: 12345, cached: false,
      checkpoint: 'story-model.safetensors', duration_ms: 600,
    } });
  });
  await page.route('**/api/v1/stories/*/scene-image*', async route =>
    route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Imágenes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Imágenes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Activar botones de voz bajo demanda')).toHaveCount(0);
  await page.getByRole('button', { name: 'Buscar checkpoints' }).click();
  await page.getByLabel('Checkpoint').fill('story-model.safetensors');
  await page.getByRole('button', { name: 'Comprobar muestreo ComfyUI' }).click();
  expect(samplingChecks).toBe(1);
  await expect(page.getByText('Compatibilidad KSampler: selección compatible.')).toBeVisible();
  await page.getByLabel('Muestreador ComfyUI').selectOption('dpmpp_sde');
  await expect(page.getByRole('button', { name: 'Guardar ajustes de imagen' })).toBeDisabled();
  await page.getByLabel('Muestreador ComfyUI').selectOption('dpmpp_2m');
  await page.getByLabel('Planificador ComfyUI').selectOption('karras');
  await page.getByLabel('Illustration style').selectOption('anime_cinematic');
  await page.getByRole('button', { name: 'Guardar ajustes de imagen' }).click();
  // Wait for the actual PUT response and saved UI state before reading SQLite.
  await expect(page.getByText('Ajustes de ComfyUI guardados.')).toBeVisible();
  const configured = await page.request.get('/api/v1/images/config');
  expect(configured.ok()).toBeTruthy();
  const params = await configured.json();
  expect(params.sampler_name).toBe('dpmpp_2m');
  expect(params.scheduler).toBe('karras');
  expect(params.style_preset).toBe('anime_cinematic');
  await expect(page.getByText('Ajustes de ComfyUI guardados.')).toBeVisible();
  await page.getByRole('button', { name: 'Voz / TTS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Voz / TTS' })).toBeVisible();
  await page.getByRole('button', { name: 'Imágenes', exact: true }).click();
  await expect(page.getByLabel('Muestreador ComfyUI')).toHaveValue('dpmpp_2m');
  await expect(page.getByLabel('Planificador ComfyUI')).toHaveValue('karras');
  await expect(page.getByLabel('Illustration style')).toHaveValue('anime_cinematic');
  await page.getByRole('button', { name: 'Voz / TTS', exact: true }).click();
  await expect(page.getByLabel('Checkpoint')).toHaveCount(0);
  // Speech preferences initialize independently after switching tabs.
  await expect(page.getByLabel('Activar botones de voz bajo demanda')).toBeEnabled();
  await page.getByLabel('Activar botones de voz bajo demanda').check();
  await expect(page.getByLabel('Activar botones de voz bajo demanda')).toBeChecked();

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();
  const wizard = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  await wizard.getByLabel('Título').fill('Laboratorio multimedia');
  await wizard.getByLabel('Premisa del mundo').fill('Una biblioteca escondida bajo la montaña.');
  await wizard.getByRole('button', { name: 'Elegir protagonista' }).click();
  await wizard.getByLabel('Nombre del protagonista').fill('Luna');
  await wizard.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(wizard).toBeHidden();
  expect(requests).toEqual([]);

  await page.getByRole('button', { name: 'Open story details' }).click();
  await page.getByRole('textbox', { name: 'Canon de la historia' })
    .fill('El dragón conoce la biblioteca.');
  await page.getByRole('button', { name: 'Guardar canon' }).click();
  await page.getByRole('button', { name: 'Galería', exact: true }).click();
  await page.getByLabel('Describe la escena que quieres ilustrar')
    .fill('La biblioteca iluminada por luciérnagas, estilo anime.');
  await page.getByRole('button', { name: 'Ilustrar escena con ComfyUI' }).click();
  await expect(page.getByRole('img', { name: /Ilustración de Laboratorio multimedia/ })).toBeVisible();
  expect(requests).toEqual(['illustrate']);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-multimedia-reader.png',
    fullPage: true,
  });
});
