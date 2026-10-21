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

test('missing file can be removed from its overlay', async () => {
  await app.close();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vodsync-e2e-'));
  fs.writeFileSync(path.join(userData, 'session.json'),
    JSON.stringify({ videos: [{ path: path.join(userData, 'gone.mp4'), name: 'gone.mp4' }] }));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  win = await app.firstWindow();
  const overlay = win.locator('.missing-overlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('button.danger').click();
  await expect(win.locator('.tile')).toHaveCount(0);
});

test('spotlight layout: toggle, keys switch, audio follows', async () => {
  await app.close();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vodsync-e2e-'));
  const videos = ['a', 'b', 'c'].map((n) => ({ path: path.join(userData, n + '.mp4'), name: n }));
  fs.writeFileSync(path.join(userData, 'session.json'), JSON.stringify({ videos }));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  win = await app.firstWindow();
  const tiles = win.locator('.tile');
  await expect(tiles).toHaveCount(3);
  const muted = () => win.evaluate(() => [...document.querySelectorAll('.tile video')].map((v) => v.muted));

  const slots = () => win.evaluate(() => [...document.querySelectorAll('.tile')]
    .map((t) => (t.classList.contains('featured') ? 'A' : t.classList.contains('featured2') ? 'B' : '-')).join(''));

  await win.locator('#layout').selectOption('spot');
  await expect(win.locator('#grid')).toHaveClass(/spotlight/);
  expect(await slots()).toBe('A--');
  expect(await muted()).toEqual([false, true, true]);

  await win.keyboard.press('3');
  expect(await slots()).toBe('--A');
  expect(await muted()).toEqual([true, true, false]);

  await win.keyboard.press('Shift+Digit1');
  await expect(win.locator('#layout')).toHaveValue('dual');
  expect(await slots()).toBe('B-A');
  expect(await muted()).toEqual([true, true, false]);

  await tiles.nth(1).locator('.slot-B').dispatchEvent('click');
  expect(await slots()).toBe('-BA');
  await tiles.nth(0).locator('.slot-A').dispatchEvent('click');
  expect(await slots()).toBe('AB-');
  expect(await muted()).toEqual([false, true, true]);

  // Dragging the horizontal splitter shrinks the big row.
  const before = (await tiles.nth(0).boundingBox()).height;
  const h = await win.locator('#splitH').boundingBox();
  await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await win.mouse.down();
  await win.mouse.move(h.x + h.width / 2, h.y - 100, { steps: 5 });
  await win.mouse.up();
  expect((await tiles.nth(0).boundingBox()).height).toBeLessThan(before - 50);

  await win.locator('#layout').selectOption('grid');
  await expect(win.locator('#grid')).not.toHaveClass(/spotlight/);
});
