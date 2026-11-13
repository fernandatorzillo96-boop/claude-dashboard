// Mídia e site: GA4 (Data API e Realtime API, com conta de serviço) e Meta Ads (Marketing API, token de usuário do sistema).
// Tudo somente leitura. Variáveis no Render:
//   GA4_PROPERTY_ID   número da propriedade
//   GA4_CREDENTIALS   conteúdo inteiro do .json da conta de serviço (papel Leitor na propriedade)
//   META_ACCESS_TOKEN token do usuário do sistema (ads_read)
//   META_AD_ACCOUNT_ID número da conta de anúncios (com ou sem "act_")
// Google Ads: enquanto a API não é liberada, investimento/cliques do Google Ads vêm do GA4 (contas vinculadas).
import crypto from 'node:crypto';
import { googleAdsPorDia, googleAdsConfigurado } from './googleads.js';

const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const p4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const valida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
// GA4 e Meta não aceitam datas futuras (ex.: câmbio do Google Ads): o fim vai no máximo até hoje
const periodo = (i, f) => { const h = hoje(); let a = valida(i) ? i : h.slice(0, 8) + '01', b = valida(f) && f < h ? f : h; if (a > b) a = b; return [a, b]; };

const erros = { ga4: null, meta: null, google: null };
const ultimo = { ga4: null, meta: null };

// ---------------- cache simples ----------------
const cache = new Map();
async function comCache(chave, ttlMs, fn) {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < ttlMs) return c.valor;
  if (c && c.pendente) return c.pendente;
  const pendente = fn().then((valor) => { cache.set(chave, { em: Date.now(), valor }); return valor; })
    .catch((e) => { cache.delete(chave); throw e; });
  cache.set(chave, { ...(c || {}), pendente, em: c?.em || 0 });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return pendente;
}
// dias passados mudam pouco: 6 h; período com hoje: 15 min
const ttlDe = (fim) => (fim < hoje() ? 6 * 3600e3 : 15 * 60e3);

// ---------------- GA4 ----------------
function credGa4() {
  const raw = process.env.GA4_CREDENTIALS;
  if (!raw || !process.env.GA4_PROPERTY_ID) return null;
  try {
    const j = JSON.parse(raw.trim().replace(/^'|'$/g, ''));
    j.private_key = String(j.private_key || '').replace(/\\n/g, '\n');
    return j;
  } catch { erros.ga4 = 'GA4_CREDENTIALS não é um JSON válido: cole o conteúdo inteiro do arquivo .json.'; return null; }
}
const propriedade = () => String(process.env.GA4_PROPERTY_ID || '').replace(/\D/g, '');
export const ga4Configurado = () => !!credGa4();

let tokenGa4 = null;
async function tokenGoogle() {
  if (tokenGa4 && tokenGa4.exp > Date.now() + 60e3) return tokenGa4.token;
  const c = credGa4();
  if (!c) throw new Error('GA4 não configurado (GA4_PROPERTY_ID e GA4_CREDENTIALS).');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(corpo).sign(c.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: corpo + '.' + sig }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Login do GA4 falhou: ' + (j.error_description || j.error || r.status));
  tokenGa4 = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenGa4.token;
}

async function ga4(metodo, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propriedade()}:${metodo}`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + (await tokenGoogle()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(j.error?.message || 'HTTP ' + r.status).split(';')[0].slice(0, 240);
    erros.ga4 = (r.status === 403 ? 'Sem acesso à propriedade (adicione o e-mail da conta de serviço como Leitor no GA4): ' : '') + msg;
    throw new Error(erros.ga4);
  }
  erros.ga4 = null; ultimo.ga4 = new Date().toISOString();
  const dims = (j.dimensionHeaders || []).map((h) => h.name), mets = (j.metricHeaders || []).map((h) => h.name);
  return (j.rows || []).map((row) => Object.fromEntries([
    ...dims.map((d, i) => [d, row.dimensionValues[i].value]),
    ...mets.map((m, i) => [m, n(row.metricValues[i].value)]),
  ]));
}
const relatorio = (inicio, fim, dimensoes, metricas, extra = {}) => comCache(`ga4|${inicio}|${fim}|${dimensoes}|${metricas}|${JSON.stringify(extra)}`, ttlDe(fim),
  () => ga4('runReport', { dateRanges: [{ startDate: inicio, endDate: fim }], dimensions: dimensoes.map((name) => ({ name })), metrics: metricas.map((name) => ({ name })), limit: 10000, ...extra }));
const dataGa = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

async function ga4PorDia(inicio, fim) {
  if (!ga4Configurado()) return {};
  const out = {};
  const base = await relatorio(inicio, fim, ['date'], ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'transactions', 'purchaseRevenue', 'addToCarts', 'checkouts']);
  for (const x of base) out[dataGa(x.date)] = {
    sessoes: x.sessions, usuarios: x.totalUsers, novos_usuarios: x.newUsers, sessoes_engajadas: x.engagedSessions,
    compras_ga4: x.transactions, receita_ga4: r2(x.purchaseRevenue), add_to_cart: x.addToCarts, checkouts: x.checkouts,
  };
  // Google Ads pelo GA4 (só se as contas estiverem vinculadas). O GA4 converte o custo pelo câmbio do dia,
  // que pode ainda não existir para hoje: dias fechados numa consulta e hoje à parte (se falhar, hoje fica sem custo).
  const pagos = { dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', inListFilter: { values: ['Paid Search', 'Paid Shopping', 'Paid Video', 'Display', 'Cross-network', 'Paid Other'] } } } };
  const custoGoogle = async (a, b) => {
    // o GA4 só entrega custo de anúncio junto com a campanha: soma as campanhas de cada dia
    const ads = await relatorio(a, b, ['date', 'sessionCampaignName'], ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions']);
    for (const x of ads) {
      const o = (out[dataGa(x.date)] ||= {});
      o.google_investimento = r2((o.google_investimento || 0) + x.advertiserAdCost);
      o.google_cliques = (o.google_cliques || 0) + x.advertiserAdClicks;
      o.google_impressoes = (o.google_impressoes || 0) + x.advertiserAdImpressions;
    }
  };
  const h = hoje(), ontem = new Date(Date.parse(h + 'T12:00:00Z') - 86400e3).toISOString().slice(0, 10);
  const fimFechado = fim >= h ? ontem : fim;
  try {
    if (inicio <= fimFechado) await custoGoogle(inicio, fimFechado);
    erros.google = null;
  } catch (e) { console.log('GA4 sem custo do Google Ads:', e.message); erros.google = 'Custo do Google Ads pelo GA4: ' + e.message; }
  if (fim >= h) { try { await custoGoogle(h, h); } catch { /* câmbio de hoje ainda não saiu */ } }
  erros.ga4 = null;
  try {
    const rec = await relatorio(inicio, fim, ['date', 'sessionDefaultChannelGroup'], ['purchaseRevenue', 'transactions'], pagos);
    for (const x of rec) { const o = (out[dataGa(x.date)] ||= {}); o.receita_google_ga4 = r2((o.receita_google_ga4 || 0) + x.purchaseRevenue); o.compras_google_ga4 = (o.compras_google_ga4 || 0) + x.transactions; }
  } catch (e) { console.log('GA4 sem receita de mídia paga:', e.message); }
  return out;
}

export async function ga4Canais(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  if (!ga4Configurado()) return [];
  const rows = await relatorio(inicio, fim, ['sessionDefaultChannelGroup'], ['sessions', 'totalUsers', 'engagedSessions', 'transactions', 'purchaseRevenue', 'addToCarts']);
  const tot = rows.reduce((s, x) => s + x.sessions, 0), rec = rows.reduce((s, x) => s + x.purchaseRevenue, 0);
  return rows.map((x) => ({
    canal: x.sessionDefaultChannelGroup || '(sem canal)', sessoes: x.sessions, usuarios: x.totalUsers, pct_sessoes: tot ? p4(x.sessions / tot) : null,
    taxa_engajamento: x.sessions ? p4(x.engagedSessions / x.sessions) : null, add_to_cart: x.addToCarts,
    compras: x.transactions, receita: r2(x.purchaseRevenue), pct_receita: rec ? p4(x.purchaseRevenue / rec) : null,
    conversao: x.sessions ? p4(x.transactions / x.sessions) : null, ticket_medio: x.transactions ? r2(x.purchaseRevenue / x.transactions) : null,
  })).sort((a, b) => b.sessoes - a.sessoes);
}

export async function ga4Origens(inicio, fim, limite = 30) {
  [inicio, fim] = periodo(inicio, fim);
  if (!ga4Configurado()) return [];
  const rows = await relatorio(inicio, fim, ['sessionSourceMedium', 'sessionCampaignName'], ['sessions', 'transactions', 'purchaseRevenue'], { orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: Math.min(limite, 200) });
  return rows.map((x) => ({ chave: x.sessionSourceMedium + ' · ' + x.sessionCampaignName, origem_midia: x.sessionSourceMedium, campanha: x.sessionCampaignName, sessoes: x.sessions, compras: x.transactions, receita: r2(x.purchaseRevenue), conversao: x.sessions ? p4(x.transactions / x.sessions) : null }));
}

export async function ga4Paginas(inicio, fim, tipo = 'entrada', limite = 50) {
  [inicio, fim] = periodo(inicio, fim);
  if (!ga4Configurado()) return [];
  const lim = Math.min(Number(limite) || 50, 500);
  if (tipo === 'vistas') {
    const rows = await relatorio(inicio, fim, ['pagePath'], ['screenPageViews', 'totalUsers', 'userEngagementDuration'], { orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: lim });
    return rows.map((x) => ({ pagina: x.pagePath, visualizacoes: x.screenPageViews, usuarios: x.totalUsers, tempo_medio_s: x.totalUsers ? Math.round(x.userEngagementDuration / x.totalUsers) : null }));
  }
  const rows = await relatorio(inicio, fim, ['landingPage'], ['sessions', 'engagedSessions', 'addToCarts', 'transactions', 'purchaseRevenue'], { orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: lim });
  return rows.map((x) => ({
    pagina: x.landingPage, sessoes: x.sessions, taxa_engajamento: x.sessions ? p4(x.engagedSessions / x.sessions) : null, add_to_cart: x.addToCarts,
    compras: x.transactions, receita: r2(x.purchaseRevenue), conversao: x.sessions ? p4(x.transactions / x.sessions) : null,
  }));
}

// Detalhe de uma página de entrada: de onde vêm as sessões que começam nela
const DIM_DETALHE = {
  origem: ['sessionSourceMedium'], campanha: ['sessionSourceMedium', 'sessionCampaignName'], canal: ['sessionDefaultChannelGroup'],
  dispositivo: ['deviceCategory'], pais: ['country'], cidade: ['city'], url: ['landingPagePlusQueryString'], navegador: ['browser'],
  dia: ['date'], hora: ['hour'], novo: ['newVsReturning'],
};
export async function ga4EntradaDetalhe(pagina, inicio, fim, agrupar = 'origem', limite = 50) {
  [inicio, fim] = periodo(inicio, fim);
  if (!ga4Configurado() || !pagina) return [];
  const dims = DIM_DETALHE[agrupar] || DIM_DETALHE.origem;
  const rows = await relatorio(inicio, fim, dims, ['sessions', 'engagedSessions', 'totalUsers', 'newUsers', 'transactions', 'purchaseRevenue'], {
    dimensionFilter: { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'EXACT', value: String(pagina) } } },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: Math.min(Number(limite) || 50, 500),
  });
  const tot = rows.reduce((t, x) => t + x.sessions, 0);
  return rows.map((x) => {
    const grupo = dims.map((d) => (d === 'date' ? dataGa(x[d]) : x[d])).join(' · ');
    return { chave: grupo, grupo, sessoes: x.sessions, pct_sessoes: tot ? p4(x.sessions / tot) : null, taxa_engajamento: x.sessions ? p4(x.engagedSessions / x.sessions) : null,
      usuarios: x.totalUsers, novos_usuarios: x.newUsers, compras: x.transactions, receita: r2(x.purchaseRevenue) };
  });
}

const ETAPAS = [['session_start', 'Sessões'], ['view_item', 'Viu produto'], ['add_to_cart', 'Adicionou ao carrinho'], ['begin_checkout', 'Iniciou checkout'], ['add_shipping_info', 'Informou entrega'], ['add_payment_info', 'Informou pagamento'], ['purchase', 'Comprou']];
export async function ga4Funil(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  if (!ga4Configurado()) return [];
  const rows = await relatorio(inicio, fim, ['eventName'], ['eventCount', 'totalUsers'], { dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ETAPAS.map((e) => e[0]) } } } });
  const m = new Map(rows.map((x) => [x.eventName, x]));
  const ses = await relatorio(inicio, fim, [], ['sessions', 'totalUsers']);
  const s0 = ses[0] || {};
  let ant = null;
  return ETAPAS.map(([ev, nome], i) => {
    const x = i === 0 ? { eventCount: s0.sessions || 0, totalUsers: s0.totalUsers || 0 } : m.get(ev) || { eventCount: 0, totalUsers: 0 };
    const linha = { ordem: i + 1, etapa: nome, evento: ev, eventos: x.eventCount, usuarios: x.totalUsers,
      pct_do_inicio: s0.totalUsers ? p4(x.totalUsers / s0.totalUsers) : null, pct_da_etapa_anterior: ant ? p4(x.totalUsers / ant) : null };
    if (x.totalUsers) ant = x.totalUsers;
    return linha;
  });
}

// Tempo real: últimos 30 minutos
export async function ga4TempoReal() {
  if (!ga4Configurado()) return [];
  return comCache('ga4|tempo_real', 60e3, async () => {
    const rt = (dimensions, metrics, extra = {}) => ga4('runRealtimeReport', { dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: 50, ...extra });
    const [min, pag, disp, ev] = await Promise.all([
      rt(['minutesAgo'], ['activeUsers']),
      rt(['unifiedScreenName'], ['activeUsers', 'screenPageViews'], { orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 15 }),
      rt(['deviceCategory'], ['activeUsers']),
      rt(['eventName'], ['eventCount'], { dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['add_to_cart', 'begin_checkout', 'purchase'] } } } }),
    ]);
    const evs = Object.fromEntries(ev.map((x) => [x.eventName, x.eventCount]));
    const total = min.reduce((s, x) => s + x.activeUsers, 0);
    const ult5 = min.filter((x) => Number(x.minutesAgo) < 5).reduce((s, x) => s + x.activeUsers, 0);
    const out = [{ tipo: 'resumo', nome: 'Últimos 30 min', usuarios_ativos: total, usuarios_ultimos_5_min: ult5, add_to_cart: evs.add_to_cart || 0, checkouts: evs.begin_checkout || 0, compras: evs.purchase || 0, atualizado_em: new Date().toISOString() }];
    for (let m = 29; m >= 0; m--) out.push({ tipo: 'minuto', nome: String(m), minutos_atras: m, usuarios_ativos: n(min.find((x) => Number(x.minutesAgo) === m)?.activeUsers) });
    for (const x of pag) out.push({ tipo: 'pagina', nome: x.unifiedScreenName, usuarios_ativos: x.activeUsers, visualizacoes: x.screenPageViews });
    for (const x of disp) out.push({ tipo: 'dispositivo', nome: x.deviceCategory, usuarios_ativos: x.activeUsers });
    return out.map((x) => ({ chave: x.tipo + ': ' + x.nome, ...x }));
  });
}

// ---------------- Meta Ads ----------------
const contaMeta = () => String(process.env.META_AD_ACCOUNT_ID || '').replace(/\D/g, '');
export const metaConfigurado = () => !!(process.env.META_ACCESS_TOKEN && contaMeta());
const VERSAO_META = process.env.META_API_VERSION || 'v21.0';
const COMPRA = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const acao = (lista, tipos) => { for (const t of tipos) { const a = (lista || []).find((x) => x.action_type === t); if (a) return n(a.value); } return 0; };

async function metaInsights(params) {
  let url = `https://graph.facebook.com/${VERSAO_META}/act_${contaMeta()}/insights?` + new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN, limit: '500' });
  const out = [];
  for (let pag = 0; url && pag < 20; pag++) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { erros.meta = 'Meta: ' + String(j.error?.message || 'HTTP ' + r.status).slice(0, 240); throw new Error(erros.meta); }
    out.push(...(j.data || []));
    url = j.paging?.next || null;
  }
  erros.meta = null; ultimo.meta = new Date().toISOString();
  return out;
}
const CAMPOS_META = 'spend,impressions,clicks,reach,actions,action_values';
const linhaMeta = (x) => {
  const gasto = n(x.spend), valor = acao(x.action_values, COMPRA), compras = acao(x.actions, COMPRA);
  return { meta_investimento: r2(gasto), meta_impressoes: n(x.impressions), meta_cliques: n(x.clicks), meta_alcance: n(x.reach), meta_compras: compras, meta_receita: r2(valor),
    meta_add_to_cart: acao(x.actions, ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']), meta_roas: gasto ? r2(valor / gasto) : null };
};

async function metaPorDia(inicio, fim) {
  if (!metaConfigurado()) return {};
  const rows = await comCache(`meta|dia|${inicio}|${fim}`, ttlDe(fim), () => metaInsights({ level: 'account', time_increment: '1', time_range: JSON.stringify({ since: inicio, until: fim }), fields: CAMPOS_META }));
  return Object.fromEntries(rows.map((x) => [x.date_start, linhaMeta(x)]));
}

export async function metaCampanhas(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  if (!metaConfigurado()) return [];
  const rows = await comCache(`meta|camp|${inicio}|${fim}`, ttlDe(fim), () => metaInsights({ level: 'campaign', time_range: JSON.stringify({ since: inicio, until: fim }), fields: 'campaign_name,' + CAMPOS_META }));
  return rows.map((x) => ({ campanha: x.campaign_name, ...linhaMeta(x),
    ctr: n(x.impressions) ? p4(n(x.clicks) / n(x.impressions)) : null, cpc: n(x.clicks) ? r2(n(x.spend) / n(x.clicks)) : null,
    custo_por_compra: acao(x.actions, COMPRA) ? r2(n(x.spend) / acao(x.actions, COMPRA)) : null }))
    .sort((a, b) => b.meta_investimento - a.meta_investimento);
}

// ---------------- juntando por dia ----------------
export async function midiaPorDia(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  const [g, m, ads] = await Promise.all([
    ga4PorDia(inicio, fim).catch((e) => { console.error('GA4:', e.message); return {}; }),
    metaPorDia(inicio, fim).catch((e) => { console.error('Meta:', e.message); return {}; }),
    googleAdsPorDia(inicio, fim).catch((e) => { console.error('Google Ads:', e.message); return null; }),
  ]);
  // com a API do Google Ads conectada, o investimento do Google vem dela (mais completo que o custo importado no GA4)
  const direto = googleAdsConfigurado() && ads;
  const dias = [];
  for (let d = new Date(inicio + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= fim; d = new Date(d.getTime() + 86400e3)) dias.push(d.toISOString().slice(0, 10));
  return dias.map((data) => {
    const a = { ...(g[data] || {}) }, b = m[data] || {};
    if (direto) {
      const d = ads[data] || { google_investimento: 0, google_cliques: 0, google_impressoes: 0, google_conversoes: 0, google_receita: 0, google_roas: null };
      Object.assign(a, d, { google_fonte: 'Google Ads' });
    } else if (a.google_investimento != null) a.google_fonte = 'GA4';
    const goog = a.google_investimento ?? null, meta = b.meta_investimento ?? null;
    const inv = goog == null && meta == null ? null : r2((goog || 0) + (meta || 0));
    return {
      data, ...a, ...b, investimento_total: inv,
      conversao_ga4: a.sessoes ? p4((a.compras_ga4 || 0) / a.sessoes) : null,
      custo_por_sessao: inv != null && a.sessoes ? r2(inv / a.sessoes) : null,
      google_roas_ga4: goog ? r2((a.receita_google_ga4 || 0) / goog) : null,
    };
  });
}

export function statusMidia() {
  return {
    ga4_configurado: ga4Configurado(), ga4_ultima_leitura: ultimo.ga4, ga4_erro: erros.ga4,
    meta_configurado: metaConfigurado(), meta_ultima_leitura: ultimo.meta, meta_erro: erros.meta,
    google_ads_direto: googleAdsConfigurado(), google_ga4_erro: googleAdsConfigurado() ? null : erros.google,
  };
}
