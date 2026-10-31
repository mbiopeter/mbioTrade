import { adx, atr, ema, macd, rsi, sma } from "../indicators.ts";
import type { Candle } from "../types.ts";
import { FRAMES, FRAME_LABELS, type Frame, type FrameSeries, type MarketPayload } from "./market.ts";
import { analyzeHigherMomentum, HIGHER_FRAMES, type MomentumDays, type MomentumSummary } from "../v231/momentum.ts";
import { inspectFiveMinuteEntry, type FiveMinuteEntry } from "../v31/entry.ts";

export type Vote = -1 | 0 | 1;
export type Rating = "BUY" | "SELL" | "NEUTRAL";
export type IndicatorVote = {name:string;value:string;vote:Vote;description:string;group:"MA"|"indicator"};
export type FrameAnalysis = {
  frame:Frame; label:string; direction:Rating; strength:number; score:number;
  moving:{buy:number;sell:number;neutral:number};oscillators:{buy:number;sell:number;neutral:number};
  indicators:IndicatorVote[]; current:Candle | null; adx:number|null; rsi:number|null;
};
export type Setup = {
  status:"BUY"|"SELL"|"WAIT";
  bias:Rating; score:number; criteria:{name:string;ok:boolean;detail:string}[];
  reason:string; signalId:string|null; time:number|null;
  entry:number|null; stop:number|null; target:number|null; rr:number;
  frames:Record<Frame,FrameAnalysis>; total:{buy:number;sell:number;neutral:number};
  dataCurrent:boolean; ageSeconds:number|null; momentum:MomentumSummary; fiveMinute:FiveMinuteEntry | null;
};
const neutralFrame = (frame:Frame):FrameAnalysis => ({frame,label:FRAME_LABELS[frame],direction:"NEUTRAL",strength:0,score:0,moving:{buy:0,sell:0,neutral:0},oscillators:{buy:0,sell:0,neutral:0},indicators:[],current:null,adx:null,rsi:null});
const count = (votes:IndicatorVote[]) => ({buy:votes.filter(x=>x.vote===1).length,sell:votes.filter(x=>x.vote===-1).length,neutral:votes.filter(x=>x.vote===0).length});
const format = (n:number,digits=2) => Number.isFinite(n)?n.toFixed(digits):"—";
function voteOf(x:number, margin=0):Vote {return !Number.isFinite(x) || Math.abs(x)<=margin ? 0 : x>0?1:-1;}
function indicator(name:string,value:string,vote:Vote,description:string,group:"MA"|"indicator"="indicator"):IndicatorVote {
  return {name,value,vote,description,group};
}

export function completed(candles:Candle[],frame:Frame,at=Date.now()):Candle[] {
  return candles.filter(c=>Number.isSafeInteger(c.time) && (c.time+frame)*1000<=at);
}


export function evaluateFrame(input:Candle[],frame:Frame,at=Date.now()):FrameAnalysis {
  const candles=completed(input,frame,at);
  if(candles.length<205)return neutralFrame(frame);
  const age = at/1000 - (candles[candles.length-1].time+frame);
  
  if(age<0 || age>Math.max(frame*3,1800))return neutralFrame(frame);
  const closes=candles.map(c=>c.close);
  const last=candles.at(-1)!;
  const i=candles.length-1;
  const fast9=ema(closes,9),fast21=ema(closes,21),mid50=ema(closes,50),e100=ema(closes,100),e200=ema(closes,200);
  const rs=rsi(closes,14);
  const m=macd(closes);
  const dx=adx(candles,14);
  const r=rs[i];
  const cciPeriod=candles.slice(-20);
  const typ=cciPeriod.map(c=>(c.high+c.low+c.close)/3);
  const typAvg=typ.reduce((a,b)=>a+b,0)/typ.length;
  const dev=typ.reduce((sum,x)=>sum+Math.abs(x-typAvg),0)/typ.length;
  const cci=dev>0 ? (typ.at(-1)!-typAvg)/(0.015*dev) : 0;
  const low14=Math.min(...candles.slice(-14).map(c=>c.low));
  const high14=Math.max(...candles.slice(-14).map(c=>c.high));
  const will=high14>low14 ? -100*(high14-last.close)/(high14-low14) : -50;
  const recentRsi=rs.slice(-14);
  const stochLo=Math.min(...recentRsi),stochHi=Math.max(...recentRsi);
  const stochRsi=stochHi>stochLo?(r-stochLo)/(stochHi-stochLo):0.5;
  const med=candles.map(c=>(c.high+c.low)/2);
  const med5=sma(med,5),med34=sma(med,34);
  const awesome=med5[i]-med34[i];
  const bull=last.high-ema(closes,13)[i],bear=last.low-ema(closes,13)[i];
  const ma:IndicatorVote[]=[
    indicator("Price / EMA 9",format(last.close),voteOf(last.close-fast9[i]),"Price relative to near-term mean","MA"),
    indicator("Price / EMA 21",format(fast21[i]),voteOf(last.close-fast21[i]),"Price relative to pullback mean","MA"),
    indicator("Price / EMA 50",format(mid50[i]),voteOf(last.close-mid50[i]),"Medium-term moving average","MA"),
    indicator("Price / EMA 100",format(e100[i]),voteOf(last.close-e100[i]),"Longer trend mean","MA"),
    indicator("Price / EMA 200",format(e200[i]),voteOf(last.close-e200[i]),"Major long-term trend mean","MA"),
    indicator("EMA 9 / 21",format(fast9[i]-fast21[i],5),voteOf(fast9[i]-fast21[i]),"Short mean alignment","MA"),
    indicator("EMA 21 / 50",format(fast21[i]-mid50[i],5),voteOf(fast21[i]-mid50[i]),"Medium mean alignment","MA"),
  ];
  const osc:IndicatorVote[]=[
    indicator("RSI (14)",format(r,1),voteOf(r-50,5),"50 midline, with a five-point dead zone"),
    indicator("MACD (12,26,9)",format(m.histogram[i],5),voteOf(m.histogram[i]),"Histogram sign"),
    indicator("ADX / directional",format(dx.adx[i],1),Number.isFinite(dx.adx[i])&&dx.adx[i]>=18?voteOf(dx.plusDI[i]-dx.minusDI[i]):0,"ADX minimum 18; +DI versus −DI"),
    indicator("CCI (20)",format(cci,1),voteOf(cci,45),"Commodity Channel Index momentum"),
    indicator("Williams %R (14)",format(will,1),voteOf(will+50,10),"Momentum relative to recent range"),
    indicator("Stochastic RSI",format(stochRsi,2),voteOf(stochRsi-.5,.12),"RSI relative to its recent range"),
    indicator("Awesome Oscillator",format(awesome,5),voteOf(awesome),"5 versus 34 median-price averages"),
    indicator("Bull / Bear power",`${format(bull,3)} / ${format(bear,3)}`,bull>0&&bear>0?1:bull<0&&bear<0?-1:0,"Both extremes relative to EMA 13"),
    indicator("Momentum (10)",format(last.close-closes[i-10],5),voteOf(last.close-closes[i-10]),"Price difference over 10 completed bars"),
  ];
  const all=[...ma,...osc];
  const score=all.reduce((sum,v)=>sum+v.vote,0)/all.length*100;
  const direction:Rating=score>=18?"BUY":score<=-18?"SELL":"NEUTRAL";
  return {frame,label:FRAME_LABELS[frame],direction,strength:Math.min(100,Math.round(Math.abs(score))),score:Math.round(score),
    moving:count(ma),oscillators:count(osc),indicators:all,current:last,
    adx:Number.isFinite(dx.adx[i])?dx.adx[i]:null,rsi:Number.isFinite(r)?r:null};
}


export function evaluateLiveFrame(input:Candle[],frame:Frame,at:number,quote:number,quoteAt:number):FrameAnalysis {
  const closed = completed(input,frame,quoteAt);
  if (!Number.isFinite(quote) || quote<=0 || !Number.isFinite(quoteAt) ||
      Math.abs(at-quoteAt)>120_000 || closed.length<204) return evaluateFrame(input,frame,at);
  const bucket=Math.floor(quoteAt/1000/frame)*frame;
  const prior=closed.at(-1);
  if (!prior || bucket - (prior.time + frame) > Math.max(frame*3, 1800))
    return evaluateFrame(input,frame,at);
  const providerLive=input.find(bar=>bar.time===bucket);
  const live: Candle=providerLive
    ? {...providerLive, high:Math.max(providerLive.high,quote), low:Math.min(providerLive.low,quote), close:quote}
    : {time:bucket,open:quote,high:quote,low:quote,close:quote};


  return evaluateFrame([...closed,live],frame,(bucket+frame)*1000+1);
}

function isContinuousTail(candles:Candle[],frame:Frame,at:number,number=6):boolean {
  const bars=completed(candles,frame,at).slice(-number);
  return bars.length===number && bars.every((c,i)=>i===0||c.time-bars[i-1].time===frame);
}


export const REQUIRED_ALIGNMENT_FRAMES = [900, 1800, 3600, 14400, 86400] as const;

export function inspectConfluence(payload:Pick<MarketPayload,"symbol"|"frames">,at=Date.now(),days:MomentumDays=5):Setup {
  const frames = {} as Record<Frame, FrameAnalysis>;
  for (const frame of FRAMES) frames[frame] = evaluateFrame(payload.frames[frame] ?? [], frame, at);
  const five = completed(payload.frames[300] ?? [], 300, at);
  const latest = five.at(-1);
  const ageSeconds = latest ? Math.floor(at / 1000 - latest.time - 300) : null;
  const fresh = ageSeconds !== null && ageSeconds >= 0 && ageSeconds <= 15 * 60;
  const validTail = isContinuousTail(payload.frames[300] ?? [], 300, at);
  const momentum = analyzeHigherMomentum(payload.frames, at, days);
  const bias: Rating = momentum.bias;
  const directionFor = (frame: Frame): Rating => HIGHER_FRAMES.some((f) => f === frame)
    ? momentum.readings[frame as 3600 | 14400 | 86400].direction
    : frames[frame].direction;
  const agreement = REQUIRED_ALIGNMENT_FRAMES.filter((frame) => bias !== "NEUTRAL" && directionFor(frame) === bias).length;
  const aligned = momentum.complete && bias !== "NEUTRAL" && agreement === REQUIRED_ALIGNMENT_FRAMES.length;
  const htfStrength = frames[3600].adx !== null && frames[3600].adx! >= 16;
  const fiveMinute = bias === "BUY" || bias === "SELL"
    ? inspectFiveMinuteEntry(payload.frames[300] ?? [], bias, at)
    : null;
  const allVotes = FRAMES.flatMap((frame) => frames[frame].indicators);
  const total = count(allVotes);
  const score = Math.round(Math.min(100,
    (agreement / REQUIRED_ALIGNMENT_FRAMES.length) * 60 +
    (htfStrength ? 10 : 0) +
    (fiveMinute?.pullback ? 10 : 0) +
    (fiveMinute?.twoStrong ? 15 : 0) +
    (fiveMinute?.continuous ? 5 : 0),
  ));
  const supported = Boolean(fiveMinute && fiveMinute.entry !== null && fiveMinute.stop !== null &&
    fiveMinute.target !== null && fiveMinute.risk !== null);
  const criteria = [
    { name: "Fresh 5m candles", ok: fresh && validTail,
      detail: fresh && validTail ? "Closed 5-minute candles are recent and consecutive." : "Stale or gapped 5-minute history." },
    { name: `${days}-day higher momentum`, ok: momentum.complete && bias !== "NEUTRAL",
      detail: !momentum.complete ? `Need ${days} completed trading sessions with valid H1/H4/D1 data.` : `Higher-timeframe momentum: ${bias}.` },
    { name: "Five higher frames aligned", ok: aligned,
      detail: `${agreement} of 5 required charts (15m, 30m, 1H, 4H, 1D) agree; 5m is entry only.` },
    { name: "H1 trend strength", ok: htfStrength,
      detail: `H1 ADX ${format(frames[3600].adx ?? NaN, 1)}; minimum 16.` },
    { name: "5m countertrend pullback", ok: Boolean(fiveMinute?.pullback),
      detail: `A 5m candle must pull back against ${bias === "BUY" ? "bullish" : "bearish"} momentum before confirmation.` },
    { name: "Two strong 5m candles (60%+)", ok: Boolean(fiveMinute?.twoStrong && fiveMinute.continuous),
      detail: "Two consecutive completed candles in trend direction, each body at least 60% of full high-low range." },
    { name: "Third-candle open + swing SL + 2R", ok: Boolean(fiveMinute?.timely && supported),
      detail: fiveMinute?.reason ?? "Waiting for a confirmed higher-timeframe trend." },
  ];
  const ready = criteria.every((criterion) => criterion.ok);
  const direction:Setup["status"] = ready && bias !== "NEUTRAL" ? bias : "WAIT";
  const reason = !fresh ? "Waiting for recent completed 5-minute candles; no signal on stale data."
    : !validTail ? "Five-minute candle history has gaps; entry is blocked."
    : !momentum.complete || bias === "NEUTRAL" ? `H1, H4 and daily momentum are not confirmed over ${days} trading sessions.`
    : !aligned ? `Only ${agreement}/5 required timeframes align; 5m does not vote on trend.`
    : !htfStrength ? "H1 trend strength is below the minimum ADX 16."
    : fiveMinute?.reason ?? "Waiting for 5m pullback and confirmation.";
  const signalId = ready && fiveMinute?.thirdOpenTime != null
    ? `${payload.symbol}-${fiveMinute.thirdOpenTime}-${bias}-v31` : null;
  return {
    status: direction, bias, score, criteria, reason, signalId,
    time: ready && fiveMinute?.thirdOpenTime != null ? fiveMinute.thirdOpenTime * 1000 : null,
    entry: ready ? fiveMinute?.entry ?? null : null,
    stop: ready ? fiveMinute?.stop ?? null : null,
    target: ready ? fiveMinute?.target ?? null : null,
    rr: 2, frames, total, dataCurrent: fresh && validTail, ageSeconds, momentum, fiveMinute,
  };
}

export type ReplaySignal = {id:string;time:number;direction:"BUY"|"SELL";entry:number;stop:number;target:number;outcome:"TP"|"SL"|"TIME";r:number;exitTime:number};

export function replayRecent(payload:Pick<MarketPayload,"symbol"|"frames">,max=5,days:MomentumDays=5):ReplaySignal[] {
  const five=payload.frames[300]??[];
  if(five.length<55)return [];
  const results:ReplaySignal[]=[];
  let lastEntry=-100;
  for(let i=Math.max(10,five.length-107);i<five.length-25;i++) {
    const third=five[i+1];
    if(!third || third.time!==five[i].time+300 || i-lastEntry<12)continue;
    const at=third.time*1000;
    const frames:FrameSeries={};
    for(const frame of FRAMES) {
      frames[frame]=frame===300
        ? five.slice(0,i+2).map((bar,j)=>j===i+1?{...bar,high:bar.open,low:bar.open,close:bar.open}:bar)
        : (payload.frames[frame]??[]).filter(bar=>(bar.time+frame)*1000<=at);
    }
    const signal=inspectConfluence({symbol:payload.symbol,frames},at,days);
    if(signal.status==="WAIT"||!signal.signalId||signal.entry===null||signal.stop===null||signal.target===null)continue;
    const sign=signal.status==="BUY"?1:-1;
    const risk=Math.abs(signal.entry-signal.stop);
    if(risk<=0)continue;
    let outcome:ReplaySignal["outcome"]|null=null;
    let exitPrice=0,exitTime=0;
    for(let j=i+1;j<=i+24;j++) {
      const bar=five[j];
      if(!bar||(j>i+1&&bar.time-five[j-1].time!==300)){outcome=null;break;}
      const gapStop=sign*(bar.open-signal.stop)<=0;
      const stopHit=sign===1?bar.low<=signal.stop:bar.high>=signal.stop;
      const targetHit=sign===1?bar.high>=signal.target:bar.low<=signal.target;
      if(gapStop||stopHit){outcome="SL";exitPrice=gapStop?bar.open:signal.stop;exitTime=bar.time+300;break;}
      if(targetHit){outcome="TP";exitPrice=signal.target;exitTime=bar.time+300;break;}
      if(j===i+24){outcome="TIME";exitPrice=bar.close;exitTime=bar.time+300;}
    }
    if(!outcome)continue;
    const r=sign*(exitPrice-signal.entry)/risk;
    results.push({id:signal.signalId,time:signal.time!,direction:signal.status,entry:signal.entry,stop:signal.stop,target:signal.target,outcome,r,exitTime});
    lastEntry=i;
  }
  return results.slice(-max).reverse();
}
