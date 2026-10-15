import {test,expect} from './test';
test.skip(!process.env.AUTH_FIXTURES,'Run against a build configured with Supabase.');

test('public content requests succeed with fixtures and anonymous administration stays locked',async({page})=>{
 await page.route('https://cznhnupwojmydttdattb.supabase.co/rest/v1/**',route=>route.fulfill({json:route.request().url().includes('/omni_settings?')?{id:true,notice:'',comments_enabled:true,ugc_enabled:true}:[]}));
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const articles=page.waitForResponse(r=>r.url().includes('/rpc/omni_content_feed'));
 const settings=page.waitForResponse(r=>r.url().includes('/rest/v1/omni_settings?'));
 await page.goto('/zh-CN/');
 for(const response of await Promise.all([articles,settings]))expect(response.status()).toBe(200);
 await expect(page.getByText('以下为界面演示文章，用于展示阅读体验，并非实时新闻。')).toHaveCount(0);
 await page.goto('/zh-CN/admin/');
 await expect(page.getByText('此页面仅向管理员开放。')).toBeVisible();
 await expect(page.getByRole('button',{name:'新建文章',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('login options follow provider settings and email keeps the locale callback',async({page})=>{
 await page.route('**/auth/v1/settings',route=>route.fulfill({json:{external:{email:true,github:true,google:false,x:false}}}));
 await page.goto('/zh-CN/');
 await page.getByRole('button',{name:'登录 / 加入'}).click();
 await expect(page.getByRole('button',{name:'使用 Google 暂未开放'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'使用 GitHub',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'使用 X 暂未开放'})).toBeDisabled();
 let payload:Record<string,unknown>|undefined;let requestedUrl='';
 // Simulate the email endpoint so this test never sends an email.
 await page.route('**/auth/v1/otp**',route=>{payload=route.request().postDataJSON();requestedUrl=route.request().url();return route.fulfill({json:{}});});
 await page.getByRole('textbox',{name:'邮箱地址'}).fill('reader@example.test');
 await page.getByRole('button',{name:'使用邮箱继续',exact:true}).click();
 await expect(page.getByRole('button',{name:'登录链接已发送，请检查邮箱。',exact:true})).toBeDisabled();
 expect(payload?.email).toBe('reader@example.test');
 expect(new URL(requestedUrl).searchParams.get('redirect_to')).toBe('http://127.0.0.1:3000/zh-CN/auth/callback/');
 expect(payload?.code_challenge_method).toBe('s256');
});

test('login settings failures can be retried',async({page})=>{
 let attempts=0;
 await page.route('**/auth/v1/settings',route=>{attempts++;return attempts===1?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({json:{external:{email:true}}});});
 await page.goto('/zh-CN/');await page.getByRole('button',{name:'登录 / 加入'}).click();
 await expect(page.getByText('暂时无法获取登录方式，请重试。')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'重试',exact:true}).click();
 await expect(page.getByRole('button',{name:'使用邮箱继续',exact:true})).toBeEnabled();
});
