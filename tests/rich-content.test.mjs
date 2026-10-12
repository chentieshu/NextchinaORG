import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocument,documentText,safeContentUrl} from '../src/lib/rich-content.ts';
test('stored rich JSON is repaired to an editable schema and retains only safe URLs',()=>{
 const value=normalizeDocument({type:'doc',content:[{type:'text',text:'Orphan'},{type:'paragraph',content:[{type:'heading',content:[{type:'text',text:'Nested',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}},{type:'bold'}]}]}]},{type:'bulletList',content:[{type:'image',attrs:{src:'https://example.test/image.png'}}]},{type:'script',text:'bad'}]});
 assert.equal(value.content[0].type,'paragraph');assert.equal(value.content[1].content[0].type,'text');assert.deepEqual(value.content[1].content[0].marks,[{type:'bold'}]);assert.equal(value.content[2].content[0].type,'listItem');assert.equal(value.content[2].content[0].content[0].type,'paragraph');assert.equal(documentText(value),'Orphan\n\nNested');
 assert.equal(safeContentUrl('https://name:password@example.test'),null);assert.equal(safeContentUrl('data:text/html,test'),null);
 assert.equal(normalizeDocument({type:'doc',content:[{type:'image',attrs:{src:'https://example.test/image.png'}}]},'',true).content[0].type,'paragraph');
 assert.equal(normalizeDocument({type:'doc',content:[]}).content[0].type,'paragraph');
 assert.deepEqual(normalizeDocument(value),value);
});
