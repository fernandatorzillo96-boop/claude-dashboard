// ÁGUA DE COCO · E-commerce Intelligence (v2).
// Organiza o painel em 5 áreas, modos Executivo/Gestão, filtro global de período, Visão Executiva,
// campanhas e gestão de dados. Reaproveita app.js, calculos.js, plano_bf.js e midia_painel.js sem mudar
// nenhuma regra: aqui só se lê o que os cálculos já entregam (dash.data / BF.linhas).
(function () {
  const B = window.BF;
  const F = B.F;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const raiz = $('.bf.v2');
  const n = (x) => (x == null || x === '' || !isFinite(Number(x)) ? null : Number(x));
  const soma = (rows, f) => rows.reduce((t, x) => t + (Number(x[f]) || 0), 0);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pp = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + B.nf1.format(Math.abs(v) * 100) + ' p.p.');
  const tom = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const hoje = () => B.hojeBR();
  const dc = (d) => (typeof d === 'string' && d.length >= 10 ? B.dataCurta(d) : '—');
  const mesAtual = () => hoje().slice(0, 7);
  const somaDias = (d, k) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  const fimMes = (ym) => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
  const mesAnt = () => { const [a, m] = mesAtual().split('-').map(Number); const d = new Date(Date.UTC(a, m - 2, 1)); return d.toISOString().slice(0, 7); };
  const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // ---------- áreas e sub-abas ----------
  const AREAS = {
    exec: { titulo: 'Visão Executiva', kicker: 'Central de Performance Comercial e Operacional', padrao: 'exec' },
    comercial: { titulo: 'Comercial', kicker: 'Vendas, plano, promoções, margem e coleções', padrao: 'curva' },
    estoque: { titulo: 'Estoque', kicker: 'Disponibilidade, catálogo e match ERP × VTEX', padrao: 'estoque' },
    operacoes: { titulo: 'Operações', kicker: 'Pedidos e faturamento, logística e atendimento', padrao: 'faturado' },
    marketing: { titulo: 'Marketing & Digital', kicker: 'Mídia, tráfego, conversão e site', padrao: 'midia' },
    campanhas: { titulo: 'Campanhas', kicker: 'Calendário comercial, planejamento e realizado', padrao: 'campanhas' },
    dados: { titulo: 'Gestão de dados', kicker: 'Fontes, atualizações e importações', padrao: 'dados' },
  };
  const subBtns = $$('#v2-sub [data-tab]');
  const areaDe = (aba) => (subBtns.find((b) => b.dataset.tab === aba) || {}).dataset?.areaOf || 'exec';
  const ultimaDaArea = JSON.parse(ls.get('v2_ultimas', '{}') || '{}');
  let areaAtual = null;
  function marcarArea() {
    const aba = B.aba();
    const area = areaDe(aba);
    ultimaDaArea[area] = aba; ls.set('v2_ultimas', JSON.stringify(ultimaDaArea));
    if (area === areaAtual && $('#v2-titulo').dataset.aba === aba) return;
    areaAtual = area;
    const a = AREAS[area];
    $('#v2-titulo').textContent = a.titulo; $('#v2-titulo').dataset.aba = aba;
    $('#v2-kicker').textContent = a.kicker;
    document.title = a.titulo + ' · ÁGUA DE COCO · E-commerce Intelligence';
    $$('[data-area]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.area === area || (b.dataset.area === 'mais' && (area === 'campanhas' || area === 'dados')))));
    const daArea = subBtns.filter((b) => b.dataset.areaOf === area);
    subBtns.forEach((b) => (b.hidden = b.dataset.areaOf !== area));
    $('#v2-sub').hidden = daArea.length < 2;
  }
  const irArea = (area) => {
    const alvo = ultimaDaArea[area] && areaDe(ultimaDaArea[area]) === area ? ultimaDaArea[area] : AREAS[area].padrao;
    const btn = subBtns.find((b) => b.dataset.tab === alvo);
    if (btn) btn.click();
    window.scrollTo({ top: 0 });
  };
  $$('[data-area]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.area === 'mais') return maisMenu(b);
    irArea(b.dataset.area);
  }));
  function maisMenu(btn) {
    const atual = areaDe(B.aba());
    irArea(atual === 'campanhas' ? 'dados' : 'campanhas');
  }
  new MutationObserver(marcarArea).observe($('#v2-sub'), { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });

  // menu recolhível
  if (ls.get('v2_recolhido', '0') === '1') raiz.classList.add('recolhido');
  $('#v2-collapse').addEventListener('click', () => { raiz.classList.toggle('recolhido'); ls.set('v2_recolhido', raiz.classList.contains('recolhido') ? '1' : '0'); setTimeout(B.desenhar, 50); });

  // ---------- modos ----------
  $$('.v2-modo [data-modo]').forEach((b) => b.addEventListener('click', () => {
    document.documentElement.setAttribute('data-modo', b.dataset.modo);
    ls.set('v2_modo', b.dataset.modo);
    B.desenhar();
  }));
  const modo = () => document.documentElement.getAttribute('data-modo') || 'gestao';

  // apresentação e PDF
  $('#v2-apresentar').addEventListener('click', async () => {
    const on = !raiz.classList.contains('apresentacao');
    raiz.classList.toggle('apresentacao', on);
    try { if (on && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch {}
    setTimeout(B.desenhar, 200);
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && raiz.classList.contains('apresentacao')) { raiz.classList.remove('apresentacao'); setTimeout(B.desenhar, 200); } });
  $('#v2-pdf').addEventListener('click', () => {
    const det = $('#v2-todos'); const aberto = det.open;
    window.print();
    det.open = aberto;
  });
  $('#v2-filtros-btn').addEventListener('click', (e) => { const f = $('#v2-filtros'); f.classList.toggle('aberto'); e.currentTarget.setAttribute('aria-expanded', String(f.classList.contains('aberto'))); });

  // ---------- filtro global de período ----------
  // Aplica as mesmas datas a todas as análises que têm período (promoções, vendedores, coleções, logística, atendimento, mídia).
  // A Visão Executiva, o Plano por canal, a Meta da campanha e o Faturado líquido continuam no mês vigente (como no painel atual).
  const PARAMS = [['promo_inicio', 'promo_fim'], ['col_inicio', 'col_fim'], ['log_inicio', 'log_fim'], ['at_inicio', 'at_fim'], ['md_inicio', 'md_fim']];
  const ACOMPANHA_DESDE = '2026-10-01';
  let campanhas = [];
  const opcoesPeriodo = () => {
    const h = hoje(), ma = mesAtual(), mp = mesAnt();
    const base = [
      ['hoje', 'Hoje', h, h],
      ['ontem', 'Ontem', somaDias(h, -1), somaDias(h, -1)],
      ['7d', 'Últimos 7 dias', somaDias(h, -6), h],
      ['30d', 'Últimos 30 dias', somaDias(h, -29), h],
      ['mes', 'Mês atual', ma + '-01', fimMes(ma)],
      ['mesant', 'Mês anterior', mp + '-01', fimMes(mp)],
      ['ano', 'Ano acumulado', h.slice(0, 4) + '-01-01', h],
    ];
    const camp = [];
    for (const c of campanhas) {
      camp.push(['c:' + c.id, 'Campanha · ' + c.nome, c.inicio, c.fim]);
      for (const m of c.mecanicas || []) if (m.inicio && m.fim) camp.push(['c:' + c.id + ':' + m.nome, '   ' + m.nome, m.inicio, m.fim]);
    }
    return { base, camp };
  };
  const selP = $('#v2-periodo');
  function montarPeriodo() {
    const { base, camp } = opcoesPeriodo();
    const og = (rot, arr) => { const g = document.createElement('optgroup'); g.label = rot; arr.forEach(([v, t, a, b]) => { const o = new Option(t, v); o.dataset.a = a; o.dataset.b = b; g.append(o); }); return g; };
    const outros = new Option('Período personalizado…', 'custom');
    selP.replaceChildren(og('Período', base), ...(camp.length ? [og('Campanhas', camp)] : []), outros);
    sincronizarPeriodo();
  }
  function sincronizarPeriodo() {
    const p = B && window.dash ? dash.params() : {};
    const a = p.promo_inicio, b = p.promo_fim;
    const op = [...selP.options].find((o) => o.dataset.a === a && o.dataset.b === b);
    selP.value = op ? op.value : 'custom';
    $('#v2-custom').hidden = selP.value !== 'custom';
    if (selP.value === 'custom') { $('#v2-de').value = a || ''; $('#v2-ate').value = b || ''; }
    const alinhados = PARAMS.every(([x, y]) => p[x] === a && p[y] === b);
    $('#v2-f-note').textContent = (a ? dc(a) + (b && b !== a ? ' a ' + dc(b) : '') : '') +
      (alinhados ? '' : ' · há abas com outro período') +
      (a && a < ACOMPANHA_DESDE ? ' · pedidos VTEX disponíveis a partir de 01/10/2026' : '');
  }
  const aplicarPeriodo = (a, b) => {
    if (!a || !b || b < a) return;
    const p = { promo_per: 'pers' }; PARAMS.forEach(([x, y]) => { p[x] = a; p[y] = b; });
    dash.setParams(p);
    sincronizarPeriodo();
  };
  selP.addEventListener('change', () => {
    if (selP.value === 'custom') { $('#v2-custom').hidden = false; return; }
    const o = selP.selectedOptions[0];
    aplicarPeriodo(o.dataset.a, o.dataset.b);
  });
  $('#v2-aplicar').addEventListener('click', () => aplicarPeriodo($('#v2-de').value, $('#v2-ate').value));

  // ---------- componentes da Visão Executiva ----------
  const set = (el, sel, html) => { const x = el.querySelector(sel); if (x) x.innerHTML = html; };
  const barra = (el, frac, marca) => {
    const b = el.querySelector('[data-bar]'); if (!b) return;
    b.hidden = frac == null;
    if (frac == null) return;
    b.querySelector('i').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    const m = b.querySelector('b'); m.hidden = marca == null; if (marca != null) m.style.left = 'calc(' + Math.max(0, Math.min(1, marca)) * 100 + '% - 1px)';
  };
  const dadosMes = () => {
    const ma = mesAtual(), h = hoje();
    const cd = B.linhas('curva_dia').filter((x) => x.data.slice(0, 7) === ma);
    const ate = cd.filter((x) => x.data <= h);
    const fd = B.linhas('faturado_dia').filter((x) => x.data.slice(0, 7) === ma);
    return { cd, ate, fd };
  };
  const crescimentoCaptado = (ate) => {
    const c = soma(ate, 'captado'), l = soma(ate, 'captado_2025_ate_agora');
    return l ? c / l - 1 : null;
  };
  const ultimoFechado = (fd, limite) => fd.filter((x) => (!limite || x.data <= limite) && n(x.acumulado_mes) != null).slice(-1)[0];

  function kpis() {
    const mes = B.linhas('mes_resumo')[0], mr = B.linhas('meta_resumo')[0], ao = B.linhas('ate_ontem')[0];
    const { cd, ate, fd } = dadosMes();
    // Receita captada
    const el1 = $('#k-captado');
    if (mes) {
      const metaMes = soma(cd, 'plano_captado'), superMes = soma(cd, 'super_captado');
      const metaAteAgora = soma(ate, 'meta_ate_agora');
      const g = crescimentoCaptado(ate);
      set(el1, '[data-v]', F.brl(mes.captado_mes));
      set(el1, '[data-m]', ao ? `<span class="${tom(ao.pct_meta_captado - 1)}">${F.pct(ao.pct_meta_captado)}</span> da meta até ontem (${dc(ao.ate)})` : '');
      barra(el1, metaMes ? mes.captado_mes / metaMes : null, metaMes ? metaAteAgora / metaMes : null);
      set(el1, '[data-f]', [
        metaMes ? `Meta do mês <b>${F.brl(metaMes)}</b> · ${F.pct(mes.captado_mes / metaMes)}` : '',
        superMes ? `Supermeta ${F.pct(mes.captado_mes / superMes)}` : '',
        g != null ? `<span class="${tom(g)}">${F.delta(g)}</span> vs 2025` : '',
      ].filter(Boolean).map((x) => '<span>' + x + '</span>').join(''));
    }
    // Faturamento líquido
    const el2 = $('#k-liquido');
    if (mr) {
      const u = ultimoFechado(fd, mr.ate);
      const g = u && n(u.acumulado_2025_semana) ? u.acumulado_mes / u.acumulado_2025_semana - 1 : null;
      set(el2, '[data-v]', F.brl(mr.realizado));
      set(el2, '[data-m]', `<span class="${tom(mr.pct_meta_ate_dia - 1)}">${F.pct(mr.pct_meta_ate_dia)}</span> da meta até ${dc(mr.ate)} (último 3351)`);
      barra(el2, mr.meta_mes ? mr.realizado / mr.meta_mes : null, mr.meta_mes ? mr.meta_ate_dia / mr.meta_mes : null);
      set(el2, '[data-f]', [
        `Meta do mês <b>${F.brl(mr.meta_mes)}</b> · ${F.pct(mr.pct_meta_mes)}`,
        `Supermeta ${F.pct(mr.pct_super_mes)}`,
        g != null ? `<span class="${tom(g)}">${F.delta(g)}</span> vs 2025` : '',
      ].filter(Boolean).map((x) => '<span>' + x + '</span>').join(''));
      // Atingimento
      const el3 = $('#k-meta');
      set(el3, '[data-v]', `<span class="${tom(mr.pct_meta_ate_dia - 1)}">${F.pct(mr.pct_meta_mes)}</span>`);
      set(el3, '[data-f]', `<span>da meta do mês · acumulada até ${dc(mr.ate)}: <b class="${tom(mr.pct_meta_ate_dia - 1)}">${F.pct(mr.pct_meta_ate_dia)}</b></span><span>Falta <b>${F.brl(mr.falta)}</b> · ${F.brl(mr.ritmo_necessario)}/dia em ${mr.dias_restantes ?? '—'} dia(s)</span>`);
      // Crescimento
      const gc = crescimentoCaptado(ate);
      const el4 = $('#k-cresc');
      set(el4, '[data-v]', gc != null ? `<span class="${tom(gc)}">${F.delta(gc)}</span>` : '—');
      set(el4, '[data-f]', `<span>captado no mês, até a mesma hora</span>${g != null ? `<span>Faturado líquido: <b class="${tom(g)}">${F.delta(g)}</b></span>` : ''}`);
    }
    // Projeção (site + app, faturado líquido, pela curva do dia da semana: mesma metodologia do Plano por canal)
    const pj = B.linhas('pbf_projecao').find((x) => /^site/i.test(x.canal) && x.indicador === 'Receita');
    const el5 = $('#k-proj');
    if (pj) {
      set(el5, '[data-v]', F.brl(pj.curva));
      set(el5, '[data-f]', `<span>faturado líquido site + app</span><span>vs meta <b class="${tom(pj.curva_vs_plano)}">${F.delta(pj.curva_vs_plano)}</b> (${F.brl(pj.mes_plano)})</span><span>Tendência ${F.brl(pj.tendencia)}</span>`);
    } else set(el5, '[data-f]', '<span>sem plano carregado para o mês</span>');
  }

  function metas() {
    const mr = B.linhas('meta_resumo')[0], ao = B.linhas('ate_ontem')[0];
    const box = $('#v2-metas [data-metas]');
    if (!mr) return;
    const linha = (rot, real, meta, mAte, sup, foot) => `
      <div>
        <div class="v2-meta-l"><span>${rot}</span><b>${F.brl(real)}</b></div>
        <div class="v2-prog" title="Preenchido = realizado sobre o alvo da linha · traço = onde deveria estar até a data">
          <i style="width:${Math.min(100, (real / meta) * 100)}%"></i>
          ${mAte != null ? `<s style="left:calc(${Math.min(100, (mAte / meta) * 100)}% - 1px)"></s>` : ''}
        </div>
        <div class="v2-meta-f">${foot}</div>
      </div>`;
    const html = [
      linha(`Faturamento líquido · acumulado até ${dc(mr.ate)}`, mr.realizado, mr.meta_mes, mr.meta_ate_dia, false,
        `<span>Meta acumulada <b>${F.brl(mr.meta_ate_dia)}</b> · <b class="${tom(mr.pct_meta_ate_dia - 1)}">${F.pct(mr.pct_meta_ate_dia)}</b></span>
         <span>Meta mensal <b>${F.brl(mr.meta_mes)}</b> · ${F.pct(mr.pct_meta_mes)}</span>
         <span>Falta <b>${F.brl(mr.falta)}</b> · <b>${F.brl(mr.ritmo_necessario)}</b>/dia (${mr.dias_restantes ?? '—'} dia(s))</span>`),
      linha('Faturamento líquido · supermeta', mr.realizado, mr.super_mes, mr.super_ate_dia, true,
        `<span>Supermeta <b>${F.brl(mr.super_mes)}</b> · ${F.pct(mr.pct_super_mes)}</span>
         <span>Até a data ${F.pct(mr.pct_super_ate_dia)}</span>
         <span>Falta <b>${F.brl(mr.falta_super)}</b> · <b>${F.brl(mr.ritmo_super)}</b>/dia</span>`),
    ];
    if (ao) html.push(linha(`Receita captada · ${dc(ao.de)} a ${dc(ao.ate)} (dias fechados)`, ao.captado, ao.super_captado, ao.meta_captado, true,
      `<span>Meta até ontem <b>${F.brl(ao.meta_captado)}</b> · <b class="${tom(ao.pct_meta_captado - 1)}">${F.pct(ao.pct_meta_captado)}</b></span>
       <span>Supermeta até ontem ${F.brl(ao.super_captado)} · ${F.pct(ao.pct_super_captado)}</span>`));
    box.innerHTML = html.join('');
    $('#v2-metas-src').textContent = 'meta oficial do mês · faturado líquido pelo 3351 do ERP';
    const { fd } = dadosMes();
    const el = $('#v2-ch-metas');
    const c = B.cores();
    if (fd.length && !B.falhou(el, 'faturado_dia')) {
      B.combo(el, {
        cats: fd.map((x) => x.data), label: B.dataCurta, tipTitle: (i) => dc(fd[i].data), bars: [],
        lines: [
          { name: 'Realizado', vals: fd.map((x) => (x.data <= mr.ate ? n(x.acumulado_mes) : null)), color: c.a, width: 2.5 },
          { name: 'Meta', vals: fd.map((x) => n(x.acumulado_meta_mes)), color: c.c, dash: '5 4' },
          { name: 'Supermeta', vals: fd.map((x) => n(x.acumulado_super_mes)), color: c.b, dash: '2 3' },
          { name: '2025', vals: fd.map((x) => (x.data <= mr.ate ? n(x.acumulado_2025_semana) : null)), color: c.mudo, width: 1.2 },
        ],
        fmtY: F.brl, fmtTip: F.brl0, height: 200,
      });
    }
  }

  function hojeCard() {
    const mes = B.linhas('mes_resumo')[0];
    const rd = B.linhas('resumo_dia').filter((x) => x.data === hoje())[0];
    const box = $('#v2-hoje [data-hoje]');
    if (!mes) return;
    const it = (rot, v, sub) => `<div><span>${rot}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const tk = mes.pedidos_hoje ? mes.captado_hoje / mes.pedidos_hoje : null;
    box.innerHTML = [
      it('Venda captada', F.brl(mes.captado_hoje), rd ? `<span class="${tom(rd.var_captado)}">${F.delta(rd.var_captado)}</span> vs 2025 mesma hora` : ''),
      it('Pedidos', F.int(mes.pedidos_hoje), rd ? `<span class="${tom(rd.var_pedidos)}">${F.delta(rd.var_pedidos)}</span> vs 2025` : ''),
      it('Ticket médio', F.brl0(tk), rd && rd.ticket_medio_2025 ? `2025: ${F.brl0(rd.ticket_medio_2025)}` : ''),
      it('% SALE', F.pct(mes.pct_sale_hoje), `2025: ${F.pct(mes.pct_sale_hoje_2025)}`),
      it('Margem bruta', rd ? F.pct(rd.margem_bruta) : '—', rd ? `desconto s/ DE ${F.pct(rd.desconto_sobre_de)}` : ''),
      it('Faturado líquido', F.brl(mes.faturado_liquido_dia), `3351 de ${mes.faturado_dia ? dc(mes.faturado_dia) : '—'}`),
    ].join('');
    set($('#v2-hoje'), '[data-hoje-quando]', rd ? `até ${rd.ate_hora}h · ${dc(rd.data)}` : '');
    const ch = B.linhas('curva_hora').filter((x) => x.data === hoje());
    const el = $('#v2-ch-hora'); const c = B.cores();
    if (ch.length && !B.falhou(el, 'hora')) {
      const ate = rd ? rd.ate_hora : 23;
      B.combo(el, {
        cats: ch.map((x) => x.hora), label: (h) => h + 'h', tipTitle: (i) => 'até ' + ch[i].hora + 'h59', bars: [],
        lines: [
          { name: 'Hoje', vals: ch.map((x) => (x.hora <= ate ? x.acumulado : null)), color: c.a, width: 2.5 },
          ...(ch[0].data_recorde ? [{ name: `Recorde (${dc(ch[0].data_recorde)})`, vals: ch.map((x) => x.acumulado_recorde), color: c.c, dash: '6 3' }] : []),
          { name: '2025', vals: ch.map((x) => x.acumulado_2025), color: c.mudo, dash: '5 4' },
        ],
        fmtY: F.brl, fmtTip: F.brl0, height: 190,
      });
    }
  }

  function evolucao() {
    const { cd, fd } = dadosMes();
    const el = $('#v2-ch-evol'); const c = B.cores();
    if (!cd.length || B.falhou(el, 'dia')) return;
    const liq = new Map(fd.map((x) => [x.data, n(x.liquido)]));
    B.combo(el, {
      cats: cd.map((x) => x.data), label: B.dataCurta, tipTitle: (i) => `${dc(cd[i].data)}${cd[i].acao ? ' · ' + cd[i].acao : ''}`,
      bars: [{ name: 'Captado (VTEX)', vals: cd.map((x) => (x.data <= hoje() ? n(x.captado) : null)), color: c.a }],
      lines: [
        { name: 'Faturado líquido (ERP)', vals: cd.map((x) => (liq.has(x.data) ? liq.get(x.data) : null)), color: c.b, width: 2 },
        { name: 'Meta de captado', vals: cd.map((x) => n(x.plano_captado)), color: c.c, dash: '5 4' },
        { name: '2025 (mesmo dia da semana)', vals: cd.map((x) => n(x.captado_2025)), color: c.mudo, width: 1.2 },
      ],
      fmtY: F.brl, fmtTip: F.brl0, height: modo() === 'exec' ? 300 : 260,
    });
  }

  function hbar(rot, valor, partes, foot) {
    const tot = partes.reduce((t, p) => t + (p.v || 0), 0) || 1;
    return `<div><div class="v2-hb-l"><span>${rot}</span><b>${valor}</b></div>
      <div class="v2-hb">${partes.map((p) => `<i style="width:${((p.v || 0) / tot) * 100}%;background:${p.c}" title="${esc(p.t)}"></i>`).join('')}</div>
      <div class="v2-hb-f">${foot}</div></div>`;
  }
  function mix() {
    const mes = B.linhas('mes_resumo')[0];
    const { ate } = dadosMes();
    const box = $('#v2-mix [data-mix]');
    if (!mes) return;
    const c = B.cores();
    const out = [];
    out.push(hbar('SALE × preço cheio · captado', F.pct(mes.pct_sale_mes) + ' SALE',
      [{ v: mes.pct_sale_mes, c: c.a, t: 'SALE' }, { v: 1 - mes.pct_sale_mes, c: 'var(--v2-bege)', t: 'Preço cheio' }],
      `<span><i style="background:${c.a}"></i>SALE ${F.pct(mes.pct_sale_mes)}</span><span><i style="background:var(--v2-bege)"></i>Preço cheio ${F.pct(1 - mes.pct_sale_mes)}</span><span>2025: ${F.pct(mes.pct_sale_mes_2025)} SALE</span>`));
    const lv = B.linhas('lojas_venda').filter((x) => x.data.slice(0, 7) === mesAtual() && x.tem_canal);
    const lj = soma(lv, 'lojas_venda_liquida'), st = soma(lv, 'site_venda_liquida');
    if (lj + st > 0) out.push(hbar('Canal · venda líquida (base comercial)', F.pct(st / (lj + st)) + ' site + app',
      [{ v: st, c: c.c, t: 'Site + app' }, { v: lj, c: 'var(--v2-areia-2)', t: 'Lojas físicas' }],
      `<span><i style="background:${c.c}"></i>Site + app ${F.brl(st)}</span><span><i style="background:var(--v2-areia-2)"></i>Lojas ${F.brl(lj)}</span><span>${lv.length} dia(s) importados</span>`));
    const cap = soma(ate, 'captado'), lb = soma(ate, 'lucro_bruto');
    const mb = cap ? lb / cap : null;
    const pl = ate.filter((x) => n(x.margem_plano) != null && n(x.plano_captado));
    const mbp = pl.length ? soma(pl.map((x) => ({ v: x.margem_plano * x.plano_captado })), 'v') / soma(pl, 'plano_captado') : null;
    const l25 = ate.filter((x) => n(x.margem_2025) != null && n(x.captado_2025));
    const mb25 = l25.length ? soma(l25.map((x) => ({ v: x.margem_2025 * x.captado_2025 })), 'v') / soma(l25, 'captado_2025') : null;
    if (mb != null) out.push(hbar('Margem bruta · captado (custo GEC)', F.pct(mb),
      [{ v: mb, c: c.b, t: 'Margem' }, { v: 1 - mb, c: 'var(--v2-areia-2)', t: 'CMV' }],
      `${mbp != null ? `<span>Plano ${F.pct(mbp)} · <b class="${tom(mb - mbp)}">${pp(mb - mbp)}</b></span>` : ''}${mb25 != null ? `<span>2025 ${F.pct(mb25)} · ${pp(mb - mb25)}</span>` : ''}`));
    const pc = soma(ate, 'pecas'), pc25 = soma(ate, 'pecas_2025');
    if (pc) out.push(hbar('Peças vendidas · mês', F.int(pc),
      [{ v: pc, c: c.a, t: '2026' }, { v: Math.max(0, pc25 - pc), c: 'var(--v2-areia-2)', t: '2025' }],
      `${pc25 ? `<span>2025 nos mesmos dias ${F.int(pc25)} · <b class="${tom(pc / pc25 - 1)}">${F.delta(pc / pc25 - 1)}</b></span>` : ''}<span>preço médio ${F.brl0(cap / pc)}</span>`));
    box.innerHTML = out.join('');
  }
  function colecoes() {
    const rows = B.linhas('colecao').slice().sort((a, b) => (b.captado || 0) - (a.captado || 0)).slice(0, modo() === 'exec' ? 5 : 8);
    const p = dash.params();
    set($('#v2-col'), '[data-col-per]', p.col_inicio ? `captado VTEX · ${dc(p.col_inicio)} a ${dc(p.col_fim)}` : '');
    const max = Math.max(...rows.map((r) => r.captado || 0), 1);
    const c = B.cores();
    $('#v2-col [data-col]').innerHTML = rows.length ? rows.map((r) => `<div><div class="v2-hb-l"><span>${esc(r.grupo)}</span><b>${F.brl(r.captado)}</b></div>
      <div class="v2-hb"><i style="width:${(r.captado / max) * 100}%;background:${c.a}"></i></div>
      <div class="v2-hb-f"><span>${F.pct(r.participacao)} do captado</span><span>MB ${F.pct(r.margem_bruta)}</span><span>SALE ${F.pct(r.pct_sale)}</span><span>${F.int(r.pecas)} peças</span></div></div>`).join('')
      : '<p class="bf-sub">Sem vendas no período.</p>';
  }

  // Radar: cada item com regra explícita (no título), nível, área e impacto quando há valor.
  function radarItens() {
    const it = [];
    const af = B.linhas('afaturar_resumo')[0];
    if (af) {
      const horas = af.mais_antigo ? (Date.now() - Date.parse(af.mais_antigo)) / 3600e3 : null;
      it.push({ t: 'Pedidos a faturar', v: F.brl(af.valor), d: `${F.int(af.pedidos)} pedidos · mais antigo ${F.dt(af.mais_antigo)}${horas != null ? ' (' + B.nf0.format(horas) + ' h)' : ''}`,
        nivel: horas != null && horas > 48 ? 'atencao' : 'ok', regra: 'Atenção quando o pedido mais antigo sem faturar (janela de 2 dias) passa de 48 h.', area: 'Faturamento / CD', aba: 'faturado', impacto: af.valor });
    }
    const ep = B.linhas('entrega_ped').find((x) => x.tipo === 'total');
    if (ep && ep.pedidos) {
      const pc = ep.abertos_atrasados / ep.pedidos;
      it.push({ t: 'Entregas em aberto atrasadas', v: F.int(ep.abertos_atrasados), d: `${F.pct(pc)} dos ${F.int(ep.pedidos)} pedidos com entrega em casa do período`,
        nivel: pc > 0.05 ? 'alerta' : ep.abertos_atrasados > 0 ? 'atencao' : 'ok', regra: 'Alerta acima de 5% dos pedidos; atenção se houver qualquer pedido em aberto já fora do prazo.', area: 'Logística', aba: 'logistica' });
    }
    const mr = B.linhas('meta_resumo')[0];
    if (mr) it.push({ t: 'Meta acumulada (faturado líquido)', v: F.pct(mr.pct_meta_ate_dia), d: `Falta ${F.brl(mr.falta)} para a meta do mês · ${F.brl(mr.ritmo_necessario)}/dia`,
      nivel: mr.pct_meta_ate_dia < 0.95 ? 'alerta' : mr.pct_meta_ate_dia < 1 ? 'atencao' : 'ok', regra: 'Alerta abaixo de 95% da meta acumulada; atenção entre 95% e 100%.', area: 'Comercial', aba: 'faturado', impacto: mr.falta });
    const rd = B.linhas('resumo_dia').filter((x) => x.data === hoje())[0];
    if (rd && rd.var_captado != null) it.push({ t: 'Hoje vs 2025 (mesma hora)', v: F.delta(rd.var_captado), d: `${F.brl(rd.captado)} até ${rd.ate_hora}h · 2025 ${F.brl(rd.captado_2025)}`,
      nivel: rd.var_captado < -0.1 ? 'alerta' : rd.var_captado < 0 ? 'atencao' : 'ok', regra: 'Alerta abaixo de −10% vs o mesmo dia da semana de 2025 até a mesma hora; atenção entre −10% e 0%.', area: 'Comercial / Mídia', aba: 'curva' });
    const cat = B.linhas('catalogo')[0];
    if (cat && n(cat.estoque_sem_foto_ativo) != null) it.push({ t: 'Estoque ativo sem foto', v: F.int(cat.estoque_sem_foto_ativo) + ' peças', d: `${F.int(cat.skus_sem_foto_ativos_com_estoque)} SKUs ativos com estoque e sem imagem na VTEX`,
      nivel: cat.estoque_sem_foto_ativo > 0 ? 'atencao' : 'ok', regra: 'Atenção quando há peças disponíveis em SKUs ativos sem nenhuma foto (não vendem no site).', area: 'Catálogo / E-commerce', aba: 'estoque' });
    const er = B.linhas('est_resumo').filter((x) => x.no_erp && x.na_vtex && x.skus_comparados >= 100);
    if (er.length) {
      const pm = soma(er, 'skus_iguais') / soma(er, 'skus_comparados');
      const piores = er.slice().sort((a, b) => a.pct_match - b.pct_match).slice(0, 2).map((x) => `${x.loja.replace(/^Loja /, '')} ${F.pct(x.pct_match)}`).join(' · ');
      it.push({ t: 'Match de estoque ERP × VTEX', v: F.pct(pm), d: `Menores: ${piores}`, nivel: pm < 0.8 ? 'alerta' : pm < 0.9 ? 'atencao' : 'ok',
        regra: 'SKUs iguais ÷ SKUs comparados em todas as lojas: alerta abaixo de 80%, atenção abaixo de 90%.', area: 'Estoque / Lojas', aba: 'match' });
    }
    const at = B.linhas('atend_dia');
    const ah = at.filter((x) => x.data === hoje())[0];
    if (ah) {
      const g = ah.tickets_2025 ? ah.tickets / ah.tickets_2025 - 1 : null;
      it.push({ t: 'Tickets de atendimento hoje', v: F.int(ah.tickets), d: `${F.int(ah.conversas)} conversas · 2025: ${F.int(ah.tickets_2025)} tickets${g != null ? ' (' + F.delta(g) + ')' : ''}`,
        nivel: g != null && g > 0.2 ? 'atencao' : 'ok', regra: 'Atenção quando os tickets do dia passam 20% do mesmo dia da semana de 2025.', area: 'SAC', aba: 'atendimento' });
    }
    const md = B.linhas('midia_dia');
    const inv = soma(md, 'investimento_total'), rec = soma(md, 'receita_ga4');
    if (inv > 0) it.push({ t: 'Retorno de mídia (GA4)', v: B.nf1.format(rec / inv) + '×', d: `${F.brl(rec)} de receita GA4 para ${F.brl(inv)} investidos (Google + Meta) · ${dc(dash.params().md_inicio)} a ${dc(dash.params().md_fim)}`, nivel: 'info',
      regra: 'Informativo: receita GA4 ÷ investimento total no período da mídia. Sem meta de ROAS cadastrada.', area: 'Mídia', aba: 'midia' });
    const st = B.linhas('status')[0];
    if (st) for (const [k, nome] of [['ultimo_erro', 'Sincronização VTEX'], ['google_ads_erro', 'Google Ads'], ['ga4_erro', 'GA4'], ['meta_erro', 'Meta Ads'], ['octadesk_erro', 'Octadesk']]) {
      if (st[k]) it.push({ t: 'Fonte com erro: ' + nome, v: 'Erro', d: String(st[k]).slice(0, 140), nivel: 'alerta', regra: 'Alerta sempre que a fonte devolve erro na última leitura.', area: 'Dados', aba: 'dados' });
    }
    return it;
  }
  const ORD = { alerta: 0, atencao: 1, info: 2, ok: 3 };
  const NIVEL = { alerta: 'Alerta', atencao: 'Atenção', ok: 'Ok', info: 'Info' };
  function radar() {
    let it = radarItens().sort((a, b) => ORD[a.nivel] - ORD[b.nivel]);
    const exec = modo() === 'exec';
    if (exec) it = it.filter((x) => x.nivel !== 'ok').slice(0, 6);
    $('#v2-radar [data-radar-t]').textContent = exec ? 'Riscos e oportunidades' : 'Radar operacional';
    $('#v2-radar [data-radar]').innerHTML = it.length ? it.map((x) => `
      <div class="v2-r" data-n="${x.nivel}" title="${esc(x.regra)}">
        <div class="v2-r-h"><span>${esc(x.t)}</span><span class="v2-tag">${NIVEL[x.nivel]}</span></div>
        <div class="v2-r-v">${x.v}</div>
        <div class="v2-r-d">${esc(x.d)}</div>
        <div class="v2-r-a"><span>${esc(x.area)}</span><a href="#${x.aba}" data-ir="${x.aba}">detalhar →</a></div>
      </div>`).join('') : '<p class="bf-sub">Nenhum ponto de atenção pelas regras do radar.</p>';
    return it;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ir]'); if (!a) return;
    e.preventDefault();
    const b = subBtns.find((x) => x.dataset.tab === a.dataset.ir); if (b) { b.click(); window.scrollTo({ top: 0 }); }
  });

  function insights(itens) {
    const mr = B.linhas('meta_resumo')[0], mes = B.linhas('mes_resumo')[0];
    const { ate, fd } = dadosMes();
    const li = [];
    if (mr) {
      li.push([tom(mr.pct_meta_ate_dia - 1), `Faturamento líquido em <b>${F.pct(mr.pct_meta_ate_dia)}</b> da meta acumulada até ${dc(mr.ate)} e <b>${F.pct(mr.pct_meta_mes)}</b> da meta do mês. Faltam <b>${F.brl(mr.falta)}</b>: <b>${F.brl(mr.ritmo_necessario)}/dia</b> nos ${mr.dias_restantes ?? '—'} dia(s) restantes.`]);
      li.push(['att', `Supermeta: <b>${F.pct(mr.pct_super_mes)}</b> atingida; faltam <b>${F.brl(mr.falta_super)}</b> (${F.brl(mr.ritmo_super)}/dia).`]);
    }
    const gc = crescimentoCaptado(ate);
    const u = mr ? ultimoFechado(fd, mr.ate) : null;
    const gl = u && n(u.acumulado_2025_semana) ? u.acumulado_mes / u.acumulado_2025_semana - 1 : null;
    if (gc != null) li.push([tom(gc), `Receita captada do mês <b>${F.delta(gc)}</b> vs 2025 no mesmo dia da semana${gl != null ? `; faturamento líquido <b>${F.delta(gl)}</b>` : ''}.`]);
    if (mes) {
      const cap = soma(ate, 'captado'), lb = soma(ate, 'lucro_bruto');
      const pl = ate.filter((x) => n(x.margem_plano) != null && n(x.plano_captado));
      const mbp = pl.length ? soma(pl.map((x) => ({ v: x.margem_plano * x.plano_captado })), 'v') / soma(pl, 'plano_captado') : null;
      const mb = cap ? lb / cap : null;
      const dsale = mes.pct_sale_mes - mes.pct_sale_mes_2025;
      li.push([mb != null && mbp != null && mb < mbp ? 'neg' : '', `SALE responde por <b>${F.pct(mes.pct_sale_mes)}</b> do captado (2025: ${F.pct(mes.pct_sale_mes_2025)}, ${pp(dsale)})${mb != null ? `; margem bruta do captado <b>${F.pct(mb)}</b>${mbp != null ? ` vs ${F.pct(mbp)} no plano (${pp(mb - mbp)})` : ''}` : ''}.`]);
    }
    const lv = B.linhas('lojas_venda').filter((x) => x.data.slice(0, 7) === mesAtual() && x.tem_canal);
    const lj = soma(lv, 'lojas_venda_liquida'), st = soma(lv, 'site_venda_liquida');
    if (lj + st > 0) li.push(['', `Site + app representam <b>${F.pct(st / (lj + st))}</b> da venda líquida da rede no mês (base comercial, ${lv.length} dia(s)).`]);
    const graves = itens.filter((x) => x.nivel === 'alerta' || x.nivel === 'atencao');
    const af = itens.find((x) => x.t === 'Pedidos a faturar');
    if (af) li.push([af.nivel === 'ok' ? '' : 'att', `Operação: <b>${af.v}</b> aguardando faturamento (${esc(af.d)}).`]);
    li.push([graves.length ? 'att' : 'pos', graves.length ? `Prioridade de hoje: <b>${esc(graves[0].t)}</b> (${esc(graves[0].area)}): ${esc(graves[0].v.replace(/<[^>]+>/g, ''))}.` + (graves.length > 1 ? ` Também: ${graves.slice(1, 3).map((x) => esc(x.t)).join(' · ')}.` : '') : 'Nenhum ponto de atenção pelas regras do radar.']);
    const lista = modo() === 'exec' ? li.slice(0, 6) : li;
    $('#v2-insights [data-ins]').innerHTML = lista.map(([c, t]) => `<li class="${c}"><span>${t}</span></li>`).join('');
  }

  function desenharExec() {
    try { kpis(); } catch (e) { console.error('v2 kpis', e); }
    try { metas(); } catch (e) { console.error('v2 metas', e); }
    try { hojeCard(); } catch (e) { console.error('v2 hoje', e); }
    try { evolucao(); } catch (e) { console.error('v2 evol', e); }
    try { mix(); } catch (e) { console.error('v2 mix', e); }
    try { colecoes(); } catch (e) { console.error('v2 col', e); }
    let it = [];
    try { it = radarItens(); radar(); } catch (e) { console.error('v2 radar', e); }
    try { insights(it); } catch (e) { console.error('v2 insights', e); }
  }

  // ---------- campanhas ----------
  const ehAdmin = () => window.V2_USUARIO && window.V2_USUARIO.perfil === 'admin';
  let filtroCamp = 'todas';
  const statusCamp = (c) => (c.fim < hoje() ? 'encerrada' : c.inicio > hoje() ? 'futura' : 'vigente');
  const realizadoCache = new Map();
  async function realizado(c) {
    const k = c.inicio + '|' + c.fim;
    if (realizadoCache.has(k)) return realizadoCache.get(k);
    const fim = c.fim > hoje() ? hoje() : c.fim;
    if (fim < c.inicio || fim < ACOMPANHA_DESDE) return null;
    const ini = c.inicio < ACOMPANHA_DESDE ? ACOMPANHA_DESDE : c.inicio;
    const get = (t, a) => fetch('api/' + t + '?args=' + encodeURIComponent(JSON.stringify(a)), { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : []));
    const [d, f] = await Promise.all([get('bf_vendas_por_dia', { inicio: ini, fim }), get('bf_faturado_liquido', { inicio: ini, fim })]);
    const cap = soma(d, 'captado'), lb = soma(d, 'lucro_bruto');
    const r = { parcial: ini !== c.inicio, ate: fim, captado: cap, pedidos: soma(d, 'pedidos'), pecas: soma(d, 'pecas'), margem: cap ? lb / cap : null, liquido: soma(f, 'liquido') };
    realizadoCache.set(k, r);
    return r;
  }
  async function carregarCampanhas() {
    try {
      const r = await fetch('api-campanhas', { credentials: 'same-origin', cache: 'no-store' });
      campanhas = r.ok ? await r.json() : [];
    } catch { campanhas = []; }
    montarPeriodo();
    if (B.aba() === 'campanhas') desenharCampanhas();
  }
  function desenharCampanhas() {
    $('#v2-camp-nova').hidden = !ehAdmin();
    $$('[data-camp-f]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.campF === filtroCamp)));
    const lista = campanhas.filter((c) => filtroCamp === 'todas' || statusCamp(c) === filtroCamp).sort((a, b) => b.inicio.localeCompare(a.inicio));
    const box = $('#v2-camps');
    if (!lista.length) { box.innerHTML = '<p class="bf-sub">Nenhuma campanha neste filtro.</p>'; return; }
    const kv = (rot, v) => (v == null || v === '' ? '' : `<div><span>${rot}</span><b>${v}</b></div>`);
    box.innerHTML = lista.map((c) => `
      <div class="v2-camp" data-id="${esc(c.id)}">
        <div class="v2-camp-h"><h3>${esc(c.nome)}</h3><span class="v2-tag">${statusCamp(c)}</span></div>
        <div class="v2-camp-per">${dc(c.inicio)}/${c.inicio.slice(0, 4)} a ${dc(c.fim)}/${c.fim.slice(0, 4)}${c.comp_inicio ? ` · compara com ${dc(c.comp_inicio)}/${c.comp_inicio.slice(0, 4)} a ${dc(c.comp_fim)}/${c.comp_fim.slice(0, 4)}` : ''}</div>
        <div class="v2-camp-kv">
          ${kv('Meta de captado', c.meta_captado != null ? F.brl(c.meta_captado) : '')}
          ${kv('Meta de faturamento líquido', c.meta_faturamento != null ? F.brl(c.meta_faturamento) : '')}
          ${kv('Supermeta', c.supermeta != null ? F.brl(c.supermeta) : '')}
          ${kv('Meta de peças', c.meta_pecas != null ? F.int(c.meta_pecas) : '')}
          ${kv('Margem planejada', c.margem_planejada != null ? F.pct(c.margem_planejada) : '')}
          ${kv('Investimento planejado', c.investimento != null ? F.brl(c.investimento) : '')}
          ${kv('Estoque inicial', c.estoque_inicial != null ? F.int(c.estoque_inicial) + ' peças' : '')}
        </div>
        <div class="v2-camp-kv" data-real><div><span>Realizado</span><b class="dash-skeleton">carregando</b></div></div>
        ${(c.mecanicas || []).length ? `<div class="v2-camp-mec">${c.mecanicas.map((m) => `<span>${esc(m.nome)}${m.inicio ? ` · ${dc(m.inicio)} a ${dc(m.fim)}` : ''}</span>`).join('')}</div>` : ''}
        ${(c.colecoes || []).length ? `<div class="v2-camp-mec">${c.colecoes.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${c.observacoes ? `<p class="v2-camp-obs">${esc(c.observacoes)}</p>` : ''}
        <div class="v2-camp-act">
          <button class="v2-chip" data-camp-usar="${esc(c.id)}">Analisar este período</button>
          ${ehAdmin() ? `<button class="v2-chip" data-camp-editar="${esc(c.id)}">Editar</button>` : ''}
        </div>
      </div>`).join('');
    for (const c of lista) realizado(c).then((r) => {
      const el = box.querySelector(`.v2-camp[data-id="${CSS.escape(c.id)}"] [data-real]`); if (!el) return;
      if (!r) { el.innerHTML = '<div><span>Realizado</span><b>—</b></div>'; return; }
      const fechou = statusCamp(c) === 'encerrada';
      const at = (v, m) => (m ? ` · <span class="${fechou ? tom(v / m - 1) : ''}">${F.pct(v / m)}</span>` : '');
      el.innerHTML = [
        `<div><span>Captado${r.parcial ? ' (desde 01/10/2026)' : ''} até ${dc(r.ate)}</span><b>${F.brl(r.captado)}${at(r.captado, c.meta_captado)}</b></div>`,
        `<div><span>Faturado líquido</span><b>${F.brl(r.liquido)}${at(r.liquido, c.meta_faturamento)}</b></div>`,
        `<div><span>Pedidos</span><b>${F.int(r.pedidos)}</b></div>`,
        `<div><span>Peças</span><b>${F.int(r.pecas)}${at(r.pecas, c.meta_pecas)}</b></div>`,
        `<div><span>Margem do captado</span><b>${F.pct(r.margem)}${c.margem_planejada != null && r.margem != null ? ` · ${pp(r.margem - c.margem_planejada)}` : ''}</b></div>`,
      ].join('');
    });
  }
  $$('[data-camp-f]').forEach((b) => b.addEventListener('click', () => { filtroCamp = b.dataset.campF; desenharCampanhas(); }));
  const dlg = $('#v2-camp-dlg'), form = $('#v2-camp-form');
  let editando = null;
  const num = (v) => { const t = String(v ?? '').trim().replace(/\./g, '').replace(',', '.'); return t === '' || !isFinite(Number(t)) ? null : Number(t); };
  function abrirForm(c) {
    editando = c ? c.id : null;
    $('#v2-camp-dlg-t').textContent = c ? 'Editar campanha' : 'Nova campanha';
    $('#v2-camp-msg').textContent = '';
    const f = form.elements;
    const br = (v) => (v == null ? '' : String(v).replace('.', ','));
    f.nome.value = c?.nome || ''; f.inicio.value = c?.inicio || ''; f.fim.value = c?.fim || ''; f.comp_inicio.value = c?.comp_inicio || ''; f.comp_fim.value = c?.comp_fim || '';
    f.meta_captado.value = br(c?.meta_captado); f.meta_faturamento.value = br(c?.meta_faturamento); f.supermeta.value = br(c?.supermeta); f.meta_pecas.value = br(c?.meta_pecas);
    f.margem_planejada.value = c?.margem_planejada != null ? br(Math.round(c.margem_planejada * 1000) / 10) : ''; f.investimento.value = br(c?.investimento); f.estoque_inicial.value = br(c?.estoque_inicial);
    f.mecanicas.value = (c?.mecanicas || []).map((m) => [m.nome, m.inicio || '', m.fim || ''].join('; ')).join('\n');
    f.colecoes.value = (c?.colecoes || []).join(', '); f.observacoes.value = c?.observacoes || '';
    dlg.showModal();
  }
  $('#v2-camp-nova').addEventListener('click', () => abrirForm(null));
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-camp-editar]'); if (ed) return abrirForm(campanhas.find((c) => c.id === ed.dataset.campEditar));
    const us = e.target.closest('[data-camp-usar]');
    if (us) { const c = campanhas.find((x) => x.id === us.dataset.campUsar); if (c) { aplicarPeriodo(c.inicio, c.fim); irArea('comercial'); } }
  });
  form.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const f = form.elements;
    const c = {
      id: editando || (f.nome.value.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase().replace(/^-|-$/g, '') + '-' + f.inicio.value.slice(0, 4)),
      nome: f.nome.value.trim(), inicio: f.inicio.value, fim: f.fim.value, comp_inicio: f.comp_inicio.value || null, comp_fim: f.comp_fim.value || null,
      meta_captado: num(f.meta_captado.value), meta_faturamento: num(f.meta_faturamento.value), supermeta: num(f.supermeta.value), meta_pecas: num(f.meta_pecas.value),
      margem_planejada: num(f.margem_planejada.value) != null ? num(f.margem_planejada.value) / 100 : null, investimento: num(f.investimento.value), estoque_inicial: num(f.estoque_inicial.value),
      mecanicas: f.mecanicas.value.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((x) => x[0]).map(([nome, inicio, fim]) => ({ nome, inicio: inicio || null, fim: fim || null })),
      colecoes: f.colecoes.value.split(',').map((x) => x.trim()).filter(Boolean), observacoes: f.observacoes.value.trim() || null,
    };
    if (!c.nome || !c.inicio || !c.fim || c.fim < c.inicio) { $('#v2-camp-msg').textContent = 'Preencha nome e período (o fim não pode ser antes do início).'; return; }
    const lista = campanhas.filter((x) => x.id !== c.id).concat([c]);
    try {
      const r = await fetch('api-campanhas', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lista) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
      campanhas = j.campanhas || lista; realizadoCache.clear();
      dlg.close(); montarPeriodo(); desenharCampanhas();
    } catch (err) { $('#v2-camp-msg').textContent = 'Não salvou: ' + err.message; }
  });

  // ---------- gestão de dados ----------
  function desenharDados() {
    const st = B.linhas('status')[0];
    if (!st) return;
    const fontes = [
      ['Pedidos VTEX', st.ultima_sincronizacao, st.ultimo_erro, `${F.int(st.pedidos_em_cache)} pedidos desde ${st.acompanhando_desde ? dc(st.acompanhando_desde) : '—'}`],
      ['Estoque VTEX (varredura)', st.estoque_atualizado_em, null, 'todos os warehouses'],
      ['Faturado líquido (3351 do ERP)', st.faturado_ultima_importacao, null, `${F.int(st.faturado_dias_importados)} dias importados`],
      ['Base comercial das lojas', st.lojas_importado_em, null, `${esc(st.lojas_arquivo || '')} · até ${st.lojas_ultimo_dia ? dc(st.lojas_ultimo_dia) : '—'}`],
      ['Estoque do ERP', st.estoque_erp_importado_em, null, esc(st.estoque_erp_arquivo || '')],
      ['Match ERP × VTEX', st.estoque_vtex_match_em, null, ''],
      ['Octadesk (atendimento)', st.octadesk_ultima_sincronizacao, st.octadesk_erro, `${F.int(st.octadesk_tickets)} tickets · ${F.int(st.octadesk_conversas)} conversas`],
      ['GA4', st.ga4_ultima_leitura, st.ga4_erro || st.google_ga4_erro, st.ga4_configurado ? 'configurado' : 'não configurado'],
      ['Meta Ads', st.meta_ultima_leitura, st.meta_erro, st.meta_configurado ? 'configurado' : 'não configurado'],
      ['Google Ads', st.google_ads_ultima_leitura, st.google_ads_erro, st.google_ads_conectado_em ? 'conectado em ' + F.dt(st.google_ads_conectado_em) : 'não conectado'],
    ];
    $('#v2-fontes').innerHTML = fontes.map(([nome, quando, erro, det]) => `<div class="v2-fonte${erro ? ' erro' : ''}"><span>${nome}</span><b>${quando ? F.dt(quando) : '—'}</b><small>${erro ? esc(erro) : det}</small></div>`).join('');
    const ac = $('#v2-acoes');
    $$('[data-v2-acao]', ac).forEach((x) => x.remove());
    const links = [[st.url_lojas, 'Importar base comercial das lojas'], [st.url_estoque, 'Importar estoque do ERP'], [st.url_google_ads, 'Conectar Google Ads'], [st.url_estoque_csv, 'Baixar divergências de estoque (CSV)']];
    for (const [u, t] of links) if (B.okUrl(u)) { const a = document.createElement('a'); a.className = 'bf-btn'; a.dataset.v2Acao = '1'; a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t; ac.append(a); }
    $('#v2-acoes-nota').textContent = st.url_importacao ? '' : 'As importações aparecem só para administradores.';
  }


  // ---------- Vendedores por departamento ----------
  let depSel = 'todos';
  function desenharVendedores() {
    const p = dash.params();
    $('#dep-per').textContent = p.promo_inicio ? `${dc(p.promo_inicio)} a ${dc(p.promo_fim)}` : '';
    const deps = B.linhas('deptos');
    $('#v2-deps').innerHTML = deps.map((d) => `
      <button class="v2-dep" data-dep="${esc(d.departamento)}" aria-pressed="${depSel === d.departamento}">
        <span class="v2-k-l">${esc(d.departamento)}</span>
        <b class="v2-k-v">${F.brl(d.captado)}</b>
        <span class="v2-dep-f"><span>${F.pct(d.share)} do total com código</span><span>${F.int(d.pedidos)} pedidos · TM ${F.brl0(d.ticket_medio)}</span><span>${F.int(d.vendedores)} vendedores · MB ${F.pct(d.margem_bruta)}</span>
        <span>Prateleira infinita: <b>${F.pct(d.pct_pedidos_prateleira)}</b> dos pedidos · ${F.brl(d.captado_prateleira)}</span></span>
      </button>`).join('') || '<p class="bf-sub">Sem pedidos com código de vendedor no período.</p>';
    $$('[data-dep]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dep === depSel)));
    const q = ($('#vend-busca').value || '').toLowerCase(), so = $('#vend-prat').checked, min = Number($('#vend-min').value) || 0;
    const rows = B.linhas('vendedores').filter((r) => (depSel === 'todos' || r.departamento === depSel) && (!so || r.pedidos_prateleira > 0) && r.pedidos >= min
      && (!q || (String(r.codigo) + ' ' + String(r.vendedor || '')).toLowerCase().includes(q)));
    $('#vend-n').textContent = `${rows.length} vendedor(es) · ${F.brl(soma(rows, 'captado'))} · ${F.int(soma(rows, 'pedidos'))} pedidos`;
    B.tabela($('#tb-v2-vend'), rows, { captado: 'brl0', pedidos: 'int', ticket_medio: 'brl0', margem_bruta: 'pct', pedidos_prateleira: 'int', pct_pedidos_prateleira: 'pct', captado_prateleira: 'brl0' });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('#vendedores [data-dep]'); if (!b) return; depSel = depSel === b.dataset.dep && b.dataset.dep !== 'todos' ? 'todos' : b.dataset.dep; desenharVendedores(); });
  ['#vend-busca', '#vend-prat', '#vend-min'].forEach((s) => $(s).addEventListener('input', desenharVendedores));

  // ---------- Saúde do estoque ----------
  $('#saude-grade').addEventListener('change', (e) => dash.setParams({ est_grade: e.target.value }));
  $('#saude-ord').addEventListener('change', () => desenharSaude());
  function desenharSaude() {
    const p = dash.params();
    $('#saude-grade').value = p.est_grade || 'todas';
    const rows = B.linhas('est_saude');
    const tot = rows.find((x) => x.empresa === 0);
    const lojas = rows.filter((x) => x.empresa !== 0);
    const ord = $('#saude-ord').value;
    lojas.sort((a, b) => (b[ord] ?? -1) - (a[ord] ?? -1));
    B.tabela($('#tb-saude'), tot ? [...lojas, tot] : lojas, { estoque_pecas: 'int', pecas_vendidas: 'int', giro_periodo: 'dec', cobertura_dias: 'dec', refs_com_grade: 'int', refs_grade_quebrada: 'int', pct_refs_grade_quebrada: 'pct', pct_pecas_grade_quebrada: 'pct' });
    $('#saude-src').textContent = tot ? `${tot.arquivo || 'estoque do ERP'} · importado ${F.dt(tot.importado_em)} · vendas ${dc(tot.inicio)} a ${dc(tot.fim)}` : 'importe o estoque do ERP em Gestão de dados';
    // estoque disponível VTEX × venda média diária de peças (captado VTEX, últimos 30 dias fechados)
    const cat = B.linhas('catalogo')[0];
    const h = hoje(), ini30 = somaDias(h, -30);
    const d30 = B.linhas('dia').filter((x) => x.data >= ini30 && x.data < h);
    const pd = d30.length ? soma(d30, 'pecas') / d30.length : null;
    const covV = cat && pd ? cat.estoque_disponivel / pd : null;
    const k = (rot, v, f, src) => `<article class="v2-kpi"><header><span class="v2-k-l">${rot}</span><span class="v2-src">${src}</span></header><div class="v2-k-v">${v}</div><footer class="v2-k-f">${f}</footer></article>`;
    $('#saude-kpis').innerHTML = [
      k('Cobertura das lojas', tot && tot.cobertura_dias != null ? B.nf1.format(tot.cobertura_dias) + ' dias' : '—', `<span>estoque ÷ venda média diária (Varejo)</span>`, 'ERP + base comercial'),
      k('Giro no período', tot && tot.giro_periodo != null ? B.nf1.format(tot.giro_periodo * 100) + '%' : '—', `<span>${F.int(tot?.pecas_vendidas)} peças vendidas sobre ${F.int(tot?.estoque_pecas)} em estoque</span>`, 'ERP + base comercial'),
      k('Grade quebrada', tot ? F.pct(tot.pct_refs_grade_quebrada) : '—', `<span>${F.int(tot?.refs_grade_quebrada)} de ${F.int(tot?.refs_com_grade)} referências·loja</span><span>${F.pct(tot?.pct_pecas_grade_quebrada)} das peças</span>`, 'estoque do ERP'),
      k('Cobertura VTEX (todos os canais)', covV != null ? B.nf0.format(covV) + ' dias' : '—', `<span>${F.int(cat?.estoque_disponivel)} peças disponíveis ÷ ${pd != null ? B.nf0.format(pd) : '—'} peças/dia (últimos 30 dias captados)</span>`, 'VTEX'),
    ].join('');
  }

  // ---------- Simulador de cenários ----------
  ['#cen-base', '#cen-fator', '#cen-dev'].forEach((s) => $(s).addEventListener('input', () => cenario()));
  function cenario() {
    const mr = B.linhas('meta_resumo')[0];
    const out = $('#cen-out');
    if (!mr) { out.innerHTML = ''; return; }
    const fator = Number($('#cen-fator').value) / 100, dev = (Number($('#cen-dev').value) || 0) / 100;
    $('#cen-fator-v').textContent = Math.round(fator * 100) + '%';
    const { fd } = dadosMes();
    const rest = fd.filter((x) => x.data > mr.ate);
    const fech = fd.filter((x) => x.data <= mr.ate && n(x.liquido) != null);
    const baseDia = $('#cen-base').value === 'ritmo' ? (fech.length ? mr.realizado / fech.length : 0) : null;
    const base = baseDia != null ? baseDia * rest.length : soma(rest, 'meta');
    const extra = base * fator * (1 - dev);
    const fim = mr.realizado + extra;
    const c = (v, m) => (m ? `<b class="${tom(v / m - 1)}">${F.pct(v / m)}</b>` : '—');
    out.innerHTML = `
      <div><span>Fechamento projetado</span><b class="v2-cen-big">${F.brl(fim)}</b><small>${F.brl(mr.realizado)} realizado + ${F.brl(extra)} em ${rest.length} dia(s)</small></div>
      <div><span>Meta do mês</span><b>${c(fim, mr.meta_mes)}</b><small>${fim >= mr.meta_mes ? 'sobra ' + F.brl(fim - mr.meta_mes) : 'faltariam ' + F.brl(mr.meta_mes - fim)}</small></div>
      <div><span>Supermeta</span><b>${c(fim, mr.super_mes)}</b><small>${fim >= mr.super_mes ? 'sobra ' + F.brl(fim - mr.super_mes) : 'faltariam ' + F.brl(mr.super_mes - fim)}</small></div>
      <div><span>Por dia no cenário</span><b>${rest.length ? F.brl(extra / rest.length) : '—'}</b><small>meta pede ${F.brl(mr.ritmo_necessario)}/dia · supermeta ${F.brl(mr.ritmo_super)}/dia</small></div>`;
  }

  // ---------- CAC (Marketing) e elasticidade (Margem e preço): cards da v2 dentro das abas existentes ----------
  const injeta = (pagina, id, html) => { let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; el.className = 'v2-grid v2-inj'; const pg = document.querySelector(`.bf-page[data-page="${pagina}"]`); const ref = pg.querySelector('.bf-bar'); ref ? ref.after(el) : pg.prepend(el); } el.innerHTML = html; };
  function desenharCac() {
    const md = B.linhas('midia_dia'), nv = B.linhas('ga4_novos');
    const inv = soma(md, 'investimento_total');
    const nov = nv.find((x) => x.tipo === 'new'), ret = nv.find((x) => x.tipo === 'returning');
    const p = dash.params();
    const comprasNovos = nov ? nov.atual_compras : null;
    const cac = inv && comprasNovos ? inv / comprasNovos : null;
    const rec = soma(md, 'receita_ga4');
    const k = (rot, v, f) => `<article class="v2-kpi"><header><span class="v2-k-l">${rot}</span></header><div class="v2-k-v">${v}</div><footer class="v2-k-f">${f}</footer></article>`;
    injeta('midia', 'v2-cac', `<article class="v2-card v2-span-12"><header class="v2-card-h"><h2>Eficiência de aquisição</h2><span class="v2-src">${dc(p.md_inicio)} a ${dc(p.md_fim)} · investimento Google + Meta · compras do GA4 (sem bots)</span></header>
      <div class="v2-kpis v2-kpis-4">
        ${k('CAC (novos clientes)', cac != null ? F.brl0(cac) : '—', `<span>${F.brl(inv)} ÷ ${F.int(comprasNovos)} compras de usuários novos</span>`)}
        ${k('Custo por novo usuário', nov && nov.atual_usuarios && inv ? 'R$ ' + B.nf1.format(inv / nov.atual_usuarios).replace('.', ',') : '—', `<span>${F.int(nov?.atual_usuarios)} usuários novos</span>`)}
        ${k('ROAS (GA4)', inv ? B.nf1.format(rec / inv) + '×' : '—', `<span>${F.brl(rec)} de receita GA4</span>`)}
        ${k('Compras de recorrentes', F.int(ret?.atual_compras), `<span>${F.brl(ret?.atual_receita)} · novos: ${F.brl(nov?.atual_receita)}</span>`)}
      </div>
      <p class="bf-sub">CAC = investimento em mídia paga ÷ compras feitas por usuários novos no GA4. É uma aproximação: o GA4 marca como "novo" o usuário (navegador), não o CPF, e a mídia também influencia compras de recorrentes.</p></article>`);
  }
  function regressao(xs, ys) {
    const n0 = xs.length; if (n0 < 5) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n0, my = ys.reduce((a, b) => a + b, 0) / n0;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n0; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    if (!sxx || !syy) return null;
    return { b: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), n: n0 };
  }
  function desenharElasticidade() {
    const h = hoje();
    const cd = B.linhas('curva_dia').filter((x) => x.data < h && n(x.pecas) > 0 && n(x.preco_medio) > 0);
    const viz = cd.filter((x) => n(x.pecas_2025) > 0 && n(x.preco_medio_2025) > 0);
    const e1 = regressao(viz.map((x) => Math.log(x.preco_medio / x.preco_medio_2025)), viz.map((x) => Math.log(x.pecas / x.pecas_2025)));
    const e2 = regressao(cd.map((x) => Math.log(x.preco_medio)), cd.map((x) => Math.log(x.pecas)));
    const fmtE = (e) => (e ? B.nf1.format(e.b).replace('-', '−') : '—');
    const ler = (e) => (!e ? 'dados insuficientes' : e.r2 < 0.2 ? 'relação fraca: o preço explica pouco do volume' : e.b < -1 ? 'elástica: 1% de queda no preço médio veio com mais de 1% de peças' : e.b < 0 ? 'inelástica: o volume reage menos que o preço' : 'sem relação negativa clara (outros fatores dominam)');
    const k = (rot, e, f) => `<article class="v2-kpi"><header><span class="v2-k-l">${rot}</span></header><div class="v2-k-v">${fmtE(e)}</div><footer class="v2-k-f"><span>${ler(e)}</span><span>${e ? `R² ${B.nf1.format(e.r2 * 100)}% · ${e.n} dias` : ''}</span>${f}</footer></article>`;
    injeta('margem', 'v2-elast', `<article class="v2-card v2-span-12"><header class="v2-card-h"><h2>Elasticidade-preço aparente</h2><span class="v2-src">captado VTEX por dia, dias fechados desde 01/10/2026</span></header>
      <div class="v2-kpis v2-kpis-2">
        ${k('Contra 2025 (mesmo dia da semana)', e1, '<span>variação de peças × variação de preço médio vs 2025</span>')}
        ${k('Entre os dias de 2026', e2, '<span>peças × preço médio de cada dia</span>')}
      </div>
      <p class="bf-sub">Inclinação de log(peças) sobre log(preço médio). É uma leitura descritiva: promoções, mídia, frete e calendário mudam junto com o preço, então não é o efeito causal do preço. Quanto mais negativo, mais o volume acompanha as quedas de preço.</p></article>`);
  }

  // Com <base href="/painel/">, '#aba' viraria /painel/#aba (o painel anterior): mantém o endereço da v2.
  dash.setLink = (nome) => history.replaceState(null, '', location.pathname + location.search + '#' + nome);
  if (location.pathname.indexOf('/v2') < 0) history.replaceState(null, '', '/painel/v2/' + location.hash);
  try { history.scrollRestoration = 'manual'; } catch {}
  window.addEventListener('load', () => window.scrollTo(0, 0));
  setTimeout(() => window.scrollTo(0, 0), 0);

  window.BF_ABAS = Object.assign(window.BF_ABAS || {}, {
    exec: () => { desenharExec(); try { cenario(); } catch (e) { console.error('v2 cenario', e); } },
    vendedores: desenharVendedores,
    saude: desenharSaude,
    midia: ((orig) => () => { if (orig) orig(); try { desenharCac(); } catch (e) { console.error('v2 cac', e); } })((window.BF_ABAS || {}).midia),
    margem: ((orig) => () => { if (orig) orig(); try { desenharElasticidade(); } catch (e) { console.error('v2 elast', e); } })((window.BF_ABAS || {}).margem),
    campanhas: desenharCampanhas,
    dados: desenharDados,
  });
  dash.onData(() => { marcarArea(); sincronizarPeriodo(); });
  document.addEventListener('v2-usuario', () => { if (B.aba() === 'campanhas') desenharCampanhas(); });
  montarPeriodo();
  // primeira abertura da v2: começa no mês vigente
  if (ls.get('v2_periodo_ini', '') !== mesAtual()) { ls.set('v2_periodo_ini', mesAtual()); aplicarPeriodo(mesAtual() + '-01', fimMes(mesAtual())); }
  carregarCampanhas();
  marcarArea();
  B.desenhar();
})();
