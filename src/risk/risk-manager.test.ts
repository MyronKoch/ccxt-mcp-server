import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager, Trade } from './risk-manager.js';

describe('RiskManager', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager();
    riskManager.clearTrades();
  });

  const createTrade = (profit: number, profitPercent: number): Trade => ({
    id: `trade-${Date.now()}-${Math.random()}`,
    symbol: 'BTC/USDT',
    side: 'buy',
    entryPrice: 100,
    exitPrice: 100 + profit,
    amount: 1,
    profit,
    profitPercent,
    timestamp: new Date(),
    exchange: 'binance'
  });

  describe('calculatePerformance', () => {
    it('should return empty performance for no trades', () => {
      const result = riskManager.calculatePerformance([]);

      expect(result.totalTrades).toBe(0);
      expect(result.winningTrades).toBe(0);
      expect(result.losingTrades).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.avgWin).toBe(0);
      expect(result.avgLoss).toBe(0);
    });

    it('should calculate performance correctly for profitable trades', () => {
      const trades = [
        createTrade(10, 10),
        createTrade(20, 20),
        createTrade(-5, -5),
        createTrade(15, 15),
        createTrade(-10, -10)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.totalTrades).toBe(5);
      expect(result.winningTrades).toBe(3);
      expect(result.losingTrades).toBe(2);
      expect(result.winRate).toBe(60);
      expect(result.avgWin).toBeCloseTo(15, 1);
      expect(result.avgLoss).toBeCloseTo(7.5, 1);
    });

    it('should calculate profit/loss ratio correctly', () => {
      const trades = [
        createTrade(20, 20),
        createTrade(-10, -10)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.profitLossRatio).toBe(2);
    });

    it('should cap profit/loss ratio at MAX instead of Infinity', () => {
      const trades = [
        createTrade(20, 20),
        createTrade(30, 30)
      ]; // All wins, no losses

      const result = riskManager.calculatePerformance(trades);

      expect(result.profitLossRatio).toBe(999); // MAX_PROFIT_LOSS_RATIO
      expect(result.profitLossRatio).not.toBe(Infinity);
    });

    it('should calculate expectancy correctly', () => {
      const trades = [
        createTrade(100, 10),
        createTrade(100, 10),
        createTrade(-50, -5),
        createTrade(-50, -5)
      ];

      const result = riskManager.calculatePerformance(trades);

      // Expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss)
      // = (0.5 * 100) - (0.5 * 50) = 50 - 25 = 25
      expect(result.expectancy).toBeCloseTo(25, 1);
    });

    it('should calculate Kelly percentage', () => {
      const trades = [
        createTrade(20, 20),
        createTrade(20, 20),
        createTrade(-10, -10)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.kellyPercent).toBeGreaterThan(0);
      expect(result.kellyPercent).toBeLessThanOrEqual(25); // Max 25%
    });
  });

  describe('calculatePositionSize', () => {
    it('should calculate position size correctly', () => {
      const result = riskManager.calculatePositionSize(
        10000,  // accountBalance
        100,    // entryPrice
        60,     // winRate (60%)
        20,     // avgWin
        10,     // avgLoss
        0.02,   // volatility
        0.02,   // stopLossPercent
        2       // takeProfitRatio
      );

      expect(result.amount).toBeGreaterThan(0);
      expect(result.value).toBeGreaterThan(0);
      expect(result.percentOfCapital).toBeGreaterThan(0);
      expect(result.percentOfCapital).toBeLessThanOrEqual(25);
      expect(result.stopLoss).toBeLessThan(100);
      expect(result.takeProfit).toBeGreaterThan(100);
    });

    it('should throw error for invalid account balance', () => {
      expect(() => {
        riskManager.calculatePositionSize(0, 100, 60, 20, 10);
      }).toThrow('Account balance and entry price must be positive and finite');

      expect(() => {
        riskManager.calculatePositionSize(-1000, 100, 60, 20, 10);
      }).toThrow('Account balance and entry price must be positive and finite');

      expect(() => {
        riskManager.calculatePositionSize(Infinity, 100, 60, 20, 10);
      }).toThrow('Account balance and entry price must be positive and finite');
    });

    it('should throw error for invalid entry price', () => {
      expect(() => {
        riskManager.calculatePositionSize(10000, 0, 60, 20, 10);
      }).toThrow('Account balance and entry price must be positive and finite');

      expect(() => {
        riskManager.calculatePositionSize(10000, -100, 60, 20, 10);
      }).toThrow('Account balance and entry price must be positive and finite');
    });

    it('should throw error for invalid win rate', () => {
      expect(() => {
        riskManager.calculatePositionSize(10000, 100, -10, 20, 10);
      }).toThrow('Win rate must be between 0 and 100');

      expect(() => {
        riskManager.calculatePositionSize(10000, 100, 150, 20, 10);
      }).toThrow('Win rate must be between 0 and 100');
    });

    it('should throw error for negative average win/loss', () => {
      expect(() => {
        riskManager.calculatePositionSize(10000, 100, 60, -20, 10);
      }).toThrow('Average win and loss must be non-negative and finite');

      expect(() => {
        riskManager.calculatePositionSize(10000, 100, 60, 20, -10);
      }).toThrow('Average win and loss must be non-negative and finite');
    });

    it('should handle zero avgLoss (all winning trades)', () => {
      const result = riskManager.calculatePositionSize(10000, 100, 100, 20, 0);

      expect(result.amount).toBe(0); // Conservative approach when no loss data
    });

    it('should never exceed maximum Kelly percentage', () => {
      const result = riskManager.calculatePositionSize(
        10000,
        100,
        90,    // Very high win rate
        100,   // Large avg win
        1,     // Small avg loss
        0.01,
        0.02,
        2
      );

      expect(result.percentOfCapital).toBeLessThanOrEqual(25);
    });

    it('should adjust for volatility', () => {
      const lowVol = riskManager.calculatePositionSize(10000, 100, 60, 20, 10, 0.001);
      const highVol = riskManager.calculatePositionSize(10000, 100, 60, 20, 10, 0.50);

      expect(lowVol.value).toBeGreaterThan(highVol.value);
    });

    it('should calculate stop loss and take profit correctly', () => {
      const result = riskManager.calculatePositionSize(
        10000,
        100,
        60,
        20,
        10,
        0.02,
        0.05,  // 5% stop loss
        3      // 3:1 take profit ratio
      );

      expect(result.stopLoss).toBeCloseTo(95, 1);     // 100 * (1 - 0.05)
      expect(result.takeProfit).toBeCloseTo(115, 1);  // 100 * (1 + 0.05 * 3)
    });
  });

  describe('calculateDynamicStopLoss', () => {
    it('should calculate stop loss for buy position', () => {
      const result = riskManager.calculateDynamicStopLoss(100, 5, 2, 'buy');

      expect(result).toBe(90); // 100 - (5 * 2)
    });

    it('should calculate stop loss for sell position', () => {
      const result = riskManager.calculateDynamicStopLoss(100, 5, 2, 'sell');

      expect(result).toBe(110); // 100 + (5 * 2)
    });

    it('should use different multipliers', () => {
      const conservative = riskManager.calculateDynamicStopLoss(100, 5, 3, 'buy');
      const aggressive = riskManager.calculateDynamicStopLoss(100, 5, 1, 'buy');

      expect(conservative).toBeLessThan(aggressive);
    });
  });

  describe('calculateDynamicTakeProfit', () => {
    it('should calculate take profit for buy position', () => {
      const stopLoss = 90;
      const result = riskManager.calculateDynamicTakeProfit(100, stopLoss, 2, 'buy');

      // Risk = 10, Reward = 10 * 2 = 20
      expect(result).toBe(120);
    });

    it('should calculate take profit for sell position', () => {
      const stopLoss = 110;
      const result = riskManager.calculateDynamicTakeProfit(100, stopLoss, 2, 'sell');

      // Risk = 10, Reward = 10 * 2 = 20
      expect(result).toBe(80);
    });

    it('should respect risk-reward ratio', () => {
      const stopLoss = 95;
      const ratio3 = riskManager.calculateDynamicTakeProfit(100, stopLoss, 3, 'buy');
      const ratio2 = riskManager.calculateDynamicTakeProfit(100, stopLoss, 2, 'buy');

      expect(ratio3).toBeGreaterThan(ratio2);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should calculate Sharpe ratio correctly', () => {
      const trades = Array.from({ length: 30 }, (_, i) =>
        createTrade(i % 3 === 0 ? -5 : 10, i % 3 === 0 ? -5 : 10)
      );

      const result = riskManager.calculatePerformance(trades);

      expect(result.sharpeRatio).toBeDefined();
      expect(isFinite(result.sharpeRatio)).toBe(true);
    });

    it('should return 0 for insufficient trades', () => {
      const trades = [createTrade(10, 10)];

      const result = riskManager.calculatePerformance(trades);

      expect(result.sharpeRatio).toBe(0);
    });

    it('should return 0 for zero standard deviation', () => {
      const trades = Array.from({ length: 10 }, () => createTrade(10, 10));

      const result = riskManager.calculatePerformance(trades);

      expect(result.sharpeRatio).toBe(0);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const trades = [
        createTrade(100, 10),
        createTrade(50, 5),
        createTrade(-200, -20),  // Big loss creating drawdown
        createTrade(30, 3)
      ];

      const result = riskManager.calculatePerformance(trades);

      // Max drawdown can exceed 100% when losses exceed peak
      expect(result.maxDrawdown).toBeGreaterThan(0);
      expect(isFinite(result.maxDrawdown)).toBe(true);
    });

    it('should return 0 for no drawdown', () => {
      const trades = [
        createTrade(10, 1),
        createTrade(20, 2),
        createTrade(30, 3)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.maxDrawdown).toBe(0);
    });

    it('should handle complete loss', () => {
      const trades = [
        createTrade(1000, 100),
        createTrade(-1000, -100)
      ];

      const result = riskManager.calculatePerformance(trades);

      // Max drawdown can be exactly 100% when you lose all gains
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(100);
      expect(result.maxDrawdown).toBeLessThanOrEqual(200);
    });
  });

  describe('calculatePortfolioRisk', () => {
    it('should calculate portfolio risk correctly', () => {
      const positions = [
        { value: 1000, stopLoss: 95, entryPrice: 100 },
        { value: 2000, stopLoss: 190, entryPrice: 200 },
        { value: 1500, stopLoss: 142.5, entryPrice: 150 }
      ];

      const result = riskManager.calculatePortfolioRisk(positions);

      expect(result.totalExposure).toBe(4500);
      expect(result.totalRisk).toBeGreaterThan(0);
      expect(result.riskPercent).toBeGreaterThan(0);
      expect(result.riskPercent).toBeLessThan(100);
    });

    it('should flag when risk exceeds limits', () => {
      const positions = [
        { value: 1000, stopLoss: 50, entryPrice: 100 },  // 50% risk
        { value: 1000, stopLoss: 50, entryPrice: 100 }
      ];

      const result = riskManager.calculatePortfolioRisk(positions);

      expect(result.withinLimits).toBe(false);
      expect(result.riskPercent).toBeGreaterThan(6);
    });

    it('should handle empty portfolio', () => {
      const result = riskManager.calculatePortfolioRisk([]);

      expect(result.totalExposure).toBe(0);
      expect(result.totalRisk).toBe(0);
      expect(result.riskPercent).toBe(0);
      expect(result.withinLimits).toBe(true);
    });

    it('should calculate risk correctly for multiple positions', () => {
      const positions = [
        { value: 5000, stopLoss: 4900, entryPrice: 5000 },  // 2% risk
        { value: 3000, stopLoss: 2940, entryPrice: 3000 }   // 2% risk
      ];

      const result = riskManager.calculatePortfolioRisk(positions);

      expect(result.totalExposure).toBe(8000);
      expect(result.riskPercent).toBeCloseTo(2, 1);
      expect(result.withinLimits).toBe(true);
    });
  });

  describe('addTrade and getTrades', () => {
    it('should add and retrieve trades', () => {
      const trade1 = createTrade(10, 10);
      const trade2 = createTrade(20, 20);

      riskManager.addTrade(trade1);
      riskManager.addTrade(trade2);

      const trades = riskManager.getTrades();

      expect(trades).toHaveLength(2);
      expect(trades[0]).toEqual(trade1);
      expect(trades[1]).toEqual(trade2);
    });
  });

  describe('clearTrades', () => {
    it('should clear all trades', () => {
      riskManager.addTrade(createTrade(10, 10));
      riskManager.addTrade(createTrade(20, 20));

      riskManager.clearTrades();

      expect(riskManager.getTrades()).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small numbers without precision errors', () => {
      const result = riskManager.calculatePositionSize(
        10000,
        0.00001,  // Crypto prices can be very small
        60,
        0.000002,
        0.000001
      );

      expect(result.amount).toBeGreaterThan(0);
      expect(isFinite(result.amount)).toBe(true);
    });

    it('should handle very large numbers', () => {
      const result = riskManager.calculatePositionSize(
        1000000000,  // Large account
        50000,       // High price
        60,
        10000,
        5000
      );

      expect(result.amount).toBeGreaterThan(0);
      expect(isFinite(result.amount)).toBe(true);
    });

    it('should handle 100% win rate', () => {
      const trades = [
        createTrade(10, 10),
        createTrade(20, 20),
        createTrade(30, 30)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.winRate).toBe(100);
      expect(result.losingTrades).toBe(0);
      expect(result.profitLossRatio).toBe(999);
    });

    it('should handle 0% win rate', () => {
      const trades = [
        createTrade(-10, -10),
        createTrade(-20, -20),
        createTrade(-30, -30)
      ];

      const result = riskManager.calculatePerformance(trades);

      expect(result.winRate).toBe(0);
      expect(result.winningTrades).toBe(0);
      expect(result.profitLossRatio).toBe(0);
    });
  });
});
