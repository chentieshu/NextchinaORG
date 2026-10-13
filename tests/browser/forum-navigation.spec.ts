import {test,expect} from '@playwright/test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.LIVE_SUPABASE,'Uses intercepted authenticated requests.');

test('forum navigation preserves filters across refresh and back, and protects private views on logout',async({page})=>{
 const state=await fixture(page);
 state.articles.push(story(articleId,'开源讨论',{category:'opensource'}),story('20000000-0000-4000-8000-000000000012','人工智能讨论'),story('20000000-0000-4000-8000-000000000013','未发布草稿',{category:'opensource',status:'draft'}));
 await page.goto('/zh-CN/');const nav=page.getByRole('navigation',{name:'论坛导航'});
 await expect(page.locator('.article-card')).toHaveCount(2);
 await expect(nav.getByRole('link',{name:'管理中心'})).toHaveCount(0);
 await nav.getByRole('button',{name:'开源',exact:true}).click();await expect(page).toHaveURL(/category=opensource/);await expect(page.locator('.article-card h3')).toHaveText('开源讨论');
 await page.reload();await expect(nav.getByRole('button',{name:'开源',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.article-card h3')).toHaveText('开源讨论');
 await page.getByRole('combobox',{name:'最新发布',exact:true}).selectOption('popular');await expect(page).toHaveURL(/sort=popular/);await expect.poll(()=>state.feeds.at(-1)?.sort_by).toBe('popular');
 await page.goBack();await expect(page).toHaveURL(/category=opensource$/);await expect(page.getByRole('combobox',{name:'最新发布',exact:true})).toHaveValue('latest');
 await page.setViewportSize({width:390,height:844});await expect(nav).toBeHidden();const toggle=page.locator('.forum-menu-toggle');await toggle.click();await expect(nav).toBeVisible();
 await nav.getByRole('button',{name:'我的帖子',exact:true}).click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(nav).toBeHidden();await expect(page).toHaveURL(/scope=mine/);await expect(page.locator('.article-card')).toHaveCount(3);
 await expect(page.locator('.article-card h3').filter({hasText:'未发布草稿'})).toBeVisible();await page.reload();await expect(page.locator('.article-card')).toHaveCount(3);
 await page.locator('.user-menu summary').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.locator('.article-card')).toHaveCount(0);await expect(page.locator('.forum-main').getByRole('button',{name:'登录 / 加入',exact:true})).toBeVisible();
 await toggle.click();await expect(nav.getByRole('button',{name:'我的帖子',exact:true})).toHaveCount(0);await nav.getByRole('button',{name:'所有帖子',exact:true}).click();await expect(page.locator('.article-card')).toHaveCount(2);
 await page.locator('.forum-main').getByRole('button',{name:'发表帖子',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
