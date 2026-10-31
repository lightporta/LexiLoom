import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { cambridgeHttpError, httpError, normalizeCambridge, normalizeOxford, providerError, readJsonLimited, validWord } from '../extension/shared/providers.js';

const PORT = 47821;
const MAX_CONCURRENT = 4;
const DEFAULT_TIMEOUT = 10_000;

function normalizeConfig(config) {
  const get = (camel, env, fallback = '') => config[camel] ?? config[env] ?? fallback;
  return {
    token: String(get('token', 'BRIDGE_TOKEN')),
    oxfordAppId: String(get('oxfordAppId', 'OXFORD_APP_ID')),
    oxfordAppKey: String(get('oxfordAppKey', 'OXFORD_APP_KEY')),
    oxfordLanguage: String(get('oxfordLanguage', 'OXFORD_LANGUAGE', 'en-gb')),
    oxfordSandbox: get('oxfordSandbox', 'OXFORD_SANDBOX', 'false') === true || get('oxfordSandbox', 'OXFORD_SANDBOX', 'false') === 'true',
    cambridgeAccessKey: String(get('cambridgeAccessKey', 'CAMBRIDGE_ACCESS_KEY')),
    cambridgeDictionaryCode: String(get('cambridgeDictionaryCode', 'CAMBRIDGE_DICTIONARY_CODE')),
  };
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", Connection: 'close' });
  response.end(JSON.stringify(payload));
}

function failure(response, status, code, message) {
  json(response, status, { error: { code, message } });
}

function authenticated(request, tokenBytes) {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(value.slice(7));
  return candidate.length === tokenBytes.length && timingSafeEqual(candidate, tokenBytes);
}

function allowedRequest(request) {
  // Restrict Host to loopback as well as the socket binding; this rejects DNS
  // rebinding attempts. Websites cannot access the API through CORS.
  if (!/^127\.0\.0\.1(?::\d{1,5})?$/.test(request.headers.host || '')) return false;
  const origin = request.headers.origin;
  return origin === undefined || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

async function requestProvider(url, headers, fetchImpl, timeoutMs) {
  return fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs), credentials: 'omit', redirect: 'error' });
}

export function createBridgeServer(input = process.env, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  const config = normalizeConfig(input);
  if (config.token.length < 24 || config.token.length > 512 || /[\r\n]/.test(config.token) || /^(?:change[_ -]?me|replace|your[_ -]?|example|placeholder)/i.test(config.token)) throw new Error('BRIDGE_TOKEN must be a private 24–512 character token, not a placeholder. Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"');
  if (!['en-gb', 'en-us'].includes(config.oxfordLanguage)) throw new Error('OXFORD_LANGUAGE must be en-gb or en-us for this release.');
  if (config.cambridgeDictionaryCode && !/^[a-zA-Z0-9_-]{1,100}$/.test(config.cambridgeDictionaryCode)) throw new Error('CAMBRIDGE_DICTIONARY_CODE is invalid.');
  const tokenBytes = Buffer.from(config.token);
  let active = 0;

  async function lookup(provider, word) {
    if (provider === 'oxford' && (!config.oxfordAppId || !config.oxfordAppKey)) return providerError(word, provider, 'not-configured', '尚未配置牛津 API 凭据，请查看 bridge/.env.example。');
    if (provider === 'cambridge' && (!config.cambridgeAccessKey || !config.cambridgeDictionaryCode)) return providerError(word, provider, 'not-configured', '尚未配置剑桥 API 凭据或授权词典代码，请查看 bridge/.env.example。');
    if (provider === 'oxford' && config.oxfordSandbox && !word.startsWith('a')) return providerError(word, provider, 'sandbox-limit', '牛津 Sandbox 仅支持 a 开头的词。请试试 apple，或切换正式授权。');
    try {
      let url;
      let headers;
      if (provider === 'oxford') {
        const host = config.oxfordSandbox ? 'od-api-sandbox.oxforddictionaries.com' : 'od-api.oxforddictionaries.com';
        url = `https://${host}/api/v2/words/${config.oxfordLanguage}?q=${encodeURIComponent(word)}`;
        headers = { app_id: config.oxfordAppId, app_key: config.oxfordAppKey };
      } else {
        url = `https://dictionary.cambridge.org/api/v1/dictionaries/${encodeURIComponent(config.cambridgeDictionaryCode)}/search/first?q=${encodeURIComponent(word)}&format=html`;
        headers = { accessKey: config.cambridgeAccessKey };
      }
      const response = await requestProvider(url, headers, fetchImpl, timeoutMs);
      if (!response.ok) return provider === 'cambridge' ? await cambridgeHttpError(word, response, { lookup: true }) : httpError(word, provider, response.status);
      const payload = await readJsonLimited(response);
      return provider === 'oxford' ? normalizeOxford(word, payload) : normalizeCambridge(word, payload);
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      // Never include upstream response bodies, URLs, keys, or exception text.
      return providerError(word, provider, timeout ? 'timeout' : 'network', timeout ? '词典请求超时，请稍后重试。' : '无法连接官方词典或读取响应，请检查网络和 API 设置。');
    }
  }

  const server = http.createServer(async (request, response) => {
    if (!allowedRequest(request)) return failure(response, 403, 'origin', '仅允许本机扩展访问。');
    if (!authenticated(request, tokenBytes)) return failure(response, 401, 'authentication', '本地服务令牌无效，请检查插件设置。');
    if (request.method !== 'GET') return failure(response, 405, 'method', '仅支持 GET 请求。');
    let url;
    try { url = new URL(request.url, `http://127.0.0.1:${PORT}`); } catch { return failure(response, 400, 'invalid-request', '请求格式无效。'); }
    if (url.pathname === '/v1/health') {
      return json(response, 200, { ok: true, providers: {
        oxford: { configured: Boolean(config.oxfordAppId && config.oxfordAppKey), sandbox: config.oxfordSandbox, language: config.oxfordLanguage },
        cambridge: { configured: Boolean(config.cambridgeAccessKey && config.cambridgeDictionaryCode), dictionaryCode: config.cambridgeDictionaryCode },
      } });
    }
    if (!['/v1/lookup', '/v1/dictionaries'].includes(url.pathname)) return failure(response, 404, 'route', '找不到该接口。');
    if (active >= MAX_CONCURRENT) return failure(response, 429, 'busy', '本地服务正在处理其他查词请求，请稍后重试。');
    active++;
    try {
      if (url.pathname === '/v1/dictionaries') {
        if (!config.cambridgeAccessKey) return failure(response, 400, 'not-configured', '尚未配置剑桥 API 凭据。');
        try {
          const upstream = await requestProvider('https://dictionary.cambridge.org/api/v1/dictionaries', { accessKey: config.cambridgeAccessKey }, fetchImpl, timeoutMs);
          if (!upstream.ok) {
            const result = await cambridgeHttpError('', upstream);
            return failure(response, 502, result.error?.code || 'upstream', result.error?.message || '无法读取可用词典列表。');
          }
          const payload = await readJsonLimited(upstream);
          const dictionaries = (Array.isArray(payload) ? payload : Array.isArray(payload?.dictionaries) ? payload.dictionaries : []).slice(0, 100).filter(item => typeof item?.dictionaryCode === 'string').map(item => ({ dictionaryCode: item.dictionaryCode.slice(0, 100), dictionaryName: String(item.dictionaryName || item.dictionaryTitle || item.dictionaryCode).slice(0, 200) }));
          return json(response, 200, { dictionaries });
        } catch { return failure(response, 502, 'network', '无法读取剑桥可用词典列表，请检查网络和授权。'); }
      }
      const provider = url.searchParams.get('provider');
      const word = url.searchParams.get('word');
      if (!['oxford', 'cambridge'].includes(provider)) return failure(response, 400, 'invalid-provider', '仅支持 oxford 或 cambridge。');
      if (!validWord(word)) return failure(response, 400, 'invalid-word', '首版仅支持不超过 48 个字符的英文单词。');
      json(response, 200, await lookup(provider, word.toLowerCase()));
    } finally { active--; }
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 1_000;
  server.maxHeadersCount = 20;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = createBridgeServer();
    server.on('error', () => { console.error('LexiLoom bridge could not listen on 127.0.0.1:47821. Check whether the port is already in use.'); process.exitCode = 1; });
    server.listen(PORT, '127.0.0.1', () => console.log('LexiLoom dictionary bridge ready: http://127.0.0.1:47821 (local only; word queries are not logged).'));
    const stop = () => server.close(() => { process.exitCode = 0; });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
