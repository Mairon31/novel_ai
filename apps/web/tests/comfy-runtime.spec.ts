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
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  const panel = page.locator('.comfy-runtime-panel');
  await expect(panel.getByRole('heading', { name: 'Run ComfyUI from Noble AI' })).toBeVisible();
  expect(launches).toBe(0);
  expect(validations).toBe(0);
  expect(stopping).toBe(0);
  await expect(panel.getByRole('button', { name: 'Start ComfyUI' })).toBeDisabled();
  await panel.getByLabel('Local ComfyUI directory').fill('/home/test/ComfyUI');
  await panel.getByLabel('ComfyUI Python').fill('/home/test/venv/bin/python');
  await panel.getByLabel('ComfyUI port').fill('19080');
  await panel.getByLabel('ComfyUI VRAM profile').selectOption('lowvram');
  await expect(panel.getByText('Unsaved changes')).toBeVisible();
  await panel.getByRole('button', { name: 'Validate installation' }).click();
  await expect(panel.getByText('ComfyUI installation and Python executable verified.')).toBeVisible();
  expect(validations).toBe(1);
  expect(launches).toBe(0);
  await panel.getByRole('button', { name: 'Save ComfyUI launch' }).click();
  await expect(panel.getByText('ComfyUI settings saved.')).toBeVisible();
  await panel.getByRole('button', { name: 'Start ComfyUI' }).click();
  await expect(panel.getByText('Ready', { exact: true })).toBeVisible();
  await expect(panel.getByText('mock GPU', { exact: false })).toBeVisible();
  await expect(page.getByLabel('ComfyUI local')).toHaveValue('http://127.0.0.1:19080');
  expect(launches).toBe(1);
  await expect(panel.getByRole('button', { name: 'Save ComfyUI launch' })).toBeDisabled();
  await panel.getByRole('button', { name: 'View ComfyUI logs' }).click();
  await expect(panel.getByText('ComfyUI launched on 127.0.0.1:19080')).toBeVisible();
  await panel.getByRole('button', { name: 'Stop ComfyUI' }).click();
  await expect(panel.getByText('Stopped', { exact: true })).toBeVisible();
  expect(stopping).toBe(1);
  await page.reload();
  await expect(panel.getByLabel('ComfyUI port')).toHaveValue('19080');
  await expect(panel.getByLabel('ComfyUI VRAM profile')).toHaveValue('lowvram');
  expect(launches).toBe(1);
  await page.getByRole('button', { name: 'Voice / TTS', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Voice / TTS' })).toBeVisible();
  await expect(panel).toHaveCount(0);
  expect(stopping).toBe(1);
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-managed-comfy-runtime.png', fullPage: true });
});
