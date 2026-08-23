class MockAdapter {
  constructor() {
    this.name = 'mock';
    this.capabilities = {
      canPublish: true,
      canReceiveOrders: true,
      canCancel: true,
      isAutomated: true,
    };
    this.listings = new Map();
    this.orders = [];
  }

  async publish(listing) {
    const externalId = `mock-${listing.id || Date.now()}`;
    this.listings.set(externalId, { ...listing, externalId });
    return { externalId, url: `https://mock.local/listings/${externalId}` };
  }

  async update(externalId, patch) {
    const existing = this.listings.get(externalId);
    if (!existing) throw new Error('Listing not found');
    this.listings.set(externalId, { ...existing, ...patch });
    return { ok: true };
  }

  async cancel(externalId) {
    this.listings.delete(externalId);
    return { ok: true };
  }

  async fetchOrders() {
    return this.orders;
  }

  async markFulfilled() {
    return { ok: true };
  }
}

module.exports = MockAdapter;
