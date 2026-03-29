const BASE_URL = 'https://api.prod.whoop.com/developer';

// In-memory token store — survives between requests, reset on deploy
let currentTokens = {};

class WhoopClient {
  constructor() {
    this.accessToken = currentTokens.access_token || process.env.WHOOP_ACCESS_TOKEN;
    this.refreshToken = currentTokens.refresh_token || process.env.WHOOP_REFRESH_TOKEN;
    this._refreshing = null;
  }

  static setTokens(tokens) {
    currentTokens = tokens;
  }

  async refreshAccessToken() {
    if (this._refreshing) return this._refreshing;

    this._refreshing = (async () => {
      if (!this.refreshToken) throw new Error('No refresh token available — visit /auth to connect');

      const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: process.env.WHOOP_CLIENT_ID,
          client_secret: process.env.WHOOP_CLIENT_SECRET,
        }),
      });

      const tokens = await res.json();
      if (tokens.error) throw new Error(`Token refresh failed: ${tokens.error} - ${tokens.error_description || JSON.stringify(tokens)}`);

      this.accessToken = tokens.access_token;
      if (tokens.refresh_token) this.refreshToken = tokens.refresh_token;

      WhoopClient.setTokens({ access_token: this.accessToken, refresh_token: this.refreshToken });
      console.log('Whoop tokens refreshed');
      return tokens;
    })().finally(() => { this._refreshing = null; });

    return this._refreshing;
  }

  async request(path, params = {}, retried = false) {
    const url = new URL(`${BASE_URL}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, v);
    });

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401 && !retried) {
      await this.refreshAccessToken();
      return this.request(path, params, true);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Whoop API ${res.status}: ${text}`);
    }

    return res.json();
  }

  async getProfile() {
    return this.request('/v2/user/profile/basic');
  }

  async getBodyMeasurements() {
    return this.request('/v2/user/measurement/body');
  }

  async getRecoveries(limit = 7, start, end) {
    return this.request('/v2/recovery', { limit, start, end });
  }

  async getSleeps(limit = 7, start, end) {
    return this.request('/v2/activity/sleep', { limit, start, end });
  }

  async getCycles(limit = 7, start, end) {
    return this.request('/v2/cycle', { limit, start, end });
  }

  async getWorkouts(limit = 10, start, end) {
    return this.request('/v2/activity/workout', { limit, start, end });
  }

  async getCycleRecovery(cycleId) {
    return this.request(`/v2/cycle/${cycleId}/recovery`);
  }

  async getCycleSleep(cycleId) {
    return this.request(`/v2/cycle/${cycleId}/sleep`);
  }
}

module.exports = { WhoopClient };
