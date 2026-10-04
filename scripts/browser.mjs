import { spawnSync } from 'node:child_process';
// Izolowana baza w pamięci — bez resetu danych aplikacji.
const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/check-simulator-ui.ts'],{stdio:'inherit'});process.exit(result.status??1);
