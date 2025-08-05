/**
 * Advanced Arbitrage Scanner
 * Our SECRET WEAPON - No competitor has this!
 * Finds profitable arbitrage opportunities with risk scoring and execution paths
 */

// Constants for arbitrage calculations
const NEUTRAL_RISK_SCORE = 5;
const BASE_CONFIDENCE = 50;
const FRACTIONAL_KELLY = 0.25;

import { marketDataCache } from '../cache/lru-cache-manager.js';
import { adaptiveRateLimiter } from '../rate-limiting/adaptive-limiter.js';
import { exchangeManager } from '../exchange-manager.js';
import { calculateArbitrageFees } from '../config/exchange-fees.js';

export interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  potentialProfit: number;
  volume: {
    available: number;
    optimal: number;
  };
  fees: {
    buyFee: number;
    sellFee: number;
    withdrawalFee: number;
    totalFees: number;
  };
  netProfit: number;
  netProfitPercent: number;
  riskScore: number;
  executionTime: number;
  confidence: number;
  executionPath: string[];
  warnings: string[];
}

export interface ScannerConfig {
  minProfitPercent: number;
  maxRiskScore: number;
  minVolume: number;
  includeWithdrawalFees: boolean;
  includeTradingFees: boolean;
  scanInterval: number;
  exchanges?: string[];
  symbols?: string[];
}

export class AdvancedArbitrageScanner {
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private scannerRunning: boolean = false;
  private lastScanTime: Date | null = null;
  
  private readonly defaultConfig: ScannerConfig = {
    minProfitPercent: 0.1,  // 0.1% minimum profit
    maxRiskScore: 7,        // Max risk score (1-10)
    minVolume: 100,         // Minimum $100 volume
    includeWithdrawalFees: true,
    includeTradingFees: true,
    scanInterval: 5000,     // 5 seconds
    exchanges: ['binance', 'coinbase', 'kraken', 'okx', 'gateio', 'kucoin'],
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
  };
  
  /**
   * Scan for arbitrage opportunities across multiple exchanges
   */
  async scanForArbitrage(
    symbol: string,
    exchanges: string[],
    config: Partial<ScannerConfig> = {}
  ): Promise<ArbitrageOpportunity[]> {
    const cfg = { ...this.defaultConfig, ...config };
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Fetch prices from all exchanges in parallel
    const priceData = await this.fetchPricesFromExchanges(symbol, exchanges);
    
    // Find all possible arbitrage pairs
    for (let i = 0; i < priceData.length; i++) {
      for (let j = 0; j < priceData.length; j++) {
        if (i === j) continue;
        
        const buyExchange = priceData[i];
        const sellExchange = priceData[j];

        // Check for arbitrage opportunity (buy low, sell high)
        // Ensure ticker data is valid before comparison
        if (buyExchange.ask && sellExchange.bid &&
            buyExchange.ask > 0 && sellExchange.bid > 0 &&
            buyExchange.ask < sellExchange.bid) {
          const opportunity = await this.analyzeOpportunity(
            symbol,
            buyExchange,
            sellExchange,
            cfg
          );
          
          if (opportunity && this.meetsThreshold(opportunity, cfg)) {
            opportunities.push(opportunity);
          }
        }
      }
    }
    
    // Sort by net profit
    opportunities.sort((a, b) => b.netProfit - a.netProfit);
    
    // Store opportunities
    opportunities.forEach(opp => {
      this.opportunities.set(opp.id, opp);
    });
    
    this.lastScanTime = new Date();
    
    return opportunities;
  }
  
  /**
   * Continuous scanner that runs in background
   */
  async startContinuousScanning(config: Partial<ScannerConfig> = {}): Promise<void> {
    if (this.scannerRunning) {
      throw new Error('Scanner is already running');
    }
    
    const cfg = { ...this.defaultConfig, ...config };
    this.scannerRunning = true;

    console.error('🔍 Starting continuous arbitrage scanning...');
    
    while (this.scannerRunning) {
      try {
        for (const symbol of cfg.symbols!) {
          const opportunities = await this.scanForArbitrage(
            symbol,
            cfg.exchanges!,
            cfg
          );
          
          if (opportunities.length > 0) {
            console.error(`💰 Found ${opportunities.length} opportunities for ${symbol}`);
            opportunities.slice(0, 3).forEach(opp => {
              console.error(
                `  ${opp.buyExchange} → ${opp.sellExchange}: ` +
                `$${opp.netProfit.toFixed(2)} (${opp.netProfitPercent.toFixed(3)}%)`
              );
            });
          }
        }
      } catch (error) {
        console.error('Scanner error:', error);
      }
      
      // Wait before next scan
      await this.sleep(cfg.scanInterval);
    }
  }
  
  /**
   * Stop continuous scanning
   */
  stopScanning(): void {
    this.scannerRunning = false;
    console.error('🛑 Stopping arbitrage scanner...');
  }
  
  /**
   * Fetch prices from multiple exchanges
   */
  private async fetchPricesFromExchanges(
    symbol: string,
    exchanges: string[]
  ): Promise<any[]> {
    const results = await adaptiveRateLimiter.executeBatch(
      exchanges.map(exchange => ({
        exchangeId: exchange,
        operation: async () => {
          // Check cache first
          const cached = marketDataCache.getTicker(exchange, symbol);
          if (cached) {
            return { exchange, ...cached, fromCache: true };
          }

          // Fetch from real exchange using exchange manager
          const exchangeInstance = await exchangeManager.getExchange(exchange);

          if (!exchangeInstance.has['fetchTicker']) {
            throw new Error(`Exchange ${exchange} does not support fetching tickers`);
          }

          const tickerData = await exchangeInstance.fetchTicker(symbol);

          const ticker = {
            exchange,
            symbol: tickerData.symbol,
            bid: tickerData.bid,
            ask: tickerData.ask,
            last: tickerData.last,
            volume: tickerData.baseVolume || 0,
            timestamp: tickerData.timestamp || Date.now()
          };

          // Cache the result
          marketDataCache.setTicker(exchange, symbol, ticker);

          return ticker;
        },
        context: `Fetching ${symbol} ticker`
      }))
    );
    
    return results
      .filter(r => r.success)
      .map(r => r.result);
  }
  
  /**
   * Analyze a potential arbitrage opportunity
   */
  private async analyzeOpportunity(
    symbol: string,
    buyExchange: any,
    sellExchange: any,
    config: ScannerConfig
  ): Promise<ArbitrageOpportunity | null> {
    const spread = sellExchange.bid - buyExchange.ask;
    const spreadPercent = buyExchange.ask > 0 ? (spread / buyExchange.ask) * 100 : 0;
    
    // Calculate fees with exchange-specific rates
    const fees = this.calculateFees(
      buyExchange,
      sellExchange,
      buyExchange.ask,
      sellExchange.bid,
      config
    );
    
    // Calculate net profit
    const netProfit = spread - fees.totalFees;
    const netProfitPercent = (netProfit / buyExchange.ask) * 100;
    
    // Skip if not profitable after fees
    if (netProfit <= 0) {
      return null;
    }
    
    // Calculate available volume - require valid volume data
    if (!buyExchange.volume || !sellExchange.volume ||
        buyExchange.volume <= 0 || sellExchange.volume <= 0) {
      return null; // Skip if volume data unavailable or invalid
    }
    const availableVolume = Math.min(buyExchange.volume, sellExchange.volume);
    
    // Calculate risk score
    const riskScore = this.calculateRiskScore(
      buyExchange,
      sellExchange,
      spreadPercent,
      availableVolume
    );
    
    // Generate execution path
    const executionPath = this.generateExecutionPath(
      symbol,
      buyExchange.exchange,
      sellExchange.exchange
    );
    
    // Calculate confidence
    const confidence = this.calculateConfidence(
      spreadPercent,
      availableVolume,
      riskScore,
      buyExchange.fromCache,
      sellExchange.fromCache
    );
    
    const opportunity: ArbitrageOpportunity = {
      id: `${symbol}-${buyExchange.exchange}-${sellExchange.exchange}-${Date.now()}`,
      symbol,
      buyExchange: buyExchange.exchange,
      sellExchange: sellExchange.exchange,
      buyPrice: buyExchange.ask,
      sellPrice: sellExchange.bid,
      spread,
      spreadPercent,
      potentialProfit: spread * availableVolume,
      volume: {
        available: availableVolume,
        optimal: this.calculateOptimalVolume(availableVolume, riskScore)
      },
      fees,
      netProfit: netProfit * availableVolume,
      netProfitPercent,
      riskScore,
      executionTime: this.estimateExecutionTime(buyExchange.exchange, sellExchange.exchange),
      confidence,
      executionPath,
      warnings: this.generateWarnings(
        buyExchange,
        sellExchange,
        spreadPercent,
        riskScore
      )
    };
    
    return opportunity;
  }
  
  /**
   * Calculate all fees involved using exchange-specific fee structures
   */
  private calculateFees(
    buyExchange: any,
    sellExchange: any,
    buyPrice: number,
    sellPrice: number,
    config: ScannerConfig
  ): any {
    // Use real exchange-specific fees instead of hardcoded values
    const fees = calculateArbitrageFees(
      buyExchange.exchange,
      sellExchange.exchange,
      buyPrice,
      sellPrice,
      config.includeWithdrawalFees
    );

    // Override if config says to exclude certain fees
    return {
      buyFee: config.includeTradingFees ? fees.buyFee : 0,
      sellFee: config.includeTradingFees ? fees.sellFee : 0,
      withdrawalFee: config.includeWithdrawalFees ? fees.withdrawalFee : 0,
      totalFees: (config.includeTradingFees ? fees.buyFee + fees.sellFee : 0) +
                 (config.includeWithdrawalFees ? fees.withdrawalFee : 0)
    };
  }
  
  /**
   * Calculate risk score (1-10)
   */
  private calculateRiskScore(
    buyExchange: any,
    sellExchange: any,
    spreadPercent: number,
    volume: number
  ): number {
    // Risk score ranges from 1 (lowest risk) to 10 (highest risk)
    // Used to determine position sizing and opportunity viability
    let score = NEUTRAL_RISK_SCORE; // Start with neutral risk

    // Spread analysis: Tighter spreads have higher execution risk
    // Very tight spreads (<0.5%) can disappear before execution
    if (spreadPercent < 0.5) score += 2;       // High risk: spread may close quickly
    else if (spreadPercent < 1) score += 1;    // Moderate risk: narrow window
    else if (spreadPercent > 2) score -= 1;    // Lower risk: comfortable margin

    // Volume analysis: Low liquidity increases slippage risk
    // Need sufficient depth to execute without moving the market
    if (volume < 1000) score += 2;             // High risk: may face liquidity issues
    else if (volume < 10000) score += 1;       // Moderate risk: limited liquidity
    else if (volume > 100000) score -= 1;      // Lower risk: deep liquidity

    // Data freshness: Cached prices may be stale
    // Real-time data is more reliable for fast-moving markets
    if (buyExchange.fromCache) score += 0.5;   // Slightly higher risk: prices may have changed
    if (sellExchange.fromCache) score += 0.5;

    // Clamp score to valid range [1, 10]
    return Math.max(1, Math.min(10, score));
  }
  
  /**
   * Calculate confidence score (0-100)
   */
  private calculateConfidence(
    spreadPercent: number,
    volume: number,
    riskScore: number,
    buyFromCache: boolean,
    sellFromCache: boolean
  ): number {
    let confidence = BASE_CONFIDENCE; // Base confidence
    
    // Higher spread = higher confidence
    confidence += spreadPercent * 10;
    
    // Lower risk = higher confidence
    confidence += (10 - riskScore) * 5;
    
    // Higher volume = higher confidence
    if (volume > 10000) confidence += 10;
    if (volume > 100000) confidence += 10;
    
    // Fresh data = higher confidence
    if (!buyFromCache) confidence += 5;
    if (!sellFromCache) confidence += 5;
    
    return Math.max(0, Math.min(100, confidence));
  }
  
  /**
   * Calculate optimal trading volume based on risk
   */
  private calculateOptimalVolume(availableVolume: number, riskScore: number): number {
    // Kelly Criterion-inspired position sizing for risk management
    // Kelly formula determines optimal bet size based on edge and odds
    // We use a fractional Kelly for conservative position sizing

    // Convert risk score (1-10) to risk factor (0.9-0.0)
    // Lower risk score = higher risk factor = larger position size
    const riskFactor = (10 - riskScore) / 10;

    // Apply conservative fractional Kelly multiplier to avoid overexposure
    // Full Kelly can be aggressive; fractional Kelly reduces volatility
    // Result: High confidence (low risk) = larger position, High risk = smaller position
    return availableVolume * riskFactor * FRACTIONAL_KELLY;
  }
  
  /**
   * Generate execution path
   */
  private generateExecutionPath(
    symbol: string,
    buyExchange: string,
    sellExchange: string
  ): string[] {
    return [
      `1. Place buy order for ${symbol} on ${buyExchange}`,
      `2. Wait for order fill confirmation`,
      `3. Withdraw to ${sellExchange} (if different network)`,
      `4. Wait for deposit confirmation`,
      `5. Place sell order on ${sellExchange}`,
      `6. Wait for order fill confirmation`,
      `7. Calculate final profit/loss`
    ];
  }
  
  /**
   * Estimate execution time in seconds
   */
  private estimateExecutionTime(buyExchange: string, sellExchange: string): number {
    // Base time for trades
    let time = 10; // 10 seconds for orders
    
    // Add withdrawal time if different exchanges
    if (buyExchange !== sellExchange) {
      time += 600; // 10 minutes for withdrawal/deposit
    }
    
    return time;
  }
  
  /**
   * Generate warnings for the opportunity
   */
  private generateWarnings(
    buyExchange: any,
    sellExchange: any,
    spreadPercent: number,
    riskScore: number
  ): string[] {
    const warnings: string[] = [];
    
    if (spreadPercent < 0.5) {
      warnings.push('Very tight spread - high execution risk');
    }
    
    if (riskScore > 7) {
      warnings.push('High risk score - proceed with caution');
    }
    
    if (buyExchange.fromCache || sellExchange.fromCache) {
      warnings.push('Using cached data - prices may have changed');
    }
    
    if (buyExchange.volume < 1000 || sellExchange.volume < 1000) {
      warnings.push('Low volume - may face liquidity issues');
    }
    
    return warnings;
  }
  
  /**
   * Check if opportunity meets threshold
   */
  private meetsThreshold(
    opportunity: ArbitrageOpportunity,
    config: ScannerConfig
  ): boolean {
    return (
      opportunity.netProfitPercent >= config.minProfitPercent &&
      opportunity.riskScore <= config.maxRiskScore &&
      opportunity.volume.available >= config.minVolume
    );
  }
  
  /**
   * Get all current opportunities
   */
  getOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.opportunities.values())
      .sort((a, b) => b.netProfit - a.netProfit);
  }
  
  /**
   * Clear old opportunities
   */
  clearOldOpportunities(maxAge: number = 300000): void { // 5 minutes default
    const now = Date.now();
    
    for (const [id] of this.opportunities) {
      const age = now - parseInt(id.split('-').pop()!);
      if (age > maxAge) {
        this.opportunities.delete(id);
      }
    }
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get scanner statistics
   */
  getStats(): any {
    return {
      isRunning: this.scannerRunning,
      lastScanTime: this.lastScanTime,
      totalOpportunities: this.opportunities.size,
      topOpportunity: this.getOpportunities()[0] || null
    };
  }
}

// Export singleton instance
export const arbitrageScanner = new AdvancedArbitrageScanner();