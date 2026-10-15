import {test,expect,type Page} from '@playwright/test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.LIVE_SUPABASE,'Authenticated wallet requests are isolated browser fixtures.');
const snapshot={purchased:'1000000',earned:'20000000',held:'0',deposits_enabled:false,tipping_enabled:false,withdrawals_enabled:false,withdrawal_min_units:'1000000',withdrawal_fee_bps:'100',frozen:false};
async function walletFixture(page:Page,role='member'){
 const account=await fixture(page,role),wallet={...snapshot},requests:Record<string,any>[]=[],writes:Record<string,any>[]=[],deposit={treasury:'TA2hxtb3asN8LUCiDX9PUMsdYQNNY5SRNA',enabled:true,healthy:true,payers:[] as {address:string;verified_at:string}[]};
 account.articles.push(story(articleId,'可打赏的分享',{author_id:'20000000-0000-4000-8000-000000000002',author_name:'Another writer',author_handle:'another_writer'}));
 await page.route('**/rest/v1/rpc/omni_wallet_*',async route=>{const resource=new URL(route.request().url()).pathname.split('/').at(-1);let data:any=[];
  if(resource==='omni_wallet_snapshot')data=wallet;
  if(resource==='omni_wallet_admin_setup')data={treasury:deposit.treasury,heartbeat:null,unmatched:0,assigned:0,enabled:false};
  if(resource==='omni_wallet_deposit_status')data={...deposit,enabled:wallet.deposits_enabled};
  if(resource==='omni_wallet_deposit_challenge'){writes.push(route.request().postDataJSON());data={id:'10000000-0000-4000-8000-000000000009',address:route.request().postDataJSON().payer_address,message:'chinateam.org: Test-only signature challenge'};}
  if(resource==='omni_wallet_admin_summary')data={accounts:0,journals:0,purchased:'0',earned:'0',held:'0',balanced:true,settings:wallet};
  if(resource==='omni_wallet_requests')data=requests;
  if(resource==='omni_wallet_tip'||resource==='omni_wallet_withdraw'){writes.push(route.request().postDataJSON());data='20000000-0000-4000-8000-000000000077';}
  if(resource==='omni_wallet_review'){writes.push(route.request().postDataJSON());requests.length=0;data={};}
  await route.fulfill({json:data});
 });return{wallet,account,requests,writes,deposit};
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
 await dialog.getByLabel('TRON 收款地址').fill('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');await dialog.getByRole('button',{name:'核对提现'}).click();await expect(dialog).toContainText('9.90 USDT');await expect(dialog.getByLabel('TRON 收款地址')).toBeDisabled();await dialog.getByRole('button',{name:'确认',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toHaveLength(1);expect(writes[0].amount).toBe('10000000');
});
test('failed wallet reads show errors, and only the owner sees the financial queue',async({page})=>{
 const{requests}=await walletFixture(page,'super_admin');await page.route('**/rest/v1/rpc/omni_wallet_snapshot',route=>route.fulfill({status:503,json:{message:'unavailable'}}));await page.goto('/zh-CN/wallet/');await expect(page.locator('main').getByRole('alert')).toContainText('无法读取钱包');await expect(page.locator('.wallet-balance')).toHaveCount(0);
 requests.push({id:'20000000-0000-4000-8000-000000000077',user_id:'20000000-0000-4000-8000-000000000002',display_name:'Another writer',handle:'another_writer',units:'10000000',fee_units:'100000',destination:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',status:'pending',created_at:new Date().toISOString(),tx_hash:null});
 await page.goto('/zh-CN/admin/');await page.getByRole('button',{name:'钱包管理',exact:true}).click();await expect(page.locator('.wallet-admin')).toContainText('账本借贷平衡');await expect(page.locator('.wallet-withdrawals')).toContainText('9.90 USDT');for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'拒绝并解冻'}).click();await expect(page.locator('.wallet-withdrawals li')).toHaveCount(0);
});

test('deposit requires a verified TronLink payer and payout preserves uncertain transactions',async({page})=>{
 const{wallet,requests,deposit}=await walletFixture(page,'super_admin');wallet.deposits_enabled=true;
 await tronLinkFixture(page);
 await page.route('https://wallet.chinateam.org/v1/deposit/verify-address',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'POST,OPTIONS'}});expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(['challenge','signature']);deposit.payers.push({address:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',verified_at:new Date().toISOString()});return route.fulfill({json:{status:'verified'},headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'充值 USDT',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).not.toContainText(deposit.treasury);await dialog.getByRole('button',{name:'连接并验证 TronLink'}).click();
 await expect(dialog).toContainText('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');await expect(dialog).toContainText(deposit.treasury);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.evaluate(()=>(window as any).walletTest.emit('accountsChanged'));await expect(dialog).not.toContainText(deposit.treasury);await expect(dialog.getByRole('alert')).toContainText('已变化');
 requests.push({id:'20000000-0000-4000-8000-000000000077',user_id:'20000000-0000-4000-8000-000000000002',display_name:'Another writer',handle:'another_writer',units:'1000000',fee_units:'10000',destination:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',status:'processing',created_at:new Date().toISOString(),tx_hash:null});
 const calls:Record<string,any>[]=[];await page.route('https://wallet.chinateam.org/v1/payout/verify',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'POST,OPTIONS'}});calls.push(route.request().postDataJSON());if(calls.length===1)return route.fulfill({status:503,json:{error:'verification_pending'},headers:{'Access-Control-Allow-Origin':'*'}});requests.length=0;return route.fulfill({json:{status:'paid'},headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.goto('/zh-CN/admin/');await page.getByRole('button',{name:'钱包管理',exact:true}).click();await expect(page.locator('.wallet-withdrawals')).toContainText('100 积分');await expect(page.locator('.wallet-withdrawals')).toContainText('0.99 USDT');
 const form=page.locator('.wallet-payout-form');await form.getByLabel('链上交易哈希').fill('a'.repeat(64));await form.getByRole('button',{name:'核验付款',exact:true}).click();await expect(form.getByRole('alert')).toContainText('暂未确认付款');await expect(form.getByLabel('链上交易哈希')).toHaveValue('a'.repeat(64));
 await form.getByRole('button',{name:'核验付款',exact:true}).click();await expect(page.locator('.wallet-withdrawals li')).toHaveCount(0);expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
});

async function tronLinkFixture(page:Page){await page.addInitScript(()=>{
 const listeners:Record<string,Set<()=>void>>={},test={chain:'2b6653dc',reject:false,emit:(event:string)=>listeners[event]?.forEach(fn=>fn())};
 (window as any).walletTest=test;
 (window as any).tron={request:async()=>['TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7'],on:(event:string,fn:()=>void)=>(listeners[event]??=new Set()).add(fn),removeListener:(event:string,fn:()=>void)=>listeners[event]?.delete(fn),tronWeb:{defaultAddress:{base58:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7'},trx:{getBlockByNumber:async()=>({blockID:'0'.repeat(56)+test.chain}),signMessageV2:async(message:string)=>{if(test.reject)throw 'Confirmation declined by user';return '0x'+'1'.repeat(130);}}}};
 });}

test('TronLink rejects wrong networks and cancelled signatures without showing a receiver',async({page})=>{
 const{wallet,deposit,writes}=await walletFixture(page);wallet.deposits_enabled=true;await tronLinkFixture(page);await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'充值 USDT',exact:true}).click();const dialog=page.getByRole('dialog');
 await page.evaluate(()=>(window as any).walletTest.chain='cd8690dc');await dialog.getByRole('button',{name:'连接并验证 TronLink'}).click();await expect(dialog.getByRole('alert')).toContainText('主网');expect(writes).toHaveLength(0);await expect(dialog).not.toContainText(deposit.treasury);
 await page.evaluate(()=>{(window as any).walletTest.chain='2b6653dc';(window as any).walletTest.reject=true;});await dialog.getByRole('button',{name:'连接并验证 TronLink'}).click();await expect(dialog.getByRole('alert')).toContainText('已取消签名');await expect(dialog).not.toContainText(deposit.treasury);
});

test('paused deposits allow preparing a verified wallet but never expose payment instructions',async({page})=>{
 const{deposit}=await walletFixture(page);deposit.payers.push({address:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',verified_at:new Date().toISOString()});await tronLinkFixture(page);await page.goto('/zh-CN/wallet/');await page.getByRole('button',{name:'充值 USDT',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'连接并验证 TronLink'}).click();await expect(dialog).toContainText('已验证的付款地址');await expect(dialog).toContainText('请勿转账');await expect(dialog).not.toContainText(deposit.treasury);await expect(dialog.getByRole('button',{name:'复制收款地址'})).toHaveCount(0);
});
