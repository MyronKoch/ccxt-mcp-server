#!/usr/bin/env node
/**
 * Test script for CCXT MCP Server v2.0
 * Tests the new features: pagination, summary modes, and multi-exchange handling
 */

const { spawn } = require('child_process');
const path = require('path');

// Start the MCP server
const serverPath = path.join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let messageId = 1;

// Helper to send JSON-RPC request
function sendRequest(method, params) {
  const request = {
    jsonrpc: '2.0',
    id: messageId++,
    method,
    params
  };
  
  const message = JSON.stringify(request);
  server.stdin.write(message + '\n');
}

// Helper to parse responses
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      if (response.result) {
        console.log('\n✅ Success:', response.result.name || response.method);
        
        // Pretty print based on content type
        if (response.result.data) {
          const data = response.result.data;
          
          // Summary mode response
          if (data.topBid && data.topAsk) {
            console.log('📊 Summary Mode Response:');
            console.log(`  Best Buy: ${data.topAsk.exchange} @ $${data.topAsk.price}`);
            console.log(`  Best Sell: ${data.topBid.exchange} @ $${data.topBid.price}`);
            console.log(`  Arbitrage: ${data.arbitrageOpportunity ? '✅ YES' : '❌ NO'}`);
            if (data.arbitrageOpportunity) {
              console.log(`  Potential Profit: $${data.potentialProfit.toFixed(2)}`);
            }
            console.log(`  Exchanges Checked: ${data.exchangeCount}`);
          }
          // Minimal mode response
          else if (data.bestBuy && data.bestSell) {
            console.log('🔍 Minimal Mode Response:');
            console.log(`  Best Buy: ${data.bestBuy.exchange} @ $${data.bestBuy.price}`);
            console.log(`  Best Sell: ${data.bestSell.exchange} @ $${data.bestSell.price}`);
            console.log(`  Profit: $${data.profit.toFixed(2)}`);
          }
          // Paginated response
          else if (response.result.pagination) {
            console.log('📄 Paginated Response:');
            console.log(`  Page ${response.result.pagination.page}/${response.result.pagination.totalPages}`);
            console.log(`  Items: ${response.result.data.length} of ${response.result.pagination.totalItems}`);
          }
          // Cache stats
          else if (data.ticker && data.orderBook) {
            console.log('💾 Cache Statistics:');
            console.log(`  Ticker Cache: ${data.ticker.size} items`);
            console.log(`  OrderBook Cache: ${data.orderBook.size} items`);
            console.log(`  OHLCV Cache: ${data.ohlcv.size} items`);
            console.log(`  Market Cache: ${data.market.size} items`);
          }
          // Regular data
          else {
            console.log('Data:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
          }
        }
      } else if (response.error) {
        console.error('❌ Error:', response.error.message);
      }
    } catch (e) {
      // Skip non-JSON lines
    }
  }
});

server.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Running on stdio')) {
    console.error('Server error:', msg);
  }
});

// Run tests after server starts
setTimeout(async () => {
  console.log('🚀 Starting CCXT MCP Server v2.0 Tests\n');
  console.log('=' . repeat(50));
  
  // Test 1: Verify exchange count
  console.log('\n📝 Test 1: Verify Exchange Count');
  sendRequest('tools/list', {});
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: Initialize server
  console.log('\n📝 Test 2: Initialize Server');
  sendRequest('initialize', {});
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: Test summary mode with 10 exchanges
  console.log('\n📝 Test 3: Compare BTC/USDT across 10 exchanges (Summary Mode)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'BTC/USDT',
      exchanges: ['kraken', 'coinbase', 'bybit', 'okx', 'gateio', 'kucoin', 'bitget', 'mexc', 'bitmart', 'phemex'],
      mode: 'summary',
      maxExchanges: 10
    }
  });
  
  await new Promise(r => setTimeout(r, 5000));
  
  // Test 4: Test minimal mode  
  console.log('\n📝 Test 4: Compare ETH/USDT (Minimal Mode)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'ETH/USDT',
      exchanges: ['kraken', 'coinbase', 'bybit', 'okx', 'gateio'],
      mode: 'minimal'
    }
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Test 5: Test pagination with full mode
  console.log('\n📝 Test 5: Compare SOL/USDT with pagination (Full Mode, Page 1)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'SOL/USDT',
      exchanges: ['kraken', 'coinbase', 'bybit', 'okx', 'gateio', 'kucoin', 'bitget'],
      mode: 'full',
      page: 1,
      pageSize: 3
    }
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Test 6: Test ticker caching
  console.log('\n📝 Test 6: Test Ticker Caching (2 calls, 2nd should be cached)');
  
  // First call - not cached
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'kraken',
      symbol: 'BTC/USD'
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Second call - should be cached
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'kraken',
      symbol: 'BTC/USD'
    }
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 7: Large exchange test
  console.log('\n📝 Test 7: Stress test with 15 exchanges (should limit to 10)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'BTC/USDT',
      exchanges: [
        'kraken', 'coinbase', 'bybit', 'okx', 'gateio', 
        'kucoin', 'bitget', 'mexc', 'bitmart', 'phemex',
        'huobi', 'bingx', 'bitfinex', 'bitstamp', 'gemini'
      ],
      mode: 'summary',
      maxExchanges: 10
    }
  });
  
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('\n' + '=' . repeat(50));
  console.log('✅ All tests submitted! Check results above.');
  console.log('=' . repeat(50));
  
  // Give time for final responses
  setTimeout(() => {
    console.log('\n🏁 Test suite complete. Shutting down...');
    server.kill();
    process.exit(0);
  }, 10000);
  
}, 2000);

// Handle exit
process.on('SIGINT', () => {
  console.log('\nShutting down test...');
  server.kill();
  process.exit(0);
});