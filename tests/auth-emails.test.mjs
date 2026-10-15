import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL('../supabase/templates/', import.meta.url);
// Git may check HTML out with CRLF on Windows; email content is otherwise identical.
const read = async (name) => (await readFile(new URL(name, base),'utf8')).replace(/\r\n/g,'\n');
// Per-type variable support follows Supabase's documented template contract.
const contract = {
  'confirm-signup':['ConfirmationURL'],
  'invite-user':['ConfirmationURL'],
  'magic-link':['ConfirmationURL','Token'],
  'change-email':['ConfirmationURL','NewEmail'],
  'reset-password':['ConfirmationURL'],
  'reauthentication':['Token'],
  'password-changed':['Email'],
  'email-changed':['OldEmail','Email'],
  'phone-changed':['OldPhone','Phone'],
  'identity-linked':['Provider','Email'],
  'identity-unlinked':['Provider','Email'],
  'mfa-added':['FactorType'],
  'mfa-removed':['FactorType'],
};

test('every email uses only variables supported for its event and remains below clipping size',async()=>{
  for(const [name,allowed] of Object.entries(contract)){
    const html=await read(name+'.html');
    const variables=[...html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(variables)].sort(),[...allowed].sort(),name);
    assert.equal(html.replace(/\{\{\s*\.\w+\s*\}\}/g,'').includes('{{'),false,`${name}: invalid template syntax`);
    assert.ok(Buffer.byteLength(html)<102*1024,name);
    assert.equal((html.match(/<h1\b/g)??[]).length,1,name);
    assert.ok(html.includes('lang="zh-CN"')&&html.includes('lang="en"'),name);
    assert.ok(!/<script|<form|<iframe|<svg|<img|@import|display:\s*(flex|grid)/i.test(html),name);
    for(const table of html.matchAll(/<table\b[^>]*>/g))assert.ok(table[0].includes('role="presentation"'),name);
    const subject=await read(name+'.subject.txt');
    assert.ok(subject.startsWith('Teamcn'),name);
    assert.ok(!subject.includes('{{'),`${name}: no token or personal information in subject`);
    assert.ok(html.includes('mailto:chentieshu520@gmail.com'),name);
  }
});

test('login links remain Supabase verification links and never point directly to an unimplemented route',async()=>{
  for(const name of ['confirm-signup','invite-user','magic-link','change-email','reset-password']){
    const html=await read(name+'.html');
    assert.equal((html.match(/href="\{\{ \.ConfirmationURL \}\}"/g)??[]).length,2,name);
    assert.ok(!html.includes('/auth/confirm')&&!html.includes('/reset-password/'),name);
    assert.equal(html.includes('{{ .Token }}'),name==='magic-link',name);
  }
  for(const name of Object.keys(contract).slice(6)){
    const html=await read(name+'.html');
    assert.ok(!html.includes('.ConfirmationURL')&&!html.includes('.Token'),name);
  }
});

test('management payload contains only 13 email pairs and seven enabled security notifications',async()=>{
  const config=JSON.parse(await read('auth-email-config.json'));
  const manifest=JSON.parse(await read('manifest.json'));
  assert.equal(manifest.length,13);
  assert.equal(Object.keys(config).length,33);
  const flags=Object.keys(config).filter(k=>k.startsWith('mailer_notifications_'));
  assert.equal(flags.length,7);
  flags.forEach(key=>assert.equal(config[key],true,key));
  for(const entry of manifest){
    assert.equal(config[entry.bodyKey],await read(entry.file+'.html'));
    assert.equal(config[entry.subjectKey],(await read(entry.file+'.subject.txt')).trim());
  }
  Object.keys(config).forEach(key=>assert.match(key,/^mailer_(?:subjects_\w+|templates_\w+_content|notifications_\w+_enabled)$/));
});

test('offline preview is self contained, clearly states that preview does not save settings, and substitutes only example data',async()=>{
  const html=await read('preview.html');
  assert.ok(html.includes('模板修改需单独保存到 Supabase'));
  assert.ok(html.includes('sandbox=""'));
  const embedded=JSON.parse(html.match(/<script type="application\/json" id="templates">([\s\S]*?)<\/script>/)[1]);
  assert.equal(embedded.length,13);
  for(const entry of embedded){
    assert.ok(!entry.previewHtml.includes('{{'),entry.file);
    assert.ok(!entry.previewHtml.includes('token='),entry.file);
  }
});
