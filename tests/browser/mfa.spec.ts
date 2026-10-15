import {test,expect,type Page} from '@playwright/test';
import {createHmac} from 'node:crypto';
import {fixture} from './fixtures';
test.skip(!process.env.LIVE_SUPABASE,'Authenticated requests use isolated fixtures.');
const key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
async function enroll(page:Page){
 await page.goto('/zh-CN/settings/');const section=page.locator('#authenticator');await section.getByRole('button',{name:'设置身份验证器',exact:true}).click();await expect(section.locator('.mfa-enrollment svg')).toBeVisible();return section;
}
test('server rejection of a matching enrollment code produces a diagnostic without enabling MFA',async({page})=>{
 const account=await fixture(page);const writes:{url:string;body:string|null}[]=[];
 page.on('request',r=>{if(r.method()==='POST')writes.push({url:r.url(),body:r.postData()});});
 await page.route('**/auth/v1/factors/*/verify',r=>r.fulfill({status:422,json:{code:'mfa_verification_failed',error_code:'mfa_verification_failed',msg:'Invalid TOTP code entered'}}));
 const section=await enroll(page),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hash=createHmac('sha1','12345678901234567890').update(counter).digest();const expected=((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');
 await section.getByLabel('6 位动态验证码').fill(expected);await section.getByRole('button',{name:'验证',exact:true}).click();
 await expect(section.getByRole('alert')).toContainText('MFA_LOCAL_MATCH');await expect(section.getByRole('status')).toHaveCount(0);expect(account.factors[0].status).toBe('unverified');expect(account.mfaAal).toBe('aal1');
 expect(writes.some(r=>r.body?.includes(key)||r.url.includes(key))).toBe(false);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(key);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:390,height:900});await section.screenshot({path:test.info().outputPath('mfa-diagnostic.png')});
});
test('IP, rate and network errors are not reported as wrong authenticator codes',async({page})=>{
 await fixture(page);let error={status:422,code:'mfa_ip_address_mismatch'};
 await page.route('**/auth/v1/factors/*/verify',r=>error.code==='network'?r.abort('failed'):r.fulfill({status:error.status,json:{code:error.code,error_code:error.code,msg:'fixture rejection'}}));
 const section=await enroll(page);await section.getByLabel('6 位动态验证码').fill('123456');await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('alert')).toContainText('网络出口发生变化');
 error={status:429,code:'over_request_rate_limit'};await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('alert')).toContainText('尝试次数过多');
 error={status:0,code:'network'};await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('alert')).toContainText('无法连接认证服务');
});
test('formatted pasted codes preserve leading zeros and manual setup uses the same key',async({page})=>{
 const state=await fixture(page);const received:string[]=[];await page.route('**/auth/v1/factors/*/verify',async r=>{received.push(r.request().postDataJSON().code);await r.fulfill({status:422,json:{code:'mfa_verification_failed',error_code:'mfa_verification_failed',msg:'Invalid code'}});});
 const section=await enroll(page);await expect(section.locator('.mfa-marker')).toContainText('RETOTP');await section.getByText('手动设置密钥',{exact:true}).click();await expect(section.locator('details code')).toHaveText(key);await expect(section).toContainText('基于时间');
 await section.getByLabel('6 位动态验证码').evaluate((input:HTMLInputElement)=>{const data=new DataTransfer();data.setData('text','０８１ ８０４');input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(section.getByLabel('6 位动态验证码')).toHaveValue('081804');await section.getByRole('button',{name:'验证',exact:true}).click();await expect.poll(()=>received.length).toBe(1);expect(received[0]).toBe('081804');expect(state.factors[0].status).toBe('unverified');
});
