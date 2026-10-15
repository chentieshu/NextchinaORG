// Wallet-owned signing only. Do not import TronWeb into the browser bundle.
export type WalletTronWeb={defaultAddress:{base58:string|false};trx:{signMessageV2:(message:string)=>Promise<string>;getBlockByNumber:(number:number)=>Promise<{blockID:string}>}};
export type TronProvider={request:(args:{method:string})=>Promise<unknown>;tronWeb:WalletTronWeb|false;on?:(event:string,listener:()=>void)=>unknown;removeListener?:(event:string,listener:()=>void)=>unknown};
type TronWindow=Window&{tron?:TronProvider;tronLink?:{request:(args:{method:string})=>Promise<{code:number}>;tronWeb?:WalletTronWeb};tronWeb?:WalletTronWeb};
export async function discoverTronLink():Promise<TronProvider>{
 const w=window as TronWindow;
 const announced=await new Promise<TronProvider|undefined>(resolve=>{
  let candidate:TronProvider|undefined;
  const announce=(event:Event)=>{const d=(event as CustomEvent<{info?:{rdns?:string};provider?:TronProvider}>).detail;if(d?.info?.rdns==='org.tronlink.www'&&typeof d.provider?.request==='function')candidate=d.provider;};
  window.addEventListener('TIP6963:announceProvider',announce);window.dispatchEvent(new Event('TIP6963:requestProvider'));
  setTimeout(()=>{window.removeEventListener('TIP6963:announceProvider',announce);resolve(candidate);},350);
 });
 if(announced||w.tron)return announced??w.tron!;
 // Compatibility for older TronLink mobile browsers. No message-event trust.
 if(w.tronLink)return{request:async()=>{const r=await w.tronLink!.request({method:'tron_requestAccounts'});if(r.code!==200)throw Error('wallet_denied');return[];},get tronWeb(){return w.tronLink?.tronWeb??w.tronWeb??false;}};
 throw Error('wallet_missing');
}
export async function walletAccount(provider:TronProvider,expected?:string){
 const wallet=provider.tronWeb,address=wallet&&wallet.defaultAddress.base58;
 if(!wallet||!address||expected&&address!==expected)throw Error('wallet_changed');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const block=await Promise.race([wallet.trx.getBlockByNumber(0),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('wallet_network')),10000);})]).finally(()=>clearTimeout(timer));
 if(!block.blockID||block.blockID.slice(-8).toLowerCase()!=='2b6653dc')throw Error('wallet_network');
 if(provider.tronWeb!==wallet||wallet.defaultAddress.base58!==address)throw Error('wallet_changed');
 return{wallet,address};
}
