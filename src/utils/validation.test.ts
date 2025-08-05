import { describe, it, expect } from 'vitest';
import { ValidationUtils } from './validation.js';

describe('ValidationUtils', () => {
  describe('validateExchange', () => {
    it('should accept valid exchange IDs', () => {
      expect(() => ValidationUtils.validateExchange('binance')).not.toThrow();
      expect(() => ValidationUtils.validateExchange('coinbase')).not.toThrow();
      expect(() => ValidationUtils.validateExchange('kraken')).not.toThrow();
    });

    it('should reject empty exchange ID', () => {
      expect(() => ValidationUtils.validateExchange('')).toThrow('Exchange ID is required');
    });

    it('should reject too long exchange ID', () => {
      const longId = 'a'.repeat(51);
      expect(() => ValidationUtils.validateExchange(longId)).toThrow('Invalid exchange ID');
    });

    it('should reject non-string exchange ID', () => {
      expect(() => ValidationUtils.validateExchange(null as any)).toThrow(
        'Exchange ID is required'
      );
    });
  });

  describe('validateSymbol', () => {
    it('should accept valid symbols', () => {
      expect(ValidationUtils.validateSymbol('BTC/USDT')).toBe('BTC/USDT');
      expect(ValidationUtils.validateSymbol('ETH/BTC')).toBe('ETH/BTC');
      expect(ValidationUtils.validateSymbol('SOL/USD')).toBe('SOL/USD');
    });

    it('should normalize symbols', () => {
      expect(ValidationUtils.validateSymbol('btc/usdt')).toBe('BTC/USDT');
      expect(ValidationUtils.validateSymbol('eth:btc')).toBe('ETH/BTC');
      expect(ValidationUtils.validateSymbol('SOL USD')).toBe('SOL/USD');
    });

    it('should reject invalid symbols', () => {
      expect(() => ValidationUtils.validateSymbol('INVALID')).toThrow('Invalid symbol format');
      expect(() => ValidationUtils.validateSymbol('BTC')).toThrow('Invalid symbol format');
      expect(() => ValidationUtils.validateSymbol('')).toThrow('Symbol is required');
    });
  });

  describe('validateLimit', () => {
    it('should return default for undefined', () => {
      expect(ValidationUtils.validateLimit(undefined, 1000)).toBe(100);
    });

    it('should accept valid limits', () => {
      expect(ValidationUtils.validateLimit(50, 1000)).toBe(50);
      expect(ValidationUtils.validateLimit(100, 1000)).toBe(100);
      expect(ValidationUtils.validateLimit(500, 1000)).toBe(500);
    });

    it('should reject invalid limits', () => {
      expect(() => ValidationUtils.validateLimit(0, 1000)).toThrow('Limit must be a positive');
      expect(() => ValidationUtils.validateLimit(-10, 1000)).toThrow('Limit must be a positive');
      expect(() => ValidationUtils.validateLimit(1001, 1000)).toThrow('Limit too large');
    });

    it('should floor decimal limits', () => {
      expect(ValidationUtils.validateLimit(50.7, 1000)).toBe(50);
      expect(ValidationUtils.validateLimit(99.9, 1000)).toBe(99);
    });
  });

  describe('validateTimeframe', () => {
    it('should accept valid timeframes', () => {
      expect(() => ValidationUtils.validateTimeframe('1m')).not.toThrow();
      expect(() => ValidationUtils.validateTimeframe('5m')).not.toThrow();
      expect(() => ValidationUtils.validateTimeframe('1h')).not.toThrow();
      expect(() => ValidationUtils.validateTimeframe('1d')).not.toThrow();
      expect(() => ValidationUtils.validateTimeframe('1w')).not.toThrow();
      expect(() => ValidationUtils.validateTimeframe('1M')).not.toThrow();
    });

    it('should reject invalid timeframes', () => {
      expect(() => ValidationUtils.validateTimeframe('2m')).toThrow('Invalid timeframe');
      expect(() => ValidationUtils.validateTimeframe('10h')).toThrow('Invalid timeframe');
      expect(() => ValidationUtils.validateTimeframe('invalid')).toThrow('Invalid timeframe');
    });
  });

  describe('validateCredentials', () => {
    it('should accept valid credentials', () => {
      expect(() =>
        ValidationUtils.validateCredentials('validapikey1234567890', 'validsecret1234567890')
      ).not.toThrow();
    });

    it('should reject missing credentials', () => {
      expect(() => ValidationUtils.validateCredentials(undefined, undefined)).toThrow(
        'API key and secret are required'
      );
      expect(() => ValidationUtils.validateCredentials('key', undefined)).toThrow(
        'API key and secret are required'
      );
    });

    it('should reject too short credentials', () => {
      expect(() => ValidationUtils.validateCredentials('short', 'tooshort')).toThrow(
        'Invalid API credentials format'
      );
    });

    it('should reject placeholder credentials', () => {
      expect(() =>
        ValidationUtils.validateCredentials('your-api-key-1234567890', 'your-secret-6789012345')
      ).toThrow('Please provide valid API credentials');
      expect(() =>
        ValidationUtils.validateCredentials('test-key-1234567890xyz', 'validsecret1234567890')
      ).toThrow('Please provide valid API credentials');
    });
  });
});
