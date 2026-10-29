/** Smooth provisional gauge movement derived from actual streamed quote changes.
 * The final BUY/SELL signal continues to use only confirmed candle data.
 * Values are directional strength estimates, never win probabilities.
 */
export function liveGaugeScore(baseScore:number, quote:number|null, lastCompletedClose:number|null, typicalRange:number):number {
  if (!Number.isFinite(baseScore)) return 0;
  if (quote===null || lastCompletedClose===null || !Number.isFinite(quote) || !Number.isFinite(lastCompletedClose) ||
      !Number.isFinite(typicalRange) || typicalRange<=0) return Math.max(-100,Math.min(100,baseScore));
  const nudge=12*Math.tanh((quote-lastCompletedClose)/typicalRange);
  return Math.max(-100,Math.min(100,baseScore+nudge));
}
