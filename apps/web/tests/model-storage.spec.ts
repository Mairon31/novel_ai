import { expect, test } from '@playwright/test';

const gib = 1024 ** 3;
test('installed Model Hub reports real disk usage, partials and absent files', async ({ page }) => {
  await page.route('**/api/v1/models/installed', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ models: [
      { id:'a-model',repo_id:'demo/model-A',revision:'a'.repeat(40),
        filename:'Model-A-Q4_K_M.gguf',size_bytes:5*gib,sha256:'a'.repeat(64),
        integrity_status:'sha256_verified',filepath:'/models/Model-A-Q4_K_M.gguf',
        created_at:1700000000 },
      { id:'missing-model',repo_id:'demo/model-B',revision:'b'.repeat(40),
        filename:'Missing.gguf',size_bytes:6*gib,sha256:'b'.repeat(64),
        integrity_status:'local_hash',filepath:'/models/Missing.gguf',
        created_at:1700000000 },
    ] }),
  }));
  await page.route('**/api/v1/models/storage', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      models_dir:'/fixture/noble/models',
      disk:{total_bytes:200*gib,used_bytes:55*gib,free_bytes:145*gib},
      installed:{count:2,bytes:5*gib},
      partial:{count:1,bytes:64*1024*1024},
      items:[
        { id:'a-model',name:'Model-A-Q4_K_M.gguf',kind:'installed',
          repo_id:'demo/model-A',size_bytes:5*gib,file_present:true },
        { id:'missing-model',name:'Missing.gguf',kind:'installed',
          repo_id:'demo/model-B',size_bytes:0,file_present:false },
        { id:'partial-1',name:'C-Q6.gguf',kind:'partial',
          repo_id:'demo/model-C',size_bytes:64*1024*1024,file_present:true },
      ],observed_at:1700000000,scope:'registered_and_partial_files_only',
    }),
  }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const wizard = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await wizard.isVisible())
    await wizard.getByRole('button', { name: /Continuar al Model Hub/ }).click();

  await page.getByRole('tab', { name: /Installed/ }).click();
  const storage = page.getByRole('region', { name: 'Model storage' });
  await expect(storage).toBeVisible();
  await expect(storage.getByText('Model storage')).toBeVisible();
  const metrics = storage.locator('.hub-storage-metrics > div');
  await expect(metrics.nth(0).getByText('5.0 GB', { exact: true })).toBeVisible();
  await expect(metrics.nth(1).getByText('64.0 MB', { exact: true })).toBeVisible();
  await expect(metrics.nth(2).getByText('145.0 GB', { exact: true })).toBeVisible();
  await expect(storage.getByRole('meter', {name:'Space occupied by Noble AI files'}))
    .toHaveAttribute('aria-valuenow','3');

  await storage.getByText('View counted files (3)').click();
  await expect(storage.getByText('Missing.gguf · No encontrado')).toBeVisible();
  await expect(page.getByText('Archivo no encontrado: revisa la instalación.')).toBeVisible();
  const missing = page.locator('.installed-row').filter({hasText:'Missing.gguf'});
  await expect(missing.getByRole('button', {name:'Choose narrator'})).toBeDisabled();
  const installed = page.locator('.installed-row').filter({hasText:'Model-A-Q4_K_M.gguf'});
  await expect(installed.getByRole('button', {name:'Choose narrator'})).toBeEnabled();
  await page.screenshot({
    path:'test-results/'+test.info().project.name+'-models-storage.png',
    fullPage:true,
  });
});
