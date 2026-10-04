import {it,expect} from 'vitest';
import { seed } from '../src/db/seed';
import { scenario } from '../src/sim/scenarios';
import { plan } from '../src/services/planningService';
import { tick } from '../src/sim/simulator';
import { canDrive } from '../src/domain/gate';
import { at } from '../src/sim/clock';
import { MINUTE } from '@histereza/shared/config';
it('zamknięcie ulicy wyklucza wszystkie bliźniaki do jej otwarcia',()=>{
 const s=seed();s.deliveries.push({id:'d',externalRef:'d',carrierOrgId:'org1',businessId:'business1',businessName:'Lokal demonstracyjny 1',date:s.planningDate,cargoType:'standard',priority:0,courierId:'courier1',vehicleId:'vehicle1',status:'imported'});plan(s,s.planningDate);s.now=at(s.planningDate,'07:00');s.closedDeliveryDates=[s.planningDate];const stop=s.stops[0];scenario(s,'closure','courier1',stop.bayId);const reopen=s.now+120*MINUTE;expect(s.rules).toHaveLength(3);tick(s);expect(s.reservations[0].start).toBeGreaterThanOrEqual(reopen);expect(canDrive(s,stop,s.now)).toBe(false);expect(s.changes[0].forced).toBe(true);
});
