import {test,expect} from './test';
import {fixture} from './fixtures';
test.skip(!process.env.AUTH_FIXTURES,'Authenticated requests use isolated fixtures.');

test('email verification sends to the signed-in account, handles bad codes, then confirms server proof',async({page})=>{
 const account=await fixture(page);await page.goto('/zh-CN/settings/');const section=page.locator('#email-verification');
 await expect(section.getByRole('heading')).toHaveText('邮箱安全验证');await expect(page.locator('.mfa-enrollment')).toHaveCount(0);
 await section.getByRole('button',{name:'发送邮件验证码',exact:true}).click();await expect(section.getByRole('status')).toContainText('验证码已发送');
 const sent=account.authWrites.find(x=>x.event==='otp');expect(sent).toMatchObject({email:'fixture@example.test',create_user:false});
 await expect(section.getByRole('button',{name:/重新发送验证码/})).toBeDisabled();
 await section.getByLabel('邮箱验证码').fill('000000');await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('alert')).toContainText('错误或已过期');expect(account.emailVerified).toBe(false);
 await section.getByLabel('邮箱验证码').fill('０８１８ ０４１２');await expect(section.getByLabel('邮箱验证码')).toHaveValue('08180412');
 await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('status')).toContainText('邮箱已验证');expect(account.emailVerified).toBe(true);
 expect(await page.evaluate(()=>Object.values({...localStorage,...sessionStorage}).some(value=>String(value).includes('08180412')))).toBe(false);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.setViewportSize({width:390,height:900});await section.screenshot({path:test.info().outputPath('email-verification.png')});
});

test('successful Auth response does not grant email proof when the database check fails',async({page})=>{
 await fixture(page);await page.route('**/rest/v1/rpc/omni_email_verification_status',r=>r.fulfill({json:{verified:false,available:true,expires_at:null}}));
 await page.goto('/zh-CN/settings/');const section=page.locator('#email-verification');await section.getByRole('button',{name:'发送邮件验证码',exact:true}).click();await section.getByLabel('邮箱验证码').fill('08180412');await section.getByRole('button',{name:'验证',exact:true}).click();await expect(section.getByRole('alert')).toContainText('验证未完成');await expect(section).not.toContainText('邮箱已验证');
});

test('rate limits and a failed status request are actionable; opening settings never sends mail',async({page})=>{
 const account=await fixture(page);let unavailable=true;await page.route('**/rest/v1/rpc/omni_email_verification_status',r=>unavailable?r.fulfill({status:503,json:{message:'unavailable'}}):r.fulfill({json:{verified:false,available:true,expires_at:null}}));
 await page.goto('/zh-CN/settings/');const section=page.locator('#email-verification');await expect(section.getByRole('alert')).toContainText('无法读取');expect(account.authWrites).toHaveLength(0);unavailable=false;await section.getByRole('button',{name:'重试',exact:true}).click();
 await page.route('**/auth/v1/otp*',r=>r.fulfill({status:429,json:{error_code:'over_email_send_rate_limit',msg:'Too many requests'}}));await section.getByRole('button',{name:'发送邮件验证码',exact:true}).click();await expect(section.getByRole('alert')).toContainText('请求过于频繁');await expect(section.getByLabel('邮箱验证码')).toHaveCount(0);
});
