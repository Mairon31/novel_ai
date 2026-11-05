import { expect, test } from '@playwright/test';

test('configure on-demand image/voice and illustrate a story explicitly', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/images/status', async route => {
    await route.fulfill({ status: 200, json: {
      online: true, provider: 'comfyui',
      checkpoints: ['story-model.safetensors'], error: null,
    } });
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
    const story = await page.request.get('/api/v1/stories');
    const all = await story.json() as { stories: Array<{ id: string; title: string }> };
    const active = all.stories.find(item => item.title === 'Laboratorio multimedia');
    expect(active).toBeTruthy();
    await route.fulfill({ status: 200, json: {
      story: { ...active, premise: 'Una biblioteca escondida bajo la montaña.',
        protagonist_name: 'Luna', canon: 'El dragón conoce la biblioteca.',
        scene_image_url: '/api/v1/stories/' + active?.id + '/scene-image',
        created_at: 1793800000, updated_at: 1793800001 },
      seed: 12345, checkpoint: 'story-model.safetensors', duration_ms: 600,
    } });
  });
  await page.route('**/api/v1/stories/*/scene-image*', async route =>
    route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Imágenes y voz' }).click();
  await expect(page.getByRole('heading', { name: 'Generación multimedia' })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar checkpoints' }).click();
  await page.getByLabel('Checkpoint').fill('story-model.safetensors');
  await page.getByRole('button', { name: 'Guardar ajustes de imagen' }).click();
  await expect(page.getByText('Ajustes de ComfyUI guardados.')).toBeVisible();
  await page.getByLabel('Activar botones de voz bajo demanda').check();
  await expect(page.getByText('TTS activado solo para los botones Escuchar.')).toBeVisible();

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
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

  await page.getByRole('button', { name: 'Abrir información de historia' }).click();
  await page.getByRole('textbox', { name: 'Canon de la historia' })
    .fill('El dragón conoce la biblioteca.');
  await page.getByRole('button', { name: 'Guardar canon' }).click();
  await page.getByRole('button', { name: 'Galería' }).click();
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
