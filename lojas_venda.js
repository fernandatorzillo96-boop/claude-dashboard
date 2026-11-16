// Venda das lojas físicas: "base comercial" do varejo (Excel), importada todo dia.
// Colunas: Data (dia) | Código da loja | Loja | Referência | Canal | Valor de venda | Peças | Valor de tabela | Desconto sobre tabela
// Canal (arquivos a partir de nov/26): Varejo = loja física; E-commerce e E-commerce Omni = site + app.
// Mesmos critérios da aba 05i ACOMPANHAMENTO LOJAS do BF26_Apoio_Executivo:
//  - venda bruta = linhas com peças > 0 (devoluções à parte; líquido = todas as linhas)
//  - % SALE = itens com desconto de 40% ou mais sobre a tabela
//  - CMV = custo GEC fixo do plano por referência (sem custo no plano: custo GEC da tabela de produtos),
//    com a margem das referências identificadas aplicada à venda bruta do dia
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { costByRef } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let custoPlano = {};
try { custoPlano = JSON.parse(fs.readFileSync(path.join(here, 'custo_plano_por_referencia.json'), 'utf8')); } catch { console.error('custo_plano_por_referencia.json não encontrado: usando só o custo GEC da tabela de produtos.'); }
const custoDe = (ref) => (ref in custoPlano ? custoPlano[ref] : ref in costByRef ? costByRef[ref] : null);

// CD do e-commerce (64, e 58 residual) e fábrica (3) não são loja física: a venda deles já está no site / não entra no plano das lojas
const NAO_LOJA = new Set(['64', '58', '3']);
const ARQ = () => path.join(config.dataDir, 'lojas_venda.json.gz');
const r2 = (x) => Math.round(x * 100) / 100;
const p4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);

// dados: { importado_em, arquivo, dias: { 'AAAA-MM-DD': { empresa: {loja, bruta, pecas, sale, de, cmv_id, rec_id, liquida, devolvido, pecas_devolvidas} } } }
const lv = { importado_em: null, arquivo: null, dias: {} };

export function carregarLojas() {
  try { Object.assign(lv, JSON.parse(zlib.gunzipSync(fs.readFileSync(ARQ())).toString('utf8'))); } catch {}
}
function salvar() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = ARQ() + '.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(lv)));
  fs.renameSync(tmp, ARQ());
}

const num = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};
// Data do Excel: número serial, Date em texto ISO, ou dd/mm/aaaa
function dataDe(v) {
  if (typeof v === 'number' && v > 30000) return new Date(Math.round((v - 25569) * 86400e3)).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
// Canal da base comercial: varejo (loja física), ecom (E-commerce, CD) e omni (E-commerce Omni, faturado nas lojas)
const canalDe = (v) => {
  const c = String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!c) return null;
  if (c.includes('omni')) return 'omni';
  if (c.includes('commerce') || c.includes('ecom') || c === 'site' || c === 'app') return 'ecom';
  if (c.includes('varejo') || c.includes('loja')) return 'varejo';
  return c;
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// body: { nome_arquivo, colunas: [...], linhas: [[...], ...] }
export function importarLojas(body) {
  const cols = (body?.colunas || []).map(norm);
  const achar = (...nomes) => cols.findIndex((c) => nomes.some((n) => c === n || c.startsWith(n)));
  const ix = {
    data: achar('data (dia)', 'data'), cod: achar('codigo da loja', 'cod loja', 'cd_empresa'), loja: achar('loja'),
    ref: achar('referencia'), valor: achar('valor de venda', 'valor venda'), pecas: achar('pecas', 'quantidade'),
    tabela: achar('valor de tabela', 'valor tabela'), desc: achar('desconto sobre tabela', 'desconto'), canal: achar('canal'),
  };
  const faltam = Object.entries(ix).filter(([k, v]) => v < 0 && k !== 'desc' && k !== 'canal').map(([k]) => k);
  if (faltam.length) throw new Error('Não achei as colunas: ' + faltam.join(', ') + '. Esperado: Data (dia), Código da loja, Loja, Referência, Valor de venda, Peças, Valor de tabela.');
  const novos = {};
  let linhas = 0, semCusto = 0;
  for (const l of body.linhas || []) {
    const d = dataDe(l[ix.data]);
    if (!d) continue;
    const emp = String(Math.round(num(l[ix.cod])));
    const ref = String(l[ix.ref] ?? '').trim();
    const v = num(l[ix.valor]), p = num(l[ix.pecas]), t = num(l[ix.tabela]);
    const ds = ix.desc >= 0 && l[ix.desc] !== '' && l[ix.desc] != null ? num(l[ix.desc]) : t ? 1 - v / t : 0;
    const canal = ix.canal >= 0 ? canalDe(l[ix.canal]) : null;
    const dia = (novos[d] ||= {});
    const a = (dia[canal ? emp + '|' + canal : emp] ||= { loja: String(l[ix.loja] ?? emp), empresa: emp, canal, bruta: 0, pecas: 0, sale: 0, de: 0, cmv_id: 0, rec_id: 0, liquida: 0, devolvido: 0, pecas_devolvidas: 0, pecas_liq: 0, sale_liq: 0, de_liq: 0, cmv_id_liq: 0, rec_id_liq: 0 });
    a.liquida += v;
    // líquido: todas as linhas (as devoluções entram negativas), como na aba 05i
    a.pecas_liq += p; a.de_liq += t;
    if (ds >= 0.4) a.sale_liq += v;
    { const c = custoDe(ref); if (c != null) { a.cmv_id_liq += c * p; a.rec_id_liq += v; } }
    if (p > 0) {
      a.bruta += v; a.pecas += p; a.de += t;
      if (ds >= 0.4) a.sale += v;
      const c = custoDe(ref);
      if (c != null) { a.cmv_id += c * p; a.rec_id += v; } else semCusto += v;
    } else { a.devolvido += -v; a.pecas_devolvidas += -p; }
    linhas++;
  }
  const dias = Object.keys(novos).sort();
  if (!dias.length) throw new Error('Nenhuma linha com data válida no arquivo.');
  for (const d of dias) {
    for (const a of Object.values(novos[d])) for (const k of Object.keys(a)) if (typeof a[k] === 'number') a[k] = r2(a[k]);
    lv.dias[d] = novos[d]; // substitui o dia inteiro
  }
  lv.importado_em = new Date().toISOString();
  lv.arquivo = String(body.nome_arquivo || '').slice(0, 120);
  salvar();
  const porCanal = {};
  for (const d of dias) for (const a of Object.values(novos[d])) porCanal[a.canal || 'sem canal'] = r2((porCanal[a.canal || 'sem canal'] || 0) + a.liquida);
  return { linhas, dias: dias.length, de: dias[0], ate: dias[dias.length - 1], lojas: new Set(dias.flatMap((d) => Object.values(novos[d]).map((a) => a.empresa))).size, venda_sem_custo: r2(semCusto), venda_liquida_por_canal: porCanal };
}

const fecha = (a) => {
  const cmv = a.rec_id ? (a.cmv_id / a.rec_id) * a.bruta : null;
  return {
    venda_bruta: r2(a.bruta), pecas: a.pecas, venda_sale: r2(a.sale), valor_de: r2(a.de), cmv: cmv == null ? null : r2(cmv),
    venda_liquida: r2(a.liquida), devolvido: r2(a.devolvido), pecas_devolvidas: a.pecas_devolvidas,
    preco_medio: a.pecas ? r2(a.bruta / a.pecas) : null, pct_sale: a.bruta ? p4(a.sale / a.bruta) : null,
    margem_bruta: cmv != null && a.bruta ? p4(1 - cmv / a.bruta) : null, desconto_sobre_de: a.de ? p4(1 - a.bruta / a.de) : null,
    cobertura_custo: a.bruta ? p4(a.rec_id / a.bruta) : null,
    // líquido (vendas − devoluções): base das abas 05i/05j
    pecas_liquidas: a.pecas_liq ?? a.pecas - a.pecas_devolvidas,
    venda_sale_liquida: a.sale_liq != null ? r2(a.sale_liq) : null, valor_de_liquido: a.de_liq != null ? r2(a.de_liq) : null,
    cmv_liquido: a.rec_id_liq ? r2((a.cmv_id_liq / a.rec_id_liq) * a.liquida) : null,
    tem_liquido: a.sale_liq != null,
  };
};
const CAMPOS = ['bruta', 'pecas', 'sale', 'de', 'cmv_id', 'rec_id', 'liquida', 'devolvido', 'pecas_devolvidas', 'pecas_liq', 'sale_liq', 'de_liq', 'cmv_id_liq', 'rec_id_liq'];
const soma = (xs) => {
  const s = Object.fromEntries(CAMPOS.map((k) => [k, 0]));
  let liq = true;
  for (const a of xs) { if (a.sale_liq == null) liq = false; for (const k of CAMPOS) s[k] += a[k] || 0; }
  if (!liq) { s.pecas_liq = null; s.sale_liq = null; s.de_liq = null; s.rec_id_liq = 0; } // importado antes da versão com líquido: reimportar
  return s;
};

// empresa da chave (arquivos novos: 'empresa|canal')
const empDe = (k, a) => a.empresa || k.split('|')[0];

// agrupar: 'dia' (padrão) ou 'loja'
export function vendaLojas(inicio, fim, agrupar = 'dia') {
  const dias = Object.keys(lv.dias).filter((d) => (!inicio || d >= inicio) && (!fim || d <= fim)).sort();
  if (agrupar === 'loja') {
    // com o Canal na base, só o Varejo é venda da loja física (o Omni faturado na loja é venda do site)
    const g = {};
    for (const d of dias) for (const [k, a] of Object.entries(lv.dias[d])) {
      const emp = empDe(k, a);
      if (NAO_LOJA.has(emp)) continue;
      const e = (g[emp] ||= { loja: a.loja, xs: [], omni: 0, dias: new Set() });
      if (a.canal && a.canal !== 'varejo') { if (a.canal === 'omni') e.omni += a.liquida || 0; continue; }
      e.xs.push(a); e.dias.add(d);
    }
    return Object.entries(g).filter(([, e]) => e.xs.length)
      .map(([emp, e]) => ({ empresa: Number(emp), loja: e.loja, dias: e.dias.size, ...fecha(soma(e.xs)), venda_omni_liquida: r2(e.omni) }))
      .sort((a, b) => b.venda_bruta - a.venda_bruta);
  }
  // por dia: todas as empresas da base (lojas + CD), sem a fábrica (3).
  // Arquivos com Canal: lojas = Varejo; site = E-commerce + E-commerce Omni (campos lojas_* e site_*).
  // Arquivos antigos (sem Canal): o painel tira o site (3351) da rede para chegar nas lojas, como a aba 05i.
  return dias.map((d) => {
    const ent = Object.entries(lv.dias[d]).filter(([k, a]) => empDe(k, a) !== '3');
    const xs = ent.map(([, a]) => a);
    const cd = ent.filter(([k, a]) => NAO_LOJA.has(empDe(k, a))).reduce((t, [, a]) => t + (a.liquida || 0), 0);
    const out = { data: d, lojas: new Set(ent.map(([k, a]) => empDe(k, a))).size, ...fecha(soma(xs)), venda_liquida_cd: r2(cd) };
    const comCanal = xs.length > 0 && xs.every((a) => a.canal);
    out.tem_canal = comCanal;
    if (comCanal) {
      const pref = (o, px) => Object.fromEntries(Object.entries(o).map(([k, v]) => [px + k, v]));
      Object.assign(out,
        pref(fecha(soma(xs.filter((a) => a.canal === 'varejo'))), 'lojas_'),
        pref(fecha(soma(xs.filter((a) => a.canal !== 'varejo'))), 'site_'),
        { ecom_venda_liquida: r2(xs.filter((a) => a.canal === 'ecom').reduce((t, a) => t + a.liquida, 0)),
          omni_venda_liquida: r2(xs.filter((a) => a.canal === 'omni').reduce((t, a) => t + a.liquida, 0)) });
    }
    return out;
  });
}

export function statusLojas() {
  const dias = Object.keys(lv.dias).sort();
  return { lojas_importado_em: lv.importado_em, lojas_arquivo: lv.arquivo, lojas_dias: dias.length, lojas_ultimo_dia: dias[dias.length - 1] || null };
}
