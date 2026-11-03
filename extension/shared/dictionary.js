import './languages.js';
import './entry.js';

const MAX_RESPONSE_BYTES = 1_000_000;
// Only sources shipped with an open-data/demo adapter are eligible. Official
// bridges and future adapters retain their own request and licensing behaviour.
const REUSABLE_ADAPTERS = new Set(['demo', 'smart', 'wiktionary', 'free', 'chinese', 'multilingual']);
const TRANSIENT_NOTICES = new Set(['noticeWiktDown', 'noticeUnconfirmed', 'noticeBothDown', 'noticeFreeDown']);

/** All adapters share this queue, including each subrequest of a combined entry. */
export function createLimitedFetch(fetchImpl, maximum = 4) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new TypeError('Invalid request limit.');
  let active = 0;
  const queue = [];
  return async (...args) => {
    const signal = args[1]?.signal !== undefined ? args[1].signal : args[0]?.signal;
    const aborted = () => signal?.reason ?? new DOMException('The dictionary request was aborted.', 'AbortError');
    if (signal?.aborted) throw aborted();
    if (active >= maximum) await new Promise((resolve, reject) => {
      const queued = () => { signal?.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => {
        const index = queue.indexOf(queued);
        if (index !== -1) queue.splice(index, 1);
        signal?.removeEventListener('abort', cancel);
        reject(aborted());
      };
      queue.push(queued);
      signal?.addEventListener('abort', cancel, { once: true });
    }); else active++;
    try {
      // A queued signal may have expired just as its predecessor released a slot.
      if (signal?.aborted) throw aborted();
      const response = await fetchImpl(...args);
      const length = Number(response.headers?.get?.('content-length') || 0);
      if (length > MAX_RESPONSE_BYTES) {
        await response.body?.cancel?.();
        throw Object.assign(new Error('Dictionary response exceeds the size limit.'), { code: 'response-too-large' });
      }
      if (!response.body) return response;
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw Object.assign(new Error('Dictionary response exceeds the size limit.'), { code: 'response-too-large' });
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
  localize = entry => entry, cacheTtlMs = 60_000, maximumCacheEntries = 64,
  maximumCacheBytes = 4_000_000, now = () => performance.now()
} = {}) {
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0
    || !Number.isInteger(maximumCacheEntries) || maximumCacheEntries < 0
    || !Number.isInteger(maximumCacheBytes) || maximumCacheBytes < 0) throw new TypeError('Invalid dictionary cache limits.');
  const registered = new Map(Object.entries(adapters));
  const limitedFetch = createLimitedFetch(fetchImpl, maximumRequests);
  const cached = new Map(), inFlight = new Map();
  let cachedBytes = 0;
  function removeCached(key) {
    const value = cached.get(key);
    if (value) { cachedBytes -= value.bytes; cached.delete(key); }
  }
  function storeCached(key, entry) {
    if (!cacheTtlMs || !maximumCacheEntries || !maximumCacheBytes) return;
    const bytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if (bytes > maximumCacheBytes) return;
    const time = now();
    for (const [expiredKey, value] of cached) if (value.expires <= time) removeCached(expiredKey);
    removeCached(key);
    while (cached.size >= maximumCacheEntries || cachedBytes + bytes > maximumCacheBytes) removeCached(cached.keys().next().value);
    cached.set(key, { entry, bytes, expires: time + cacheTtlMs });
    cachedBytes += bytes;
  }
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
    // Effective source/word/UI fields isolate the shipped adapters. Unrelated
    // navigation preferences and inactive providers do not invalidate the body.
    const key = REUSABLE_ADAPTERS.has(context.adapterId) ? JSON.stringify([
      context.word, context.profile.id, context.adapterId, context.language,
      context.region, context.uiLanguage, context.ui.language, context.ui.region
    ]) : '';
    if (key) {
      const hit = cached.get(key);
      if (hit && hit.expires > now()) {
        cached.delete(key); cached.set(key, hit);
        return structuredClone(hit.entry);
      }
      if (hit) removeCached(key);
      if (inFlight.has(key)) return structuredClone(await inFlight.get(key));
    }
    const operation = (async () => {
      try {
        const result = await adapter(context.word, { ...context, fetchImpl: limitedFetch });
        const localized = await localize(result, context);
        const entry = normalize(localized);
        // Partial results remain useful, but a temporary source failure must be
        // retried on the next lookup. Adapters can mark such a raw result false.
        if (key && result?.cacheable !== false && localized?.cacheable !== false
          && entry.status === 'ok' && !TRANSIENT_NOTICES.has(entry.noticeKey)) storeCached(key, entry);
        return entry;
      } catch {
        return normalize({ status: 'error', error: { code: 'network', message: 'The dictionary could not be reached. Please try again.' } });
      }
    })();
    if (!key) return operation;
    inFlight.set(key, operation);
    try { return structuredClone(await operation); }
    finally { inFlight.delete(key); }
  }
  const engine = Object.freeze({ lookup, registerAdapter, registry });
  return engine;
}
