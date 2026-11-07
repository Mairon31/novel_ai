import { expect, test } from '@playwright/test';

test('Downloads displays reconciled files and non-destructive startup conflicts', async ({ page }) => {
  await page.route('**/api/v1/downloads/recovery', async route => route.fulfill({
    status: 200,
    json: { recovered: 2, conflicts: 1, skipped: 3 },
  }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Downloads', exact: true }).click();
  const recovery = page.locator('.workspace-note[role="status"]');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('2 download(s) recovered after restart');
  await expect(recovery).toContainText('1 conflict(s) detected');
  await expect(recovery).toContainText('do not overwrite files');
  await expect(page.getByRole('heading', { name: /^Downloads/ })).toBeVisible();
});
