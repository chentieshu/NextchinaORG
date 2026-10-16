import {test,expect,type Page} from './test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Authenticated wallet requests are isolated browser fixtures.');
const treasury='TA2hxtb3asN8LUCiDX9PUMsdYQNNY5SRNA';
const order=(id='10000000-0000-4000-8000-000000000009')=>({id,address:treasury,requested_micro:'10000000',actual_micro:'10001200',points_per_usdt:1,expected_units:'100012',credited_units:'0',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString(),status:'waiting',credited_micro:'0',receipt_count:0});
const snapshot={purchased:'1000000',earned:'20000000',held:'0',deposits_enabled:false,tipping_enabled:false,withdrawals_enabled:false,withdrawal_min_units:'10000',points_per_usdt:1,withdrawal_fee_bps:'100',frozen:false};
async function walletFixture(page:Page,role='member'){
 const account=await fixture(page,role),wallet={...snapshot},requests:Record<string,any>[]=[],writes:Record<string,any>[]=[],deposit={treasury,enabled:true,healthy:true,order:null as ReturnType<typeof order>|null};
 const setup={treasury,heartbeat:null as string|null,unmatched:0,assigned:0,enabled:false,healthy:false,configured:true,email_verified:true};
 account.articles.push(story(articleId,'可打赏的分享',{author_id:'20000000-0000-4000-8000-000000000002',author_name:'Another writer',author_handle:'another_writer'}));
 await page.route('**/rest/v1/rpc/omni_wallet_*',async route=>{const resource=new URL(route.request().url()).pathname.split('/').at(-1);let data:any=[];
  if(resource==='omni_wallet_snapshot')data=wallet;
  if(resource==='omni_wallet_admin_setup'){const body=route.request().postDataJSON();if(typeof body?.enable_payments==='boolean'){writes.push(body);setup.enabled=body.enable_payments;wallet.deposits_enabled=wallet.tipping_enabled=wallet.withdrawals_enabled=setup.enabled;}data=setup;}
  if(resource==='omni_wallet_deposit_status')data={...deposit,enabled:wallet.deposits_enabled,server_time:new Date().toISOString()};
  if(resource==='omni_wallet_create_deposit_v2'){const body=route.request().postDataJSON();writes.push(body);deposit.order=order(body.request);data=deposit.order;}
  if(resource==='omni_wallet_admin_summary')data={accounts:0,journals:0,purchased:'0',earned:'0',held:'0',balanced:true,settings:wallet};
  if(resource==='omni_wallet_requests')data=requests;
  if(resource==='omni_wallet_tip'||resource==='omni_wallet_withdraw_v2'){writes.push(route.request().postDataJSON());data='20000000-0000-4000-8000-000000000077';}
  if(resource==='omni_wallet_review'){writes.push(route.request().postDataJSON());requests.length=0;data={};}
  await route.fulfill({json:data});
 });return{wallet,account,requests,writes,deposit,setup};
}
test('wallet stays closed, is localized and fits narrow layouts',async({page})=>{
 await walletFixture(page);for(const locale of ['zh-CN','en','ja','es','zh-TW']){await page.goto(`/${locale}/wallet/`);await expect(page.locator('.wallet-balance')).toContainText((2100n).toLocaleString(locale));await expect(page.locator('.wallet-actions button').first()).toBeEnabled();await expect(page.locator('.wallet-actions button').nth(1)).toBeDisabled();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 }
 await page.goto('/zh-CN/');await page.getByRole('button',{name:'打赏',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('资金功能尚未开放');await expect(page.getByRole('dialog').getByRole('button',{name:'确认',exact:true})).toBeDisabled();
});
test('a committed tip with a lost response retries the original key even after balance refresh',async({page})=>{
 const{wallet}=await walletFixture(page);wallet.tipping_enabled=true;wallet.purchased='100000';wallet.earned='0';const attempts:Record<string,any>[]=[];
 await page.route('**/rest/v1/rpc/omni_wallet_tip',async route=>{attempts.push(route.request().postDataJSON());if(attempts.length===1){wallet.purchased='0';return route.abort('failed');}return route.fulfill({json:'20000000-0000-4000-8000-000000000077'});});
 await page.goto('/zh-CN/');await page.getByRole('button',{name:'打赏',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('可用积分: 10');await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('尚未确认');await page.evaluate(()=>window.dispatchEvent(new Event('wallet:changed')));await expect(dialog).toContainText('可用积分: 0');await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).toHaveCount(0);expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);
});
test('withdrawal reviews exact net amount, validates checksum, and submits one idempotent request',async({page})=>{
 const{wallet,writes}=await walletFixture(page);wallet.withdrawals_enabled=true;await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'提现',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('积分数量').fill('1000');await dialog.getByLabel('TRON 收款地址').fill('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU8');await dialog.getByRole('button',{name:'核对提现'}).click();await expect(dialog.getByRole('alert')).toContainText('有效的 TRON');expect(writes).toHaveLength(0);
 await dialog.getByLabel('TRON 收款地址').fill('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');await dialog.getByRole('button',{name:'核对提现'}).click();await expect(dialog).toContainText('990.00 USDT');await expect(dialog.getByLabel('TRON 收款地址')).toBeDisabled();await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toHaveLength(1);expect(writes[0].amount).toBe('10000000');
});
test('failed wallet reads show errors, and only the owner sees the financial queue',async({page})=>{
 const{requests}=await walletFixture(page,'super_admin');await page.route('**/rest/v1/rpc/omni_wallet_snapshot',route=>route.fulfill({status:503,json:{message:'unavailable'}}));await page.goto('/zh-CN/wallet/');await expect(page.locator('main').getByRole('alert')).toContainText('无法读取钱包');await expect(page.locator('.wallet-balance')).toHaveCount(0);
 requests.push({id:'20000000-0000-4000-8000-000000000077',user_id:'20000000-0000-4000-8000-000000000002',display_name:'Another writer',handle:'another_writer',units:'10000000',fee_units:'100000',destination:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',status:'pending',created_at:new Date().toISOString(),tx_hash:null});
 await page.goto('/zh-CN/admin/');await page.getByRole('button',{name:'钱包管理',exact:true}).click();await expect(page.locator('.wallet-admin')).toContainText('账本借贷平衡');await expect(page.locator('.wallet-withdrawals')).toContainText('990.00 USDT');for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'拒绝并解冻'}).click();await expect(page.locator('.wallet-withdrawals li')).toHaveCount(0);
});

test('payout preserves uncertain transactions for verification with the original hash',async({page})=>{
 const{requests}=await walletFixture(page,'super_admin');
 requests.push({id:'20000000-0000-4000-8000-000000000077',user_id:'20000000-0000-4000-8000-000000000002',display_name:'Another writer',handle:'another_writer',units:'1000000',fee_units:'10000',destination:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',status:'processing',created_at:new Date().toISOString(),tx_hash:null});
 const calls:Record<string,any>[]=[];await page.route('https://wallet.teamcn.org/v1/payout/verify',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'POST,OPTIONS'}});calls.push(route.request().postDataJSON());if(calls.length===1)return route.fulfill({status:503,json:{error:'verification_pending'},headers:{'Access-Control-Allow-Origin':'*'}});requests.length=0;return route.fulfill({json:{status:'paid'},headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.goto('/zh-CN/admin/');await page.getByRole('button',{name:'钱包管理',exact:true}).click();await expect(page.locator('.wallet-withdrawals')).toContainText('100 积分');await expect(page.locator('.wallet-withdrawals')).toContainText('99.00 USDT');
 const form=page.locator('.wallet-payout-form');await form.getByLabel('链上交易哈希').fill('a'.repeat(64));await form.getByRole('button',{name:'核验付款',exact:true}).click();await expect(form.getByRole('alert')).toContainText('暂未确认付款');await expect(form.getByLabel('链上交易哈希')).toHaveValue('a'.repeat(64));
 await form.getByRole('button',{name:'核验付款',exact:true}).click();await expect(page.locator('.wallet-withdrawals li')).toHaveCount(0);expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
});


test('deposit orders show exact amounts and address QR without wallet extensions in every locale',async({page})=>{
 const{wallet,deposit,writes}=await walletFixture(page);wallet.deposits_enabled=true;
 for(const locale of ['zh-CN','en','ja','es','zh-TW']){
  deposit.order=null;await page.goto('/'+locale+'/wallet/');await page.locator('.wallet-actions button').first().click();const dialog=page.getByRole('dialog');
  await expect(dialog.locator('.wallet-qr')).toHaveCount(0);await dialog.locator('form input').fill('0.99');await expect(dialog.locator('form button')).toBeDisabled();
  await dialog.locator('form input').fill('10');await dialog.locator('form button').click();await expect(dialog.getByTestId('deposit-amount')).toHaveText('10.0012 USDT');await expect(dialog.locator('.wallet-qr svg')).toBeVisible();await expect(dialog).toContainText(treasury);await expect(dialog.locator('.wallet-quote')).toContainText((10.0012).toLocaleString(locale,{maximumFractionDigits:4}));
  expect(writes.at(-1)?.amount).toBe('10000000');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  if(locale==='zh-CN'){await page.setViewportSize({width:390,height:1000});await page.screenshot({path:test.info().outputPath('wallet-deposit-mobile.png'),fullPage:true});}
 }
});

test('lost order responses retry the original request and recover a committed order',async({page})=>{
 const{wallet,deposit}=await walletFixture(page);wallet.deposits_enabled=true;const attempts:Record<string,any>[]=[];
 await page.route('**/rest/v1/rpc/omni_wallet_create_deposit_v2',async route=>{const body=route.request().postDataJSON();attempts.push(body);if(attempts.length===1)return route.abort('failed');deposit.order=order(body.request);return route.abort('failed');});
 await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'充值 USDT',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'创建充值订单'}).click();await expect(dialog.getByRole('alert')).toContainText('尚未确认');await dialog.getByRole('button',{name:'创建充值订单'}).click();await expect(dialog.locator('.wallet-qr svg')).toBeVisible();expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);
 await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.endsWith(':deposit')).length)).toBe(0);
 deposit.order!.status='paid';deposit.order!.credited_micro='10001200';deposit.order!.credited_units='100012';deposit.order!.receipt_count=1;
 await dialog.getByRole('button',{name:'刷新状态'}).click();await expect(dialog).toContainText('充值已到账');await expect(dialog).toContainText('10.0012');await expect(dialog.locator('.wallet-qr')).toHaveCount(0);
});

test('paused, expired and unreadable orders hide actionable payment details',async({page})=>{
 const{wallet,deposit}=await walletFixture(page);deposit.order=order();await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'充值 USDT',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('请勿转账');await expect(dialog).not.toContainText(treasury);await expect(dialog.locator('.wallet-qr')).toHaveCount(0);
 wallet.deposits_enabled=true;await dialog.getByRole('button',{name:'刷新状态'}).click();await expect(dialog.locator('.wallet-qr svg')).toBeVisible();
 deposit.order.expires_at=new Date(Date.now()-1000).toISOString();await dialog.getByRole('button',{name:'刷新状态'}).click();await expect(dialog).toContainText('订单已过期');await expect(dialog).not.toContainText(treasury);
 deposit.order=order();await dialog.getByRole('button',{name:'刷新状态'}).click();await expect(dialog.locator('.wallet-qr svg')).toBeVisible();
 await page.route('**/rest/v1/rpc/omni_wallet_deposit_status',route=>route.fulfill({status:503,json:{message:'unavailable'}}));await dialog.getByRole('button',{name:'刷新状态'}).click();await expect(dialog.getByRole('alert')).toContainText('无法确认最新状态');await expect(dialog.locator('.wallet-qr')).toHaveCount(0);await expect(dialog).not.toContainText(treasury);
});

async function openWalletAdmin(page:Page,locale='zh-CN'){
 await page.goto(`https://tree.teamcn.org/${locale}/`);
 // The wallet tab has a stable position in the owner's admin navigation.
 await page.getByRole('button',{name:({en:'Wallet',ja:'ウォレット管理',es:'Cartera','zh-TW':'錢包管理','zh-CN':'钱包管理'} as Record<string,string>)[locale],exact:true}).click();
 await expect(page.locator('.wallet-gateway')).toBeVisible();
}

test('payment switch uses an in-page confirmation when native dialogs are blocked',async({page})=>{
 await page.addInitScript(()=>{window.confirm=()=>false;});
 const{setup,writes}=await walletFixture(page,'super_admin');setup.healthy=true;setup.heartbeat='2000-01-01T00:00:00Z';
 await openWalletAdmin(page);const panel=page.locator('.wallet-gateway');
 await expect(panel).toContainText('连接正常');await expect(panel.getByText('Cloudflare 需要两个独立 Secret',{exact:false})).not.toBeVisible();
 await panel.getByRole('button',{name:'开放资金功能',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('最低提现 1 USDT');expect(writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(panel.getByRole('status')).toHaveText('充值、打赏和提现已开放。');expect(writes).toEqual([{enable_payments:true}]);
 await panel.getByRole('button',{name:'暂停新增资金操作'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
 await expect(panel.getByRole('status')).toHaveText('已暂停新增充值、打赏和提现。');expect(writes).toHaveLength(2);
});

test('missing email verification has a clear explanation and a working settings link',async({page})=>{
 const{setup,writes}=await walletFixture(page,'super_admin');setup.healthy=true;setup.email_verified=false;
 await openWalletAdmin(page);await page.locator('.wallet-gateway').getByRole('button',{name:'开放资金功能',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('需要完成邮箱验证码验证');await expect(dialog.getByRole('button',{name:'确认',exact:true})).toBeDisabled();expect(writes).toHaveLength(0);
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:test.info().outputPath('wallet-activation-mfa.png'),fullPage:true});
 await dialog.getByRole('link',{name:'前往邮箱验证'}).click();await expect(page).toHaveURL(/settings\/#email-verification$/);await expect(page.locator('#email-verification')).toBeVisible();
});

test('offline listener blocks opening with a reason but still permits pausing',async({page})=>{
 const{setup,writes}=await walletFixture(page,'super_admin');await openWalletAdmin(page);const panel=page.locator('.wallet-gateway');
 await panel.getByRole('button',{name:'开放资金功能',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('近期没有成功扫描');await expect(dialog.getByRole('button',{name:'确认',exact:true})).toBeDisabled();expect(writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'关闭',exact:true}).last().click();setup.enabled=true;
 await panel.getByRole('button',{name:'刷新状态'}).click();await panel.getByRole('button',{name:'暂停新增资金操作'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect(panel.getByRole('status')).toHaveText('已暂停新增充值、打赏和提现。');
});

test('lost activation response reconciles the committed state without resubmitting',async({page})=>{
 const{setup,account}=await walletFixture(page,'super_admin');setup.healthy=true;const writes:unknown[]=[];
 await page.route('**/rest/v1/rpc/omni_wallet_admin_setup',async route=>{const body=route.request().postDataJSON();if(typeof body?.enable_payments==='boolean'){writes.push(body);setup.enabled=body.enable_payments;return route.abort('failed');}return route.fulfill({json:setup});});
 await openWalletAdmin(page);await page.locator('.wallet-gateway').getByRole('button',{name:'开放资金功能',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.wallet-gateway').getByRole('status')).toContainText('已开放');expect(writes).toHaveLength(1);expect(account.profile.role).toBe('super_admin');
});

test('activation shows progress, prevents repeat writes and retains rejected results after refresh',async({page})=>{
 const{setup}=await walletFixture(page,'super_admin');setup.healthy=true;let attempts=0,release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/rest/v1/rpc/omni_wallet_admin_setup',async route=>{const body=route.request().postDataJSON();if(typeof body?.enable_payments==='boolean'){attempts++;await held;return route.fulfill({status:403,json:{code:'PT403',message:'Wallet access denied'}});}return route.fulfill({json:setup});});
 await openWalletAdmin(page);const panel=page.locator('.wallet-gateway');await panel.getByRole('button',{name:'开放资金功能',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'确认',exact:true}).click();
 const saving=dialog.getByRole('button',{name:'正在保存…'});await expect(saving).toBeDisabled();await saving.evaluate((button:HTMLButtonElement)=>button.click());expect(attempts).toBe(1);release();
 await expect(dialog.getByRole('alert')).toHaveText('只有总管理员可以修改资金开关。');await dialog.getByRole('button',{name:'关闭',exact:true}).last().click();
 await panel.getByRole('button',{name:'刷新状态'}).click();await expect(panel.getByRole('alert')).toHaveText('只有总管理员可以修改资金开关。');await expect(panel.getByRole('status')).toHaveCount(0);
});

test('server email verification rejection is actionable and unavailable reads do not show stale readiness',async({page})=>{
 const{setup}=await walletFixture(page,'super_admin');setup.healthy=true;let failRead=false;
 await page.route('**/rest/v1/rpc/omni_wallet_admin_setup',async route=>{const body=route.request().postDataJSON();if(typeof body?.enable_payments==='boolean')return route.fulfill({status:401,json:{code:'PT401',message:'Wallet email verification required'}});if(failRead)return route.fulfill({status:503,json:{message:'unavailable'}});return route.fulfill({json:setup});});
 await openWalletAdmin(page);const panel=page.locator('.wallet-gateway');await panel.getByRole('button',{name:'开放资金功能',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'确认',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('需要完成邮箱验证码验证');await expect(dialog.getByRole('link',{name:'前往邮箱验证'})).toBeVisible();await dialog.getByRole('button',{name:'关闭',exact:true}).last().click();
 failRead=true;await panel.getByRole('button',{name:'刷新状态'}).click();await expect(panel.getByRole('alert').first()).toContainText('无法确认最新设置');await expect(panel.getByRole('button',{name:'开放资金功能',exact:true})).toBeDisabled();await expect(panel.locator('dl')).not.toContainText('连接正常');
});
