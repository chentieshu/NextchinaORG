import {test} from 'node:test';import assert from 'node:assert/strict';
import {externalContent,contentMedia} from '../src/lib/external-content.ts';
import {normalizeDocument,documentText} from '../src/lib/rich-content.ts';
test('external content uses exact provider hosts, validated identifiers and safe fallbacks',()=>{
 for(const bad of ['javascript:alert(1)','data:text/html,<script>','http://youtube.com/watch?v=dQw4w9WgXcQ','https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:444/watch?v=dQw4w9WgXcQ'])assert.equal(externalContent(bad),null);
 assert.equal(externalContent('https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ').provider,'link');
 assert.match(externalContent('https://youtu.be/dQw4w9WgXcQ?si=tracking').embed,/^https:\/\/www.youtube-nocookie.com\/embed\/dQw4w9WgXcQ\?autoplay=0$/);
 assert.equal(externalContent('https://youtube.com/watch?v=invalid').provider,'link');
 assert.match(externalContent('https://www.bilibili.com/video/BV1xx411c7mD/?p=2').embed,/bvid=BV1xx411c7mD&p=2&autoplay=0/);
 assert.equal(externalContent('https://twitter.com/reader/status/123456789').url,'https://x.com/i/status/123456789');
 assert.equal(externalContent(externalContent('https://x.com/i/web/status/123456789').url).provider,'x');
 assert.match(externalContent('https://open.spotify.com/intl-es/track/1234567890123456789012?si=tracking').embed,/\/embed\/track\/1234567890123456789012$/);
 assert.equal(externalContent('https://github.com/chentieshu/NextchinaORG/issues/1').provider,'github');
 const doc=normalizeDocument({type:'doc',content:[{type:'embed',attrs:{url:'javascript:alert(1)'}},{type:'embed',attrs:{url:'https://youtu.be/dQw4w9WgXcQ'}},{type:'codeBlock',attrs:{language:'typescript'},content:[{type:'text',text:'<script>alert(1)</script>',marks:[{type:'bold'}]}]}]});
 assert.equal(doc.content.length,2);assert.equal(doc.content[1].attrs.language,'typescript');assert.equal(doc.content[1].content[0].marks,undefined);assert.equal(documentText(doc),'<script>alert(1)</script>');assert.equal(contentMedia(doc).length,1);
});
