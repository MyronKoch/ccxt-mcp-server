#!/usr/bin/env node
/**
 * Direct CCXT test to verify VPN is working
 */

import ccxt from 'ccxt';

async function testExchanges() {
  console.log('🌍 Testing exchanges with VPN from Netherlands...\n');
  
  // Test Binance
  console.log('1️⃣ Testing Binance...');
  try {
    const binance = new ccxt.binance({ enableRateLimit: true });
    const ticker = await binance.fetchTicker('BTC/USDT');
    console.log('✅ Binance works!');
    console.log(`   BTC/USDT: $${ticker.last.toFixed(2)}`);
    console.log(`   Bid: $${ticker.bid.toFixed(2)} | Ask: $${ticker.ask.toFixed(2)}\n`);
  } catch (error) {
    console.log('❌ Binance failed:', error.message.substring(0, 100), '\n');
  }
  
  // Test Bybit
  console.log('2️⃣ Testing Bybit...');
  try {
    const bybit = new ccxt.bybit({ enableRateLimit: true });
    const ticker = await bybit.fetchTicker('BTC/USDT');
    console.log('✅ Bybit works!');
    console.log(`   BTC/USDT: $${ticker.last.toFixed(2)}`);
    console.log(`   Bid: $${ticker.bid.toFixed(2)} | Ask: $${ticker.ask.toFixed(2)}\n`);
  } catch (error) {
    console.log('❌ Bybit failed:', error.message.substring(0, 100), '\n');
  }
  
  // Test multiple exchanges for arbitrage
  console.log('3️⃣ Testing arbitrage across multiple exchanges...');
  const exchanges = ['binance', 'bybit', 'kraken', 'coinbase', 'okx', 'gateio'];
  const results = [];
  
  for (const exchangeId of exchanges) {
    try {
      const ExchangeClass = ccxt[exchangeId];
      const exchange = new ExchangeClass({ enableRateLimit: true });
      
      // Skip if not available
      if (!exchange.has.fetchTicker) continue;
      
      const ticker = await exchange.fetchTicker('BTC/USDT');
      results.push({
        exchange: exchangeId,
        bid: ticker.bid,
        ask: ticker.ask,
        last: ticker.last
      });
      console.log(`   ${exchangeId}: $${ticker.last?.toFixed(2) || 'N/A'}`);
    } catch (error) {
      console.log(`   ${exchangeId}: Failed - ${error.message.substring(0, 50)}`);
    }
  }
  
  // Calculate arbitrage
  if (results.length > 1) {
    const lowestAsk = results
      .filter(r => r.ask)
      .sort((a, b) => a.ask - b.ask)[0];
    
    const highestBid = results
      .filter(r => r.bid)
      .sort((a, b) => b.bid - a.bid)[0];
    
    if (lowestAsk && highestBid) {
      console.log('\n📊 Arbitrage Analysis:');
      console.log(`   Best Buy: ${lowestAsk.exchange} @ $${lowestAsk.ask.toFixed(2)}`);
      console.log(`   Best Sell: ${highestBid.exchange} @ $${highestBid.bid.toFixed(2)}`);
      
      if (highestBid.bid > lowestAsk.ask) {
        const profit = highestBid.bid - lowestAsk.ask;
        const profitPercent = (profit / lowestAsk.ask) * 100;
        console.log(`   🎯 ARBITRAGE OPPORTUNITY!`);
        console.log(`   💰 Profit: $${profit.toFixed(2)} (${profitPercent.toFixed(3)}%)`);
      } else {
        console.log(`   ❌ No arbitrage opportunity`);
      }
    }
  }
}

testExchanges().then(() => {
  console.log('\n✅ Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});