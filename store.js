// Estado do servidor, salvo em disco (DATA_DIR) para sobreviver a reinícios.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));

export const state = {
  orders: {},          // orderId -> pedido compacto
  catalog: {},         // skuId -> { refId, productRefId, productId, active, productActive }
  skuRef: {},          // cod. reduzido (refId do SKU) -> referência (aprendido dos uploads)
  inventory: null,     // última varredura de estoque
  catalogSummary: null,
  faturado: {},        // 'YYYY-MM-DD' -> totais do 3351
  sync: { lastRun: null, lastFull: null, lastError: null, lastDurationMs: null, runs: 0, detailErrors: 0 },
};

// Tabelas que vêm com o servidor (geradas dos arquivos do plano BF26).
export const costByRef = bundled('custo_gec_por_referencia.json');
export const bundledSkuRef = bundled('sku_para_referencia.json');
export const atributosRef = bundled('atributos_referencia.json');

const files = {
  orders: 'orders.json.gz',
  catalog: 'catalog.json.gz',
  skuRef: 'sku_ref.json.gz',
  inventory: 'inventory.json.gz',
  catalogSummary: 'catalog_summary.json.gz',
  faturado: 'faturado.json.gz',
  sync: 'sync.json.gz',
};

export function load() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const [key, file] of Object.entries(files)) {
    const p = path.join(config.dataDir, file);
    if (!fs.existsSync(p)) continue;
    try {
      state[key] = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    } catch (err) {
      console.error(`Não consegui ler ${file}: ${err.message}`);
    }
  }
  console.log(`Estado carregado: ${Object.keys(state.orders).length} pedidos em cache.`);
}

export function save(...keys) {
  for (const key of keys.length ? keys : Object.keys(files)) {
    const p = path.join(config.dataDir, files[key]);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(state[key])));
    fs.renameSync(tmp, p);
  }
}

// Referência (modelo) de um item, para achar o Custo GEC.
export function referenciaDoItem(item) {
  const r = item.refId && (state.skuRef[item.refId] || bundledSkuRef[item.refId]);
  if (r && costByRef[r] !== undefined) return r;
  const c = state.catalog[item.sku];
  if (c && c.productRefId && costByRef[c.productRefId] !== undefined) return c.productRefId;
  if (c && c.refId) {
    const r2 = state.skuRef[c.refId] || bundledSkuRef[c.refId];
    if (r2 && costByRef[r2] !== undefined) return r2;
  }
  return null;
}

// CMV de uma linha de item: { cmv, exato }
export function cmvDoItem(item) {
  const ref = referenciaDoItem(item);
  if (ref) return { cmv: costByRef[ref] * item.q, exato: true, ref };
  return { cmv: item.de * item.q * config.custoSobreDeEstimado, exato: false, ref: null };
}
