const FORBIDDEN_KEYS = /^(password|pass|pwd|username|user|token|secret|xml|credential)$/i;
const SAVED_PATH = /Accounts[\\/]Saved/i;

class UnsafeJobPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeJobPayloadError';
  }
}

function walk(value, path) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (SAVED_PATH.test(value)) {
      throw new UnsafeJobPayloadError(`Job payload contains an Accounts/Saved path at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(key)) {
        throw new UnsafeJobPayloadError(`Job payload contains credential-shaped key "${key}" at ${path}`);
      }
      walk(child, path ? `${path}.${key}` : key);
    }
  }
}

function assertSafeJobPayload(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new UnsafeJobPayloadError('Job payload must be an object');
  }
  walk(payload, '');
  return true;
}

module.exports = { assertSafeJobPayload, UnsafeJobPayloadError };
