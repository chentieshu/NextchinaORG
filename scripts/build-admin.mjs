import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build','apps/admin','--webpack'],{stdio:'inherit',env:process.env});process.exit(result.status??1);
