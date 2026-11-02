import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INSTRUMENTS, FRAMES, resolveSymbol, parseKrakenRows,
  parseKrakenTicker, fetchKraken, parseCandles,
} from '../src/lib/v22/market.ts';
import { emptyLedger, activate, parseLedger, update } from '../src/lib/v26-signals.ts';
import { completed } from '../src/lib/v22/analysis.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const anchor = Math.floor(Date.UTC(2026,9,31,12,0,0)/1000/86400)*86400;
function rows(frame, count=270, close=65000) {
  const last = Math.floor(anchor/frame)*frame;
  return Array.from({length:count},(_,i)=>{
    const timestamp=last-(count-i-1)*frame;
    const open=close + i*.1;
    return [timestamp,String(open),String(open+21),String(open-21),String(open+3),'0','1.0',3];
  });
}
const signal=(symbol='BTCUSD')=>({
  id:'btc-first',symbol,provider:'kraken',direction:'BUY',entry:65000,
  stop:64500,target:66000,openedAt:Date.now()-10_000,confidence:76,
  status:'ACTIVE',lastCheckedAt:Date.now()-10_000,
  closedAt:null,exitPrice:null,resultR:null,
});

test('BTC/USD appears as crypto next to Gold, existing instruments unchanged',()=>{
  assert.deepEqual(INSTRUMENTS.map(x=>x.symbol),[
    'XAUUSD','BTCUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD',
  ]);
  assert.equal(resolveSymbol('BTCUSD')?.label,'Bitcoin');
  assert.equal(resolveSymbol('BTCUSD')?.twelve,'BTC/USD');
  assert.equal(resolveSymbol('BTCUSD')?.deriv,'');
  assert.equal(resolveSymbol('BTCUSD')?.precision,4);
});

test('Kraken 5m OHLC rows preserve actual candle opens and boundaries',()=>{
  const bars=parseKrakenRows(rows(300,270),300);
  assert.equal(bars.length,270);
  assert.equal(bars.at(-1).open,65000+269*.1);
  assert.ok(bars.every(b=>b.time%300===0));
  assert.equal(completed(bars,300,(bars.at(-1).time+60)*1000).length,269);
});

test('Kraken OHLC rejects made-up/invalid rows rather than fabricating prices',()=>{
  const valid=rows(900,70);
  valid[4]=[1234567,'100','101','99','100.5'];
  valid[5]=[valid[5][0],'100','90','110','100'];
  assert.equal(parseKrakenRows(valid,900).length,68);
  assert.throws(()=>parseKrakenRows([{}],300),/fewer than 60/);
  assert.throws(()=>parseKrakenRows(null,300),/Missing Kraken/);
});

test('Kraken public BTC/USD requests six actual intervals with pacing and no API key',async()=>{
  const requested=[];
  const waits=[];
  const intervalFrames={'5':300,'15':900,'30':1800,'60':3600,'240':14400,'1440':86400};
  const mockFetch=async url=>{
    const parsed=new URL(url);
    requested.push(parsed);
    const frame=intervalFrames[parsed.searchParams.get('interval')];
    assert.ok(frame);
    return {ok:true,json:async()=>({error:[],result:{XXBTZUSD:rows(frame),last:0}})};
  };
  const result=await fetchKraken('BTCUSD',mockFetch,async delay=>{waits.push(delay)});
  assert.equal(result.symbol,'BTCUSD');
  assert.equal(result.provider,'kraken');
  assert.equal(result.streamSymbol,'BTC/USD');
  assert.deepEqual(Object.keys(result.frames).map(Number).sort((a,b)=>a-b),[...FRAMES]);
  assert.equal(requested.length,6);
  assert.ok(requested.every(url=>url.host==='api.kraken.com' && url.searchParams.get('pair')==='XBTUSD'));
  assert.ok(requested.every(url=>!url.searchParams.has('apikey')));
  assert.deepEqual(waits,[1100,1100,1100,1100,1100]);
});

test('Kraken missing or error timeframes cause fail-closed market data',async()=>{
  const fail=async url=>{
    const interval=new URL(url).searchParams.get('interval');
    const map={'5':300,'15':900,'30':1800,'60':3600,'240':14400,'1440':86400};
    return {ok:true,json:async()=>interval==='240'
      ? {error:['EGeneral:Rate limit exceeded']}
      : {error:[],result:{XXBTZUSD:rows(map[interval])}}};
  };
  await assert.rejects(()=>fetchKraken('BTCUSD',fail,async()=>{}),/unavailable for 4H/);
});

test('Kraken ticker validates price, timestamp, symbol and event source',()=>{
  const now=Date.UTC(2026,9,31,10,0,0);
  const payload={channel:'ticker',type:'snapshot',data:[{
    symbol:'BTC/USD',last:65789.31,timestamp:new Date(now).toISOString(),
  }]};
  assert.deepEqual(parseKrakenTicker(payload,now),{price:65789.31,at:now});
  assert.equal(parseKrakenTicker({...payload,channel:'book'},now),null);
  assert.equal(parseKrakenTicker(payload,now,'ETH/USD'),null);
  assert.equal(parseKrakenTicker(payload,now+200000),null);
  assert.equal(parseKrakenTicker({...payload,data:[{...payload.data[0],last:-1}]},now),null);
  assert.equal(parseKrakenTicker({...payload,data:[{...payload.data[0],timestamp:'bad'}]},now),null);
});

test('BTC signals persist independently, expire on verified TP, and count in history',()=>{
  const first=signal();
  const second={...signal('EURUSD'),id:'other',provider:'deriv'};
  const book=activate(activate(emptyLedger(),first),second);
  assert.deepEqual(parseLedger(JSON.stringify(book)).active.BTCUSD,first);
  assert.deepEqual(parseLedger(JSON.stringify(book)).active.EURUSD,second);
  const done={...first,status:'TP',closedAt:first.openedAt+300000,exitPrice:first.target,resultR:2};
  const updated=update(book,'BTCUSD',done);
  assert.equal(updated.active.BTCUSD,undefined);
  assert.equal(updated.active.EURUSD?.id,'other');
  assert.equal(updated.history.BTCUSD?.[0].status,'TP');
});

test('BTCUSD signal activation uses the common technical ledger', () => {
  const dashboard=read('src/components/MarketDashboard.tsx');
  const ledger=read('src/components/useSignalLedger.ts');
  assert.match(dashboard,/useSignalLedger\(/);
  assert.match(ledger,/setup\.dataCurrent/);
  assert.match(dashboard,/useSignalLedger\(/);
});

test('BTC crypto UI, stream, history limit and preserving other signal modules',()=>{
  const dashboard=read('src/components/MarketDashboard.tsx');
  const market=read('src/lib/v22/market.ts');
  const history=read('src/components/useHistoricalCandles.ts');
  const route=read('src/app/api/market/history/route.ts');
  assert.match(dashboard, /<Bitcoin size=\{16\}/);
  assert.match(dashboard, /parseKrakenTicker\(value/);
  assert.match(dashboard, /ws\.kraken\.com\/v2/);
  assert.match(dashboard, /"CRYPTO"/);
  assert.match(market, /fetchKraken\(symbol\)/);
  assert.match(history, /provider !== "kraken"/);
  assert.match(route, /provider === "kraken"/);
  for(const feature of ['useSignalLedger\(','rememberBrowserAlert\(','const downloadSignals =','useHistoricalCandles\(']){
    assert.ok(dashboard.includes(feature),feature);
  }
});

test('five requested headings and their data text are larger in compact desktop UI',()=>{
  const css=read('src/app/globals.css');
  for(const cls of ['align','gauge','setup','levels','stats']){
    assert.match(css,new RegExp(`\\.mbiotraders-${cls}-card \\.mbiotraders-card-head h2`));
  }
  assert.match(css,/font-size: 14\.2px/);
  assert.match(css,/\.mbiotraders-setup-card \.mbiotraders-check-copy strong \{ font-size: 10\.8px/);
  assert.match(css,/\.mbiotraders-levels-card \.mbiotraders-levels-list span,/);
  assert.match(css,/\.mbiotraders-stats-card \.mbiotraders-stats-list div,/);
  assert.match(css,/@media \(min-width: 761px\) and \(max-width: 1199px\)/);
  assert.match(css,/grid-template-columns: repeat\(2, minmax\(0,1fr\)\)/);
});
