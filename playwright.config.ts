import {defineConfig} from '@playwright/test';
const origin=`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT??'3000'}`;
export default defineConfig({testDir:'./tests/browser',use:{baseURL:origin,serviceWorkers:'block',launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}},webServer:{command:'node tests/serve.mjs',url:origin,reuseExistingServer:false},workers:1});
