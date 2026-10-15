import {test,expect,type Page} from '@playwright/test';
import {fixture,story,articleId} from './fixtures';
test.skip(!process.env.LIVE_SUPABASE,'Authenticated wallet requests are isolated browser fixtures.');
const snapshot={purchased:'1000000',earned:'20000000',held:'0',deposits_enabled:false,tipping_enabled:false,withdrawals_enabled:false,withdrawal_min_units:'1000000',withdrawal_fee_bps:'100',frozen:false};
async function walletFixture(page:Page,role='member'){
 const account=await fixture(page,role),wallet={...snapshot},requests:Record<string,any>[]=[],writes:Record<string,any>[]=[];
 account.articles.push(story(articleId,'可打赏的分享',{author_id:'20000000-0000-4000-8000-000000000002',author_name:'Another writer',author_handle:'another_writer'}));
 await page.route('**/rest/v1/rpc/omni_wallet_*',async route=>{const resource=new URL(route.request().url()).pathname.split('/').at(-1);let data:any=[];
  if(resource==='omni_wallet_snapshot')data=wallet;
  if(resource==='omni_wallet_admin_setup')data={treasury:'TPxCJN86sfZPPE6M4PMAgDuTruT9fPPB3Z',heartbeat:null,available:0,assigned:0,enabled:false};
  if(resource==='omni_wallet_deposit_address')data={address:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',network:'TRON'};
  if(resource==='omni_wallet_admin_summary')data={accounts:0,journals:0,purchased:'0',earned:'0',held:'0',balanced:true,settings:wallet};
  if(resource==='omni_wallet_requests')data=requests;
  if(resource==='omni_wallet_tip'||resource==='omni_wallet_withdraw'){writes.push(route.request().postDataJSON());data='20000000-0000-4000-8000-000000000077';}
  if(resource==='omni_wallet_review'){writes.push(route.request().postDataJSON());requests.length=0;data={};}
  await route.fulfill({json:data});
 });return{wallet,account,requests,writes};
}
test('wallet stays closed, is localized and fits narrow layouts',async({page})=>{
 await walletFixture(page);for(const locale of ['zh-CN','en','ja','es','zh-TW']){await page.goto(`/${locale}/wallet/`);await expect(page.locator('.wallet-balance')).toContainText((2100n).toLocaleString(locale));await expect(page.locator('.wallet-actions button').first()).toBeDisabled();await expect(page.locator('.wallet-actions button').nth(1)).toBeDisabled();
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
