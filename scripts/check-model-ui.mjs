import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001';
const response=await fetch(`${base}/api/reference`);assert.ok(response.ok);const s=await response.json();
assert.equal(s.organizations.length,2);assert.ok(s.users.every(u=>u.role==='courier'));
for(const d of s.deliveries){assert.equal(typeof d.priority,'number');assert.ok(d.businessName);assert.ok(s.businesses.some(b=>b.id===d.businessId));assert.ok(s.vehicles.some(v=>v.id===d.vehicleId));assert.ok(!('quantity' in d)&&!('mustFollowDeliveryId' in d));}
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(base);await page.getByRole('heading',{name:'Dostawy w rytmie miasta.'}).waitFor();assert.equal(await page.locator('.role-card').count(),6);assert.equal(await page.getByText('Kurier samodzielny',{exact:true}).count(),0);
  await page.screenshot({path:'docs/screenshots/roles.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('role','independent'));await page.goto(`${base}/independent/next`);await page.waitForURL(`${base}/`);await page.getByRole('heading',{name:'Dostawy w rytmie miasta.'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('role')),null);
  await page.locator('nav button').filter({hasText:'Kurier firmowy'}).click();await page.getByRole('heading',{name:'Twoja trasa'}).waitFor();assert.deepEqual(errors,[]);
  console.log('MODEL UI OK: 6 ról, stara rola/usunięty adres niedostępne, dane dostaw poprawne; bez resetu bazy.');
}finally{await browser.close();}
