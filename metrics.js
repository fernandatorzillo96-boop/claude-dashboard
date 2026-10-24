// Agregações que o painel consome.
import { config } from './config.js';
import { state, cmvDoItem } from './store.js';
import { local, hojeLocal, dataValida } from './tempo.js';

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

export function faturadoLiquido(inicio, fim) {
  const i = dataValida(inicio) ? inicio : '2000-01-01';
  const f = dataValida(fim) ? fim : '2999-12-31';
  return Object.values(state.faturado)
    .filter((d) => d.data >= i && d.data <= f)
    .sort((a, b) => (a.data < b.data ? -1 : 1));
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
    faturado_ultima_importacao: Object.values(state.faturado).reduce((m, d) => (d.importado_em > m ? d.importado_em : m), '') || null,
  }];
}
