import {test} from 'node:test';import assert from 'node:assert/strict';
import {orderLevels,referencePrice,validQuote} from '../src/modules/predictions/pricing.ts';
import {formatPoints,formatUsdtMicros,pointsToUsdt} from '../src/modules/wallet/money.ts';
test('reference probability distinguishes midpoint, last execution and final payout',()=>{
 const m={state:'open',last_yes:44,best_yes_bid:60,best_yes_ask:65};assert.equal(referencePrice(m),62.5);assert.equal(referencePrice({...m,best_yes_ask:75}),44);assert.equal(referencePrice({...m,best_yes_bid:null,last_yes:null}),null);
 for(const[result,price]of[['yes',100],['no',0],['void',50]])assert.equal(referencePrice({...m,state:'resolved',result}),price);
});
test('order book combines complementary buys without inventing sell-side merge liquidity',()=>{
 const b=[{side:'buy',outcome:'yes',price:60,quantity:'12'},{side:'buy',outcome:'no',price:35,quantity:'10'},{side:'sell',outcome:'yes',price:65,quantity:'4'},{side:'sell',outcome:'no',price:50,quantity:'20'}];
 assert.deepEqual(orderLevels(b,'yes'),{bids:[{price:60,quantity:12n}],asks:[{price:65,quantity:14n}]});
 assert.deepEqual(orderLevels(b,'no'),{bids:[{price:35,quantity:10n}],asks:[{price:40,quantity:12n},{price:50,quantity:20n}]});
});
test('quote validation and monetary display keep signed P&L and USDT separate',()=>{
 const q={filled:'2',unfilled:'0',units:'10000',worst:50,limited:false,server_time:new Date().toISOString()};assert.equal(validQuote(q),true);assert.equal(validQuote({...q,units:'1e5'}),false);assert.equal(validQuote({...q,worst:101}),false);
 assert.equal(formatPoints(-1n),'−0.0001');assert.equal(formatPoints(-12345n,'es'),'−1,2345');assert.equal(formatUsdtMicros('10001234'),'10.001234');assert.equal(pointsToUsdt('10000'),'1.00');
});
