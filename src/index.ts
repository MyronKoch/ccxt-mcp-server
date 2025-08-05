#!/usr/bin/env node
/**
 * CCXT MCP Server - TAPS v1.0 Compliant
 * Provides unified access to 100+ cryptocurrency exchanges
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import ccxt from 'ccxt';
import dotenv from 'dotenv';

import { exchangeManager } from './exchange-manager.js';
import { ResponseFormatter } from './response-formatter.js';
import { ValidationUtils } from './utils/validation.js';
import { marketDataCache } from './cache/lru-cache-manager.js';
import { technicalIndicators } from './indicators/technical-analysis.js';
import { arbitrageScanner } from './arbitrage/advanced-scanner.js';
import { riskManager } from './risk/risk-manager.js';
import {
  TAPSResponse,
  ToolDefinition,
  MarketTickerParams,
  OrderBookParams,
  OHLCVParams,
  ComparisonSummary,
  ComparisonMinimal,
  ExchangeInitParams,
  ExchangeStatusParams,
  ExchangeMarketsParams,
  MarketTradesParams,
  AccountBalanceParams,
  ComparePricesParams,
  IndicatorsCalculateParams,
  ScanArbitrageParams,
  CalculateRiskParams,
  PositionSizeParams
} from './types/taps.js';

// Load environment variables
const envResult = dotenv.config();
if (envResult.error && process.env.NODE_ENV !== 'production') {
  console.warn('Warning: .env file not found or malformed. Using environment variables or defaults.');
}

// Server metadata
const SERVER_NAME = 'ccxt-mcp-server';
const SERVER_VERSION = '1.0.0';
const TAPS_VERSION = 'TAPS-1.0.0';

// Create MCP server instance
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS: ToolDefinition[] = [
  // Exchange Management Tools
  {
    name: 'exchange_list',
    description: 'List all supported cryptocurrency exchanges (100+ exchanges)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'exchange_init',
    description: 'Initialize connection to a specific exchange',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID (e.g., binance, coinbase, kraken)' 
        },
        testnet: { 
          type: 'boolean', 
          description: 'Use testnet/sandbox mode if available',
          default: false
        },
      },
      required: ['exchange'],
    },
  },
  {
    name: 'exchange_status',
    description: 'Check if an exchange is operational and get its capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
      },
      required: ['exchange'],
    },
  },
  {
    name: 'exchange_markets',
    description: 'Get all available trading pairs/markets for an exchange',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
        active: {
          type: 'boolean',
          description: 'Filter for active markets only',
          default: true
        },
      },
      required: ['exchange'],
    },
  },
  
  // Market Data Tools
  {
    name: 'market_ticker',
    description: 'Get current price ticker for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
        symbol: { 
          type: 'string', 
          description: 'Trading pair (e.g., BTC/USDT, ETH/BTC)' 
        },
      },
      required: ['exchange', 'symbol'],
    },
  },
  {
    name: 'market_orderbook',
    description: 'Get order book (bids and asks) for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
        symbol: { 
          type: 'string', 
          description: 'Trading pair' 
        },
        limit: { 
          type: 'number', 
          description: 'Number of order book entries (default: 20)',
          default: 20
        },
      },
      required: ['exchange', 'symbol'],
    },
  },
  {
    name: 'market_trades',
    description: 'Get recent trades for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
        symbol: { 
          type: 'string', 
          description: 'Trading pair' 
        },
        limit: { 
          type: 'number', 
          description: 'Number of trades to fetch (default: 50)',
          default: 50
        },
      },
      required: ['exchange', 'symbol'],
    },
  },
  {
    name: 'market_ohlcv',
    description: 'Get OHLCV (candlestick) data for a trading pair',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange ID' 
        },
        symbol: { 
          type: 'string', 
          description: 'Trading pair' 
        },
        timeframe: { 
          type: 'string', 
          description: 'Timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M)',
          default: '1h'
        },
        limit: { 
          type: 'number', 
          description: 'Number of candles to fetch (default: 100)',
          default: 100
        },
      },
      required: ['exchange', 'symbol'],
    },
  },
  
  // Account Management Tools (requires API keys)
  {
    name: 'account_balance',
    description: 'Get account balance (requires API credentials set in environment variables)',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: {
          type: 'string',
          description: 'Exchange ID (credentials must be set as EXCHANGEID_API_KEY and EXCHANGEID_SECRET environment variables)'
        },
      },
      required: ['exchange'],
    },
  },
  
  // Analytics Tools
  {
    name: 'analytics_compare_prices',
    description: 'Compare prices for a symbol across multiple exchanges (supports modes: full, summary, minimal)',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { 
          type: 'string', 
          description: 'Trading pair to compare (e.g., BTC/USDT)' 
        },
        exchanges: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of exchange IDs to compare',
          default: ['binance', 'coinbase', 'kraken', 'bybit', 'okx']
        },
        mode: {
          type: 'string',
          enum: ['full', 'summary', 'minimal'],
          description: 'Response mode: full (all data), summary (key metrics), minimal (best prices only)',
          default: 'summary'
        },
        maxExchanges: {
          type: 'number',
          description: 'Maximum number of exchanges to query (helps prevent token overflow)',
          default: 10
        },
        page: {
          type: 'number',
          description: 'Page number for paginated results (full mode only)',
          default: 1
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (full mode only)',
          default: 5
        }
      },
      required: ['symbol'],
    },
  },

  // Technical Indicator Tools
  {
    name: 'indicators_calculate',
    description: 'Calculate technical indicators (RSI, MACD, Bollinger Bands, ATR, Stochastic, Ichimoku) from OHLCV data',
    inputSchema: {
      type: 'object',
      properties: {
        exchange: {
          type: 'string',
          description: 'Exchange ID'
        },
        symbol: {
          type: 'string',
          description: 'Trading pair (e.g., BTC/USDT)'
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w)',
          default: '1h'
        },
        limit: {
          type: 'number',
          description: 'Number of candles to fetch (minimum 52 for all indicators)',
          default: 100
        },
        indicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific indicators to calculate (rsi, macd, bollingerBands, atr, stochastic, ichimoku). If empty, calculates all.',
          default: []
        }
      },
      required: ['exchange', 'symbol'],
    },
  },

  // Advanced Analytics Tools
  {
    name: 'analytics_scan_arbitrage',
    description: 'Scan for arbitrage opportunities across multiple exchanges with risk scoring and fee calculations',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Trading pair to scan (e.g., BTC/USDT)'
        },
        exchanges: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exchanges to scan (defaults to major exchanges)',
          default: ['binance', 'coinbase', 'kraken', 'okx', 'gateio', 'kucoin']
        },
        minProfitPercent: {
          type: 'number',
          description: 'Minimum profit percentage to consider (default: 0.1%)',
          default: 0.1
        },
        maxRiskScore: {
          type: 'number',
          description: 'Maximum risk score (1-10, default: 7)',
          default: 7
        },
        minVolume: {
          type: 'number',
          description: 'Minimum volume in USD (default: 100)',
          default: 100
        },
        includeWithdrawalFees: {
          type: 'boolean',
          description: 'Include withdrawal fees in calculations',
          default: true
        },
        includeTradingFees: {
          type: 'boolean',
          description: 'Include trading fees in calculations',
          default: true
        }
      },
      required: ['symbol']
    }
  },
  {
    name: 'analytics_calculate_risk',
    description: 'Calculate comprehensive risk metrics (Sharpe Ratio, Max Drawdown, Kelly Criterion) from trade history',
    inputSchema: {
      type: 'object',
      properties: {
        trades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              profit: { type: 'number', description: 'Trade profit/loss in USD' },
              profitPercent: { type: 'number', description: 'Trade profit/loss as percentage' }
            },
            required: ['profit']
          },
          description: 'Array of completed trades with profit data'
        }
      },
      required: ['trades']
    }
  },
  {
    name: 'analytics_position_size',
    description: 'Calculate optimal position size using Kelly Criterion with risk management',
    inputSchema: {
      type: 'object',
      properties: {
        accountBalance: {
          type: 'number',
          description: 'Total account balance in USD'
        },
        entryPrice: {
          type: 'number',
          description: 'Planned entry price'
        },
        winRate: {
          type: 'number',
          description: 'Historical win rate percentage (0-100)'
        },
        avgWin: {
          type: 'number',
          description: 'Average winning trade amount in USD'
        },
        avgLoss: {
          type: 'number',
          description: 'Average losing trade amount in USD'
        },
        volatility: {
          type: 'number',
          description: 'Market volatility (0.01 = 1%, default: 0.02)',
          default: 0.02
        },
        stopLossPercent: {
          type: 'number',
          description: 'Stop loss percentage (default: 0.02 = 2%)',
          default: 0.02
        },
        takeProfitRatio: {
          type: 'number',
          description: 'Take profit ratio (default: 2 = 2:1 risk/reward)',
          default: 2
        }
      },
      required: ['accountBalance', 'entryPrice', 'winRate', 'avgWin', 'avgLoss']
    }
  },
];

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    let result: TAPSResponse;
    
    switch (name) {
      // Exchange Management Tools
      case 'exchange_list':
        result = await handleExchangeList();
        break;
        
      case 'exchange_init':
        result = await handleExchangeInit(args as unknown as ExchangeInitParams);
        break;

      case 'exchange_status':
        result = await handleExchangeStatus(args as unknown as ExchangeStatusParams);
        break;

      case 'exchange_markets':
        result = await handleExchangeMarkets(args as unknown as ExchangeMarketsParams);
        break;

      // Market Data Tools
      case 'market_ticker':
        result = await handleMarketTicker(args as unknown as MarketTickerParams);
        break;

      case 'market_orderbook':
        result = await handleMarketOrderbook(args as unknown as OrderBookParams);
        break;

      case 'market_trades':
        result = await handleMarketTrades(args as unknown as MarketTradesParams);
        break;

      case 'market_ohlcv':
        result = await handleMarketOHLCV(args as unknown as OHLCVParams);
        break;

      // Account Tools
      case 'account_balance':
        result = await handleAccountBalance(args as unknown as AccountBalanceParams);
        break;

      // Analytics Tools
      case 'analytics_compare_prices':
        result = await handleComparePrices(args as unknown as ComparePricesParams);
        break;

      // Technical Indicator Tools
      case 'indicators_calculate':
        result = await handleIndicatorsCalculate(args as unknown as IndicatorsCalculateParams);
        break;

      // Advanced Analytics Tools
      case 'analytics_scan_arbitrage':
        result = await handleScanArbitrage(args as unknown as ScanArbitrageParams);
        break;

      case 'analytics_calculate_risk':
        result = await handleCalculateRisk(args as unknown as CalculateRiskParams);
        break;

      case 'analytics_position_size':
        result = await handlePositionSize(args as unknown as PositionSizeParams);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    // Return formatted response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: unknown) {
    // Format error response
    const errorObj = error as any;
    const exchange = (args as any)?.exchange as string | undefined;
    const errorResponse = ResponseFormatter.error(errorObj, exchange || 'unknown');
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
    };
  }
});

// Tool Implementation Functions

/**
 * Handles the exchange_list tool request
 * Returns a categorized list of all supported cryptocurrency exchanges
 *
 * @returns {Promise<TAPSResponse>} Response containing exchange lists grouped by type (major, derivatives, decentralized)
 */
async function handleExchangeList(): Promise<TAPSResponse> {
  const exchanges = ccxt.exchanges;
  
  // Group exchanges by region/type for better organization
  const categorized = {
    total: exchanges.length,
    major: ['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'huobi', 'kucoin', 'gate', 'bitfinex', 'bitstamp'],
    derivatives: ['binanceusdm', 'bybit', 'okx', 'deribit', 'phemex', 'bitmex'],
    decentralized: ['uniswap', 'sushiswap', 'pancakeswap'],
    all: exchanges
  };
  
  return ResponseFormatter.success(categorized, 'system');
}

/**
 * Handles the exchange_init tool request
 * Initializes a connection to a specific exchange and returns its capabilities
 *
 * @param {ExchangeInitParams} args - Arguments containing exchange ID, testnet flag, and sandbox flag
 * @returns {Promise<TAPSResponse>} Response containing exchange info, rate limits, and supported features
 */
async function handleExchangeInit(args: ExchangeInitParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  
  const exchange = await exchangeManager.getExchange(args.exchange, {
    id: args.exchange,
    testnet: args.testnet || false,
    sandbox: args.sandbox || false,
  });
  
  const info = {
    id: exchange.id,
    name: exchange.name,
    countries: exchange.countries,
    rateLimit: exchange.rateLimit,
    testnet: args.testnet || false,
    urls: exchange.urls.www,
    version: exchange.version,
    capabilities: {
      CORS: exchange.has['CORS'],
      spot: exchange.has['spot'],
      futures: exchange.has['futures'],
      publicAPI: exchange.has['publicAPI'],
      privateAPI: exchange.has['privateAPI'],
      cancelOrder: exchange.has['cancelOrder'],
      createOrder: exchange.has['createOrder'],
      fetchBalance: exchange.has['fetchBalance'],
      fetchClosedOrders: exchange.has['fetchClosedOrders'],
      fetchCurrencies: exchange.has['fetchCurrencies'],
      fetchMarkets: exchange.has['fetchMarkets'],
      fetchMyTrades: exchange.has['fetchMyTrades'],
      fetchOHLCV: exchange.has['fetchOHLCV'],
      fetchOpenOrders: exchange.has['fetchOpenOrders'],
      fetchOrder: exchange.has['fetchOrder'],
      fetchOrderBook: exchange.has['fetchOrderBook'],
      fetchTicker: exchange.has['fetchTicker'],
      fetchTickers: exchange.has['fetchTickers'],
      fetchTrades: exchange.has['fetchTrades'],
    },
    status: 'initialized'
  };
  
  return ResponseFormatter.success(info, args.exchange);
}

/**
 * Handles the exchange_status tool request
 * Checks if an exchange is operational by testing connectivity with a sample ticker fetch
 *
 * @param {ExchangeStatusParams} args - Arguments containing exchange ID
 * @returns {Promise<TAPSResponse>} Response containing operational status and available markets count
 */
async function handleExchangeStatus(args: ExchangeStatusParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  
  try {
    const exchange = await exchangeManager.getExchange(args.exchange);
    
    // Try to fetch a ticker to verify connection
    const markets = await exchange.fetchMarkets();
    const firstMarket = markets[0];
    
    let testResult = { success: false, message: '' };
    
    if (firstMarket && exchange.has['fetchTicker']) {
      try {
        await exchange.fetchTicker(firstMarket.symbol);
        testResult = { success: true, message: 'Exchange is operational' };
      } catch (e: any) {
        testResult = { success: false, message: `Exchange test failed: ${e.message}` };
      }
    }
    
    return ResponseFormatter.success({
      operational: testResult.success,
      message: testResult.message,
      marketsAvailable: markets.length,
      capabilities: exchange.has
    }, args.exchange);
  } catch (error) {
    return ResponseFormatter.error(error, args.exchange);
  }
}

/**
 * Handles the exchange_markets tool request
 * Fetches all available trading pairs from an exchange with optional filtering for active markets
 * Results are cached for 1 hour to improve performance
 *
 * @param {ExchangeMarketsParams} args - Arguments containing exchange ID and optional active filter (default: true)
 * @returns {Promise<TAPSResponse>} Response containing market summary with symbol, base/quote currencies, and trading limits
 */
async function handleExchangeMarkets(args: ExchangeMarketsParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);

  // Check cache first
  const cached = marketDataCache.getMarkets(args.exchange);
  if (cached) {
    // Apply active filter to cached data
    const filtered = args.active !== false
      ? cached.markets.filter((m: any) => m.active)
      : cached.markets;

    return ResponseFormatter.success({
      ...cached,
      markets: filtered,
      cached: true
    }, args.exchange);
  }

  const exchange = await exchangeManager.getExchange(args.exchange);
  const markets = await exchange.fetchMarkets();

  const filtered = args.active !== false
    ? markets.filter((m: any) => m.active)
    : markets;

  const summary = {
    total: filtered.length,
    active: filtered.filter((m: any) => m.active).length,
    spot: filtered.filter((m: any) => m.spot).length,
    futures: filtered.filter((m: any) => m.futures).length,
    markets: filtered.map((m: any) => ({
      symbol: m.symbol,
      base: m.base,
      quote: m.quote,
      active: m.active,
      type: m.type,
      spot: m.spot,
      futures: m.futures,
      limits: m.limits
    }))
  };

  // Cache the full markets data (before filtering)
  marketDataCache.setMarkets(args.exchange, summary);

  return ResponseFormatter.success(summary, args.exchange);
}

/**
 * Handles the market_ticker tool request
 * Fetches current price ticker for a specific trading pair
 * Results are cached for 10 seconds to reduce API calls
 *
 * @param {MarketTickerParams} args - Arguments containing exchange ID and symbol (e.g., BTC/USDT)
 * @returns {Promise<TAPSResponse>} Response containing bid, ask, last price, volume, and 24h change data
 */
async function handleMarketTicker(args: MarketTickerParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  
  // Check cache first
  const cached = marketDataCache.getTicker(args.exchange, symbol);
  if (cached) {
    return ResponseFormatter.success({
      ...cached,
      cached: true,
      cacheAge: Date.now() - cached.timestamp
    }, args.exchange);
  }
  
  // Use rate limiter for resilient API calls
  const ticker = await exchangeManager.executeWithRateLimit(
    args.exchange,
    async (exchange) => {
      if (!exchange.has['fetchTicker']) {
        throw new Error(`Exchange ${args.exchange} does not support fetching tickers`);
      }
      return await exchange.fetchTicker(symbol);
    },
    'market_ticker'
  );
  
  // Cache the result
  const tickerData = {
    symbol: ticker.symbol,
    timestamp: ticker.timestamp,
    datetime: ticker.datetime,
    bid: ticker.bid,
    ask: ticker.ask,
    last: ticker.last,
    close: ticker.close,
    baseVolume: ticker.baseVolume,
    quoteVolume: ticker.quoteVolume,
    percentage: ticker.percentage,
    change: ticker.change,
    vwap: ticker.vwap,
    high: ticker.high,
    low: ticker.low
  };
  
  marketDataCache.setTicker(args.exchange, symbol, tickerData);
  
  return ResponseFormatter.success(tickerData, args.exchange);
}

/**
 * Handles the market_orderbook tool request
 * Fetches current order book (bids/asks) for a specific trading pair
 * Results are cached for 5 seconds due to high volatility
 *
 * @param {OrderBookParams} args - Arguments containing exchange ID, symbol, and optional limit (default: 100)
 * @returns {Promise<TAPSResponse>} Response containing arrays of bids and asks with prices and volumes
 */
async function handleMarketOrderbook(args: OrderBookParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const limit = ValidationUtils.validateLimit(args.limit, 100);
  
  // Check cache first
  const cached = marketDataCache.getOrderBook(args.exchange, symbol, limit);
  if (cached) {
    return ResponseFormatter.success({
      ...cached,
      cached: true,
      cacheAge: Date.now() - cached.timestamp
    }, args.exchange);
  }
  
  // Use rate limiter for resilient API calls
  const orderbook = await exchangeManager.executeWithRateLimit(
    args.exchange,
    async (exchange) => {
      if (!exchange.has['fetchOrderBook']) {
        throw new Error(`Exchange ${args.exchange} does not support fetching order books`);
      }
      return await exchange.fetchOrderBook(symbol, limit);
    },
    'market_orderbook'
  );
  
  // Validate orderbook data before calculating spread
  const validAsk = orderbook.asks?.[0]?.[0];
  const validBid = orderbook.bids?.[0]?.[0];
  const hasValidSpread = validAsk && validBid && validBid > 0;

  const orderbookData = {
    symbol: orderbook.symbol,
    timestamp: orderbook.timestamp,
    datetime: orderbook.datetime,
    nonce: orderbook.nonce,
    bids: orderbook.bids.slice(0, limit),
    asks: orderbook.asks.slice(0, limit),
    spread: hasValidSpread ? validAsk - validBid : null,
    spreadPercentage: hasValidSpread ? ((validAsk - validBid) / validBid) * 100 : null
  };
  
  // Cache the result
  marketDataCache.setOrderBook(args.exchange, symbol, orderbookData, limit);
  
  return ResponseFormatter.success(orderbookData, args.exchange);
}

/**
 * Handles the market_trades tool request
 * Fetches recent trades for a specific trading pair
 * Results are cached for 10 seconds
 *
 * @param {MarketTradesParams} args - Arguments containing exchange ID, symbol, and optional limit (default: 100)
 * @returns {Promise<TAPSResponse>} Response containing array of recent trades with price, amount, side, and timestamp
 */
async function handleMarketTrades(args: MarketTradesParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const limit = ValidationUtils.validateLimit(args.limit, 100);

  // Check cache first
  const cached = marketDataCache.getTrades(args.exchange, symbol, limit);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return ResponseFormatter.success({
      trades: cached,
      cached: true,
      cacheAge: Date.now() - (cached[0]?.timestamp || Date.now())
    }, args.exchange);
  }

  // Use rate limiter for resilient API calls
  const trades = await exchangeManager.executeWithRateLimit(
    args.exchange,
    async (exchange) => {
      if (!exchange.has['fetchTrades']) {
        throw new Error(`Exchange ${args.exchange} does not support fetching trades`);
      }
      return await exchange.fetchTrades(symbol, undefined, limit);
    },
    'market_trades'
  );

  const formatted = trades.map((t: any) => ({
    id: t.id,
    timestamp: t.timestamp,
    datetime: t.datetime,
    symbol: t.symbol,
    side: t.side,
    price: t.price,
    amount: t.amount,
    cost: t.cost
  }));

  // Cache the result
  marketDataCache.setTrades(args.exchange, symbol, formatted, limit);

  return ResponseFormatter.success(formatted, args.exchange);
}

/**
 * Handles the market_ohlcv tool request
 * Fetches candlestick/OHLCV (Open, High, Low, Close, Volume) data for technical analysis
 * Results are cached for 1 minute
 *
 * @param {OHLCVParams} args - Arguments containing exchange ID, symbol, timeframe (e.g., 1m, 5m, 1h, 1d), optional since timestamp, and limit (default: 500)
 * @returns {Promise<TAPSResponse>} Response containing array of candles with OHLCV data
 */
async function handleMarketOHLCV(args: OHLCVParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const timeframe = args.timeframe || '1h';
  ValidationUtils.validateTimeframe(timeframe);
  const limit = ValidationUtils.validateLimit(args.limit, 500);

  // Check cache first
  const cached = marketDataCache.getOHLCV(args.exchange, symbol, timeframe);
  if (cached) {
    return ResponseFormatter.success({
      ...cached,
      cached: true,
      cacheAge: Date.now() - (cached.candles?.[0]?.timestamp || Date.now())
    }, args.exchange);
  }

  const exchange = await exchangeManager.getExchange(args.exchange);

  if (!exchange.has['fetchOHLCV']) {
    throw new Error(`Exchange ${args.exchange} does not support fetching OHLCV data`);
  }

  const ohlcv = await exchange.fetchOHLCV(
    symbol,
    timeframe,
    args.since,
    limit
  );

  const formatted = ohlcv.map((candle: any) => ({
    timestamp: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5]
  }));

  const result = {
    symbol,
    timeframe,
    candles: formatted
  };

  // Cache the result
  marketDataCache.setOHLCV(args.exchange, symbol, timeframe, result);

  return ResponseFormatter.success(result, args.exchange);
}

/**
 * Handles the account_balance tool request
 * Fetches account balances from an exchange using credentials from environment variables
 * Security: API credentials are ONLY loaded from environment variables, never from parameters
 *
 * @param {AccountBalanceParams} args - Arguments containing exchange ID and optional testnet flag
 * @returns {Promise<TAPSResponse>} Response containing free, used, and total balances for all non-zero currencies
 * @throws {Error} If API credentials are not found in environment variables
 */
async function handleAccountBalance(args: AccountBalanceParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  
  // Get credentials from environment only (security: no credentials in parameters)
  const apiKey = process.env[`${args.exchange.toUpperCase()}_API_KEY`];
  const secret = process.env[`${args.exchange.toUpperCase()}_SECRET`];
  
  ValidationUtils.validateCredentials(apiKey, secret);

  // Initialize exchange instance with credentials first
  await exchangeManager.getExchange(args.exchange, {
    id: args.exchange,
    apiKey,
    secret,
    testnet: args.testnet
  });

  // Use rate limiter for resilient API calls
  const balance: any = await exchangeManager.executeWithRateLimit(
    args.exchange,
    async (exchange) => {
      if (!exchange.has['fetchBalance']) {
        throw new Error(`Exchange ${args.exchange} does not support fetching balance`);
      }
      return await exchange.fetchBalance();
    },
    'account_balance'
  );

  // Filter out zero balances for cleaner response
  const nonZeroBalances: any = {};
  for (const currency in balance.total) {
    if (balance.total[currency] > 0) {
      nonZeroBalances[currency] = {
        free: balance.free[currency],
        used: balance.used[currency],
        total: balance.total[currency]
      };
    }
  }
  
  return ResponseFormatter.success(nonZeroBalances, args.exchange);
}

/**
 * Handles the compare_prices tool request
 * Compares prices for a symbol across multiple exchanges to identify arbitrage opportunities
 * Supports three response modes: minimal, summary (default), and full
 *
 * @param {ComparePricesParams} args - Arguments containing symbol, optional exchanges list (default: top 5), mode, maxExchanges (default: 10), pagination options
 * @returns {Promise<TAPSResponse>} Response format depends on mode:
 *   - minimal: Best buy/sell exchanges and potential profit
 *   - summary: Detailed arbitrage analysis with spread percentage
 *   - full: Complete price data from all exchanges with pagination
 */
async function handleComparePrices(args: ComparePricesParams): Promise<TAPSResponse> {
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const mode = args.mode || 'summary';
  const maxExchanges = args.maxExchanges || 10;
  const page = args.page || 1;
  const pageSize = args.pageSize || 5;
  
  // Limit exchanges to prevent token overflow
  let exchanges = args.exchanges || ['binance', 'coinbase', 'kraken', 'bybit', 'okx'];
  exchanges = exchanges.slice(0, maxExchanges);
  
  const results = await Promise.allSettled(
    exchanges.map(async (exchangeId: string) => {
      try {
        const exchange = await exchangeManager.getExchange(exchangeId);
        
        if (!exchange.has['fetchTicker']) {
          return { exchange: exchangeId, error: 'Ticker not supported' };
        }
        
        const ticker = await exchange.fetchTicker(symbol);
        
        return {
          exchange: exchangeId,
          bid: ticker.bid,
          ask: ticker.ask,
          last: ticker.last,
          volume: ticker.baseVolume,
          timestamp: ticker.timestamp
        };
      } catch (error: any) {
        return {
          exchange: exchangeId,
          error: error.message
        };
      }
    })
  );
  
  // Extract successful price fetches and separate errors
  const prices = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as any).value)
    .filter(p => !p.error);

  const errors = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as any).value)
    .filter(p => p.error);

  // Arbitrage detection: Find the best buy price (lowest ask) and best sell price (highest bid)
  // Arbitrage exists when you can buy on one exchange cheaper than you can sell on another
  const lowestAsk = prices
    .filter(p => p.ask)
    .sort((a, b) => a.ask - b.ask)[0];  // Sort ascending to find lowest ask price

  const highestBid = prices
    .filter(p => p.bid)
    .sort((a, b) => b.bid - a.bid)[0];  // Sort descending to find highest bid price

  // Profitable arbitrage: Buy at lowestAsk, sell at highestBid
  // Only profitable if highestBid > lowestAsk (accounting for fees is done separately)
  const hasArbitrage = lowestAsk && highestBid && highestBid.bid > lowestAsk.ask;
  const profit = hasArbitrage ? highestBid.bid - lowestAsk.ask : 0;
  
  // Return based on mode
  if (mode === 'minimal') {
    const minimal: ComparisonMinimal = {
      bestBuy: lowestAsk ? { exchange: lowestAsk.exchange, price: lowestAsk.ask } : { exchange: 'none', price: 0 },
      bestSell: highestBid ? { exchange: highestBid.exchange, price: highestBid.bid } : { exchange: 'none', price: 0 },
      profit
    };
    return ResponseFormatter.success(minimal, 'multi-exchange');
  }
  
  if (mode === 'summary') {
    const summary: ComparisonSummary = {
      topBid: highestBid ? {
        exchange: highestBid.exchange,
        price: highestBid.bid,
        volume: highestBid.volume || 0
      } : { exchange: 'none', price: 0, volume: 0 },
      topAsk: lowestAsk ? {
        exchange: lowestAsk.exchange,
        price: lowestAsk.ask,
        volume: lowestAsk.volume || 0
      } : { exchange: 'none', price: 0, volume: 0 },
      spread: highestBid && lowestAsk ? highestBid.bid - lowestAsk.ask : 0,
      spreadPercent: (lowestAsk && highestBid && lowestAsk.ask !== 0)
        ? ((highestBid.bid - lowestAsk.ask) / lowestAsk.ask) * 100
        : 0,
      arbitrageOpportunity: hasArbitrage,
      potentialProfit: profit,
      exchangeCount: prices.length,
      timestamp: Date.now()
    };
    return ResponseFormatter.success(summary, 'multi-exchange');
  }
  
  // Full mode with pagination
  const validPrices = prices.filter(p => p.last);
  const avgPrice = validPrices.length > 0
    ? validPrices.reduce((sum, p) => sum + p.last, 0) / validPrices.length
    : 0;
    
  const minPrice = validPrices.length > 0
    ? Math.min(...validPrices.map(p => p.last))
    : 0;
    
  const maxPrice = validPrices.length > 0
    ? Math.max(...validPrices.map(p => p.last))
    : 0;
    
  const spread = maxPrice - minPrice;
  const spreadPercentage = minPrice > 0 ? (spread / minPrice) * 100 : 0;
  
  const arbitrage = hasArbitrage
    ? {
        buyExchange: lowestAsk!.exchange,
        buyPrice: lowestAsk!.ask,
        sellExchange: highestBid!.exchange,
        sellPrice: highestBid!.bid,
        profit: profit,
        profitPercentage: (profit / lowestAsk!.ask) * 100
      }
    : null;
  
  // Apply pagination to prices array
  if (prices.length > pageSize) {
    return ResponseFormatter.paginated(
      prices,
      page,
      pageSize,
      'multi-exchange'
    );
  }
  
  return ResponseFormatter.success({
    symbol,
    prices,
    errors,
    statistics: {
      average: avgPrice,
      min: minPrice,
      max: maxPrice,
      spread,
      spreadPercentage
    },
    arbitrage
  }, 'multi-exchange');
}

/**
 * Handles the indicators_calculate tool request
 * Calculates technical indicators (RSI, MACD, Bollinger Bands, ATR, Stochastic, Ichimoku) from OHLCV data
 * Useful for automated trading strategies and market analysis
 *
 * @param {IndicatorsCalculateParams} args - Arguments containing exchange ID, symbol, timeframe (default: 1h), limit (default: 100), and optional indicators array
 * @returns {Promise<TAPSResponse>} Response containing calculated indicators or all indicators if none specified
 */
async function handleIndicatorsCalculate(args: IndicatorsCalculateParams): Promise<TAPSResponse> {
  ValidationUtils.validateExchange(args.exchange);
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const timeframe = args.timeframe || '1h';
  const limit = ValidationUtils.validateLimit(args.limit, 500);

  ValidationUtils.validateTimeframe(timeframe);

  // Fetch OHLCV data with rate limiter for resilience
  const ohlcv = await exchangeManager.executeWithRateLimit(
    args.exchange,
    async (exchange) => {
      if (!exchange.has['fetchOHLCV']) {
        throw new Error(`Exchange ${args.exchange} does not support fetching OHLCV data`);
      }
      return await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    },
    'indicators_calculate'
  );

  // Convert OHLCV array format to object format
  const ohlcvData = ohlcv.map((candle: any) => ({
    timestamp: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5]
  }));

  // Calculate indicators
  const results = technicalIndicators.calculateAll(ohlcvData);

  // Filter indicators if specific ones requested
  const requestedIndicators = args.indicators || [];
  let filteredResults: any = results;

  if (requestedIndicators.length > 0) {
    filteredResults = {};
    for (const indicator of requestedIndicators) {
      if (results[indicator as keyof typeof results]) {
        filteredResults[indicator] = results[indicator as keyof typeof results];
      }
    }
  }

  return ResponseFormatter.success({
    symbol,
    timeframe,
    candleCount: ohlcvData.length,
    indicators: filteredResults,
    timestamp: Date.now()
  }, args.exchange);
}

/**
 * Handles the analytics_scan_arbitrage tool request
 * Scans for arbitrage opportunities across multiple exchanges with real exchange fees
 *
 * @param {ScanArbitrageParams} args - Arguments containing symbol, exchanges list, and threshold parameters
 * @returns {Promise<TAPSResponse>} Response containing arbitrage opportunities with risk scoring and execution paths
 */
async function handleScanArbitrage(args: ScanArbitrageParams): Promise<TAPSResponse> {
  const symbol = ValidationUtils.validateSymbol(args.symbol);
  const exchanges = args.exchanges || ['binance', 'coinbase', 'kraken', 'okx', 'gateio', 'kucoin'];

  // Validate all exchanges
  exchanges.forEach(ex => ValidationUtils.validateExchange(ex));

  // Scan for opportunities
  const opportunities = await arbitrageScanner.scanForArbitrage(symbol, exchanges, {
    minProfitPercent: args.minProfitPercent || 0.1,
    maxRiskScore: args.maxRiskScore || 7,
    minVolume: args.minVolume || 100,
    includeWithdrawalFees: args.includeWithdrawalFees !== false,
    includeTradingFees: args.includeTradingFees !== false,
    scanInterval: 5000,
    exchanges,
    symbols: [symbol]
  });

  return ResponseFormatter.success({
    symbol,
    opportunitiesFound: opportunities.length,
    opportunities: opportunities.map(opp => ({
      id: opp.id,
      buyExchange: opp.buyExchange,
      sellExchange: opp.sellExchange,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      spread: opp.spread,
      spreadPercent: opp.spreadPercent,
      potentialProfit: opp.potentialProfit,
      netProfit: opp.netProfit,
      netProfitPercent: opp.netProfitPercent,
      volume: opp.volume,
      fees: opp.fees,
      riskScore: opp.riskScore,
      confidence: opp.confidence,
      executionTime: opp.executionTime,
      executionPath: opp.executionPath,
      warnings: opp.warnings
    })),
    scanTimestamp: Date.now()
  }, 'multi-exchange');
}

/**
 * Handles the analytics_calculate_risk tool request
 * Calculates comprehensive risk metrics from trade history
 *
 * @param {CalculateRiskParams} args - Arguments containing array of completed trades
 * @returns {Promise<TAPSResponse>} Response containing Sharpe Ratio, Max Drawdown, Kelly Criterion, and other risk metrics
 */
async function handleCalculateRisk(args: CalculateRiskParams): Promise<TAPSResponse> {
  if (!args.trades || args.trades.length === 0) {
    return ResponseFormatter.error(
      new Error('No trades provided'),
      'analytics'
    );
  }

  // Convert trades to the format expected by risk manager
  const trades = args.trades.map((trade, index) => ({
    id: `trade-${index}`,
    symbol: 'UNKNOWN',
    side: trade.profit > 0 ? 'buy' as const : 'sell' as const,
    entryPrice: 0,
    amount: 0,
    profit: trade.profit,
    profitPercent: trade.profitPercent,
    timestamp: new Date(),
    exchange: 'unknown'
  }));

  // Calculate performance metrics
  const performance = riskManager.calculatePerformance(trades);

  return ResponseFormatter.success({
    totalTrades: performance.totalTrades,
    winningTrades: performance.winningTrades,
    losingTrades: performance.losingTrades,
    winRate: performance.winRate,
    avgWin: performance.avgWin,
    avgLoss: performance.avgLoss,
    profitLossRatio: performance.profitLossRatio,
    sharpeRatio: performance.sharpeRatio,
    maxDrawdown: performance.maxDrawdown,
    expectancy: performance.expectancy,
    kellyPercent: performance.kellyPercent,
    interpretation: {
      sharpeRatio: performance.sharpeRatio > 1 ? 'Good' : performance.sharpeRatio > 0.5 ? 'Acceptable' : 'Poor',
      maxDrawdown: performance.maxDrawdown < 20 ? 'Low' : performance.maxDrawdown < 40 ? 'Moderate' : 'High',
      expectancy: performance.expectancy > 0 ? 'Positive Edge' : 'Negative Edge'
    }
  }, 'analytics');
}

/**
 * Handles the analytics_position_size tool request
 * Calculates optimal position size using Kelly Criterion with safety adjustments
 *
 * @param {PositionSizeParams} args - Arguments containing account balance, entry price, and performance metrics
 * @returns {Promise<TAPSResponse>} Response containing recommended position size, stop loss, and take profit levels
 */
async function handlePositionSize(args: PositionSizeParams): Promise<TAPSResponse> {
  // Validate inputs
  if (args.accountBalance <= 0) {
    return ResponseFormatter.error(
      new Error('Account balance must be positive'),
      'analytics'
    );
  }

  if (args.entryPrice <= 0) {
    return ResponseFormatter.error(
      new Error('Entry price must be positive'),
      'analytics'
    );
  }

  if (args.winRate < 0 || args.winRate > 100) {
    return ResponseFormatter.error(
      new Error('Win rate must be between 0 and 100'),
      'analytics'
    );
  }

  // Calculate position size
  const positionSize = riskManager.calculatePositionSize(
    args.accountBalance,
    args.entryPrice,
    args.winRate,
    args.avgWin,
    args.avgLoss,
    args.volatility || 0.02,
    args.stopLossPercent || 0.02,
    args.takeProfitRatio || 2
  );

  return ResponseFormatter.success({
    recommendedPosition: {
      amount: positionSize.amount,
      value: positionSize.value,
      percentOfCapital: positionSize.percentOfCapital,
      riskAmount: positionSize.riskAmount
    },
    stopLoss: positionSize.stopLoss,
    takeProfit: positionSize.takeProfit,
    riskRewardRatio: args.takeProfitRatio || 2,
    maxLoss: positionSize.riskAmount,
    potentialProfit: positionSize.riskAmount * (args.takeProfitRatio || 2),
    advice: {
      sizing: positionSize.percentOfCapital < 1 ? 'Very Conservative' :
              positionSize.percentOfCapital < 5 ? 'Conservative' :
              positionSize.percentOfCapital < 10 ? 'Moderate' : 'Aggressive',
      recommendation: 'Use fractional Kelly sizing (1/4 Kelly) for conservative risk management'
    }
  }, 'analytics');
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} (${TAPS_VERSION}) - Running on stdio`);
  console.error(`Supporting ${ccxt.exchanges.length} exchanges via CCXT`);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully...');
  exchangeManager.clearAll();
  process.exit(0);
});

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
