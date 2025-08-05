# CCXT MCP Server - Technical Architecture

## System Overview

The CCXT MCP Server acts as a bridge between Claude (or any MCP client) and 100+ cryptocurrency exchanges through the unified CCXT library interface.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Claude    │────▶│  MCP Server  │────▶│    CCXT      │────▶│  Exchanges   │
│  Desktop    │◀────│   (TAPS)     │◀────│   Library    │◀────│  (100+)      │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

## Core Components

### 1. Exchange Manager (Singleton Pattern)

```typescript
interface ExchangeConfig {
  id: string;
  apiKey?: string;
  secret?: string;
  password?: string;  // Some exchanges require this
  testnet?: boolean;
  rateLimit?: number;
  options?: any;
}

class ExchangeManager {
  private static instance: ExchangeManager;
  private exchanges: Map<string, ccxt.Exchange>;
  private rateLimiters: Map<string, RateLimiter>;
  
  // Lazy loading - only create exchange instances when needed
  async getExchange(exchangeId: string, config?: ExchangeConfig): Promise<ccxt.Exchange> {
    const key = this.getExchangeKey(exchangeId, config);
    
    if (!this.exchanges.has(key)) {
      const exchange = await this.createExchange(exchangeId, config);
      this.exchanges.set(key, exchange);
      this.rateLimiters.set(key, new RateLimiter(exchange.rateLimit));
    }
    
    return this.exchanges.get(key)!;
  }
  
  private async createExchange(exchangeId: string, config?: ExchangeConfig) {
    const ExchangeClass = ccxt[exchangeId];
    if (!ExchangeClass) {
      throw new TAPSError('TAPS001', `Exchange ${exchangeId} not supported`);
    }
    
    const exchange = new ExchangeClass({
      apiKey: config?.apiKey || process.env[`${exchangeId.toUpperCase()}_API_KEY`],
      secret: config?.secret || process.env[`${exchangeId.toUpperCase()}_SECRET`],
      password: config?.password,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',  // or 'future', 'swap', etc.
        ...config?.options
      }
    });
    
    // Use testnet if configured
    if (config?.testnet && exchange.urls.test) {
      exchange.urls.api = exchange.urls.test;
    }
    
    await exchange.loadMarkets();
    return exchange;
  }
}
```

### 2. Rate Limiter

```typescript
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequest: number = 0;
  private minDelay: number;
  
  constructor(rateLimit: number = 500) {
    this.minDelay = rateLimit;
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  
  private async processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequest;
      
      if (elapsed < this.minDelay) {
        await this.sleep(this.minDelay - elapsed);
      }
      
      const task = this.queue.shift()!;
      this.lastRequest = Date.now();
      await task();
    }
    
    this.processing = false;
  }
}
```

### 3. Response Formatter

```typescript
class ResponseFormatter {
  static success<T>(data: T, exchange: string, rateLimit?: RateLimitInfo): TAPSResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        exchange,
        timestamp: Date.now(),
        rateLimit: rateLimit || { remaining: -1, reset: -1 },
        version: 'TAPS-1.0.0'
      }
    };
  }
  
  static error(error: any, exchange: string): TAPSResponse {
    const tapsError = ErrorHandler.normalize(error);
    
    return {
      success: false,
      error: {
        code: tapsError.code,
        message: tapsError.message,
        exchange,
        details: tapsError.details
      },
      metadata: {
        exchange,
        timestamp: Date.now(),
        rateLimit: { remaining: -1, reset: -1 },
        version: 'TAPS-1.0.0'
      }
    };
  }
}
```

### 4. Tool Implementation Pattern

```typescript
// Standard tool implementation pattern
async function marketTicker(params: MarketTickerParams): Promise<TAPSResponse<Ticker>> {
  const { exchange: exchangeId, symbol } = params;
  
  try {
    // 1. Validate inputs
    ValidationUtils.validateExchange(exchangeId);
    ValidationUtils.validateSymbol(symbol);
    
    // 2. Get exchange instance
    const exchange = await ExchangeManager.getInstance().getExchange(exchangeId);
    
    // 3. Check if method is supported
    if (!exchange.has['fetchTicker']) {
      throw new TAPSError('TAPS006', 'Ticker not available for this exchange');
    }
    
    // 4. Execute with rate limiting
    const rateLimiter = RateLimiterManager.get(exchangeId);
    const ticker = await rateLimiter.execute(() => 
      exchange.fetchTicker(symbol)
    );
    
    // 5. Format and return response
    return ResponseFormatter.success(ticker, exchangeId);
    
  } catch (error) {
    // 6. Handle errors consistently
    return ResponseFormatter.error(error, exchangeId);
  }
}
```

## Data Flow Architecture

### 1. Request Flow

```
MCP Client Request
    ↓
Input Validation
    ↓
Exchange Selection
    ↓
Rate Limit Check
    ↓
CCXT Method Call
    ↓
Response Formatting
    ↓
MCP Client Response
```

### 2. Caching Strategy

```typescript
class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  
  // Cache keys follow pattern: exchange:method:params
  private getKey(exchange: string, method: string, params: any): string {
    return `${exchange}:${method}:${JSON.stringify(params)}`;
  }
  
  async get<T>(
    key: string, 
    ttl: number, 
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    
    const data = await fetcher();
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
    
    return data;
  }
}

// Usage in tools
const markets = await cacheManager.get(
  `${exchangeId}:markets`,
  60000, // 1 minute TTL
  () => exchange.fetchMarkets()
);
```

### 3. Error Recovery

```typescript
class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailTime: Map<string, number> = new Map();
  private state: Map<string, 'closed' | 'open' | 'half-open'> = new Map();
  
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options: CircuitBreakerOptions = {}
  ): Promise<T> {
    const state = this.state.get(key) || 'closed';
    
    if (state === 'open') {
      if (this.shouldAttemptReset(key)) {
        this.state.set(key, 'half-open');
      } else {
        throw new TAPSError('TAPS007', 'Exchange circuit breaker open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess(key);
      return result;
    } catch (error) {
      this.onFailure(key);
      throw error;
    }
  }
}
```

## Security Architecture

### 1. Credential Management

```typescript
class CredentialManager {
  private credentials: Map<string, EncryptedCredentials> = new Map();
  
  // Never store plain text credentials
  async setCredentials(exchange: string, creds: ExchangeCredentials) {
    // Credentials are only held in memory during session
    // Never persisted to disk
    this.credentials.set(exchange, this.encrypt(creds));
  }
  
  async getCredentials(exchange: string): Promise<ExchangeCredentials | null> {
    const encrypted = this.credentials.get(exchange);
    return encrypted ? this.decrypt(encrypted) : null;
  }
  
  // Clear credentials after use or on timeout
  clearCredentials(exchange: string) {
    this.credentials.delete(exchange);
  }
}
```

### 2. Input Validation

```typescript
class ValidationUtils {
  static validateOrderParams(params: OrderParams) {
    // Prevent common trading mistakes
    if (params.type === 'market' && params.price) {
      throw new ValidationError('Market orders should not have price');
    }
    
    if (params.amount <= 0) {
      throw new ValidationError('Amount must be positive');
    }
    
    // Check for suspiciously large orders
    if (params.amount * params.price > 100000) { // $100k
      throw new ValidationError('Order too large - requires confirmation');
    }
  }
  
  static sanitizeSymbol(symbol: string): string {
    // Normalize symbol format
    return symbol.toUpperCase().replace(' ', '/');
  }
}
```

## Performance Optimizations

### 1. Parallel Execution

```typescript
// Fetch data from multiple exchanges in parallel
async function multiExchangeTicker(symbol: string, exchanges: string[]) {
  const promises = exchanges.map(exchange => 
    marketTicker({ exchange, symbol })
      .catch(error => ({ exchange, error }))
  );
  
  const results = await Promise.all(promises);
  return results;
}
```

### 2. Batch Operations

```typescript
// Batch multiple operations to reduce overhead
async function batchFetchTickers(exchange: string, symbols: string[]) {
  const ex = await ExchangeManager.getInstance().getExchange(exchange);
  
  if (ex.has['fetchTickers']) {
    // Use batch method if available
    return ex.fetchTickers(symbols);
  } else {
    // Fall back to individual requests
    const promises = symbols.map(symbol => ex.fetchTicker(symbol));
    return Promise.all(promises);
  }
}
```

## Exchange-Specific Handlers

```typescript
// Handle exchange-specific quirks
class ExchangeHandlers {
  static binance = {
    preprocessSymbol: (symbol: string) => {
      // Binance doesn't use '/' separator
      return symbol.replace('/', '');
    },
    
    handleError: (error: any) => {
      if (error.code === -1021) {
        return new TAPSError('TAPS003', 'Timestamp sync required');
      }
      return error;
    }
  };
  
  static coinbase = {
    preprocessSymbol: (symbol: string) => {
      // Coinbase uses '-' separator
      return symbol.replace('/', '-');
    }
  };
}
```

## Monitoring & Metrics

```typescript
class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();
  
  recordLatency(exchange: string, method: string, duration: number) {
    const key = `${exchange}:${method}:latency`;
    this.updateMetric(key, duration);
  }
  
  recordError(exchange: string, error: string) {
    const key = `${exchange}:errors:${error}`;
    this.incrementCounter(key);
  }
  
  getHealthStatus(): HealthStatus {
    return {
      uptime: process.uptime(),
      exchanges: this.getExchangeHealth(),
      latency: this.getAverageLatency(),
      errorRate: this.getErrorRate()
    };
  }
}
```

## WebSocket Architecture (Future)

```typescript
// WebSocket support for real-time data
class WebSocketManager {
  private connections: Map<string, ccxt.pro.Exchange> = new Map();
  
  async subscribeToTicker(exchange: string, symbol: string, callback: (ticker: Ticker) => void) {
    const ws = await this.getWebSocketExchange(exchange);
    
    while (true) {
      try {
        const ticker = await ws.watchTicker(symbol);
        callback(ticker);
      } catch (e) {
        // Handle reconnection
        await this.reconnect(exchange);
      }
    }
  }
}
```

## Testing Architecture

```typescript
// Mock exchange for testing
class MockExchange {
  static create(exchangeId: string): any {
    return {
      id: exchangeId,
      has: {
        fetchTicker: true,
        fetchOrderBook: true,
        createOrder: true
      },
      fetchTicker: async (symbol: string) => ({
        symbol,
        bid: 50000,
        ask: 50001,
        last: 50000.5
      }),
      fetchBalance: async () => ({
        BTC: { free: 1.5, used: 0, total: 1.5 },
        USDT: { free: 50000, used: 0, total: 50000 }
      })
    };
  }
}
```

## Deployment Configuration

### Docker Support

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Configuration

```yaml
# docker-compose.yml
version: '3.8'
services:
  ccxt-mcp:
    build: .
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - CACHE_REDIS_URL=redis://cache:6379
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

## Critical Success Factors

1. **Rate Limit Management**: Never exceed exchange limits
2. **Error Recovery**: Graceful degradation, not crashes
3. **Data Consistency**: Normalized responses across exchanges
4. **Security**: Zero credential exposure risk
5. **Performance**: Sub-2-second response times
6. **Reliability**: 99.9% uptime for core functions

---

This architecture provides a robust, scalable foundation for the CCXT MCP Server that can handle the complexity of 100+ exchanges while maintaining security and performance.
