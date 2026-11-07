import { expect, test } from '@playwright/test';

test('setup, model browser, downloads and diagnostics in the real UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const wizard = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await wizard.isVisible()) {
    await expect(wizard.getByText('Your story studio starts here.')).toBeVisible();
    await wizard.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await expect(wizard).toBeHidden();
  }
  await expect(page.getByRole('heading', { name: /Model Hub/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search models' })).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-model-hub.png', fullPage: true });

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Downloads', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Downloads/ })).toBeVisible();
  await expect(page.getByText('No downloads yet')).toBeVisible();

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your workspace, your way' }))
    .toBeVisible();
  await page.locator('.workspace-overview-card').filter({ hasText: 'Narrative engine' }).click();
  await expect(page.locator('.setting-section-intro h2', { hasText: 'Narrative engine' })).toBeVisible();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('.workspace-overview-card')).toHaveCount(11);
  await page.getByRole('button', { name: 'About Noble AI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About Noble AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Updates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeVisible();

  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await expect(page.getByRole('heading', { name: /Diagnostics/ })).toBeVisible();
  await expect(page.getByText('BACKEND STATUS')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name + '-diagnostico.png', fullPage: true });
});
