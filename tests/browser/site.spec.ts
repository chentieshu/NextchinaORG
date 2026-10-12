import {test,expect} from '@playwright/test';
test('quiet public layout, persistent theme and keyboard navigation',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/zh-CN/');await expect(page.locator('main h1')).toHaveText('论坛');await expect(page.locator('.desktop-nav')).toBeVisible();
 await page.getByRole('button',{name:'切换明暗主题'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByRole('button',{name:'切换明暗主题'}).click();
 await page.setViewportSize({width:390,height:844});await page.locator('.desktop-nav').getByRole('link',{name:'新闻',exact:true}).click();await expect(page.locator('h1')).toHaveText('新闻');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Control+k');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
