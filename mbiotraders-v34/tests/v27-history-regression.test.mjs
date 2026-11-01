import test from "node:test";
import assert from "node:assert/strict";
import { derivPage, twelvePage } from "../src/lib/v26-history.ts";

const FRAME = 300;
const START = 1_793_000_100;
const before = START + 3 * FRAME;

const candles = [
  { epoch: START, open: 2000, high: 2003, low: 1998, close: 2001 },
  { epoch: START + FRAME, open: 2001, high: 2004, low: 2000, close: 2002 },
];

test("historical Deriv page keeps verified broker candle times", async () => {
  const listeners = new Map();
  const sent = [];
  let closed = false;
  const factory = () => ({
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    send(message) {
      const request = JSON.parse(message);
      sent.push(request);
      queueMicrotask(() => {
        listeners.get("message")?.({
          data: JSON.stringify({ req_id: 2601, candles }),
        });
      });
    },
    close() {
      closed = true;
    },
  });
  const work = derivPage("XAUUSD", FRAME, before, 100, factory);
  queueMicrotask(() => listeners.get("open")?.({}));
  const result = await work;
  assert.equal(sent[0].ticks_history, "frxXAUUSD");
  assert.equal(sent[0].granularity, FRAME);
  assert.deepEqual(result.map((candle) => candle.time), [START, START + FRAME]);
  assert.equal(closed, true);
});

test("historical Twelve Data page keeps the upstream OHLC and timeframe", async () => {
  const rows = [
    { datetime: new Date(START * 1000).toISOString(), open: 2000, high: 2003, low: 1998, close: 2001 },
    { datetime: new Date((START + FRAME) * 1000).toISOString(), open: 2001, high: 2004, low: 2000, close: 2002 },
  ];
  let requestUrl = "";
  const fetcher = async (url) => {
    requestUrl = url;
    return {
      ok: true,
      json: async () => ({ values: rows }),
    };
  };
  const result = await twelvePage("XAUUSD", FRAME, before, "test-server-key", 100, fetcher);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1].close, 2002);
  assert.match(requestUrl, /interval=5min/);
  assert.match(requestUrl, /symbol=XAU%2FUSD/);
});
