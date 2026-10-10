const { test, expect, _electron: electron } = require('@playwright/test');
const os = require('os');
const path = require('path');
const fs = require('fs');

let app;
let win;

test.beforeEach(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vodsync-e2e-'));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('launches with the expected toolbar and helpers', async () => {
  await expect(win.locator('#add')).toBeVisible();
  await expect(win.locator('#addUrl')).toBeVisible();
  await expect(win.locator('#toggleLibrary')).toBeVisible();
  await expect(win.locator('#lang')).toBeVisible();
  await expect(win.locator('#timeline')).toHaveCount(1);
  expect(await win.locator('#lang option').count()).toBeGreaterThan(0);
  expect(await win.evaluate(() => typeof window.VodUtil)).toBe('object');
});

test('library panel toggles', async () => {
  await expect(win.locator('#libraryPanel')).toBeHidden();
  await win.locator('#toggleLibrary').click();
  await expect(win.locator('#libraryPanel')).toBeVisible();
});

test('URL panel toggles', async () => {
  await expect(win.locator('#urlPanel')).toBeHidden();
  await win.locator('#addUrl').click();
  await expect(win.locator('#urlPanel')).toBeVisible();
  await expect(win.locator('#urls')).toBeVisible();
});
