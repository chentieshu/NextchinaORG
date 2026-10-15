import {test} from 'node:test';import assert from 'node:assert/strict';
import {validHistory,mergeCandles,chartUpdateKind,HISTORY_LIMIT} from '../src/modules/predictions/chart-data.ts';
const candle=(time,close=50)=>({time,open:50,high:Math.max(50,close),low:Math.min(50,close),close,volume:'10000',trades:'1'});
const history=rows=>({rows,step:60,has_more:false,next_before:null,from_time:null,server_time:new Date().toISOString()});
test('history rejects unsorted, duplicate, invalid OHLC and unbounded records',()=>{
 assert.equal(validHistory(history([candle(1000),candle(1060,60)])),true);
 for(const rows of [[candle(1000),candle(1000)],[candle(1060),candle(1000)],[{...candle(1000),low:60}],[{...candle(1000),volume:10000}],[{...candle(1000),volume:'9'.repeat(500)}],[null]])assert.equal(validHistory(history(rows)),false);
 assert.equal(validHistory({...history([]),next_before:'bad'}),false);
 assert.equal(validHistory(history(Array.from({length:301},(_,i)=>candle(i+1)))),false);
});
test('history merges pages and live overlap without losing the newest point or exceeding the bound',()=>{
 const old=[candle(1000),candle(1060)];const next=mergeCandles(old,[candle(1060,65),candle(1120)]);
 assert.deepEqual(next.map(r=>r.time),[1000,1060,1120]);assert.equal(next[1].close,65);
 assert.deepEqual(mergeCandles(next,[candle(940)],1000),next);
 assert.equal(mergeCandles([],Array.from({length:7000},(_,i)=>candle(i+1))).length,HISTORY_LIMIT);
 assert.equal(chartUpdateKind(old,next),'update');
 assert.equal(chartUpdateKind(old,[candle(940),...old]),'replace');
 assert.equal(chartUpdateKind(old,[candle(1000,45),old[1]]),'replace');
 assert.equal(chartUpdateKind(old,[...old]),'none');
});
