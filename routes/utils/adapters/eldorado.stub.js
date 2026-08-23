class NotConfiguredError extends Error {
  constructor() {
    super('Eldorado adapter is a stub. See docs/eldorado-integration.md — do not invent API paths.');
    this.name = 'NotConfiguredError';
  }
}

class EldoradoAdapter {
  constructor() {
    this.name = 'eldorado';
    this.capabilities = {
      canPublish: false,
      canReceiveOrders: false,
      canCancel: false,
      isAutomated: false,
    };
  }

  async publish() { throw new NotConfiguredError(); }
  async update() { throw new NotConfiguredError(); }
  async cancel() { throw new NotConfiguredError(); }
  async fetchOrders() { throw new NotConfiguredError(); }
  async markFulfilled() { throw new NotConfiguredError(); }
}

module.exports = EldoradoAdapter;
module.exports.NotConfiguredError = NotConfiguredError;
