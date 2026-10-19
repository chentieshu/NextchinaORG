import {test,expect,testOrigin} from './test';

test('the root homepage and all policies are readable without login or JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 const page=await context.newPage();
 try{
  const root=await page.goto('/');expect(root?.status()).toBe(200);
  await expect(page).toHaveURL(`${testOrigin}/`);
  await expect(page.locator('main h1')).toHaveText('预测市场');
  await expect(page.locator('.spotlight,.purpose-note')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('footer').getByRole('link',{name:'隐私说明'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('隐私政策');
  for(const locale of ['zh-CN','en','ja','es','zh-TW']){
   for(const kind of ['privacy','terms']){
    const response=await page.goto(`/${locale}/${kind}/`);expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toHaveAttribute('lang',locale);
    await expect(page.locator('.legal-sections')).toContainText('Google');
    await expect(page.getByRole('link',{name:'chentieshu520@gmail.com',exact:true})).toHaveAttribute('href','mailto:chentieshu520@gmail.com');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`https://pg520.app/${locale}/${kind}/`);
   }
  }
 }finally{await context.close();}
});

test('language selection on the root homepage opens the selected language',async({page})=>{
 await page.goto('/');
 await page.locator('.app-nav').getByRole('link',{name:'设置',exact:true}).click();
 await page.getByRole('combobox',{name:'界面语言',exact:true}).selectOption('en');
 await page.locator('#preferences').getByRole('button',{name:'保存',exact:true}).click();
 await expect(page).toHaveURL(`${testOrigin}/en/settings/#preferences`);
 await page.goto('/');await expect(page).toHaveURL(`${testOrigin}/en/`);
 await expect(page.locator('main h1')).toHaveText('BTC · 3-minute prediction');
});
