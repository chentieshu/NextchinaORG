import {test,expect} from './test';
test('desktop sidebar and mobile bottom navigation preserve preferences and keyboard search',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/zh-CN/');await expect(page.locator('main h1')).toHaveText('论坛');await expect(page.locator('.app-nav')).toBeVisible();await expect(page.locator('header,.desktop-nav')).toHaveCount(0);await expect(page.locator('.app-sidebar select')).toHaveCount(0);
 await page.locator('.app-nav').getByRole('link',{name:'设置',exact:true}).click();await page.getByRole('combobox',{name:'主题',exact:true}).selectOption('dark');await page.locator('#preferences').getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav').getByRole('link',{name:'文章',exact:true}).click();await expect(page.locator('h1')).toHaveText('文章');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Control+k');await expect(page).toHaveURL(/\/search\/$/);await expect(page.getByRole('combobox',{name:'搜索帖子、文章、用户和回复'})).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.search-types button').first().click();await page.keyboard.press('Control+k');await expect(page.getByRole('combobox',{name:'搜索帖子、文章、用户和回复'})).toBeFocused();
});
