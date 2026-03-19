// Browser-compatible shim for sodium-native
// Provides sodium_memzero used by WDK for memory-safe key management.
// In a browser context, we zero out buffers manually.

export function sodium_memzero(buf) {
  if (buf && buf.fill) {
    buf.fill(0);
  }
}

export function sodium_malloc(n) {
  return Buffer.alloc(n);
}

export function sodium_free(buf) {
  if (buf && buf.fill) {
    buf.fill(0);
  }
}

export default {
  sodium_memzero,
  sodium_malloc,
  sodium_free,
};
