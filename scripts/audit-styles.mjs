import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
export function compactCssBytes(source){
 const ast=postcss.parse(source);ast.raws.after='';
 ast.walk(node=>{node.raws.before='';if(node.type==='decl')node.raws.between=':';if(node.type==='rule')node.selector=node.selector.replace(/\s+/g,' ');if(node.nodes){node.raws.between='';node.raws.after='';node.raws.semicolon=true;}});
 return Buffer.byteLength(ast.toString());
}
export function auditStyles(root=process.cwd()){
 const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name).replaceAll('\\','/')]);
 const files=[...walk('src'),...walk('apps/admin/app')],css=files.filter(file=>file.endsWith('.css'));
 const selectors=new Map(),properties=new Map(),colors=new Set(),defined=new Set(),used=new Set(),widths=new Set();let rules=0,declarations=0,important=0;
 const sheets=css.map(file=>{const source=fs.readFileSync(path.join(root,file),'utf8'),ast=postcss.parse(source,{from:file});let count=0;ast.walkAtRules('media',node=>{for(const match of node.params.matchAll(/(?:min|max)-width:\s*(\d+)px/g))widths.add(Number(match[1]));});
  ast.walkRules(rule=>{count++;rules++;const context=[];for(let parent=rule.parent;parent&&parent.type!=='root';parent=parent.parent)if(parent.type==='atrule')context.unshift(`@${parent.name} ${parent.params.replace(/\s+/g,'')}`);
   for(const selector of rule.selectors){const key=context.join('|')+'|'+selector.trim();const occurrences=selectors.get(key)??[];occurrences.push({file,line:rule.source.start.line});selectors.set(key,occurrences);
    rule.nodes.filter(node=>node.type==='decl').forEach(node=>{const propKey=key+'|'+node.prop,values=properties.get(propKey)??[];values.push({value:node.value,important:!!node.important,file});properties.set(propKey,values);});}
  });
  ast.walkDecls(node=>{declarations++;if(node.important)important++;if(node.prop.startsWith('--'))defined.add(node.prop);for(const color of node.value.match(/#[\da-f]{3,8}\b/gi)??[])colors.add(color.toLowerCase());for(const match of node.value.matchAll(/var\(\s*(--[\w-]+)/g))used.add(match[1]);});return{file,bytes:Buffer.byteLength(source),compactBytes:compactCssBytes(source),rules:count};
 });
 const repeated=[...selectors].filter(([,rows])=>rows.length>1),overlaps=[...properties].filter(([,values])=>values.length>1),changed=overlaps.filter(([,values])=>new Set(values.map(value=>`${value.value}:${value.important}`)).size>1);
 return{totals:{files:css.length,bytes:sheets.reduce((sum,sheet)=>sum+sheet.bytes,0),compactBytes:sheets.reduce((sum,sheet)=>sum+sheet.compactBytes,0),rules,declarations,important,literalColors:colors.size,widthBreakpoints:[...widths].sort((a,b)=>a-b),repeatedSelectorContexts:repeated.length,excessSelectorOccurrences:repeated.reduce((sum,[,rows])=>sum+rows.length-1,0),repeatedProperties:overlaps.length,changedProperties:changed.length,undefinedVariables:[...used].filter(name=>!defined.has(name)).sort()},sheets,overlaps:changed.sort((a,b)=>b[1].length-a[1].length).slice(0,20).map(([selector,values])=>({selector,values}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/audit-styles.mjs'))console.log(JSON.stringify(auditStyles(),null,2));
