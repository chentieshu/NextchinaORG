import {test as base,expect} from '@playwright/test';

// Registered before each test's mocked routes. Those more-specific mocks can
// fulfill requests, but any unhandled external request is denied, including
// production Auth, mail delivery, wallet writes, and third-party embeds.
export const test=base.extend<{isolateNetwork:void}>({
 isolateNetwork:[async({context},use)=>{
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin===`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT??'3000'}`)return route.continue();
   return route.abort('blockedbyclient');
  });
  await use();
 },{auto:true}]
});
export {expect};
export type {Page,Locator} from '@playwright/test';

export const testOrigin=`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT??'3000'}`;
