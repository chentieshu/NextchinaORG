import {test,expect,type Page} from './test';
import {fixture,member} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Isolated financial fixtures only');
const id='30000000-0000-4000-8000-000000000021';
async function setup(page:Page){
 const f=await fixture(page);f.emailVerified=true;f.emailExpires=Date.now()+600000;
 const start=Math.floor(Date.now()/180000)*180000,now=start+60999;
 const market={id,series_id:'btc-3m',title:'BTC 3m · UTC',opens_at:new Date(start).toISOString(),closes_at:new Date(start+180000).toISOString(),opening_price:'65000.00000000',source_ready:true,state:'open',result:null,oracle:null,rules:'BTCUSDT 3m close >= open',source_url:'https://api-gcp.binance.com/',category:'Crypto',volume:'0',last_yes:null,created_at:new Date(start).toISOString(),updated_at:new Date(start).toISOString(),published_at:new Date(start).toISOString(),creator_id:member,creator_name:'Teamcn',creator_handle:'teamcn',collateral:'0',dispute_seconds:300,resolution_note:'',evidence_url:'',resolve_after:null};
 const state={rows:[market],server_time:new Date(now).toISOString(),categories:[],book:[{side:'sell',outcome:'yes',price:65,quantity:'100'},{side:'buy',outcome:'yes',price:63,quantity:'100'}],orders:[],positions:[],shares:[],trades:[],balance:{purchased:'10000000',earned:'0',held:'0'}};
 const prices={start,end:start+180000,observed_at:now,last_at:now,complete:false,points:Array.from({length:61},(_,i)=>({time:start+i*1000,price:(65000+Math.sin(i/5)*16+i/2).toFixed(8)}))};
 const reads:any[]=[],writes:any[]=[],histories:any[]=[],details:any[]=[];let fail=false;
 const rounds=new Map([[id,state]]),series={id:'btc-3m',enabled:true,healthy:true,server_time:state.server_time,current:market,next:null,history:[]};
 await page.route('**/rest/v1/rpc/omni_exchange_official_read',r=>r.fulfill({json:series}));
 await page.route('**/rest/v1/rpc/omni_exchange_read',r=>{const p=r.request().postDataJSON();details.push(p);return r.fulfill({json:rounds.get(p.market_id)??state});});
 await page.route('**/rest/v1/rpc/omni_exchange_history',r=>{histories.push(r.request().postDataJSON());return r.fulfill({json:{rows:[],step:60,has_more:false,next_before:null,server_time:state.server_time,from_time:null}});});
 await page.route('**/rest/v1/rpc/omni_exchange_quote',r=>{const p=r.request().postDataJSON();return r.fulfill({json:{filled:p.shares,unfilled:'0',units:String(Number(p.shares)*p.limit_price*100),worst:p.limit_price,limited:false,server_time:state.server_time}});});
 await page.route('**/rest/v1/rpc/omni_exchange_action',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,filled:'10',remaining:'0',state:'filled'}});});
 await page.route('https://wallet.teamcn.org/v1/markets/btc?*',r=>{reads.push({url:r.request().url(),headers:r.request().headers()});return fail?r.fulfill({status:503,json:{error:'price_unavailable'}}):r.fulfill({json:prices});});
 return{start,market,state,prices,reads,writes,histories,details,series,rounds,next:()=>{
 const nextId='30000000-0000-4000-8000-000000000022',nextStart=start+180000;
 const next={...market,id:nextId,title:'BTC next round',opens_at:new Date(nextStart).toISOString(),closes_at:new Date(nextStart+180000).toISOString(),opening_price:'66000.00000000'};
 const nextState={...state,rows:[next],server_time:new Date(nextStart+60000).toISOString()};rounds.set(nextId,nextState);series.current=next;series.server_time=nextState.server_time;
 Object.assign(prices,{start:nextStart,end:nextStart+180000,observed_at:nextStart+60000,last_at:nextStart+60000,points:Array.from({length:61},(_,i)=>({time:nextStart+i*1000,price:'66010.00000000'}))});return nextId;
 },fail:()=>{fail=true;}};
}

test('official detail separates BTC and share prices, preserves limit drafts and reviews the selected outcome',async({page})=>{
 const s=await setup(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`/zh-CN/predictions/?id=${id}`);
 await expect(page.locator('.btc-chart-canvas canvas').first()).toBeVisible();await expect(page.getByTestId('btc-current')).toContainText('65,021.41');await expect(page.getByTestId('btc-opening')).toContainText('65,000.00');await expect(page.locator('.btc-timer b')).toHaveText(/1:5[0-9]/);expect(s.histories).toHaveLength(0);
 const ticket=page.locator('.btc-ticket');await expect(ticket.locator('input').nth(0)).toHaveValue('0.65');await ticket.getByRole('button',{name:/↓ 下跌/}).click();await expect(ticket.locator('input').nth(0)).toHaveValue('0.37');await ticket.getByRole('button',{name:'50',exact:true}).click();await expect(ticket.getByLabel('份额数量',{exact:true})).toHaveValue('50');
 await ticket.locator('input').nth(0).fill('0.40');s.state.book[1].price=60;await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(ticket.getByRole('button',{name:/↓ 下跌/})).toContainText('0.4');await expect(ticket.locator('input').nth(0)).toHaveValue('0.40');
 await ticket.getByRole('button',{name:'核对买入 · 下跌',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('买入 · 下跌');expect(s.writes).toHaveLength(0);await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect.poll(()=>s.writes.length).toBe(1);expect(s.writes[0].payload).toMatchObject({market:id,outcome:'no',price:'40',quantity:'50'});
 await page.locator('.market-information').getByRole('button',{name:'份额价格',exact:true}).click();await expect.poll(()=>s.histories.length).toBe(1);expect(s.reads[0].headers.authorization).toBeUndefined();expect(errors).toEqual([]);
});

test('official price detail fits five languages and mobile widths with chart before trade',async({page})=>{
 test.setTimeout(90000);
 await setup(page);for(const locale of ['zh-CN','en','ja','es','zh-TW']){for(const width of [320,390,768,901,1024,1200,1600]){await page.setViewportSize({width,height:844});await page.goto(`/${locale}/predictions/?id=${id}`);await expect(page.locator('.btc-chart-canvas canvas').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const chart=await page.locator('.btc-detail').boundingBox(),ticket=await page.locator('.btc-ticket').boundingBox();if(width<=900)expect(chart!.y+chart!.height).toBeLessThan(ticket!.y);}}
 await page.setViewportSize({width:390,height:844});await page.goto(`/zh-CN/predictions/?id=${id}`);await expect(page.locator('.btc-chart-canvas canvas').first()).toBeVisible();await page.screenshot({path:test.info().outputPath('btc-detail-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:test.info().outputPath('btc-detail-desktop.png'),fullPage:true});await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:test.info().outputPath('btc-detail-dark.png'),fullPage:true});
 await page.setViewportSize({width:1920,height:1080});const chart=await page.locator('.btc-detail').boundingBox(),book=await page.locator('.market-information').boundingBox(),ticket=await page.locator('.btc-ticket').boundingBox();expect(chart!.x+chart!.width).toBeLessThan(book!.x);expect(book!.x+book!.width).toBeLessThan(ticket!.x);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1920);await page.screenshot({path:test.info().outputPath('btc-terminal-wide.png'),fullPage:true});
});

test('BTC display retains failed prices, stops hidden/offline polling and closes entry at expiry',async({page,context})=>{
 const s=await setup(page);await page.goto(`/en/predictions/?id=${id}`);await expect(page.locator('.btc-chart-canvas canvas').first()).toBeVisible();await page.clock.install();const price=await page.getByTestId('btc-current').textContent();
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});const count=s.reads.length;await page.clock.fastForward(15000);expect(s.reads).toHaveLength(count);
 s.fail();await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.btc-feed-state')).toContainText('Price delayed');await expect(page.getByTestId('btc-current')).toHaveText(price!);
 await context.setOffline(true);const offline=s.reads.length;await page.clock.fastForward(15000);expect(s.reads).toHaveLength(offline);await context.setOffline(false);await expect.poll(()=>s.reads.length).toBeGreaterThan(offline);
 await page.clock.fastForward(150000);await expect(page.locator('.btc-timer')).toContainText('Round ended');await expect(page.locator('.btc-ticket button[type=submit]')).toBeDisabled();expect(s.writes).toHaveLength(0);
});

test('future BTC rounds do not fetch prices and empty books never invent executable quotes',async({page})=>{
 const s=await setup(page);s.market.opens_at=new Date(s.start+180000).toISOString();s.market.closes_at=new Date(s.start+360000).toISOString();s.market.source_ready=false;s.state.book=[];await page.goto(`/en/predictions/?id=${id}`);await expect(page.locator('.btc-chart-placeholder')).toContainText('when this round starts');await expect(page.locator('.btc-timer')).toContainText('Starts in');await expect(page.locator('.btc-ticket')).toContainText('No quote');expect(s.reads).toHaveLength(0);await expect(page.locator('.btc-ticket button[type=submit]')).toBeDisabled();
});

test('home trades the current round directly and resets drafts only when the round changes',async({page})=>{
 const s=await setup(page);await page.clock.install();await page.goto('/zh-CN/');await expect(page.getByTestId('btc-current')).toContainText('65,021.41');await expect(page.getByTestId('btc-opening')).toContainText('65,000.00');await expect(page.locator('.btc-timer b')).toHaveText(/1:5[0-9]/);
 await expect(page).toHaveURL(/\/zh-CN\/$/);await expect(page.locator('.market-table,.official-strip')).toHaveCount(0);expect(s.details.every(r=>r.market_id===id)).toBe(true);expect(s.histories).toHaveLength(0);
 const quantity=page.locator('.btc-ticket').getByLabel('份额数量',{exact:true});await quantity.fill('25');await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(quantity).toHaveValue('25');
 const next=s.next();await page.clock.fastForward(120000);await expect(page.getByTestId('btc-opening')).toContainText('66,000.00');await expect(quantity).toHaveValue('');await expect(page.locator('.terminal-round-notice')).toContainText('已进入新一轮');expect(s.details.at(-1).market_id).toBe(next);expect(s.writes).toHaveLength(0);
 await page.locator('.terminal-header').getByRole('link',{name:'我的持仓',exact:true}).click();await expect(page).toHaveURL(/predictions\/\?view=portfolio/);
});

test('home preserves an uncertain order across rollover and retries the same request for its original round',async({page})=>{
 const s=await setup(page),attempts:any[]=[];await page.route('**/rest/v1/rpc/omni_exchange_action',r=>{attempts.push(r.request().postDataJSON());return attempts.length===1?r.abort('failed'):r.fulfill({json:{ok:true,filled:'10',remaining:'0',state:'filled'}});});
 await page.goto('/en/');await page.locator('.btc-ticket').getByLabel('Shares',{exact:true}).fill('10');await page.locator('.btc-ticket button[type=submit]').click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'Retry',exact:true})).toBeVisible();
 const next=s.next();await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(page.locator('.terminal-round-notice')).toContainText('Finish reviewing');await expect(page.getByTestId('btc-opening')).toContainText('65,000.00');await expect(page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();
 expect(s.details.some(r=>r.market_id===next)).toBe(false);await page.getByRole('dialog').getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('btc-opening')).toContainText('66,000.00');expect(attempts).toHaveLength(2);expect(attempts[0].request).toBe(attempts[1].request);expect(attempts[1].payload.market).toBe(id);await expect(page.locator('.btc-ticket').getByLabel('Shares',{exact:true})).toHaveValue('');
});

test('home blocks ordering when the series is unhealthy and recovers without losing a draft',async({page})=>{
 const s=await setup(page);await page.goto('/en/');const quantity=page.locator('.btc-ticket').getByLabel('Shares',{exact:true}),submit=page.locator('.btc-ticket button[type=submit]');await quantity.fill('10');await expect(submit).toBeEnabled();
 s.series.healthy=false;await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(submit).toBeDisabled();await expect(page.getByTestId('btc-opening')).toContainText('65,000.00');s.series.healthy=true;await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(submit).toBeEnabled();await expect(quantity).toHaveValue('10');expect(s.writes).toHaveLength(0);
});

test('home keeps prices and the order panel close on phones in five languages and both themes',async({page})=>{
 test.setTimeout(90000);await setup(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const theme of ['light','dark'] as const){await page.emulateMedia({colorScheme:theme});for(const locale of ['zh-CN','en','ja','es','zh-TW']){for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});await page.goto(`/${locale}/`);await expect(page.locator('.btc-chart-canvas canvas').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);const chart=await page.locator('.btc-detail').boundingBox(),ticket=await page.locator('.btc-ticket').boundingBox();
  if(width<=900){expect(ticket!.y).toBeGreaterThan(chart!.y+chart!.height);if(width<=390)expect(ticket!.y).toBeLessThan(760);}else expect(ticket!.x).toBeGreaterThan(chart!.x+chart!.width);
  if(locale==='zh-CN'&&[390,1440,1920].includes(width))await page.screenshot({path:test.info().outputPath(`btc-home-${theme}-${width}.png`),fullPage:true});
 }}}expect(errors).toEqual([]);
});
