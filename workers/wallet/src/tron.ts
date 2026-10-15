// TRON mainnet USDt, from https://tether.to/en/supported-protocols/.
export const USDT_CONTRACT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_HEX='a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const TRANSFER='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export type Transfer={index:number;from:string;to:string;amount:string};
type Receipt={id?:string;blockTimeStamp?:number;blockNumber?:number;result?:string;receipt?:{result?:string};log?:{address?:string;topics?:string[];data?:string}[]};
export function confirmedTransfers(input:unknown,tx:string){
 const receipt=input as Receipt;
 if(!/^[a-f0-9]{64}$/.test(tx)||receipt?.id!==tx||receipt.result==='FAILED'||receipt.receipt?.result!=='SUCCESS'||!Number.isSafeInteger(receipt.blockNumber)||!Number.isSafeInteger(receipt.blockTimeStamp)||!Array.isArray(receipt.log))throw Error('receipt_not_confirmed');
 const transfers:Transfer[]=[];
 receipt.log.forEach((log,index)=>{
  if(log.address?.toLowerCase()!==USDT_HEX||log.topics?.[0]?.toLowerCase()!==TRANSFER)return;
  if(log.topics.length!==3||!log.topics.slice(1).every(t=>/^0{24}[a-f0-9]{40}$/i.test(t))||!log.data||!/^[a-f0-9]{64}$/i.test(log.data))throw Error('invalid_transfer');
  const amount=BigInt('0x'+log.data);if(amount===0n)return;if(amount>10000000000000n)throw Error('transfer_requires_review');
  transfers.push({index,from:log.topics[1].slice(24).toLowerCase(),to:log.topics[2].slice(24).toLowerCase(),amount:amount.toString()});
 });return{block_ms:receipt.blockTimeStamp!,transfers};
}
