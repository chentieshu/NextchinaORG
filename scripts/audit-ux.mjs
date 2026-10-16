import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

const baseline=process.argv[2];
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name).replaceAll('\\','/')]);
const files=baseline?execFileSync('git',['ls-tree','-r','--name-only',baseline,'--','src','apps/admin/app'],{encoding:'utf8'}).trim().split('\n'):[...walk('src'),...walk('apps/admin/app')];
const routes=[],surfaces=[];
for(const file of files.filter(f=>f.endsWith('.tsx'))){
 const source=baseline?execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let headings=0,forms=0,notes=0;
 function visit(node){
  if(ts.isJsxElement(node)){
   const tag=node.openingElement.tagName.getText(ast);
   if(/^h[1-3]$/.test(tag))headings++;
   if(tag==='form')forms++;
   if(['p','small'].includes(tag)&&node.children.some(c=>ts.isJsxExpression(c)&&c.expression&&/^(?:c|copy|ui|a|x|ct|m|t|s)\./.test(c.expression.getText(ast))))notes++;
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 if(headings||forms||notes)surfaces.push({file,headings,forms,copyParagraphs:notes});
 if(file.endsWith('/page.tsx')){
  const admin=file.startsWith('apps/admin/'),prefix=admin?'apps/admin/app':'src/app';
  routes.push({application:admin?'admin':'public',path:file.slice(prefix.length).replace('/page.tsx','/')||'/',file,redirect:/\b(?:location\.(?:replace|assign)|redirect\()/.test(source),imports:[...source.matchAll(/import.*?from\s*['"]([^'"]+)['"]/g)].map(m=>m[1])});
 }
}
console.log(JSON.stringify({source:baseline??'working-tree',totals:{routeFiles:routes.length,publicRoutes:routes.filter(r=>r.application==='public').length,adminRoutes:routes.filter(r=>r.application==='admin').length,componentFiles:files.filter(f=>f.endsWith('.tsx')).length,copyParagraphNodes:surfaces.reduce((s,r)=>s+r.copyParagraphs,0)},adminSections:['dashboard','posts','articles','moderation','members','categories','wallet','market','predictions','monitor','audit','settings'],settingsTasks:['profile','security','connections','preferences','reading'],routes,surfaces},null,2));
