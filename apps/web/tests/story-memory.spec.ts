import { expect, test } from '@playwright/test';

test('history inspector searches local story memory without model or GPU', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'New story' }).click();
  const creator = page.getByRole('dialog', { name: 'Create a new story' });
  const title = 'Índice de memoria ' + test.info().project.name;
  await creator.getByLabel('Title').fill(title);
  await creator.getByLabel('World premise').fill(
    'Una exploradora investiga leyendas de una ciudad antigua y olvidada.');
  await creator.getByRole('button', { name: 'Choose protagonist' }).click();
  await creator.getByLabel('Protagonist name').fill('Luna');
  await creator.getByRole('button', { name: 'Start story' }).click();
  await expect(creator).toBeHidden();

  await page.getByRole('button', { name: 'Open story details' }).click();
  const inspector = page.locator('.noble-reader-inspector.is-open');
  await inspector.getByRole('button', { name: 'History' }).click();
  await inspector.getByRole('textbox', { name: 'Search story memories' })
    .fill('medallón de cristal');
  await inspector.getByRole('button', { name: 'Search entire story' }).click();
  await expect(inspector.getByText('0 memories found')).toBeVisible();
  await expect(inspector.getByText('Player input only')).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-memory-search.png',
    fullPage: true,
  });
});
