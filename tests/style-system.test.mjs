import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditStyles} from '../scripts/audit-styles.mjs';
test('style owners do not redefine the same selector, condition and property',()=>{
 const {totals}=auditStyles();assert.equal(totals.repeatedSelectorContexts,0);assert.equal(totals.repeatedProperties,0);assert.deepEqual(totals.undefinedVariables,[]);
});
test('the independent admin uses shared primitives without importing the public frame',()=>{
 const admin=fs.readFileSync('apps/admin/app/layout.tsx','utf8'),shared=fs.readFileSync('src/styles/shared.css','utf8');
 assert.match(admin,/@\/styles\/shared\.css/);assert.doesNotMatch(admin,/@\/app\/globals\.css|public\.css/);assert.doesNotMatch(shared,/public\.css|admin\.css/);
 const css=fs.readFileSync('src/modules/admin/admin.css','utf8');assert.doesNotMatch(css,/\.admin-site \.admin-(?:collapsed|gate|drawer)(?=[\s.>])/);
});
