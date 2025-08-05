import { describe, it, expect } from 'vitest';
import { ResponseFormatter } from './response-formatter.js';
import { TAPSErrorCode } from './types/taps.js';

describe('ResponseFormatter', () => {
  describe('success', () => {
    it('should format successful response correctly', () => {
      const data = { price: 100, symbol: 'BTC/USDT' };
      const result = ResponseFormatter.success(data, 'binance');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.metadata.exchange).toBe('binance');
      expect(result.metadata.timestamp).toBeGreaterThan(0);
      expect(result.metadata.version).toBe('TAPS-1.0.0');
    });

    it('should include rate limit info when provided', () => {
      const data = { test: 'data' };
      const rateLimit = { remaining: 100, reset: Date.now() + 60000 };
      const result = ResponseFormatter.success(data, 'kraken', rateLimit);

      expect(result.metadata.rateLimit).toEqual(rateLimit);
    });

    it('should use default rate limit when not provided', () => {
      const data = { test: 'data' };
      const result = ResponseFormatter.success(data, 'coinbase');

      expect(result.metadata.rateLimit).toEqual({ remaining: -1, reset: -1 });
    });
  });

  describe('paginated', () => {
    it('should format paginated response correctly', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const result = ResponseFormatter.paginated(items, 1, 10, 'binance');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(10);
      expect(result.pagination!.page).toBe(1);
      expect(result.pagination!.pageSize).toBe(10);
      expect(result.pagination!.totalPages).toBe(5);
      expect(result.pagination!.totalItems).toBe(50);
      expect(result.pagination!.hasNext).toBe(true);
      expect(result.pagination!.hasPrevious).toBe(false);
    });

    it('should handle last page correctly', () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = ResponseFormatter.paginated(items, 3, 10, 'kraken');

      expect(result.data).toHaveLength(5);
      expect(result.pagination!.hasNext).toBe(false);
      expect(result.pagination!.hasPrevious).toBe(true);
    });

    it('should handle single page', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = ResponseFormatter.paginated(items, 1, 10, 'coinbase');

      expect(result.data).toHaveLength(2);
      expect(result.pagination!.totalPages).toBe(1);
      expect(result.pagination!.hasNext).toBe(false);
      expect(result.pagination!.hasPrevious).toBe(false);
    });

    it('should throw error for zero or negative pageSize', () => {
      const items = [{ id: 1 }];

      expect(() => {
        ResponseFormatter.paginated(items, 1, 0, 'binance');
      }).toThrow('PageSize must be positive');

      expect(() => {
        ResponseFormatter.paginated(items, 1, -5, 'binance');
      }).toThrow('PageSize must be positive');
    });

    it('should throw error for page less than 1', () => {
      const items = [{ id: 1 }];

      expect(() => {
        ResponseFormatter.paginated(items, 0, 10, 'binance');
      }).toThrow('Page number must be at least 1');

      expect(() => {
        ResponseFormatter.paginated(items, -1, 10, 'binance');
      }).toThrow('Page number must be at least 1');
    });

    it('should handle empty items array', () => {
      const result = ResponseFormatter.paginated([], 1, 10, 'kraken');

      expect(result.data).toHaveLength(0);
      expect(result.pagination!.totalItems).toBe(0);
      expect(result.pagination!.totalPages).toBe(0);
    });

    it('should slice data correctly for middle page', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const result = ResponseFormatter.paginated(items, 5, 10, 'binance');

      expect(result.data![0].id).toBe(40); // Page 5, items 40-49
      expect(result.data![9].id).toBe(49);
    });
  });

  describe('error', () => {
    it('should format error response correctly', () => {
      const error = new Error('Test error');
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Test error');
      expect(result.error!.exchange).toBe('binance');
      expect(result.metadata.exchange).toBe('binance');
    });

    it('should handle CCXT NetworkError', () => {
      const error = new Error('Network error') as any;
      error.constructor = { name: 'NetworkError' };
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.NETWORK_ERROR);
    });

    it('should handle CCXT RateLimitExceeded', () => {
      const error = new Error('Rate limit') as any;
      error.constructor = { name: 'RateLimitExceeded' };
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.error!.code).toBe(TAPSErrorCode.RATE_LIMIT_EXCEEDED);
    });

    it('should handle CCXT AuthenticationError', () => {
      const error = new Error('Auth failed') as any;
      error.constructor = { name: 'AuthenticationError' };
      const result = ResponseFormatter.error(error, 'coinbase');

      expect(result.error!.code).toBe(TAPSErrorCode.INVALID_CREDENTIALS);
    });

    it('should handle CCXT InsufficientFunds', () => {
      const error = new Error('Not enough balance') as any;
      error.constructor = { name: 'InsufficientFunds' };
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.INSUFFICIENT_BALANCE);
    });

    it('should handle CCXT InvalidOrder', () => {
      const error = new Error('Invalid order params') as any;
      error.constructor = { name: 'InvalidOrder' };
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.error!.code).toBe(TAPSErrorCode.INVALID_ORDER_PARAMS);
    });

    it('should handle CCXT OrderNotFound', () => {
      const error = new Error('Order not found') as any;
      error.constructor = { name: 'OrderNotFound' };
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.ORDER_NOT_FOUND);
    });

    it('should handle CCXT ExchangeNotAvailable', () => {
      const error = new Error('Exchange down') as any;
      error.constructor = { name: 'ExchangeNotAvailable' };
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.error!.code).toBe(TAPSErrorCode.EXCHANGE_MAINTENANCE);
    });

    it('should handle CCXT BadSymbol', () => {
      const error = new Error('Invalid symbol') as any;
      error.constructor = { name: 'BadSymbol' };
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.MARKET_NOT_AVAILABLE);
    });

    it('should handle symbol-related error messages', () => {
      const error = new Error('Symbol BTC/INVALID not found');
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.error!.code).toBe(TAPSErrorCode.INVALID_SYMBOL);
    });

    it('should handle "not supported" error messages', () => {
      const error = new Error('This method is not supported');
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.METHOD_NOT_SUPPORTED);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error type');
      const result = ResponseFormatter.error(error, 'binance');

      expect(result.error!.code).toBe(TAPSErrorCode.UNKNOWN_ERROR);
    });

    it('should handle already formatted TAPS errors', () => {
      const error: any = new Error('Already formatted');
      error.code = TAPSErrorCode.INVALID_SYMBOL;
      const result = ResponseFormatter.error(error, 'kraken');

      expect(result.error!.code).toBe(TAPSErrorCode.INVALID_SYMBOL);
    });

    it('should use unknown exchange when not provided', () => {
      const error = new Error('Test');
      const result = ResponseFormatter.error(error);

      expect(result.error!.exchange).toBe('unknown');
      expect(result.metadata.exchange).toBe('unknown');
    });
  });

  describe('extractRateLimit', () => {
    it('should extract rate limit from response headers', () => {
      const response = {
        headers: {
          'x-ratelimit-remaining': '100',
          'x-ratelimit-reset': '1234567890'
        }
      };

      const result = ResponseFormatter.extractRateLimit(null, response);

      expect(result.remaining).toBe(100);
      expect(result.reset).toBe(1234567890);
    });

    it('should handle Binance headers', () => {
      const response = {
        headers: {
          'x-mbx-used-weight': '50',
          'x-mbx-used-weight-1m': '1234567890'
        }
      };

      const result = ResponseFormatter.extractRateLimit(null, response);

      expect(result.remaining).toBe(50);
      expect(result.reset).toBe(1234567890);
    });

    it('should return default when headers missing', () => {
      const response = { headers: {} };
      const result = ResponseFormatter.extractRateLimit(null, response);

      expect(result.remaining).toBe(-1);
      expect(result.reset).toBe(-1);
    });

    it('should extract from exchange last_response_headers', () => {
      const exchange = {
        last_response_headers: {
          'x-ratelimit-remaining': '200',
          'x-ratelimit-reset': '9876543210'
        }
      };

      const result = ResponseFormatter.extractRateLimit(exchange);

      expect(result.remaining).toBe(200);
      expect(result.reset).toBe(9876543210);
    });

    it('should handle invalid header values', () => {
      const response = {
        headers: {
          'x-ratelimit-remaining': 'invalid',
          'x-ratelimit-reset': 'also-invalid'
        }
      };

      const result = ResponseFormatter.extractRateLimit(null, response);

      expect(result.remaining).toBe(-1);
      expect(result.reset).toBe(-1);
    });
  });

  describe('sanitize', () => {
    it('should redact sensitive API key', () => {
      const data = {
        exchange: 'binance',
        apiKey: 'secret-api-key-12345',
        balance: 1000
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.exchange).toBe('binance');
      expect(result.balance).toBe(1000);
    });

    it('should redact sensitive secret', () => {
      const data = {
        secret: 'super-secret-key',
        price: 50000
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.secret).toBe('[REDACTED]');
      expect(result.price).toBe(50000);
    });

    it('should redact password', () => {
      const data = {
        username: 'trader',
        password: 'my-password-123'
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('trader');
    });

    it('should redact privateKey', () => {
      const data = {
        publicKey: 'public-123',
        privateKey: 'private-secret-key'
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.privateKey).toBe('[REDACTED]');
      expect(result.publicKey).toBe('public-123');
    });

    it('should redact passphrase', () => {
      const data = {
        exchange: 'kraken',
        passphrase: 'secret-phrase'
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.passphrase).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = {
        exchange: 'binance',
        credentials: {
          apiKey: 'secret-key',
          secret: 'secret-value'
        },
        account: {
          user: {
            password: 'my-pass'
          }
        }
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.credentials.apiKey).toBe('[REDACTED]');
      expect(result.credentials.secret).toBe('[REDACTED]');
      expect(result.account.user.password).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const data = {
        accounts: [
          { id: 1, apiKey: 'key1' },
          { id: 2, apiKey: 'key2' }
        ]
      };

      const result = ResponseFormatter.sanitize(data);

      expect(result.accounts[0].apiKey).toBe('[REDACTED]');
      expect(result.accounts[1].apiKey).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(ResponseFormatter.sanitize(null)).toBeNull();
      expect(ResponseFormatter.sanitize(undefined)).toBeUndefined();
    });

    it('should not modify original object', () => {
      const original = {
        apiKey: 'secret-key',
        balance: 1000
      };

      const sanitized = ResponseFormatter.sanitize(original);

      expect(original.apiKey).toBe('secret-key'); // Original unchanged
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('should handle primitive values', () => {
      expect(ResponseFormatter.sanitize('string')).toBe('string');
      expect(ResponseFormatter.sanitize(123)).toBe(123);
      expect(ResponseFormatter.sanitize(true)).toBe(true);
    });
  });
});
