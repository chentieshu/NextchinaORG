import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
test.skip(!process.env.LIVE_SUPABASE,'Requires a build with the public Supabase URL; all backend calls are mocked.');
const member='20000000-0000-4000-8000-000000000001';
const articleId='20000000-0000-4000-8000-000000000010';
async function fixture(page:Page,role='member'){
 const articles:Record<string,any>[]=[];const writes:Record<string,any>[]=[];const comments:Record<string,any>[]=[];const settings={id:true,notice:'',comments_enabled:true,ugc_enabled:true};
 const user={id:member,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 await page.addInitScript(({user})=>{const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600}))+'.mock';localStorage.setItem('sb-cznhnupwojmydttdattb-auth-token',JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));},{user});
 // Entire backend is intercepted: these tests never publish content to the live project.
 await page.route('https://cznhnupwojmydttdattb.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),resource=url.pathname.split('/').at(-1),method=request.method(),single=request.headers().accept?.includes('vnd.pgrst.object');let data:any=[];
  if(resource==='user')data=user;
  if(resource==='omni_profiles'){data={id:member,display_name:'Test writer',role,disabled:false,created_at:new Date().toISOString()};if(!single)data=[data];}
  if(resource==='omni_settings')data=settings;
  if(resource==='omni_comments'){
   if(method==='PATCH'){Object.assign(comments[0],request.postDataJSON());data={id:comments[0].id};}
   else if(method==='DELETE'){comments.length=0;data=null;}
   else data=comments;
  }
  if(resource==='omni_articles'){
   if(method==='POST'){const input=request.postDataJSON();writes.push(input);articles.push({...input,id:articleId,slug:'fixture',author_name:'Test writer',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),published_at:input.status==='published'?new Date().toISOString():null,featured:false,locked:false,moderated:false});data={id:articleId};}
   else if(method==='PATCH'){const input=request.postDataJSON();writes.push(input);Object.assign(articles[0],input,{updated_at:new Date().toISOString()});data={id:articleId};}
   else{let selected=articles;for(const field of ['content_type','status','author_id','id']){const match=url.searchParams.get(field);if(match?.startsWith('eq.'))selected=selected.filter(a=>a[field]===match.slice(3));}data=single?selected[0]??null:selected;}
  }
  if(resource==='settings')data={external:{email:true,google:true,github:true,x:true}};
  return route.fulfill({json:data});
 });
 return {articles,writes,comments,settings};
}
test('member writes a rich post, saves draft, reopens and publishes; cannot enter newsroom',async({page})=>{
 const state=await fixture(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/zh-CN/write/');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('textbox',{name:'标题',exact:true}).fill('一个值得分享的新想法');
 const editor=page.locator('.tiptap');await editor.fill('这是正文，我们一起讨论这个想法。');
 await editor.press('Control+a');await page.locator('.writing-toolbar').getByRole('button',{name:'粗体',exact:true}).click();
 await page.getByRole('button',{name:'预览',exact:true}).click();await expect(page.locator('.writing-preview strong')).toContainText('这是正文');
 await page.getByRole('button',{name:'继续编辑',exact:true}).click();
 await expect(page.locator('.draft-status')).toHaveText('草稿已保存在此浏览器');await page.reload();await expect(page.locator('.tiptap strong')).toContainText('这是正文');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page).toHaveURL(new RegExp(`write/\\?id=${articleId}`));
 await expect(page.getByRole('textbox',{name:'标题',exact:true})).toHaveValue('一个值得分享的新想法');await expect(page.locator('.tiptap strong')).toContainText('这是正文');
 await page.getByRole('button',{name:'发布',exact:true}).click();await expect(page).toHaveURL(new RegExp(`community/\\?id=${articleId}`));await expect(page.locator('.rich-prose strong')).toContainText('这是正文');
 expect(state.writes[0].content_type).toBe('post');expect(state.writes[0].author_id).toBe(member);expect(state.writes[0].translations['zh-CN'].document.type).toBe('doc');expect(state.writes.at(-1)?.status).toBe('published');
 await page.goto('/zh-CN/write/?kind=news');await expect(page.getByText('你没有编辑这篇内容的权限。')).toBeVisible();
 state.settings.ugc_enabled=false;await page.goto('/zh-CN/write/');await expect(page.getByText('论坛暂时关闭发帖。')).toBeVisible();
 expect(errors).toEqual([]);
});
test('admin newsroom uses the rich editor and supports pin, lock and removal controls',async({page})=>{
 const state=await fixture(page,'editor');await page.goto('/zh-CN/write/?kind=news');await page.getByRole('textbox',{name:'标题',exact:true}).fill('编辑部测试新闻');await page.locator('.tiptap').fill('新闻正文');
 await page.getByRole('button',{name:'发布',exact:true}).click();await expect(page).toHaveURL(new RegExp(`news/\\?id=${articleId}`));expect(state.writes[0].content_type).toBe('news');
 await page.getByRole('button',{name:'置顶',exact:true}).click();await expect(page.getByRole('button',{name:'取消置顶',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'锁定',exact:true}).click();await expect(page.getByRole('button',{name:'解锁',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'下架',exact:true})).toBeVisible();
 await page.goto('/zh-CN/admin/');await expect(page.getByRole('button',{name:'帖子管理',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'评论管理',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'用户与权限',exact:true})).toHaveCount(0);
 state.comments.push({id:'comment-fixture',article_id:articleId,user_id:'another-member',body:'需要编辑的评论',created_at:new Date().toISOString()});
 await page.getByRole('button',{name:'评论管理',exact:true}).click();const moderation=page.locator('.moderation-list');await moderation.getByRole('button',{name:'编辑',exact:true}).click();await moderation.locator('textarea').fill('管理员修改后的评论');await moderation.getByRole('button',{name:'保存',exact:true}).click();await expect(moderation).toContainText('管理员修改后的评论');expect(state.comments[0].body).toBe('管理员修改后的评论');
 page.once('dialog',d=>d.accept());await moderation.getByRole('button',{name:'删除',exact:true}).click();await expect(moderation.locator('article')).toHaveCount(0);expect(state.comments).toHaveLength(0);
});
test('five-language forum carousel works on mobile; unsafe rich-text nodes are not rendered',async({page})=>{
 const state=await fixture(page);state.articles.push({id:articleId,content_type:'post',author_id:member,author_name:'Test writer',category:'ai',status:'published',translations:{en:{title:'A public post',summary:'Summary',body:'Safe text',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Safe link text',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]},{type:'image',attrs:{src:'javascript:alert(1)'}},{type:'script',text:'alert(1)'}]}}},original_locale:'en',cover_style:0,created_at:new Date().toISOString(),published_at:new Date().toISOString(),featured:false});
 await page.goto(`/en/community/?id=${articleId}`);await expect(page.locator('.rich-prose')).toContainText('Safe link text');await expect(page.locator('.rich-prose a,.rich-prose img,.rich-prose script')).toHaveCount(0);
 state.articles.length=0;
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 for(const locale of ['zh-CN','en','ja','es','zh-TW']){await page.goto(`/${locale}/`);await expect(page.locator('.forum-feed-heading h2')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto('/zh-CN/');await expect(page.locator('.spotlight h1')).toHaveText('好想法，值得被看见。');await page.getByRole('button',{name:'下一张',exact:true}).click();await expect(page.locator('.spotlight h1')).toHaveText('每一个声音，都有自己的位置。');
 const screenshots=process.env.SCREENSHOT_DIR;if(screenshots){await mkdir(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'nextchina-forum-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1050});await page.goto('/zh-CN/');await page.screenshot({path:path.join(screenshots,'nextchina-forum-desktop.png'),fullPage:true});await page.goto('/zh-CN/write/');await page.getByRole('textbox',{name:'标题',exact:true}).fill('写下你的下一个好想法');await page.locator('.tiptap').fill('让想法自然流动。选中文字即可添加格式，也可以插入引用、链接与图片。');await page.screenshot({path:path.join(screenshots,'nextchina-writer-desktop.png'),fullPage:true});}
});
