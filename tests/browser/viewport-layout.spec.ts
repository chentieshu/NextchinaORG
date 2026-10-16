import {test,expect} from './test';
import {fixture,story,articleId,member} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'All data uses isolated fixtures.');

test('the public frame fills every viewport and keeps one navigation without duplicate discovery rails',async({page})=>{
 const state=await fixture(page);state.articles.push(story());
 await page.goto('/zh-CN/');await expect(page.locator('.article-card')).toHaveCount(1);
 for(const width of [320,600,900,901,1280,1440,1920,2560]){
  await page.setViewportSize({width,height:900});
  const frame=await page.locator('.app-shell').boundingBox();expect(frame!.x).toBe(0);expect(frame!.width).toBe(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const workspace=await page.locator('.app-workspace').boundingBox();expect(workspace!.height).toBeGreaterThanOrEqual(width>900?900:828);
  await expect(page.locator('.app-context,.sidebar-categories')).toHaveCount(0);
  if(width===1920)await page.screenshot({path:test.info().outputPath('viewport-desktop.png')});
 }
 await page.locator('.app-nav').getByRole('link',{name:'文章',exact:true}).click();await page.locator('.category-tabs').getByRole('button',{name:'开源',exact:true}).click();
 await expect(page).toHaveURL(/news\/\?category=opensource/);await expect(page.locator('.category-tabs button[aria-pressed=true]')).toHaveText('开源');
 await page.locator('.app-nav').getByRole('link',{name:'搜索',exact:true}).click();await expect(page).toHaveURL(/search\/$/);
 await page.goto('/zh-CN/');await page.keyboard.press('Control+k');await expect(page).toHaveURL(/search\/$/);
});

test('short desktop navigation scrolls independently while the account menu remains reachable',async({page})=>{
 const state=await fixture(page,'super_admin');for(let i=0;i<12;i++)state.articles.push(story(`20000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`));
 await page.setViewportSize({width:1280,height:480});await page.goto('/zh-CN/');await expect(page.locator('.article-card')).toHaveCount(12);
 const scroller=page.locator('.sidebar-scroller');expect(await scroller.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,600));
 const sidebar=await page.locator('.app-sidebar').boundingBox();expect(sidebar!.y).toBe(0);expect(sidebar!.height).toBe(480);
 await page.locator('.sidebar-account summary').click();const menu=page.locator('.sidebar-account .dropdown');await expect(menu).toBeVisible();
 const box=await menu.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(480);
 await menu.getByRole('link',{name:'设置',exact:true}).click();await expect(page).toHaveURL(/settings\/$/);
});

test('settings show one task, reading keeps a comfortable measure, and work pages keep their space',async({page})=>{
 const state=await fixture(page);state.articles.push(story(articleId,'阅读正文，保留合适的行宽。'));
 await page.route('**/rest/v1/rpc/omni_wallet_snapshot',route=>route.fulfill({json:{purchased:'0',earned:'0',held:'0',prediction_held:'0',deposits_enabled:false,tipping_enabled:false,withdrawals_enabled:false,withdrawal_min_units:'10000',withdrawal_fee_bps:'100',points_per_usdt:1,frozen:false}}));
 for(const width of [390,1024,1920]){
  await page.setViewportSize({width,height:1000});await page.goto('/zh-CN/settings/');await expect(page.locator('#profile')).toBeVisible();
  await expect(page.locator('.app-context')).toHaveCount(0);
  await expect(page.locator('#security')).toBeHidden();await expect(page.locator('.settings-pane:visible')).toHaveCount(1);
  if(width===1920)await page.screenshot({path:test.info().outputPath('settings-desktop.png')});
  await page.locator('.settings-nav a[href="#preferences"]').click();await expect(page.locator('#preferences select').first()).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 }
 await page.goto(`/zh-CN/community/?id=${articleId}`);await expect(page.locator('.post-detail')).toBeVisible();expect((await page.locator('.post-detail').boundingBox())!.width).toBeLessThanOrEqual(880);
 for(const route of ['write/','predictions/','wallet/']){
  await page.goto('/zh-CN/'+route);await expect(page.locator('.app-context')).toHaveCount(0);await expect(page.locator('main')).toBeVisible();
  const body=await page.locator('.app-body').boundingBox();expect(body!.x+body!.width).toBe(1920);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1920);
 }
 await page.goto('/zh-CN/profile/?id='+member);await expect(page.locator('.app-context')).toHaveCount(0);
});
