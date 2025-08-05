import { 
  TAPSResponse, 
  TAPSError, 
  RateLimitInfo,
  TAPSErrorCode,
  PaginatedResponse 
} from './types/taps.js';

/**
 * ResponseFormatter - Standardizes all responses to TAPS v1.0 format
 */
export class ResponseFormatter {
  private static readonly VERSION = 'TAPS-1.0.0';
  
  /**
   * Format a successful response
   */
  static success<T>(
    data: T, 
    exchange: string, 
    rateLimit?: RateLimitInfo
  ): TAPSResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        exchange,
        timestamp: Date.now(),
        rateLimit: rateLimit || { remaining: -1, reset: -1 },
        version: this.VERSION
      }
    };
  }
  
  /**
   * Format a paginated response
   */
  static paginated<T>(
    items: T[],
    page: number,
    pageSize: number,
    exchange: string,
    rateLimit?: RateLimitInfo
  ): PaginatedResponse<T> {
    // Validate pageSize to prevent division by zero
    if (pageSize <= 0) {
      throw new Error('PageSize must be positive');
    }
    if (page < 1) {
      throw new Error('Page number must be at least 1');
    }

    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      success: true,
      data: items.slice(start, end),
      pagination: {
        page,
        pageSize,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      },
      metadata: {
        exchange,
        timestamp: Date.now(),
        rateLimit: rateLimit || { remaining: -1, reset: -1 },
        version: this.VERSION
      }
    };
  }
  
  /**
   * Format an error response
   */
  static error(
    error: any, 
    exchange: string = 'unknown'
  ): TAPSResponse {
    const tapsError = this.normalizeError(error);
    
    return {
      success: false,
      error: {
        code: tapsError.code,
        message: tapsError.message,
        exchange,
        details: tapsError.details
      },
      metadata: {
        exchange,
        timestamp: Date.now(),
        rateLimit: { remaining: -1, reset: -1 },
        version: this.VERSION
      }
    };
  }
  
  /**
   * Normalize various error types to TAPS format
   */
  private static normalizeError(error: any): TAPSError {
    // Already a TAPS error
    if (error.code && error.code.startsWith('TAPS')) {
      return error;
    }
    
    // CCXT errors
    if (error.constructor && error.constructor.name) {
      const errorType = error.constructor.name;
      
      switch (errorType) {
        case 'NetworkError':
          return {
            code: TAPSErrorCode.NETWORK_ERROR,
            message: error.message || 'Network error occurred',
            details: error
          };
          
        case 'RateLimitExceeded':
        case 'DDoSProtection':
          return {
            code: TAPSErrorCode.RATE_LIMIT_EXCEEDED,
            message: error.message || 'Rate limit exceeded',
            details: error
          };
          
        case 'AuthenticationError':
        case 'PermissionDenied':
          return {
            code: TAPSErrorCode.INVALID_CREDENTIALS,
            message: error.message || 'Authentication failed',
            details: error
          };
          
        case 'InsufficientFunds':
          return {
            code: TAPSErrorCode.INSUFFICIENT_BALANCE,
            message: error.message || 'Insufficient balance',
            details: error
          };
          
        case 'InvalidOrder':
          return {
            code: TAPSErrorCode.INVALID_ORDER_PARAMS,
            message: error.message || 'Invalid order parameters',
            details: error
          };
          
        case 'OrderNotFound':
          return {
            code: TAPSErrorCode.ORDER_NOT_FOUND,
            message: error.message || 'Order not found',
            details: error
          };
          
        case 'ExchangeNotAvailable':
        case 'OnMaintenance':
          return {
            code: TAPSErrorCode.EXCHANGE_MAINTENANCE,
            message: error.message || 'Exchange is under maintenance',
            details: error
          };
          
        case 'BadSymbol':
        case 'MarketNotAvailable':
          return {
            code: TAPSErrorCode.MARKET_NOT_AVAILABLE,
            message: error.message || 'Market or symbol not available',
            details: error
          };
          
        default:
          // Check for specific error messages
          if (error.message) {
            if (error.message.includes('symbol') || error.message.includes('Symbol')) {
              return {
                code: TAPSErrorCode.INVALID_SYMBOL,
                message: error.message,
                details: error
              };
            }
            
            if (error.message.includes('not supported') || error.message.includes('not implemented')) {
              return {
                code: TAPSErrorCode.METHOD_NOT_SUPPORTED,
                message: error.message,
                details: error
              };
            }
          }
      }
    }
    
    // Generic error
    return {
      code: TAPSErrorCode.UNKNOWN_ERROR,
      message: error.message || 'An unknown error occurred',
      details: error
    };
  }
  
  /**
   * Format rate limit info from exchange response
   */
  static extractRateLimit(exchange: any, response?: any): RateLimitInfo {
    // Try to extract rate limit info from response headers
    if (response?.headers) {
      const remaining = response.headers['x-ratelimit-remaining'] || 
                      response.headers['x-mbx-used-weight'] || // Binance
                      response.headers['x-rate-limit-remaining'] ||
                      -1;
                      
      const reset = response.headers['x-ratelimit-reset'] ||
                   response.headers['x-mbx-used-weight-1m'] || // Binance
                   response.headers['x-rate-limit-reset'] ||
                   -1;
                   
      return {
        remaining: parseInt(remaining) || -1,
        reset: parseInt(reset) || -1
      };
    }
    
    // Try to get from exchange object
    if (exchange?.last_response_headers) {
      return this.extractRateLimit(null, { headers: exchange.last_response_headers });
    }
    
    return { remaining: -1, reset: -1 };
  }
  
  /**
   * Sanitize sensitive data from responses
   */
  static sanitize(data: any): any {
    if (!data) return data;
    
    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove sensitive fields
    const sensitiveFields = ['apiKey', 'secret', 'password', 'privateKey', 'passphrase'];
    
    const removeSensitive = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const field of sensitiveFields) {
        if (field in obj) {
          obj[field] = '[REDACTED]';
        }
      }
      
      for (const key in obj) {
        if (typeof obj[key] === 'object') {
          removeSensitive(obj[key]);
        }
      }
    };
    
    removeSensitive(sanitized);
    return sanitized;
  }
}
