import {test,expect} from './test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Authenticated requests use intercepted fixtures.');

test('small screens have full-width content, reachable footer and one navigation in every language',async({page})=>{
 const state=await fixture(page);state.articles.push(story());
 for(const width of [320,390,768,900]){
  await page.setViewportSize({width,height:844});
  for(const locale of ['zh-CN','en','ja','es','zh-TW']){
   await page.goto(`/${locale}/`);await expect(page.locator('.article-card')).toHaveCount(1);
   await expect(page.locator('.app-sidebar')).toBeHidden();await expect(page.locator('.mobile-nav')).toBeVisible();
   const body=await page.locator('.app-body').boundingBox();expect(body!.x).toBe(0);expect(body!.width).toBe(width);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
   const targets=await page.locator('.mobile-nav>a,.mobile-nav>button').all();expect(targets).toHaveLength(5);
   for(const target of targets){const box=await target.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   const footer=await page.locator('.footer').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox();expect(footer!.y+footer!.height).toBeLessThanOrEqual(nav!.y+1);
  }
 }
 await page.setViewportSize({width:1024,height:844});await expect(page.locator('.mobile-nav')).toBeHidden();await expect(page.locator('.app-sidebar')).toBeVisible();
});

test('account sheet keeps categories and account links usable, restores focus and closes on resize',async({page})=>{
 const state=await fixture(page);state.articles.push(story(articleId,'开源的讨论',{category:'opensource'}));
 await page.setViewportSize({width:390,height:844});await page.goto('/zh-CN/');
 const account=page.locator('.mobile-nav').getByRole('button',{name:'我的',exact:true}),sheet=page.getByRole('dialog',{name:'我的',exact:true});
 await account.click();await expect(sheet).toBeVisible();await expect(sheet.getByRole('link',{name:'管理中心'})).toHaveCount(0);await expect(sheet).toContainText('@test_writer');
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(account).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await account.click();await page.mouse.click(8,8);await expect(sheet).toHaveCount(0);
 await account.click();await sheet.getByRole('link',{name:'开源',exact:true}).click();await expect(page).toHaveURL(/category=opensource/);await expect(sheet).toHaveCount(0);await expect(page.locator('.stream-filter')).toContainText('开源');
 await account.click();await sheet.getByRole('button',{name:'个人资料',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.getByRole('dialog',{name:'个人资料',exact:true})).toBeVisible();await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await account.click();await sheet.getByRole('link',{name:'设置',exact:true}).click();await expect(page).toHaveURL(/settings\/$/);await expect(sheet).toHaveCount(0);await expect(account).toHaveClass('is-current');
 await account.click();if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/chinateam-mobile-account.png'});
 await page.setViewportSize({width:1200,height:900});await expect(sheet).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');await expect(page.locator('.app-nav')).toBeVisible();
});

test('mobile compose retains dirty-draft protection, guest return path and posting permissions',async({page})=>{
 const state=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/zh-CN/');
 const nav=page.locator('.mobile-nav');await nav.getByRole('link',{name:'发表帖子',exact:true}).click();await expect(page).toHaveURL(/write\/$/);await page.locator('.tiptap').fill('保留移动端尚未发布的内容');
 page.once('dialog',d=>d.dismiss());await nav.getByRole('link',{name:'新闻',exact:true}).click();await expect(page).toHaveURL(/write\/$/);await expect(page.locator('.tiptap')).toHaveText('保留移动端尚未发布的内容');
 page.once('dialog',d=>d.accept());await nav.getByRole('link',{name:'首页',exact:true}).click();await expect(page).toHaveURL('/zh-CN/');
 state.settings.ugc_enabled=false;await page.reload();await expect(nav.getByRole('button',{name:'发表帖子',exact:true})).toBeDisabled();
 state.settings.ugc_enabled=true;await page.reload();await nav.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await nav.getByRole('button',{name:'发表帖子',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('nextchina-auth-return'))).toBe('/zh-CN/write/');
});

test('mobile admin access is available in the account sheet and follows role changes',async({page})=>{
 const state=await fixture(page,'super_admin');await page.setViewportSize({width:390,height:844});await page.goto('/zh-CN/');
 const account=page.locator('.mobile-nav').getByRole('button',{name:'我的',exact:true});await account.click();await page.getByRole('dialog').getByRole('link',{name:'管理中心',exact:true}).click();await expect(page.locator('.admin-shell')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 state.profile.role='member';await page.reload();await expect(page.locator('.admin-shell')).toHaveCount(0);await page.goto('/zh-CN/');await account.click();await expect(page.getByRole('dialog').getByRole('link',{name:'管理中心',exact:true})).toHaveCount(0);
});
