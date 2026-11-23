// Agregações que o painel consome.
import { config } from './config.js';
import { state, cmvDoItem, referenciaDoItem, atributosRef } from './store.js';
import { local, hojeLocal, dataValida } from './tempo.js';
import { amostraPacotes } from './sync.js';

const r2 = (x) => Math.round(x * 100) / 100;

export function periodo(inicio, fim) {
  const i = dataValida(inicio) ? inicio : config.inicio;
  const f = dataValida(fim) ? fim : hojeLocal();
  return [i, f];
}

function pedidosNoPeriodo(i, f) {
  const out = [];
  for (const o of Object.values(state.orders)) {
    const { data, hora } = local(o.criado);
    if (data < i || data > f) continue;
    out.push({ o, data, hora });
  }
  return out;
}

function novoBalde() {
  return { captado: 0, pecas: 0, valor_de: 0, valor_por: 0, cmv: 0, captado_custo_exato: 0, captado_sale: 0, cancelado: 0, sem_detalhe: 0, bases: new Set() };
}

function somaItens(b, itens) {
  for (const it of itens) {
    const v = it.preco * it.q;
    const { cmv, exato } = cmvDoItem(it);
    b.captado += v;
    b.pecas += it.q;
    b.valor_de += it.de * it.q;
    b.valor_por += it.por * it.q;
    b.cmv += cmv;
    if (exato) b.captado_custo_exato += v;
    if (it.sale) b.captado_sale += v;
  }
}

function fecha(b) {
  const pedidos = b.bases.size;
  const lb = b.captado - b.cmv;
  return {
    captado: r2(b.captado),
    pedidos,
    pecas: b.pecas,
    ticket_medio: pedidos ? r2(b.captado / pedidos) : null,
    preco_medio: b.pecas ? r2(b.captado / b.pecas) : null,
    valor_de: r2(b.valor_de),
    valor_por: r2(b.valor_por),
    desconto_sobre_de: b.valor_de ? Math.round((1 - b.captado / b.valor_de) * 10000) / 10000 : null,
    desconto_promocoes_sobre_por: b.valor_por ? Math.round((1 - b.captado / b.valor_por) * 10000) / 10000 : null,
    cmv: r2(b.cmv),
    lucro_bruto: r2(lb),
    margem_bruta: b.captado ? Math.round((lb / b.captado) * 10000) / 10000 : null,
    cobertura_custo_exato: b.captado ? Math.round((b.captado_custo_exato / b.captado) * 10000) / 10000 : null,
    captado_sale: r2(b.captado_sale),
    cancelado_valor: r2(b.cancelado),
    pedidos_sem_detalhe: b.sem_detalhe,
  };
}

function acumula(b, o) {
  if (o.status === 'canceled') { b.cancelado += o.total || 0; return; }
  if (!o.detalhe) {
    // Pedido ainda sem itens (chega no próximo ciclo): entra pelo total do pedido.
    b.sem_detalhe++;
    b.captado += Math.max((o.total || 0) - (o.frete || 0), 0);
    b.bases.add(o.base);
    return;
  }
  b.bases.add(o.base);
  somaItens(b, o.itens);
}

export function vendasPorHora(inicio, fim) {
  const [i, f] = periodo(inicio, fim);
  const map = new Map();
  for (const { o, data, hora } of pedidosNoPeriodo(i, f)) {
    const k = `${data}|${hora}`;
    if (!map.has(k)) map.set(k, novoBalde());
    acumula(map.get(k), o);
  }
  return [...map.entries()]
    .map(([k, b]) => { const [data, hora] = k.split('|'); return { data, hora: Number(hora), ...fecha(b) }; })
    .sort((a, b) => (a.data === b.data ? a.hora - b.hora : a.data < b.data ? -1 : 1));
}

export function vendasPorDia(inicio, fim) {
  const [i, f] = periodo(inicio, fim);
  const map = new Map();
  for (const { o, data } of pedidosNoPeriodo(i, f)) {
    if (!map.has(data)) map.set(data, novoBalde());
    acumula(map.get(data), o);
  }
  return [...map.entries()].map(([data, b]) => ({ data, ...fecha(b) })).sort((a, b) => (a.data < b.data ? -1 : 1));
}

export function resultadoPromocoes(inicio, fim) {
  const [i, f] = periodo(inicio, fim);
  const hoje = hojeLocal();
  const promos = new Map();
  const get = (nome, tipo) => {
    if (!promos.has(nome)) promos.set(nome, { tipo, b: novoBalde(), hoje: 0, primeiro: null, ultimo: null });
    return promos.get(nome);
  };
  const marca = (p, o, data) => {
    if (!p.primeiro || o.criado < p.primeiro) p.primeiro = o.criado;
    if (!p.ultimo || o.criado > p.ultimo) p.ultimo = o.criado;
  };
  for (const { o, data } of pedidosNoPeriodo(i, f)) {
    if (o.status === 'canceled' || !o.detalhe) continue;
    const nomes = Object.entries(o.promos || {});
    for (const [id, nome] of nomes) {
      if (config.promoIgnorar.test(nome)) continue;
      let itens = o.itens.filter((it) => it.promos.includes(id));
      if (!itens.length) itens = o.itens; // promoção do pedido (frete, brinde, código de vendedor)
      const p = get(nome, 'promoção');
      p.b.bases.add(o.base);
      somaItens(p.b, itens);
      if (data === hoje) p.hoje += itens.reduce((s, it) => s + it.preco * it.q, 0);
      marca(p, o, data);
    }
    if (o.cupom) {
      const p = get(`Cupom: ${o.cupom}`, 'cupom');
      p.b.bases.add(o.base);
      somaItens(p.b, o.itens);
      if (data === hoje) p.hoje += o.itens.reduce((s, it) => s + it.preco * it.q, 0);
      marca(p, o, data);
    }
  }
  return [...promos.entries()]
    .map(([promocao, p]) => {
      const x = fecha(p.b);
      return {
        promocao,
        tipo: p.tipo,
        pedidos: x.pedidos,
        pecas: x.pecas,
        captado: x.captado,
        captado_hoje: r2(p.hoje),
        ticket_medio: x.ticket_medio,
        preco_medio: x.preco_medio,
        desconto_sobre_de: x.desconto_sobre_de,
        desconto_promocoes_sobre_por: x.desconto_promocoes_sobre_por,
        desconto_concedido: r2(p.b.valor_por - p.b.captado),
        cmv: x.cmv,
        lucro_bruto: x.lucro_bruto,
        margem_bruta: x.margem_bruta,
        cobertura_custo_exato: x.cobertura_custo_exato,
        primeiro_pedido: p.primeiro,
        ultimo_pedido: p.ultimo,
      };
    })
    .sort((a, b) => b.captado - a.captado);
}

// Vendas por atributo da referência (coleção, idade do estoque, grupo BF...).
export const AGRUPAMENTOS = ['colecao', 'idade_estoque', 'grupo_bf', 'departamento', 'grupo', 'categoria', 'estamparia'];
function porReferencia(i, f) {
  const refs = new Map();
  for (const { o } of pedidosNoPeriodo(i, f)) {
    if (o.status === 'canceled' || !o.detalhe) continue;
    for (const it of o.itens) {
      const ref = referenciaDoItem(it) || null;
      const k = ref || 'Sem referência';
      if (!refs.has(k)) refs.set(k, { ref, b: novoBalde() });
      const x = refs.get(k);
      x.b.bases.add(o.base);
      somaItens(x.b, [it]);
    }
  }
  return refs;
}
export function vendasPorGrupo(inicio, fim, agrupar) {
  const [i, f] = periodo(inicio, fim);
  const campo = AGRUPAMENTOS.includes(agrupar) ? agrupar : 'colecao';
  const grupos = new Map();
  let total = 0;
  for (const [, x] of porReferencia(i, f)) {
    const a = x.ref ? atributosRef[x.ref] : null;
    const g = x.ref ? (a && a[campo]) || 'Sem cadastro no plano' : 'Sem referência';
    if (!grupos.has(g)) grupos.set(g, { b: novoBalde(), refs: 0 });
    const y = grupos.get(g);
    y.refs++;
    for (const k of ['captado', 'pecas', 'valor_de', 'valor_por', 'cmv', 'captado_custo_exato', 'captado_sale']) y.b[k] += x.b[k];
    for (const bs of x.b.bases) y.b.bases.add(bs);
    total += x.b.captado;
  }
  return [...grupos.entries()].map(([grupo, y]) => {
    const z = fecha(y.b);
    return {
      agrupamento: campo, grupo, referencias: y.refs, pedidos: z.pedidos, pecas: z.pecas, captado: z.captado,
      participacao: total ? Math.round((y.b.captado / total) * 10000) / 10000 : null,
      preco_medio: z.preco_medio, desconto_sobre_de: z.desconto_sobre_de, cmv: z.cmv, lucro_bruto: z.lucro_bruto,
      margem_bruta: z.margem_bruta, pct_sale: y.b.captado ? Math.round((y.b.captado_sale / y.b.captado) * 10000) / 10000 : null,
    };
  }).sort((a, b) => b.captado - a.captado);
}
export function topReferencias(inicio, fim, limite) {
  const [i, f] = periodo(inicio, fim);
  const n = Math.min(Math.max(Number(limite) || 50, 1), 500);
  return [...porReferencia(i, f).values()]
    .filter((x) => x.ref)
    .map((x) => {
      const a = atributosRef[x.ref] || {};
      const z = fecha(x.b);
      return {
        referencia: x.ref, produto: a.produto || null, colecao: a.colecao || null, idade_estoque: a.idade_estoque || null, grupo_bf: a.grupo_bf || null,
        pedidos: z.pedidos, pecas: z.pecas, captado: z.captado, preco_medio: z.preco_medio, desconto_sobre_de: z.desconto_sobre_de,
        margem_bruta: z.margem_bruta, pct_sale: x.b.captado ? Math.round((x.b.captado_sale / x.b.captado) * 10000) / 10000 : null,
      };
    })
    .sort((a, b) => b.captado - a.captado)
    .slice(0, n);
}

// ---------- Logística: faturamento por loja e entrega no prazo por transportadora ----------
const nomeWarehouse = () => Object.fromEntries((state.inventory?.warehouses || []).map((w) => [w.warehouse_id, w.warehouse]));
const diaLocal = (iso) => (iso ? local(iso).data : null);
// Data da nota: '2026-10-20T00:00:00' (sem horário) vale como a própria data; com horário, converte para Brasília.
const diaLocalNota = (iso) => (/T00:00:00(\.0+)?(Z|\+00:00)?$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 10) : local(iso).data);

// Entrega de um pacote: finished da VTEX, ou um evento "Entregue" da transportadora (muitos pacotes entregues
// ficam com finished = false). Data = evento Entregue (lastChange) ou deliveredDate quando finished.
const EV_ENTREGUE = /^entregue|objeto entregue|entrega realizada|delivered/i;
function entregaDe(e) {
  const ev = (Array.isArray(e.ev) ? e.ev : []).map((x) => (x.length >= 4 ? { quando: x[0], data: x[1], reg: x[2], desc: x[3] } : { quando: null, data: null, reg: x[0], desc: x[1] }));
  const x = ev.find((y) => EV_ENTREGUE.test((y.desc || '').trim()));
  if (x) return x.quando || (x.data ? x.data + 'T15:00:00Z' : null) || x.reg;
  if (e.finalizado) return e.entregue || null;
  return null;
}

function entregasNoPeriodo(i, f) {
  const out = [];
  for (const { o, data } of pedidosNoPeriodo(i, f)) {
    if (o.status === 'canceled' || !o.detalhe || !o.entregas) continue;
    for (const e of o.entregas) out.push({ o, e, data });
  }
  return out;
}

// Prazo de faturamento em dias úteis após a aprovação (a data da nota da VTEX costuma vir sem horário).
const somaDiasUteis = (data, n) => {
  const d = new Date(data + 'T12:00:00Z');
  let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) k++; }
  return d.toISOString().slice(0, 10);
};
const difDias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400e3);

export function faturamentoPorLoja(inicio, fim, dias) {
  const [i, f] = periodo(inicio, fim);
  const n = Number(dias) >= 0 && dias !== undefined && dias !== null && dias !== '' ? Math.round(Number(dias)) : 1;
  const hoje = hojeLocal();
  const nomes = nomeWarehouse();
  const g = new Map();
  for (const { o, e } of entregasNoPeriodo(i, f)) {
    if (!o.aprovado) continue;
    const ap = local(o.aprovado).data;
    const prazo = somaDiasUteis(ap, n);
    const em = e.emissao ? diaLocalNota(e.emissao) : null;
    const x = g.get(e.wh) || { entregas: 0, vencidas: 0, faturadas: 0, no_prazo: 0, pendentes: 0, pendentes_atrasadas: 0, dias: [], mais_antiga_pendente: null };
    x.entregas++;
    if (em) {
      x.faturadas++;
      x.dias.push(Math.max(difDias(ap, em), 0));
      if (em <= prazo) x.no_prazo++;
      x.vencidas++;
    } else {
      x.pendentes++;
      if (hoje > prazo) {
        x.pendentes_atrasadas++;
        x.vencidas++;
        if (!x.mais_antiga_pendente || o.aprovado < x.mais_antiga_pendente) x.mais_antiga_pendente = o.aprovado;
      }
    }
    g.set(e.wh, x);
  }
  const med = (a) => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  return [...g.entries()].map(([wh, x]) => ({
    warehouse_id: wh, loja: nomes[wh] || wh, sla_dias_uteis: n,
    entregas: x.entregas, faturadas: x.faturadas, faturadas_no_prazo: x.no_prazo,
    pct_no_prazo: x.vencidas ? Math.round((x.no_prazo / x.vencidas) * 10000) / 10000 : null,
    pct_mesmo_dia: x.faturadas ? Math.round((x.dias.filter((d) => d === 0).length / x.faturadas) * 10000) / 10000 : null,
    pendentes: x.pendentes, pendentes_atrasadas: x.pendentes_atrasadas, mais_antiga_pendente: x.mais_antiga_pendente,
    dias_mediana: med(x.dias),
    dias_media: x.dias.length ? Math.round((x.dias.reduce((s, d) => s + d, 0) / x.dias.length) * 10) / 10 : null,
  })).sort((a, b) => b.entregas - a.entregas);
}

export function entregaPorTransportadora(inicio, fim) {
  const [i, f] = periodo(inicio, fim);
  const hoje = hojeLocal();
  const g = new Map();
  for (const { e } of entregasNoPeriodo(i, f)) {
    if (!e.emissao) continue; // só o que já foi faturado e despachado
    const k = e.courier || 'Sem transportadora';
    const x = g.get(k) || { despachadas: 0, entregues: 0, no_prazo: 0, entregues_atrasadas: 0, abertas: 0, abertas_atrasadas: 0, sem_prazo: 0, retira: 0 };
    x.despachadas++;
    if (/pickup/i.test(e.canal || '')) x.retira++;
    const prom = diaLocal(e.prometido);
    if (!prom) x.sem_prazo++;
    const tEnt_ = entregaDe(e);
    if (tEnt_ || e.finalizado) {
      x.entregues++;
      const ent = diaLocal(tEnt_);
      if (prom && ent) { if (ent <= prom) x.no_prazo++; else x.entregues_atrasadas++; }
    } else {
      x.abertas++;
      if (prom && hoje > prom) x.abertas_atrasadas++;
    }
    g.set(k, x);
  }
  return [...g.entries()].map(([transportadora, x]) => {
    const base = x.no_prazo + x.entregues_atrasadas + x.abertas_atrasadas;
    return {
      transportadora, ...x,
      pct_no_prazo: base ? Math.round((x.no_prazo / base) * 10000) / 10000 : null,
    };
  }).sort((a, b) => b.despachadas - a.despachadas);
}

function classificaPedidos(inicio, fim) {
  const [i, f] = periodo(inicio, fim);
  const hoje = hojeLocal();
  const out = [];
  const vistos = new Set();
  for (const { o } of pedidosNoPeriodo(i, f)) {
    if (o.status === 'canceled' || !o.detalhe || !o.aprovado || !o.entregas?.length) continue;
    if (vistos.has(o.id)) continue;
    vistos.add(o.id);
    const es = o.entregas;
    const retira = es.every((e) => /pickup/i.test(e.canal || ''));
    const prom = es.map((e) => diaLocal(e.prometido)).filter(Boolean).sort().pop() || null;
    const entregue = es.every((e) => e.finalizado || entregaDe(e));
    const dEnt = entregue ? es.map((e) => diaLocal(entregaDe(e))).filter(Boolean).sort().pop() || null : null;
    let situacao;
    if (entregue) situacao = !dEnt || !prom ? 'entregues_sem_data' : dEnt <= prom ? 'entregues_no_prazo' : 'entregues_atrasados';
    else situacao = prom && hoje > prom ? 'abertos_atrasados' : 'abertos_no_prazo';
    const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
    out.push({ o, es, retira, prom, entregue, dEnt, situacao,
      dias_atraso: !prom ? null : situacao === 'abertos_atrasados' ? diasEntre(prom, hoje) : situacao === 'entregues_atrasados' ? diasEntre(prom, dEnt) : 0 });
  }
  return out;
}

// Pedidos do período (aprovados, não cancelados) e a entrega ao cliente.
// Entregue = isDelivered da VTEX (courierStatus.finished) em TODOS os pacotes do pedido.
// Prazo = maior shippingEstimateDate do pedido (só a data). Data da entrega = maior data de entrega dos pacotes.
export function entregaPedidos(inicio, fim) {
  const novo = () => ({ pedidos: 0, dentro_do_prazo: 0, entregues: 0, entregues_no_prazo: 0, entregues_atrasados: 0, entregues_sem_data: 0, abertos: 0, abertos_no_prazo: 0, abertos_atrasados: 0, sem_prazo: 0 });
  const g = { total: novo(), entrega: novo(), retira: novo() };
  for (const p of classificaPedidos(inicio, fim)) {
    for (const x of [g.total, p.retira ? g.retira : g.entrega]) {
      x.pedidos++;
      if (!p.prom) x.sem_prazo++;
      x[p.situacao]++;
      if (p.entregue) x.entregues++; else x.abertos++;
      if (p.situacao === 'entregues_no_prazo' || p.situacao === 'abertos_no_prazo') x.dentro_do_prazo++;
    }
  }
  return Object.entries(g).map(([tipo, x]) => ({ tipo, ...x }));
}

const NOME_SITUACAO = {
  abertos_atrasados: 'Em aberto já atrasado', abertos_no_prazo: 'Em aberto, ainda no prazo',
  entregues_atrasados: 'Entregue com atraso', entregues_no_prazo: 'Entregue no prazo', entregues_sem_data: 'Entregue sem data ou prazo',
};

// Lista de pedidos de uma situação (para exportar). situacao: abertos_atrasados (padrão), abertos, abertos_no_prazo, entregues_atrasados, todos...
export function entregaPedidosLista(inicio, fim, situacao = 'abertos_atrasados') {
  const filtro = situacao === 'todos' ? () => true
    : situacao === 'abertos' ? (p) => !p.entregue
    : (p) => p.situacao === situacao;
  const uniq = (a) => [...new Set(a.filter(Boolean))].join(' | ') || null;
  return classificaPedidos(inicio, fim).filter(filtro)
    .sort((a, b) => (b.dias_atraso || 0) - (a.dias_atraso || 0) || String(a.prom).localeCompare(String(b.prom)))
    .map((p) => ({
      pedido: p.o.id, situacao: NOME_SITUACAO[p.situacao], dias_atraso: p.dias_atraso,
      criado: diaLocal(p.o.criado), aprovado: diaLocal(p.o.aprovado), prazo_prometido: p.prom, entregue_em: p.dEnt,
      tipo: p.retira ? 'Retira em loja' : 'Entrega em casa', status_vtex: p.o.status,
      transportadora: uniq(p.es.map((e) => e.courier)), sla: uniq(p.es.map((e) => e.sla)), warehouse: uniq(p.es.map((e) => e.wh)),
      nota_fiscal: uniq(p.es.map((e) => e.nf)), emissao_nf: uniq(p.es.map((e) => diaLocal(e.emissao))),
      status_transportadora: uniq(p.es.map((e) => e.status_transp)),
      pacotes: p.es.length, pacotes_entregues: p.es.filter((e) => e.finalizado).length,
      valor: p.o.total, canal_venda: p.o.sc, origem: p.o.origin,
    }));
}

export function faturadoLiquido(inicio, fim) {
  const i = dataValida(inicio) ? inicio : '2000-01-01';
  const f = dataValida(fim) ? fim : '2999-12-31';
  return Object.values(state.faturado)
    .filter((d) => d.data >= i && d.data <= f)
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

// Pedidos captados ainda não faturados (status atual na VTEX), por status.
const FATURADO = new Set(['invoiced', 'invoice']);
export function aFaturar() {
  const grupos = new Map();
  for (const o of Object.values(state.orders)) {
    if (o.status === 'canceled' || FATURADO.has(o.status)) continue;
    const g = grupos.get(o.status) || { status: o.status, pedidos: new Set(), valor: 0, pecas: 0, mais_antigo: null };
    g.pedidos.add(o.base);
    if (o.detalhe) {
      for (const it of o.itens) { g.valor += it.preco * it.q; g.pecas += it.q; }
    } else g.valor += Math.max((o.total || 0) - (o.frete || 0), 0);
    if (!g.mais_antigo || o.criado < g.mais_antigo) g.mais_antigo = o.criado;
    grupos.set(o.status, g);
  }
  const aguardandoPagamento = new Set(['payment-pending', 'approve-payment', 'request-cancel', 'cancellation-requested']);
  return [...grupos.values()].map((g) => ({
    status: g.status,
    grupo: aguardandoPagamento.has(g.status) ? 'aguardando pagamento ou cancelamento' : 'a faturar',
    pedidos: g.pedidos.size, pecas: g.pecas, valor: r2(g.valor), mais_antigo: g.mais_antigo,
  })).sort((a, b) => b.valor - a.valor);
}

function amostraSemReferencia() {
  const vistos = new Map();
  const desde = new Date(Date.now() - 3 * 86400e3).toISOString();
  for (const o of Object.values(state.orders)) {
    if (!o.detalhe || o.criado < desde) continue;
    for (const it of o.itens) {
      if (referenciaDoItem(it) || vistos.has(it.sku)) continue;
      const c = state.catalog[it.sku] || {};
      vistos.set(it.sku, `${it.sku}|refId=${it.refId}|productRefId=${c.productRefId ?? '?'}`);
    }
  }
  return [...vistos.values()].slice(0, 8).join('; ') || null;
}

export function status() {
  const orders = Object.values(state.orders);
  return [{
    ultima_sincronizacao: state.sync.lastRun,
    ultima_varredura_completa: state.sync.lastFull,
    duracao_ultima_ms: state.sync.lastDurationMs,
    ultimo_erro: state.sync.lastError ? `${state.sync.lastError.at}: ${state.sync.lastError.message}` : null,
    pedidos_em_cache: orders.length,
    pedidos_sem_detalhe: orders.filter((o) => !o.detalhe && o.status !== 'canceled').length,
    acompanhando_desde: config.inicio,
    intervalo_minutos: config.syncEveryMin,
    estoque_atualizado_em: state.inventory?.atualizado_em || null,
    faturado_dias_importados: Object.keys(state.faturado).length,
    amostra_sem_referencia: amostraSemReferencia(),
    entregas_lidas: Object.values(state.orders).filter((o) => o.entregas).length,
    entregas_com_data_de_entrega: Object.values(state.orders).reduce((n, o) => n + (o.entregas || []).filter((e) => e.finalizado && e.entregue).length, 0),
    url_importacao: process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/importar/${config.accessSecret}` : null,
    faturado_ultima_importacao: Object.values(state.faturado).reduce((m, d) => (d.importado_em > m ? d.importado_em : m), '') || null,
    etapas_pedidos_relidos_v3: orders.filter((o) => (o.v || 1) >= 3).length,
    etapas_eventos_transporte: (() => { try { const x = eventosTransporte('2026-11-01', hojeLocal(), 25); return { pacotes_faturados: x.pacotes_faturados, pacotes_com_eventos: x.pacotes_com_eventos, eventos: x.eventos }; } catch (e) { return e.message; } })(),
    etapas_amostra_pacotes: amostraPacotes,
  }];
}

// ---------- Tempo por etapa: aprovação → nota → despacho → entrega ----------
// Horas úteis por warehouse: lojas seg–sáb 10h–21h e dom 14h–20h; CD (1_1) seg–sex 9h–16h (horário de Brasília).
const JANELAS_LOJA = { 0: [14, 20], 1: [10, 21], 2: [10, 21], 3: [10, 21], 4: [10, 21], 5: [10, 21], 6: [10, 21] };
const JANELAS_CD = { 1: [9, 16], 2: [9, 16], 3: [9, 16], 4: [9, 16], 5: [9, 16] };
const ehCD = (wh) => /^1_1$/.test(String(wh || ''));
const OFF = config.utcOffsetHours * 3600e3;

// Horas úteis entre dois instantes ISO, nas janelas do warehouse.
export function horasUteis(aIso, bIso, wh) {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso) + OFF, b = Date.parse(bIso) + OFF; // "relógio de Brasília" em ms UTC
  if (!(a >= 0) || !(b >= 0)) return null;
  if (b <= a) return 0;
  const J = ehCD(wh) ? JANELAS_CD : JANELAS_LOJA;
  let t = 0;
  const d = new Date(a); d.setUTCHours(0, 0, 0, 0);
  for (let dia = d.getTime(); dia <= b; dia += 86400e3) {
    const w = J[new Date(dia).getUTCDay()];
    if (!w) continue;
    const s = Math.max(a, dia + w[0] * 3600e3), e = Math.min(b, dia + w[1] * 3600e3);
    if (e > s) t += e - s;
  }
  return t / 3600e3;
}

// Dias úteis (seg–sex) entre as datas de Brasília de dois instantes.
function diasUteisEntre(aIso, bIso) {
  if (!aIso || !bIso) return null;
  const a = local(aIso).data, b = local(bIso).data;
  if (b <= a) return 0;
  let n = 0;
  const d = new Date(a + 'T12:00:00Z');
  const fimD = new Date(b + 'T12:00:00Z');
  while (d < fimD) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

// Eventos que ainda não são a coleta/postagem (etiqueta, nota, aguardando coleta...).
const PRE_DESPACHO = /aguardando|pr[eé][- ]?posta|etiqueta|nota fiscal|faturad|criad|cadastrad|recebemos|pedido recebido|separa|pronto para|dispon[ií]vel para coleta|solicita|gerad|emitid|informa[çc][õo]es enviadas/i;
// Despacho = primeiro evento da transportadora que já é movimentação física.
// Eventos [quando, data, registrado, descrição] (versão 3) ou [registrado, descrição] (versão 2).
// "Coletado" gravado na VTEX até 30 min depois da nota e sem horário próprio é automático da integração, não a coleta real.
const normEv = (x) => (x.length >= 4 ? { quando: x[0], data: x[1], reg: x[2], desc: x[3] } : { quando: null, data: null, reg: x[0], desc: x[1] });
export function despachoDe(e, tFat) {
  const ev = (Array.isArray(e.ev) ? e.ev : []).map(normEv).filter((x) => !PRE_DESPACHO.test(x.desc || '') && !EV_ENTREGUE.test((x.desc || '').trim()));
  const fat = tFat ? Date.parse(tFat) : null;
  const auto = (x) => !x.quando && fat != null && x.reg && Date.parse(x.reg) - fat <= 30 * 60e3;
  // Só eventos com horário próprio (lastChange com hora). O createDate é quando a integração gravou na VTEX,
  // muitas vezes horas depois e em lote, então não serve como hora do despacho.
  const reais = ev.filter((x) => x.quando && !auto(x)).map((x) => ({ ...x, t: x.quando })).sort((a, b) => a.t.localeCompare(b.t));
  if (reais.length) return { em: reais[0].t, evento: reais[0].desc || null, horario_proprio: !!reais[0].quando };
  if (ev.length) return { em: null, evento: null, so_automatico: true };
  if (e.finalizado || entregaDe(e)) return { em: null, evento: null, sem_evento: true };
  return null;
}

const semanaDe = (data) => {
  const d = new Date(data + 'T12:00:00Z');
  const w = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - w);
  return d.toISOString().slice(0, 10);
};

function pacotesEtapas(i, f) {
  const agora = new Date().toISOString();
  const out = [];
  for (const { o, data } of pedidosNoPeriodo(i, f)) {
    if (o.status === 'canceled' || !o.detalhe || !o.aprovado || !o.entregas) continue;
    for (const e of o.entregas) {
      const retira = /pickup/i.test(e.canal || '');
      const faturou = !!(e.nf || e.emissao);
      const tFat = faturou ? (e.faturado || o.faturado || o.fat_visto || null) : null;
      const d = faturou && !retira ? despachoDe(e, tFat) : null;
      const tDesp = d?.em || null;
      const tEnt = entregaDe(e);
      const r = {
        o, e, data, retira, wh: e.wh, faturou, tFat, tDesp, tEnt,
        h_fat: tFat ? horasUteis(o.aprovado, tFat, e.wh) : null,
        h_fat_aberto: !faturou ? horasUteis(o.aprovado, agora, e.wh) : null,
        h_desp: tFat && tDesp ? horasUteis(tFat, tDesp, e.wh) : null,
        h_desp_aberto: tFat && !retira && !tDesp && !tEnt ? horasUteis(tFat, agora, e.wh) : null,
        d_ent: tDesp && tEnt ? diasUteisEntre(tDesp, tEnt) : null,
        dc_ent: tDesp && tEnt ? Math.max((Date.parse(tEnt) - Date.parse(tDesp)) / 864e5, 0) : null,
        dc_ciclo: tEnt ? Math.max((Date.parse(tEnt) - Date.parse(o.aprovado)) / 864e5, 0) : null,
        d_nota_ent: tFat && tEnt && !retira ? diasUteisEntre(tFat, tEnt) : null,
        so_coleta_automatica: !!d?.so_automatico,
        em_transito: !!tDesp && !tEnt,
        sem_hora_fat: faturou && !tFat,
        sem_evento: faturou && !retira && !!d?.sem_evento,
        evento_despacho: d?.evento || null,
      };
      out.push(r);
    }
  }
  return out;
}

const estat = (a) => {
  const v = a.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q);
  if (!v.length) return { n: 0, media: null, mediana: null, p90: null };
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const r1 = (x) => Math.round(x * 10) / 10;
  return { n: v.length, media: r1(v.reduce((s, x) => s + x, 0) / v.length), mediana: r1(q(0.5)), p90: r1(q(0.9)) };
};

// agrupar: warehouse (padrão), transportadora, semana, dia ou total.
export function tempoEtapas(inicio, fim, agrupar = 'warehouse') {
  const [i, f] = periodo(inicio, fim);
  const nomes = nomeWarehouse();
  const chave = {
    warehouse: (p) => p.wh,
    transportadora: (p) => (p.retira ? 'Retira em loja' : p.e.courier || 'Sem transportadora'),
    semana: (p) => semanaDe(p.data),
    dia: (p) => p.data,
    total: () => 'total',
  }[agrupar] || ((p) => p.wh);
  const g = new Map();
  for (const p of pacotesEtapas(i, f)) {
    const k = chave(p);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  const linhas = [...g.entries()].map(([k, ps]) => {
    const fat = estat(ps.map((p) => p.h_fat));
    const desp = estat(ps.filter((p) => !p.retira).map((p) => p.h_desp));
    const ent = estat(ps.filter((p) => !p.retira).map((p) => p.d_ent));
    const entc = estat(ps.filter((p) => !p.retira).map((p) => p.dc_ent));
    const ciclo = estat(ps.filter((p) => !p.retira).map((p) => p.dc_ciclo));
    const ne = estat(ps.filter((p) => !p.retira).map((p) => p.d_nota_ent));
    const fatCasa = ps.filter((p) => !p.retira && p.tFat).length;
    const pendF = ps.filter((p) => p.h_fat_aberto != null);
    const pendD = ps.filter((p) => p.h_desp_aberto != null);
    const ate4 = ps.filter((p) => p.h_fat != null);
    return {
      grupo: k, nome: agrupar === 'warehouse' ? nomes[k] || k : k,
      pacotes: ps.length, retira: ps.filter((p) => p.retira).length,
      fat_n: fat.n, fat_media_h: fat.media, fat_mediana_h: fat.mediana, fat_p90_h: fat.p90,
      fat_pct_ate_4h: ate4.length ? Math.round((ate4.filter((p) => p.h_fat <= 4).length / ate4.length) * 10000) / 10000 : null,
      fat_pendentes: pendF.length, fat_pendentes_acima_8h: pendF.filter((p) => p.h_fat_aberto > 8).length,
      desp_n: desp.n, desp_media_h: desp.media, desp_mediana_h: desp.mediana, desp_p90_h: desp.p90,
      desp_pendentes: pendD.length, desp_pendentes_acima_8h: pendD.filter((p) => p.h_desp_aberto > 8).length,
      ent_n: ent.n, ent_media_dias_uteis: ent.media, ent_mediana_dias_uteis: ent.mediana, ent_p90_dias_uteis: ent.p90,
      ent_media_dias_corridos: entc.media, em_transito: ps.filter((p) => p.em_transito).length,
      ciclo_media_dias_corridos: ciclo.media, ciclo_mediana_dias_corridos: ciclo.mediana,
      nota_entrega_n: ne.n, nota_entrega_media_dias_uteis: ne.media, nota_entrega_mediana_dias_uteis: ne.mediana, nota_entrega_p90_dias_uteis: ne.p90,
      desp_cobertura: fatCasa ? Math.round((desp.n / fatCasa) * 10000) / 10000 : null,
      so_coleta_automatica: ps.filter((p) => p.so_coleta_automatica).length,
      sem_horario_nota: ps.filter((p) => p.sem_hora_fat).length,
      entregues_sem_evento_despacho: ps.filter((p) => p.sem_evento).length,
    };
  });
  return linhas.sort((a, b) => (agrupar === 'semana' || agrupar === 'dia' ? String(a.grupo).localeCompare(String(b.grupo)) : b.pacotes - a.pacotes));
}

// Um pacote por linha, com os horários de cada etapa (para conferir ou exportar).
// situacao: todos (padrão), aguardando_nota, aguardando_despacho, em_transito, entregues.
export function tempoEtapasPedidos(inicio, fim, situacao = 'todos') {
  const [i, f] = periodo(inicio, fim);
  const nomes = nomeWarehouse();
  const filtro = {
    aguardando_nota: (p) => !p.faturou,
    aguardando_despacho: (p) => p.h_desp_aberto != null,
    em_transito: (p) => p.em_transito,
    entregues: (p) => !!p.tEnt,
  }[situacao] || (() => true);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return pacotesEtapas(i, f).filter(filtro).map((p) => ({
    pedido: p.o.id, criado: p.data, loja: nomes[p.wh] || p.wh, warehouse_id: p.wh,
    tipo: p.retira ? 'Retira em loja' : 'Entrega em casa', transportadora: p.e.courier || null, nota_fiscal: p.e.nf || null,
    aprovado_em: p.o.aprovado, faturado_em: p.tFat, despachado_em: p.tDesp, entregue_em: p.tEnt,
    evento_despacho: p.evento_despacho,
    horas_uteis_ate_nota: r1(p.h_fat ?? p.h_fat_aberto), horas_uteis_nota_ate_despacho: r1(p.h_desp ?? p.h_desp_aberto),
    dias_uteis_despacho_ate_entrega: p.d_ent, dias_corridos_aprovacao_ate_entrega: r1(p.dc_ciclo),
    em_aberto: !p.faturou ? 'aguardando nota' : p.h_desp_aberto != null ? 'aguardando despacho' : p.em_transito ? 'em trânsito' : null,
  }));
}

// Eventos de transporte mais comuns (para conferir a regra de despacho).
export function eventosTransporte(inicio, fim, limite = 60) {
  const [i, f] = periodo(inicio, fim);
  const c = new Map();
  for (const { e } of entregasNoPeriodo(i, f)) {
    (e.ev || []).forEach((x0, idx) => {
      const x = normEv(x0);
      const k = (x.desc || '(sem descrição)').trim();
      const y = c.get(k) || { evento: k, vezes: 0, primeiro_do_pacote: 0, conta_como_despacho: !PRE_DESPACHO.test(k) };
      y.vezes++; if (idx === 0) y.primeiro_do_pacote++;
      c.set(k, y);
    });
  }
  const pac = entregasNoPeriodo(i, f).filter(({ e }) => e.nf || e.emissao);
  return {
    pacotes_faturados: pac.length,
    pacotes_com_eventos: pac.filter(({ e }) => (e.ev || []).length).length,
    pacotes_relidos_na_versao_nova: pac.filter(({ o }) => (o.v || 1) >= 3).length,
    eventos: [...c.values()].sort((a, b) => b.vezes - a.vezes).slice(0, Math.min(Number(limite) || 60, 300)),
  };
}
