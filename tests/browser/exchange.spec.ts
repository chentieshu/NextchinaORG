import {test,expect,type Page} from './test';import {fixture,member,story,articleId} from './fixtures';
const marketId='30000000-0000-4000-8000-000000000001',orderId='30000000-0000-4000-8000-000000000002',shareId='30000000-0000-4000-8000-000000000003';
test.skip(!process.env.AUTH_FIXTURES,'Isolated financial fixtures only');
function market(extra:Record<string,unknown>={}){return {id:marketId,title:'项目是否将在月底发布稳定版本？',rules:'以官方发行记录为准，稳定版本发布视为是；测试版本不计入。若无法核实来源，则按无效市场每份 0.5 积分结算。',source_url:'https://example.test/releases',category:'Technology',closes_at:new Date(Date.now()+86400000).toISOString(),state:'open',result:null,resolution_note:'',evidence_url:'',resolve_after:null,dispute_seconds:3600,volume:'12500000',last_yes:64,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),creator_id:member,creator_name:'Test writer',creator_handle:'test_writer',published_at:new Date().toISOString(),collateral:'5000000',...extra};}
async function setup(page:Page,role='member'){
 const f=await fixture(page,role);const state:any={rows:[market()],categories:['Technology'],server_time:new Date().toISOString(),book:[{side:'buy',outcome:'yes',price:63,quantity:'120'},{side:'sell',outcome:'yes',price:65,quantity:'50'},{side:'buy',outcome:'no',price:34,quantity:'80'}],trades:Array.from({length:15},(_,i)=>({id:String(i),yes_price:64-(i%7),quantity:'10',created_at:new Date(Date.now()-i*60000).toISOString()})),orders:[],positions:[],shares:[],balance:{purchased:'10000000',earned:'0',held:'0'},disputes:[],admin_orders:[],totals:{markets:1,open:1,resolving:0,collateral:'5000000',volume:'12500000'}};
 const requests:any[]=[],reads:any[]=[];let uncertain=false;
 await page.route('**/rest/v1/rpc/omni_exchange_read',r=>{const p=r.request().postDataJSON();reads.push(p);return r.fulfill({json:{...state,rows:state.rows.filter((m:any)=>(!p.query||m.title.includes(p.query))&&(!p.category||m.category===p.category))}});});
 await page.route('**/rest/v1/rpc/omni_exchange_action',r=>{const p=r.request().postDataJSON();requests.push(p);if(uncertain){uncertain=false;return r.abort('failed');}return r.fulfill({json:{ok:true,id:p.action==='share'?shareId:orderId}});});
 await page.route('**/rest/v1/rpc/omni_exchange_admin',r=>{const p=r.request().postDataJSON();requests.push(p);return r.fulfill({json:{ok:true,id:marketId}});});
 await page.route('**/rest/v1/rpc/omni_exchange_card',r=>r.fulfill({json:{market:state.rows[0],...(r.request().postDataJSON().kind==='order'?{order:{side:'buy',outcome:'yes',price:60,state:'filled'},trader:{id:member,name:'Test writer',handle:'test_writer'},shared_at:new Date().toISOString()}:{} )}}));
 const historyReads:any[]=[];const base=Math.floor(Date.now()/60000)*60;
 const history:any={rows:Array.from({length:24},(_,i)=>({time:base-(23-i)*60,open:55+i%10,close:55+i%10,high:55+i%10,low:55+i%10,volume:String(200000+i*10000),trades:'2'})),has_more:false,next_before:null,step:60,server_time:new Date().toISOString(),from_time:null};
 await page.route('**/rest/v1/rpc/omni_exchange_history',r=>{historyReads.push(r.request().postDataJSON());return r.fulfill({json:history});});
 return {f,state,requests,reads,history,historyReads,lose:()=>{uncertain=true;}};
}
test('independent market discovery, detail, filters and five mobile languages show real data',async({page})=>{
 const s=await setup(page);await page.goto('/zh-CN/predictions/');await expect(page.locator('.exchange-market-tile')).toHaveCount(1);await expect(page.locator('.app-nav').getByRole('link',{name:'预测市场',exact:true})).toBeVisible();await expect(page.locator('.wallet-sections')).toHaveCount(0);
 await page.getByLabel('搜索预测市场').fill('不存在');await expect(page.locator('.exchange-market-tile')).toHaveCount(0);await page.getByLabel('搜索预测市场').fill('稳定');await expect(page.locator('.exchange-market-tile')).toHaveCount(1);
 await page.locator('.exchange-market-tile').click();await expect(page.locator('.trade-ticket')).toBeVisible();await expect(page.locator('.orderbook-columns')).toContainText('0.65');expect(s.requests).toEqual([]);await expect(page.locator('.history-canvas canvas').first()).toBeVisible();await page.screenshot({path:test.info().outputPath('prediction-desktop.png'),fullPage:true,animations:'disabled'});
 for(const locale of ['zh-CN','en','ja','es','zh-TW']){for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.goto(`/${locale}/predictions/?id=${marketId}`);await expect(page.locator('.trade-ticket')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
 await expect(page.locator('.history-canvas canvas').first()).toBeVisible();await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('prediction-mobile.png'),fullPage:true});
});
test('trade confirmation protects balances and retries the exact order after a lost response',async({page})=>{
 const s=await setup(page);s.lose();await page.goto(`/zh-CN/predictions/?id=${marketId}`);const ticket=page.locator('.trade-ticket');await ticket.getByLabel('限价（0.01–0.99 积分）').fill('0.67');await ticket.getByLabel('份额数量',{exact:true}).fill('12');await ticket.getByRole('button',{name:'核对订单',exact:true}).click();const dialog=page.getByRole('dialog',{name:'核对操作'});await expect(dialog).toContainText('8.04');expect(s.requests).toHaveLength(0);await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeDisabled();await page.reload();await expect(dialog).toContainText('12');await dialog.getByRole('button',{name:'重试',exact:true}).click();await expect(dialog).toHaveCount(0);expect(s.requests).toHaveLength(2);expect(s.requests[1]).toEqual(s.requests[0]);expect(s.requests[0].payload).toEqual({market:marketId,side:'buy',outcome:'yes',price:'67',quantity:'12',tif:'gtc'});
 await ticket.getByLabel('份额数量',{exact:true}).fill('1000000');await expect(ticket.getByRole('button',{name:'核对订单',exact:true})).toBeDisabled();
});
test('post and article editors insert verified market and own-order references',async({page})=>{
 const s=await setup(page,'super_admin');s.state.orders=[{id:orderId,sequence:'1',market_id:marketId,title:s.state.rows[0].title,side:'buy',outcome:'yes',price:60,quantity:'12',remaining:'0',filled:'12',state:'filled',created_at:new Date().toISOString(),held:'0'}];
 await page.goto('/zh-CN/write/');await page.getByRole('button',{name:'插入市场／订单',exact:true}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:s.state.rows[0].title}).click();await expect(page.locator('.editor-embed')).toContainText(marketId);
 page.once('dialog',d=>d.accept());await page.goto('/zh-CN/write/?kind=news');await page.getByRole('button',{name:'插入市场／订单',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'我的分享卡片',exact:true}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:s.state.rows[0].title}).click();const confirm=page.getByRole('dialog',{name:'核对操作'});await expect(confirm).toContainText('数量已隐藏');await confirm.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('.editor-embed')).toContainText(shareId);expect(s.requests[0].payload.show_amount).toBe(false);
});
test('a shared market opens in the writer and cards render in post lists and details',async({page})=>{
 const s=await setup(page);const url=`https://teamcn.org/zh-CN/predictions/?id=${marketId}`;
 await page.goto('/zh-CN/write/?prediction='+encodeURIComponent(url));await expect(page.locator('.editor-embed')).toContainText(marketId);
 s.f.articles.push(story(articleId,'关于预测市场的讨论',{media:[{type:'embed',url}],translations:{'zh-CN':{title:'',summary:'关于预测市场的讨论',body:'关于预测市场的讨论',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'关于预测市场的讨论'}]},{type:'embed',attrs:{url}}]}}}}));
 await page.goto('/zh-CN/');await expect(page.locator('.prediction-reference-compact')).toContainText(s.state.rows[0].title);await page.locator('.post-excerpt').click();await expect(page.locator('.prediction-reference').first()).toContainText('64%');
 await page.goto(`/zh-CN/predictions/?share=${shareId}`);await expect(page.locator('.prediction-reference')).toContainText('数量已隐藏');await expect(page.locator('.prediction-reference')).toContainText('@test_writer');
});
test('owner manages predictions separately and reviews publishing without automatic money writes',async({page})=>{
 const s=await setup(page,'super_admin');s.state.rows[0]=market({state:'draft',published_at:null});await page.goto('https://tree.teamcn.org/zh-CN/#predictions');await expect(page.locator('.exchange-admin')).toBeVisible();await expect(page.locator('.admin-navigation').getByRole('button',{name:'预测市场管理',exact:true})).toBeVisible();expect(s.requests).toEqual([]);await page.getByRole('button',{name:'开放交易',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('操作原因',{exact:true}).fill('审核规则、价格来源和公示期');await dialog.getByRole('button',{name:'核对操作',exact:true}).click();await expect(dialog).toContainText('截止时间将锁定');expect(s.requests).toEqual([]);await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).toHaveCount(0);expect(s.requests[0].action).toBe('publish');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('prediction-admin-mobile.png'),fullPage:true});
});
test('editors cannot reach prediction administration',async({page})=>{await setup(page,'editor');await page.goto('https://tree.teamcn.org/zh-CN/#predictions');await expect(page.locator('.overview-grid')).toBeVisible();await expect(page.locator('.exchange-admin')).toHaveCount(0);await expect(page.locator('.admin-navigation').getByRole('button',{name:'预测市场管理',exact:true})).toHaveCount(0);});

test('history loads only in details, supports periods, accessible data, themes and incremental refresh',async({page})=>{
 const s=await setup(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/zh-CN/predictions/');await expect(page.locator('.exchange-market-tile')).toBeVisible();expect(s.historyReads).toHaveLength(0);
 await page.locator('.exchange-market-tile').click();await expect(page.locator('.history-canvas canvas').first()).toBeVisible();await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','24');
 await page.getByRole('button',{name:'7天',exact:true}).click();await expect.poll(()=>s.historyReads.at(-1)?.period).toBe('1w');
 await page.locator('.history-table summary').click();await expect(page.locator('.history-table tbody tr')).toHaveCount(24);
 await page.locator('.history-table summary').click();await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('.history-ranges button[aria-pressed=true]')).toHaveCSS('background-color','rgb(34, 40, 51)');await expect(page.locator('.history-ranges button[aria-pressed=true]')).toHaveCSS('color','rgb(232, 235, 241)');await page.screenshot({path:test.info().outputPath('prediction-dark.png'),fullPage:true,animations:'disabled'});
 s.history.rows.push({...s.history.rows.at(-1),time:s.history.rows.at(-1).time+60,close:68,high:68});s.state.server_time=new Date(Date.now()+1000).toISOString();
 await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','25');expect(s.historyReads.at(-1).since_time).toBeTruthy();
 await page.locator('.market-information').getByRole('button',{name:'成交记录',exact:true}).click();await expect(page.locator('.market-activity tbody tr')).toHaveCount(15);
 await page.locator('.market-information').getByRole('button',{name:'规则',exact:true}).click();await expect(page.locator('.market-rules')).toContainText('官方发行记录');expect(errors).toEqual([]);expect(s.requests).toEqual([]);
});

test('history pagination is bounded and retained when refresh fails',async({page})=>{
 const s=await setup(page);s.history.has_more=true;await page.goto(`/en/predictions/?id=${marketId}`);await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','24');
 const old=s.history.rows[0].time;s.history.rows=Array.from({length:24},(_,i)=>({...s.history.rows[0],time:old-(24-i)*60}));s.history.has_more=false;
 await page.getByRole('button',{name:'Load earlier history',exact:true}).click();await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','48');expect(s.historyReads.at(-1).before_time).toBe(new Date(old*1000).toISOString());
 await page.route('**/rest/v1/rpc/omni_exchange_history',r=>r.fulfill({status:503,json:{message:'Unavailable'}}));s.state.server_time=new Date(Date.now()+1000).toISOString();await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(page.locator('.market-history [role=alert]')).toContainText('last confirmed');await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','48');
 await page.getByRole('button',{name:'1H',exact:true}).click();await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','0');await expect(page.locator('.history-canvas')).toHaveCount(0);
});

test('book prices fill matching trade directions and mobile shows chart before order entry',async({page})=>{
 const s=await setup(page);s.state.positions=[{market_id:marketId,outcome:'yes',quantity:'25',reserved:'5',claimed:'0'}];await page.setViewportSize({width:390,height:844});await page.goto(`/zh-CN/predictions/?id=${marketId}`);const ticket=page.locator('.trade-ticket');await expect(ticket).toBeVisible();
 const chart=await page.locator('.market-chart-panel').boundingBox(),entry=await ticket.boundingBox();expect(chart!.y+chart!.height).toBeLessThan(entry!.y);
 await page.getByRole('button',{name:'使用此限价: 0.63 · 是',exact:true}).click();await expect(ticket.getByRole('button',{name:'卖出',exact:true})).toHaveAttribute('aria-pressed','true');await expect(ticket.getByLabel('限价（0.01–0.99 积分）')).toHaveValue('0.63');
 await expect(ticket.locator('.ticket-summary')).toContainText('可卖份额');await ticket.getByRole('button',{name:'最大',exact:true}).click();await expect(ticket.getByLabel('份额数量',{exact:true})).toHaveValue('20');
 await page.getByRole('button',{name:'使用此限价: 0.65 · 是',exact:true}).click();await expect(ticket.getByRole('button',{name:'买入',exact:true})).toHaveAttribute('aria-pressed','true');await expect(ticket.getByLabel('限价（0.01–0.99 积分）')).toHaveValue('0.65');expect(s.requests).toEqual([]);
});

test('hidden and offline markets stop polling, keep history, and recover on return',async({page,context})=>{
 const s=await setup(page);await page.goto(`/en/predictions/?id=${marketId}`);await expect(page.locator('.history-canvas canvas').first()).toBeVisible();await page.clock.install();
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 const reads=s.reads.length,histories=s.historyReads.length;await page.clock.fastForward(61000);expect(s.reads.length).toBe(reads);expect(s.historyReads.length).toBe(histories);
 await context.setOffline(true);await expect(page.getByRole('status').filter({hasText:'Offline'})).toBeVisible();await expect(page.locator('.market-history')).toHaveAttribute('data-history-count','24');await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(31000);expect(s.reads.length).toBe(reads);
 await context.setOffline(false);await expect.poll(()=>s.reads.length).toBeGreaterThan(reads);await expect(page.getByRole('status').filter({hasText:'Offline'})).toHaveCount(0);
});

test('paging personal orders retains the trade draft and mounted history',async({page})=>{
 const s=await setup(page);s.state.orders=Array.from({length:51},(_,i)=>({id:`order-${i}`,sequence:String(100-i),market_id:marketId,title:s.state.rows[0].title,side:'buy',outcome:'yes',price:60,quantity:'12',remaining:'0',filled:'12',state:'filled',created_at:new Date().toISOString(),held:'0'}));
 await page.goto(`/en/predictions/?id=${marketId}`);await expect(page.locator('.history-canvas canvas').first()).toBeVisible();const inputs=page.locator('.trade-ticket input');await inputs.nth(0).fill('0.42');await inputs.nth(1).fill('18');const historyCount=s.historyReads.length;
 await test.step('page through orders',async()=>{await page.locator('.market-account .exchange-pagination button').click({timeout:5000});await expect.poll(()=>s.reads.at(-1)?.before_order).toBe('51');});await expect(inputs.nth(0)).toHaveValue('0.42');await expect(inputs.nth(1)).toHaveValue('18');expect(s.historyReads.length).toBe(historyCount);expect(s.requests).toEqual([]);
});
