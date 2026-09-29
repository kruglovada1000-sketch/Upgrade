import { loadConfig } from './trader-lib.mjs'
import { bybitPublicGet, normalizeBybitSymbol } from './bybit-demo-lib.mjs'

function num(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
function sma(values,period){if(values.length<period)return NaN;let s=0;for(let i=values.length-period;i<values.length;i++)s+=values[i];return s/period}
function emaSeries(values,period){if(values.length<period)return[];const k=2/(period+1),out=new Array(values.length).fill(NaN);let seed=0;for(let i=0;i<period;i++)seed+=values[i];let prev=seed/period;out[period-1]=prev;for(let i=period;i<values.length;i++){prev=values[i]*k+prev*(1-k);out[i]=prev}return out}
function rsi(values,period=14){if(values.length<period+1)return NaN;let g=0,l=0;for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];if(d>=0)g+=d;else l-=d}if(l===0)return 100;const rs=(g/period)/(l/period);return 100-100/(1+rs)}
function trueRanges(c){const o=[];for(let i=1;i<c.length;i++){const h=c[i].high,l=c[i].low,pc=c[i-1].close;o.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return o}
function atr(c,p=14){return sma(trueRanges(c),p)}
function macdHistogram(values){const f=emaSeries(values,12),s=emaSeries(values,26);const m=values.map((_,i)=>Number.isFinite(f[i])&&Number.isFinite(s[i])?f[i]-s[i]:NaN).filter(Number.isFinite);if(m.length<10)return NaN;const sig=emaSeries(m,9);return m.at(-1)-sig.at(-1)}
function adx(c,p=14){if(c.length<p*2+2)return NaN;const tr=[],pd=[],md=[];for(let i=1;i<c.length;i++){const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;pd.push(up>down&&up>0?up:0);md.push(down>up&&down>0?down:0);tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)))}const dx=[];for(let e=p;e<=tr.length;e++){const trN=tr.slice(e-p,e).reduce((a,b)=>a+b,0),pN=pd.slice(e-p,e).reduce((a,b)=>a+b,0),mN=md.slice(e-p,e).reduce((a,b)=>a+b,0);if(trN<=0)continue;const pdi=100*pN/trN,mdi=100*mN/trN,den=pdi+mdi;if(den>0)dx.push(100*Math.abs(pdi-mdi)/den)}return sma(dx,p)}
function volumeRatio(c,p=20){const v=c.map(x=>x.volume),base=sma(v.slice(0,-1),p);return Number.isFinite(base)&&base>0?v.at(-1)/base:NaN}
function slopePct(series,lookback=5){if(series.length<lookback+1)return NaN;const n=series.at(-1),p=series.at(-(lookback+1));return Number.isFinite(n)&&Number.isFinite(p)&&p!==0?((n-p)/p)*100:NaN}
function clamp(n,lo,hi){return Math.min(hi,Math.max(lo,n))}

export function intervalToMs(interval){const m={'1':60000,'3':180000,'5':300000,'15':900000,'30':1800000,'60':3600000,'120':7200000,'240':14400000,'360':21600000,'720':43200000,D:86400000};const v=String(interval);if(!m[v])throw new Error(`Unsupported interval: ${interval}`);return m[v]}
export function candlesFromBybit(list){return[...list].map(r=>({ts:Number(r[0]),open:num(r[1]),high:num(r[2]),low:num(r[3]),close:num(r[4]),volume:num(r[5])})).filter(c=>Object.values(c).every(Number.isFinite)).sort((a,b)=>a.ts-b.ts)}
export function closedCandlesOnly(candles,interval,now=Date.now()){const ms=intervalToMs(interval);return candles.filter(c=>c.ts+ms<=now)}
export async function fetchStrategyKlines(symbol,interval,limit,config=loadConfig(),end=undefined){const fullSymbol=normalizeBybitSymbol(symbol,config);const params={category:config.bybitDemo.category,symbol:fullSymbol,interval,limit};if(end!==undefined)params.end=end;const data=await bybitPublicGet('/v5/market/kline',params,config);const rows=data.result?.list;if(!Array.isArray(rows))throw new Error(`No ${interval} kline data for ${fullSymbol}`);return candlesFromBybit(rows)}

function stats(c){const closes=c.map(x=>x.close),e20=emaSeries(closes,20),e50=emaSeries(closes,50),e200=emaSeries(closes,200),last=c.at(-1),prev=c.at(-2),a=atr(c,14),mh=macdHistogram(closes),mhp=macdHistogram(closes.slice(0,-1)),body=Math.abs(last.close-last.open),range=Math.max(0,last.high-last.low);return{price:last.close,open:last.open,prevClose:prev.close,ema20:e20.at(-1),ema20Prev:e20.at(-2),ema50:e50.at(-1),ema200:e200.at(-1),ema50SlopePct:slopePct(e50.filter(Number.isFinite),5),rsi14:rsi(closes,14),macdHist:mh,macdHistPrev:mhp,atr14:a,atrPct:a/last.close*100,adx14:adx(c,14),volumeRatio20:volumeRatio(c,20),high20:Math.max(...c.slice(-21,-1).map(x=>x.high)),low20:Math.min(...c.slice(-21,-1).map(x=>x.low)),bullish:last.close>last.open&&last.close>prev.close,bearish:last.close<last.open&&last.close<prev.close,distanceEma20Atr:a>0?Math.abs(last.close-e20.at(-1))/a:NaN,bodyAtr:a>0?body/a:NaN,rangeAtr:a>0?range/a:NaN}}

function structuralStopPct({side,candles,atr14,price,cfg}){const lb=Math.max(4,Number(cfg.swingLookback??10)),buf=Number(cfg.swingBufferAtr??0.15),recent=candles.slice(-lb);let pct;if(side==='long'){const swing=Math.min(...recent.map(c=>c.low))-atr14*buf;pct=(price-swing)/price*100}else{const swing=Math.max(...recent.map(c=>c.high))+atr14*buf;pct=(swing-price)/price*100}const atrFloor=atr14*Number(cfg.stopAtrFloorMult??1.5)/price*100;return clamp(Math.max(pct,atrFloor),Number(cfg.minStopPct??0.9),Number(cfg.maxStopPct??3.2))}

export function evaluateJarvisStrategySnapshot({symbol='BTC',c4h,c1h,c15m,config=loadConfig()}){
  if(c4h.length<220||c1h.length<220||c15m.length<220)throw new Error('JARVIS strategy requires at least 220 closed candles on 4H, 1H and 15m')
  const cfg=config.strategy||{},t4=stats(c4h),t1=stats(c1h),t15=stats(c15m)
  const minAtr=Number(cfg.minAtrPct??0.18),maxAtr=Number(cfg.maxAtrPct??4),volOk=t15.atrPct>=minAtr&&t15.atrPct<=maxAtr
  const adxBias=Number(cfg.adxBiasMin??14),slope=Number(cfg.biasSlopePct??0.015)
  const longBias=(t4.price>t4.ema200)||(t4.price>t4.ema50&&t4.ema50SlopePct>=slope&&t4.adx14>=adxBias)
  const shortBias=(t4.price<t4.ema200)||(t4.price<t4.ema50&&t4.ema50SlopePct<=-slope&&t4.adx14>=adxBias)

  const longTrend=t1.ema20>t1.ema50&&t1.price>t1.ema50&&t1.rsi14>=Number(cfg.longRsiMin??44)&&t1.rsi14<=Number(cfg.longRsiMax??72)
  const shortTrend=t1.ema20<t1.ema50&&t1.price<t1.ema50&&t1.rsi14>=Number(cfg.shortRsiMin??28)&&t1.rsi14<=Number(cfg.shortRsiMax??56)
  const longMomentum=t1.macdHist>0||t1.macdHist>t1.macdHistPrev
  const shortMomentum=t1.macdHist<0||t1.macdHist<t1.macdHistPrev

  const pullbackTouchAtr=Number(cfg.pullbackTouchAtr??0.65)
  const longPullback=longBias&&longTrend&&longMomentum&&t15.distanceEma20Atr<=pullbackTouchAtr&&t15.price>=t15.ema20&&t15.bullish&&t15.macdHist>=t15.macdHistPrev&&t15.bodyAtr<=Number(cfg.maxPullbackBodyAtr??1.35)
  const shortPullback=shortBias&&shortTrend&&shortMomentum&&t15.distanceEma20Atr<=pullbackTouchAtr&&t15.price<=t15.ema20&&t15.bearish&&t15.macdHist<=t15.macdHistPrev&&t15.bodyAtr<=Number(cfg.maxPullbackBodyAtr??1.35)

  const breakoutVol=Number(cfg.breakoutVolumeRatio??1.1),maxExt=Number(cfg.maxBreakoutExtensionAtr??1.7),maxRange=Number(cfg.maxBreakoutRangeAtr??2.2)
  const longBreakout=longBias&&(longTrend||longMomentum)&&t15.price>t15.high20&&t15.volumeRatio20>=breakoutVol&&t15.bullish&&t15.distanceEma20Atr<=maxExt&&t15.rangeAtr<=maxRange
  const shortBreakout=shortBias&&(shortTrend||shortMomentum)&&t15.price<t15.low20&&t15.volumeRatio20>=breakoutVol&&t15.bearish&&t15.distanceEma20Atr<=maxExt&&t15.rangeAtr<=maxRange

  const longSetup=longPullback?'PULLBACK':longBreakout?'BREAKOUT':'NONE'
  const shortSetup=shortPullback?'PULLBACK':shortBreakout?'BREAKDOWN':'NONE'
  let action='WAIT',selectedSide='none',trigger='NONE'
  if(volOk&&longSetup!=='NONE'&&shortSetup==='NONE'){action='LONG';selectedSide='long';trigger=longSetup}
  else if(volOk&&shortSetup!=='NONE'&&longSetup==='NONE'){action='SHORT';selectedSide='short';trigger=shortSetup}

  const sideForStop=selectedSide==='short'?'short':'long'
  const stopPct=structuralStopPct({side:sideForStop,candles:c15m,atr14:t15.atr14,price:t15.price,cfg})
  const rr=trigger==='BREAKOUT'||trigger==='BREAKDOWN'?Number(cfg.breakoutRewardRisk??2.0):Number(cfg.pullbackRewardRisk??1.8)
  const takePct=stopPct*rr
  let score=0
  if(action!=='WAIT'){score=60;if((selectedSide==='long'&&t4.price>t4.ema200)||(selectedSide==='short'&&t4.price<t4.ema200))score+=10;if(t4.adx14>=22)score+=10;if(t15.volumeRatio20>=breakoutVol)score+=10;if(t15.distanceEma20Atr<=0.5)score+=10;score=Math.min(100,score)}
  const hardBlocks=[];if(!volOk)hardBlocks.push('15m volatility outside configured band');if(action==='WAIT'){if(!longBias&&!shortBias)hardBlocks.push('no 4H directional bias');if(longSetup==='NONE'&&shortSetup==='NONE')hardBlocks.push('no independent pullback/breakout setup')}
  return{strategy:'JARVIS_ORIGINAL_MTF_V4',symbol:normalizeBybitSymbol(symbol,config),action,selectedSide,trigger,score,stopPct,takePct,rewardRisk:rr,hardBlocks,reasons:action==='WAIT'?[]:[`${selectedSide} ${trigger.toLowerCase()} setup`,`4H bias`,trigger==='PULLBACK'?'1H trend+momentum':'1H trend or momentum'],gates:{volatilityOk:volOk,long:{bias:longBias,trend:longTrend,momentum:longMomentum,setup:longSetup,eligible:volOk&&longSetup!=='NONE'},short:{bias:shortBias,trend:shortTrend,momentum:shortMomentum,setup:shortSetup,eligible:volOk&&shortSetup!=='NONE'}},market:{'4h':t4,'1h':t1,'15m':t15},rules:{noAveragingDown:true,maxOpenPositions:config.risk.maxOpenPositions,leverage:config.risk.maxLeverage,execution:'SIGNAL_ONLY',closedCandlesOnly:true,independentSetupFamilies:true,structuralStops:true},generatedAt:new Date().toISOString()}
}

export async function evaluateJarvisStrategy(symbol='BTC',config=loadConfig()){const now=Date.now();const[raw4h,raw1h,raw15m]=await Promise.all([fetchStrategyKlines(symbol,'240',300,config),fetchStrategyKlines(symbol,'60',300,config),fetchStrategyKlines(symbol,'15',300,config)]);return evaluateJarvisStrategySnapshot({symbol,c4h:closedCandlesOnly(raw4h,'240',now).slice(-260),c1h:closedCandlesOnly(raw1h,'60',now).slice(-260),c15m:closedCandlesOnly(raw15m,'15',now).slice(-260),config})}
