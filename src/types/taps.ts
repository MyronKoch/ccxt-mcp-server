/**
 * TAPS v1.0 - Trading API Protocol Standard
 * Type definitions for CCXT MCP Server
 */

// Core TAPS Response Format
export interface TAPSResponse<T = any> {
  success: boolean;
  data?: T;
  error?: TAPSError;
  metadata: TAPSMetadata;
}

export interface TAPSError {
  code: string;
  message: string;
  exchange?: string;
  details?: any;
}

export interface TAPSMetadata {
  exchange: string;
  timestamp: number;
  rateLimit: RateLimitInfo;
  version: string;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
}

// Exchange Configuration
export interface ExchangeConfig {
  id: string;
  apiKey?: string;
  secret?: string;
  password?: string;
  testnet?: boolean;
  sandbox?: boolean;
  rateLimit?: number;
  options?: any;
}

// Market Data Types
export interface Ticker {
  symbol: string;
  timestamp?: number;
  datetime?: string;
  high?: number;
  low?: number;
  bid?: number;
  bidVolume?: number;
  ask?: number;
  askVolume?: number;
  vwap?: number;
  open?: number;
  close?: number;
  last?: number;
  previousClose?: number;
  change?: number;
  percentage?: number;
  average?: number;
  baseVolume?: number;
  quoteVolume?: number;
  info?: any;
}

export interface OrderBook {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
  timestamp?: number;
  datetime?: string;
  nonce?: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  datetime: string;
  symbol: string;
  type?: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  cost: number;
  fee?: {
    currency: string;
    cost: number;
    rate?: number;
  };
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Trading Types
export interface Order {
  id: string;
  clientOrderId?: string;
  timestamp: number;
  datetime: string;
  lastTradeTimestamp?: number;
  symbol: string;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  side: 'buy' | 'sell';
  price?: number;
  amount: number;
  cost?: number;
  average?: number;
  filled: number;
  remaining: number;
  status: 'open' | 'closed' | 'canceled' | 'expired' | 'rejected';
  fee?: {
    currency: string;
    cost: number;
    rate?: number;
  };
  trades?: Trade[];
  info?: any;
}

export interface Balance {
  free: { [currency: string]: number };
  used: { [currency: string]: number };
  total: { [currency: string]: number };
  info?: any;
}

// Pagination Support
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  mode?: 'full' | 'summary' | 'minimal';
}

export interface PaginatedResponse<T> extends TAPSResponse<T[]> {
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// Comparison Response Modes
export interface ComparisonOptions extends PaginationOptions {
  maxExchanges?: number;
  includeOrderBook?: boolean;
  includeTrades?: boolean;
}

export interface ComparisonSummary {
  topBid: { exchange: string; price: number; volume: number };
  topAsk: { exchange: string; price: number; volume: number };
  spread: number;
  spreadPercent: number;
  arbitrageOpportunity: boolean;
  potentialProfit: number;
  exchangeCount: number;
  timestamp: number;
}

export interface ComparisonMinimal {
  bestBuy: { exchange: string; price: number };
  bestSell: { exchange: string; price: number };
  profit: number;
}

// Analytics Types
export interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercentage: number;
  potentialProfit: number;
  timestamp: number;
}

export interface MarketStats {
  symbol: string;
  exchanges: {
    [exchange: string]: {
      price: number;
      volume: number;
      spread: number;
      liquidity: number;
    };
  };
  averagePrice: number;
  totalVolume: number;
  priceVariance: number;
}

// Tool Parameter Types
export interface MarketTickerParams {
  exchange: string;
  symbol: string;
}

export interface OrderBookParams {
  exchange: string;
  symbol: string;
  limit?: number;
}

export interface OHLCVParams {
  exchange: string;
  symbol: string;
  timeframe: string;
  since?: number;
  limit?: number;
}

export interface CreateOrderParams {
  exchange: string;
  symbol: string;
  type: 'market' | 'limit';
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
}

export interface CancelOrderParams {
  exchange: string;
  orderId: string;
  symbol?: string;
}

// Additional Tool Parameter Types
export interface ExchangeInitParams {
  exchange: string;
  testnet?: boolean;
  sandbox?: boolean;
}

export interface ExchangeStatusParams {
  exchange: string;
}

export interface ExchangeMarketsParams {
  exchange: string;
  active?: boolean;
}

export interface MarketTradesParams {
  exchange: string;
  symbol: string;
  limit?: number;
}

export interface AccountBalanceParams {
  exchange: string;
  testnet?: boolean;
}

export interface ComparePricesParams {
  symbol: string;
  exchanges?: string[];
  mode?: 'full' | 'summary' | 'minimal';
  maxExchanges?: number;
  page?: number;
  pageSize?: number;
}

export interface IndicatorsCalculateParams {
  exchange: string;
  symbol: string;
  timeframe?: string;
  limit?: number;
  indicators?: string[];
}

export interface ScanArbitrageParams {
  symbol: string;
  exchanges?: string[];
  minProfitPercent?: number;
  maxRiskScore?: number;
  minVolume?: number;
  includeWithdrawalFees?: boolean;
  includeTradingFees?: boolean;
}

export interface CalculateRiskParams {
  trades: Array<{
    profit: number;
    profitPercent?: number;
  }>;
}

export interface PositionSizeParams {
  accountBalance: number;
  entryPrice: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  volatility?: number;
  stopLossPercent?: number;
  takeProfitRatio?: number;
}

// Error Codes
export enum TAPSErrorCode {
  EXCHANGE_NOT_SUPPORTED = 'TAPS001',
  INVALID_CREDENTIALS = 'TAPS002',
  RATE_LIMIT_EXCEEDED = 'TAPS003',
  INSUFFICIENT_BALANCE = 'TAPS004',
  INVALID_ORDER_PARAMS = 'TAPS005',
  MARKET_NOT_AVAILABLE = 'TAPS006',
  EXCHANGE_MAINTENANCE = 'TAPS007',
  NETWORK_ERROR = 'TAPS008',
  ORDER_NOT_FOUND = 'TAPS009',
  PERMISSION_DENIED = 'TAPS010',
  INVALID_SYMBOL = 'TAPS011',
  METHOD_NOT_SUPPORTED = 'TAPS012',
  UNKNOWN_ERROR = 'TAPS999'
}

// MCP Tool Definitions
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
