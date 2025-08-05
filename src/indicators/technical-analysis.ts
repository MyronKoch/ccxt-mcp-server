/**
 * Technical Analysis Indicators
 * Implements jcwleo's comprehensive technical indicator suite
 */

// Constants for indicator calculations
const RSI_OVERBOUGHT_THRESHOLD = 70;
const RSI_OVERSOLD_THRESHOLD = 30;
const STOCHASTIC_OVERBOUGHT_THRESHOLD = 80;
const STOCHASTIC_OVERSOLD_THRESHOLD = 20;
const BOLLINGER_SQUEEZE_THRESHOLD = 0.1;
const RSI_MAX_VALUE = 100;
const STOCHASTIC_NEUTRAL_VALUE = 50;

export interface RSIResult {
  value: number;
  overbought: boolean;
  oversold: boolean;
  signal: 'buy' | 'sell' | 'neutral';
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  crossover: boolean;
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  squeeze: boolean;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface ATRResult {
  value: number;
  volatility: 'low' | 'medium' | 'high';
  stopLoss: {
    long: number;
    short: number;
  };
}

export interface StochasticResult {
  k: number;
  d: number;
  overbought: boolean;
  oversold: boolean;
  signal: 'buy' | 'sell' | 'neutral';
}

export interface IchimokuResult {
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  chikou: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

export class TechnicalIndicators {

  /**
   * Calculate Relative Strength Index (RSI)
   * Measures the speed and magnitude of price changes to identify overbought/oversold conditions
   * RSI > 70 indicates overbought, RSI < 30 indicates oversold
   *
   * @param {number[]} prices - Array of closing prices
   * @param {number} [period=14] - RSI period (default: 14)
   * @returns {RSIResult} RSI value, overbought/oversold flags, and trading signal
   * @throws {Error} If insufficient data for calculation
   */
  calculateRSI(prices: number[], period: number = 14): RSIResult {
    if (prices.length < period + 1) {
      throw new Error(`Need at least ${period + 1} prices for RSI calculation`);
    }
    
    const gains: number[] = [];
    const losses: number[] = [];
    
    // Calculate price changes
    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) {
        gains.push(diff);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(diff));
      }
    }
    
    // Calculate initial average gain/loss
    const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // Smooth the averages
    let smoothedGain = avgGain;
    let smoothedLoss = avgLoss;
    
    for (let i = period; i < gains.length; i++) {
      smoothedGain = (smoothedGain * (period - 1) + gains[i]) / period;
      smoothedLoss = (smoothedLoss * (period - 1) + losses[i]) / period;
    }
    
    const rs = smoothedLoss === 0 ? RSI_MAX_VALUE : smoothedGain / smoothedLoss;
    const rsi = RSI_MAX_VALUE - (RSI_MAX_VALUE / (1 + rs));

    return {
      value: rsi,
      overbought: rsi > RSI_OVERBOUGHT_THRESHOLD,
      oversold: rsi < RSI_OVERSOLD_THRESHOLD,
      signal: rsi > RSI_OVERBOUGHT_THRESHOLD ? 'sell' : rsi < RSI_OVERSOLD_THRESHOLD ? 'buy' : 'neutral'
    };
  }
  
  /**
   * Calculate Moving Average Convergence Divergence (MACD)
   * Trend-following momentum indicator showing relationship between two moving averages
   * MACD = FastEMA - SlowEMA, Signal = EMA of MACD, Histogram = MACD - Signal
   *
   * @param {number[]} prices - Array of closing prices
   * @param {number} [fastPeriod=12] - Fast EMA period (default: 12)
   * @param {number} [slowPeriod=26] - Slow EMA period (default: 26)
   * @param {number} [signalPeriod=9] - Signal line EMA period (default: 9)
   * @returns {MACDResult} MACD line, signal line, histogram, trend, and crossover detection
   */
  calculateMACD(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): MACDResult {
    const emaFast = this.calculateEMA(prices, fastPeriod);
    const emaSlow = this.calculateEMA(prices, slowPeriod);
    
    const macdLine = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];
    
    // Calculate MACD history for signal line
    const macdHistory: number[] = [];
    for (let i = 0; i < Math.min(emaFast.length, emaSlow.length); i++) {
      macdHistory.push(emaFast[i] - emaSlow[i]);
    }
    
    const signalLine = this.calculateEMA(macdHistory, signalPeriod);
    const signal = signalLine[signalLine.length - 1];
    const histogram = macdLine - signal;

    // Check for crossover (need at least 2 values)
    let crossover = false;
    if (emaFast.length >= 2 && emaSlow.length >= 2 && signalLine.length >= 2) {
      const prevMacd = emaFast[emaFast.length - 2] - emaSlow[emaSlow.length - 2];
      const prevSignal = signalLine[signalLine.length - 2];
      crossover = (prevMacd <= prevSignal && macdLine > signal) ||
                  (prevMacd >= prevSignal && macdLine < signal);
    }
    
    return {
      macd: macdLine,
      signal,
      histogram,
      trend: histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral',
      crossover
    };
  }
  
  /**
   * Calculate Bollinger Bands
   * Volatility indicator with upper/lower bands around a moving average
   * Bands = SMA ± (StdDev * multiplier). Price near upper band suggests overbought, near lower suggests oversold
   *
   * @param {number[]} prices - Array of closing prices
   * @param {number} [period=20] - Moving average period (default: 20)
   * @param {number} [stdDev=2] - Standard deviation multiplier (default: 2)
   * @returns {BollingerBandsResult} Upper/middle/lower bands, bandwidth, %B indicator, squeeze detection, and signal
   */
  calculateBollingerBands(
    prices: number[],
    period: number = 20,
    stdDev: number = 2
  ): BollingerBandsResult {
    const sma = this.calculateSMA(prices.slice(-period));
    
    // Calculate standard deviation
    const variance = prices.slice(-period)
      .reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    const upper = sma + (standardDeviation * stdDev);
    const lower = sma - (standardDeviation * stdDev);
    const bandwidth = (upper - lower) / sma;
    
    const currentPrice = prices[prices.length - 1];
    const percentB = (currentPrice - lower) / (upper - lower);
    
    // Detect squeeze (low volatility)
    const squeeze = bandwidth < BOLLINGER_SQUEEZE_THRESHOLD; // Less than 10% bandwidth
    
    return {
      upper,
      middle: sma,
      lower,
      bandwidth: bandwidth * 100,
      percentB: percentB * 100,
      squeeze,
      signal: percentB > 1 ? 'overbought' : percentB < 0 ? 'oversold' : 'neutral'
    };
  }
  
  /**
   * Calculate Average True Range (ATR)
   * Volatility indicator measuring market movement magnitude
   * True Range = max(high-low, |high-prevClose|, |low-prevClose|)
   * Used for position sizing and stop-loss placement
   *
   * @param {number[]} highs - Array of high prices
   * @param {number[]} lows - Array of low prices
   * @param {number[]} closes - Array of closing prices
   * @param {number} [period=14] - ATR period (default: 14)
   * @returns {ATRResult} ATR value, volatility level, and suggested stop-loss levels
   * @throws {Error} If insufficient data for calculation
   */
  calculateATR(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14
  ): ATRResult {
    if (highs.length < period + 1) {
      throw new Error(`Need at least ${period + 1} candles for ATR`);
    }
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < highs.length; i++) {
      const highLow = highs[i] - lows[i];
      const highClose = Math.abs(highs[i] - closes[i - 1]);
      const lowClose = Math.abs(lows[i] - closes[i - 1]);
      
      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }
    
    // Use EMA for smoothing
    const atrValues = this.calculateEMA(trueRanges, period);
    const currentATR = atrValues[atrValues.length - 1];
    const currentPrice = closes[closes.length - 1];
    
    // Determine volatility level
    const atrPercent = (currentATR / currentPrice) * 100;
    const volatility = atrPercent < 1 ? 'low' : atrPercent < 3 ? 'medium' : 'high';
    
    return {
      value: currentATR,
      volatility,
      stopLoss: {
        long: currentPrice - (currentATR * 2),
        short: currentPrice + (currentATR * 2)
      }
    };
  }
  
  /**
   * Calculate Stochastic Oscillator
   * Momentum indicator comparing closing price to price range over time
   * %K = (Close - Low14) / (High14 - Low14) * 100
   * %D = 3-period SMA of %K
   * Values > 80 indicate overbought, < 20 indicate oversold
   *
   * @param {number[]} highs - Array of high prices
   * @param {number[]} lows - Array of low prices
   * @param {number[]} closes - Array of closing prices
   * @param {number} [kPeriod=14] - %K period (default: 14)
   * @param {number} [dPeriod=3] - %D smoothing period (default: 3)
   * @returns {StochasticResult} %K and %D values, overbought/oversold flags, and signal
   */
  calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3
  ): StochasticResult {
    const kValues: number[] = [];
    
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - kPeriod + 1, i + 1);
      const periodLows = lows.slice(i - kPeriod + 1, i + 1);
      
      const highest = Math.max(...periodHighs);
      const lowest = Math.min(...periodLows);
      const current = closes[i];

      // Prevent division by zero when price range is zero (no movement)
      const range = highest - lowest;
      const k = range === 0 ? STOCHASTIC_NEUTRAL_VALUE : ((current - lowest) / range) * RSI_MAX_VALUE;
      kValues.push(k);
    }

    const currentK = kValues[kValues.length - 1];
    const dValues = this.calculateSMA(kValues.slice(-dPeriod));

    return {
      k: currentK,
      d: dValues,
      overbought: currentK > STOCHASTIC_OVERBOUGHT_THRESHOLD,
      oversold: currentK < STOCHASTIC_OVERSOLD_THRESHOLD,
      signal: currentK > STOCHASTIC_OVERBOUGHT_THRESHOLD ? 'sell' : currentK < STOCHASTIC_OVERSOLD_THRESHOLD ? 'buy' : 'neutral'
    };
  }
  
  /**
   * Calculate Ichimoku Cloud
   * Comprehensive trend-following indicator showing support/resistance and momentum
   * Components: Tenkan-sen, Kijun-sen, Senkou Span A/B (cloud), Chikou Span
   * Price above cloud = bullish, below cloud = bearish
   *
   * @param {number[]} highs - Array of high prices
   * @param {number[]} lows - Array of low prices
   * @param {number} [tenkanPeriod=9] - Tenkan-sen period (default: 9)
   * @param {number} [kijunPeriod=26] - Kijun-sen period (default: 26)
   * @param {number} [senkouPeriod=52] - Senkou Span B period (default: 52)
   * @returns {IchimokuResult} All five Ichimoku components and trading signal
   */
  calculateIchimoku(
    highs: number[],
    lows: number[],
    tenkanPeriod: number = 9,
    kijunPeriod: number = 26,
    senkouPeriod: number = 52
  ): IchimokuResult {
    // Tenkan-sen (Conversion Line)
    const tenkanHighs = highs.slice(-tenkanPeriod);
    const tenkanLows = lows.slice(-tenkanPeriod);
    const tenkan = (Math.max(...tenkanHighs) + Math.min(...tenkanLows)) / 2;
    
    // Kijun-sen (Base Line)
    const kijunHighs = highs.slice(-kijunPeriod);
    const kijunLows = lows.slice(-kijunPeriod);
    const kijun = (Math.max(...kijunHighs) + Math.min(...kijunLows)) / 2;
    
    // Senkou Span A (Leading Span A)
    const senkouA = (tenkan + kijun) / 2;
    
    // Senkou Span B (Leading Span B)
    const senkouHighs = highs.slice(-senkouPeriod);
    const senkouLows = lows.slice(-senkouPeriod);
    const senkouB = (Math.max(...senkouHighs) + Math.min(...senkouLows)) / 2;
    
    // Chikou Span (Lagging Span) - current close plotted 26 periods back
    const chikou = highs[highs.length - 1];
    
    // Determine signal
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (tenkan > kijun && chikou > senkouA && chikou > senkouB) {
      signal = 'bullish';
    } else if (tenkan < kijun && chikou < senkouA && chikou < senkouB) {
      signal = 'bearish';
    }
    
    return {
      tenkan,
      kijun,
      senkouA,
      senkouB,
      chikou,
      signal
    };
  }
  
  /**
   * Calculate Simple Moving Average (SMA)
   * Arithmetic mean of values over a period
   *
   * @param {number[]} values - Array of values to average
   * @returns {number} Simple moving average
   */
  calculateSMA(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * Weighted average giving more weight to recent prices
   * EMA = (Current Price * Multiplier) + (Previous EMA * (1 - Multiplier))
   * Multiplier = 2 / (Period + 1)
   *
   * @param {number[]} values - Array of values
   * @param {number} period - EMA period
   * @returns {number[]} Array of EMA values
   * @throws {Error} If insufficient data for calculation
   */
  calculateEMA(values: number[], period: number): number[] {
    if (values.length < period) {
      throw new Error(`Need at least ${period} values for EMA`);
    }
    
    const multiplier = 2 / (period + 1);
    const ema: number[] = [];
    
    // Start with SMA for first value
    const sma = values.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    ema.push(sma);
    
    // Calculate EMA for remaining values
    for (let i = period; i < values.length; i++) {
      const newEma = (values[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
      ema.push(newEma);
    }
    
    return ema;
  }
  
  /**
   * Calculate all technical indicators from OHLCV data
   * Automatically handles minimum data requirements for each indicator
   * Skips indicators that don't have enough data and logs errors
   *
   * Minimum data requirements:
   * - RSI: 15 candles
   * - MACD: 35 candles
   * - Bollinger Bands: 20 candles
   * - ATR: 15 candles
   * - Stochastic: 15 candles
   * - Ichimoku: 52 candles
   *
   * @param {Array} ohlcv - Array of OHLCV candle objects with open, high, low, close, volume
   * @returns {object} Object containing all successfully calculated indicators
   */
  calculateAll(ohlcv: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>): {
    rsi?: RSIResult | { error: string };
    macd?: MACDResult | { error: string };
    bollingerBands?: BollingerBandsResult | { error: string };
    atr?: ATRResult | { error: string };
    stochastic?: StochasticResult | { error: string };
    ichimoku?: IchimokuResult | { error: string };
  } {
    const closes = ohlcv.map(c => c.close);
    const highs = ohlcv.map(c => c.high);
    const lows = ohlcv.map(c => c.low);

    // Validate data quality - check for NaN, Infinity, or null values
    const hasValidData = (arr: number[]) => arr.every(v => typeof v === 'number' && isFinite(v) && v > 0);
    if (!hasValidData(closes) || !hasValidData(highs) || !hasValidData(lows)) {
      throw new Error('Invalid OHLCV data: contains NaN, Infinity, null, or non-positive values');
    }

    const results: any = {};
    
    // RSI (needs 15+ candles)
    if (closes.length >= 15) {
      try {
        results.rsi = this.calculateRSI(closes);
      } catch (e: any) {
        results.rsi = { error: `RSI calculation failed: ${e.message}` };
        console.error('RSI calculation failed:', e);
      }
    } else {
      results.rsi = { error: `Insufficient data for RSI (need 15+ candles, got ${closes.length})` };
    }

    // MACD (needs 35+ candles)
    if (closes.length >= 35) {
      try {
        results.macd = this.calculateMACD(closes);
      } catch (e: any) {
        results.macd = { error: `MACD calculation failed: ${e.message}` };
        console.error('MACD calculation failed:', e);
      }
    } else {
      results.macd = { error: `Insufficient data for MACD (need 35+ candles, got ${closes.length})` };
    }

    // Bollinger Bands (needs 20+ candles)
    if (closes.length >= 20) {
      try {
        results.bollingerBands = this.calculateBollingerBands(closes);
      } catch (e: any) {
        results.bollingerBands = { error: `Bollinger Bands calculation failed: ${e.message}` };
        console.error('Bollinger Bands calculation failed:', e);
      }
    } else {
      results.bollingerBands = { error: `Insufficient data for Bollinger Bands (need 20+ candles, got ${closes.length})` };
    }

    // ATR (needs 15+ candles)
    if (ohlcv.length >= 15) {
      try {
        results.atr = this.calculateATR(highs, lows, closes);
      } catch (e: any) {
        results.atr = { error: `ATR calculation failed: ${e.message}` };
        console.error('ATR calculation failed:', e);
      }
    } else {
      results.atr = { error: `Insufficient data for ATR (need 15+ candles, got ${ohlcv.length})` };
    }

    // Stochastic (needs 17+ candles)
    if (ohlcv.length >= 17) {
      try {
        results.stochastic = this.calculateStochastic(highs, lows, closes);
      } catch (e: any) {
        results.stochastic = { error: `Stochastic calculation failed: ${e.message}` };
        console.error('Stochastic calculation failed:', e);
      }
    } else {
      results.stochastic = { error: `Insufficient data for Stochastic (need 17+ candles, got ${ohlcv.length})` };
    }

    // Ichimoku (needs 52+ candles)
    if (ohlcv.length >= 52) {
      try {
        results.ichimoku = this.calculateIchimoku(highs, lows);
      } catch (e: any) {
        results.ichimoku = { error: `Ichimoku calculation failed: ${e.message}` };
        console.error('Ichimoku calculation failed:', e);
      }
    } else {
      results.ichimoku = { error: `Insufficient data for Ichimoku (need 52+ candles, got ${ohlcv.length})` };
    }
    
    return results;
  }
}

// Export singleton instance
export const technicalIndicators = new TechnicalIndicators();