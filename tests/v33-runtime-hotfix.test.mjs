import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDeriv } from "../src/lib/v22/market.ts";

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

test("dashboard uses validated market data when active", () => {
  const dashboard=source("src/components/MarketDashboard.tsx");
  assert.match(dashboard, /useSignalLedger\(/);
  assert.match(dashboard,/isLive:/);
  assert.match(source("src/components/useSignalLedger.ts"),/setup.dataCurrent/);
});

test("closed-market Deriv history handling is preserved", () => {
  const history=source("src/lib/v26-history.ts");
  assert.match(history,/adjust_start_time: 1/);
});
