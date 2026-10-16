import {test,expect} from './test';
import {fixture,story,member,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'All account and content requests use isolated fixtures.');

test('quiet feed preserves identity, right-hand media and keyboard-accessible sort',async({page})=>{
 const state=await fixture(page),photo=`https://media.teamcn.org/content/${member}/40000000-0000-4000-8000-000000000001.webp`;
 state.articles.push(story(articleId,'把想法写下来，和社区一起慢慢完善。一个更清晰的界面，应该让内容自然成为主角。',{author_name:'Lin Chen',author_handle:'lin',media:[{type:'image',url:photo}],like_count:12,comment_count:3}),story('20000000-0000-4000-8000-000000000011','今天整理了一个开源项目。小步迭代，持续分享，也欢迎不同的想法。',{author_name:'Yuki',author_handle:'yuki'}));
 await page.route(photo,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2e7e4"/><rect x="55" y="55" width="290" height="190" rx="12" fill="#fafbfa"/><path d="M82 140h170m-170 20h230m-230 20h140" stroke="#95a59c" stroke-width="9"/><circle cx="308" cy="92" r="12" fill="#637e6d"/></svg>'}));
 await page.goto('/zh-CN/square/');await expect(page.locator('.article-card')).toHaveCount(2);
 await expect(page.locator('main h1')).toHaveText('广场');await expect(page.locator('.article-card h3')).toHaveCount(0);await expect(page.locator('.social-post>.card-content>.article-meta .identity-names')).toHaveCount(0);await expect(page.locator('.social-post>.card-content>.article-meta .user-identity').first()).toHaveAccessibleName('Test writer');
 const sort=page.getByLabel('排序',{exact:true});await sort.focus();await expect(sort).toBeFocused();await sort.selectOption('popular');await expect.poll(()=>state.feeds.at(-1)?.sort_by).toBe('popular');
 for(const width of [1440,900,768,390,320]){
  await page.setViewportSize({width,height:960});await expect(page.locator('.post-media-preview')).toBeVisible();const repost=page.locator('.social-post .repost-menu').first();await repost.locator('summary').click();await repost.getByRole('link',{name:'引用',exact:true}).click({trial:true});await repost.locator('summary').click();
  const body=await page.locator('.card-content').filter({hasText:'把想法'}).boundingBox(),media=await page.locator('.post-media-preview').boundingBox();expect(media!.x).toBeGreaterThan(body!.x);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.locator('.post-excerpt').first().focus();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:test.info().outputPath('feed-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('feed-mobile.png'),fullPage:true});
 state.profile.theme='dark';await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:test.info().outputPath('feed-mobile-dark.png'),fullPage:true});
});

test('icon actions keep names and useful states while the writer and detail avoid duplicate noise',async({page})=>{
 const state=await fixture(page);state.articles.push(story());await page.goto('/zh-CN/write/');
 const save=page.getByRole('button',{name:'保存草稿',exact:true}),preview=page.getByRole('button',{name:'预览',exact:true});
 await expect(save).toHaveAttribute('title','保存草稿');await expect(preview).toHaveAttribute('title','预览');await expect(page.locator('.post-media-hint')).toHaveCount(0);await expect(page.locator('.post-media-count')).toHaveCount(0);
 await page.locator('.tiptap').fill('让每一个操作都清楚，让阅读更轻松。');await preview.focus();await preview.press('Enter');await expect(page.locator('.writing-preview')).toBeVisible();await page.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(page.locator('.tiptap')).toHaveText('让每一个操作都清楚，让阅读更轻松。');
 await page.locator('.tiptap').focus();await page.setViewportSize({width:390,height:844});await expect(save).toBeVisible();expect((await save.boundingBox())!.width).toBeGreaterThanOrEqual(40);await page.screenshot({path:test.info().outputPath('writer-mobile.png'),fullPage:true});
 page.on('dialog',dialog=>dialog.accept());await page.goto('/zh-CN/settings/');await expect(page.locator('.settings-nav a')).toHaveCount(5);
 for(const link of await page.locator('.settings-nav a').all()){await expect(link).toHaveAttribute('aria-label',/.+/);await expect(link).toHaveAttribute('title',/.+/);}
 await page.screenshot({path:test.info().outputPath('settings-mobile.png'),fullPage:true});
 await page.goto(`/zh-CN/community/?id=${articleId}`);await expect(page.locator('.post-statistics')).toHaveCount(0);await expect(page.locator('.post-detail .article-actions')).toBeVisible();
});
