import type { Candle } from "./types.ts";
export function ema(values: number[], period: number): number[] {
    if (!values.length)
        return [];
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(Number.NaN);
    let seed = values[0];
    out[0] = seed;
    for (let i = 1; i < values.length; i++) {
        seed = values[i] * k + seed * (1 - k);
        out[i] = seed;
    }
    return out;
}
export function sma(values: number[], period: number): number[] {
    const out = new Array(values.length).fill(Number.NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period)
            sum -= values[i - period];
        if (i >= period - 1)
            out[i] = sum / period;
    }
    return out;
}
export function rsi(values: number[], period = 14): number[] {
    const out = new Array(values.length).fill(Number.NaN);
    if (values.length <= period)
        return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = values[i] - values[i - 1];
        gains += Math.max(d, 0);
        losses += Math.max(-d, 0);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < values.length; i++) {
        const d = values[i] - values[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
}
export function atr(candles: Candle[], period = 14): number[] {
    const tr = candles.map((c, i) => {
        if (!i)
            return c.high - c.low;
        const prev = candles[i - 1].close;
        return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    });
    return ema(tr, period);
}
export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
    const f = ema(values, fast);
    const s = ema(values, slow);
    const line = values.map((_, i) => f[i] - s[i]);
    const signalLine = ema(line.map(v => Number.isFinite(v) ? v : 0), signal);
    const histogram = line.map((v, i) => v - signalLine[i]);
    return { line, signal: signalLine, histogram };
}
export function bollinger(values: number[], period = 20, mult = 2) {
    const middle = sma(values, period);
    const upper = new Array(values.length).fill(Number.NaN);
    const lower = new Array(values.length).fill(Number.NaN);
    for (let i = period - 1; i < values.length; i++) {
        const slice = values.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period;
        const sd = Math.sqrt(variance);
        upper[i] = mean + mult * sd;
        lower[i] = mean - mult * sd;
    }
    return { middle, upper, lower };
}
export function donchian(candles: Candle[], period = 20) {
    const high = new Array(candles.length).fill(Number.NaN);
    const low = new Array(candles.length).fill(Number.NaN);
    for (let i = period - 1; i < candles.length; i++) {
        const s = candles.slice(i - period + 1, i + 1);
        high[i] = Math.max(...s.map(c => c.high));
        low[i] = Math.min(...s.map(c => c.low));
    }
    return { high, low };
}
export function lastFinite(values: number[], fallback = 0): number {
    for (let i = values.length - 1; i >= 0; i--)
        if (Number.isFinite(values[i]))
            return values[i];
    return fallback;
}

/** Wilder's ADX(14) and directional indicators; does not use future candles.
 * The first reliable ADX appears at bar 2*period - 1. Values before that are NaN.
 */
export function adx(candles: Candle[], period = 14): {
    adx: number[]; plusDI: number[]; minusDI: number[];
} {
    const count = candles.length;
    const strength = new Array<number>(count).fill(Number.NaN);
    const plusDI = new Array<number>(count).fill(Number.NaN);
    const minusDI = new Array<number>(count).fill(Number.NaN);
    if (!Number.isInteger(period) || period < 2 || count < period * 2) {
        return { adx: strength, plusDI, minusDI };
    }
    const tr = new Array<number>(count).fill(0);
    const plus = new Array<number>(count).fill(0);
    const minus = new Array<number>(count).fill(0);
    for (let index = 1; index < count; index += 1) {
        const current = candles[index];
        const previous = candles[index - 1];
        const up = current.high - previous.high;
        const down = previous.low - current.low;
        tr[index] = Math.max(
            current.high - current.low,
            Math.abs(current.high - previous.close),
            Math.abs(current.low - previous.close),
        );
        plus[index] = up > down && up > 0 ? up : 0;
        minus[index] = down > up && down > 0 ? down : 0;
    }
    let smoothTR = 0;
    let smoothPlus = 0;
    let smoothMinus = 0;
    let sumDX = 0;
    for (let index = 1; index <= period; index += 1) {
        smoothTR += tr[index];
        smoothPlus += plus[index];
        smoothMinus += minus[index];
    }
    for (let index = period; index < count; index += 1) {
        if (index > period) {
            smoothTR = smoothTR - smoothTR / period + tr[index];
            smoothPlus = smoothPlus - smoothPlus / period + plus[index];
            smoothMinus = smoothMinus - smoothMinus / period + minus[index];
        }
        plusDI[index] = smoothTR > 0 ? 100 * smoothPlus / smoothTR : 0;
        minusDI[index] = smoothTR > 0 ? 100 * smoothMinus / smoothTR : 0;
        const sum = plusDI[index] + minusDI[index];
        const dx = sum > 0 ? 100 * Math.abs(plusDI[index] - minusDI[index]) / sum : 0;
        if (index < period * 2 - 1) sumDX += dx;
        else if (index === period * 2 - 1) {
            strength[index] = (sumDX + dx) / period;
        } else {
            strength[index] = (strength[index - 1] * (period - 1) + dx) / period;
        }
    }
    return { adx: strength, plusDI, minusDI };
}
