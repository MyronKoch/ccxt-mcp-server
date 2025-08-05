#!/usr/bin/env node
/**
 * VPN Test - Test Binance, Bybit and other geo-blocked exchanges
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
        console.log('\n✅ Success:', response.result.name || 'Operation completed');
        
        if (response.result.data) {
          const data = response.result.data;
          
          // Summary mode response
          if (data.topBid && data.topAsk) {
            console.log('📊 Arbitrage Summary:');
            console.log(`  Best Buy: ${data.topAsk.exchange} @ $${data.topAsk.price.toFixed(2)}`);
            console.log(`  Best Sell: ${data.topBid.exchange} @ $${data.topBid.price.toFixed(2)}`);
            console.log(`  Spread: ${data.spreadPercent.toFixed(2)}%`);
            
            if (data.arbitrageOpportunity) {
              console.log(`  🎯 ARBITRAGE OPPORTUNITY FOUND!`);
              console.log(`  💰 Potential Profit: $${data.potentialProfit.toFixed(2)}`);
            }
            console.log(`  Exchanges: ${data.exchangeCount}`);
          }
          // Ticker response
          else if (data.bid && data.ask) {
            console.log(`  Price: $${data.last || 'N/A'}`);
            console.log(`  Bid: $${data.bid} | Ask: $${data.ask}`);
            console.log(`  Volume: ${data.baseVolume || 'N/A'}`);
            if (data.cached) {
              console.log(`  💾 CACHED (age: ${data.cacheAge}ms)`);
            }
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
  if (!msg.includes('Running on stdio') && !msg.includes('Supporting 106')) {
    console.error('Server:', msg.substring(0, 200));
  }
});

// Run tests after server starts
setTimeout(async () => {
  console.log('🚀 VPN Test - Testing Binance, Bybit and More!\n');
  console.log('=' .repeat(50));
  
  // Test 1: Binance ticker
  console.log('\n📝 Test 1: Binance BTC/USDT ticker');
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'binance',
      symbol: 'BTC/USDT'
    }
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Test 2: Bybit ticker
  console.log('\n📝 Test 2: Bybit BTC/USDT ticker');
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'bybit',
      symbol: 'BTC/USDT'
    }
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Test 3: Big arbitrage test with Binance included
  console.log('\n📝 Test 3: Arbitrage scan across 12 exchanges (including Binance & Bybit)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'BTC/USDT',
      exchanges: [
        'binance', 'bybit', 'okx', 'gateio', 'kucoin',
        'kraken', 'coinbase', 'bitget', 'mexc', 'bitmart',
        'phemex', 'huobi'
      ],
      mode: 'summary',
      maxExchanges: 12
    }
  });
  
  await new Promise(r => setTimeout(r, 6000));
  
  // Test 4: ETH arbitrage
  console.log('\n📝 Test 4: ETH/USDT arbitrage (Binance vs Others)');
  sendRequest('tools/call', {
    name: 'analytics_compare_prices',
    arguments: {
      symbol: 'ETH/USDT',
      exchanges: ['binance', 'bybit', 'okx', 'gateio', 'kucoin'],
      mode: 'summary'
    }
  });
  
  await new Promise(r => setTimeout(r, 4000));
  
  // Test 5: Test caching on Binance
  console.log('\n📝 Test 5: Binance cache test (2 calls)');
  
  // First call
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'binance',
      symbol: 'ETH/USDT'
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Second call - should be cached
  console.log('  (Second call - should be cached)');
  sendRequest('tools/call', {
    name: 'market_ticker',
    arguments: {
      exchange: 'binance',
      symbol: 'ETH/USDT'
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ VPN tests complete! Binance and Bybit should work now.');
  console.log('=' .repeat(50));
  
  setTimeout(() => {
    console.log('\n🏁 Shutting down...');
    server.kill();
    process.exit(0);
  }, 3000);
  
}, 2000);

// Handle exit
process.on('SIGINT', () => {
  console.log('\nShutting down test...');
  server.kill();
  process.exit(0);
});