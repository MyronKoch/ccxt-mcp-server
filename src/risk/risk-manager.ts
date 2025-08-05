/**
 * Risk Management System
 * Implements lazy-dinosaur's advanced risk calculations
 * Including Kelly Criterion, position sizing, and dynamic stop-loss
 */

// Constants for risk calculations
const TRADING_DAYS_PER_YEAR = 252;
const MAX_PROFIT_LOSS_RATIO = 999;
const FRACTIONAL_KELLY_DIVISOR = 4; // Conservative Kelly (1/4)
const MAX_KELLY_PERCENT = 0.25; // Never bet more than 25%

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  amount: number;
  profit?: number;
  profitPercent?: number;
  timestamp: Date;
  exchange: string;
}

export interface TradePerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitLossRatio: number;
  sharpeRatio: number;
  maxDrawdown: number;
  expectancy: number;
  kellyPercent: number;
}

export interface PositionSize {
  amount: number;
  value: number;
  percentOfCapital: number;
  riskAmount: number;
  stopLoss?: number;
  takeProfit?: number;
}

export class RiskManager {
  private trades: Trade[] = [];
  private readonly maxRiskPerTrade: number = 0.02; // 2% max risk per trade
  private readonly maxPortfolioRisk: number = 0.06; // 6% total portfolio risk
  
  /**
   * Calculate comprehensive trade performance metrics
   */
  calculatePerformance(trades: Trade[] = this.trades): TradePerformance {
    if (trades.length === 0) {
      return this.getEmptyPerformance();
    }
    
    const completedTrades = trades.filter(t => t.profit !== undefined);
    const winningTrades = completedTrades.filter(t => t.profit! > 0);
    const losingTrades = completedTrades.filter(t => t.profit! < 0);
    
    const winRate = (winningTrades.length / completedTrades.length) * 100;
    
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.profit!, 0) / winningTrades.length
      : 0;
      
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit!, 0) / losingTrades.length)
      : 0;

    // Cap profit/loss ratio to prevent Infinity propagation
    const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? MAX_PROFIT_LOSS_RATIO : 0;
    
    // Calculate expectancy (average profit per trade)
    const expectancy = this.calculateExpectancy(winRate / 100, avgWin, avgLoss);
    
    // Calculate Sharpe Ratio
    const sharpeRatio = this.calculateSharpeRatio(completedTrades);
    
    // Calculate Maximum Drawdown
    const maxDrawdown = this.calculateMaxDrawdown(completedTrades);
    
    // Calculate Kelly Criterion
    const kellyPercent = this.calculateKellyPercent(winRate / 100, profitLossRatio);
    
    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin,
      avgLoss,
      profitLossRatio,
      sharpeRatio,
      maxDrawdown,
      expectancy,
      kellyPercent
    };
  }
  
  /**
   * Calculate position size using Kelly Criterion with safety adjustments
   */
  calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    winRate: number,
    avgWin: number,
    avgLoss: number,
    volatility: number = 0.02,
    stopLossPercent: number = 0.02,
    takeProfitRatio: number = 2
  ): PositionSize {
    // Validate inputs are positive and finite
    if (accountBalance <= 0 || entryPrice <= 0 || !isFinite(accountBalance) || !isFinite(entryPrice)) {
      throw new Error('Account balance and entry price must be positive and finite');
    }
    if (winRate < 0 || winRate > 100) {
      throw new Error('Win rate must be between 0 and 100');
    }
    if (avgLoss < 0 || avgWin < 0 || !isFinite(avgWin) || !isFinite(avgLoss)) {
      throw new Error('Average win and loss must be non-negative and finite');
    }

    // Kelly Formula: f = (p * b - q) / b
    // where f = fraction to bet, p = win probability, q = loss probability, b = odds
    const p = winRate / 100;
    const q = 1 - p;
    const b = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? MAX_PROFIT_LOSS_RATIO : 1);

    let kellyPercent = avgLoss > 0 ? (p * b - q) / b : 0;

    // Adjust for volatility (higher volatility = smaller position)
    kellyPercent = kellyPercent / (1 + volatility * 10);

    // Apply safety factor (fractional Kelly for conservative approach)
    kellyPercent = kellyPercent / FRACTIONAL_KELLY_DIVISOR;

    // Never risk more than maxRiskPerTrade
    kellyPercent = Math.min(kellyPercent, this.maxRiskPerTrade);

    // Never go negative or above maximum
    kellyPercent = Math.max(0, Math.min(kellyPercent, MAX_KELLY_PERCENT));
    
    const positionValue = accountBalance * kellyPercent;
    const amount = positionValue / entryPrice;
    const riskAmount = positionValue * stopLossPercent;
    
    // Calculate stop loss and take profit prices
    const stopLoss = entryPrice * (1 - stopLossPercent);
    const takeProfit = entryPrice * (1 + stopLossPercent * takeProfitRatio);
    
    return {
      amount,
      value: positionValue,
      percentOfCapital: kellyPercent * 100,
      riskAmount,
      stopLoss,
      takeProfit
    };
  }
  
  /**
   * Calculate dynamic stop-loss based on ATR (Average True Range)
   */
  calculateDynamicStopLoss(
    entryPrice: number,
    atr: number,
    multiplier: number = 2,
    side: 'buy' | 'sell' = 'buy'
  ): number {
    if (side === 'buy') {
      return entryPrice - (atr * multiplier);
    } else {
      return entryPrice + (atr * multiplier);
    }
  }
  
  /**
   * Calculate dynamic take-profit based on risk-reward ratio
   */
  calculateDynamicTakeProfit(
    entryPrice: number,
    stopLoss: number,
    riskRewardRatio: number = 2,
    side: 'buy' | 'sell' = 'buy'
  ): number {
    const risk = Math.abs(entryPrice - stopLoss);
    
    if (side === 'buy') {
      return entryPrice + (risk * riskRewardRatio);
    } else {
      return entryPrice - (risk * riskRewardRatio);
    }
  }
  
  /**
   * Calculate expectancy (average expected profit per trade)
   */
  private calculateExpectancy(winRate: number, avgWin: number, avgLoss: number): number {
    return (winRate * avgWin) - ((1 - winRate) * avgLoss);
  }
  
  /**
   * Calculate Sharpe Ratio (risk-adjusted returns)
   */
  private calculateSharpeRatio(trades: Trade[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.profitPercent || 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;

    // Annualized Sharpe Ratio (assuming daily trades)
    const annualizedReturn = avgReturn * TRADING_DAYS_PER_YEAR;
    const annualizedStdDev = stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR);

    return annualizedReturn / annualizedStdDev;
  }
  
  /**
   * Calculate Maximum Drawdown
   */
  private calculateMaxDrawdown(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    
    let peak = 0;
    let maxDrawdown = 0;
    let runningBalance = 0;
    
    for (const trade of trades) {
      runningBalance += trade.profit || 0;
      
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      
      const drawdown = peak - runningBalance;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      
      if (drawdownPercent > maxDrawdown) {
        maxDrawdown = drawdownPercent;
      }
    }
    
    return maxDrawdown;
  }
  
  /**
   * Calculate Kelly Criterion percentage
   */
  private calculateKellyPercent(winRate: number, profitLossRatio: number): number {
    if (profitLossRatio === 0) return 0;

    const kellyPercent = (winRate * profitLossRatio - (1 - winRate)) / profitLossRatio;

    // Conservative Kelly (fractional for safety)
    return Math.max(0, Math.min(kellyPercent / FRACTIONAL_KELLY_DIVISOR, MAX_KELLY_PERCENT)) * 100;
  }
  
  /**
   * Get empty performance metrics
   */
  private getEmptyPerformance(): TradePerformance {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitLossRatio: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      expectancy: 0,
      kellyPercent: 0
    };
  }
  
  /**
   * Add a trade to history
   */
  addTrade(trade: Trade): void {
    this.trades.push(trade);
  }
  
  /**
   * Get trade history
   */
  getTrades(): Trade[] {
    return this.trades;
  }
  
  /**
   * Clear trade history
   */
  clearTrades(): void {
    this.trades = [];
  }
  
  /**
   * Calculate portfolio risk exposure
   */
  calculatePortfolioRisk(
    positions: Array<{ value: number; stopLoss: number; entryPrice: number }>
  ): {
    totalExposure: number;
    totalRisk: number;
    riskPercent: number;
    withinLimits: boolean;
  } {
    const totalExposure = positions.reduce((sum, p) => sum + p.value, 0);
    
    const totalRisk = positions.reduce((sum, p) => {
      const riskPercent = Math.abs(p.stopLoss - p.entryPrice) / p.entryPrice;
      return sum + (p.value * riskPercent);
    }, 0);
    
    const riskPercent = totalExposure > 0 ? (totalRisk / totalExposure) * 100 : 0;
    
    return {
      totalExposure,
      totalRisk,
      riskPercent,
      withinLimits: riskPercent <= this.maxPortfolioRisk * 100
    };
  }
}

// Export singleton instance
export const riskManager = new RiskManager();