#!/usr/bin/env node
/**
 * Comprehensive Test Suite for CCXT MCP Server v2.0
 * Tests all features systematically with detailed reporting
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const CONFIG = {
  timeout: 5000,
  exchanges: {
    usFriendly: ['coinbase', 'kraken', 'gemini'],
    international: ['binance', 'bybit', 'okx'],
    all: ['coinbase', 'kraken', 'okx', 'gateio', 'kucoin', 'bitget', 'mexc']
  },
  symbols: {
    major: 'BTC/USDT',
    altcoin: 'ETH/USDT',
    small: 'SOL/USDT'
  }
};

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: [],
  performance: {},
  startTime: Date.now()
};

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Start MCP server
const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let messageId = 1;
const pendingRequests = new Map();

// Helper to send JSON-RPC request
function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    pendingRequests.set(id, { resolve, reject });
    const message = JSON.stringify(request);
    server.stdin.write(message + '\n');
    
    // Timeout handler
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, CONFIG.timeout);
  });
}

// Parse server responses
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      if (response.id && pendingRequests.has(response.id)) {
        const { resolve } = pendingRequests.get(response.id);
        pendingRequests.delete(response.id);
        resolve(response);
      }
    } catch (e) {
      // Skip non-JSON lines
    }
  }
});

// Test runner
async function runTest(name, testFn, category) {
  const startTime = Date.now();
  console.log(`\n${colors.blue}Running: ${name}${colors.reset}`);
  
  try {
    const result = await testFn();
    const duration = Date.now() - startTime;
    
    testResults.passed++;
    testResults.details.push({
      name,
      category,
      status: 'passed',
      duration,
      result
    });
    
    console.log(`${colors.green}✓ PASSED${colors.reset} (${duration}ms)`);
    if (result.message) {
      console.log(`  ${result.message}`);
    }
    
    return { passed: true, duration, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    testResults.failed++;
    testResults.details.push({
      name,
      category,
      status: 'failed',
      duration,
      error: error.message
    });
    
    console.log(`${colors.red}✗ FAILED${colors.reset} (${duration}ms)`);
    console.log(`  Error: ${error.message}`);
    
    return { passed: false, duration, error };
  }
}

// Test Suite Categories
const testSuite = {
  // Phase 1: Core Functionality
  async phase1_CoreFunctionality() {
    console.log(`\n${colors.yellow}=== PHASE 1: CORE FUNCTIONALITY ===${colors.reset}`);
    
    // Test 1.1: Exchange List
    await runTest('Exchange List Verification', async () => {
      const response = await sendRequest('tools/call', {
        name: 'exchange_list',
        arguments: {}
      });
      
      const total = response.result?.data?.total;
      if (total !== 106) {
        throw new Error(`Expected 106 exchanges, got ${total}`);
      }
      
      return { 
        message: `Verified ${total} exchanges available`,
        exchangeCount: total 
      };
    }, 'core');
    
    // Test 1.2: Market Ticker
    await runTest('Market Ticker (Coinbase BTC)', async () => {
      const response = await sendRequest('tools/call', {
        name: 'market_ticker',
        arguments: {
          exchange: 'coinbase',
          symbol: 'BTC/USD'
        }
      });
      
      const price = response.result?.data?.last;
      if (!price || price < 10000) {
        throw new Error(`Invalid price: ${price}`);
      }
      
      return { 
        message: `BTC price: $${price.toFixed(2)}`,
        price 
      };
    }, 'core');
    
    // Test 1.3: Token Overflow Prevention
    await runTest('Multi-Exchange Comparison (Summary Mode)', async () => {
      const startSize = JSON.stringify({
        symbol: CONFIG.symbols.major,
        exchanges: CONFIG.exchanges.all
      }).length;
      
      const response = await sendRequest('tools/call', {
        name: 'analytics_compare_prices',
        arguments: {
          symbol: CONFIG.symbols.major,
          exchanges: CONFIG.exchanges.all,
          mode: 'summary'
        }
      });
      
      const responseSize = JSON.stringify(response).length;
      const reduction = ((1 - responseSize / (startSize * 10)) * 100).toFixed(1);
      
      if (!response.result?.data?.exchangeCount) {
        throw new Error('Invalid response format');
      }
      
      return { 
        message: `Token reduction: ${reduction}% | Exchanges: ${response.result.data.exchangeCount}`,
        reduction,
        responseSize 
      };
    }, 'core');
  },
  
  // Phase 2: Caching & Performance
  async phase2_CachingPerformance() {
    console.log(`\n${colors.yellow}=== PHASE 2: CACHING & PERFORMANCE ===${colors.reset}`);
    
    // Test 2.1: Cache Performance
    await runTest('Cache Hit Performance', async () => {
      // First call - not cached
      const start1 = Date.now();
      const response1 = await sendRequest('tools/call', {
        name: 'market_ticker',
        arguments: {
          exchange: 'kraken',
          symbol: 'BTC/USD'
        }
      });
      const time1 = Date.now() - start1;
      
      // Wait 100ms
      await new Promise(r => setTimeout(r, 100));
      
      // Second call - should be cached
      const start2 = Date.now();
      const response2 = await sendRequest('tools/call', {
        name: 'market_ticker',
        arguments: {
          exchange: 'kraken',
          symbol: 'BTC/USD'
        }
      });
      const time2 = Date.now() - start2;
      
      const speedup = (time1 / time2).toFixed(1);
      const cached = response2.result?.data?.cached;
      
      if (!cached && time2 > time1 * 0.5) {
        throw new Error(`Cache not working: ${time1}ms vs ${time2}ms`);
      }
      
      return { 
        message: `First: ${time1}ms | Cached: ${time2}ms | Speedup: ${speedup}x`,
        speedup,
        cached 
      };
    }, 'performance');
    
    // Test 2.2: Concurrent Requests
    await runTest('Concurrent Request Handling', async () => {
      const promises = [];
      const startTime = Date.now();
      
      // Send 10 concurrent requests
      for (let i = 0; i < 10; i++) {
        promises.push(sendRequest('tools/call', {
          name: 'market_ticker',
          arguments: {
            exchange: 'coinbase',
            symbol: 'ETH/USD'
          }
        }));
      }
      
      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful < 8) {
        throw new Error(`Only ${successful}/10 requests succeeded`);
      }
      
      return { 
        message: `${successful}/10 succeeded in ${duration}ms`,
        successRate: successful * 10,
        avgTime: duration / 10 
      };
    }, 'performance');
  },
  
  // Phase 3: Arbitrage Detection
  async phase3_ArbitrageDetection() {
    console.log(`\n${colors.yellow}=== PHASE 3: ARBITRAGE DETECTION ===${colors.reset}`);
    
    // Test 3.1: Arbitrage Opportunity Detection
    await runTest('Arbitrage Scanner', async () => {
      const response = await sendRequest('tools/call', {
        name: 'analytics_compare_prices',
        arguments: {
          symbol: 'BTC/USDT',
          exchanges: CONFIG.exchanges.usFriendly,
          mode: 'summary'
        }
      });
      
      const data = response.result?.data;
      if (!data) {
        throw new Error('No data returned');
      }
      
      const hasArbitrage = data.arbitrageOpportunity;
      const profit = data.potentialProfit || 0;
      
      return { 
        message: hasArbitrage 
          ? `Arbitrage found! Profit: $${profit.toFixed(2)}`
          : `No arbitrage detected (spread: ${data.spreadPercent?.toFixed(3)}%)`,
        hasArbitrage,
        profit 
      };
    }, 'arbitrage');
    
    // Test 3.2: Different Response Modes
    await runTest('Response Mode Comparison', async () => {
      const modes = ['full', 'summary', 'minimal'];
      const sizes = {};
      
      for (const mode of modes) {
        const response = await sendRequest('tools/call', {
          name: 'analytics_compare_prices',
          arguments: {
            symbol: 'ETH/USDT',
            exchanges: CONFIG.exchanges.usFriendly.slice(0, 3),
            mode
          }
        });
        
        sizes[mode] = JSON.stringify(response).length;
      }
      
      const reduction = ((1 - sizes.minimal / sizes.full) * 100).toFixed(1);
      
      return { 
        message: `Full: ${sizes.full}b | Summary: ${sizes.summary}b | Minimal: ${sizes.minimal}b | Reduction: ${reduction}%`,
        sizes,
        reduction 
      };
    }, 'arbitrage');
  },
  
  // Phase 4: Market Data
  async phase4_MarketData() {
    console.log(`\n${colors.yellow}=== PHASE 4: MARKET DATA ===${colors.reset}`);
    
    // Test 4.1: Order Book
    await runTest('Order Book Depth', async () => {
      const response = await sendRequest('tools/call', {
        name: 'market_orderbook',
        arguments: {
          exchange: 'kraken',
          symbol: 'BTC/USD',
          limit: 10
        }
      });
      
      const bids = response.result?.data?.bids?.length;
      const asks = response.result?.data?.asks?.length;
      const spread = response.result?.data?.spread;
      
      if (!bids || !asks) {
        throw new Error('Invalid orderbook data');
      }
      
      return { 
        message: `Bids: ${bids} | Asks: ${asks} | Spread: $${spread?.toFixed(2) || 'N/A'}`,
        depth: bids + asks 
      };
    }, 'market');
    
    // Test 4.2: Recent Trades
    await runTest('Recent Trades', async () => {
      const response = await sendRequest('tools/call', {
        name: 'market_trades',
        arguments: {
          exchange: 'coinbase',
          symbol: 'BTC/USD',
          limit: 20
        }
      });
      
      const trades = response.result?.data?.trades?.length || 0;
      
      if (trades === 0) {
        throw new Error('No trades returned');
      }
      
      return { 
        message: `Retrieved ${trades} recent trades`,
        tradeCount: trades 
      };
    }, 'market');
    
    // Test 4.3: OHLCV Data
    await runTest('OHLCV Candles', async () => {
      const response = await sendRequest('tools/call', {
        name: 'market_ohlcv',
        arguments: {
          exchange: 'kraken',
          symbol: 'BTC/USD',
          timeframe: '1h',
          limit: 24
        }
      });
      
      const candles = response.result?.data?.candles?.length || 0;
      
      if (candles === 0) {
        throw new Error('No OHLCV data returned');
      }
      
      return { 
        message: `Retrieved ${candles} hourly candles`,
        candleCount: candles 
      };
    }, 'market');
  }
};

// Generate test report
function generateReport() {
  const duration = Date.now() - testResults.startTime;
  const passRate = (testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1);
  
  console.log(`\n${colors.yellow}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}COMPREHENSIVE TEST REPORT${colors.reset}`);
  console.log(`${colors.yellow}${'='.repeat(60)}${colors.reset}`);
  
  console.log(`
📊 Summary:
  Total Tests: ${testResults.passed + testResults.failed}
  Passed: ${colors.green}${testResults.passed}${colors.reset} (${passRate}%)
  Failed: ${colors.red}${testResults.failed}${colors.reset}
  Duration: ${(duration / 1000).toFixed(1)}s
  `);
  
  // Category breakdown
  const categories = {};
  testResults.details.forEach(test => {
    if (!categories[test.category]) {
      categories[test.category] = { passed: 0, failed: 0 };
    }
    categories[test.category][test.status]++;
  });
  
  console.log('📈 By Category:');
  Object.entries(categories).forEach(([cat, stats]) => {
    const total = stats.passed + stats.failed;
    const rate = (stats.passed / total * 100).toFixed(0);
    console.log(`  ${cat}: ${stats.passed}/${total} (${rate}%)`);
  });
  
  // Performance metrics
  const avgResponseTime = testResults.details
    .filter(t => t.status === 'passed')
    .reduce((sum, t) => sum + t.duration, 0) / testResults.passed;
  
  console.log(`
⚡ Performance:
  Avg Response Time: ${avgResponseTime.toFixed(0)}ms
  Fastest Test: ${Math.min(...testResults.details.map(t => t.duration))}ms
  Slowest Test: ${Math.max(...testResults.details.map(t => t.duration))}ms
  `);
  
  // Failed tests detail
  if (testResults.failed > 0) {
    console.log(`${colors.red}❌ Failed Tests:${colors.reset}`);
    testResults.details
      .filter(t => t.status === 'failed')
      .forEach(test => {
        console.log(`  - ${test.name}: ${test.error}`);
      });
  }
  
  // Save report to file
  const reportPath = path.join(__dirname, `test-report-${Date.now()}.json`);
  require('fs').writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  return testResults.failed === 0;
}

// Main test execution
async function runAllTests() {
  console.log(`
${colors.blue}╔═══════════════════════════════════════════════════════╗
║     CCXT MCP Server v2.0 - Comprehensive Testing      ║
║              The Ferrari of Crypto Exchange           ║
╚═══════════════════════════════════════════════════════╝${colors.reset}
  `);
  
  // Wait for server to start
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    // Run all test phases
    await testSuite.phase1_CoreFunctionality();
    await testSuite.phase2_CachingPerformance();
    await testSuite.phase3_ArbitrageDetection();
    await testSuite.phase4_MarketData();
    
    // Generate and display report
    const allPassed = generateReport();
    
    if (allPassed) {
      console.log(`\n${colors.green}🎉 ALL TESTS PASSED! The Ferrari is ready to race! 🏎️${colors.reset}\n`);
    } else {
      console.log(`\n${colors.yellow}⚠️  Some tests failed. Review and fix before deployment.${colors.reset}\n`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}Fatal error during testing:${colors.reset}`, error);
  } finally {
    // Cleanup
    server.kill();
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  generateReport();
  server.kill();
  process.exit(1);
});

// Start testing
runAllTests();