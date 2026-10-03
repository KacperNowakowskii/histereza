import { openDb } from './db/db';
import { Repo } from './db/repo';
import { seed, sampleCsv } from './db/seed';
import { createApp } from './api/app';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo=new Repo(openDb(),seed);
for(const folder of ['seed','samples'])mkdirSync(fileURLToPath(new URL(`../data/${folder}/`,import.meta.url)),{recursive:true});
const initial=seed();const json=fileURLToPath(new URL('../data/seed/reference.json',import.meta.url));if(!existsSync(json))writeFileSync(json,JSON.stringify(initial,null,2));
for(const errors of [false,true]) {const path=fileURLToPath(new URL(`../data/samples/${errors?'errors':'deliveries'}.csv`,import.meta.url));if(!existsSync(path))writeFileSync(path,sampleCsv(initial,errors));}
const port=Number(process.env.PORT??3001);const server=createApp(repo).listen(port,'127.0.0.1',()=>console.log(`Histereza: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>{repo.db.close();process.exit(0);}));
