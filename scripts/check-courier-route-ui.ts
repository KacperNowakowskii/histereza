import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { Repo } from '../server/src/db/repo';
import { openDb } from '../server/src/db/db';
import { seed } from '../server/src/db/seed';
import { createApp } from '../server/src/api/app';
import { at } from '../server/src/sim/clock';
import type { Stop } from '@histereza/shared/types';
const db = openDb(':memory:');
const repo = new Repo(db, () => {
  const s=seed(); s.now=at('2026-10-07','07:03'); s.planningDate='2026-10-07'; s.closedDeliveryDates=[s.planningDate];
  s.routes=[{ id:'own',courierId:'courier1',vehicleId:'vehicle1',date:s.planningDate,stopIds:['a','b','c'],breaks:[],loadingList:['d0','d1','d2'] },{ id:'foreign',courierId:'courier2',vehicleId:'vehicle2',date:s.planningDate,stopIds:['foreign-stop'],breaks:[],loadingList:['d3'] }];
  s.deliveries=[0,1,2,3].map(i=>({ id:`d${i}`,externalRef:`D${i}`,carrierOrgId:'org1',businessId:'business1',businessName:s.businesses[0].name,date:s.planningDate,cargoType:'standard',courierId:i===3?'courier2':'courier1',vehicleId:i===3?'vehicle2':'vehicle1',priority:0,status:i===0?'delivered':'planned' }));
  s.stops=['a','b','c','foreign-stop'].map((id,i):Stop=>({id,routeId:i===3?'foreign':'own',sequence:i===3?0:i,bayGroupId:s.bays[i].groupId,bayId:s.bays[i].id,deliveryIds:[`d${i}`],plannedArrival:at(s.planningDate,i===0?'06:45':i===1?'07:00':'07:30'),plannedServiceMin:10,frozen:i===1,status:i===0?'done':i===1?'servicing':'pending',actualArrival:i===1?at(s.planningDate,'07:00'):undefined,expectedDeparture:i===1?at(s.planningDate,'07:10'):undefined,eligibleBayIds:[s.bays[i].id]}));
  const c=s.couriers[0]; c.status='servicing';c.targetStopId='b';c.vehicleId='vehicle1';c.loaded=true;c.location={lat:s.bays[1].lat,lng:s.bays[1].lng};
  s.sensors.forEach(sensor=>sensor.ts=s.now); return s;
});
const beforeBreaks=structuredClone(repo.read().routes.map(r=>r.breaks));
const server=createApp(repo).listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/courier`);
  await expect(page.locator('.route-point')).toHaveCount(3); await expect(page.locator('.route-point.done')).toHaveCount(1);await expect(page.locator('.route-point.current')).toHaveAttribute('data-stop-id','b');await expect(page.locator('.route-point.next')).toHaveAttribute('data-stop-id','c');
  await expect(page.getByRole('progressbar',{name:'Postęp trasy'})).toHaveAttribute('aria-valuenow','1');
  await expect(page.locator('.route-timeline').getByRole('timer')).toContainText('7:00');
  await expect(page.locator('.courier-route-map path.leaflet-interactive')).toHaveCount(5); // trzy punkty, pozycja kuriera i linia
  const navigation=page.getByRole('link',{name:'Nawiguj do kolejnego punktu w Google Maps'});const url=new URL((await navigation.getAttribute('href'))!);const next=repo.read().bays[2]; assert.equal(url.searchParams.get('destination'),`${next.lat},${next.lng}`);
  await expect(page.locator('.route-point')).toContainText(['Planowany przyjazd:','Rozładunek:','Rozładunek:']);
  await page.getByRole('button',{name:'Potwierdzam doręczenia',exact:true}).click();await expect(page.getByRole('button',{name:'Wyjeżdżam z miejsca →',exact:true})).toBeVisible();assert.equal(repo.read().deliveries[1].status,'delivered');
  await page.request.post(`${base}/api/operator/tick`,{headers:{'x-role':'operator'},data:{minutes:1}}); await expect(page.locator('.route-timeline').getByRole('timer')).toContainText('6:00');
  await page.setViewportSize({width:390,height:844}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.getByLabel('Kurier firmowy').selectOption('courier2'); await expect(page.locator('.route-point')).toHaveCount(1);await expect(page.locator('.route-point')).toHaveAttribute('data-stop-id','foreign-stop');
  assert.deepEqual(repo.read().routes.map(r=>r.breaks),beforeBreaks);assert.deepEqual(errors,[]);
  console.log('COURIER ROUTE UI OK: own markers/polyline, current/next/done, timeline, Google Maps, clock countdown, delivery action, courier switch, mobile; breaks unchanged.');
} finally {await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
