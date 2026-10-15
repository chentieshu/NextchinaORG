export function normalizeMfaCode(value:string){return value.normalize('NFKC').replace(/\D/g,'').slice(0,6);}

export function prepareEnrollment(id:string,totp:{uri:string;secret:string}){
 const uri=new URL(totp.uri),secret=totp.secret.toUpperCase(),tag=id.replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase();
 if(uri.protocol!=='otpauth:'||uri.hostname!=='totp'||uri.username||uri.password||uri.hash||!tag||
  !/^[A-Z2-7]{16,128}$/.test(secret)||uri.searchParams.getAll('secret').length!==1||uri.searchParams.get('secret')?.toUpperCase()!==secret||
  (uri.searchParams.get('algorithm')??'SHA1').toUpperCase()!=='SHA1'||(uri.searchParams.get('digits')??'6')!=='6'||(uri.searchParams.get('period')??'30')!=='30'){
  throw Object.assign(new Error('Invalid enrollment response'),{code:'invalid_enrollment'});
 }
 const label=decodeURIComponent(uri.pathname.slice(1))+` (${tag})`;
 uri.pathname='/'+encodeURIComponent(label);
 return {id,uri:uri.toString(),secret,tag};
}

// Enrollment diagnostics only. Never returns a generated code, stores a key, sends
// a request, or grants an authenticated state. Supabase remains the verifier.
export async function diagnoseEnrollmentCode(secret:string,entered:string,now=Date.now()):Promise<'matched'|'mismatched'|'unavailable'>{
 try{
  if(!/^[A-Z2-7]{16,128}$/.test(secret)||!/^\d{6}$/.test(entered)||!Number.isFinite(now)||now<30000)return 'unavailable';
  const bytes:number[]=[];let carry=0,bits=0;
  for(const char of secret){carry=(carry<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes.push((carry>>bits)&255);carry&=(1<<bits)-1;}}
  const material=new Uint8Array(bytes);
  const key=await crypto.subtle.importKey('raw',material,{name:'HMAC',hash:'SHA-1'},false,['sign']);material.fill(0);bytes.fill(0);
  const step=BigInt(Math.floor(now/30000));
  for(const offset of [0,-1,1]){
   const counter=new ArrayBuffer(8);new DataView(counter).setBigUint64(0,step+BigInt(offset),false);
   const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter)),start=hash[hash.length-1]&15;
   const binary=((hash[start]&127)<<24)|(hash[start+1]<<16)|(hash[start+2]<<8)|hash[start+3];
   if(String(binary%1000000).padStart(6,'0')===entered)return 'matched';
  }
  return 'mismatched';
 }catch{return 'unavailable';}
}

export function mfaFailure(error:unknown){
 const e=error as {code?:string;status?:number;name?:string};
 if(e?.code==='mfa_verification_failed')return 'invalidCode';
 if(e?.code==='mfa_ip_address_mismatch')return 'ipChanged';
 if(e?.code==='mfa_challenge_expired')return 'expired';
 if(e?.code==='mfa_factor_not_found')return 'missing';
 if(e?.code==='invalid_enrollment')return 'invalidEnrollment';
 if(e?.status===429||e?.code==='over_request_rate_limit')return 'rateLimited';
 if(e?.name==='AuthRetryableFetchError'||e?.name==='TypeError')return 'network';
 if(e?.status===401||e?.code==='session_not_found'||e?.name==='AuthSessionMissingError')return 'session';
 return 'failed';
}
