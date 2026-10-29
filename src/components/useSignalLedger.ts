'use client';
import {useEffect,useMemo,useState} from 'react';
import type {Candle} from '@/lib/types';import type {MarketSymbol,MarketPayload} from '@/lib/v22/market';import type {Setup} from '@/lib/v22/analysis';
import {LEDGER_KEY,emptyLedger,parseLedger,activate,setPending,closePending,seen,nearbyBarrier,confirmedBreakout,plan,reconcile,update,type Ledger} from '@/lib/v26-signals';
export function useSignalLedger({symbol,provider,setup,now,isLive,bars5,bars15,barsH1,historyLoading}:{symbol:MarketSymbol;provider:MarketPayload['provider'];setup:Setup;now:number;isLive:boolean;bars5:Candle[];bars15:Candle[];barsH1:Candle[];historyLoading:boolean}){
 const [ledger,setLedger]=useState<Ledger>(emptyLedger);const[ready,setReady]=useState(false);
 useEffect(()=>{try{setLedger(parseLedger(localStorage.getItem(LEDGER_KEY)));}catch{}setReady(true);const sync=(e:StorageEvent)=>{if(e.key===LEDGER_KEY)setLedger(parseLedger(e.newValue));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(LEDGER_KEY,JSON.stringify(ledger));}catch{}},[ledger,ready]);
 useEffect(()=>{if(!ready||!now||!bars5.length)return;setLedger(old=>{
  let book=old;const active=book.active[symbol];
  if(active){if(active.provider!==provider||bars5[0].time*1000>active.lastCheckedAt)return book;return update(book,symbol,reconcile(active,bars5,now).signal);}
  if(!isLive||!setup.dataCurrent||!setup.momentum.complete)return book;
  const waiting=book.pending[symbol];if(waiting){if(now-waiting.createdAt>6*3600000)return closePending(book,symbol);if(setup.bias!==waiting.direction)return book;const when=confirmedBreakout(waiting,bars5,now);if(!when||now-when>=300000)return book;const bar=bars5.find(b=>(b.time+300)*1000===when);if(!bar)return book;const candidate=plan({id:`${waiting.id}-break-${when}`,symbol,provider,direction:waiting.direction,entry:bar.close,openedAt:when,confidence:waiting.confidence,five:bars5,fifteen:bars15,hourly:barsH1});return candidate?activate(book,candidate):book;}
  if(!['BUY','SELL'].includes(setup.status)||!setup.signalId||!setup.time||!setup.entry||now-setup.time<0||now-setup.time>=300000||seen(book,symbol,setup.signalId))return book;
  const direction=setup.status as 'BUY'|'SELL';const barrier=nearbyBarrier(bars5,direction,setup.entry,setup.time);if(barrier!==null)return setPending(book,{id:setup.signalId,symbol,direction,level:barrier,createdAt:setup.time,confidence:setup.score});
  const candidate=plan({id:setup.signalId,symbol,provider,direction,entry:setup.entry,openedAt:setup.time,confidence:setup.score,five:bars5,fifteen:bars15,hourly:barsH1});return candidate?activate(book,candidate):book;
 });},[ready,symbol,provider,setup.status,setup.signalId,setup.time,setup.entry,setup.score,setup.bias,setup.dataCurrent,setup.momentum.complete,now,isLive,bars5,bars15,barsH1]);
 const active=ledger.active[symbol]??null;
 const warning=useMemo(()=>{if(!active)return null;if(active.provider!==provider)return `Source changed (${active.provider} → ${provider}); awaiting original provider to verify exit.`;if(!bars5.length)return 'Waiting for real candle data';if(bars5[0].time*1000>active.lastCheckedAt)return historyLoading?'Fetching earlier candles to reconcile saved signal':'History gap — keeping signal active until missing candles become available';return reconcile(active,bars5,now).reason;},[active,provider,bars5,now,historyLoading]);
 return {active,pending:ledger.pending[symbol]??null,history:[...(ledger.history[symbol]??[])].reverse(),warning,ready};
}
