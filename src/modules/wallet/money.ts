// Monetary arithmetic never goes through floating-point currency conversion.
export function parseUsdt(value:string):bigint|null {
 if(!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.'),result=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 return result>=1000000n&&result<=10000000000n?result:null;
}
export function parsePoints(value:string):bigint|null {
 if(!/^(0|[1-9]\d{0,9})(\.\d{1,4})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.'),result=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));return result>0n&&result<=10000000000000n?result:null;
}
export function pointsToUsdt(points:string|bigint):string {
 const n=BigInt(points),fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');return `${n/1000000n}.${fraction}`;
}
export function formatPoints(units:string|bigint,locale='en'):string {const n=BigInt(units),fraction=(n%10000n).toString().padStart(4,'0').replace(/0+$/,'');const decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==='decimal')?.value??'.';return (n/10000n).toLocaleString(locale)+(fraction?decimal+fraction:'');}
export function withdrawalFee(units:bigint,bps:string|number):bigint{return (units*BigInt(bps)+9999n)/10000n;}
export async function isTronAddress(value:string):Promise<boolean> {
 if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value))return false;
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let number=0n;
 for(const c of value)number=number*58n+BigInt(alphabet.indexOf(c));
 const bytes=new Uint8Array(25);for(let i=24;i>=0;i--){bytes[i]=Number(number%256n);number/=256n;}
 if(number!==0n||bytes[0]!==65)return false;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await crypto.subtle.digest('SHA-256',bytes.slice(0,21))));
 return bytes.slice(21).every((byte,i)=>byte===digest[i]);
}
export type WalletSnapshot={purchased:string;earned:string;held:string;deposits_enabled:boolean;tipping_enabled:boolean;withdrawals_enabled:boolean;withdrawal_min_units:string;withdrawal_fee_bps:string;frozen:boolean};
export type WalletEntry={id:string;sequence:string;kind:'deposit'|'tip'|'withdraw_hold'|'withdraw_cancel'|'withdraw_reject'|'withdraw_paid';units:string;delta:string;created_at:string};
export type Withdrawal={id:string;user_id:string;display_name:string;handle:string;units:string;fee_units:string;destination:string;status:'pending'|'processing'|'cancelled'|'rejected'|'paid';created_at:string;tx_hash:string|null;};
// Preserve the same key across a timeout/reload. No balance or auth token is persisted.
export function walletRequest(actor:string,kind:string,payload:string):string {
 const key=`chinateam-wallet-request:${actor}:${kind}`;
 const previous=JSON.parse(sessionStorage.getItem(key)??'null');if(previous?.payload===payload&&/^[0-9a-f-]{36}$/.test(previous.id))return previous.id;
 const id=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({id,payload}));return id;
}
export function clearWalletRequest(actor:string,kind:string){try{sessionStorage.removeItem(`chinateam-wallet-request:${actor}:${kind}`);}catch{}}
export function clearMatchedWalletRequest(actor:string,kind:string,id:string){try{if(JSON.parse(sessionStorage.getItem(`chinateam-wallet-request:${actor}:${kind}`)??'null')?.id===id)clearWalletRequest(actor,kind);}catch{}}
