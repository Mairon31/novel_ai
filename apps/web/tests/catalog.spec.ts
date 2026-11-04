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
  await page.route('**/api/v1/models/demo/Qwen3-8B-GGUF', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ repo_id: 'demo/Qwen3-8B-GGUF', revision: 'a'.repeat(40),
      license: 'apache-2.0', gated: false, supports_install: true,
      url: 'https://huggingface.co/demo/Qwen3-8B-GGUF',
      variants: [{ filename: 'Qwen3-8B-Q4_K_M.gguf', size_bytes: 5368709120,
        sha256: 'f'.repeat(64), supported: true }] }),
  }));
  await page.goto('/');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  await expect(page.getByText('Qwen3-8B-GGUF')).toBeVisible();
  await expect(page.getByText('Gemma-4-GGUF')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-catalog-cards.png', fullPage: true });
  await page.getByRole('button', { name: /Qwen3-8B-GGUF/ }).click();
  await expect(page.getByRole('dialog', { name: 'Detalles del modelo' })).toBeVisible();
  await expect(page.getByText('Qwen3-8B-Q4_K_M.gguf')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-catalog-detail.png', fullPage: true });
});
