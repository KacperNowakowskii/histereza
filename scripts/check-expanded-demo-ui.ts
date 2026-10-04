import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001',browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await expect(page.locator('.hero-line')).toContainText('14 miejsc');await expect(page.locator('.hero-line')).toContainText('18 kurierów');
  await page.goto(`${base}/dispatcher`);await expect(page.getByLabel('Firma kurierska').locator('option')).toHaveCount(5);await page.getByLabel('Firma kurierska').selectOption('org5');
  await page.getByRole('link',{name:'Biznesy',exact:true}).click();await expect(page.getByLabel('Firma kurierska')).toHaveValue('org5');await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByRole('link',{name:'Flota',exact:true}).click();await expect(page.getByLabel('Firma kurierska')).toHaveValue('org5');await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.goto(`${base}/courier`);await expect(page.getByLabel('Kurier firmowy').locator('option')).toHaveCount(18);await page.getByLabel('Kurier firmowy').selectOption('courier2');await expect(page.getByRole('timer').first()).toBeVisible();await expect(page.locator('.route-point')).not.toHaveCount(0);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));assert.deepEqual(errors,[]);
  const s=await (await page.request.get(base+'/api/reference')).json();assert.equal(s.deliveries.length,198);assert.equal(s.routes.filter((r:{date:string})=>r.date>'2026-10-07').length,0);
  console.log('EXPANDED DEMO UI OK: actual 5 companies, 18 couriers, 14 bays, company selection persists, fleet/businesses, active unloading, mobile, no future routes.');
}finally{await browser.close();}
