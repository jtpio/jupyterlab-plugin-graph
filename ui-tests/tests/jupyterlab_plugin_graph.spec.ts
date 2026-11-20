import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

/**
 * Open the graph from the command palette.
 */
async function openGraph(page: IJupyterLabPageFixture): Promise<void> {
  await page.menu.clickMenuItem('View>Activate Command Palette');
  await page.keyboard.type('Plugin Dependency Graph');
  await page
    .locator('.lm-CommandPalette-item', { hasText: 'Plugin Dependency Graph' })
    .click();
  await expect(page.locator('.jp-PluginGraph canvas')).toBeVisible();
}

/**
 * Take a screenshot of the graph when its transitions are complete.
 */
async function settledScreenshot(canvas: Locator): Promise<Buffer> {
  let previous = await canvas.screenshot();
  await expect
    .poll(async () => {
      const current = await canvas.screenshot();
      const settled = current.equals(previous);
      previous = current;
      return settled;
    })
    .toBe(true);
  return previous;
}

test('should show the dependency graph of the plugins', async ({ page }) => {
  await openGraph(page);

  expect(await page.activity.isTabActive('Plugin Graph')).toBe(true);
  const counts = page.locator('.jp-PluginGraph-counts');
  await expect(counts).toHaveText(/^\d{3,} plugins · \d{3,} connections$/);

  // The plugin of this extension uses four services.
  await page
    .getByPlaceholder('Filter plugins')
    .fill('jupyterlab-plugin-graph:plugin');
  await expect(counts).toHaveText('5 plugins · 4 connections');

  await page.getByLabel('Optional').uncheck();
  await expect(counts).toHaveText('2 plugins · 1 connection');

  const layout = page.getByLabel('Layout');
  await layout.selectOption('Circular layout');
  await expect(layout).toHaveValue('circular');
  await expect(counts).toHaveText('2 plugins · 1 connection');
});

test('should open the graph from the Help menu', async ({ page }) => {
  await page.menu.clickMenuItem('Help>Plugin Dependency Graph');

  await expect(page.locator('.jp-PluginGraph canvas')).toBeVisible();
  expect(await page.activity.isTabActive('Plugin Graph')).toBe(true);
});

test('should zoom with the toolbar buttons', async ({ page }) => {
  await openGraph(page);

  const canvas = page.locator('.jp-PluginGraph canvas');
  const initial = await settledScreenshot(canvas);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomedIn = await settledScreenshot(canvas);
  expect(zoomedIn.equals(initial)).toBe(false);

  await page.getByRole('button', { name: 'Zoom out' }).click();
  const zoomedOut = await settledScreenshot(canvas);
  expect(zoomedOut.equals(zoomedIn)).toBe(false);
});

test('should pan the graph from an empty area', async ({ page }) => {
  await openGraph(page);

  const canvas = page.locator('.jp-PluginGraph canvas');
  const initial = await settledScreenshot(canvas);

  // The bottom right corner is outside the bounds of the nodes.
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width - 30;
  const y = box.y + box.height - 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y - 150, { steps: 10 });
  await page.mouse.up();

  const moved = await settledScreenshot(canvas);
  expect(moved.equals(initial)).toBe(false);
});
