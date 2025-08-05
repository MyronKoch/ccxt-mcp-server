/**
 * Adaptive Rate Limiter with Exponential Backoff
 * Implements intelligent retry logic from doggybee's performance optimizations
 */

interface RetryState {
  retryCount: number;
  lastError: Date;
  lastSuccess?: Date;
  consecutiveErrors: number;
}

export class AdaptiveRateLimiter {
  private retryStates: Map<string, RetryState> = new Map();
  private readonly maxRetries: number = 5;
  private readonly baseDelay: number = 1000; // 1 second base delay
  private readonly maxDelay: number = 60000; // 60 seconds max delay
  
  /**
   * Execute an operation with exponential backoff retry logic
   */
  async executeWithBackoff<T>(
    exchangeId: string, 
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    const state = this.getOrCreateState(exchangeId);
    
    // Calculate delay based on retry count
    if (state.retryCount > 0) {
      const delay = this.calculateDelay(state.retryCount);
      await this.sleep(delay);
    }
    
    try {
      const result = await operation();
      
      // Reset state on success
      this.resetState(exchangeId);
      
      return result;
    } catch (error: any) {
      // Update retry state
      state.retryCount++;
      state.lastError = new Date();
      state.consecutiveErrors++;
      
      // Check if we should retry
      if (state.retryCount > this.maxRetries) {
        // Reset state after max retries
        this.resetState(exchangeId);
        
        throw new Error(
          `Max retries (${this.maxRetries}) exceeded for ${exchangeId}${context ? ` (${context})` : ''}. ` +
          `Last error: ${error.message}`
        );
      }
      
      // Check for specific error types that shouldn't be retried
      if (this.isNonRetryableError(error)) {
        this.resetState(exchangeId);
        throw error;
      }
      
      // Log retry attempt
      console.error(
        `Retry ${state.retryCount}/${this.maxRetries} for ${exchangeId}${context ? ` (${context})` : ''}: ${error.message}`
      );
      
      // Recursive retry
      return this.executeWithBackoff(exchangeId, operation, context);
    }
  }
  
  /**
   * Execute multiple operations in parallel with rate limiting
   */
  async executeBatch<T>(
    operations: Array<{
      exchangeId: string;
      operation: () => Promise<T>;
      context?: string;
    }>
  ): Promise<Array<{ success: boolean; result?: T; error?: any }>> {
    // Group operations by exchange to respect per-exchange limits
    const grouped = new Map<string, typeof operations>();
    
    for (const op of operations) {
      if (!grouped.has(op.exchangeId)) {
        grouped.set(op.exchangeId, []);
      }
      grouped.get(op.exchangeId)!.push(op);
    }
    
    // Execute each exchange group with staggered delays
    const results: Array<{ success: boolean; result?: T; error?: any }> = [];
    
    for (const [, ops] of grouped) {
      // Add small delay between different exchanges
      if (results.length > 0) {
        await this.sleep(100);
      }
      
      // Execute operations for this exchange
      for (const op of ops) {
        try {
          const result = await this.executeWithBackoff(
            op.exchangeId,
            op.operation,
            op.context
          );
          results.push({ success: true, result });
        } catch (error) {
          results.push({ success: false, error });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(retryCount: number): number {
    // Exponential backoff with jitter: 2^retries * base + random jitter
    const exponentialDelay = Math.pow(2, retryCount - 1) * this.baseDelay;
    const jitter = Math.random() * 1000; // 0-1000ms jitter
    const delay = Math.min(exponentialDelay + jitter, this.maxDelay);
    
    return Math.floor(delay);
  }
  
  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    // Don't retry authentication errors
    if (error.code === 'INVALID_CREDENTIALS' || 
        error.code === 'PERMISSION_DENIED' ||
        error.message?.includes('API key') ||
        error.message?.includes('authentication')) {
      return true;
    }
    
    // Don't retry invalid symbol/market errors
    if (error.code === 'INVALID_SYMBOL' ||
        error.code === 'MARKET_NOT_AVAILABLE' ||
        error.message?.includes('symbol') ||
        error.message?.includes('market')) {
      return true;
    }
    
    // Don't retry if exchange doesn't support the method
    if (error.code === 'METHOD_NOT_SUPPORTED' ||
        error.message?.includes('not supported') ||
        error.message?.includes('not implemented')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get or create retry state for an exchange
   */
  private getOrCreateState(exchangeId: string): RetryState {
    if (!this.retryStates.has(exchangeId)) {
      this.retryStates.set(exchangeId, {
        retryCount: 0,
        lastError: new Date(),
        consecutiveErrors: 0
      });
    }
    
    return this.retryStates.get(exchangeId)!;
  }
  
  /**
   * Reset retry state for an exchange
   */
  private resetState(exchangeId: string): void {
    const state = this.retryStates.get(exchangeId);
    if (state) {
      state.retryCount = 0;
      state.consecutiveErrors = 0;
      state.lastSuccess = new Date();
    }
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get current state for monitoring
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [exchangeId, state] of this.retryStates) {
      stats[exchangeId] = {
        retryCount: state.retryCount,
        consecutiveErrors: state.consecutiveErrors,
        lastError: state.lastError,
        lastSuccess: state.lastSuccess
      };
    }
    
    return stats;
  }
  
  /**
   * Clear all retry states
   */
  clearAll(): void {
    this.retryStates.clear();
  }
}

// Export singleton instance
export const adaptiveRateLimiter = new AdaptiveRateLimiter();