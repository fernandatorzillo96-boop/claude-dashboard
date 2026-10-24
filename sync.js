// Sincronização com a VTEX: pedidos (a cada SYNC_EVERY_MIN), catálogo e estoque.
import { config } from './config.js';
import { vtexGet, mapLimit } from './vtex.js';
import { state, save, referenciaDoItem } from './store.js';
import { inicioDoDiaUTC } from './tempo.js';

const CHUNK_MS = 6 * 3600 * 1000;
const MAX_LIST = 2900; // a VTEX devolve no máximo 30 páginas × 100 por consulta

function compactOrder(o) {
  const promos = {};
  for (const p of o.ratesAndBenefitsData?.rateAndBenefitsIdentifiers || []) {
    if (p && p.id) promos[p.id] = p.name || p.id;
  }
  const totals = Object.fromEntries((o.totals || []).map((t) => [t.id, t.value]));
  const itens = (o.items || []).map((it) => {
    const cats = it.additionalInfo?.categoriesIds || '';
    const tags = (it.priceTags || [])
      .filter((t) => t.identifier && /discount/i.test(t.name || ''))
      .map((t) => t.identifier);
    const preco = (it.sellingPrice ?? it.price ?? 0) / 100;
    const por = (it.price ?? it.sellingPrice ?? 0) / 100;
    const de = Math.max((it.listPrice ?? 0) / 100, por);
    return {
      sku: String(it.id),
      refId: it.refId ? String(it.refId) : null,
      q: it.quantity || 0,
      preco, por, de,
      sale: cats.startsWith('/3/'),
      promos: [...new Set(tags)],
    };
  });
  return {
    id: o.orderId,
    base: o.orderId.replace(/-\d+$/, ''),
    criado: o.creationDate,
    status: o.status,
    origin: o.origin,
    sc: o.salesChannel,
    cupom: o.marketingData?.coupon || null,
    promos,
    itens,
    frete: (totals.Shipping || 0) / 100,
    total: (o.value || 0) / 100,
    detalhe: true,
  };
}

async function listWindow(from, to, out) {
  const f = `creationDate:[${from.toISOString()} TO ${new Date(to.getTime() - 1).toISOString()}]`;
  const q = (page) =>
    `/api/oms/pvt/orders?f_creationDate=${encodeURIComponent(f)}&per_page=100&page=${page}&orderBy=creationDate,asc`;
  const first = await vtexGet(q(1));
  const total = first?.paging?.total || 0;
  if (total > MAX_LIST && to - from > 10 * 60 * 1000) {
    const mid = new Date(from.getTime() + Math.floor((to - from) / 2));
    await listWindow(from, mid, out);
    await listWindow(mid, to, out);
    return;
  }
  out.push(...(first?.list || []));
  const pages = Math.min(first?.paging?.pages || 1, 30);
  for (let p = 2; p <= pages; p++) {
    const r = await vtexGet(q(p));
    out.push(...(r?.list || []));
  }
}

async function lookupSkus(skuIds) {
  await mapLimit(skuIds, config.concurrency, async (id) => {
    const s = await vtexGet(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${id}`);
    if (!s) return;
    state.catalog[id] = {
      refId: s.AlternateIds?.RefId ? String(s.AlternateIds.RefId) : null,
      productRefId: s.ProductRefId || null,
      productId: s.ProductId,
      active: !!s.IsActive,
      productActive: s.IsProductActive !== undefined ? !!s.IsProductActive : null,
    };
  });
}

let running = false;
export async function syncOrders() {
  if (running) return;
  running = true;
  const t0 = Date.now();
  try {
    const now = new Date();
    const full = !state.sync.lastFull || now - new Date(state.sync.lastFull) > config.fullRescanEveryMin * 60000;
    const start = full ? inicioDoDiaUTC(config.inicio) : new Date(now.getTime() - 48 * 3600 * 1000);
    const listed = [];
    for (let a = start.getTime(); a < now.getTime(); a += CHUNK_MS) {
      await listWindow(new Date(a), new Date(Math.min(a + CHUNK_MS, now.getTime() + 60000)), listed);
    }
    const toFetch = [];
    for (const l of listed) {
      const cur = state.orders[l.orderId];
      if (cur) {
        cur.status = l.status;
      } else {
        state.orders[l.orderId] = {
          id: l.orderId,
          base: l.orderId.replace(/-\d+$/, ''),
          criado: l.creationDate,
          status: l.status,
          total: (l.totalValue || 0) / 100,
          itens: [],
          promos: {},
          detalhe: false,
        };
      }
      if (!state.orders[l.orderId].detalhe && l.status !== 'canceled') toFetch.push(l.orderId);
    }
    let errors = 0;
    await mapLimit(toFetch, config.concurrency, async (id) => {
      const o = await vtexGet(`/api/oms/pvt/orders/${encodeURIComponent(id)}`);
      if (!o) { errors++; return; }
      const c = compactOrder(o);
      c.status = state.orders[id]?.status || c.status;
      state.orders[id] = c;
    }).then((r) => { errors += r.filter((x) => x && x.__error).length; });

    // SKUs vendidos sem referência conhecida: busca no catálogo agora.
    const missing = new Set();
    for (const id of toFetch) {
      for (const it of state.orders[id]?.itens || []) {
        if (!referenciaDoItem(it) && !state.catalog[it.sku]) missing.add(it.sku);
      }
    }
    if (missing.size) await lookupSkus([...missing]);

    state.sync = {
      ...state.sync,
      lastRun: now.toISOString(),
      lastFull: full ? now.toISOString() : state.sync.lastFull,
      lastError: null,
      lastDurationMs: Date.now() - t0,
      runs: (state.sync.runs || 0) + 1,
      lastListed: listed.length,
      lastFetched: toFetch.length,
      detailErrors: errors,
    };
    save('orders', 'catalog', 'sync');
    console.log(`Sync ok: ${listed.length} listados, ${toFetch.length} novos detalhes, ${errors} erros, ${Date.now() - t0} ms`);
  } catch (err) {
    state.sync.lastError = { at: new Date().toISOString(), message: err.message };
    console.error('Sync falhou:', err.message);
    try { save('orders', 'catalog', 'sync'); } catch {}
  } finally {
    running = false;
  }
}

// Todos os IDs de SKU do catálogo.
async function allSkuIds() {
  const ids = [];
  for (let page = 1; page < 1000; page++) {
    const r = await vtexGet(`/api/catalog_system/pvt/sku/stockkeepingunitids?page=${page}&pagesize=1000`);
    if (!Array.isArray(r) || r.length === 0) break;
    ids.push(...r.map(String));
    if (r.length < 1000) break;
  }
  return ids;
}

async function searchCount(fq) {
  const res = await vtexGet(
    `/api/catalog_system/pub/products/search?_from=0&_to=0${fq ? '&fq=' + encodeURIComponent(fq) : ''}`,
    { raw: true },
  );
  const h = res?.headers?.get('resources') || '';
  const m = h.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

let sweeping = false;
export const sweepProgress = { running: false, done: 0, total: 0, startedAt: null };

export async function sweepEstoque({ comCatalogo = false } = {}) {
  if (sweeping) return;
  sweeping = true;
  Object.assign(sweepProgress, { running: true, done: 0, total: 0, startedAt: new Date().toISOString() });
  try {
    const ids = await allSkuIds();
    sweepProgress.total = ids.length;
    const wh = {};
    let skusComEstoque = 0, total = 0, reservado = 0, ilimitados = 0;
    await mapLimit(ids, config.sweepConcurrency, async (id) => {
      if (comCatalogo || !state.catalog[id]) await lookupSkus([id]);
      const inv = await vtexGet(`/api/logistics/pvt/inventory/skus/${id}`);
      let disp = 0;
      for (const b of inv?.balance || []) {
        const k = b.warehouseId;
        if (!wh[k]) wh[k] = { warehouse_id: k, warehouse: b.warehouseName || k, total: 0, reservado: 0, disponivel: 0, skus_com_estoque: 0, ilimitado: 0 };
        if (b.hasUnlimitedQuantity) { wh[k].ilimitado++; ilimitados++; continue; }
        const t = b.totalQuantity || 0, r = b.reservedQuantity || 0, d = Math.max(t - r, 0);
        wh[k].total += t; wh[k].reservado += r; wh[k].disponivel += d;
        if (d > 0) wh[k].skus_com_estoque++;
        total += t; reservado += r; disp += d;
      }
      if (disp > 0) skusComEstoque++;
      sweepProgress.done++;
    });
    const cat = Object.values(state.catalog);
    const prodAtivos = new Set(cat.filter((c) => c.active && c.productActive !== false).map((c) => c.productId));
    const [visiveis, visiveisSale] = await Promise.all([searchCount(''), searchCount('C:/3/')]);
    state.inventory = {
      atualizado_em: new Date().toISOString(),
      skus_varridos: ids.length,
      total, reservado, disponivel: Math.max(total - reservado, 0),
      skus_com_estoque: skusComEstoque,
      skus_ilimitados: ilimitados,
      warehouses: Object.values(wh).sort((a, b) => b.disponivel - a.disponivel),
    };
    state.catalogSummary = {
      atualizado_em: new Date().toISOString(),
      skus_total: ids.length,
      skus_ativos: cat.filter((c) => c.active).length,
      produtos_ativos: prodAtivos.size,
      produtos_visiveis_site: visiveis,
      produtos_sale_visiveis_site: visiveisSale,
    };
    save('inventory', 'catalogSummary', 'catalog');
    console.log(`Varredura de estoque ok: ${ids.length} SKUs`);
  } catch (err) {
    state.sync.lastSweepError = { at: new Date().toISOString(), message: err.message };
    console.error('Varredura falhou:', err.message);
  } finally {
    sweeping = false;
    sweepProgress.running = false;
  }
}

export function start() {
  const loop = async () => { await syncOrders(); };
  loop();
  setInterval(loop, config.syncEveryMin * 60000);
  let lastCatalog = 0;
  const sweep = async () => {
    const comCatalogo = Date.now() - lastCatalog > config.catalogoEveryMin * 60000;
    await sweepEstoque({ comCatalogo });
    if (comCatalogo) lastCatalog = Date.now();
  };
  setTimeout(sweep, 20000);
  setInterval(sweep, config.estoqueEveryMin * 60000);
}
