import { expect, test } from '@playwright/test';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const address = 'https://private-gpu.trycloudflare.com';
const name = 'Google Colab T4 (fixture)';

test('register, test, activate and remove a GPU worker from settings (mock protocol)', async ({ page }) => {
  let workerExists = false;
  const requests: string[] = [];
  await page.route('**/api/v1/workers', async route => {
    requests.push(route.request().method() + ' /workers');
    if (route.request().method() === 'POST') {
      const packet = route.request().postDataJSON() as { name: string; url: string; token: string };
      expect(packet).toEqual({ name, url: address, token: 'a-long-fixture-bearer-secret' });
      workerExists = true;
      return route.fulfill({ status: 201, json: {
        id, name, url: address, role: 'llm', created_at: 1793810000,
      } });
    }
    return route.fulfill({ status: 200, json: {
      supported_role: 'llm',
      workers: workerExists ? [{ id, name, url: address, role: 'llm', created_at: 1793810000 }] : [],
    } });
  });
  await page.route('**/api/v1/workers/*/probe', async route => {
    requests.push('GET /probe');
    await route.fulfill({ status: 200, json: { id, online: true,
      models: ['fixture-gguf:4b'], role: 'llm', latency_ms: 231.5,
      health: {
        engine_status: 'ready', active_requests: 0, completed_requests: 3,
        failed_requests: 0, last_ttft_ms: 175.2, avg_ttft_ms: 170.5,
        avg_duration_ms: 1200,
        gpu: [{ index: 0, name: 'NVIDIA T4 fixture', vram_total_mb: 15360,
          vram_used_mb: 4100, utilization_percent: 45 }],
      },
    } });
  });
  await page.route('**/api/v1/workers/*/benchmark', async route => {
    requests.push('POST /benchmark');
    expect(route.request().postDataJSON()).toEqual({ model: 'fixture-gguf:4b' });
    await route.fulfill({ status: 200, json: {
      success: true, model: 'fixture-gguf:4b',
      ttft_ms: 220.5, duration_ms: 940, output_characters: 87,
    } });
  });
  await page.route('**/api/v1/workers/*/activate', async route => {
    requests.push('POST /activate');
    expect(route.request().postDataJSON()).toEqual({ model: 'fixture-gguf:4b' });
    await route.fulfill({ status: 200, json: {
      provider: 'worker', worker_id: id, base_url: address, model: 'fixture-gguf:4b',
      temperature: .7, top_p: .9, max_tokens: 450, num_ctx: 4096,
      device: 'auto', top_k: 40, repetition_penalty: 1, reasoning_mode: 'auto',
    } });
  });
  await page.route('**/api/v1/workers/*', async route => {
    if (route.request().method() === 'DELETE') {
      requests.push('DELETE /worker');
      workerExists = false;
      return route.fulfill({ status: 204, body: '' });
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    await expect(setup).toBeHidden();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Red y workers' }).click();
  await expect(page.getByRole('heading', { name: 'Workers GPU remotos' })).toBeVisible();
  await page.getByLabel('Nombre del worker').fill(name);
  await page.getByLabel('URL del worker').fill(address);
  await page.getByLabel('Token del worker').fill('a-long-fixture-bearer-secret');
  await page.getByRole('button', { name: 'Registrar worker' }).click();
  await expect(page.getByText('Worker registrado. Comprueba su conexión antes de activarlo.')).toBeVisible();
  await expect(page.getByLabel('Token del worker')).toHaveValue('');
  await page.getByRole('button', { name: 'Probar conexión' }).click();
  await expect(page.getByText('Worker disponible y autenticado')).toBeVisible();
  await expect(page.getByLabel('Modelo remoto')).toHaveValue('fixture-gguf:4b');
  await expect(page.getByText('NVIDIA T4 fixture')).toBeVisible();
  await expect(page.getByText('VRAM 4100 / 15360 MB · GPU 45%')).toBeVisible();
  await page.getByRole('button', { name: 'Medir respuesta real' }).click();
  await expect(page.getByText('Prueba de generación completada')).toBeVisible();
  await expect(page.getByText('Primer texto: 221 ms')).toBeVisible();
  await page.getByRole('button', { name: 'Usar modelo remoto como narrador' }).click();
  await expect(page.getByText(/Narrador remoto activado: fixture-gguf:4b/)).toBeVisible();

  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-remote-workers.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Quitar' }).click();
  await expect(page.getByText('Worker eliminado. Su token guardado fue retirado.')).toBeVisible();
  expect(requests).toContain('GET /probe');
  expect(requests).toContain('POST /activate');
  expect(requests).toContain('POST /benchmark');
  expect(requests).toContain('DELETE /worker');
});
