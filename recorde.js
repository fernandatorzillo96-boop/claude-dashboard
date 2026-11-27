// Recorde de captação: varre a lista de pedidos da VTEX dos últimos 2 anos (limite da plataforma),
// dia a dia, e soma o captado (pedidos não cancelados, valor total do pedido, todos os canais), por dia e por hora.
// Roda em segundo plano e grava o progresso em DATA_DIR/recorde_captacao.json (retoma de onde parou).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { vtexGet } from './vtex.js';
import { local, hojeLocal, inicioDoDiaUTC, somaDias } from './tempo.js';

const ARQ = path.join(config.dataDir, 'recorde_captacao.json');
const MAX_LIST = 2900;
let dados = null;
let rodando = false;
let erro = null;

// v2: pedidos contados pelo pedido-mãe (sem o sufixo -01, -02), o mesmo critério do painel.
const VERSAO = 2;
function carregar() {
  if (dados) return dados;
  try { dados = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch { dados = { dias: {}, horas: {} }; }
  if (dados.v !== VERSAO) dados = { v: VERSAO, dias: {}, horas: {} };
  return dados;
}
function gravar() {
  try { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(ARQ, JSON.stringify(dados)); } catch {}
}

async function listar(from, to, out) {
  const f = `creationDate:[${from.toISOString()} TO ${new Date(to.getTime() - 1).toISOString()}]`;
  const q = (p) => `/api/oms/pvt/orders?f_creationDate=${encodeURIComponent(f)}&per_page=100&page=${p}&orderBy=creationDate,asc`;
  const first = await vtexGet(q(1));
  const total = first?.paging?.total || 0;
  if (total > MAX_LIST && to - from > 10 * 60 * 1000) {
    const mid = new Date(from.getTime() + Math.floor((to - from) / 2));
    await listar(from, mid, out); await listar(mid, to, out); return;
  }
  out.push(...(first?.list || []));
  const pages = Math.min(first?.paging?.pages || 1, 30);
  for (let p = 2; p <= pages; p++) out.push(...((await vtexGet(q(p)))?.list || []));
}

async function rodar() {
  rodando = true; erro = null;
  const d = carregar();
  const hoje = hojeLocal();
  // A VTEX só devolve pedidos criados nos últimos 2 anos: começa um dia depois do limite, por segurança.
  const ini = somaDias(hoje, -729);
  d.inicio = ini; d.fim = somaDias(hoje, -1);
  try {
    for (let dia = ini; dia < hoje; dia = somaDias(dia, 1)) {
      if (d.dias[dia] && dia < somaDias(hoje, -3)) continue; // já lido (os últimos 3 dias são relidos: cancelamentos)
      const a = inicioDoDiaUTC(dia), b = inicioDoDiaUTC(somaDias(dia, 1));
      const lst = [];
      for (let t = a.getTime(); t < b.getTime(); t += 6 * 3600 * 1000) await listar(new Date(t), new Date(t + 6 * 3600 * 1000), lst);
      const reg = { captado: 0, pedidos: 0, cancelados: 0 };
      for (let h = 0; h < 24; h++) delete d.horas[dia + ' ' + String(h).padStart(2, '0')];
      const bases = new Set(), cancelados = new Set();
      lst.sort((a, b) => String(a.creationDate).localeCompare(String(b.creationDate)));
      for (const o of lst) {
        const base = String(o.orderId || '').replace(/-\d+$/, '');
        if (o.status === 'canceled') { cancelados.add(base); continue; }
        const v = (o.totalValue || 0) / 100;
        reg.captado += v;
        const l = local(o.creationDate);
        const k = l.data + ' ' + String(l.hora).padStart(2, '0');
        const hh = (d.horas[k] ||= { captado: 0, pedidos: 0 });
        hh.captado += v;
        if (!bases.has(base)) { bases.add(base); reg.pedidos++; hh.pedidos++; }
      }
      reg.cancelados = [...cancelados].filter((b) => !bases.has(b)).length;
      reg.captado = Math.round(reg.captado * 100) / 100;
      d.dias[dia] = reg;
      d.atualizado = new Date().toISOString();
      gravar();
    }
  } catch (e) { erro = String(e?.message || e); }
  rodando = false;
}

export function recordeCaptacao({ iniciar = false, top = 10, dia = null, inicio = null, fim = null } = {}) {
  const d = carregar();
  // Horas de um intervalo de dias (para a curva de 2025 do painel): data25, data26 (+364 dias), hora, captado, pedidos.
  if (inicio && fim) {
    const out = [];
    for (let x = inicio; x <= fim; x = somaDias(x, 1)) {
      if (!d.dias[x]) continue;
      for (let h = 0; h < 24; h++) {
        const v = d.horas[x + ' ' + String(h).padStart(2, '0')] || { captado: 0, pedidos: 0 };
        out.push({ data25: x, data26: somaDias(x, 364), hora: h, captado: Math.round(v.captado * 100) / 100, pedidos: v.pedidos });
      }
    }
    return out;
  }
  if (dia) {
    const hs = []; let ac = 0, ap = 0;
    for (let h = 0; h < 24; h++) { const v = d.horas[dia + ' ' + String(h).padStart(2, '0')] || { captado: 0, pedidos: 0 }; ac += v.captado; ap += v.pedidos; hs.push({ hora: h, captado: Math.round(v.captado * 100) / 100, pedidos: v.pedidos, acumulado: Math.round(ac * 100) / 100, pedidos_acum: ap }); }
    return { dia, total: d.dias[dia] || null, horas: hs };
  }
  if (iniciar && !rodando) rodar();
  const hoje = hojeLocal();
  const ini = somaDias(hoje, -729);
  let total = 0; for (let x = ini; x < hoje; x = somaDias(x, 1)) total++;
  const lidos = Object.keys(d.dias).filter((x) => x >= ini && x < hoje).length;
  const r2 = (v) => Math.round(v * 100) / 100;
  const dias = Object.entries(d.dias).filter(([x]) => x >= ini).map(([data, v]) => ({ data, ...v, ticket_medio: v.pedidos ? r2(v.captado / v.pedidos) : null }));
  const horas = Object.entries(d.horas).filter(([x]) => x >= ini).map(([k, v]) => ({ data: k.slice(0, 10), hora: Number(k.slice(11)), captado: r2(v.captado), pedidos: v.pedidos }));
  const meses = {};
  for (const x of dias) { const m = (meses[x.data.slice(0, 7)] ||= { mes: x.data.slice(0, 7), captado: 0, pedidos: 0, dias: 0 }); m.captado += x.captado; m.pedidos += x.pedidos; m.dias++; }
  const ord = (k) => (a, b) => b[k] - a[k];
  return {
    criterio: 'Captado = valor total dos pedidos não cancelados (com frete), todos os canais, pela data de criação no horário de Brasília. Pedidos contados pelo pedido-mãe (sem o sufixo -01, -02), como no painel. A VTEX só devolve pedidos dos últimos 2 anos.',
    periodo: { inicio: ini, fim: somaDias(hoje, -1) },
    progresso: { rodando, dias_lidos: lidos, dias_total: total, atualizado: d.atualizado || null, erro },
    top_dias: dias.sort(ord('captado')).slice(0, top),
    top_dias_pedidos: [...dias].sort(ord('pedidos')).slice(0, top),
    top_horas: horas.sort(ord('captado')).slice(0, top),
    top_meses: Object.values(meses).map((m) => ({ ...m, captado: r2(m.captado) })).sort(ord('captado')).slice(0, 6),
  };
}

// Varredura automática: 1 min depois de subir (refaz tudo se a versão mudou) e a cada 6 h (relê os últimos dias).
if (!process.env.RECORDE_SEM_AUTO) {
  setTimeout(() => { if (!rodando) rodar(); }, 60e3).unref?.();
  setInterval(() => { if (!rodando) rodar(); }, 6 * 3600e3).unref?.();
}
