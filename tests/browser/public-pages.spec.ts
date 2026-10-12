import {test,expect} from '@playwright/test';

test('the root homepage and all policies are readable without login or JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 const page=await context.newPage();
 try{
  const root=await page.goto('/');expect(root?.status()).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:3000/');
  await expect(page.locator('#service-purpose')).toContainText('NextChina.org');
  await expect(page.locator('.service-overview')).toContainText('任何人都可以直接阅读公开新闻');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.service-policy-links').getByRole('link',{name:'隐私说明'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('隐私政策');
  for(const locale of ['zh-CN','en','ja','es','zh-TW']){
   for(const kind of ['privacy','terms']){
    const response=await page.goto(`/${locale}/${kind}/`);expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toHaveAttribute('lang',locale);
    await expect(page.locator('.legal-sections')).toContainText('Google');
    await expect(page.getByRole('link',{name:'chentieshu520@gmail.com',exact:true})).toHaveAttribute('href','mailto:chentieshu520@gmail.com');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`https://nextchina.org/${locale}/${kind}/`);
   }
  }
 }finally{await context.close();}
});

test('language selection on the root homepage opens the selected language',async({page})=>{
 await page.goto('/');
 await page.getByRole('combobox',{name:'选择语言'}).selectOption('en');
 await expect(page).toHaveURL('http://127.0.0.1:3000/en/');
 await expect(page.locator('#service-purpose')).toContainText('Technology news and community');
});
