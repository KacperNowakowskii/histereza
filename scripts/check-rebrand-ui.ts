import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Read-only verification: no actions or writes to application data.
const base = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const before = await (await page.request.get(`${base}/api/reference`)).json();
  await mkdir('docs/screenshots/rebrand', { recursive: true });
  for (const path of ['/', '/dispatcher', '/dispatcher/businesses', '/dispatcher/fleet', '/courier', '/business', '/public', '/operator', '/sim', '/bay/bay1', '/qr/bay1']) {
    await page.goto(base + path);
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.brand .brand-logo')).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll<HTMLImageElement>('.brand-logo')].map(img => img.decode()));
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400); // Let existing Leaflet zoom/layout animation settle.
      const ui = await page.evaluate(() => ({
        primary: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim(),
        background: getComputedStyle(document.documentElement).backgroundColor,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        images: [...document.querySelectorAll<HTMLImageElement>('.brand-logo')].map(img => ({
          loaded: img.complete && img.naturalWidth > 0,
          ratio: img.getBoundingClientRect().width / img.getBoundingClientRect().height,
          original: img.naturalWidth / img.naturalHeight,
        })),
      }));
      assert.equal(ui.primary, '#0a0f47');
      assert.equal(ui.accent, '#eb493a');
      assert.equal(ui.background, 'rgb(244, 233, 225)');
      assert.equal(ui.overflow, false, `Overflow on ${path} at ${width}px`);
      ui.images.forEach(img => { assert.ok(img.loaded); assert.ok(Math.abs(img.ratio / img.original - 1) < .01, `Distorted logo on ${path}`); });
      if (['/', '/dispatcher', '/courier', '/sim'].includes(path)) await page.screenshot({ path: `docs/screenshots/rebrand/${path === '/' ? 'home' : path.slice(1)}-${width}.png`, fullPage: true });
    }
  }
  await page.goto(`${base}/courier`);
  await page.getByLabel('Kurier firmowy').selectOption('courier2');
  await expect(page.locator('.route-point.current')).toBeVisible();
  await page.waitForTimeout(500);
  const route = await page.evaluate(() => ({
    current: getComputedStyle(document.querySelector('.route-point.current')!).borderTopColor,
    markers: [...document.querySelectorAll('.courier-route-map path.leaflet-interactive')].flatMap(p => [getComputedStyle(p).stroke, getComputedStyle(p).fill]),
  }));
  assert.equal(route.current, 'rgb(235, 73, 58)');
  assert.ok(route.markers.includes('rgb(235, 73, 58)'));
  assert.ok(route.markers.includes('rgb(10, 15, 71)'));
  const after = await (await page.request.get(`${base}/api/reference`)).json();
  assert.deepEqual(after, before, 'Read-only UI review changed application data');
  assert.deepEqual(errors, []);
  console.log('REBRAND UI OK: 11 screens, desktop/mobile, original logo proportions, central palette, Leaflet colours, application data unchanged.');
} finally {
  await browser.close();
}
