import { expect, test } from '@playwright/test';

test('image checkpoint install is explicit, resumable and only selectable when ComfyUI sees it', async ({ page }) => {
  const repo = 'artist/fantasy-checkpoint';
  const filename = 'fantasy-anime.safetensors';
  const checkpointName = repo + '/' + filename;
  const revision = 'c'.repeat(40);
  let installs = 0;
  let started = false;
  let installed = false;
  let phase: 'queued' | 'paused' | 'downloading' | 'completed' = 'queued';
  let statusChecks = 0;
  const job = () => ({
    id: 'c1bd0c42-5a6e-4be7-bf94-d4a19ed88ade', repo_id: repo, filename,
    revision, expected_size: 2097152, sha256: 'f'.repeat(64),
    status: phase, received_bytes: phase === 'completed' ? 2097152 : 524288,
    error: null, created_at: 1, updated_at: 2,
  });
  await page.route('**/api/v1/images/checkpoints/installed', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      models: installed ? [{ repo_id: repo, filename, revision, size_bytes: 2097152,
        checkpoint_name: checkpointName }] : [],
      model_dir: '/tmp/models/comfyui/checkpoints',
      config_path: '/tmp/models/comfyui/noble_extra_model_paths.yaml',
      comfyui_argument: ['--extra-model-paths-config', '/tmp/models/comfyui/noble_extra_model_paths.yaml'],
      requires_runtime_restart: true,
    }),
  }));
  await page.route('**/api/v1/images/checkpoints/downloads', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      downloads: started ? [job()] : [],
    }),
  }));
  await page.route('**/api/v1/images/checkpoints/lookup**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      repo_id: repo, revision, license: 'openrail', note: 'SHA256 required',
      models: [{filename, size_bytes: 2097152, sha256: 'f'.repeat(64),
        installed, model_card: 'https://huggingface.co/artist/fantasy-checkpoint'}],
    }),
  }));
  await page.route('**/api/v1/images/checkpoints/install', async route => {
    installs++; started = true; phase = 'queued';
    await route.fulfill({ status: 202, contentType: 'application/json',
      body: JSON.stringify(job()) });
  });
  await page.route('**/api/v1/images/checkpoints/downloads/*/*', async route => {
    const action = route.request().url().split('/').pop();
    if (action === 'pause') phase = 'paused';
    if (action === 'resume') phase = 'downloading';
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(job()) });
  });
  await page.route('**/api/v1/images/status', async route => {
    statusChecks++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ online: true, provider: 'comfyui',
        checkpoints: installed ? [checkpointName] : [], error: null }) });
  });

  await page.goto('/#/configuracion/images');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Checkpoints desde Noble AI' })).toBeVisible();
  expect(installs).toBe(0);
  expect(statusChecks).toBe(0);
  await page.getByLabel('Repositorio de checkpoint').fill(repo);
  await page.getByRole('button', { name: 'Buscar archivos del checkpoint' }).click();
  await expect(page.getByText(filename).first()).toBeVisible();
  expect(installs).toBe(0);

  await page.getByRole('button', { name: 'Instalar checkpoint' }).click();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect(installs).toBe(1);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reanudar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();

  phase = 'completed'; installed = true;
  await page.getByRole('button', { name: 'Actualizar descargas de imágenes' }).click();
  await expect(page.getByText('ComfyUI aún no lo reconoce')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pendiente de ComfyUI' })).toBeDisabled();
  await page.getByRole('button', { name: 'Buscar checkpoints', exact: true }).click();
  await expect(page.getByText('Detectado en ComfyUI')).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar checkpoint' }).click();
  await expect(page.getByLabel('Checkpoint')).toHaveValue(checkpointName);
  await page.getByRole('button', { name: 'Guardar ajustes de imagen' }).click();
  await expect.poll(async () =>
    (await (await page.request.get('/api/v1/images/config')).json()).checkpoint)
    .toBe(checkpointName);
  expect(installs).toBe(1);

  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-checkpoint-installer.png', fullPage: true });
});
