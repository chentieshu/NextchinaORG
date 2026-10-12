import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:'http://127.0.0.1:3000',launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}},webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:3000',reuseExistingServer:true},workers:1});
