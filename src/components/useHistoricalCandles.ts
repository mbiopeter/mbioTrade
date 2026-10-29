'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Candle} from '@/lib/types';
import {merge,coverage} from '@/lib/v26-history';
import type {MarketPayload,MarketSymbol,Frame} from '@/lib/v22/market';
type Data={key:string;older:Candle[];loading:boolean;complete:boolean;error:string|null};
export function useHistoricalCandles({symbol,frame,payload,enabled=true}:{symbol:MarketSymbol;frame:Frame;payload:MarketPayload|null;enabled?:boolean}){
 const base=payload?.frames[frame]??[],provider=payload?.provider??null,key=provider?`${provider}:${symbol}:${frame}`:'';
 const [state,setState]=useState<Data>({key:'',older:[],loading:false,complete:false,error:null});
 const cache=useRef(new Map<string,{older:Candle[];complete:boolean}>());
 const ready=enabled&&base.length>0&&!!provider;
 useEffect(()=>{if(!ready||!provider)return;let cancelled=false,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null;let older=cache.current.get(key)?.older??[],complete=cache.current.get(key)?.complete??false;setState({key,older,complete,loading:!complete,error:null});async function run(){let failures=0;for(let i=0;i<16&&!cancelled&&!complete;){const available=merge(older,base);const oldest=available[0]?.time;if(!oldest||oldest<=Date.now()/1000-90*86400){complete=true;break;}controller=new AbortController();try{const res=await fetch(`/api/market/history?symbol=${symbol}&frame=${frame}&provider=${provider}&before=${oldest}`,{signal:controller.signal,cache:'no-store'});const data=await res.json() as {candles?:Candle[];provider?:string;symbol?:string;frame?:number;exhausted?:boolean;detail?:string};if(!res.ok)throw Error(data.detail??`Historical HTTP ${res.status}`);if(data.provider!==provider||data.symbol!==symbol||data.frame!==frame||!Array.isArray(data.candles))throw Error('Market provider mismatch');const part=data.candles.filter(c=>Number.isSafeInteger(c.time)&&c.time<oldest);if(!part.length){complete=true;break;}older=merge(older,part);if(older[0]?.time>=oldest){complete=true;break;}if(data.exhausted)complete=true;i++;failures=0;cache.current.set(key,{older,complete});if(!cancelled)setState({key,older,complete,loading:!complete,error:null});}catch(e){if(cancelled)return;setState({key,older,complete:false,loading:true,error:e instanceof Error?e.message:'History unavailable'});await new Promise<void>(resolve=>{timer=setTimeout(resolve,Math.min(120000,15000*2**Math.min(failures++,3)));});}}if(!cancelled){cache.current.set(key,{older,complete});setState({key,older,complete,loading:false,error:null});}}void run();return()=>{cancelled=true;controller?.abort();if(timer)clearTimeout(timer);};},[key,ready,provider,symbol,frame]);
 const candles=useMemo(()=>merge(state.key===key?state.older:[],base),[state.older,state.key,key,base]);
 return{candles,days:coverage(candles),loading:state.key===key&&state.loading,error:state.key===key?state.error:null};
}
