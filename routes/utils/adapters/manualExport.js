class ManualExportAdapter {
  constructor() {
    this.name = 'manual';
    this.capabilities = {
      canPublish: true,
      canReceiveOrders: false,
      canCancel: true,
      isAutomated: false,
    };
    this.published = [];
  }

  async publish(listing) {
    const externalId = `manual-${listing.id || Date.now()}`;
    this.published.push({ externalId, listing, publishedAt: new Date().toISOString() });
    return { externalId, url: null };
  }

  async update() {
    return { ok: true };
  }

  async cancel() {
    return { ok: true };
  }

  async fetchOrders() {
    return [];
  }

  async markFulfilled() {
    return { ok: true };
  }
}

module.exports = ManualExportAdapter;
