import {test,expect} from './test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'All state uses isolated fixtures.');

test('settings show one task, retain drafts and restore the selected task through browser history',async({page})=>{
 const state=await fixture(page);await page.goto('/zh-CN/settings/');
 await page.locator('#profile textarea').fill('尚未保存的简介');
 await page.locator('.settings-nav a[href="#preferences"]').click();
 await expect(page.locator('#profile')).toBeHidden();await expect(page.locator('#preferences')).toBeVisible();
 await page.getByLabel('主题',{exact:true}).selectOption('dark');
 await page.locator('.settings-nav a[href="#security"]').click();await expect(page.locator('#security')).toBeVisible();
 await page.goBack();await expect(page.locator('#preferences')).toBeVisible();await expect(page.getByLabel('主题',{exact:true})).toHaveValue('dark');
 await page.locator('.settings-nav a[href="#profile"]').click();await expect(page.locator('#profile textarea')).toHaveValue('尚未保存的简介');
 expect(state.profile.bio).toBe('');expect(state.authWrites).toHaveLength(0);
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:test.info().outputPath('settings-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('settings-mobile.png')});
 for(const section of ['profile','security','connections','preferences','reading']){
  await page.locator(`.settings-nav a[href="#${section}"]`).click();await expect(page.locator('.settings-pane:visible')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 }
});

test('categories and sort survive reload and back; the account keeps secondary destinations',async({page})=>{
 const state=await fixture(page);state.articles.push(story(articleId,'一篇文章',{content_type:'news',category:'opensource'}));
 await page.goto('/zh-CN/news/');await page.locator('.category-tabs').getByRole('button',{name:'开源',exact:true}).click();
 await expect(page).toHaveURL(/category=opensource/);await page.reload();await expect(page.locator('.category-tabs button[aria-pressed=true]')).toHaveText('开源');
 await page.locator('.feed-tools select').selectOption('popular');await expect(page).toHaveURL(/sort=popular/);
 await page.goBack();await expect(page.locator('.feed-tools select')).toHaveValue('latest');
 await page.goto('/zh-CN/');await expect(page.locator('.app-nav a')).toHaveCount(5);
 await expect(page.locator('.app-context,.sidebar-categories')).toHaveCount(0);
 await page.locator('.nav-account summary').click();await page.locator('.nav-account .dropdown').getByRole('link',{name:'我的收藏',exact:true}).click();await expect(page).toHaveURL(/bookmarks\/$/);
});

test('admin category editing uses a focused dialog and cancel restores its trigger',async({page})=>{
 await fixture(page,'super_admin');await page.goto('https://teamcn-admin.pages.dev/zh-CN/#categories');
 const trigger=page.locator('.admin-table article').first().getByRole('button',{name:'编辑',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('.category-form')).toBeVisible();
 await expect(page.locator('.admin-workspace .page-heading p')).toHaveCount(0);
 await dialog.getByLabel('简体中文',{exact:true}).fill('未保存的分类名');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expect(page.locator('.admin-table article').first()).toContainText('人工智能');
});
