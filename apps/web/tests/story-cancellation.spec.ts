import { expect, test } from '@playwright/test';

test('Stop signals the backend for the exact story and request without committing a turn', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();

  const creator = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  await creator.getByLabel('Título').fill('Cancelación del narrador ' + test.info().project.name);
  await creator.getByLabel('Premisa del mundo').fill(
    'Una biblioteca encantada custodia manuscritos y puertas a mundos lejanos.'
  );
  await creator.getByRole('button', { name: 'Elegir protagonista' }).click();
  await creator.getByLabel('Nombre del protagonista').fill('Luna');
  await creator.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(creator).toBeHidden();

  let requestId = '';
  let storyId = '';
  let cancelledRequestId = '';
  let cancelledStoryId = '';
  let releaseBlockedGeneration: (() => void) | null = null;

  // Simulate an inference request which has not emitted any tokens.
  // Keep it waiting while the user clicks Stop; no GPU/model is used.
  await page.route('**/api/v1/stories/*/generate', async route => {
    const data = route.request().postDataJSON() as { request_id: string };
    requestId = data.request_id;
    storyId = new URL(route.request().url()).pathname.split('/')[4];
    await new Promise<void>(resolve => { releaseBlockedGeneration = resolve; });
    try {
      await route.abort('failed');
    } catch {
      // An aborted browser fetch may already have closed its intercepted route.
    }
  });

  await page.route('**/api/v1/stories/*/generate/*/cancel', async route => {
    const segments = new URL(route.request().url()).pathname.split('/');
    cancelledStoryId = segments[4];
    cancelledRequestId = segments[6];
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 200, json: {
      request_id: cancelledRequestId, cancel_requested: true,
    } });
  });

  await page.getByRole('textbox', { name: 'Tu intervención en la historia' })
    .fill('Inspecciono el libro que hay sobre la mesa.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Detener generación' })).toBeVisible();
  await expect.poll(() => requestId).toMatch(/^[a-f0-9-]{36}$/);

  await page.getByRole('button', { name: 'Detener generación' }).click();
  await expect.poll(() => cancelledRequestId).toBe(requestId);
  expect(cancelledStoryId).toBe(storyId);
  await expect(page.getByText(/Cancelación solicitada/)).toBeVisible();
  await expect(page.locator('.noble-reader-stream')).toHaveCount(0);
  releaseBlockedGeneration?.();

  const response = await page.request.get('/api/v1/stories/' + storyId + '/turns');
  expect(response.ok()).toBeTruthy();
  expect((await response.json() as { turns: unknown[] }).turns).toHaveLength(0);
});
