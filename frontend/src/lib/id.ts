function fallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeUuid(): string {
  try {
    const candidate = globalThis.crypto?.randomUUID;
    if (typeof candidate === 'function') {
      return candidate.call(globalThis.crypto);
    }
  } catch {
    // Non-secure contexts may not expose crypto.randomUUID.
  }
  return fallbackId();
}
