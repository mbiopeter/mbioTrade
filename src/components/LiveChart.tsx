"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, LineSeries, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/types";
import { ema } from "@/lib/indicators";
import type {TrackedSignal} from "@/lib/v26-signals";

type Props = {
  candles: Candle[];
  symbol: string;
  frame: number;
  livePrice: number | null;
  liveAt: number | null;
  support: number | null;
  resistance: number | null;
  signal: TrackedSignal | null;
};

export function LiveChart({ candles, symbol, frame, livePrice, liveAt, signal, support, resistance }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const bars = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fast = useRef<ISeriesApi<"Line"> | null>(null);
  const slow = useRef<ISeriesApi<"Line"> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const view = useRef("");
  const liveBar = useRef<Candle | null>(null);
  const candleEnd = useRef(0);
  const [zones, setZones] = useState<{ resistance: number | null; support: number | null }>({ resistance: null, support: null });
  const zonesUpdater = useRef<() => void>(() => {});
  const [position,setPosition]=useState<{x:number;width:number;entry:number;stop:number;target:number}|null>(null);
  const positionRef=useRef(signal),dataRef=useRef(candles),frameRef=useRef(frame);
  positionRef.current=signal;dataRef.current=candles;frameRef.current=frame;
  const positionUpdater=useRef<() => void>(()=>{});

  const updateZones = useCallback(() => {
    const series = bars.current;
    if (!series) return;
    const r = resistance !== null ? series.priceToCoordinate(resistance) : null;
    const s = support !== null ? series.priceToCoordinate(support) : null;
    setZones((prev) => {
      const next = { resistance: r, support: s };
      return prev.resistance === next.resistance && prev.support === next.support ? prev : next;
    });
  }, [support, resistance]);

  zonesUpdater.current = updateZones;
  positionUpdater.current = () => {
    const ser=bars.current,ch=chart.current,sig=positionRef.current,data=dataRef.current;
    if(!ser||!ch||!sig||!data.length){setPosition(null);return;}
    const stamp=Math.floor(sig.openedAt/1000/frameRef.current)*frameRef.current;
    const first=data.find(b=>b.time>=stamp);if(!first||first.time>stamp+frameRef.current){setPosition(null);return;}
    const ts=ch.timeScale();
    const x=ts.timeToCoordinate(first.time as UTCTimestamp),end=ts.timeToCoordinate(data.at(-1)!.time as UTCTimestamp);
    const entry=ser.priceToCoordinate(sig.entry),stop=ser.priceToCoordinate(sig.stop),target=ser.priceToCoordinate(sig.target);
    if([x,end,entry,stop,target].some(n=>n===null||!Number.isFinite(n))){setPosition(null);return;}
    const max=el.current?.clientWidth??0,left=Math.min(max-15,Math.max(-max,Number(x)));
    const right=Math.min(max-10,Math.max(Number(end)+42,left+100));
    if(right<=0||left>=max){setPosition(null);return;}
    setPosition(prev=>prev&&Math.abs(prev.x-left)<.2&&Math.abs(prev.width-(right-left))<.2&&Math.abs(prev.entry-Number(entry))<.2&&Math.abs(prev.stop-Number(stop))<.2&&Math.abs(prev.target-Number(target))<.2?prev:{x:left,width:right-left,entry:Number(entry),stop:Number(stop),target:Number(target)});
  };

  useEffect(() => {
    const container = el.current;
    if (!container) return;
    const instance = createChart(container, {
      width: Math.max(1, container.clientWidth),
      height: Math.max(300, container.clientHeight),
      layout: { background: { type: ColorType.Solid, color: "#03111b" }, textColor: "#a2b7c0", fontFamily: "DM Sans Variable, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "rgba(132,171,190,.09)" }, horzLines: { color: "rgba(132,171,190,.09)" } },
      crosshair: { vertLine: { color: "#1d7469" }, horzLine: { color: "#1d7469" } },
      rightPriceScale: { borderColor: "#1a3441", scaleMargins: { top: .20, bottom: .12 } },
      timeScale: { borderColor: "#1a3441", timeVisible: true, secondsVisible: false, rightOffset: 10, barSpacing: 9 },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const c = instance.addSeries(CandlestickSeries, {
      upColor: "#25dfa6", wickUpColor: "#25dfa6", downColor: "#fa6576", wickDownColor: "#fa6576",
      borderVisible: false, priceLineVisible: true, priceFormat:{type:"price",precision:4,minMove:0.0001},
    });
    const f = instance.addSeries(LineSeries, { color: "#3b96ff", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const s = instance.addSeries(LineSeries, { color: "#eda52b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chart.current = instance; bars.current = c; fast.current = f; slow.current = s;
    const resize = new ResizeObserver(() => {
      instance.resize(Math.max(1, container.clientWidth), Math.max(300, container.clientHeight));
      window.requestAnimationFrame(() => {zonesUpdater.current();positionUpdater.current();});
    });
    resize.observe(container);
    const onScroll=()=>window.requestAnimationFrame(()=>{zonesUpdater.current();positionUpdater.current();});
    instance.timeScale().subscribeVisibleLogicalRangeChange(onScroll);
    return () => {
      resize.disconnect();instance.timeScale().unsubscribeVisibleLogicalRangeChange(onScroll); instance.remove();
      chart.current = null; bars.current = null; fast.current = null; slow.current = null;
      view.current = ""; liveBar.current = null; candleEnd.current = 0;
    };
  }, []);

  useEffect(() => {
    const c = bars.current, f = fast.current, s = slow.current, ch = chart.current;
    if (!c || !f || !s || !ch) return;
    liveBar.current = null;
    candleEnd.current = candles.at(-1)?.time ?? 0;
    if (!candles.length) { c.setData([]); f.setData([]); s.setData([]); return; }
    const values = candles.map((bar) => bar.close);
    const e50 = ema(values, 50), e200 = ema(values, 200);
    const oldRange=view.current===`${symbol}:${frame}`?ch.timeScale().getVisibleRange():null;
    c.setData(candles.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })));
    f.setData(candles.map((bar, i) => ({ time: bar.time as UTCTimestamp, value: e50[i] })));
    s.setData(candles.map((bar, i) => ({ time: bar.time as UTCTimestamp, value: e200[i] })));
    const key = `${symbol}:${frame}`;
    if (view.current !== key) {
      ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 89), to: candles.length + 7 });
      view.current = key;
    }else if(oldRange){try{ch.timeScale().setVisibleRange(oldRange);}catch{/* old range outside new history */}}
    window.requestAnimationFrame(()=>{updateZones();positionUpdater.current();});
  }, [candles, symbol, frame, updateZones]);

  // Live Deriv ticks update the forming visual candle; signal calculations
  // continue using independently completed history in inspectConfluence().
  useEffect(() => {
    const series = bars.current;
    if (!series || livePrice === null || liveAt === null || !Number.isFinite(livePrice) || livePrice <= 0) return;
    const bucket = Math.floor(liveAt / 1000 / frame) * frame;
    if (bucket < candleEnd.current || bucket > candleEnd.current + frame * 4) return;
    const provided = bucket === candleEnd.current ? candles.at(-1) : null;
    const previous = liveBar.current?.time === bucket ? liveBar.current : provided;
    const next: Candle = previous
      ? { time: bucket, open: previous.open, high: Math.max(previous.high, livePrice), low: Math.min(previous.low, livePrice), close: livePrice }
      : { time: bucket, open: livePrice, high: livePrice, low: livePrice, close: livePrice };
    liveBar.current = next;
    try { series.update({ ...next, time: bucket as UTCTimestamp }); } catch { /* wait for provider refresh */ }
    window.requestAnimationFrame(()=>{updateZones();positionUpdater.current();});
  }, [livePrice, liveAt, frame, candles, updateZones]);

  useEffect(() => {
    const series = bars.current;
    if (!series) return;
    for (const line of lines.current) series.removePriceLine(line);
    lines.current = [];
    if (!signal){setPosition(null);return;}
    for (const l of [
      { price: signal.entry, color: "#d6e7e2", title: `${signal.direction} ENTRY` },
      { price: signal.stop, color: "#ff6476", title: "STOP LOSS" },
      { price: signal.target, color: "#28e5a8", title: "TAKE PROFIT" },
    ]) {
      if (l.price !== null && Number.isFinite(l.price)) {
        lines.current.push(series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title }));
      }
    }
    window.requestAnimationFrame(()=>positionUpdater.current());
  }, [signal?.id, signal?.entry, signal?.stop, signal?.target, signal?.direction]);

  return (
    <div className="mbiotraders-chart-layer">
      <div className="mbiotraders-chart" ref={el} role="img" aria-label={`${symbol} ${frame / 60} minute interactive candlestick chart with EMA 50 and EMA 200, actual provider candles and optional live quote`} />
      {signal&&position&&<div className="mbiotraders-position-overlay">
        <div className="mbiotraders-position-zone gain" style={{left:position.x,width:position.width,top:Math.min(position.entry,position.target),height:Math.abs(position.entry-position.target)}} />
        <div className="mbiotraders-position-zone risk" style={{left:position.x,width:position.width,top:Math.min(position.entry,position.stop),height:Math.abs(position.entry-position.stop)}} />
        <div className="mbiotraders-position-level entry" style={{left:position.x,width:position.width,top:position.entry}}><span>{signal.direction} ENTRY {signal.entry.toFixed(4)}</span></div>
        <div className="mbiotraders-position-level profit" style={{left:position.x,width:position.width,top:position.target}}><span>TP {signal.target.toFixed(4)}</span></div>
        <div className="mbiotraders-position-level loss" style={{left:position.x,width:position.width,top:position.stop}}><span>SL {signal.stop.toFixed(4)}</span></div>
      </div>}
      {zones.resistance !== null && Number.isFinite(zones.resistance) && (
        <div className="mbiotraders-price-zone resistance" style={{ top: zones.resistance - 11 }}>Resistance Zone</div>
      )}
      {zones.support !== null && Number.isFinite(zones.support) && (
        <div className="mbiotraders-price-zone support" style={{ top: zones.support - 11 }}>Support Zone</div>
      )}
    </div>
  );
}
