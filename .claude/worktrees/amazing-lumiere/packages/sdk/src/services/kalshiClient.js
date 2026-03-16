/**
 * Kalshi API Client - Pure JavaScript with RSA-PSS Authentication
 * Works with api.elections.kalshi.com
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class KalshiClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKeyId - Kalshi API key ID
   * @param {string} [options.privateKeyPath] - Path to private key PEM file
   * @param {string} [options.privateKeyPem] - Private key PEM string
   * @param {string} [options.baseUrl] - API base URL
   */
  constructor({ apiKeyId, privateKeyPath, privateKeyPem, baseUrl = 'https://api.elections.kalshi.com' }) {
    this.apiKeyId = apiKeyId;
    this.baseUrl = baseUrl;

    // Load private key
    if (privateKeyPem) {
      this.privateKey = privateKeyPem;
    } else if (privateKeyPath) {
      const resolvedPath = privateKeyPath.startsWith('~')
        ? path.join(process.env.HOME, privateKeyPath.slice(1))
        : privateKeyPath;
      this.privateKey = fs.readFileSync(resolvedPath, 'utf8');
    } else {
      throw new Error('Must provide either privateKeyPath or privateKeyPem');
    }
  }

  /**
   * Sign a request using RSA-PSS with SHA256
   */
  _sign(timestamp, method, path) {
    // Strip query params for signing
    const pathWithoutQuery = path.split('?')[0];
    const message = `${timestamp}${method}${pathWithoutQuery}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    const signature = sign.sign({
      key: this.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return signature.toString('base64');
  }

  /**
   * Make an authenticated request
   */
  async _request(method, path, body = null) {
    const timestamp = Date.now().toString();
    const signature = this._sign(timestamp, method, path);

    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'KALSHI-ACCESS-KEY': this.apiKeyId,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || data.error || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // Portfolio
  // ─────────────────────────────────────────────────────────────

  async getBalance() {
    return this._request('GET', '/trade-api/v2/portfolio/balance');
  }

  async getPositions(limit = 100, cursor = null) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    return this._request('GET', `/trade-api/v2/portfolio/positions?${params}`);
  }

  async getOrders({ status, ticker, limit = 100, cursor } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (status) params.append('status', status);
    if (ticker) params.append('ticker', ticker);
    if (cursor) params.append('cursor', cursor);
    return this._request('GET', `/trade-api/v2/portfolio/orders?${params}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Orders
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an order
   * @param {Object} order
   * @param {string} order.ticker - Market ticker
   * @param {string} order.side - "yes" or "no"
   * @param {string} order.action - "buy" or "sell"
   * @param {number} order.count - Number of contracts
   * @param {string} [order.type="limit"] - "limit" or "market"
   * @param {number} [order.yesPrice] - Limit price in cents (1-99)
   * @param {number} [order.noPrice] - Limit price in cents (1-99)
   * @param {string} [order.clientOrderId] - Optional client order ID
   */
  async createOrder({ ticker, side, action, count, type = 'limit', yesPrice, noPrice, clientOrderId }) {
    const body = {
      ticker,
      side,
      action,
      count,
      type,
    };

    if (yesPrice !== undefined) body.yes_price = yesPrice;
    if (noPrice !== undefined) body.no_price = noPrice;
    if (clientOrderId) body.client_order_id = clientOrderId;

    return this._request('POST', '/trade-api/v2/portfolio/orders', body);
  }

  async cancelOrder(orderId) {
    return this._request('DELETE', `/trade-api/v2/portfolio/orders/${orderId}`);
  }

  async batchCancelOrders(ticker = null) {
    const path = ticker
      ? `/trade-api/v2/portfolio/orders?ticker=${ticker}`
      : '/trade-api/v2/portfolio/orders';
    return this._request('DELETE', path);
  }

  // ─────────────────────────────────────────────────────────────
  // Markets
  // ─────────────────────────────────────────────────────────────

  async getMarkets({ limit = 100, cursor, eventTicker, seriesTicker, status } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    if (eventTicker) params.append('event_ticker', eventTicker);
    if (seriesTicker) params.append('series_ticker', seriesTicker);
    if (status) params.append('status', status);
    return this._request('GET', `/trade-api/v2/markets?${params}`);
  }

  async getMarket(ticker) {
    return this._request('GET', `/trade-api/v2/markets/${ticker}`);
  }

  async getOrderbook(ticker, depth = 10) {
    return this._request('GET', `/trade-api/v2/markets/${ticker}/orderbook?depth=${depth}`);
  }

  async getTrades({ ticker, limit = 100, cursor } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (ticker) params.append('ticker', ticker);
    if (cursor) params.append('cursor', cursor);
    return this._request('GET', `/trade-api/v2/markets/trades?${params}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────

  async getEvents({ limit = 100, cursor, status, seriesTicker } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    if (status) params.append('status', status);
    if (seriesTicker) params.append('series_ticker', seriesTicker);
    return this._request('GET', `/trade-api/v2/events?${params}`);
  }

  async getEvent(eventTicker) {
    return this._request('GET', `/trade-api/v2/events/${eventTicker}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Exchange
  // ─────────────────────────────────────────────────────────────

  async getExchangeStatus() {
    return this._request('GET', '/trade-api/v2/exchange/status');
  }
}

/**
 * Create client from environment variables
 */
function createClientFromEnv() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH || '~/.kalshi/private_key.pem';

  if (!apiKeyId) {
    throw new Error('KALSHI_API_KEY_ID environment variable required');
  }

  return new KalshiClient({ apiKeyId, privateKeyPath });
}

module.exports = {
  KalshiClient,
  createClientFromEnv,
};

// ─────────────────────────────────────────────────────────────────
// Test if run directly
// ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      const client = new KalshiClient({
        apiKeyId: process.env.KALSHI_API_KEY_ID || 'Ce00cf3a-1002-4eab-aa9c-b69560921052',
        privateKeyPath: '~/.kalshi/private_key.pem',
      });

      console.log('Testing Kalshi JS Client...\n');

      const balance = await client.getBalance();
      console.log(`Balance: $${(balance.balance / 100).toFixed(2)}`);

      const positions = await client.getPositions();
      console.log(`Positions: ${positions.positions?.length || 0}`);

      const orders = await client.getOrders({ status: 'resting' });
      console.log(`Resting orders: ${orders.orders?.length || 0}`);

      console.log('\n✅ Kalshi JS Client working!');
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}
