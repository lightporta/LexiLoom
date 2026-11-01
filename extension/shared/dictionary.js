import './languages.js';
import './entry.js';

const MAX_RESPONSE_BYTES = 1_000_000;

/** All adapters share this queue, including each subrequest of a combined entry. */
export function createLimitedFetch(fetchImpl, maximum = 4) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new TypeError('Invalid request limit.');
  let active = 0;
  const queue = [];
  return async (...args) => {
    if (active >= maximum) await new Promise(resolve => queue.push(resolve)); else active++;
    try {
      const response = await fetchImpl(...args);
      const length = Number(response.headers?.get?.('content-length') || 0);
      if (length > MAX_RESPONSE_BYTES) {
        await response.body?.cancel?.();
        throw new Error('Dictionary response exceeds the size limit.');
      }
      if (!response.body) return response;
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new Error('Dictionary response exceeds the size limit.');
          chunks.push(value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      const body = new Uint8Array(size);
      let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally {
      const next = queue.shift(); if (next) next(); else active--;
    }
  };
}

/** Registry + adapter functions are the extension point; cards only see entries. */
export function createDictionaryEngine({
  registry = globalThis.LexiLoomLanguages.registry, adapters = {},
  fetchImpl = (...args) => globalThis.fetch(...args), maximumRequests = 4,
  localize = entry => entry
} = {}) {
  const registered = new Map(Object.entries(adapters));
  const limitedFetch = createLimitedFetch(fetchImpl, maximumRequests);
  function registerAdapter(id, lookup) {
    if (!/^[a-z0-9_-]+$/i.test(id) || typeof lookup !== 'function') throw new TypeError('Invalid dictionary adapter.');
    if (registered.has(id)) throw new Error(`Duplicate dictionary adapter: ${id}`);
    registered.set(id, lookup);
    return engine;
  }
  async function lookup(value, { settings = {}, uiLanguage = 'zh-CN' } = {}) {
    const context = registry.lookupContext(value, { settings, uiLanguage });
    if (!context) return globalThis.LexiLoomEntry.normalizeDictionaryEntry({ status: 'error', error: { code: 'invalid-word', message: 'Select a supported word.' } }, { word: '', registry });
    const normalize = raw => globalThis.LexiLoomEntry.normalizeDictionaryEntry(raw, { ...context, registry });
    if (settings.enabled === false) return normalize({ status: 'error', error: { code: 'disabled', message: 'Word lookup is paused.' } });
    const adapter = registered.get(context.adapterId);
    if (!adapter) return normalize({ status: 'error', error: { code: 'not-configured', message: 'This dictionary is not configured.' } });
    try {
      const result = await adapter(context.word, { ...context, fetchImpl: limitedFetch });
      return normalize(await localize(result, context));
    } catch {
      return normalize({ status: 'error', error: { code: 'network', message: 'The dictionary could not be reached. Please try again.' } });
    }
  }
  const engine = Object.freeze({ lookup, registerAdapter, registry });
  return engine;
}
