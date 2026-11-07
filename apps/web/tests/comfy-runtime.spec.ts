import { expect, test } from '@playwright/test';

test('managed ComfyUI remains opt-in and gives distinct control from image and voice settings', async ({ page }) => {
  let launches = 0;
  let validations = 0;
  let stopping = 0;
  let saved = {
    install_dir: '', python_executable: '', port: 8188,
    memory_mode: 'auto',
  };
  let process = {
    status: 'stopped', owns_process: false,
    base_url: 'http://127.0.0.1:8188', pid: null as number | null,
    exit_code: null as number | null, diagnostics: null as null | object,
  };
  await page.route('**/api/v1/images/runtime/config', async route => {
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: saved });
  });
  await page.route('**/api/v1/images/runtime/validate', async route => {
    validations++;
    const cfg = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: {
      valid: true, install_dir: cfg.install_dir, python_executable: cfg.python_executable,
      model_paths_config: '/noble/models/comfyui/noble_extra_model_paths.yaml',
      base_url: 'http://127.0.0.1:' + cfg.port, memory_mode: cfg.memory_mode,
    }});
  });
  await page.route('**/api/v1/images/runtime/status', route =>
    route.fulfill({ status: 200, json: process }));
  await page.route('**/api/v1/images/runtime/start', async route => {
    launches++;
    process = {
      status: 'ready', owns_process: true, base_url: 'http://127.0.0.1:19080',
      pid: 12345, exit_code: null,
      diagnostics: {comfyui_version: 'mock-0.4', python_version: '3.11',
        devices: [{name: 'mock GPU', type: 'cuda'}]},
    };
    await route.fulfill({ status: 200, json: process });
  });
  await page.route('**/api/v1/images/runtime/stop', async route => {
    stopping++;
    process = {
      status: 'stopped', owns_process: false, base_url: 'http://127.0.0.1:19080',
      pid: null, exit_code: null, diagnostics: null,
    };
    await route.fulfill({ status: 200, json: process });
  });
  await page.route('**/api/v1/images/runtime/logs', route =>
    route.fulfill({ status: 200, json: {
      text: 'ComfyUI launched on 127.0.0.1:19080', truncated: false,
    }}));

  await page.goto('/#/configuracion/images');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue al Model Hub/ }).click();
  }
  const panel = page.locator('.comfy-runtime-panel');
  await expect(panel.getByRole('heading', { name: 'Ejecutar ComfyUI desde Noble AI' })).toBeVisible();
  expect(launches).toBe(0);
  expect(validations).toBe(0);
  expect(stopping).toBe(0);
  await expect(panel.getByRole('button', { name: 'Iniciar ComfyUI' })).toBeDisabled();
  await panel.getByLabel('Carpeta local de ComfyUI').fill('/home/test/ComfyUI');
  await panel.getByLabel('Python para ComfyUI').fill('/home/test/venv/bin/python');
  await panel.getByLabel('Puerto de ComfyUI').fill('19080');
  await panel.getByLabel('Perfil de VRAM ComfyUI').selectOption('lowvram');
  await expect(panel.getByText('Hay cambios sin guardar')).toBeVisible();
  await panel.getByRole('button', { name: 'Validate installation' }).click();
  await expect(panel.getByText('Instalación ComfyUI y ejecutable Python verificados.')).toBeVisible();
  expect(validations).toBe(1);
  expect(launches).toBe(0);
  await panel.getByRole('button', { name: 'Guardar arranque de ComfyUI' }).click();
  await expect(panel.getByText('Settings de ComfyUI guardada.')).toBeVisible();
  await panel.getByRole('button', { name: 'Iniciar ComfyUI' }).click();
  await expect(panel.getByText('Ready', { exact: true })).toBeVisible();
  await expect(panel.getByText('mock GPU', { exact: false })).toBeVisible();
  await expect(page.getByLabel('ComfyUI local')).toHaveValue('http://127.0.0.1:19080');
  expect(launches).toBe(1);
  await expect(panel.getByRole('button', { name: 'Guardar arranque de ComfyUI' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Ver registros ComfyUI' }).click();
  await expect(panel.getByText('ComfyUI launched on 127.0.0.1:19080')).toBeVisible();
  await panel.getByRole('button', { name: 'Stop ComfyUI' }).click();
  await expect(panel.getByText('Detenido', { exact: true })).toBeVisible();
  expect(stopping).toBe(1);
  await page.reload();
  await expect(panel.getByLabel('Puerto de ComfyUI')).toHaveValue('19080');
  await expect(panel.getByLabel('Perfil de VRAM ComfyUI')).toHaveValue('lowvram');
  expect(launches).toBe(1);
  await page.getByRole('button', { name: 'Voz / TTS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Voz / TTS' })).toBeVisible();
  await expect(panel).toHaveCount(0);
  expect(stopping).toBe(1);
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-managed-comfy-runtime.png', fullPage: true });
});
