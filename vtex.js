// Cliente HTTP da VTEX — somente leitura (apenas GET).
import { config, vtexBaseUrl } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function vtexGet(pathAndQuery, { raw = false, tries = 5 } = {}) {
  const url = vtexBaseUrl() + pathAndQuery;
  let wait = 500;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-VTEX-API-AppKey': config.appKey,
          'X-VTEX-API-AppToken': config.appToken,
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      if (attempt >= tries) throw new Error(`VTEX sem resposta em ${pathAndQuery}: ${err.message}`);
      await sleep(wait + Math.random() * 300);
      wait *= 2;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= tries) throw new Error(`VTEX ${res.status} em ${pathAndQuery}`);
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((retryAfter > 0 ? retryAfter * 1000 : wait) + Math.random() * 300);
      wait *= 2;
      continue;
    }
    if (res.status === 404) return raw ? res : null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`VTEX ${res.status} em ${pathAndQuery}: ${body.slice(0, 200)}`);
    }
    return raw ? res : res.json();
  }
}

// Executa fn em cada item com no máximo `limit` chamadas ao mesmo tempo.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (err) {
        out[idx] = { __error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
