import {test,expect} from './test';
import {fixture,story,member,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Search requests and follow writes use intercepted fixtures.');
const other='20000000-0000-4000-8000-000000000002';
function person(){return {id:other,display_name:'Needle 开发者',handle:'needle',bio:'开源与人工智能',created_at:'2025-01-01T00:00:00Z',disabled:false,profile_completed_at:'2025-01-01T00:00:00Z',avatar_key:null};}

test('submitting a new query then immediately changing type keeps the submitted query',async({page})=>{
 const state=await fixture(page);state.users.push(person());state.articles.push(story(articleId,'新的搜索内容'));
 await page.goto('/zh-CN/search/?q=needle&type=user');await expect(page.locator('.search-person')).toHaveCount(1);
 await page.route(/\/search\/\?.*_rsc=/,async route=>{await new Promise(r=>setTimeout(r,500));await route.continue();});
 const input=page.locator('.global-search-form input');await input.fill('新的搜索内容');await input.press('Enter');await page.locator('.search-types').getByRole('button',{name:'帖子',exact:true}).click();
 await expect(page.locator('.post-excerpt')).toHaveText('新的搜索内容');expect(new URL(page.url()).searchParams.get('q')).toBe('新的搜索内容');await expect(input).toHaveValue('新的搜索内容');
});

test('username suggestions support keyboard navigation and do not submit during IME composition',async({page})=>{
 const state=await fixture(page);state.users.push(person());await page.goto('/zh-CN/search/');const input=page.getByRole('combobox',{name:'搜索帖子、文章、用户和回复'});
 await input.focus();await input.dispatchEvent('compositionstart');await input.fill('@needle');await input.press('Enter');await page.waitForTimeout(350);expect(state.searches).toHaveLength(0);await expect(page).not.toHaveURL(/q=/);
 await input.dispatchEvent('compositionend');await expect(page.getByRole('option').filter({hasText:'Needle 开发者'})).toBeVisible();await input.press('ArrowDown');await input.press('ArrowDown');await input.press('Enter');await expect(page).toHaveURL(new RegExp(`profile/\\?id=${other}$`));
});

test('people results keep identities and support following, with query and scope in the URL',async({page})=>{
 const state=await fixture(page);state.users.push(person());state.articles.push(story(articleId,'Needle post'));
 await page.goto('/zh-CN/search/?q=%40needle&type=user');await expect(page.locator('.search-person')).toHaveCount(1);await expect(page.locator('.search-person')).toContainText('@needle');
 await page.locator('.search-person').getByRole('button',{name:'关注',exact:true}).click();await expect.poll(()=>state.follows).toEqual([{follower_id:member,following_id:other}]);await expect(page.locator('.search-person .follow-button')).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('搜索范围',{exact:true}).selectOption('following');await expect(page).toHaveURL(/scope=following/);await page.reload();await expect(page.locator('.search-person')).toHaveCount(1);await page.locator('.search-person .follow-button').click();await expect(page.locator('.search-person')).toHaveCount(0);await expect(page.locator('.empty-state')).toBeVisible();
});

test('recent queries are bounded, removable and isolated from guest history',async({page})=>{
 await fixture(page);await page.goto('/zh-CN/search/');await page.evaluate(()=>localStorage.setItem('chinateam-search:guest',JSON.stringify(['guest-private'])));
 const input=page.locator('.global-search-form input');await input.fill('开源 技术');await input.press('Enter');await expect(page).toHaveURL(/q=/);await page.getByRole('button',{name:'清空搜索',exact:true}).click();
 await expect(page.locator('.search-history')).toContainText('开源 技术');await expect(page.locator('.search-history')).not.toContainText('guest-private');await page.reload();await expect(page.locator('.history-query')).toContainText('开源 技术');await page.getByRole('button',{name:'删除搜索记录: 开源 技术',exact:true}).click();await expect(page.locator('.history-query')).toHaveCount(0);
 await input.fill('Needle');await input.press('Enter');await page.getByRole('button',{name:'清空搜索',exact:true}).click();await page.getByRole('button',{name:'清除全部',exact:true}).click();await expect(page.locator('.history-query')).toHaveCount(0);
});

test('failed pagination retries the same page without duplicates or skipped results',async({page})=>{
 const state=await fixture(page);for(let n=0;n<25;n++)state.articles.push(story('30000000-0000-4000-8000-'+String(n).padStart(12,'0'),'Needle page '+n,{created_at:`2026-01-${String(n+1).padStart(2,'0')}T00:00:00Z`,published_at:`2026-01-${String(n+1).padStart(2,'0')}T00:00:00Z`}));
 await page.goto('/zh-CN/search/?q=Needle&type=post&sort=latest');await expect(page.locator('.article-card')).toHaveCount(20);state.searchFailures=1;await page.getByRole('button',{name:'查看更多',exact:true}).click();await expect(page.locator('.inline-error')).toBeVisible();await expect(page.locator('.article-card')).toHaveCount(20);
 await page.locator('.inline-error button').click();await expect(page.locator('.article-card')).toHaveCount(25);expect(state.searches.filter(p=>p.page_size===20).map(p=>p.offset_rows)).toEqual([0,20,20]);await expect(page.locator('.load-more')).toHaveCount(0);
 await page.getByLabel('结果排序',{exact:true}).selectOption('relevant');await expect.poll(()=>state.searches.at(-1)?.offset_rows).toBe(0);await page.goBack();await expect(page.getByLabel('结果排序',{exact:true})).toHaveValue('latest');
});

test('media filters retain cards and news opens the matching translation',async({page})=>{
 const state=await fixture(page);state.articles.push(story(articleId,'needle picture',{media:[{type:'image',url:'https://media.teamcn.org/fixture.webp'}]}),story('20000000-0000-4000-8000-000000000012','needle plain'),story('20000000-0000-4000-8000-000000000013','',{content_type:'news',translations:{'zh-CN':{title:'中文文章',summary:'摘要',body:'中文内容'},ja:{title:'needle ニュース',summary:'日本語の概要',body:'日本語の本文'}}}));
 await page.goto('/zh-CN/search/?q=needle&type=media');await expect(page.locator('.article-card')).toHaveCount(1);await expect(page.locator('.post-media-preview')).toBeVisible();await page.locator('.search-types').getByRole('button',{name:'文章',exact:true}).click();await expect(page.locator('.article-card')).toContainText('needle ニュース');await page.locator('.article-card h3 a').click();await expect(page).toHaveURL(/lang=ja/);await expect(page.locator('.article-heading h1')).toHaveText('needle ニュース');
});

test('five locales remain usable on mobile with long identities and queries',async({page})=>{
 const state=await fixture(page);state.users.push({...person(),display_name:'Needle 开发者很长的用户名用于移动端排版检查'});state.articles.push(story(articleId,'needle 开源项目与最新开发进展'));await page.setViewportSize({width:390,height:844});
 for(const locale of ['zh-CN','en','ja','es','zh-TW']){await page.goto(`/${locale}/search/?q=needle`);await expect(page.locator('.search-person')).toHaveCount(1);await expect(page.locator('.article-card')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.search-types button').nth(2).click();await expect(page.locator('.search-person')).toHaveCount(1);}
 await page.goto('/zh-CN/search/?q=needle');if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/chinateam-search-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/chinateam-search-desktop.png',fullPage:true});
});
