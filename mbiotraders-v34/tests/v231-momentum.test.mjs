import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHigherMomentum } from '../src/lib/v231/momentum.ts';
import { evaluateFrame, evaluateLiveFrame, inspectConfluence } from '../src/lib/v22/analysis.ts';
import { FRAMES } from '../src/lib/v22/market.ts';

const DAY = 86400;
const day0 = Date.UTC(2026, 9, 15, 0, 0, 0) / 1000;

function createPriceWindow() {
  const daily = [2070, 2040, 2020, 1900, 1915, 1930, 1945, 1960];
  const frames = { 3600: [], 14400: [], 86400: [] };
  for (let d = 0; d < daily.length; d++) {
    const base = daily[d];
    const close = base + 10;
    const stamp = day0 + d * DAY;
    frames[86400].push({ time: stamp, open: base, high: Math.max(base, close) + 3, low: Math.min(base, close) - 3, close });
    for (const frame of [3600,14400]) {
      const count = DAY / frame;
      for (let i = 0; i < count; i++) {
        const open = base + i * 10 / count;
        const end = base + (i + 1) * 10 / count;
        frames[frame].push({ time: stamp + frame * i, open, high: end + .1, low: open - .1, close: end });
      }
    }
  }
  return frames;
}

const at = (day0 + 8*DAY)*1000 + 1000;

test('3D and 5D use complete trading sessions, while 7D can detect an opposite trend', () => {
  const data = createPriceWindow();
  const a = analyzeHigherMomentum(data, at, 3);
  const b = analyzeHigherMomentum(data, at, 5);
  const c = analyzeHigherMomentum(data, at, 7);
  assert.equal(a.bias, 'BUY');
  assert.equal(b.bias, 'BUY');
  assert.equal(c.bias, 'SELL');
  for(const result of [a,b,c]) {
    assert.equal(result.complete, true);
    assert.equal(result.readings[3600].bars, result.days * 24);
    assert.equal(result.readings[14400].bars, result.days * 6);
    assert.equal(result.readings[86400].bars, result.days);
  }
});

test('Unclosed daily candle is never part of last N complete trading sessions', () => {
  const data = createPriceWindow();
  const before = analyzeHigherMomentum(data, at, 5);
  const incomplete = day0 + 8*DAY;
  data[86400].push({time:incomplete,open:3000,high:3200,low:1800,close:1800});
  const after = analyzeHigherMomentum(data, at, 5);
  assert.deepEqual(after, before);
});

test('Gapped H1 session blocks HTF confirmation instead of fabricating prices', () => {
  const data = createPriceWindow();
  data[3600] = data[3600].filter((bar)=>!(bar.time >= day0 + 5*DAY && bar.time < day0 + 5*DAY + 16*3600));
  const result = analyzeHigherMomentum(data, at, 5);
  assert.equal(result.complete, false);
  assert.equal(result.bias, 'NEUTRAL');
  assert.match(result.readings[3600].reason,/Incomplete H1/);
});

test('3–7 day setting is validated and cannot be silently changed', () => {
  assert.throws(()=>analyzeHigherMomentum(createPriceWindow(),at,1),/3, 5 or 7/);
  assert.throws(()=>analyzeHigherMomentum(createPriceWindow(),at,9),/3, 5 or 7/);
});

test('Missing D1 sessions block the daily momentum decision', () => {
  const data = createPriceWindow();
  data[86400] = data[86400].slice(-2);
  const result = analyzeHigherMomentum(data, at, 5);
  assert.equal(result.bias, 'NEUTRAL');
  assert.equal(result.start, null);
});

function series(frame, count=260, anchor=day0+8*DAY) {
  const end=Math.floor(anchor/frame)*frame;
  return Array.from({length:count},(_,i)=>{
    const time=end-(count-i)*frame;
    const close=2000+i*.2;
    return {time,open:close-.1,high:close+.3,low:close-.3,close};
  });
}

test('Streaming gauge may follow the live quote without affecting confirmed strategy readings', () => {
  const atTime = (day0+8*DAY)*1000;
  const five=series(300);
  const base=evaluateFrame(five,300,atTime);
  const live=evaluateLiveFrame(five,300,atTime+60000,2222,atTime+60000);
  assert.equal(live.current.close,2222);
  assert.deepEqual(evaluateFrame(five,300,atTime),base);
  assert.ok(live.indicators.length>0);
  const frames={}; for(const frame of FRAMES)frames[frame]=series(frame);
  const signalBefore=inspectConfluence({symbol:'XAUUSD',frames},atTime,5);
  assert.deepEqual(signalBefore,inspectConfluence({symbol:'XAUUSD',frames},atTime,5));
});

test('Live strength needle moves continuously with actual price while respecting bounds', async () => {
  const { liveGaugeScore } = await import('../src/lib/v231/gauge.ts');
  assert.equal(liveGaugeScore(30,null,2000,2),30);
  assert.ok(liveGaugeScore(30,2001,2000,2)>30);
  assert.ok(liveGaugeScore(30,1999,2000,2)<30);
  assert.ok(liveGaugeScore(30,2001.2,2000,2)>liveGaugeScore(30,2001,2000,2));
  assert.ok(liveGaugeScore(100,2050,2000,2)<=100);
});
