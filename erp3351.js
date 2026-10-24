// Importa o relatório 3351 do ERP (Virtual Age): faturado, devoluções e CMV por Custo GEC.
import { state, save, costByRef } from './store.js';

const num = (s) => {
  if (s === undefined || s === null) return 0;
  const t = String(s).trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (x) => Math.round(x * 100) / 100;

export function importar3351(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (linhas.length < 2) throw new Error('Não encontrei a tabela do 3351 (linhas separadas por |).');
  const split = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const header = split(linhas[0]);
  const col = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`Coluna "${n}" não encontrada no arquivo.`);
    return i;
  };
  const c = {
    data: col('Dt. Emissao da nota'), canal: col('Canal'), produto: col('Produto'), ref: col('Referencia'),
    qv: col('Qt. Vendida'), vv: col('Vl. Vendido'), qd: col('Qt. Devolvida'), vd: col('Vl. Devolvido'), vl: col('Vl. Vendido Liquido'),
  };
  const dias = {};
  let semCusto = 0, linhasValidas = 0, aprendidos = 0;
  for (const l of linhas.slice(1)) {
    const r = split(l);
    if (r[c.data] === header[c.data] || !/^\d{2}\/\d{2}\/\d{4}$/.test(r[c.data] || '')) continue;
    linhasValidas++;
    const [dd, mm, yyyy] = r[c.data].split('/');
    const data = `${yyyy}-${mm}-${dd}`;
    const canal = /OMNI/i.test(r[c.canal]) ? 'omni' : 'ecommerce';
    const ref = r[c.ref];
    const produto = (r[c.produto] || '').replace(/\./g, '');
    if (produto && ref && state.skuRef[produto] !== ref) { state.skuRef[produto] = ref; aprendidos++; }
    const qv = num(r[c.qv]), qd = num(r[c.qd]), vv = num(r[c.vv]), vd = num(r[c.vd]);
    const custo = costByRef[ref];
    if (custo === undefined) semCusto += vv - vd;
    const cmv = custo === undefined ? 0 : (qv - qd) * custo;
    const d = (dias[data] ||= { data, vendido: 0, devolvido: 0, liquido: 0, pecas_vendidas: 0, pecas_devolvidas: 0, cmv: 0, liquido_sem_custo: 0, liquido_ecommerce: 0, liquido_omni: 0 });
    d.vendido += vv; d.devolvido += vd; d.liquido += vv - vd;
    d.pecas_vendidas += qv; d.pecas_devolvidas += qd; d.cmv += cmv;
    if (custo === undefined) d.liquido_sem_custo += vv - vd;
    d[`liquido_${canal}`] += vv - vd;
  }
  const agora = new Date().toISOString();
  for (const d of Object.values(dias)) {
    const lb = d.liquido - d.cmv;
    state.faturado[d.data] = {
      data: d.data,
      vendido: r2(d.vendido), devolvido: r2(d.devolvido), liquido: r2(d.liquido),
      pecas_vendidas: d.pecas_vendidas, pecas_devolvidas: d.pecas_devolvidas, pecas_liquidas: d.pecas_vendidas - d.pecas_devolvidas,
      cmv: r2(d.cmv), lucro_bruto: r2(lb),
      margem_bruta: d.liquido ? Math.round((lb / d.liquido) * 10000) / 10000 : null,
      cobertura_custo: d.liquido ? Math.round((1 - d.liquido_sem_custo / d.liquido) * 10000) / 10000 : null,
      liquido_ecommerce: r2(d.liquido_ecommerce), liquido_omni: r2(d.liquido_omni),
      importado_em: agora,
    };
  }
  save('faturado', 'skuRef');
  const datas = Object.keys(dias).sort();
  return { linhas: linhasValidas, dias: datas.length, de: datas[0], ate: datas[datas.length - 1], skus_aprendidos: aprendidos, valor_sem_custo: r2(semCusto) };
}
