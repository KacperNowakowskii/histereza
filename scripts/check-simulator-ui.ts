import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { Repo } from '../server/src/db/repo';
import { openDb } from '../server/src/db/db';
import { seed } from '../server/src/db/seed';
import { createApp } from '../server/src/api/app';
const db=openDb(':memory:'),repo=new Repo(db,seed),before=repo.read();
const server=createApp(repo).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/sim`);await expect(page.getByRole('heading',{name:'Izolowana demonstracja systemu'})).toBeVisible();
  await page.getByLabel('Firma symulacji').selectOption('org2');await expect(page.getByLabel('Kurier symulacji').locator('option')).toHaveCount(4);await page.getByLabel('Kurier symulacji').selectOption('courier6');
  await page.getByRole('button',{name:'Przygotuj sesję',exact:true}).click();await expect(page.getByRole('heading',{name:'Sesja live · courier6',exact:true})).toBeVisible();await expect(page.locator('.route-point')).not.toHaveCount(0);
  await page.getByRole('button',{name:'Uruchom symulację',exact:true}).click();await page.getByRole('button',{name:'+15 min',exact:true}).click();await expect(page.locator('.sim-timeline')).toContainText('Korek +8 min');await expect(page.locator('.sim-timeline')).toContainText('Wykryto konflikt');
  await page.getByRole('button',{name:'Zatrzymaj symulację',exact:true}).click();await expect(page.getByRole('button',{name:'Uruchom symulację',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Reset symulatora',exact:true}).click();await expect(page.locator('.sim-event')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.getByRole('button',{name:'Nowa sesja',exact:true}).click();await page.getByLabel('Tryb symulacji').selectOption('random');await expect(page.getByLabel('Ziarno losowania')).toBeVisible();await page.getByRole('button',{name:'Przygotuj sesję',exact:true}).click();await page.getByRole('button',{name:'Uruchom symulację',exact:true}).click();await page.getByRole('button',{name:'+5 min',exact:true}).click();
  await page.getByRole('button',{name:'Firma kurierska',exact:false}).click();await expect(page.getByRole('heading',{name:'Dostawy według dni'})).toBeVisible();assert.deepEqual(repo.read(),before);assert.deepEqual(errors,[]);
  console.log('SIMULATOR UI OK: scenario/random, company/courier selection, own route, live events/reactions, stop/reset, mobile, production state unchanged.');
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
