import {test,expect} from './test';
import {fixture,story} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Visual checks use isolated requests.');

test('public navigation changes once at the shared breakpoint and content stays readable',async({page})=>{
 const state=await fixture(page);state.articles.push(story());await page.goto('/zh-CN/square/');
 for(const width of [320,380,600,601,900,901,1200,1440]){
  await page.setViewportSize({width,height:900});
  if(width<=900){await expect(page.locator('.app-sidebar')).toBeHidden();await expect(page.locator('.mobile-nav')).toBeVisible();}
  else{await expect(page.locator('.app-sidebar')).toBeVisible();await expect(page.locator('.mobile-nav')).toBeHidden();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('account and administrative financial surfaces share the light and dark system palette',async({page})=>{
 const state=await fixture(page,'super_admin');
 await page.route('**/rest/v1/rpc/omni_wallet_admin_summary',route=>route.fulfill({json:{accounts:1,journals:0,purchased:'0',earned:'0',held:'0',balanced:true,settings:{deposits_enabled:false,tipping_enabled:false,withdrawals_enabled:false}}}));
 await page.route('**/rest/v1/rpc/omni_points_admin_read',route=>route.fulfill({json:{available:'0',issued:'0',distributed:'0',rows:[],recipient:null}}));
 for(const theme of ['light','dark'] as const){
  state.profile.theme=theme;await page.goto('/zh-CN/settings/');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const control=page.locator('#profile input').first();await expect(control).toBeVisible();await expect(control).toHaveCSS('border-radius','10px');
  const inputColor=await control.evaluate(node=>getComputedStyle(node).backgroundColor);
  const checkbox=page.locator('#identity .checkbox-label').first();await expect(checkbox).toHaveCSS('flex-direction','row');await expect(checkbox.locator('input')).toHaveCSS('width','18px');
  await page.goto('https://tree.teamcn.org/zh-CN/#wallet');await expect(page.locator('.points-issuance')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const panelColor=await page.locator('.points-issuance').evaluate(node=>getComputedStyle(node).backgroundColor);
  const toolbarColor=await page.locator('.admin-topbar').evaluate(node=>getComputedStyle(node).backgroundColor);
  expect(panelColor).toBe(toolbarColor);expect(panelColor).toBe(inputColor);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:test.info().outputPath('financial-dark.png'),fullPage:true});
});
