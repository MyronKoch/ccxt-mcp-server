import { LRUCache } from 'lru-cache';

/**
 * LRU Cache Manager - Implements doggybee's performance optimization
 * with specific TTLs for different data types
 */
export class MarketDataCache {
  private static instance: MarketDataCache;

  // Cache configuration constants
  private static readonly TICKER_TTL_MS = 10 * 1000;      // 10 seconds (prices change fast)
  private static readonly ORDERBOOK_TTL_MS = 5 * 1000;    // 5 seconds (even more volatile)
  private static readonly OHLCV_TTL_MS = 60 * 1000;       // 1 minute (historical data changes less)
  private static readonly MARKET_TTL_MS = 60 * 60 * 1000; // 1 hour (rarely changes)
  private static readonly TRADES_TTL_MS = 10 * 1000;      // 10 seconds

  private static readonly TICKER_MAX_ENTRIES = 500;
  private static readonly ORDERBOOK_MAX_ENTRIES = 200;
  private static readonly OHLCV_MAX_ENTRIES = 300;
  private static readonly MARKET_MAX_ENTRIES = 1000;
  private static readonly TRADES_MAX_ENTRIES = 200;

  // Different caches with specific TTLs
  private tickerCache: LRUCache<string, any>;
  private orderBookCache: LRUCache<string, any>;
  private ohlcvCache: LRUCache<string, any>;
  private marketCache: LRUCache<string, any>;
  private tradesCache: LRUCache<string, any>;

  // Metrics tracking
  private metrics = {
    ticker: { hits: 0, misses: 0, evictions: 0 },
    orderBook: { hits: 0, misses: 0, evictions: 0 },
    ohlcv: { hits: 0, misses: 0, evictions: 0 },
    market: { hits: 0, misses: 0, evictions: 0 },
    trades: { hits: 0, misses: 0, evictions: 0 }
  };
  
  private constructor() {
    // Validate TTL values are positive
    if (MarketDataCache.TICKER_TTL_MS <= 0 || MarketDataCache.ORDERBOOK_TTL_MS <= 0 ||
        MarketDataCache.OHLCV_TTL_MS <= 0 || MarketDataCache.MARKET_TTL_MS <= 0 ||
        MarketDataCache.TRADES_TTL_MS <= 0) {
      throw new Error('Cache TTL values must be positive');
    }

    // Ticker: 10 second TTL (prices change fast)
    this.tickerCache = new LRUCache({
      max: MarketDataCache.TICKER_MAX_ENTRIES,
      ttl: MarketDataCache.TICKER_TTL_MS,
      ttlAutopurge: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Order Book: 5 second TTL (even more volatile)
    this.orderBookCache = new LRUCache({
      max: MarketDataCache.ORDERBOOK_MAX_ENTRIES,
      ttl: MarketDataCache.ORDERBOOK_TTL_MS,
      ttlAutopurge: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // OHLCV: 1 minute TTL (historical data changes less frequently)
    this.ohlcvCache = new LRUCache({
      max: MarketDataCache.OHLCV_MAX_ENTRIES,
      ttl: MarketDataCache.OHLCV_TTL_MS,
      ttlAutopurge: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Market Info: 1 hour TTL (rarely changes)
    this.marketCache = new LRUCache({
      max: MarketDataCache.MARKET_MAX_ENTRIES,
      ttl: MarketDataCache.MARKET_TTL_MS,
      ttlAutopurge: true,
      updateAgeOnGet: false, // Don't refresh on access
      updateAgeOnHas: false
    });

    // Trades: 10 second TTL
    this.tradesCache = new LRUCache({
      max: MarketDataCache.TRADES_MAX_ENTRIES,
      ttl: MarketDataCache.TRADES_TTL_MS,
      ttlAutopurge: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }
  
  public static getInstance(): MarketDataCache {
    if (!MarketDataCache.instance) {
      MarketDataCache.instance = new MarketDataCache();
    }
    return MarketDataCache.instance;
  }
  
  /**
   * Generate cache key for market data
   * Creates a unique identifier combining exchange, symbol, and optional extra parameters
   *
   * @private
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {string} [extra] - Optional extra parameter (e.g., limit, timeframe)
   * @returns {string} Cache key in format "exchange:symbol" or "exchange:symbol:extra"
   */
  private getKey(exchange: string, symbol: string, extra?: string): string {
    return extra ? `${exchange}:${symbol}:${extra}` : `${exchange}:${symbol}`;
  }

  /**
   * Get ticker data from cache
   * Ticker data includes current prices, volume, and 24h change
   * Cache TTL: 10 seconds
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @returns {any | undefined} Cached ticker data or undefined if not found/expired
   */
  getTicker(exchange: string, symbol: string): any | undefined {
    const result = this.tickerCache.get(this.getKey(exchange, symbol));
    if (result) {
      this.metrics.ticker.hits++;
    } else {
      this.metrics.ticker.misses++;
    }
    return result;
  }

  /**
   * Store ticker data in cache
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {any} data - Ticker data to cache
   */
  setTicker(exchange: string, symbol: string, data: any): void {
    this.tickerCache.set(this.getKey(exchange, symbol), data);
  }
  
  /**
   * Get order book data from cache
   * Order book contains bids and asks with prices and volumes
   * Cache TTL: 5 seconds
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {number} [limit] - Optional depth limit
   * @returns {any | undefined} Cached order book or undefined if not found/expired
   */
  getOrderBook(exchange: string, symbol: string, limit?: number): any | undefined {
    const result = this.orderBookCache.get(this.getKey(exchange, symbol, limit?.toString()));
    if (result) {
      this.metrics.orderBook.hits++;
    } else {
      this.metrics.orderBook.misses++;
    }
    return result;
  }

  /**
   * Store order book data in cache
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {any} data - Order book data to cache
   * @param {number} [limit] - Optional depth limit used in key
   */
  setOrderBook(exchange: string, symbol: string, data: any, limit?: number): void {
    this.orderBookCache.set(this.getKey(exchange, symbol, limit?.toString()), data);
  }

  /**
   * Get OHLCV candlestick data from cache
   * OHLCV data is used for charting and technical analysis
   * Cache TTL: 1 minute
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {string} timeframe - Candle timeframe (e.g., '1m', '1h', '1d')
   * @returns {any | undefined} Cached OHLCV data or undefined if not found/expired
   */
  getOHLCV(exchange: string, symbol: string, timeframe: string): any | undefined {
    const result = this.ohlcvCache.get(this.getKey(exchange, symbol, timeframe));
    if (result) {
      this.metrics.ohlcv.hits++;
    } else {
      this.metrics.ohlcv.misses++;
    }
    return result;
  }

  /**
   * Store OHLCV candlestick data in cache
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {string} timeframe - Candle timeframe
   * @param {any} data - OHLCV data to cache
   */
  setOHLCV(exchange: string, symbol: string, timeframe: string, data: any): void {
    this.ohlcvCache.set(this.getKey(exchange, symbol, timeframe), data);
  }

  /**
   * Get markets list from cache
   * Markets list contains all available trading pairs and their specifications
   * Cache TTL: 1 hour
   *
   * @param {string} exchange - Exchange identifier
   * @returns {any | undefined} Cached markets data or undefined if not found/expired
   */
  getMarkets(exchange: string): any | undefined {
    const result = this.marketCache.get(exchange);
    if (result) {
      this.metrics.market.hits++;
    } else {
      this.metrics.market.misses++;
    }
    return result;
  }

  /**
   * Store markets list in cache
   *
   * @param {string} exchange - Exchange identifier
   * @param {any} data - Markets data to cache
   */
  setMarkets(exchange: string, data: any): void {
    this.marketCache.set(exchange, data);
  }

  /**
   * Get recent trades from cache
   * Trades show actual executed transactions with price, amount, and side
   * Cache TTL: 10 seconds
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {number} [limit] - Optional result limit
   * @returns {any | undefined} Cached trades or undefined if not found/expired
   */
  getTrades(exchange: string, symbol: string, limit?: number): any | undefined {
    const result = this.tradesCache.get(this.getKey(exchange, symbol, limit?.toString()));
    if (result) {
      this.metrics.trades.hits++;
    } else {
      this.metrics.trades.misses++;
    }
    return result;
  }

  /**
   * Store recent trades in cache
   *
   * @param {string} exchange - Exchange identifier
   * @param {string} symbol - Trading pair symbol
   * @param {any} data - Trades data to cache
   * @param {number} [limit] - Optional result limit used in key
   */
  setTrades(exchange: string, symbol: string, data: any, limit?: number): void {
    this.tradesCache.set(this.getKey(exchange, symbol, limit?.toString()), data);
  }
  
  /**
   * Clear ticker cache
   * Removes all cached ticker data
   */
  clearTickerCache(): void {
    this.tickerCache.clear();
  }

  /**
   * Clear order book cache
   * Removes all cached order book data
   */
  clearOrderBookCache(): void {
    this.orderBookCache.clear();
  }

  /**
   * Clear all caches
   * Removes all cached data from ticker, orderbook, OHLCV, markets, and trades caches
   */
  clearAllCaches(): void {
    this.tickerCache.clear();
    this.orderBookCache.clear();
    this.ohlcvCache.clear();
    this.marketCache.clear();
    this.tradesCache.clear();
  }

  /**
   * Get cache statistics
   * Returns size, hit/miss counts, and hit rates for all caches
   *
   * @returns {object} Statistics object with metrics for each cache type
   */
  getStats() {
    const calculateHitRate = (hits: number, misses: number): number => {
      const total = hits + misses;
      return total > 0 ? (hits / total) * 100 : 0;
    };

    return {
      ticker: {
        size: this.tickerCache.size,
        maxSize: MarketDataCache.TICKER_MAX_ENTRIES,
        hits: this.metrics.ticker.hits,
        misses: this.metrics.ticker.misses,
        hitRate: calculateHitRate(this.metrics.ticker.hits, this.metrics.ticker.misses).toFixed(2) + '%',
        ttl: `${MarketDataCache.TICKER_TTL_MS / 1000}s`
      },
      orderBook: {
        size: this.orderBookCache.size,
        maxSize: MarketDataCache.ORDERBOOK_MAX_ENTRIES,
        hits: this.metrics.orderBook.hits,
        misses: this.metrics.orderBook.misses,
        hitRate: calculateHitRate(this.metrics.orderBook.hits, this.metrics.orderBook.misses).toFixed(2) + '%',
        ttl: `${MarketDataCache.ORDERBOOK_TTL_MS / 1000}s`
      },
      ohlcv: {
        size: this.ohlcvCache.size,
        maxSize: MarketDataCache.OHLCV_MAX_ENTRIES,
        hits: this.metrics.ohlcv.hits,
        misses: this.metrics.ohlcv.misses,
        hitRate: calculateHitRate(this.metrics.ohlcv.hits, this.metrics.ohlcv.misses).toFixed(2) + '%',
        ttl: `${MarketDataCache.OHLCV_TTL_MS / 1000}s`
      },
      market: {
        size: this.marketCache.size,
        maxSize: MarketDataCache.MARKET_MAX_ENTRIES,
        hits: this.metrics.market.hits,
        misses: this.metrics.market.misses,
        hitRate: calculateHitRate(this.metrics.market.hits, this.metrics.market.misses).toFixed(2) + '%',
        ttl: `${MarketDataCache.MARKET_TTL_MS / 1000}s`
      },
      trades: {
        size: this.tradesCache.size,
        maxSize: MarketDataCache.TRADES_MAX_ENTRIES,
        hits: this.metrics.trades.hits,
        misses: this.metrics.trades.misses,
        hitRate: calculateHitRate(this.metrics.trades.hits, this.metrics.trades.misses).toFixed(2) + '%',
        ttl: `${MarketDataCache.TRADES_TTL_MS / 1000}s`
      },
      overall: {
        totalHits: Object.values(this.metrics).reduce((sum, m) => sum + m.hits, 0),
        totalMisses: Object.values(this.metrics).reduce((sum, m) => sum + m.misses, 0),
        overallHitRate: (() => {
          const totalHits = Object.values(this.metrics).reduce((sum, m) => sum + m.hits, 0);
          const totalMisses = Object.values(this.metrics).reduce((sum, m) => sum + m.misses, 0);
          return calculateHitRate(totalHits, totalMisses).toFixed(2) + '%';
        })()
      }
    };
  }

  /**
   * Reset cache metrics
   * Useful for monitoring intervals or debugging
   */
  resetMetrics(): void {
    this.metrics = {
      ticker: { hits: 0, misses: 0, evictions: 0 },
      orderBook: { hits: 0, misses: 0, evictions: 0 },
      ohlcv: { hits: 0, misses: 0, evictions: 0 },
      market: { hits: 0, misses: 0, evictions: 0 },
      trades: { hits: 0, misses: 0, evictions: 0 }
    };
  }
}

// Export singleton instance
export const marketDataCache = MarketDataCache.getInstance();