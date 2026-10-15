import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {test as base,expect} from '@playwright/test';

// Registered before each test's mocked routes. Those more-specific mocks can
// fulfill requests, but any unhandled external request is denied, including
// production Auth, mail delivery, wallet writes, and third-party embeds.
export const test=base.extend<{isolateNetwork:void}>({
 isolateNetwork:[async({context},use)=>{
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT??'3000'}`)return route.continue();
   if(url.origin==='https://tree.teamcn.org'){try{const root=path.resolve('apps/admin/out');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return route.abort();if((await stat(file)).isDirectory())file=path.join(file,'index.html');const types:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.txt':'text/plain','.svg':'image/svg+xml'};return route.fulfill({body:await readFile(file),contentType:types[path.extname(file)]??'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}}
   return route.abort('blockedbyclient');
  });
  await use();
 },{auto:true}]
});
export {expect};
export type {Page,Locator} from '@playwright/test';

export const testOrigin=`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT??'3000'}`;
