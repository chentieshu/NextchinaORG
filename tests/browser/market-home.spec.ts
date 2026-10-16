import {test,expect,type Page} from './test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Uses isolated market and community fixtures.');
const id='30000000-0000-4000-8000-000000000021';
async function setup(page:Page){
 const state=await fixture(page),reads:any[]=[],history:any[]=[];
 const market={id,title:'下一次正式发布会采用开源协议吗？',category:'Technology',state:'open',result:null,last_yes:64,best_yes_bid:62,best_yes_ask:66,volume:'12345600',closes_at:new Date(Date.now()+86400000).toISOString(),created_at:new Date().toISOString(),rules:'以正式发行说明为准。',source_url:'https://example.test/releases',dispute_seconds:3600};
 await page.route('**/rest/v1/rpc/omni_exchange_read',r=>{const p=r.request().postDataJSON();reads.push(p);return r.fulfill({json:{rows:!p.query||market.title.includes(p.query)?[market]:[],categories:['Technology'],server_time:new Date().toISOString(),book:[],orders:[],positions:[],shares:[],balance:{purchased:'0',earned:'0',held:'0'}}});});
 const start=Math.floor(Date.now()/180000)*180000,current={...market,series_id:'btc-3m',opens_at:new Date(start).toISOString(),closes_at:new Date(start+180000).toISOString(),last_yes:null,opening_price:null};
 await page.route('**/rest/v1/rpc/omni_exchange_official_read',r=>r.fulfill({json:{id:'btc-3m',enabled:true,healthy:true,server_time:new Date().toISOString(),current,next:null,history:[]}}));
 await page.route('**/rest/v1/rpc/omni_exchange_history',r=>{history.push(r.request().postDataJSON());return r.fulfill({json:{rows:[],has_more:false,step:60,server_time:new Date().toISOString()}});});
 return{state,reads,history,market};
}
test('market discovery keeps the market board, keeps filters on return and loads charts only in details',async({page})=>{
 const s=await setup(page);await page.goto('/zh-CN/predictions/');await expect(page.locator('main h1')).toHaveText('预测市场');await expect(page.locator('.market-row-link')).toHaveCount(1);
 await expect(page.locator('.app-nav a[aria-current=page]')).toHaveText('预测市场');await expect(page.locator('.app-nav').getByRole('link',{name:'文章',exact:true})).toHaveCount(0);
 expect(s.history).toHaveLength(0);expect(s.reads.at(-1).state_filter).toBe('open');await expect(page.locator('.market-probability-cell')).toContainText('64%');
 await page.getByLabel('搜索预测市场').fill('不存在');await expect(page.locator('.exchange-empty')).toContainText('暂无匹配的其他市场');await expect(page.locator('.official-strip')).toBeVisible();
 await page.getByLabel('搜索预测市场').fill('开源');await expect(page).toHaveURL(/q=/);await page.locator('.market-row-link').click();await expect(page.locator('.trade-ticket')).toBeVisible();await expect.poll(()=>s.history.length).toBeGreaterThan(0);
 await page.goBack();await expect(page.getByLabel('搜索预测市场')).toHaveValue('开源');await expect(page.locator('.market-row-link')).toHaveCount(1);
 await page.getByRole('button',{name:'我的关注',exact:true}).click();await expect(page).toHaveURL(/view=watchlist/);await page.reload();await expect(page.getByRole('button',{name:'我的关注',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(s.state.writes).toHaveLength(0);
});
test('market discovery and square keep clear navigation and no overflow in five languages and both themes',async({page})=>{
 const s=await setup(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const theme of ['light','dark']){s.state.profile.theme=theme;for(const locale of ['zh-CN','en','ja','es','zh-TW']){for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`/${locale}/predictions/`);await expect(page.locator('.market-table tbody tr')).toHaveCount(1);await expect(page.locator('.official-strip')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const nav=page.locator(width>900?'.app-nav':'.mobile-nav');await expect(nav.locator('a[aria-current=page]')).toHaveCount(1);
  if(locale==='zh-CN'&&[390,1440].includes(width))await page.screenshot({path:test.info().outputPath(`market-home-${theme}-${width}.png`),fullPage:true});
 }}}
 expect(s.history).toHaveLength(0);expect(errors).toEqual([]);
});
test('Square separates posts and articles while preserving publishing permissions and legacy details',async({page})=>{
 const s=await setup(page);s.state.articles.push(story(articleId,'广场里的帖子'),story('20000000-0000-4000-8000-000000000041','广场里的文章',{content_type:'news',category:'opensource'}));
 await page.goto('/zh-CN/');await page.locator('.app-nav').getByRole('link',{name:'广场',exact:true}).click();await expect(page).toHaveURL(/square\/$/);await expect(page.locator('h1')).toHaveText('广场');await expect(page.locator('.article-card')).toHaveCount(1);await expect(page.locator('.post-excerpt')).toContainText('广场里的帖子');
 await page.locator('.square-tabs').getByRole('link',{name:'文章',exact:true}).click();await expect(page.locator('.article-card')).toHaveCount(1);await expect(page.locator('.post-excerpt')).toHaveCount(0);await expect(page.getByRole('link',{name:'发布文章',exact:true})).toHaveCount(0);await expect(page.locator('.category-tabs')).toBeVisible();
 await page.goto(`/zh-CN/?id=${articleId}`);await expect(page.locator('.post-detail')).toContainText('广场里的帖子');await page.locator('.back-link').click();await expect(page).toHaveURL(/square\/$/);
 s.state.profile.role='editor';await page.goto('/zh-CN/square/?tab=articles');await expect(page.locator('.square-title a')).toHaveAttribute('href','/zh-CN/write/?kind=news');
 await page.goto('/zh-CN/news/');await expect(page.locator('.square-tabs a[aria-current=page]')).toHaveText('文章');await page.goto('/zh-CN/community/');await expect(page.locator('.square-tabs a[aria-current=page]')).toHaveText('帖子');
});
