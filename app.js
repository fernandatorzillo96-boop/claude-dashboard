// Desenho do painel: abas, números, gráficos e tabelas (o mesmo do painel no Claude).
const root = document.querySelector('.bf');

// ---------- formatos (pt-BR) ----------
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vazio = (v) => v == null || v === '' || (typeof v === 'number' && !isFinite(v));
const F = {
  brl: (v) => {
    if (vazio(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + nf2.format(v / 1e6) + ' mi';
    if (a >= 1e4) return 'R$ ' + nf1.format(v / 1e3) + ' mil';
    return 'R$ ' + nf0.format(v);
  },
  brl0: (v) => (vazio(v) ? '—' : 'R$ ' + nf0.format(v)),
  brlc: (v) => (vazio(v) ? '—' : 'R$ ' + nf2.format(v)),
  int: (v) => (vazio(v) ? '—' : nf0.format(v)),
  txt: (v) => (vazio(v) ? '—' : String(v)),
  dec: (v) => (vazio(v) ? '—' : nf1.format(v)),
  pct: (v) => (vazio(v) ? '—' : nf1.format(v * 100) + '%'),
  pct0: (v) => (vazio(v) ? '—' : nf0.format(v * 100) + '%'),
  delta: (v) => (vazio(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v) * 100) + '%'),
  data: (v) => (vazio(v) ? '—' : v.slice(8, 10) + '/' + v.slice(5, 7)),
  dt: (v) => {
    if (vazio(v)) return '—';
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  },
  hm: (v) => {
    if (vazio(v)) return '—';
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  },
};
const tomDelta = (el, v) => {
  el.classList.remove('bom', 'ruim');
  if (!vazio(v) && v !== 0) el.classList.add(v > 0 ? 'bom' : 'ruim');
};
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dataCurta = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const linhas = (id) => {
  const d = dash.data(id);
  return d.status === 'ok' && Array.isArray(d.data) ? d.data : [];
};
// no site os links são caminhos do próprio servidor (/painel/...)
const okUrl = (u) => typeof u === 'string' && (/^https:\/\//.test(u) || /^\/painel\//.test(u));

// ---------- abas ----------
let aba = 'curva';
const tabs = [...root.querySelectorAll('[data-tab]')];
const mostrar = (nome, link = true) => {
  aba = nome;
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === nome)));
  root.querySelectorAll('.bf-page').forEach((p) => (p.hidden = p.dataset.page !== nome));
  if (link) dash.setLink(nome);
  desenhar();
};
tabs.forEach((t) => t.addEventListener('click', () => mostrar(t.dataset.tab)));

// ---------- dia escolhido na curva ----------
let diaSel = null;
const selDia = document.getElementById('sel-dia');
selDia.addEventListener('change', () => { diaSel = selDia.value; desenhar(); });

// ---------- período das promoções ----------
const selPromo = document.getElementById('sel-promo');
const ontem = () => { const d = new Date(Date.now() - 27 * 3600e3); return d.toISOString().slice(0, 10); };
const presets = [
  ['Novembro (01–30/11)', '2026-11-01', '2026-11-30'],
  ['Hoje', null, null, 'hoje'],
  ['Ontem', null, null, 'ontem'],
  ['Esquenta Compre 3 Pague 2 (01–06/11)', '2026-11-01', '2026-11-06'],
  ['Esquenta Beach Friday (07–15/11)', '2026-11-07', '2026-11-15'],
  ['Toda SALE +20% (16–24/11)', '2026-11-16', '2026-11-24'],
  ['Black Friday (25–30/11)', '2026-11-25', '2026-11-30'],
];
// só o mês corrente nas curvas
const doMes = (rows) => { const m = hojeBR().slice(0, 7); return rows.filter((x) => x.data.slice(0, 7) === m); };
const periodoDe = (p) => (p[3] === 'hoje' ? [hojeBR(), hojeBR()] : p[3] === 'ontem' ? [ontem(), ontem()] : [p[1], p[2]]);
selPromo.replaceChildren(...presets.map((p, i) => new Option(p[0], String(i))));
selPromo.addEventListener('change', () => {
  const [a, b] = periodoDe(presets[Number(selPromo.value)]);
  dash.setParams({ promo_inicio: a, promo_fim: b });
});
const syncPromoSel = () => {
  const { promo_inicio: a, promo_fim: b } = dash.params();
  const i = presets.findIndex((p) => { const [x, y] = periodoDe(p); return x === a && y === b; });
  if (i >= 0) selPromo.value = String(i);
};
// mesmos períodos para coleções e logística
const ligaPeriodo = (sel, pIni, pFim) => {
  sel.replaceChildren(...presets.map((p, i) => new Option(p[0], String(i))));
  sel.addEventListener('change', () => {
    const [a, b] = periodoDe(presets[Number(sel.value)]);
    dash.setParams({ [pIni]: a, [pFim]: b });
  });
  return () => {
    const pr = dash.params();
    const i = presets.findIndex((p) => { const [x, y] = periodoDe(p); return x === pr[pIni] && y === pr[pFim]; });
    if (i >= 0) sel.value = String(i);
  };
};
const syncCol = ligaPeriodo(document.getElementById('sel-col'), 'col_inicio', 'col_fim');
const syncLog = ligaPeriodo(document.getElementById('sel-log'), 'log_inicio', 'log_fim');
const syncAt = ligaPeriodo(document.getElementById('sel-at'), 'at_inicio', 'at_fim');
const selSla = document.getElementById('sel-sla');
selSla.addEventListener('change', () => dash.setParams({ sla_dias: Number(selSla.value) }));

let busca = '';
document.getElementById('busca-promo').addEventListener('input', (e) => { busca = e.target.value.toLowerCase(); desenharPromos(); });

// ---------- números marcados ----------
const preencher = (el, v, fmt) => {
  el.classList.remove('dash-skeleton');
  el.textContent = F[fmt || el.dataset.fmt || 'brl'](v);
};
const fillStatic = (scope) => {
  scope.querySelectorAll('[data-source][data-field]:not(th):not(select)').forEach((el) => {
    if (el.dataset.k) return; // preenchidos pelo dia escolhido
    const id = el.dataset.source;
    const d = dash.data(id);
    if (d.status !== 'ok') {
      if (d.status === 'error' || d.status === 'connect') { el.classList.remove('dash-skeleton'); el.textContent = '—'; }
      return;
    }
    const rows = Array.isArray(d.data) ? d.data : [];
    let row = null;
    if (el.dataset.row != null) row = rows[Number(el.dataset.row)];
    else if (el.dataset.where) {
      const [k, v] = el.dataset.where.split('=');
      row = rows.find((r) => String(r[k]) === decodeURIComponent(v));
    }
    const v = row ? row[el.dataset.field] : null;
    if (el.id === 'st-sync') { el.classList.remove('dash-skeleton'); el.textContent = F.hm(v); return; }
    preencher(el, v);
    if (el.dataset.fmt === 'delta') tomDelta(el, v);
  });
};

// ---------- gráfico combinado (barras + linhas) ----------
const tipBox = (el) => {
  let t = el.querySelector('.bf-tip');
  if (!t) { t = document.createElement('div'); t.className = 'bf-tip'; t.hidden = true; el.appendChild(t); }
  return t;
};
function combo(el, o) {
  const W = el.clientWidth;
  const H = o.height || 260;
  el.querySelectorAll('svg').forEach((s) => s.remove());
  if (!W || !o.cats.length) return;
  const svg = d3.select(el).insert('svg', ':first-child').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const vals = [...o.bars.flatMap((b) => b.vals), ...o.lines.flatMap((l) => l.vals)].filter((v) => !vazio(v));
  const hi = d3.max(vals) ?? 1;
  const lo = o.zero === false ? d3.min(vals) ?? 0 : Math.min(0, d3.min(vals) ?? 0);
  const y = d3.scaleLinear([lo, hi === lo ? lo + 1 : hi], [H - 28, 12]).nice(4);
  const ticks = y.ticks(4);
  const meas = svg.append('g').attr('class', 'bf-ax');
  let mw = 0;
  ticks.forEach((t) => { const n = meas.append('text').text(o.fmtY(t)).node(); mw = Math.max(mw, n.getComputedTextLength()); });
  meas.remove();
  const ml = Math.ceil(mw) + 10, mr = 10;
  const x = d3.scaleBand(o.cats.map((_, i) => i), [ml, W - mr]).paddingInner(0.22).paddingOuter(0.1);
  const g = svg.append('g').attr('class', 'bf-ax');
  ticks.forEach((t) => {
    g.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)');
    g.append('text').attr('x', ml - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.fmtY(t));
  });
  // rótulos do eixo x sem sobreposição
  const labs = o.cats.map(o.label);
  const tmp = g.append('text').text(labs.reduce((a, b) => (String(b).length > String(a).length ? b : a), '')).node();
  const lw = tmp.getComputedTextLength() + 10; tmp.remove();
  const step = Math.max(1, Math.ceil(lw / x.step()));
  labs.forEach((l, i) => {
    if (i % step) return;
    g.append('text').attr('x', x(i) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(l);
  });
  // barras
  const nb = o.bars.length;
  const bw = Math.min(32, x.bandwidth() / Math.max(nb, 1));
  o.bars.forEach((b, j) => {
    svg.append('g').selectAll('rect').data(b.vals.map((v, i) => [i, v]).filter(([, v]) => !vazio(v))).join('rect')
      .attr('x', ([i]) => x(i) + (x.bandwidth() - bw * nb) / 2 + j * bw).attr('width', Math.max(1, bw - (nb > 1 ? 1 : 0)))
      .attr('y', ([, v]) => Math.min(y(v), y(0))).attr('height', ([, v]) => Math.max(0.5, Math.abs(y(0) - y(v))))
      .attr('rx', Math.min(4, bw / 2)).attr('fill', b.color).attr('opacity', b.opacity ?? 1);
  });
  // linhas
  o.lines.forEach((l) => {
    const line = d3.line().defined((d) => !vazio(d[1])).x((d) => x(d[0]) + x.bandwidth() / 2).y((d) => y(d[1]));
    svg.append('path').datum(l.vals.map((v, i) => [i, v])).attr('d', line).attr('fill', 'none')
      .attr('stroke', l.color).attr('stroke-width', l.width || 2).attr('stroke-linecap', l.dash ? 'butt' : 'round')
      .attr('stroke-linejoin', 'round').attr('stroke-dasharray', l.dash || null);
  });
  // legenda
  const leg = el.querySelector('.bf-leg') || el.appendChild(Object.assign(document.createElement('div'), { className: 'bf-leg' }));
  leg.replaceChildren(...[...o.bars, ...o.lines].map((s) => {
    const it = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = s.color;
    if (s.dash) { sw.className = 'tr'; sw.style.borderTopColor = s.color; }
    it.append(sw, document.createTextNode(s.name));
    return it;
  }));
  // tooltip
  const tip = tipBox(el);
  const hov = svg.append('line').attr('stroke', 'var(--cds-chart-reference)').attr('y1', 12).attr('y2', H - 28).attr('opacity', 0);
  svg.append('g').selectAll('rect').data(o.cats.map((_, i) => i)).join('rect')
    .attr('x', (i) => x(i) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 20)
    .attr('fill', 'transparent')
    .on('mouseenter touchstart', (ev, i) => {
      const cx = x(i) + x.bandwidth() / 2;
      hov.attr('x1', cx).attr('x2', cx).attr('opacity', 1);
      tip.replaceChildren();
      const h = document.createElement('div'); h.className = 'bf-tip-h'; h.textContent = o.tipTitle ? o.tipTitle(i) : labs[i]; tip.append(h);
      [...o.bars, ...o.lines].forEach((s) => {
        const r = document.createElement('div');
        const sw = document.createElement('i'); sw.style.background = s.color;
        const v = s.vals[i];
        r.append(sw, document.createTextNode(`${s.name}: ${(s.fmt || o.fmtTip)(v)}`));
        tip.append(r);
      });
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(W - tw, cx + 12 - (cx > W / 2 ? tw + 24 : 0))) + 'px';
      tip.style.top = '8px';
    })
    .on('mouseleave', () => { tip.hidden = true; hov.attr('opacity', 0); });
}
const cores = () => ({ a: dash.colors[0], b: dash.colors[1], c: dash.colors[2], d: dash.colors[3], mudo: 'var(--cds-chart-muted)' });
const falhou = (el, id) => {
  const s = dash.data(id).status;
  if (s === 'error' || s === 'connect' || s === 'declined') {
    el.querySelectorAll('svg,.bf-leg').forEach((x) => x.remove());
    if (!el.querySelector('.bf-fail')) {
      const f = document.createElement('div'); f.className = 'bf-fail';
      const dot = document.createElement('span'); dot.className = 'dot';
      f.append(dot, document.createTextNode(s === 'error' ? 'Falha ao carregar' : 'Conecte o conector Dashboard Vendas'));
      el.appendChild(f);
    }
    return true;
  }
  el.querySelectorAll('.bf-fail').forEach((x) => x.remove());
  return false;
};

// ---------- tabelas ----------
const ordem = {};
function tabela(tb, rows, fmts, tom = {}) {
  const ths = [...tb.querySelectorAll('th')];
  const key = tb.dataset.rowKey;
  const o = ordem[tb.id];
  let rs = [...rows];
  if (o) {
    rs.sort((a, b) => {
      const x = a[o.f], y = b[o.f];
      const c = typeof x === 'number' || typeof y === 'number' ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR');
      return o.desc ? -c : c;
    });
  }
  ths.forEach((th) => th.setAttribute('aria-sort', o && o.f === th.dataset.field ? (o.desc ? 'descending' : 'ascending') : 'none'));
  const body = tb.tBodies[0];
  body.replaceChildren(...rs.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r[key];
    ths.forEach((th) => {
      const f = th.dataset.field;
      const td = document.createElement('td');
      if (th.classList.contains('n')) td.className = 'n';
      td.textContent = fmts[f] ? F[fmts[f]](r[f]) : r[f] ?? '—';
      if (tom[f]) tomDelta(td, tom[f](r));
      tr.append(td);
    });
    return tr;
  }));
}
root.querySelectorAll('.bf-table').forEach((tb) => {
  tb.querySelectorAll('th').forEach((th) => {
    th.tabIndex = 0;
    const go = () => {
      const o = ordem[tb.id];
      ordem[tb.id] = { f: th.dataset.field, desc: o && o.f === th.dataset.field ? !o.desc : th.classList.contains('n') };
      desenhar();
    };
    th.addEventListener('click', go);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
});

// ---------- frase de cima ----------
const take = root.querySelector('[data-take]');
const marca = (txt, src, field, where, fmt, delta) => {
  const s = document.createElement('b');
  s.dataset.source = src; s.dataset.field = field;
  if (where) s.dataset.where = where; else s.dataset.row = '0';
  s.textContent = txt;
  if (delta) tomDelta(s, delta);
  return s;
};
function desenharFrase() {
  const rd = linhas('resumo_dia'), bf = linhas('bf_resumo').find((r) => r.periodo === 'bf');
  const hoje = rd[rd.length - 1];
  const parts = [];
  if (bf && bf.dias_fechados > 0) {
    parts.push('Black Friday em novembro, até agora: ', marca(F.brl(bf.captado), 'bf_resumo', 'captado', 'periodo=bf'), ' captado, ',
      marca(F.pct(bf.atingimento), 'bf_resumo', 'atingimento', 'periodo=bf', null, bf.atingimento - 1), ' da meta de captado e ',
      marca(F.delta(bf.var_vs_2025), 'bf_resumo', 'var_vs_2025', 'periodo=bf', null, bf.var_vs_2025), ' vs 2025. ');
  }
  if (hoje) {
    parts.push(`Hoje (${dataCurta(hoje.data)}) até as `, marca(String(hoje.ate_hora), 'resumo_dia', 'ate_hora', 'data=' + hoje.data), 'h: ',
      marca(F.brl(hoje.captado), 'resumo_dia', 'captado', 'data=' + hoje.data), ', ',
      marca(F.delta(hoje.var_captado), 'resumo_dia', 'var_captado', 'data=' + hoje.data, null, hoje.var_captado), ' vs o mesmo horário de 2025.');
  }
  take.replaceChildren(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
}

// ---------- abas: desenho ----------
function desenharCurva() {
  const rd = linhas('resumo_dia');
  const datas = rd.map((r) => r.data).reverse();
  if (!diaSel || !datas.includes(diaSel)) diaSel = datas[0] || null;
  if (selDia.options.length !== datas.length || selDia.options[0]?.value !== datas[0]) {
    selDia.replaceChildren(...datas.map((d, i) => new Option((i === 0 ? 'Hoje, ' : '') + dataCurta(d) + ' (' + ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00Z').getUTCDay()] + ')', d)));
  }
  selDia.value = diaSel || '';
  const r = rd.find((x) => x.data === diaSel);
  root.querySelectorAll('#curva [data-k], #curva .k-ate').forEach((el) => {
    if (!r) return;
    el.dataset.where = 'data=' + r.data;
    const f = el.dataset.k || 'ate_hora';
    if (f === 'ate_hora') { el.textContent = String(r.ate_hora); return; }
    preencher(el, r[f]);
    if (el.dataset.fmt === 'delta') tomDelta(el, r[f]);
  });
  const c = cores();
  const elH = document.getElementById('ch-hora');
  if (!falhou(elH, 'hora')) {
    const ch = linhas('curva_hora').filter((x) => x.data === diaSel);
    const ate = r ? r.ate_hora : 23;
    combo(elH, {
      cats: ch.map((x) => x.hora), label: (h) => h + 'h', tipTitle: (i) => `${dataCurta(diaSel)} · até ${ch[i].hora}h59`,
      bars: [],
      lines: [
        { name: '2026', vals: ch.map((x) => (x.hora <= ate ? x.acumulado : null)), color: c.a, width: 2.5 },
        { name: '2025 (mesmo dia da semana)', vals: ch.map((x) => x.acumulado_2025), color: c.mudo, dash: '5 4' },
      ],
      fmtY: F.brl, fmtTip: F.brl0,
    });
  }
  const elD = document.getElementById('ch-dias');
  if (!falhou(elD, 'dia')) {
    const cd = doMes(linhas('curva_dia'));
    combo(elD, {
      cats: cd.map((x) => x.data), label: dataCurta, tipTitle: (i) => `${dataCurta(cd[i].data)} · ${cd[i].acao}`,
      bars: [{ name: 'Captado 2026', vals: cd.map((x) => x.captado), color: c.a }],
      lines: [
        { name: '2025', vals: cd.map((x) => x.captado_2025), color: c.mudo, width: 1.5 },
        { name: 'Meta captado', vals: cd.map((x) => x.plano_captado), color: c.b, dash: '5 4' },
        { name: 'Super meta captado', vals: cd.map((x) => x.super_captado), color: c.c, dash: '2 3' },
      ],
      fmtY: F.brl, fmtTip: F.brl0, height: 280,
    });
  }
}

function desenharPlano() {
  const c = cores();
  const el = document.getElementById('ch-acum');
  if (!falhou(el, 'dia')) {
    const cd = doMes(linhas('curva_dia'));
    let a = 0, b = 0, l = 0, s = 0;
    const real = [], meta = [], ly = [], sup = [];
    cd.forEach((x) => {
      a += x.captado || 0; b += x.plano_captado || 0; l += x.captado_2025 || 0; s += x.super_captado || 0;
      real.push(x.captado == null ? null : a); meta.push(b); ly.push(l); sup.push(s);
    });
    combo(el, {
      cats: cd.map((x) => x.data), label: dataCurta, tipTitle: (i) => `Até ${dataCurta(cd[i].data)} · ${cd[i].acao}`,
      bars: [],
      lines: [
        { name: 'Realizado 2026', vals: real, color: c.a, width: 2.5 },
        { name: 'Meta captado', vals: meta, color: c.b, dash: '5 4' },
        { name: 'Super meta', vals: sup, color: c.c, dash: '2 3' },
        { name: '2025', vals: ly, color: c.mudo, width: 1.5 },
      ],
      fmtY: F.brl, fmtTip: F.brl, height: 280,
    });
  }
  const tb = document.getElementById('tb-etapas');
  tabela(tb, linhas('etapas'), {
    inicio: 'data', fim: 'data', captado: 'brl', plano_ate_ontem: 'brl', atingimento: 'pct', atingimento_super: 'pct', var_vs_2025: 'delta', margem_bruta: 'pct', plano_total: 'brl',
  }, { atingimento: (r) => (r.atingimento == null ? null : r.atingimento - 1), atingimento_super: (r) => (r.atingimento_super == null ? null : r.atingimento_super - 1), var_vs_2025: (r) => r.var_vs_2025 });
}

function desenharPromos() {
  syncPromoSel();
  const q = busca;
  tabela(document.getElementById('tb-promos'), linhas('promos').filter((r) => !q || String(r.promocao).toLowerCase().includes(q)), {
    captado_hoje: 'brl0', captado: 'brl0', pedidos: 'int', pecas: 'int', ticket_medio: 'brl0', desconto_sobre_de: 'pct', desconto_concedido: 'brl0', lucro_bruto: 'brl0', margem_bruta: 'pct',
  });
  tabela(document.getElementById('tb-promos25'), linhas('promos25').filter((r) => !q || String(r.promo).toLowerCase().includes(q)), {
    inicio: 'data', fim: 'data', captado: 'brl0', pedidos: 'int', pecas: 'int', ticket_medio: 'brl0', desconto_medio_sobre_de: 'pct',
  });
}

function desenharMargem() {
  const c = cores();
  const cd = doMes(linhas('curva_dia'));
  const base = { cats: cd.map((x) => x.data), label: dataCurta, tipTitle: (i) => `${dataCurta(cd[i].data)} · ${cd[i].acao}`, bars: [], height: 220 };
  const pctY = (v) => nf0.format(v * 100) + '%';
  const graf = [
    ['ch-mb', [
      { name: '2026', vals: cd.map((x) => x.margem_bruta), color: c.a, width: 2.5 },
      { name: 'Plano', vals: cd.map((x) => x.margem_plano), color: c.b, dash: '5 4' },
      { name: '2025', vals: cd.map((x) => x.margem_2025), color: c.mudo, width: 1.5 },
    ], pctY, F.pct],
    ['ch-desc', [
      { name: 'Sobre o DE', vals: cd.map((x) => x.desconto_sobre_de), color: c.a, width: 2.5 },
      { name: 'Promoções (s/ POR)', vals: cd.map((x) => x.desconto_promocoes), color: c.c },
      { name: 'Promoções 2025', vals: cd.map((x) => x.desconto_promocoes_2025), color: c.mudo, width: 1.5 },
    ], pctY, F.pct],
    ['ch-tm', [
      { name: '2026', vals: cd.map((x) => x.ticket_medio), color: c.a, width: 2.5 },
      { name: '2025', vals: cd.map((x) => x.ticket_medio_2025), color: c.mudo, width: 1.5 },
    ], F.brl0, F.brl0],
    ['ch-pm', [
      { name: '2026', vals: cd.map((x) => x.preco_medio), color: c.a, width: 2.5 },
      { name: '2025', vals: cd.map((x) => x.preco_medio_2025), color: c.mudo, width: 1.5 },
    ], F.brl0, F.brl0],
  ];
  graf.forEach(([id, lines, fy, ft]) => {
    const el = document.getElementById(id);
    if (!falhou(el, 'dia')) combo(el, { ...base, lines, fmtY: fy, fmtTip: ft, zero: false });
  });
}

function desenharColecoes() {
  syncCol();
  const f = { captado: 'brl0', participacao: 'pct', pecas: 'int', preco_medio: 'brl0', desconto_sobre_de: 'pct', margem_bruta: 'pct', pct_sale: 'pct' };
  tabela(document.getElementById('tb-colecao'), linhas('colecao'), f);
  tabela(document.getElementById('tb-idade'), linhas('idade'), f);
  tabela(document.getElementById('tb-toprefs'), linhas('toprefs'), { captado: 'brl0', pecas: 'int', preco_medio: 'brl0', desconto_sobre_de: 'pct', margem_bruta: 'pct' });
}

function desenharLogistica() {
  syncLog();
  selSla.value = String(dash.params().sla_dias ?? 1);
  tabela(document.getElementById('tb-lojas'), linhas('lojas'), {
    pct_no_prazo: 'pct', pct_mesmo_dia: 'pct', entregas: 'int', faturadas: 'int', faturadas_no_prazo: 'int', pendentes: 'int', pendentes_atrasadas: 'int', dias_mediana: 'int', mais_antiga_pendente: 'dt',
  });
  tabela(document.getElementById('tb-transp'), linhas('transp_agrupada'), {
    pct_no_prazo: 'pct', variacoes: 'int', despachadas: 'int', entregues: 'int', no_prazo: 'int', entregues_atrasadas: 'int', abertas: 'int', abertas_atrasadas: 'int',
  });
}

function desenharAtendimento() {
  syncAt();
  const c = cores();
  const el = document.getElementById('ch-atend');
  if (!falhou(el, 'atend_dia')) {
    const d = linhas('atend_dia');
    const ult = d.filter((x) => Number(x.total) > 0).map((x) => x.data).pop() || '';
    combo(el, {
      cats: d.map((x) => x.data), label: dataCurta,
      tipTitle: (i) => `${dataCurta(d[i].data)} · 2025: ${dataCurta(d[i].data_2025)}`,
      bars: [{ name: 'Chamados 2026', vals: d.map((x) => (x.data <= ult ? Number(x.total) : null)), color: c.a }],
      lines: [{ name: '2025 (mesmo dia da semana)', vals: d.map((x) => Number(x.total_2025)), color: c.mudo, width: 1.5 }],
      fmtY: F.int, fmtTip: F.int, height: 280,
    });
  }
  const f = { quantidade: 'int', participacao: 'pct', quantidade_2025: 'int', variacao: 'delta' };
  // mais chamados é pior: inverte a cor da variação
  const tom = { variacao: (r) => (r.variacao == null ? null : -r.variacao) };
  tabela(document.getElementById('tb-motivos'), linhas('atend_motivos'), f, tom);
  tabela(document.getElementById('tb-canais'), linhas('atend_canais'), f, tom);
  const ft = { tickets: 'int', resolvidos: 'int', em_aberto: 'int', tempo_medio_h: 'dec', tempo_mediano_h: 'dec', pct_resolvido_24h: 'pct', interacoes_atendente_media: 'dec', tempo_medio_h_2025: 'dec' };
  tabela(document.getElementById('tb-tempo-at'), linhas('atend_tempo_at'), ft);
  tabela(document.getElementById('tb-tempo-mot'), linhas('atend_tempo_mot'), ft);
}

function desenharEstoque() {
  const cat = linhas('catalogo')[0];
  document.getElementById('nota-varredura').hidden = !(cat && cat.varredura_em_andamento && cat.estoque_disponivel == null);
  tabela(document.getElementById('tb-wh'), linhas('warehouses'), { disponivel: 'int', disponivel_ativo: 'int', pct_disponivel_ativo: 'pct', disponivel_sem_foto: 'int', pct_sem_foto: 'pct', reservado: 'int', total: 'int', skus_com_estoque: 'int' });
}

function desenharFaturado() {
  const c = cores();
  const fd = linhas('faturado_dia');
  const ultimoMes = fd.length ? fd[fd.length - 1].data.slice(0, 7) : '';
  const el = document.getElementById('ch-fat');
  if (!falhou(el, 'faturado')) {
    combo(el, {
      cats: fd.map((x) => x.data), label: dataCurta,
      bars: [{ name: 'Faturado líquido', vals: fd.map((x) => x.liquido), color: c.a }],
      lines: [
        { name: 'Meta (Quadros)', vals: fd.map((x) => x.meta), color: c.b, width: 2 },
        { name: 'Super meta', vals: fd.map((x) => x.super_meta), color: c.c, dash: '2 3' },
      ],
      fmtY: F.brl, fmtTip: F.brl0, height: 260,
    });
  }
  const el2 = document.getElementById('ch-fat-acum');
  if (!falhou(el2, 'faturado')) {
    const m = fd.filter((x) => x.data.slice(0, 7) === ultimoMes);
    combo(el2, {
      cats: m.map((x) => x.data), label: dataCurta,
      bars: [],
      lines: [
        { name: 'Faturado líquido acumulado', vals: m.map((x) => x.acumulado_mes), color: c.a, width: 2.5 },
        { name: 'Meta acumulada', vals: m.map((x) => x.acumulado_meta_mes), color: c.b, width: 2 },
        { name: 'Super meta acumulada', vals: m.map((x) => x.acumulado_super_mes), color: c.c, dash: '2 3' },
      ],
      fmtY: F.brl, fmtTip: F.brl, height: 240,
    });
  }
  tabela(document.getElementById('tb-fat'), fd.filter((x) => x.liquido != null).reverse(), {
    data: 'data', vendido: 'brl0', devolvido: 'brl0', liquido: 'brl0', meta: 'brl0', var_vs_meta: 'delta', super_meta: 'brl0', var_vs_super: 'delta', margem_bruta: 'pct', liquido_ecommerce: 'brl0', liquido_omni: 'brl0',
  }, { var_vs_meta: (r) => r.var_vs_meta, var_vs_super: (r) => r.var_vs_super });
}

// ---------- match de estoque ----------
const selEstLoja = document.getElementById('sel-est-loja');
const selEstTipo = document.getElementById('sel-est-tipo');
selEstLoja.addEventListener('change', () => dash.setParams({ est_loja: selEstLoja.value === '' ? null : Number(selEstLoja.value) }));
selEstTipo.addEventListener('change', () => dash.setParams({ est_tipo: selEstTipo.value || null }));
document.getElementById('tb-est-lojas').addEventListener('click', (ev) => {
  if (ev.target.closest('th')) return;
  const tr = ev.target.closest('tr[data-key]');
  if (tr) dash.setParams({ est_loja: Number(tr.dataset.key) });
});
function desenharMatch() {
  const res = linhas('est_resumo');
  const pr = dash.params();
  const opts = [['', 'Todas as lojas'], ...res.map((r) => [String(r.empresa), r.loja])];
  if (selEstLoja.options.length !== opts.length) selEstLoja.replaceChildren(...opts.map(([v, t]) => new Option(t, v)));
  selEstLoja.value = pr.est_loja == null ? '' : String(pr.est_loja);
  selEstTipo.value = pr.est_tipo || '';
  const st = linhas('status')[0] || {};
  const bi = document.getElementById('btn-est-importar'), be = document.getElementById('btn-est-exportar');
  bi.hidden = !okUrl(st.url_estoque); if (!bi.hidden) bi.href = st.url_estoque;
  be.hidden = !okUrl(st.url_estoque_csv);
  if (!be.hidden) {
    const q = new URLSearchParams();
    if (pr.est_loja != null) q.set('loja', String(pr.est_loja));
    if (pr.est_tipo) q.set('tipo', pr.est_tipo);
    be.href = st.url_estoque_csv + (q.toString() ? '?' + q : '');
  }
  tabela(document.getElementById('tb-est-lojas'), res, {
    pct_match: 'pct', skus_comparados: 'int', skus_divergentes: 'int', qtd_diferente: 'int', so_erp: 'int', so_vtex: 'int', sem_cadastro_vtex: 'int', pecas_erp: 'int', pecas_vtex: 'int', diferenca_pecas: 'int',
  });
  tabela(document.getElementById('tb-est-div'), linhas('est_div'), { estoque_erp: 'int', estoque_vtex: 'int', diferenca: 'int' });
}

const btnImportar = document.getElementById('btn-importar');
function desenharBotao() {
  const st = linhas('status')[0];
  const url = st && okUrl(st.url_importacao) ? st.url_importacao : null;
  btnImportar.hidden = !url;
  if (url) btnImportar.href = url;
}

function desenhar() {
  desenharBotao();
  const pg = root.querySelector(`.bf-page[data-page="${aba}"]`);
  fillStatic(root.querySelector('.bf-head'));
  fillStatic(pg);
  desenharFrase();
  if (aba === 'curva') desenharCurva();
  if (aba === 'plano') desenharPlano();
  if (aba === 'promos') desenharPromos();
  if (aba === 'margem') desenharMargem();
  if (aba === 'estoque') desenharEstoque();
  if (aba === 'colecoes') desenharColecoes();
  if (aba === 'logistica') desenharLogistica();
  if (aba === 'atendimento') desenharAtendimento();
  if (aba === 'faturado') desenharFaturado();
  if (aba === 'match') desenharMatch();
  const extra = (window.BF_ABAS || {})[aba];
  if (extra) extra();
}
// usado pelas abas que ficam em arquivos próprios (plano_bf.js, midia_painel.js)
window.BF = { F, nf0, nf1, vazio, tomDelta, preencher, fillStatic, combo, tabela, cores, falhou, linhas, dataCurta, hojeBR, presets, periodoDe, okUrl, desenhar: () => desenhar(), aba: () => aba, ordem };

dash.onData(desenhar);
let larg = window.innerWidth;
window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - larg) > 30) { larg = window.innerWidth; desenhar(); } });
const inicial = location.hash.slice(1);
mostrar(tabs.some((t) => t.dataset.tab === inicial) ? inicial : 'curva', false);
