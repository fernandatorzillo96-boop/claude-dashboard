// Google Ads direto pela API (somente leitura). Variáveis no Render:
//   GOOGLE_ADS_DEVELOPER_TOKEN      token de desenvolvedor (Central de API da conta de administrador)
//   GOOGLE_ADS_CLIENT_ID / _SECRET  cliente OAuth "Aplicativo da Web" do Google Cloud
//   GOOGLE_ADS_CUSTOMER_ID          conta de anúncios da Água de Coco (123-456-7890)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID    conta de administrador (MCC) pela qual o acesso passa, se houver
// O refresh token não vai em variável: fica no disco do servidor depois do botão "Conectar Google Ads".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const ARQ = () => path.join(config.dataDir, 'google_ads.json');
const soNum = (v) => String(v || '').replace(/\D/g, '');
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const p4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const valida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const periodo = (i, f) => { const h = hoje(); let a = valida(i) ? i : h.slice(0, 8) + '01', b = valida(f) && f < h ? f : h; if (a > b) a = b; return [a, b]; };

let salvo = {};
try { salvo = JSON.parse(fs.readFileSync(ARQ(), 'utf8')); } catch {}
const gravar = () => { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(ARQ(), JSON.stringify(salvo)); };

const estado = { erro: null, ultima: null, versao: salvo.versao || null };

export const googleAdsTemCliente = () => !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET);
export const googleAdsConfigurado = () => !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && googleAdsTemCliente() && soNum(process.env.GOOGLE_ADS_CUSTOMER_ID) && salvo.refresh_token);

// ---------- conexão (OAuth) ----------
const pendentes = new Map(); // state -> expira
export function urlConectar(redirectUri) {
  const state = crypto.randomBytes(16).toString('hex');
  pendentes.set(state, Date.now() + 15 * 60e3);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent', state,
  });
}
export async function concluirConexao(code, state, redirectUri) {
  const exp = pendentes.get(state);
  pendentes.delete(state);
  if (!exp || exp < Date.now()) throw new Error('Link de conexão expirado. Clique em Conectar Google Ads de novo.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('O Google recusou a conexão: ' + (j.error_description || j.error || r.status));
  if (!j.refresh_token) throw new Error('O Google não devolveu o acesso permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.');
  salvo = { ...salvo, refresh_token: j.refresh_token, conectado_em: new Date().toISOString() };
  gravar();
  tokenAtual = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  estado.erro = null;
  return testar();
}

let tokenAtual = null;
async function token() {
  if (tokenAtual && tokenAtual.exp > Date.now() + 60e3) return tokenAtual.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: salvo.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    estado.erro = j.error === 'invalid_grant' ? 'A conexão com o Google Ads expirou ou foi revogada: clique em Conectar Google Ads de novo.' : 'Login do Google Ads falhou: ' + (j.error_description || j.error || r.status);
    throw new Error(estado.erro);
  }
  tokenAtual = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenAtual.token;
}

// ---------- consultas (GAQL) ----------
// A API troca de versão algumas vezes por ano: tenta da mais nova para a mais antiga e guarda a que respondeu.
const VERSOES = (process.env.GOOGLE_ADS_API_VERSION ? [process.env.GOOGLE_ADS_API_VERSION] : []).concat(['v24', 'v23', 'v22', 'v21', 'v20', 'v25', 'v26']);
async function gaql(query) {
  const cid = soNum(process.env.GOOGLE_ADS_CUSTOMER_ID), mcc = soNum(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const headers = { Authorization: 'Bearer ' + (await token()), 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' };
  if (mcc && mcc !== cid) headers['login-customer-id'] = mcc;
  const lista = estado.versao ? [estado.versao, ...VERSOES.filter((v) => v !== estado.versao)] : [...new Set(VERSOES)];
  let ultimoErro = null;
  for (const v of lista) {
    const r = await fetch(`https://googleads.googleapis.com/${v}/customers/${cid}/googleAds:searchStream`, { method: 'POST', headers, body: JSON.stringify({ query }) });
    if (r.status === 404) { ultimoErro = 'versão ' + v + ' indisponível'; continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const e = Array.isArray(j) ? j[0]?.error : j?.error;
      const det = e?.details?.[0]?.errors?.[0];
      const cod = det?.errorCode ? Object.values(det.errorCode)[0] : e?.status;
      const msg = det?.message || e?.message || 'HTTP ' + r.status;
      estado.erro = cod === 'DEVELOPER_TOKEN_NOT_APPROVED' ? 'O token de desenvolvedor ainda é de teste: só funciona com contas de teste. Peça o Acesso básico na Central de API.'
        : cod === 'USER_PERMISSION_DENIED' ? 'A conta Google conectada não tem acesso a esta conta de anúncios (confira GOOGLE_ADS_CUSTOMER_ID e GOOGLE_ADS_LOGIN_CUSTOMER_ID).'
        : 'Google Ads: ' + String(msg).slice(0, 240);
      throw new Error(estado.erro);
    }
    if (estado.versao !== v) { estado.versao = v; salvo.versao = v; try { gravar(); } catch {} }
    estado.erro = null; estado.ultima = new Date().toISOString();
    return (Array.isArray(j) ? j : [j]).flatMap((b) => b.results || []);
  }
  estado.erro = 'Google Ads: nenhuma versão da API respondeu (' + ultimoErro + ').';
  throw new Error(estado.erro);
}

const cache = new Map();
async function comCache(chave, ttl, fn) {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < ttl) return c.v;
  const v = await fn();
  cache.set(chave, { em: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
const ttlDe = (fim) => (fim < hoje() ? 6 * 3600e3 : 15 * 60e3);
const metricas = (m = {}) => {
  const custo = n(m.costMicros) / 1e6, valor = n(m.conversionsValue);
  return { google_investimento: r2(custo), google_cliques: n(m.clicks), google_impressoes: n(m.impressions), google_conversoes: r2(n(m.conversions)), google_receita: r2(valor), google_roas: custo ? r2(valor / custo) : null };
};

export async function googleAdsPorDia(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  if (!googleAdsConfigurado()) return {};
  const rows = await comCache(`dia|${inicio}|${fim}`, ttlDe(fim), () => gaql(
    `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${inicio}' AND '${fim}'`));
  const out = {};
  for (const x of rows) out[x.segments.date] = metricas(x.metrics);
  return out;
}

export async function googleAdsCampanhas(inicio, fim) {
  [inicio, fim] = periodo(inicio, fim);
  if (!googleAdsConfigurado()) return [];
  const rows = await comCache(`camp|${inicio}|${fim}`, ttlDe(fim), () => gaql(
    `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${inicio}' AND '${fim}' AND metrics.impressions > 0`));
  const g = new Map();
  for (const x of rows) {
    const k = String(x.campaign.id);
    const a = g.get(k) || { campanha: x.campaign.name, tipo: x.campaign.advertisingChannelType, costMicros: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 };
    for (const f of ['costMicros', 'clicks', 'impressions', 'conversions', 'conversionsValue']) a[f] += n(x.metrics?.[f]);
    g.set(k, a);
  }
  return [...g.entries()].map(([id, a]) => {
    const m = metricas(a);
    return { id, campanha: a.campanha, tipo: a.tipo, ...m,
      ctr: a.impressions ? p4(a.clicks / a.impressions) : null, cpc: a.clicks ? r2(m.google_investimento / a.clicks) : null,
      custo_por_conversao: a.conversions ? r2(m.google_investimento / a.conversions) : null };
  }).sort((a, b) => b.google_investimento - a.google_investimento);
}

async function testar() {
  const rows = await gaql('SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
  const c = rows[0]?.customer || {};
  salvo.conta = c.descriptiveName || null; salvo.moeda = c.currencyCode || null;
  gravar();
  return { conta: salvo.conta, moeda: salvo.moeda };
}

export function statusGoogleAds() {
  return {
    google_ads_configurado: googleAdsConfigurado(), google_ads_conectado_em: salvo.conectado_em || null, google_ads_conta: salvo.conta || null,
    google_ads_ultima_leitura: estado.ultima, google_ads_erro: estado.erro,
    google_ads_falta: [!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && 'GOOGLE_ADS_DEVELOPER_TOKEN', !process.env.GOOGLE_ADS_CLIENT_ID && 'GOOGLE_ADS_CLIENT_ID',
      !process.env.GOOGLE_ADS_CLIENT_SECRET && 'GOOGLE_ADS_CLIENT_SECRET', !soNum(process.env.GOOGLE_ADS_CUSTOMER_ID) && 'GOOGLE_ADS_CUSTOMER_ID',
      !salvo.refresh_token && 'conexão (botão Conectar Google Ads)'].filter(Boolean).join(', ') || null,
  };
}
