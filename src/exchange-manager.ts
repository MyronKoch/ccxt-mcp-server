import ccxt from 'ccxt';
import crypto from 'crypto';
import { ExchangeConfig, TAPSErrorCode } from './types/taps.js';
import { adaptiveRateLimiter } from './rate-limiting/adaptive-limiter.js';

/**
 * ExchangeManager - Singleton pattern for managing CCXT exchange instances
 * Handles caching, credential management, and rate limiting
 */
export class ExchangeManager {
  private static instance: ExchangeManager;
  private exchanges: Map<string, any> = new Map();
  
  private constructor() {}
  
  public static getInstance(): ExchangeManager {
    if (!ExchangeManager.instance) {
      ExchangeManager.instance = new ExchangeManager();
    }
    return ExchangeManager.instance;
  }
  
  /**
   * Get or create an exchange instance
   * Uses caching to avoid creating duplicate instances for the same configuration
   *
   * @param {string} exchangeId - The exchange identifier (e.g., 'binance', 'coinbase')
   * @param {ExchangeConfig} [config] - Optional configuration including credentials, testnet mode, and custom options
   * @returns {Promise<any>} CCXT exchange instance with loaded markets
   */
  async getExchange(exchangeId: string, config?: ExchangeConfig): Promise<any> {
    const key = this.getExchangeKey(exchangeId, config);
    
    // Return cached instance if available
    if (this.exchanges.has(key)) {
      return this.exchanges.get(key)!;
    }
    
    // Create new exchange instance
    const exchange = await this.createExchange(exchangeId, config);
    this.exchanges.set(key, exchange);
    
    return exchange;
  }
  
  /**
   * Create a new exchange instance
   * Handles credential injection from config or environment variables
   * Configures testnet/sandbox mode if requested
   *
   * @private
   * @param {string} exchangeId - The exchange identifier
   * @param {ExchangeConfig} [config] - Optional configuration
   * @returns {Promise<any>} Newly created CCXT exchange instance
   * @throws {Error} If exchange is not supported (TAPS001)
   */
  private async createExchange(exchangeId: string, config?: ExchangeConfig): Promise<any> {
    // Check if exchange is supported
    if (!ccxt.exchanges.includes(exchangeId)) {
      throw this.createError(
        TAPSErrorCode.EXCHANGE_NOT_SUPPORTED,
        `Exchange '${exchangeId}' is not supported. Available exchanges: ${ccxt.exchanges.slice(0, 10).join(', ')}...`
      );
    }
    
    // Get exchange class
    const ExchangeClass = (ccxt as any)[exchangeId];
    
    // Create exchange configuration
    const exchangeConfig: any = {
      enableRateLimit: true,
      rateLimit: config?.rateLimit || true,
      options: {
        defaultType: 'spot',
        ...config?.options
      }
    };
    
    // Add credentials if provided
    if (config?.apiKey) {
      exchangeConfig.apiKey = config.apiKey;
      exchangeConfig.secret = config.secret;
      
      // Some exchanges require password
      if (config.password) {
        exchangeConfig.password = config.password;
      }
    }
    
    // Check for environment variables as fallback
    const envPrefix = exchangeId.toUpperCase();
    if (!exchangeConfig.apiKey) {
      const envKey = process.env[`${envPrefix}_API_KEY`];
      const envSecret = process.env[`${envPrefix}_SECRET`];
      
      if (envKey && envSecret) {
        exchangeConfig.apiKey = envKey;
        exchangeConfig.secret = envSecret;
        
        const envPassword = process.env[`${envPrefix}_PASSWORD`];
        if (envPassword) {
          exchangeConfig.password = envPassword;
        }
      }
    }
    
    // Create exchange instance
    const exchange = new ExchangeClass(exchangeConfig);
    
    // Handle testnet/sandbox mode
    if (config?.testnet || config?.sandbox) {
      if (exchange.urls.test) {
        exchange.urls.api = exchange.urls.test;
      } else if (exchangeId === 'binance') {
        // Special handling for Binance testnet
        exchange.urls.api = {
          public: 'https://testnet.binance.vision/api/v3',
          private: 'https://testnet.binance.vision/api/v3',
        };
      } else if (exchangeId === 'bybit') {
        // Special handling for Bybit testnet
        exchange.urls.api = 'https://api-testnet.bybit.com';
      }
    }
    
    // Load markets (this fetches exchange metadata)
    try {
      await exchange.loadMarkets();
    } catch (error: any) {
      // If loading markets fails, exchange might be down
      console.error(`Warning: Failed to load markets for ${exchangeId}:`, error.message);
      // Continue anyway - some operations might still work
    }
    
    return exchange;
  }
  
  /**
   * Generate a unique cache key for an exchange configuration
   * Key format: exchangeId[:testnet][:sandbox][:apiKeyHash]
   * Security: API keys are hashed using SHA-256 to prevent exposure
   *
   * @private
   * @param {string} exchangeId - The exchange identifier
   * @param {ExchangeConfig} [config] - Optional configuration
   * @returns {string} Unique cache key for the exchange configuration
   */
  private getExchangeKey(exchangeId: string, config?: ExchangeConfig): string {
    const parts = [exchangeId];

    if (config?.testnet) parts.push('testnet');
    if (config?.sandbox) parts.push('sandbox');
    if (config?.apiKey) {
      // Hash the API key for security instead of using plaintext prefix
      const hash = crypto.createHash('sha256').update(config.apiKey).digest('hex');
      parts.push(hash.substring(0, 8));
    }

    return parts.join(':');
  }
  
  /**
   * Clear cached exchange instance
   * Closes any open connections before removing from cache
   *
   * @param {string} exchangeId - The exchange identifier
   * @param {ExchangeConfig} [config] - Optional configuration to identify specific instance
   */
  clearExchange(exchangeId: string, config?: ExchangeConfig): void {
    const key = this.getExchangeKey(exchangeId, config);
    const exchange = this.exchanges.get(key);
    
    if (exchange) {
      // Close any open connections
      if (exchange.close) {
        exchange.close();
      }
      
      this.exchanges.delete(key);
    }
  }
  
  /**
   * Clear all cached exchanges
   * Closes all open connections and clears the entire cache
   * Useful for cleanup on server shutdown or reset
   */
  clearAll(): void {
    for (const exchange of this.exchanges.values()) {
      if (exchange.close) {
        exchange.close();
      }
    }
    
    this.exchanges.clear();
  }
  
  /**
   * Get list of all supported exchanges
   *
   * @returns {string[]} Array of all 106+ supported exchange identifiers
   */
  getSupportedExchanges(): string[] {
    return ccxt.exchanges;
  }
  
  /**
   * Check if an exchange is supported
   *
   * @param {string} exchangeId - The exchange identifier to check
   * @returns {boolean} True if the exchange is supported, false otherwise
   */
  isExchangeSupported(exchangeId: string): boolean {
    return ccxt.exchanges.includes(exchangeId);
  }
  
  /**
   * Get exchange capabilities
   * Returns the 'has' object indicating which features are supported
   *
   * @param {string} exchangeId - The exchange identifier
   * @returns {Promise<Record<string, boolean>>} Object mapping capability names to support status
   */
  async getExchangeCapabilities(exchangeId: string): Promise<Record<string, boolean>> {
    const exchange = await this.getExchange(exchangeId);
    return exchange.has;
  }

  /**
   * Execute an exchange operation with adaptive rate limiting and retry logic
   * Uses exponential backoff for retries on rate limit errors
   * Includes 30-second timeout to prevent hanging requests
   *
   * @template T - The return type of the operation
   * @param {string} exchangeId - The exchange identifier
   * @param {(exchange: any) => Promise<T>} operation - The async operation to execute with the exchange instance
   * @param {string} [context] - Optional context description for logging
   * @param {number} [timeout=30000] - Timeout in milliseconds (default: 30 seconds)
   * @returns {Promise<T>} Result of the operation
   * @throws {Error} If timeout exceeded or all retry attempts fail
   */
  async executeWithRateLimit<T>(
    exchangeId: string,
    operation: (exchange: any) => Promise<T>,
    context?: string,
    timeout: number = 30000
  ): Promise<T> {
    // Create timeout promise
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`API request timeout after ${timeout}ms`)), timeout);
    });

    // Race between operation and timeout
    return Promise.race([
      adaptiveRateLimiter.executeWithBackoff(
        exchangeId,
        async () => {
          const exchange = await this.getExchange(exchangeId);
          return operation(exchange);
        },
        context
      ),
      timeoutPromise
    ]);
  }

  /**
   * Create a TAPS-compliant error with standardized error code
   *
   * @private
   * @param {TAPSErrorCode} code - The TAPS error code (e.g., TAPS001)
   * @param {string} message - Human-readable error message
   * @returns {any} Error object with code property
   */
  private createError(code: TAPSErrorCode, message: string): any {
    const error = new Error(message) as any;
    error.code = code;
    return error;
  }
}

// Export singleton instance
export const exchangeManager = ExchangeManager.getInstance();
