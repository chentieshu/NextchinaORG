import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareEnrollment,diagnoseEnrollmentCode,normalizeMfaCode,mfaFailure} from '../src/lib/mfa-enrollment.ts';
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // Public RFC 6238 SHA-1 fixture.
const uri=`otpauth://totp/ChinaTeam:fixture%40example.test?secret=${secret}&issuer=ChinaTeam&algorithm=SHA1&digits=6&period=30`;

test('enrollment QR preserves server credentials and identifies each pending binding',()=>{
 const result=prepareEnrollment('00000000-0000-4000-8000-000000abc123',{uri,secret}),url=new URL(result.uri);
 assert.equal(url.search,new URL(uri).search);assert.equal(url.searchParams.get('secret'),secret);
 assert.equal(decodeURIComponent(url.pathname),'/ChinaTeam:fixture@example.test (ABC123)');
 assert.throws(()=>prepareEnrollment('factor',{uri:uri.replace(secret,'A'.repeat(32)),secret}));
 for(const modified of [uri.replace('otpauth:','https:'),uri.replace('/totp/','/hotp/'),uri.replace('digits=6','digits=8'),uri.replace('period=30','period=60'),uri+'&secret='+secret])assert.throws(()=>prepareEnrollment('factor',{uri:modified,secret}));
});
test('diagnostics follow independent RFC vectors and report only a result',async()=>{
 for(const [time,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])assert.equal(await diagnoseEnrollmentCode(secret,code,time*1000),'matched');
 assert.equal(await diagnoseEnrollmentCode(secret,'287082',89000),'matched');
 assert.equal(await diagnoseEnrollmentCode(secret,'000000',59000),'mismatched');
 assert.equal(await diagnoseEnrollmentCode('invalid','000000',59000),'unavailable');
 assert.equal(await diagnoseEnrollmentCode(secret,'28708',59000),'unavailable');
});
test('pasted codes preserve leading zeroes and errors distinguish IP, time, network and rejected codes',()=>{
 assert.equal(normalizeMfaCode('０８１ ８０４'),'081804');assert.equal(normalizeMfaCode(' 005 924 '),'005924');
 assert.equal(mfaFailure({code:'mfa_verification_failed'}),'invalidCode');assert.equal(mfaFailure({code:'mfa_ip_address_mismatch'}),'ipChanged');
 assert.equal(mfaFailure({code:'mfa_challenge_expired'}),'expired');assert.equal(mfaFailure({status:429}),'rateLimited');
 assert.equal(mfaFailure({name:'AuthRetryableFetchError'}),'network');assert.equal(mfaFailure({status:401}),'session');
});
