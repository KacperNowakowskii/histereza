import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
for(const path of ['reset','demo']){const response=await fetch(`http://127.0.0.1:3001/api/sim/${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-role':'sim'},body:'{}'});assert.ok(response.ok);}
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:3001/');await page.getByRole('heading',{name:'Dostawy w rytmie miasta.'}).waitFor();
  await page.screenshot({path:'docs/screenshots/roles.png',fullPage:true});
  await page.locator('.role-card').filter({hasText:'Symulator'}).click();await page.getByRole('heading',{name:'Zegar i dane demo'}).waitFor();
  await page.screenshot({path:'docs/screenshots/simulator.png',fullPage:true});
  await page.locator('nav button').filter({hasText:'Kurier firmowy'}).click();await page.getByRole('heading',{name:'Przygotuj wyjazd'}).waitFor();
  await page.getByRole('button',{name:'Potwierdź pojazd',exact:true}).click();await page.getByRole('button',{name:'Potwierdzam załadunek',exact:true}).click();await page.getByRole('button',{name:'Wyjeżdżam →',exact:true}).click();await page.getByRole('button',{name:'Jadę →',exact:true}).waitFor();
  await page.screenshot({path:'docs/screenshots/courier.png',fullPage:true});
  await page.locator('nav button').filter({hasText:'Punkt odbioru'}).click();await page.getByRole('heading',{name:'Zapowiedziane dostawy'}).waitFor();assert.equal(await page.locator('textarea').count(),0);assert.equal(await page.getByRole('button',{name:/Importuj/}).count(),0);
  await page.locator('nav button').filter({hasText:'Operator miasta'}).click();await page.getByRole('button',{name:'Odśwież raport'}).click();await page.getByRole('heading',{name:'Licznik użycia · bez płatności w MVP'}).waitFor();await page.screenshot({path:'docs/screenshots/operator.png',fullPage:true});
  await page.goto('http://127.0.0.1:3001/qr/bay1');await page.getByRole('button',{name:'Rozpocznij krótki postój'}).waitFor();
  await page.goto('http://127.0.0.1:3001/bay/bay1');await page.getByAltText('Kod QR do strony postoju').waitFor();assert.equal(await page.getByRole('heading',{name:'Import dostaw',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:3001/courier');await page.getByRole('heading',{name:'Twoja trasa'}).waitFor();await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Poziomy overflow na telefonie');assert.deepEqual(errors,[]);
  console.log('BROWSER OK: role, cykl kuriera, biznes bez edycji, raporty, QR, ekran miejsca, szerokość 390px, brak błędów JS.');
}finally{await browser.close();}
