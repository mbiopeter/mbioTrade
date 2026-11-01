import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDeriv } from "../src/lib/v22/market.ts";
import { isFreshNewsSnapshot, NEWS_MAX_AGE_MS } from "../src/lib/news-calendar.ts";

const root = resolve(import.meta.dirname, "..");
const source = (name) => readFileSync(resolve(root,name),"utf8");
const rows = (frame) => Array.from({length:70}, (_, i) => ({
  epoch: frame * (10000+i), open: 100, high: 102, low: 99, close: 101,
}));

test("Deriv candle requests explicitly request closed-market history adjustment", async () => {
  const sent=[];
  class Socket {
    listeners = new Map();
    constructor(){ queueMicrotask(() => this.listeners.get("open")?.({})); }
    addEventListener(name,listener){ this.listeners.set(name,listener); }
    send(data){
      const req=JSON.parse(data); sent.push(req);
      queueMicrotask(()=>this.listeners.get("message")?.({data:JSON.stringify({req_id:req.req_id,candles:rows(req.granularity)})}));
    }
    close(){}
  }
  const result = await fetchDeriv("XAUUSD",()=>new Socket());
  assert.equal(result.provider,"deriv");
  assert.equal(sent.length,6);
  assert.ok(sent.every(s=>s.adjust_start_time===1));
});

test("Deriv error is surfaced with timeframe rather than an opaque 503", async()=>{
  class Socket {
    listeners=new Map();
    constructor(){queueMicrotask(()=>this.listeners.get("open")?.({}));}
    addEventListener(name,listener){this.listeners.set(name,listener);}
    send(data){
      const req=JSON.parse(data);
      queueMicrotask(()=>this.listeners.get("message")?.({data:JSON.stringify({req_id:req.req_id,error:{message:"Market is closed"}})}));
    }
    close(){}
  }
  await assert.rejects(fetchDeriv("XAUUSD",()=>new Socket()), /Deriv: 5m: Market is closed/);
});

test("news response cache is bounded to the already-required safety freshness",()=>{
  const now=1_800_000_000_000;
  const snapshot={source:"Finance Calendar",events:[],fetchedAt:now,from:now-86400000,to:now+86400000};
  assert.equal(isFreshNewsSnapshot(snapshot,now),true);
  assert.equal(isFreshNewsSnapshot(snapshot,now+NEWS_MAX_AGE_MS),true);
  assert.equal(isFreshNewsSnapshot(snapshot,now+NEWS_MAX_AGE_MS+1),false);
  assert.equal(isFreshNewsSnapshot(snapshot,now-1),false);
  assert.equal(isFreshNewsSnapshot(snapshot,now+90_001,90_000),false);
  assert.equal(isFreshNewsSnapshot(null,now),false);
  assert.equal(isFreshNewsSnapshot({...snapshot,to:now},now),false);
});

test("news endpoint reuses only fresh verified calendar responses and fails closed",()=>{
 const route=source("src/app/api/news-calendar/route.ts");
 assert.match(route,/isFreshNewsSnapshot\(lastVerified, Date\.now\(\)\)/);
 assert.match(route,/status: 503/);
 assert.match(route,/pending = fetchNewsSnapshot\(\)\.finally/);
 const history=source("src/lib/v26-history.ts");
 assert.match(history,/adjust_start_time: 1/);
});
