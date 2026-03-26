const BASE_URL = 'https://api.prod.whoop.com/developer';

class WhoopClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async request(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, v);
    });

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

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
