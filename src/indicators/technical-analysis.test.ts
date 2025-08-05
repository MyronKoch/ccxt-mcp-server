import { describe, it, expect } from 'vitest';
import { TechnicalIndicators } from './technical-analysis.js';

describe('TechnicalIndicators', () => {
  const indicators = new TechnicalIndicators();

  describe('calculateRSI', () => {
    it('should calculate RSI correctly for upward trend', () => {
      const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
      const result = indicators.calculateRSI(prices);

      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(100);
      expect(['buy', 'sell', 'neutral']).toContain(result.signal);
    });

    it('should identify overbought conditions', () => {
      // Strongly upward trending prices
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const result = indicators.calculateRSI(prices);

      expect(result.overbought).toBe(true);
      expect(result.signal).toBe('sell');
      expect(result.value).toBeGreaterThan(70);
    });

    it('should identify oversold conditions', () => {
      // Strongly downward trending prices
      const prices = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
      const result = indicators.calculateRSI(prices);

      expect(result.oversold).toBe(true);
      expect(result.signal).toBe('buy');
      expect(result.value).toBeLessThan(30);
    });

    it('should handle all gains (no losses)', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      const result = indicators.calculateRSI(prices);

      expect(result.value).toBeGreaterThan(90); // Very high but not exactly 100 due to smoothing
      expect(result.overbought).toBe(true);
    });

    it('should handle flat prices', () => {
      const prices = Array(20).fill(100);
      const result = indicators.calculateRSI(prices);

      expect(result.value).toBeGreaterThan(90); // Very high for no losses
    });

    it('should throw error for insufficient data', () => {
      const prices = [100, 101, 102];
      expect(() => indicators.calculateRSI(prices)).toThrow('Need at least 15 prices');
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD correctly', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const result = indicators.calculateMACD(prices);

      expect(result.macd).toBeDefined();
      expect(result.signal).toBeDefined();
      expect(result.histogram).toBeDefined();
      expect(result.trend).toMatch(/bullish|bearish|neutral/);
    });

    it('should detect bullish trend when histogram is positive', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const result = indicators.calculateMACD(prices);

      expect(result.trend).toBe('bullish');
      expect(result.histogram).toBeGreaterThan(0);
    });

    it('should detect bearish trend when histogram is negative', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 - i * 0.5);
      const result = indicators.calculateMACD(prices);

      expect(result.trend).toBe('bearish');
      expect(result.histogram).toBeLessThan(0);
    });

    it('should handle crossover detection with sufficient data', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const result = indicators.calculateMACD(prices);

      expect(typeof result.crossover).toBe('boolean');
    });

    it('should not crash with minimal data', () => {
      const prices = Array.from({ length: 35 }, (_, i) => 100 + i);
      expect(() => indicators.calculateMACD(prices)).not.toThrow();
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate Bollinger Bands correctly', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const result = indicators.calculateBollingerBands(prices);

      expect(result.upper).toBeGreaterThan(result.middle);
      expect(result.middle).toBeGreaterThan(result.lower);
      expect(result.bandwidth).toBeGreaterThan(0);
    });

    it('should detect squeeze conditions', () => {
      const prices = Array.from({ length: 30 }, () => 100); // Flat prices = low volatility
      const result = indicators.calculateBollingerBands(prices);

      expect(result.squeeze).toBe(true);
      expect(result.bandwidth).toBeLessThan(10);
    });

    it('should identify overbought when price above upper band', () => {
      // Create prices that end with a strong upward spike to exceed upper band
      const prices = Array.from({ length: 29 }, () => 100);
      prices.push(130); // Sharp spike above the band
      const result = indicators.calculateBollingerBands(prices);

      expect(result.percentB).toBeGreaterThan(100);
      expect(result.signal).toBe('overbought');
    });

    it('should identify oversold when price below lower band', () => {
      // Create prices that end with a strong downward spike to fall below lower band
      const prices = Array.from({ length: 29 }, () => 100);
      prices.push(70); // Sharp drop below the band
      const result = indicators.calculateBollingerBands(prices);

      expect(result.percentB).toBeLessThan(0);
      expect(result.signal).toBe('oversold');
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly', () => {
      const highs = [110, 112, 111, 113, 115, 114, 116, 118, 117, 119, 120, 119, 121, 122, 123];
      const lows = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
      const closes = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119];

      const result = indicators.calculateATR(highs, lows, closes);

      expect(result.value).toBeGreaterThan(0);
      expect(result.volatility).toMatch(/low|medium|high/);
      expect(result.stopLoss.long).toBeLessThan(closes[closes.length - 1]);
      expect(result.stopLoss.short).toBeGreaterThan(closes[closes.length - 1]);
    });

    it('should classify low volatility correctly', () => {
      // Very tight range for low volatility (< 1% ATR)
      const highs = Array.from({ length: 20 }, () => 100.3);
      const lows = Array.from({ length: 20 }, () => 99.7);
      const closes = Array.from({ length: 20 }, () => 100);

      const result = indicators.calculateATR(highs, lows, closes);

      expect(result.volatility).toBe('low');
    });

    it('should classify high volatility correctly', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
      const lows = Array.from({ length: 20 }, (_, i) => 100 + i * 5 - 10);
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 5 - 5);

      const result = indicators.calculateATR(highs, lows, closes);

      expect(result.volatility).toBe('high');
    });

    it('should throw error for insufficient data', () => {
      const highs = [110, 112];
      const lows = [100, 101];
      const closes = [105, 106];

      expect(() => indicators.calculateATR(highs, lows, closes)).toThrow('Need at least 15 candles');
    });
  });

  describe('calculateStochastic', () => {
    it('should calculate Stochastic correctly', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 + i + Math.random() * 5);
      const lows = Array.from({ length: 20 }, (_, i) => 95 + i + Math.random() * 5);
      const closes = Array.from({ length: 20 }, (_, i) => 97 + i + Math.random() * 5);

      const result = indicators.calculateStochastic(highs, lows, closes);

      expect(result.k).toBeGreaterThanOrEqual(0);
      expect(result.k).toBeLessThanOrEqual(100);
      expect(result.d).toBeGreaterThanOrEqual(0);
      expect(result.d).toBeLessThanOrEqual(100);
    });

    it('should handle zero range (no price movement)', () => {
      const highs = Array.from({ length: 20 }, () => 100);
      const lows = Array.from({ length: 20 }, () => 100);
      const closes = Array.from({ length: 20 }, () => 100);

      const result = indicators.calculateStochastic(highs, lows, closes);

      expect(result.k).toBe(50); // Should return neutral value
      expect(result.signal).toBe('neutral');
    });

    it('should identify overbought conditions', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const lows = Array.from({ length: 20 }, (_, i) => 95 + i * 2);
      const closes = Array.from({ length: 20 }, (_, i) => 99 + i * 2);

      const result = indicators.calculateStochastic(highs, lows, closes);

      expect(result.overbought).toBe(true);
      expect(result.signal).toBe('sell');
    });

    it('should identify oversold conditions', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
      const lows = Array.from({ length: 20 }, (_, i) => 95 - i * 2);
      const closes = Array.from({ length: 20 }, (_, i) => 96 - i * 2);

      const result = indicators.calculateStochastic(highs, lows, closes);

      expect(result.oversold).toBe(true);
      expect(result.signal).toBe('buy');
    });
  });

  describe('calculateIchimoku', () => {
    it('should calculate Ichimoku cloud correctly', () => {
      const highs = Array.from({ length: 60 }, (_, i) => 100 + i + Math.random() * 10);
      const lows = Array.from({ length: 60 }, (_, i) => 90 + i + Math.random() * 10);

      const result = indicators.calculateIchimoku(highs, lows);

      expect(result.tenkan).toBeDefined();
      expect(result.kijun).toBeDefined();
      expect(result.senkouA).toBeDefined();
      expect(result.senkouB).toBeDefined();
      expect(result.chikou).toBeDefined();
      expect(result.signal).toMatch(/bullish|bearish|neutral/);
    });

    it('should detect bullish signal', () => {
      const highs = Array.from({ length: 60 }, (_, i) => 100 + i);
      const lows = Array.from({ length: 60 }, (_, i) => 95 + i);

      const result = indicators.calculateIchimoku(highs, lows);

      expect(result.signal).toBe('bullish');
    });

    it('should detect bearish signal', () => {
      const highs = Array.from({ length: 60 }, (_, i) => 100 - i);
      const lows = Array.from({ length: 60 }, (_, i) => 95 - i);

      const result = indicators.calculateIchimoku(highs, lows);

      expect(result.signal).toBe('bearish');
    });
  });

  describe('calculateAll', () => {
    const createOHLCV = (length: number) =>
      Array.from({ length }, (_, i) => ({
        open: 100 + i + Math.random() * 5,
        high: 105 + i + Math.random() * 5,
        low: 95 + i + Math.random() * 5,
        close: 100 + i + Math.random() * 5,
        volume: 1000 + Math.random() * 500
      }));

    it('should calculate all indicators with sufficient data', () => {
      const ohlcv = createOHLCV(60);
      const results = indicators.calculateAll(ohlcv);

      expect(results.rsi).toBeDefined();
      expect(results.macd).toBeDefined();
      expect(results.bollingerBands).toBeDefined();
      expect(results.atr).toBeDefined();
      expect(results.stochastic).toBeDefined();
      expect(results.ichimoku).toBeDefined();
    });

    it('should return errors for insufficient data', () => {
      const ohlcv = createOHLCV(10);
      const results = indicators.calculateAll(ohlcv);

      expect(results.rsi).toHaveProperty('error');
      expect(results.macd).toHaveProperty('error');
    });

    it('should reject invalid OHLCV data with NaN', () => {
      const ohlcv = [
        { open: 100, high: 105, low: 95, close: NaN, volume: 1000 }
      ];

      expect(() => indicators.calculateAll(ohlcv)).toThrow('Invalid OHLCV data');
    });

    it('should reject invalid OHLCV data with Infinity', () => {
      const ohlcv = [
        { open: 100, high: Infinity, low: 95, close: 100, volume: 1000 }
      ];

      expect(() => indicators.calculateAll(ohlcv)).toThrow('Invalid OHLCV data');
    });

    it('should reject invalid OHLCV data with negative values', () => {
      const ohlcv = [
        { open: 100, high: 105, low: -95, close: 100, volume: 1000 }
      ];

      expect(() => indicators.calculateAll(ohlcv)).toThrow('Invalid OHLCV data');
    });

    it('should handle calculation errors gracefully', () => {
      const ohlcv = Array.from({ length: 20 }, () => ({
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 0
      }));

      const results = indicators.calculateAll(ohlcv);

      // Should not throw, might have some errors
      expect(results).toBeDefined();
    });
  });

  describe('calculateSMA', () => {
    it('should calculate simple moving average correctly', () => {
      const values = [10, 20, 30, 40, 50];
      const result = indicators.calculateSMA(values);

      expect(result).toBe(30);
    });

    it('should handle single value', () => {
      const values = [100];
      const result = indicators.calculateSMA(values);

      expect(result).toBe(100);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate exponential moving average correctly', () => {
      const values = Array.from({ length: 20 }, (_, i) => 100 + i);
      const result = indicators.calculateEMA(values, 10);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toBeGreaterThan(100);
    });

    it('should throw error for insufficient data', () => {
      const values = [100, 101, 102];
      expect(() => indicators.calculateEMA(values, 10)).toThrow('Need at least 10 values');
    });

    it('should give more weight to recent values', () => {
      const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
      const result = indicators.calculateEMA(values, 10);

      const lastEMA = result[result.length - 1];
      expect(lastEMA).toBeGreaterThan(100);
      expect(lastEMA).toBeLessThan(200);
    });
  });
});
