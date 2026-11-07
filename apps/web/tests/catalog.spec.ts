import { expect, test } from '@playwright/test';

const examples = [
  { repo_id: 'demo/Qwen3-8B-GGUF', revision: 'a'.repeat(40), description: 'text-generation',
    downloads: 320000, likes: 500, gated: false, license: 'apache-2.0', role: 'narrator' },
  { repo_id: 'demo/Gemma-4-GGUF', revision: 'b'.repeat(40), description: 'text-generation',
    downloads: 145000, likes: 350, gated: false, license: 'apache-2.0', role: 'narrator' },
  { repo_id: 'demo/Mistral-7B-GGUF', revision: 'c'.repeat(40), description: 'text-generation',
    downloads: 102000, likes: 150, gated: false, license: 'apache-2.0', role: 'narrator' },
];

test('catalog cards and GGUF detail drawer (visual fixture, real UI)', async ({ page }) => {
  await page.route('**/api/v1/models/search?**', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ source: 'visual-qa-fixture', query: 'Qwen', role: 'narrator',
      cached_seconds: 0, installation_supported: true, results: examples }),
  }));
  let detailRequests = 0;
  await page.route('**/api/v1/models/demo/Qwen3-8B-GGUF', async route => {
    detailRequests += 1;
    await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ repo_id: 'demo/Qwen3-8B-GGUF', revision: 'a'.repeat(40),
      license: 'apache-2.0', gated: false, supports_install: true,
      url: 'https://huggingface.co/demo/Qwen3-8B-GGUF',
      summary:'Narrator local de prueba',
      variants: [
        { filename: 'Qwen3-8B-Q4_K_M.gguf', size_bytes: 5368709120,
          sha256: 'f'.repeat(64), supported: true },
        { filename: 'Qwen3-8B-Q8_0.gguf', size_bytes: 9663676416,
          sha256: 'a'.repeat(64), supported: true },
        { filename: 'Qwen3-8B-Q2_K.gguf', size_bytes: 3221225472,
          sha256: 'b'.repeat(64), supported: true },
      ],
      hardware_fit: {
        context_tokens:4096,
        gpu:{index:0,name:'NVIDIA GPU (fixture)',backend:'cuda',
          vram_total_mb:16384,vram_free_mb:12000,driver:'demo'},
        vram_usable_bytes:11534336000,ram_usable_bytes:17179869184,
        metadata_source:'gguf_header',architecture:'qwen3',parameter_count:8000000000,
        confidence:'measured_capacity_estimated_demand',
        warning:'Estimación del hardware, no benchmark.',
        recommended_filename:'Qwen3-8B-Q8_0.gguf',
        variants:[
          {filename:'Qwen3-8B-Q4_K_M.gguf',quantization:'Q4_K_M',fit:'full_gpu',
            estimated_required_bytes:6657199308,estimated_kv_bytes:536870912,
            gpu_share:1,disk_ok:true,note:'Cabe según la estimación.'},
          {filename:'Qwen3-8B-Q8_0.gguf',quantization:'Q8_0',fit:'full_gpu',
            estimated_required_bytes:10952166604,estimated_kv_bytes:536870912,
            gpu_share:1,disk_ok:true,note:'Cabe según la estimación.'},
          {filename:'Qwen3-8B-Q2_K.gguf',quantization:'Q2_K',fit:'cpu',
            estimated_required_bytes:3758096384,estimated_kv_bytes:536870912,
            gpu_share:0,disk_ok:true,note:'CPU only en el ejemplo.'},
        ],
      } }),
    });
  });
  await page.route(/\/api\/v1\/model-cards\/demo\/Qwen3-8B-GGUF\?/, async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      readme: '# Modelo de ejemplo\\n<script>window.badCode=1</script>',
      available: true, truncated: false,
    }),
  }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continue al Model Hub/ }).click();
  }
  await expect(page.getByText('Qwen3-8B-GGUF')).toBeVisible();
  await expect(page.getByText('Gemma-4-GGUF')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-catalog-cards.png', fullPage: true });
  await page.getByRole('button', { name: /Qwen3-8B-GGUF/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Model details' });
  await expect(dialog).toBeVisible();
  if (test.info().project.name === 'desktop') {
    await expect(page.locator('.app-shell')).toHaveClass(/model-inspector-active/);
    await expect(dialog).toHaveAttribute('aria-modal', 'false');
  } else {
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
  }
  await expect(page.getByText('Qwen3-8B-Q4_K_M.gguf')).toBeVisible();
  await expect(page.getByText(/Cuantización sugerida: Qwen3-8B-Q8_0.gguf/)).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Relación de demanda y memoria utilizable' })).toBeVisible();
  await page.getByRole('button', { name: 'CPU', exact: true }).click();
  await expect(page.getByText('Qwen3-8B-Q2_K.gguf')).toBeVisible();
  await expect(page.getByText('Qwen3-8B-Q4_K_M.gguf')).toBeHidden();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: /Qwen3-8B-Q8_0.gguf/ }).click();
  await expect(page.getByText('Variante seleccionada: Q8_0')).toBeVisible();
  await page.getByRole('button', { name: 'Read full model card' }).click();
  const modelReadme = page.locator('.hub-model-readme');
  await expect(modelReadme).toContainText('Modelo de ejemplo');
  await expect(modelReadme).toContainText('<script>window.badCode=1</script>');
  await expect(page.locator('script').filter({ hasText: 'window.badCode=1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide model card' }).click();
  await expect(modelReadme).toHaveCount(0);
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-catalog-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /Qwen3-8B-GGUF/ }).click();
  await expect(dialog).toBeVisible();
  expect(detailRequests).toBe(1); // Session cache avoids a repeated metadata request.

});
