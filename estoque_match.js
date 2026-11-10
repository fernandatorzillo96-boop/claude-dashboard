// Match de estoque: estoque das lojas no ERP (arquivo "Estoque") × estoque na VTEX, por loja e SKU.
// O SKU é casado pelo código reduzido do ERP (cd_produto) = RefId do SKU na VTEX.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { state } from './store.js';

const ARQ = () => path.join(config.dataDir, 'estoque_match.json.gz');

// erp: { importado_em, arquivo_em, nome_arquivo, lojas: {empresa: nome}, itens: {empresa: {cd: qtd}}, attrs: {cd: [ref, desc, tam, cor, sale, preco]} }
// vtex: { atualizado_em, lojas: {empresa: {warehouse_id, nome}}, itens: {empresa: {refId: [total, reservado, skuId, ativo]}}, refIds: [..] }
const est = { erp: null, vtex: null };

export function carregarMatch() {
  try { Object.assign(est, JSON.parse(zlib.gunzipSync(fs.readFileSync(ARQ())).toString('utf8'))); } catch {}
}
function salvar() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = ARQ() + '.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(est)));
  fs.renameSync(tmp, ARQ());
}

// Loja do ERP (cd_empresa) a que corresponde um warehouse da VTEX.
// CD do e-commerce (1_1) = empresa 64 "E-Commerce"; "Loja 9 - Estoque físico" = empresa 9.
export function empresaDoWarehouse(id, nome) {
  if (id === '1_1' || /cd\s*ecommerce|estoque principal/i.test(nome || '')) return 64;
  const m = /loja\s*0*(\d+)/i.exec(nome || '');
  return m ? Number(m[1]) : null;
}
// No ERP, o e-commerce aparece como empresa 64 (e 58, residual): os dois contam como o CD.
const empresaErp = (cd) => (cd === 58 ? 64 : cd);

// Chamado no fim de cada varredura de estoque da VTEX (sync.js).
// porSku: {skuId: [refId, ativo(0/1), [[warehouseId, total, reservado], ...]]} só com warehouses com estoque;
// nomes: {warehouseId: nome}.
export function registrarEstoqueVtex(porSku, nomes, atualizadoEm) {
  const lojas = {}, itens = {}, refIds = [];
  const empDe = {};
  for (const [wid, nome] of Object.entries(nomes || {})) {
    const emp = empresaDoWarehouse(wid, nome);
    empDe[wid] = emp;
    if (emp != null && !lojas[emp]) lojas[emp] = { warehouse_id: wid, nome };
  }
  for (const [skuId, s] of Object.entries(porSku)) {
    const ref = String(s[0] || skuId);
    refIds.push(ref);
    for (const [wid, total, res] of s[2]) {
      const emp = empDe[wid];
      if (emp == null) continue;
      itens[emp] = itens[emp] || {};
      const cur = itens[emp][ref];
      if (cur) { cur[0] += total; cur[1] += res; } else itens[emp][ref] = [total, res, skuId, s[1]];
    }
  }
  est.vtex = { atualizado_em: atualizadoEm, lojas, itens, refIds };
  try { salvar(); } catch (e) { console.error('Match de estoque: não salvei', e.message); }
}

// Recebe o arquivo do ERP já lido pela página (colunas essenciais).
// body: { nome_arquivo, arquivo_em, colunas: [...], linhas: [[...], ...] }
export function importarEstoqueErp(body) {
  const cols = body?.colunas, linhas = body?.linhas;
  if (!Array.isArray(cols) || !Array.isArray(linhas) || !linhas.length) throw new Error('Arquivo vazio ou sem as colunas esperadas.');
  const ix = (n) => cols.findIndex((c) => String(c).trim().toLowerCase() === n);
  const c = {
    canal: ix('ds_canal'), emp: ix('cd_empresa'), nome: ix('empresa'), cd: ix('cd_produto'), qtd: ix('estoque atual'),
    ref: ix('referencia'), desc: ix('ds_referencia'), tam: ix('tamanho'), cor: ix('cor'), sale: ix('sale'), preco: ix('vlr varejo'), saldo: ix('saldo'),
  };
  for (const k of ['emp', 'cd', 'qtd']) if (c[k] < 0) throw new Error(`Coluna não encontrada: ${{ emp: 'cd_empresa', cd: 'cd_produto', qtd: 'Estoque atual' }[k]}`);
  const lojas = {}, itens = {}, attrs = {};
  let lidas = 0, ignoradas = 0;
  const outrosSaldos = {};
  for (const r of linhas) {
    // base de estoque com coluna Saldo: só o saldo físico (1 - Fisico) se compara com a VTEX
    if (c.saldo >= 0 && r[c.saldo] != null && r[c.saldo] !== '' && !/^\s*1\s*-|f[ií]sico/i.test(String(r[c.saldo]))) {
      const k = String(r[c.saldo]); outrosSaldos[k] = (outrosSaldos[k] || 0) + (Number(r[c.qtd]) || 0); continue;
    }
    const canal = c.canal >= 0 ? String(r[c.canal] || '') : '';
    let emp = Number(r[c.emp]);
    // Só lojas (ON e OFF) e o e-commerce; fábrica, atacado, DPA etc. não têm estoque na VTEX.
    if (!Number.isFinite(emp) || emp === 3 || !(/^[12]-/.test(canal) || /^lojas/i.test(canal) || /e-?commerce/i.test(canal) || !canal)) { ignoradas++; continue; }
    emp = empresaErp(emp);
    const cd = String(r[c.cd] ?? '').replace(/\.0$/, '').trim();
    if (!cd) { ignoradas++; continue; }
    const q = Number(r[c.qtd]) || 0;
    lojas[emp] = lojas[emp] || (emp === 64 ? 'E-commerce (CD)' : String(r[c.nome] || `Loja ${emp}`));
    itens[emp] = itens[emp] || {};
    itens[emp][cd] = (itens[emp][cd] || 0) + q;
    if (!attrs[cd]) attrs[cd] = [r[c.ref] ?? null, r[c.desc] ?? null, r[c.tam] ?? null, r[c.cor] ?? null, c.sale >= 0 && /sale/i.test(String(r[c.sale] || '')) && !/fora|n[aã]o/i.test(String(r[c.sale] || '')) ? 1 : 0, c.preco >= 0 ? Number(r[c.preco]) || null : null];
    lidas++;
  }
  if (!lidas) throw new Error('Nenhuma linha de loja ou e-commerce no arquivo.');
  est.erp = { importado_em: new Date().toISOString(), arquivo_em: body.arquivo_em || null, nome_arquivo: body.nome_arquivo || null, lojas, itens, attrs };
  salvar();
  const pecas = Object.values(itens).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
  return { lojas: Object.keys(lojas).length, linhas: lidas, ignoradas, pecas, outros_saldos: outrosSaldos };
}

// RefIds cadastrados na VTEX (catálogo inteiro, não só os com estoque).
let cacheRefs = null, cacheN = -1;
function refsVtex() {
  const n = Object.keys(state.catalog).length;
  if (!cacheRefs || n !== cacheN) {
    cacheRefs = new Set(Object.values(state.catalog).map((c) => c && c.refId).filter(Boolean).map(String));
    for (const r of est.vtex?.refIds || []) cacheRefs.add(r);
    cacheN = n;
  }
  return cacheRefs;
}

const TIPOS = ['Quantidade diferente', 'Só no ERP', 'Só na VTEX', 'SKU não existe na VTEX'];
export { TIPOS as TIPOS_DIVERGENCIA };

// Compara uma loja: devolve as linhas (só SKUs com estoque em algum dos lados).
function compararLoja(emp, refSet) {
  const e = est.erp?.itens?.[emp] || {}, v = est.vtex?.itens?.[emp] || {};
  const out = [];
  for (const cd of new Set([...Object.keys(e), ...Object.keys(v)])) {
    const qe = e[cd] || 0, vv = v[cd], qv = vv ? vv[0] : 0;
    if (qe <= 0 && qv <= 0) continue;
    let tipo = 'OK';
    if (qe !== qv) {
      if (qv <= 0 && qe > 0) tipo = refSet.has(cd) ? 'Só no ERP' : 'SKU não existe na VTEX';
      else if (qe <= 0 && qv > 0) tipo = 'Só na VTEX';
      else tipo = 'Quantidade diferente';
    }
    out.push({ cd, qe, qv, res: vv ? vv[1] : 0, sku: vv ? vv[2] : null, ativo: vv ? vv[3] : null, tipo });
  }
  return out;
}
const nomeLoja = (emp) => est.erp?.lojas?.[emp] || est.vtex?.lojas?.[emp]?.nome || `Loja ${emp}`;
const lojasDoMatch = () => [...new Set([...Object.keys(est.erp?.lojas || {}), ...Object.keys(est.vtex?.lojas || {})])].map(Number).sort((a, b) => a - b);

export function matchResumo() {
  if (!est.erp || !est.vtex) return [];
  const refSet = refsVtex();
  const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
  return lojasDoMatch().map((emp) => {
    const rows = compararLoja(emp, refSet);
    const cnt = (t) => rows.filter((x) => x.tipo === t).length;
    const pe = rows.reduce((s, x) => s + x.qe, 0), pv = rows.reduce((s, x) => s + x.qv, 0);
    const ok = cnt('OK');
    return {
      empresa: emp, loja: nomeLoja(emp),
      no_erp: !!est.erp.lojas[emp], na_vtex: !!est.vtex?.lojas?.[emp],
      skus_comparados: rows.length, skus_iguais: ok, skus_divergentes: rows.length - ok,
      pct_match: rows.length ? p(ok / rows.length) : null,
      qtd_diferente: cnt('Quantidade diferente'), so_erp: cnt('Só no ERP'), so_vtex: cnt('Só na VTEX'), sem_cadastro_vtex: cnt('SKU não existe na VTEX'),
      pecas_erp: pe, pecas_vtex: pv, diferenca_pecas: pv - pe,
      pecas_divergentes: rows.reduce((s, x) => s + Math.abs(x.qv - x.qe), 0),
    };
  });
}

function linhasDivergentes(loja, tipo) {
  if (!est.erp || !est.vtex) return [];
  const refSet = refsVtex();
  const emps = loja != null && loja !== '' ? [Number(loja)] : lojasDoMatch();
  const out = [];
  for (const emp of emps) {
    for (const x of compararLoja(emp, refSet)) {
      if (x.tipo === 'OK' || (tipo && x.tipo !== tipo)) continue;
      const a = est.erp.attrs[x.cd] || [];
      out.push({
        chave: `${emp}|${x.cd}`, empresa: emp, loja: nomeLoja(emp), cd_produto: x.cd, sku_vtex: x.sku,
        referencia: a[0] ?? null, produto: a[1] ?? null, tamanho: a[2] ?? null, cor: a[3] ?? null, sale: a[4] ? 'Sale' : '', preco: a[5] ?? null,
        estoque_erp: x.qe, estoque_vtex: x.qv, reservado_vtex: x.res, diferenca: x.qv - x.qe,
        tipo: x.tipo, ativo_vtex: x.ativo == null ? null : x.ativo ? 'Sim' : 'Não',
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.empresa - b.empresa);
}

export function matchDivergencias(loja, tipo, limite) {
  return linhasDivergentes(loja, tipo).slice(0, Math.min(Math.max(Number(limite) || 300, 1), 2000));
}

// CSV para abrir no Excel (separador ; e BOM UTF-8).
export function matchCsv(loja, tipo) {
  const cols = ['loja', 'empresa', 'cd_produto', 'sku_vtex', 'referencia', 'produto', 'tamanho', 'cor', 'sale', 'preco', 'estoque_erp', 'estoque_vtex', 'reservado_vtex', 'diferenca', 'tipo', 'ativo_vtex'];
  const head = ['Loja', 'Empresa', 'Cód. reduzido (ERP)', 'SKU VTEX', 'Referência', 'Produto', 'Tamanho', 'Cor', 'Sale', 'Preço varejo', 'Estoque ERP', 'Estoque VTEX', 'Reservado VTEX', 'Diferença (VTEX − ERP)', 'Tipo', 'Ativo na VTEX'];
  const cel = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = linhasDivergentes(loja, tipo).map((r) => cols.map((k) => cel(r[k])).join(';'));
  return '﻿' + [head.join(';'), ...linhas].join('\r\n');
}

export function statusMatch() {
  return {
    estoque_erp_importado_em: est.erp?.importado_em || null,
    estoque_erp_arquivo: est.erp?.nome_arquivo || null,
    estoque_erp_arquivo_em: est.erp?.arquivo_em || null,
    estoque_vtex_match_em: est.vtex?.atualizado_em || null,
  };
}
