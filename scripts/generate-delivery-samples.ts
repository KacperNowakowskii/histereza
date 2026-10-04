import { writeFileSync } from 'node:fs';
import { demoSeed } from '../server/src/db/demoSeed';
import { demoSamples } from '../server/src/db/demoSamples';
for(const [name,csv] of Object.entries(demoSamples(demoSeed())))writeFileSync(new URL(`../server/data/samples/${name}`,import.meta.url),csv+'\n');
console.log('Expanded CSV samples generated; live database unchanged.');
