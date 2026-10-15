export type EmailVerification={verified:boolean;expires_at:string|null;available:boolean};
export function normalizeEmailCode(value:string){return value.normalize('NFKC').replace(/\D/g,'').slice(0,8);}
export function emailVerificationFailure(error:unknown){
 const e=error as {code?:string;status?:number;name?:string};
 if(e?.status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(e?.code??''))return 'rateLimited';
 if(e?.code==='otp_expired')return 'invalidCode';
 if(e?.code==='email_not_confirmed'||e?.code==='email_unavailable')return 'noEmail';
 if(e?.code==='account_changed'||e?.status===401)return 'sessionChanged';
 if(e?.name==='AuthRetryableFetchError'||e?.name==='TypeError')return 'network';
 return 'failed';
}
