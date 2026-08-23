class StubExecutor {
  constructor() {
    this.name = 'stub';
    this.capabilities = {
      isAutomated: true,
      requiresLocalAgent: false,
      supportsScreenshots: false,
    };
  }

  async validate() {
    return { ok: true, reasons: [] };
  }

  async execute() {
    return { status: 'completed', evidence: [] };
  }

  async cancel() {
    return { ok: true };
  }
}

module.exports = StubExecutor;
