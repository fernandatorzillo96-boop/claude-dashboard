import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
// Octadesk: diagnóstico de conexão (só leitura). Testa a API nova (x-api-key) e o token de integração (octa.).
const env = (k) => (process.env[k] || '').trim();

function forma(body) {
  if (Array.isArray(body)) return { tipo: 'lista', itens: body.length, campos: body[0] && typeof body[0] === 'object' ? Object.keys(body[0]).slice(0, 40) : [] };
  if (body && typeof body === 'object') {
    const lista = Object.entries(body).find(([, v]) => Array.isArray(v));
    return {
      tipo: 'objeto', chaves: Object.keys(body).slice(0, 30),
      lista_em: lista ? lista[0] : null, itens: lista ? lista[1].length : null,
      campos: lista && lista[1][0] && typeof lista[1][0] === 'object' ? Object.keys(lista[1][0]).slice(0, 40) : [],
    };
  }
  return { tipo: typeof body };
}

async function tenta(nome, url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    let body = null;
    try { body = JSON.parse(txt); } catch { body = null; }
    return { tentativa: nome, caminho: new URL(url).pathname + (new URL(url).search ? '?…' : ''), status: res.status, ...(body ? forma(body) : { texto: txt.slice(0, 120) }) };
  } catch (err) {
    return { tentativa: nome, caminho: url.replace(/^https?:\/\/[^/]+/, ''), erro: err.message };
  }
}

export async function diagnosticoOctadesk() {
  const token = env('OCTADESK_TOKEN'), sub = env('OCTADESK_SUBDOMINIO'), email = env('OCTADESK_EMAIL');
  let base = env('OCTADESK_API_URL').replace(/\/$/, '');
  if (!base && /^o\d+-[a-z0-9]+$/i.test(sub)) base = `${sub}.api001.octadesk.services`;
  if (base && !/^https?:\/\//.test(base)) base = 'https://' + base;
  const out = [{ tentativa: 'variaveis', token: token ? `preenchido (${token.length} caracteres, começa com ${token.slice(0, 5)})` : 'vazio', subdominio: sub || 'vazio', email: email ? 'preenchido' : 'vazio', api_url: base || 'vazio' }];
  if (!token) return out;

  // API nova
  if (base) {
    const h = { 'x-api-key': token, 'octa-agent-email': email, Accept: 'application/json' };
    out.push(await tenta('nova: tickets', `${base}/tickets?page=1&limit=2`, { headers: h }));
    out.push(await tenta('nova: chat', `${base}/chat?page=1&limit=2`, { headers: h }));
    out.push(await tenta('nova: tickets status', `${base}/tickets/status`, { headers: h }));
  }

  // Token de integração (API antiga)
  const login = await fetch('https://api.octadesk.services/login/apiToken', {
    method: 'POST', headers: { apiToken: token, username: email, subDomain: sub, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ erro: e.message }));
  const at = login.body && (login.body.token || login.body.access_token);
  out.push({ tentativa: 'antiga: login', status: login.status, erro: login.erro, recebeu_token: !!at, chaves: login.body ? Object.keys(login.body).slice(0, 10) : [] });
  if (at) {
    const h = { Authorization: `Bearer ${at}`, Accept: 'application/json' };
    const d = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
    out.push(await tenta('antiga: tickets search', `https://api.octadesk.services/tickets/search?openDate=${d}`, { headers: h }));
    out.push(await tenta('antiga: chat', `https://api.octadesk.services/chat/conversation?page=1&limit=2`, { headers: h }));
  }
  return out;
}

// ---------------- Sincronização diária de tickets e conversas ----------------

const ARQ = () => path.join(config.dataDir, 'octadesk.json.gz');
export const octa = { tickets: {}, chats: {}, diasOk: {}, status: { ultima: null, erro: null, filtro_ok: null, backfill_ate: null, exemplo_campos_personalizados: null } };

const VERSAO = 2; // v2: motivo pelo campo "motivo_do_contato" e campos de motivo guardados
function carregar() {
  try { Object.assign(octa, JSON.parse(zlib.gunzipSync(fs.readFileSync(ARQ())).toString('utf8'))); } catch {}
  if (octa.versao !== VERSAO) {
    octa.tickets = {}; octa.diasOk = {}; octa.status.backfill_ate = null; octa.versao = VERSAO;
  }
}
function salvar() {
  const tmp = ARQ() + '.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(octa)));
  fs.renameSync(tmp, ARQ());
}

function baseUrl() {
  let base = env('OCTADESK_API_URL').replace(/\/$/, '');
  const sub = env('OCTADESK_SUBDOMINIO');
  if (!base && /^o\d+-[a-z0-9]+$/i.test(sub)) base = `${sub}.api001.octadesk.services`;
  if (base && !/^https?:\/\//.test(base)) base = 'https://' + base;
  return base;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(pathQs) {
  const url = baseUrl() + pathQs;
  for (let t = 1; ; t++) {
    const res = await fetch(url, {
      headers: { 'x-api-key': env('OCTADESK_TOKEN'), 'octa-agent-email': env('OCTADESK_EMAIL'), Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    }).catch((e) => ({ ok: false, status: 0, erro: e.message }));
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 409 || res.status >= 500 || res.status === 0) && t < 5) { await sleep(1000 * 2 ** t); continue; }
    let det = '';
    try { det = (await res.text()).replace(/\s+/g, ' ').slice(0, 220); } catch {}
    const e = new Error(`Octadesk ${res.status || res.erro} em ${pathQs.split('?')[0]}${det ? ' — ' + det : ''}`);
    e.status = res.status;
    throw e;
  }
}

const nomeDe = (x) => (x == null ? null : typeof x === 'object' ? x.name || x.title || x.label || x.value || null : String(x));
const OFF = '-03:00';
const isoBR = (data) => `${data}T00:00:00${OFF}`;
const diaBR = (iso) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : null);
const somaDia = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Campos de motivo do Octadesk da Água de Coco, em ordem de preferência.
const CAMPOS_MOTIVO = ['motivo', 'motivo_do_contato', 'motivos_dos_contatos', 'lojas_motivo_de_contato', 'assuntos'];
const valorCampo = (v) => (v == null || v === '' ? null : Array.isArray(v) ? (v.map(nomeDe).filter(Boolean).join(', ') || null) : nomeDe(v));
// customField pode vir como objeto {chave: valor} ou lista [{name/key, value}]. Devolve só os campos de motivo/assunto.
function camposMotivo(cf) {
  const out = {};
  if (!cf) return out;
  const re = /motivo|assunto/i;
  if (Array.isArray(cf)) {
    for (const c of cf) {
      const k = c && (c.key || c.name || c.label || c.field || c.id);
      if (k && re.test(String(k))) { const v = valorCampo(c.value ?? c.values ?? c.text); if (v) out[String(k)] = v; }
    }
  } else if (typeof cf === 'object') {
    for (const [k, v] of Object.entries(cf)) if (re.test(k)) { const x = valorCampo(v); if (x) out[k] = x; }
  }
  return out;
}
function motivoDe(cm) {
  for (const k of CAMPOS_MOTIVO) if (cm[k]) return cm[k];
  const outro = Object.keys(cm).find((k) => /motivo/i.test(k));
  return outro ? cm[outro] : null;
}

function compactTicket(t) {
  const cm = camposMotivo(t.customField);
  return {
    id: t.id, n: t.number, criado: t.createdAt, resolvido: t.resolutionDate || null,
    status: nomeDe(t.status), canal: nomeDe(t.channel), grupo: nomeDe(t.group),
    motivo: motivoDe(cm), cm, tags: (t.tags || []).map(nomeDe).filter(Boolean),
  };
}
function compactChat(c) {
  return {
    id: c.id, n: c.number, criado: c.createdAt, status: nomeDe(c.status), canal: nomeDe(c.channel),
    bot: !!c.withBot, origem: nomeDe(c.origin) || nomeDe(c.conversationOrigin), tags: (c.tags || []).map(nomeDe).filter(Boolean),
  };
}

// Formatos de consulta, do preferido ao mais simples. O primeiro que a API aceitar fica guardado por recurso.
const FORMATOS = [
  { nome: 'br-lt-sort', tz: 'br', fim: 'lt', sort: true, limit: 100 },
  { nome: 'br-lt', tz: 'br', fim: 'lt', sort: false, limit: 100 },
  { nome: 'utc-lt', tz: 'utc', fim: 'lt', sort: false, limit: 100 },
  { nome: 'br-le', tz: 'br', fim: 'le', sort: false, limit: 100 },
  { nome: 'utc-le', tz: 'utc', fim: 'le', sort: false, limit: 100 },
  { nome: 'br-lt-50', tz: 'br', fim: 'lt', sort: false, limit: 50 },
  { nome: 'utc-lt-50', tz: 'utc', fim: 'lt', sort: false, limit: 50 },
  { nome: 'data-lt', tz: 'data', fim: 'lt', sort: false, limit: 50 },
];
const valorData = (data, tz, fimLe) => {
  if (tz === 'data') return data;
  if (fimLe) {
    const t = new Date(`${data}T00:00:00${OFF}`).getTime() - 1000;
    return tz === 'utc' ? new Date(t).toISOString().replace('.000', '') : new Date(t - 3 * 3600e3).toISOString().slice(0, 19) + OFF;
  }
  return tz === 'utc' ? new Date(`${data}T00:00:00${OFF}`).toISOString().replace('.000', '') : isoBR(data);
};

async function baixarDiaCom(recurso, data, fm) {
  const ini = valorData(data, fm.tz, false);
  const fim = valorData(somaDia(data, 1), fm.tz, fm.fim === 'le');
  const itens = [];
  for (let page = 1; page <= 400; page++) {
    const qs = `?filters[0][property]=createdAt&filters[0][operator]=ge&filters[0][value]=${encodeURIComponent(ini)}`
      + `&filters[1][property]=createdAt&filters[1][operator]=${fm.fim}&filters[1][value]=${encodeURIComponent(fim)}`
      + (fm.sort ? '&sort[property]=createdAt&sort[direction]=asc' : '')
      + `&page=${page}&limit=${fm.limit}`;
    const r = await get(`/${recurso}${qs}`);
    const lista = Array.isArray(r) ? r : r?.data || r?.items || r?.results || [];
    itens.push(...lista);
    if (lista.length < fm.limit) break;
    await sleep(150);
  }
  const fora = itens.filter((x) => diaBR(x.createdAt) !== data).length;
  return { itens, fora };
}

async function baixarDia(recurso, data) {
  octa.status.formato = octa.status.formato || {};
  const salvo = FORMATOS.find((f) => f.nome === octa.status.formato[recurso]);
  const ordem = salvo ? [salvo, ...FORMATOS.filter((f) => f !== salvo)] : FORMATOS;
  let ultimo;
  for (const fm of ordem) {
    try {
      const r = await baixarDiaCom(recurso, data, fm);
      octa.status.formato[recurso] = fm.nome;
      return r;
    } catch (e) {
      ultimo = e;
      if (e.status !== 400 && e.status !== 422) throw e; // só troca de formato quando a API recusa a consulta
    }
  }
  throw ultimo;
}

let rodando = false;
export async function syncOctadesk() {
  if (rodando || !env('OCTADESK_TOKEN') || !baseUrl()) return;
  rodando = true;
  try {
    const hoje = diaBR(new Date().toISOString());
    const inicio = env('OCTADESK_INICIO') || '2025-10-01';
    const dias = [];
    for (let d = inicio; d <= hoje; d = somaDia(d, 1)) {
      const recente = d >= somaDia(hoje, -3);
      if (recente || !octa.diasOk[d]) dias.push(d);
    }
    let feitos = 0;
    const falhou = {};
    for (const d of dias) {
      let okDia = true;
      for (const [recurso, alvo, comp] of [['tickets', 'tickets', compactTicket], ['chat', 'chats', compactChat]]) {
        if (falhou[recurso]) { okDia = false; continue; }
        // A API de conversas só aceita datas de até um ano atrás.
        if (recurso === 'chat' && d < somaDia(hoje, -364)) { octa.status.chat_desde = somaDia(hoje, -364); continue; }
        let res;
        try { res = await baixarDia(recurso, d); } catch (e) {
          falhou[recurso] = `${recurso} (${d}): ${e.message}`; okDia = false; continue;
        }
        const { itens, fora } = res;
        if (fora > 0 && fora === itens.length && itens.length > 0) {
          octa.status.filtro_ok = false;
          falhou[recurso] = `O filtro por data de ${recurso} não foi aplicado pela API (${fora} itens de outros dias).`;
          okDia = false; continue;
        }
        for (const x of itens) if (diaBR(x.createdAt) === d) {
          octa[alvo][x.id] = comp(x);
          if (recurso === 'tickets' && x.customField) {
            const ks = Array.isArray(x.customField) ? x.customField.map((c) => c && (c.name || c.key || c.label || c.id)) : Object.keys(x.customField);
            const set = new Set(JSON.parse(octa.status.exemplo_campos_personalizados || '[]'));
            ks.filter(Boolean).forEach((k) => set.add(String(k)));
            octa.status.exemplo_campos_personalizados = JSON.stringify([...set].slice(0, 40));
          }
        }
      }
      if (!falhou.tickets && !falhou.chat) octa.status.filtro_ok = true;
      if (okDia && d < somaDia(hoje, -3)) octa.diasOk[d] = true;
      if (!falhou.tickets) octa.status.backfill_ate = d;
      if (++feitos % 15 === 0) salvar();
      if (falhou.tickets && falhou.chat) break;
    }
    if (!falhou.tickets) octa.status.ultima = new Date().toISOString();
    if (falhou.tickets || falhou.chat) throw new Error(Object.values(falhou).join(' | '));
    octa.status.ultima = new Date().toISOString();
    octa.status.erro = null;
    salvar();
    console.log(`Octadesk ok: ${dias.length} dias, ${Object.keys(octa.tickets).length} tickets, ${Object.keys(octa.chats).length} conversas`);
  } catch (err) {
    octa.status.erro = `${new Date().toISOString()}: ${err.message}`;
    console.error('Octadesk falhou:', err.message);
    try { salvar(); } catch {}
  } finally {
    rodando = false;
  }
}

export function startOctadesk() {
  carregar();
  setTimeout(syncOctadesk, 30000);
  setInterval(syncOctadesk, Number(env('OCTADESK_EVERY_MIN') || 30) * 60000);
}

// ---------------- Agregações ----------------
const r4 = (x) => Math.round(x * 10000) / 10000;
function noPeriodo(mapa, i, f) { return Object.values(mapa).filter((x) => { const d = diaBR(x.criado); return d >= i && d <= f; }); }

export function atendimentoPorDia(inicio, fim) {
  const hoje = diaBR(new Date().toISOString());
  const i = /^\d{4}-\d{2}-\d{2}$/.test(inicio || '') ? inicio : '2026-10-01';
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fim || '') ? fim : hoje;
  const conta = (mapa, filtro = () => true) => {
    const m = {};
    for (const x of Object.values(mapa)) if (filtro(x)) { const d = diaBR(x.criado); m[d] = (m[d] || 0) + 1; }
    return m;
  };
  const t = conta(octa.tickets), c = conta(octa.chats), cb = conta(octa.chats, (x) => x.bot), ch = conta(octa.chats, (x) => !x.bot);
  const out = [];
  for (let d = i; d <= f; d = somaDia(d, 1)) {
    const ly = somaDia(d, -364);
    out.push({
      data: d, data_2025: ly,
      tickets: t[d] || 0, conversas: c[d] || 0, conversas_humanas: ch[d] || 0, conversas_bot: cb[d] || 0, total: (t[d] || 0) + (c[d] || 0),
      tickets_2025: t[ly] || 0, conversas_2025: c[ly] || 0, total_2025: (t[ly] || 0) + (c[ly] || 0),
    });
  }
  return out;
}

export function atendimentoPorGrupo(inicio, fim, agrupar, origem) {
  const hoje = diaBR(new Date().toISOString());
  const i = /^\d{4}-\d{2}-\d{2}$/.test(inicio || '') ? inicio : '2026-10-01';
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fim || '') ? fim : hoje;
  const campo = ['motivo', 'canal', 'grupo', 'status', 'tag'].includes(agrupar) ? agrupar : 'motivo';
  const fonte = origem === 'chat' ? octa.chats : octa.tickets;
  const chave = (x) => (campo === 'tag' ? (x.tags.length ? x.tags : ['Sem tag']) : [x[campo] || 'Não informado']);
  const contar = (lista) => { const m = new Map(); for (const x of lista) for (const k of chave(x)) m.set(k, (m.get(k) || 0) + 1); return m; };
  const atual = noPeriodo(fonte, i, f);
  const ant = noPeriodo(fonte, somaDia(i, -364), somaDia(f, -364));
  const a = contar(atual), b = contar(ant);
  return [...new Set([...a.keys(), ...b.keys()])].map((k) => ({
    agrupamento: campo, origem: origem === 'chat' ? 'chat' : 'tickets', grupo: k,
    quantidade: a.get(k) || 0, participacao: atual.length ? r4((a.get(k) || 0) / atual.length) : null,
    quantidade_2025: b.get(k) || 0, variacao: b.get(k) ? r4((a.get(k) || 0) / b.get(k) - 1) : null,
  })).sort((p, q) => q.quantidade - p.quantidade);
}

export function statusOctadesk() {
  return {
    octadesk_ultima_sincronizacao: octa.status.ultima, octadesk_erro: octa.status.erro, octadesk_filtro_por_data_ok: octa.status.filtro_ok,
    octadesk_carregado_ate: octa.status.backfill_ate, octadesk_tickets: Object.keys(octa.tickets).length, octadesk_conversas: Object.keys(octa.chats).length,
    octadesk_campos_personalizados: octa.status.exemplo_campos_personalizados,
    octadesk_conversas_disponiveis_desde: octa.status.chat_desde || null,
    octadesk_motivos_preenchidos: Object.values(octa.tickets).filter((x) => x.motivo).length,
    octadesk_formato_consulta: octa.status.formato ? JSON.stringify(octa.status.formato) : null,
  };
}
