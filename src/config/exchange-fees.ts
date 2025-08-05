/**
 * Exchange-Specific Fee Configuration
 * Real-world fee structures for major cryptocurrency exchanges
 * Updated as of 2024 - Verify current fees before production use
 */

export interface ExchangeFees {
  maker: number;      // Maker fee (placing limit orders)
  taker: number;      // Taker fee (taking from order book)
  withdrawal: number; // Typical withdrawal fee in USD
}

/**
 * Fee structures by exchange
 * Source: Official exchange documentation (as of 2024)
 */
export const EXCHANGE_FEES: Record<string, ExchangeFees> = {
  // Major Exchanges (US-Friendly)
  binance: {
    maker: 0.001,      // 0.1%
    taker: 0.001,      // 0.1%
    withdrawal: 15     // ~$15 for BTC, varies by coin
  },
  coinbase: {
    maker: 0.004,      // 0.4%
    taker: 0.006,      // 0.6%
    withdrawal: 25     // Higher fees, varies by coin
  },
  kraken: {
    maker: 0.0016,     // 0.16%
    taker: 0.0026,     // 0.26%
    withdrawal: 10     // Varies by coin
  },
  gemini: {
    maker: 0.001,      // 0.1%
    taker: 0.0035,     // 0.35%
    withdrawal: 20     // Varies by coin
  },

  // International Exchanges
  bybit: {
    maker: 0.001,      // 0.1%
    taker: 0.001,      // 0.1%
    withdrawal: 12     // Varies by coin
  },
  okx: {
    maker: 0.0008,     // 0.08%
    taker: 0.001,      // 0.1%
    withdrawal: 10     // Varies by coin
  },
  gateio: {
    maker: 0.002,      // 0.2%
    taker: 0.002,      // 0.2%
    withdrawal: 15     // Varies by coin
  },
  kucoin: {
    maker: 0.001,      // 0.1%
    taker: 0.001,      // 0.1%
    withdrawal: 10     // Varies by coin
  },
  bitget: {
    maker: 0.001,      // 0.1%
    taker: 0.001,      // 0.1%
    withdrawal: 12     // Varies by coin
  },
  mexc: {
    maker: 0.0002,     // 0.02%
    taker: 0.0002,     // 0.02%
    withdrawal: 8      // Lower fees
  },
  huobi: {
    maker: 0.002,      // 0.2%
    taker: 0.002,      // 0.2%
    withdrawal: 15     // Varies by coin
  },
  bitfinex: {
    maker: 0.001,      // 0.1%
    taker: 0.002,      // 0.2%
    withdrawal: 20     // Varies by coin
  },
  bitstamp: {
    maker: 0.004,      // 0.4%
    taker: 0.005,      // 0.5%
    withdrawal: 15     // Varies by coin
  },

  // Derivatives Exchanges
  binanceusdm: {
    maker: 0.0002,     // 0.02%
    taker: 0.0004,     // 0.04%
    withdrawal: 10     // USDT withdrawal
  },
  deribit: {
    maker: 0.0002,     // 0.02%
    taker: 0.0005,     // 0.05%
    withdrawal: 5      // Low withdrawal fees
  },
  phemex: {
    maker: -0.00025,   // -0.025% (rebate)
    taker: 0.00075,    // 0.075%
    withdrawal: 8      // Varies by coin
  },
  bitmex: {
    maker: -0.00025,   // -0.025% (rebate)
    taker: 0.00075,    // 0.075%
    withdrawal: 10     // Bitcoin network fees
  }
};

/**
 * Default fee structure for unknown exchanges
 * Conservative estimates to avoid underestimating costs
 */
export const DEFAULT_FEES: ExchangeFees = {
  maker: 0.002,      // 0.2% (conservative)
  taker: 0.002,      // 0.2% (conservative)
  withdrawal: 20     // $20 (conservative)
};

/**
 * Get fee structure for an exchange
 * Returns default fees if exchange is not in the configuration
 *
 * @param exchangeId - Exchange identifier
 * @returns Fee structure for the exchange
 */
export function getExchangeFees(exchangeId: string): ExchangeFees {
  return EXCHANGE_FEES[exchangeId.toLowerCase()] || DEFAULT_FEES;
}

/**
 * Calculate total trading fee for a transaction
 *
 * @param exchangeId - Exchange identifier
 * @param price - Transaction price
 * @param isMaker - Whether this is a maker order (limit order)
 * @returns Fee amount in USD
 */
export function calculateTradingFee(
  exchangeId: string,
  price: number,
  isMaker: boolean = false
): number {
  const fees = getExchangeFees(exchangeId);
  const feeRate = isMaker ? fees.maker : fees.taker;
  return price * feeRate;
}

/**
 * Calculate withdrawal fee for an exchange
 *
 * @param exchangeId - Exchange identifier
 * @returns Withdrawal fee in USD
 */
export function getWithdrawalFee(exchangeId: string): number {
  const fees = getExchangeFees(exchangeId);
  return fees.withdrawal;
}

/**
 * Calculate total fees for an arbitrage trade
 *
 * @param buyExchange - Exchange to buy from
 * @param sellExchange - Exchange to sell on
 * @param buyPrice - Buy price
 * @param sellPrice - Sell price
 * @param includeWithdrawal - Whether to include withdrawal fees
 * @returns Total fees breakdown
 */
export function calculateArbitrageFees(
  buyExchange: string,
  sellExchange: string,
  buyPrice: number,
  sellPrice: number,
  includeWithdrawal: boolean = true
): {
  buyFee: number;
  sellFee: number;
  withdrawalFee: number;
  totalFees: number;
} {
  // Use taker fees (assuming immediate execution for arbitrage)
  const buyFee = calculateTradingFee(buyExchange, buyPrice, false);
  const sellFee = calculateTradingFee(sellExchange, sellPrice, false);

  // Withdrawal fee only if transferring between exchanges
  const withdrawalFee =
    includeWithdrawal && buyExchange !== sellExchange
      ? getWithdrawalFee(buyExchange)
      : 0;

  return {
    buyFee,
    sellFee,
    withdrawalFee,
    totalFees: buyFee + sellFee + withdrawalFee
  };
}
