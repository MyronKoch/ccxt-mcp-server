import { describe, it, expect, beforeEach } from 'vitest';
import { MarketDataCache } from './lru-cache-manager.js';

describe('MarketDataCache', () => {
  let cache: MarketDataCache;

  beforeEach(() => {
    cache = MarketDataCache.getInstance();
    cache.clearAllCaches();
    cache.resetMetrics();
  });

  describe('Ticker Cache', () => {
    it('should cache and retrieve ticker data', () => {
      const tickerData = {
        symbol: 'BTC/USDT',
        bid: 50000,
        ask: 50100,
        last: 50050,
        timestamp: Date.now(),
      };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      const retrieved = cache.getTicker('binance', 'BTC/USDT');

      expect(retrieved).toEqual(tickerData);
    });

    it('should return undefined for non-existent ticker', () => {
      const retrieved = cache.getTicker('binance', 'ETH/USDT');
      expect(retrieved).toBeUndefined();
    });

    it('should track hits and misses', () => {
      const tickerData = { symbol: 'BTC/USDT', last: 50000 };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      cache.getTicker('binance', 'BTC/USDT'); // hit
      cache.getTicker('binance', 'ETH/USDT'); // miss

      const stats = cache.getStats();
      expect(stats.ticker.hits).toBe(1);
      expect(stats.ticker.misses).toBe(1);
    });
  });

  describe('Cache Statistics', () => {
    it('should calculate hit rate correctly', () => {
      const tickerData = { symbol: 'BTC/USDT', last: 50000 };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      cache.getTicker('binance', 'BTC/USDT'); // hit
      cache.getTicker('binance', 'BTC/USDT'); // hit
      cache.getTicker('binance', 'ETH/USDT'); // miss

      const stats = cache.getStats();
      expect(stats.ticker.hitRate).toBe('66.67%'); // 2 hits out of 3 total
    });

    it('should provide overall statistics', () => {
      const tickerData = { symbol: 'BTC/USDT', last: 50000 };
      const ohlcvData = { candles: [], symbol: 'BTC/USDT' };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      cache.setOHLCV('binance', 'BTC/USDT', '1h', ohlcvData);

      cache.getTicker('binance', 'BTC/USDT'); // hit
      cache.getOHLCV('binance', 'BTC/USDT', '1h'); // hit
      cache.getTicker('binance', 'ETH/USDT'); // miss

      const stats = cache.getStats();
      expect(stats.overall.totalHits).toBe(2);
      expect(stats.overall.totalMisses).toBe(1);
      expect(stats.overall.overallHitRate).toBe('66.67%');
    });

    it('should reset metrics', () => {
      const tickerData = { symbol: 'BTC/USDT', last: 50000 };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      cache.getTicker('binance', 'BTC/USDT');

      cache.resetMetrics();

      const stats = cache.getStats();
      expect(stats.ticker.hits).toBe(0);
      expect(stats.ticker.misses).toBe(0);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear all caches', () => {
      const tickerData = { symbol: 'BTC/USDT', last: 50000 };
      const orderbookData = { bids: [], asks: [] };

      cache.setTicker('binance', 'BTC/USDT', tickerData);
      cache.setOrderBook('binance', 'BTC/USDT', orderbookData);

      cache.clearAllCaches();

      expect(cache.getTicker('binance', 'BTC/USDT')).toBeUndefined();
      expect(cache.getOrderBook('binance', 'BTC/USDT')).toBeUndefined();

      const stats = cache.getStats();
      expect(stats.ticker.size).toBe(0);
      expect(stats.orderBook.size).toBe(0);
    });
  });
});
