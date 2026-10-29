import test from 'node:test';
import assert from 'node:assert/strict';
import {INSTRUMENTS,FRAMES,parseCandles,resolveSymbol,fetchDeriv} from '../src/lib/v22/market.ts';
import {completed,evaluateFrame,inspectConfluence,replayRecent} from '../src/lib/v22/analysis.ts';

function series(frame, count=260, anchor=1761742800, slope=.35) {
  const end=Math.floor(anchor/frame)*frame;
  return Array.from({length:count},(_,i)=>{
    const time=end-(count-i)*frame;
    const close=2000+i*slope;
    return {time,open:close-.18,high:close+.46,low:close-.50,close};
  });
}
function snapshot(direction=1, anchor=1761742800) {
  const frames={};
  for(const frame of FRAMES)frames[frame]=series(frame,260,anchor,.35*direction);
  return {symbol:'XAUUSD',frames};
}

test('six valid instruments, Gold and five forex pairs',()=>{
  assert.deepEqual(INSTRUMENTS.map(x=>x.symbol),['XAUUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD']);
  assert.equal(resolveSymbol('OTHER'),null);
});
test('OHLC rows sorted, invalid and duplicate points rejected',()=>{
  const rows=series(300,70).map(x=>({...x,epoch:x.time})).reverse();
  rows.push({...rows[0]}, {...rows[1],epoch:rows[1].epoch+3}, {...rows[2],high:-100});
  const parsed=parseCandles(rows,300,'epoch');
  assert.equal(parsed.length,70);assert.ok(parsed.every((x,i)=>i===0||x.time>parsed[i-1].time));
});
test('no made up candles or time-boundary rounding',()=>{
  assert.throws(()=>parseCandles([{epoch:1710000001,open:10,high:11,low:9,close:10}],300,'epoch'));
});
test('Twelve Data ISO-like UTC datetime parsing',()=>{
  const start=Date.UTC(2026,0,1,0,0,0)/1000;
  const rows=Array.from({length:70},(_,i)=>({datetime:new Date((start+i*900)*1000).toISOString().slice(0,19).replace('T',' '),open:'2000',high:'2001',low:'1999',close:'2000.1'}));
  assert.equal(parseCandles(rows,900,'datetime').length,70);
});
test('unfinished bar excluded from every technical vote',()=>{
  const frame=300,anchor=1761742800,series300=series(frame,260,anchor);
  assert.equal(completed([...series300,{time:anchor,open:1,high:3,low:.5,close:1}],frame,anchor*1000).length,260);
});
test('EMA, RSI, MACD, ADX consensus present with 205+ real bars',()=>{
  const r=evaluateFrame(series(3600,260),3600,1761742800*1000);
  assert.equal(r.direction,'BUY');
  assert.ok(r.indicators.some(v=>v.name==='RSI (14)'));
  assert.ok(r.adx>=16);
});
test('Higher timeframe disagreement blocks signals',()=>{
  const s=snapshot();s.frames[86400]=series(86400,260,1761742800,-.4);
  const result=inspectConfluence(s,1761742800*1000);
  assert.equal(result.status,'WAIT'); assert.ok(result.criteria.find(v=>v.name.includes('higher momentum'))?.ok===false);
});
test('Stale feed blocks entries and sound eligible state',()=>{
  const s=snapshot(); const result=inspectConfluence(s,(1761742800+7200)*1000);
  assert.equal(result.status,'WAIT'); assert.equal(result.dataCurrent,false);
});
test('recent replay never invents completed outcomes without future bars',()=>{
  const s=snapshot();s.frames[300]=s.frames[300].slice(0,15);
  assert.deepEqual(replayRecent(s),[]);
});
test('full real data state is deterministic at same cutoff',()=>{
  const s=snapshot();const a=inspectConfluence(s,1761742800*1000),b=inspectConfluence(s,1761742800*1000);
  assert.deepEqual(a,b);
});

test('BUY setup only after higher trend and 5m pullback confirmation',()=>{
  const anchor=1761742800,frames={};
  for(const frame of FRAMES){
    const start=Math.floor(anchor/frame)*frame-260*frame;
    frames[frame]=Array.from({length:260},(_,i)=>{
      let close=2000+.38*i, open=close-.22;
      let high=close+.28,low=open-.32;
      if(frame===300){
        if(i===257){open=close+.9;high=open+.16;low=close-.32;}
        if(i===258){open=close+.4;high=open+.16;low=close-.2;}
        if(i===259){open=close-.9;close+=.5;high=close+.2;low=open-.3;}
      }
      return {time:start+i*frame,open,high,low,close};
    });
  }
  const s=inspectConfluence({symbol:'XAUUSD',frames},anchor*1000);
  assert.equal(s.status,'BUY');assert.ok(s.signalId);assert.ok(s.entry<s.target);assert.ok(s.entry>s.stop);
  // In-progress reversal cannot be used a minute before its 5m close.
  const before=inspectConfluence({symbol:'XAUUSD',frames},(anchor-60)*1000);
  assert.equal(before.status,'WAIT');
});

test('SELL setup is symmetrical for descending trend and bullish pullback',()=>{
  const anchor=1761742800,frames={};
  for(const frame of FRAMES){
    const start=Math.floor(anchor/frame)*frame-260*frame;
    frames[frame]=Array.from({length:260},(_,i)=>{
      let close=2000-.38*i,open=close+.22;
      let high=open+.32,low=close-.28;
      if(frame===300){
        if(i===257){open=close-.9;high=close+.32;low=open-.16;}
        if(i===258){open=close-.4;high=close+.2;low=open-.16;}
        if(i===259){open=close+.9;close-=.5;high=open+.3;low=close-.2;}
      }
      return {time:start+i*frame,open,high,low,close};
    });
  }
  const s=inspectConfluence({symbol:'EURUSD',frames},anchor*1000);
  assert.equal(s.status,'SELL');assert.ok(s.entry>s.target);assert.ok(s.entry<s.stop);
});

test('one public WebSocket retrieves all six timeframes by req_id',async()=>{
  class MockSocket {
    handlers={};constructor(){queueMicrotask(()=>this.fire('open',{}));}
    addEventListener(type,handler){this.handlers[type]??=[];this.handlers[type].push(handler);}
    fire(type,event){for(const handler of this.handlers[type]??[])handler(event);}
    send(message){
      const request=JSON.parse(message);
      const rows=series(request.granularity,70).map(c=>({...c,epoch:c.time}));
      queueMicrotask(()=>this.fire('message',{data:JSON.stringify({req_id:request.req_id,msg_type:'candles',candles:rows})}));
    }
    close(){}
  }
  const snapshot=await fetchDeriv('XAUUSD',()=>new MockSocket());
  assert.equal(snapshot.provider,'deriv');
  for(const frame of FRAMES)assert.equal(snapshot.frames[frame].length,70);
});

test('Twelve Data provider uses all six required intervals and server-side key',async()=>{
  const {fetchTwelveData}=await import('../src/lib/v22/market.ts');
  const invoked=[];
  const fakeFetch=async url=>{
    const parsed=new URL(url);invoked.push(parsed);
    const intervalToFrame={'5min':300,'15min':900,'30min':1800,'1h':3600,'4h':14400,'1day':86400};
    const frame=intervalToFrame[parsed.searchParams.get('interval')];
    const rows=series(frame,70).map(row=>({
      datetime:new Date(row.time*1000).toISOString().slice(0,19).replace('T',' '),
      open:String(row.open),high:String(row.high),low:String(row.low),close:String(row.close),
    }));
    return {ok:true,json:async()=>({values:rows,status:'ok'})};
  };
  const data=await fetchTwelveData('EURUSD','server-secret-test',fakeFetch);
  assert.equal(data.provider,'twelvedata');
  assert.equal(data.streamSymbol,null);
  assert.deepEqual(Object.keys(data.frames).length,6);
  assert.ok(invoked.every(url=>url.searchParams.get('apikey')==='server-secret-test'));
  assert.ok(invoked.every(url=>url.searchParams.get('symbol')==='EUR/USD'));
});

test('No realtime signal when one required timeframe is unavailable',()=>{
  const s=snapshot();delete s.frames[14400];
  const result=inspectConfluence(s,1761742800*1000);
  assert.equal(result.status,'WAIT');
  assert.equal(result.bias,'NEUTRAL');
});
