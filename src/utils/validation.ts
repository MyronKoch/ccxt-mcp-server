import { CreateOrderParams, TAPSErrorCode } from '../types/taps.js';

// Constants for validation
const MAX_EXCHANGE_ID_LENGTH = 50;
const MAX_SYMBOL_LENGTH = 20;
const DEFAULT_ORDER_VALUE_LIMIT = 1_000_000;
const MAX_AMOUNT_DECIMALS = 8;
const MIN_CREDENTIAL_LENGTH = 20; // Increased from 10 to 20 for better security

/**
 * ValidationUtils - Input validation and sanitization
 */
export class ValidationUtils {
  /**
   * Validate exchange ID
   */
  static validateExchange(exchangeId: string): void {
    if (!exchangeId || typeof exchangeId !== 'string') {
      throw this.createError(
        TAPSErrorCode.EXCHANGE_NOT_SUPPORTED,
        'Exchange ID is required'
      );
    }

    if (exchangeId.length > MAX_EXCHANGE_ID_LENGTH) {
      throw this.createError(
        TAPSErrorCode.EXCHANGE_NOT_SUPPORTED,
        `Invalid exchange ID (max length: ${MAX_EXCHANGE_ID_LENGTH})`
      );
    }

    // Validate format - only lowercase alphanumeric characters allowed
    if (!/^[a-z0-9]+$/.test(exchangeId)) {
      throw this.createError(
        TAPSErrorCode.EXCHANGE_NOT_SUPPORTED,
        'Invalid exchange ID format (only lowercase letters and numbers allowed)'
      );
    }
  }
  
  /**
   * Validate and normalize symbol
   */
  static validateSymbol(symbol: string): string {
    if (!symbol || typeof symbol !== 'string') {
      throw this.createError(
        TAPSErrorCode.INVALID_SYMBOL,
        'Symbol is required'
      );
    }

    if (symbol.length > MAX_SYMBOL_LENGTH) {
      throw this.createError(
        TAPSErrorCode.INVALID_SYMBOL,
        `Symbol too long (max length: ${MAX_SYMBOL_LENGTH})`
      );
    }

    // Normalize symbol format
    const normalized = this.sanitizeSymbol(symbol);

    // Basic validation - should contain a separator
    if (!normalized.includes('/') && !normalized.includes('-') && !normalized.includes('_')) {
      throw this.createError(
        TAPSErrorCode.INVALID_SYMBOL,
        `Invalid symbol format: ${symbol}. Expected format: BTC/USDT`
      );
    }

    return normalized;
  }
  
  /**
   * Sanitize and normalize symbol format
   */
  static sanitizeSymbol(symbol: string): string {
    // Convert to uppercase
    let normalized = symbol.toUpperCase();
    
    // Replace common variations
    normalized = normalized.replace(/\s+/g, '/'); // Space to slash
    normalized = normalized.replace(/:/g, '/');   // Colon to slash
    
    // Trim whitespace
    normalized = normalized.trim();
    
    return normalized;
  }
  
  /**
   * Validate order parameters
   */
  static validateOrderParams(params: CreateOrderParams): void {
    // Validate type
    if (!['market', 'limit', 'stop', 'stop_limit'].includes(params.type)) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        `Invalid order type: ${params.type}. Must be market, limit, stop, or stop_limit`
      );
    }
    
    // Validate side
    if (!['buy', 'sell'].includes(params.side)) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        `Invalid order side: ${params.side}. Must be buy or sell`
      );
    }
    
    // Validate amount
    if (typeof params.amount !== 'number' || params.amount <= 0) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        'Order amount must be a positive number'
      );
    }
    
    // Validate amount precision (max 8 decimals for most exchanges)
    // Use more robust decimal validation that handles scientific notation
    if (!isFinite(params.amount)) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        'Order amount must be a finite number'
      );
    }

    // Check decimal precision using multiplication to avoid string parsing issues
    const precisionCheck = Math.round(params.amount * Math.pow(10, MAX_AMOUNT_DECIMALS));
    const reconstructed = precisionCheck / Math.pow(10, MAX_AMOUNT_DECIMALS);
    if (Math.abs(params.amount - reconstructed) > Number.EPSILON) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        `Order amount has too many decimal places (max ${MAX_AMOUNT_DECIMALS})`
      );
    }
    
    // Validate price for limit orders
    if (params.type === 'limit') {
      if (typeof params.price !== 'number' || params.price <= 0) {
        throw this.createError(
          TAPSErrorCode.INVALID_ORDER_PARAMS,
          'Limit orders require a positive price'
        );
      }
      
      // Check for suspiciously large orders (safety check)
      const orderValue = params.amount * params.price;
      const maxOrderValue = process.env.MAX_ORDER_VALUE
        ? parseInt(process.env.MAX_ORDER_VALUE)
        : DEFAULT_ORDER_VALUE_LIMIT;

      if (orderValue > maxOrderValue) {
        throw this.createError(
          TAPSErrorCode.INVALID_ORDER_PARAMS,
          `Order value too large: $${orderValue.toFixed(2)} (max: $${maxOrderValue.toLocaleString()}). Please confirm this is intentional.`
        );
      }
    }
    
    // Market orders should not have price
    if (params.type === 'market' && params.price !== undefined) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        'Market orders should not include a price parameter'
      );
    }
  }
  
  /**
   * Validate timeframe
   */
  static validateTimeframe(timeframe: string): void {
    const validTimeframes = [
      '1m', '3m', '5m', '15m', '30m', // Minutes
      '1h', '2h', '4h', '6h', '8h', '12h', // Hours
      '1d', '3d', // Days
      '1w', // Weeks
      '1M', '3M' // Months
    ];
    
    if (!validTimeframes.includes(timeframe)) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        `Invalid timeframe: ${timeframe}. Valid options: ${validTimeframes.join(', ')}`
      );
    }
  }
  
  /**
   * Validate limit parameter
   */
  static validateLimit(limit: number | undefined, max: number = 1000): number {
    if (limit === undefined) {
      return 100; // Default
    }
    
    if (typeof limit !== 'number' || limit < 1) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        'Limit must be a positive number'
      );
    }
    
    if (limit > max) {
      throw this.createError(
        TAPSErrorCode.INVALID_ORDER_PARAMS,
        `Limit too large. Maximum: ${max}`
      );
    }
    
    return Math.floor(limit);
  }
  
  /**
   * Validate API credentials (basic check)
   */
  static validateCredentials(apiKey?: string, secret?: string): void {
    if (!apiKey || !secret) {
      throw this.createError(
        TAPSErrorCode.INVALID_CREDENTIALS,
        'API key and secret are required for this operation'
      );
    }

    if (apiKey.length < MIN_CREDENTIAL_LENGTH || secret.length < MIN_CREDENTIAL_LENGTH) {
      throw this.createError(
        TAPSErrorCode.INVALID_CREDENTIALS,
        `Invalid API credentials format (min length: ${MIN_CREDENTIAL_LENGTH})`
      );
    }
    
    // Check for common test/placeholder values
    const invalidKeys = ['your-api-key', 'api-key', 'test', 'demo', 'xxx'];
    if (invalidKeys.some(k => apiKey.toLowerCase().includes(k))) {
      throw this.createError(
        TAPSErrorCode.INVALID_CREDENTIALS,
        'Please provide valid API credentials (not placeholder values)'
      );
    }
  }
  
  /**
   * Create a validation error
   */
  private static createError(code: TAPSErrorCode, message: string): Error {
    const error = new Error(message) as any;
    error.code = code;
    return error;
  }
}
