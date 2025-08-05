# CCXT MCP Server - Testing Guide

## 🧪 Testing Strategy Overview

Testing the CCXT MCP Server requires a layered approach:
1. **Unit Tests** - Test individual components
2. **Integration Tests** - Test with real exchanges (testnet)
3. **End-to-End Tests** - Test through Claude Desktop
4. **Performance Tests** - Ensure sub-2-second responses
5. **Security Tests** - Verify no credential leaks

## 📦 Test Setup

### Install Testing Dependencies

```bash
npm install -D jest @types/jest ts-jest
npm install -D @testing-library/jest-dom
npm install -D nock  # For mocking HTTP requests
```

### Jest Configuration (jest.config.js)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
```

### Package.json Test Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testMatch='**/*.integration.test.ts'",
    "test:unit": "jest --testMatch='**/*.unit.test.ts'"
  }
}
```

## 🔬 Unit Tests

### Test Exchange Manager (tests/unit/exchange-manager.test.ts)

```typescript
import { ExchangeManager } from '../../src/exchange-manager';
import ccxt from 'ccxt';

jest.mock('ccxt');

describe('ExchangeManager', () => {
  let manager: ExchangeManager;
  
  beforeEach(() => {
    manager = ExchangeManager.getInstance();
    jest.clearAllMocks();
  });
  
  test('should create singleton instance', () => {
    const instance1 = ExchangeManager.getInstance();
    const instance2 = ExchangeManager.getInstance();
    expect(instance1).toBe(instance2);
  });
  
  test('should cache exchange instances', async () => {
    const mockExchange = {
      id: 'binance',
      loadMarkets: jest.fn().mockResolvedValue({}),
      has: { fetchTicker: true }
    };
    
    (ccxt as any).binance = jest.fn().mockReturnValue(mockExchange);
    
    const exchange1 = await manager.getExchange('binance');
    const exchange2 = await manager.getExchange('binance');
    
    expect(exchange1).toBe(exchange2);
    expect(ccxt.binance).toHaveBeenCalledTimes(1);
  });
  
  test('should handle unsupported exchanges', async () => {
    await expect(manager.getExchange('fake-exchange'))
      .rejects.toThrow('Exchange fake-exchange not supported');
  });
});
```

### Test Response Formatter (tests/unit/response-formatter.test.ts)

```typescript
import { ResponseFormatter } from '../../src/response-formatter';

describe('ResponseFormatter', () => {
  test('should format success response correctly', () => {
    const data = { symbol: 'BTC/USDT', price: 50000 };
    const response = ResponseFormatter.success(data, 'binance');
    
    expect(response).toMatchObject({
      success: true,
      data,
      metadata: {
        exchange: 'binance',
        version: 'TAPS-1.0.0'
      }
    });
    expect(response.metadata.timestamp).toBeCloseTo(Date.now(), -2);
  });
  
  test('should format error response correctly', () => {
    const error = new Error('Network error');
    const response = ResponseFormatter.error(error, 'kraken');
    
    expect(response).toMatchObject({
      success: false,
      error: {
        message: 'Network error',
        exchange: 'kraken'
      }
    });
  });
});
```

### Test Validation Utils (tests/unit/validation.test.ts)

```typescript
import { ValidationUtils } from '../../src/utils/validation';

describe('ValidationUtils', () => {
  describe('validateSymbol', () => {
    test('should accept valid symbols', () => {
      expect(() => ValidationUtils.validateSymbol('BTC/USDT')).not.toThrow();
      expect(() => ValidationUtils.validateSymbol('ETH/BTC')).not.toThrow();
    });
    
    test('should normalize symbol format', () => {
      expect(ValidationUtils.sanitizeSymbol('btc/usdt')).toBe('BTC/USDT');
      expect(ValidationUtils.sanitizeSymbol('ETH USDT')).toBe('ETH/USDT');
    });
    
    test('should reject invalid symbols', () => {
      expect(() => ValidationUtils.validateSymbol('')).toThrow();
      expect(() => ValidationUtils.validateSymbol('INVALID')).toThrow();
    });
  });
  
  describe('validateOrderParams', () => {
    test('should reject negative amounts', () => {
      expect(() => ValidationUtils.validateOrderParams({
        type: 'limit',
        side: 'buy',
        amount: -1,
        price: 50000
      })).toThrow('Amount must be positive');
    });
    
    test('should warn on large orders', () => {
      expect(() => ValidationUtils.validateOrderParams({
        type: 'limit',
        side: 'buy',
        amount: 10,
        price: 20000  // $200k order
      })).toThrow('Order too large');
    });
  });
});
```

## 🔗 Integration Tests

### Test Real Exchange Connection (tests/integration/binance.test.ts)

```typescript
import { ExchangeManager } from '../../src/exchange-manager';

describe('Binance Integration', () => {
  let manager: ExchangeManager;
  
  beforeAll(() => {
    manager = ExchangeManager.getInstance();
  });
  
  test('should fetch real ticker data', async () => {
    const exchange = await manager.getExchange('binance');
    const ticker = await exchange.fetchTicker('BTC/USDT');
    
    expect(ticker).toHaveProperty('symbol', 'BTC/USDT');
    expect(ticker.bid).toBeGreaterThan(0);
    expect(ticker.ask).toBeGreaterThan(0);
    expect(ticker.last).toBeGreaterThan(0);
  }, 10000); // 10 second timeout
  
  test('should fetch order book', async () => {
    const exchange = await manager.getExchange('binance');
    const orderBook = await exchange.fetchOrderBook('ETH/USDT', 5);
    
    expect(orderBook.bids).toHaveLength(5);
    expect(orderBook.asks).toHaveLength(5);
    expect(orderBook.bids[0][0]).toBeLessThan(orderBook.asks[0][0]);
  }, 10000);
  
  test('should handle rate limiting', async () => {
    const exchange = await manager.getExchange('binance');
    const promises = [];
    
    // Make 10 rapid requests
    for (let i = 0; i < 10; i++) {
      promises.push(exchange.fetchTicker('BTC/USDT'));
    }
    
    // Should not throw rate limit error if properly handled
    await expect(Promise.all(promises)).resolves.toBeDefined();
  }, 30000);
});
```

### Test with Testnet API Keys (tests/integration/trading.test.ts)

```typescript
describe('Binance Testnet Trading', () => {
  let exchange: ccxt.Exchange;
  
  beforeAll(async () => {
    // Only run if testnet credentials are available
    if (!process.env.BINANCE_TESTNET_API_KEY) {
      console.log('Skipping trading tests - no testnet credentials');
      return;
    }
    
    const manager = ExchangeManager.getInstance();
    exchange = await manager.getExchange('binance', {
      apiKey: process.env.BINANCE_TESTNET_API_KEY,
      secret: process.env.BINANCE_TESTNET_SECRET,
      testnet: true
    });
  });
  
  test('should fetch account balance', async () => {
    if (!exchange) return;
    
    const balance = await exchange.fetchBalance();
    expect(balance).toHaveProperty('USDT');
    expect(balance).toHaveProperty('BTC');
  });
  
  test('should place and cancel limit order', async () => {
    if (!exchange) return;
    
    // Place a very small order that won't fill
    const order = await exchange.createLimitBuyOrder(
      'BTC/USDT',
      0.001,  // amount
      10000   // price way below market
    );
    
    expect(order).toHaveProperty('id');
    expect(order.status).toBe('open');
    
    // Cancel the order
    const canceled = await exchange.cancelOrder(order.id, 'BTC/USDT');
    expect(canceled.status).toBe('canceled');
  });
});
```

## 🎮 End-to-End Tests

### Manual Test Script (tests/e2e/manual-test.md)

```markdown
# Manual E2E Test Checklist

## Setup
- [ ] Build the server: `npm run build`
- [ ] Add to Claude Desktop config
- [ ] Restart Claude Desktop

## Basic Tests
- [ ] Ask: "List all supported exchanges"
  - Should return 100+ exchanges
- [ ] Ask: "What's the price of Bitcoin on Binance?"
  - Should return current BTC/USDT price
- [ ] Ask: "Show me the order book for ETH/USDT"
  - Should return bids and asks

## Error Handling
- [ ] Ask: "Get price from fake-exchange"
  - Should return error message
- [ ] Ask: "Get price of INVALID/PAIR"
  - Should return validation error

## Performance
- [ ] Time the response for ticker request
  - Should be < 2 seconds
- [ ] Make 5 rapid requests
  - Should handle without errors

## Multi-Exchange
- [ ] Ask: "Compare BTC price on Binance, Coinbase, and Kraken"
  - Should return prices from all three
```

### Automated E2E Test (tests/e2e/mcp-client.test.ts)

```typescript
import { spawn } from 'child_process';
import { MCPClient } from '@modelcontextprotocol/sdk/client';

describe('MCP Server E2E', () => {
  let serverProcess: any;
  let client: MCPClient;
  
  beforeAll(async () => {
    // Start the server
    serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Create MCP client
    client = new MCPClient();
    await client.connect(serverProcess.stdin, serverProcess.stdout);
  });
  
  afterAll(() => {
    serverProcess.kill();
  });
  
  test('should list tools', async () => {
    const tools = await client.listTools();
    expect(tools).toContain('exchange_list');
    expect(tools).toContain('market_ticker');
  });
  
  test('should call exchange_list', async () => {
    const result = await client.callTool('exchange_list', {});
    expect(result).toContain('binance');
    expect(result).toContain('coinbase');
  });
});
```

## 🚦 Performance Tests

### Load Testing (tests/performance/load.test.ts)

```typescript
describe('Performance Tests', () => {
  test('should handle concurrent requests', async () => {
    const manager = ExchangeManager.getInstance();
    const exchange = await manager.getExchange('binance');
    
    const start = Date.now();
    const promises = [];
    
    // 20 concurrent requests
    for (let i = 0; i < 20; i++) {
      promises.push(exchange.fetchTicker('BTC/USDT'));
    }
    
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000);
  });
  
  test('should maintain sub-2s response time', async () => {
    const timings: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await callTool('market_ticker', {
        exchange: 'binance',
        symbol: 'BTC/USDT'
      });
      timings.push(Date.now() - start);
    }
    
    const average = timings.reduce((a, b) => a + b, 0) / timings.length;
    expect(average).toBeLessThan(2000);
  });
});
```

## 🔒 Security Tests

### Credential Security (tests/security/credentials.test.ts)

```typescript
describe('Security Tests', () => {
  test('should not expose API keys in responses', async () => {
    process.env.BINANCE_API_KEY = 'secret-key-123';
    
    const response = await callTool('market_ticker', {
      exchange: 'binance',
      symbol: 'BTC/USDT'
    });
    
    const responseStr = JSON.stringify(response);
    expect(responseStr).not.toContain('secret-key-123');
    expect(responseStr).not.toContain(process.env.BINANCE_API_KEY);
  });
  
  test('should not log sensitive data', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    // Perform operations that might log
    manager.getExchange('binance', {
      apiKey: 'test-key',
      secret: 'test-secret'
    });
    
    // Check console output
    const logs = consoleSpy.mock.calls.flat().join(' ');
    expect(logs).not.toContain('test-key');
    expect(logs).not.toContain('test-secret');
  });
});
```

## 🏃 Quick Test Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests (needs internet)
npm run test:integration

# Watch mode for development
npm run test:watch

# Test specific file
npm test -- exchange-manager.test.ts

# Test with verbose output
npm test -- --verbose
```

## 📊 Test Coverage Goals

- **Unit Tests**: 80% coverage minimum
- **Integration Tests**: Cover all major exchanges
- **E2E Tests**: Cover all user-facing tools
- **Security Tests**: 100% coverage for credential handling

## 🧪 Testing Checklist

### Before Each Release

- [ ] All unit tests pass
- [ ] Integration tests pass with testnet
- [ ] Manual E2E test completed
- [ ] Performance benchmarks met
- [ ] Security tests pass
- [ ] No console.log statements in production code
- [ ] Coverage > 80%

### Testing Different Exchanges

```typescript
const TEST_EXCHANGES = [
  { id: 'binance', symbol: 'BTC/USDT' },
  { id: 'coinbase', symbol: 'BTC/USD' },
  { id: 'kraken', symbol: 'XBT/USD' },  // Note: Kraken uses XBT
  { id: 'bybit', symbol: 'BTC/USDT' },
  { id: 'okx', symbol: 'BTC/USDT' }
];

TEST_EXCHANGES.forEach(({ id, symbol }) => {
  test(`should work with ${id}`, async () => {
    const ticker = await fetchTickerFromExchange(id, symbol);
    expect(ticker.last).toBeGreaterThan(0);
  });
});
```

## 🐛 Debug Testing Tips

1. **Use verbose flag**: `npm test -- --verbose`
2. **Single test focus**: `test.only('specific test', ...)`
3. **Skip tests**: `test.skip('not ready yet', ...)`
4. **Debug mode**: `node --inspect-brk node_modules/.bin/jest`
5. **Check logs**: Add `console.log` in tests (not in source)

---

This comprehensive testing guide ensures your CCXT MCP Server is bulletproof before deployment!
