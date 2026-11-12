// Cálculos que cruzam VTEX, plano, metas e 2025 (os mesmos do painel no Claude).
// No site, o dash.js já entrega as respostas do servidor como linhas: não há loaders.

dash.calc('atend_resumo', {
  title: 'Atendimento: hoje e acumulado',
  inputs: ['atend_dia'],
  fn: (atend_dia) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const s = (a, f) => a.reduce((t, x) => t + (Number(x[f]) || 0), 0);
    const comDado = atend_dia.filter((x) => Number(x.total) > 0);
    const ult = comDado.length ? comDado[comDado.length - 1].data : null;
    const ate = atend_dia.filter((x) => ult && x.data <= ult);
    const h = atend_dia.find((x) => x.data === ult) || {};
    return [{
      dia: ult, total_dia: Number(h.total) || 0, total_dia_2025: Number(h.total_2025) || 0,
      var_dia: Number(h.total_2025) ? p(Number(h.total) / Number(h.total_2025) - 1) : null,
      tickets_dia: Number(h.tickets) || 0, conversas_dia: Number(h.conversas) || 0,
      total_periodo: s(ate, 'total'), total_periodo_2025: s(ate, 'total_2025'),
      var_periodo: s(ate, 'total_2025') ? p(s(ate, 'total') / s(ate, 'total_2025') - 1) : null,
      tickets_periodo: s(ate, 'tickets'), tickets_periodo_2025: s(ate, 'tickets_2025'),
      conversas_periodo: s(ate, 'conversas'), conversas_periodo_2025: s(ate, 'conversas_2025'),
      pct_bot: s(ate, 'conversas') ? p(s(ate, 'conversas_bot') / s(ate, 'conversas')) : null,
    }];
  },
});

dash.calc('transp_agrupada', {
  title: 'Transportadoras agrupadas',
  inputs: ['transp'],
  fn: (transp) => {
    const nome = (x) => {
      const t = String(x.transportadora || '');
      if (Number(x.retira) > 0 || /shopping|retira|retirada|park|flamboyant/i.test(t)) return 'Retira em loja';
      if (/total\s*express/i.test(t)) return 'Total Express';
      if (/correio|sedex|\bpac\b/i.test(t)) return 'Correios';
      if (/eu entrego/i.test(t)) return 'Eu Entrego';
      if (/bestmile/i.test(t)) return 'Bestmile';
      if (/tpl/i.test(t)) return 'TPL Next Day';
      return t || 'Sem transportadora';
    };
    const campos = ['despachadas', 'entregues', 'no_prazo', 'entregues_atrasadas', 'abertas', 'abertas_atrasadas'];
    const g = new Map();
    for (const x of transp) {
      const k = nome(x);
      const y = g.get(k) || Object.fromEntries([['transportadora', k], ['variacoes', 0], ...campos.map((c) => [c, 0])]);
      y.variacoes++;
      for (const c of campos) y[c] += Number(x[c]) || 0;
      g.set(k, y);
    }
    return [...g.values()].map((y) => {
      const base = y.no_prazo + y.entregues_atrasadas + y.abertas_atrasadas;
      return { ...y, pct_no_prazo: base ? Math.round((y.no_prazo / base) * 10000) / 10000 : null };
    }).sort((a, b) => b.despachadas - a.despachadas);
  },
});

dash.calc('log_resumo', {
  title: 'Logística: totais',
  inputs: ['lojas', 'transp_agrupada'],
  fn: (lojas, transp_agrupada) => {
    const transp = transp_agrupada.filter((x) => x.transportadora !== 'Retira em loja');
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const s = (a, f) => a.reduce((t, x) => t + (Number(x[f]) || 0), 0);
    const vencidas = s(lojas, 'faturadas_no_prazo') + s(lojas, 'pendentes_atrasadas') + lojas.reduce((t, x) => t + Math.max((Number(x.faturadas) || 0) - (Number(x.faturadas_no_prazo) || 0), 0), 0);
    const base = s(transp, 'no_prazo') + s(transp, 'entregues_atrasadas') + s(transp, 'abertas_atrasadas');
    return [{
      entregas: s(lojas, 'entregas'), faturadas_no_prazo: s(lojas, 'faturadas_no_prazo'),
      pct_faturado_no_prazo: vencidas ? p(s(lojas, 'faturadas_no_prazo') / vencidas) : null,
      pendentes: s(lojas, 'pendentes'), pendentes_atrasadas: s(lojas, 'pendentes_atrasadas'),
      despachadas: s(transp, 'despachadas'), entregues: s(transp, 'entregues'),
      pct_entregue_no_prazo: base ? p(s(transp, 'no_prazo') / base) : null,
      abertas_atrasadas: s(transp, 'abertas_atrasadas'), entregues_atrasadas: s(transp, 'entregues_atrasadas'),
    }];
  },
});

dash.calc('afaturar_resumo', {
  title: 'A faturar agora',
  inputs: ['afaturar'],
  fn: (afaturar) => {
    const r = (x) => Math.round(x * 100) / 100;
    const af = afaturar.filter((x) => x.grupo === 'a faturar');
    const ag = afaturar.filter((x) => x.grupo !== 'a faturar');
    return [{
      valor: r(af.reduce((s, x) => s + (Number(x.valor) || 0), 0)),
      pedidos: af.reduce((s, x) => s + (Number(x.pedidos) || 0), 0),
      pecas: af.reduce((s, x) => s + (Number(x.pecas) || 0), 0),
      mais_antigo: af.map((x) => x.mais_antigo).filter(Boolean).sort()[0] || null,
      aguardando_pagamento: r(ag.reduce((s, x) => s + (Number(x.valor) || 0), 0)),
    }];
  },
});

dash.calc('curva_hora', {
  title: 'Curva por hora × 2025',
  inputs: ['hora', 'base25'],
  fn: (hora, base25) => {
    const n = (x) => Number(x) || 0;
    const r = (x) => Math.round(x * 100) / 100;
    const ly = new Map(base25.map((x) => [x.data26 + '|' + n(x.hora), x]));
    const real = new Map(hora.map((x) => [x.data + '|' + n(x.hora), x]));
    const dias = [...new Set(hora.map((x) => x.data))].sort();
    const out = [];
    for (const d of dias) {
      let a = 0, b = 0;
      for (let h = 0; h < 24; h++) {
        const x = real.get(d + '|' + h), y = ly.get(d + '|' + h);
        a += x ? n(x.captado) : 0;
        b += y ? n(y.captado) : 0;
        out.push({ data: d, hora: h, captado: x ? n(x.captado) : 0, captado_2025: y ? n(y.captado) : 0, acumulado: r(a), acumulado_2025: r(b) });
      }
    }
    return out;
  },
});

dash.calc('resumo_dia', {
  title: 'Dia × 2025 até a mesma hora',
  inputs: ['hora', 'base25'],
  fn: (hora, base25) => {
    const n = (x) => Number(x) || 0;
    const r = (x) => Math.round(x * 100) / 100;
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const sum = (rows, f) => rows.reduce((s, x) => s + n(x[f]), 0);
    const dias = [...new Set(hora.map((x) => x.data))].sort();
    return dias.map((d) => {
      const h = hora.filter((x) => x.data === d);
      const ate = Math.max(...h.map((x) => n(x.hora)));
      const l = base25.filter((x) => x.data26 === d && n(x.hora) <= ate);
      const cap = sum(h, 'captado'), ped = sum(h, 'pedidos'), pec = sum(h, 'pecas'), cmv = sum(h, 'cmv'), de = sum(h, 'valor_de');
      const cap25 = sum(l, 'captado'), ped25 = sum(l, 'pedidos');
      return {
        data: d, ate_hora: ate,
        captado: r(cap), captado_2025: r(cap25), var_captado: cap25 ? p(cap / cap25 - 1) : null,
        pedidos: ped, pedidos_2025: ped25, var_pedidos: ped25 ? p(ped / ped25 - 1) : null,
        ticket_medio: ped ? r(cap / ped) : null, ticket_medio_2025: ped25 ? r(cap25 / ped25) : null,
        pecas: pec, margem_bruta: cap ? p((cap - cmv) / cap) : null, desconto_sobre_de: de ? p(1 - cap / de) : null,
      };
    });
  },
});

dash.calc('curva_dia', {
  title: 'Dia × 2025 × plano',
  inputs: ['dia', 'plano', 'meta', 'resumo_dia'],
  fn: (dia, plano, meta, resumo_dia) => {
    const n = (x) => (x == null || x === '' ? null : Number(x));
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const real = new Map(dia.map((x) => [x.data, x]));
    // hoje (último dia com venda): meta e 2025 só até a mesma hora, pela curva horária de 2025
    const hojeD = dia.map((x) => x.data).sort().pop() || '';
    const rh = resumo_dia.find((x) => x.data === hojeD);
    const pl = new Map(plano.map((x) => [x.data, x]));
    const mc = new Map(meta.filter((x) => x.meta_captado != null).map((x) => [x.data, Number(x.meta_captado)]));
    const sc = new Map(meta.filter((x) => x.super_captado != null).map((x) => [x.data, Number(x.super_captado)]));
    const datas = [...new Set([...real.keys(), ...pl.keys()])].sort();
    return datas.map((d) => {
      const a = real.get(d) || {}, b = pl.get(d) || {};
      const cap = n(a.captado), cap25 = n(b.captado_2025), meta = mc.has(d) ? mc.get(d) : n(b.plano_captado_estimado);
      const rl = n(b.plano_receita_liquida), cm = n(b.plano_cmv), rl25 = n(b.receita_liquida_2025), cm25 = n(b.cmv_2025);
      const ped25 = n(b.pedidos_2025), pec25 = n(b.pecas_captado_2025), de25 = n(b.valor_de_2025);
      return {
        data: d, acao: b.acao || 'Sem plano',
        captado: cap, captado_2025: cap25, plano_captado: meta,
        fracao_dia: d === hojeD && rh && cap25 ? Math.min(1, n(rh.captado_2025) / cap25) : 1,
        captado_2025_ate_agora: d === hojeD && rh ? n(rh.captado_2025) : cap25,
        meta_ate_agora: d === hojeD && rh && cap25 && meta != null ? r(meta * Math.min(1, n(rh.captado_2025) / cap25)) : meta,
        super_captado: sc.has(d) ? sc.get(d) : null,
        super_ate_agora: !sc.has(d) ? null : d === hojeD && rh && cap25 ? r(sc.get(d) * Math.min(1, n(rh.captado_2025) / cap25)) : sc.get(d),
        var_vs_2025: cap != null && cap25 ? p(cap / cap25 - 1) : null,
        var_vs_plano: cap != null && meta ? p(cap / meta - 1) : null,
        pedidos: n(a.pedidos), pedidos_2025: ped25, pecas: n(a.pecas), pecas_2025: pec25,
        ticket_medio: n(a.ticket_medio), ticket_medio_2025: cap25 && ped25 ? r(cap25 / ped25) : null,
        preco_medio: n(a.preco_medio), preco_medio_2025: cap25 && pec25 ? r(cap25 / pec25) : null,
        desconto_sobre_de: n(a.desconto_sobre_de), desconto_promocoes: n(a.desconto_promocoes_sobre_por),
        desconto_promocoes_2025: cap25 && de25 ? p(1 - cap25 / de25) : null,
        cmv: n(a.cmv), lucro_bruto: n(a.lucro_bruto), margem_bruta: n(a.margem_bruta),
        margem_plano: rl ? p(1 - cm / rl) : null, margem_2025: rl25 ? p(1 - cm25 / rl25) : null,
        cobertura_custo: n(a.cobertura_custo_exato), plano_receita_liquida: rl, plano_cmv: cm,
      };
    });
  },
});

dash.calc('etapas', {
  title: 'Resultado por etapa',
  inputs: ['curva_dia'],
  fn: (curva_dia) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const comVenda = curva_dia.filter((x) => x.captado != null).map((x) => x.data).sort();
    const hoje = comVenda[comVenda.length - 1] || '';
    const mes = hoje.slice(0, 7);
    const grupos = new Map();
    for (const x of curva_dia) {
      if (x.acao === 'Sem plano' || x.data.slice(0, 7) !== mes) continue;
      if (!grupos.has(x.acao)) grupos.set(x.acao, []);
      grupos.get(x.acao).push(x);
    }
    const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    return [...grupos].map(([acao, xs]) => {
      const fech = xs.filter((x) => x.data <= hoje && x.captado != null);
      const cap = sum(fech, 'captado'), meta = sum(fech, 'meta_ate_agora'), ly = sum(fech, 'captado_2025_ate_agora'), lb = sum(fech, 'lucro_bruto'), sup = sum(fech, 'super_ate_agora');
      return {
        etapa: acao, inicio: xs[0].data, fim: xs[xs.length - 1].data, dias: xs.length, dias_fechados: fech.length,
        captado: r(cap), plano_ate_ontem: r(meta), plano_total: r(sum(xs, 'plano_captado')),
        atingimento: meta ? p(cap / meta) : null, var_vs_2025: ly ? p(cap / ly - 1) : null, margem_bruta: cap ? p(lb / cap) : null,
        super_ate_agora: r(sup), atingimento_super: sup ? p(cap / sup) : null, super_total: r(sum(xs, 'super_captado')),
        situacao: !fech.length ? 'Ainda não começou' : cap >= meta ? 'Acima da meta' : 'Abaixo da meta',
      };
    });
  },
});

dash.calc('bf_resumo', {
  title: 'BF e mês: realizado × plano',
  inputs: ['curva_dia'],
  fn: (curva_dia) => {
    const etapasBF = ['Esquenta Compre e Ganhe', 'Esquenta Beach Friday', 'Toda SALE Até 60% + 20%', 'Black Friday'];
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const comVenda = curva_dia.filter((x) => x.captado != null).map((x) => x.data).sort();
    const hoje = comVenda[comVenda.length - 1] || '';
    const linha = (periodo, todos) => {
      const f = todos.filter((x) => x.data <= hoje && x.captado != null);
      const cap = sum(f, 'captado'), meta = sum(f, 'meta_ate_agora'), ly = sum(f, 'captado_2025_ate_agora'), sup = sum(f, 'super_ate_agora');
      const lb = sum(f, 'lucro_bruto'), cmv = sum(f, 'cmv'), rl = sum(f, 'plano_receita_liquida'), cm = sum(f, 'plano_cmv');
      const exato = f.reduce((s, x) => s + (Number(x.captado) || 0) * (Number(x.cobertura_custo) || 0), 0);
      return {
        periodo, dias_fechados: f.length, ate: f.length ? f[f.length - 1].data : null,
        captado: r(cap), plano: r(meta), plano_total: r(sum(todos, 'plano_captado')),
        super_ate_agora: r(sup), super_total: r(sum(todos, 'super_captado')), atingimento_super: sup ? p(cap / sup) : null,
        atingimento: meta ? p(cap / meta) : null, captado_2025: r(ly), var_vs_2025: ly ? p(cap / ly - 1) : null,
        lucro_bruto: r(lb), cmv: r(cmv), margem_bruta: cap ? p(lb / cap) : null, margem_plano: rl ? p(1 - cm / rl) : null,
        cobertura_custo: cap ? p(exato / cap) : null,
      };
    };
    const mes = hoje.slice(0, 7);
    return [
      linha('bf', curva_dia.filter((x) => etapasBF.includes(x.acao) && x.data.slice(0, 7) === mes)),
      linha('mes', curva_dia.filter((x) => x.data.slice(0, 7) === mes)),
    ];
  },
});

dash.calc('faturado_dia', {
  title: 'Faturado líquido × plano',
  description: 'Faturado líquido do 3351 por dia do mês corrente contra a meta, a super meta e 2025 (3351 de novembro/2025): mesmo dia da semana (364 dias antes) e mesmo dia do mês.',
  inputs: ['faturado', 'plano', 'meta', 'dia', 'faturado25'],
  fn: (faturado, plano, meta, dia, faturado25) => {
    const n = (x) => (x == null || x === '' ? null : Number(x));
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const hoje = dia.map((x) => x.data).sort().pop() || '9999-12-31';
    const mesAtual = hoje.slice(0, 7);
    const pl = new Map(plano.map((x) => [x.data, x]));
    const mt = new Map(meta.map((x) => [x.data, Number(x.meta_total)]));
    const st = new Map(meta.filter((x) => x.super_total != null).map((x) => [x.data, Number(x.super_total)]));
    const accSuper = {};
    const fat = new Map(faturado.filter((x) => x.data <= hoje).map((x) => [x.data, x]));
    const datas = [...new Set([...fat.keys(), ...mt.keys(), ...pl.keys()])].filter((d) => d.slice(0, 7) === mesAtual).sort();
    const accMeta = {};
    const acc = {};
    const f25 = new Map(faturado25.map((x) => [x.data, Number(x.liquido)]));
    const menos364 = (d) => new Date(Date.parse(d + 'T12:00:00Z') - 364 * 864e5).toISOString().slice(0, 10);
    let a25s = 0, a25d = 0, s25ok = true, d25ok = true;
    return datas.map((d) => {
      const ls = f25.has(menos364(d)) ? f25.get(menos364(d)) : null, ld = f25.has('2025' + d.slice(4)) ? f25.get('2025' + d.slice(4)) : null;
      if (ls == null) s25ok = false; else a25s += ls;
      if (ld == null) d25ok = false; else a25d += ld;
      const extra25 = {
        data_2025_semana: menos364(d), liquido_2025_semana: ls, liquido_2025_dia: ld,
        acumulado_2025_semana: s25ok ? r(a25s) : null, acumulado_2025_dia: d25ok ? r(a25d) : null,
      };
      const x = fat.get(d) || { data: d };
      const b = pl.get(x.data) || {};
      const liq = n(x.liquido), meta = n(b.plano_receita_liquida), cm = n(b.plano_cmv);
      const m = x.data.slice(0, 7);
      acc[m] = acc[m] || { l: 0, p: 0 };
      acc[m].l += liq || 0;
      acc[m].p += meta || 0;
      return {
        data: x.data, vendido: n(x.vendido), devolvido: n(x.devolvido), liquido: liq,
        taxa_devolucao: n(x.vendido) ? p(n(x.devolvido) / n(x.vendido)) : null,
        cmv: n(x.cmv), margem_bruta: n(x.margem_bruta), cobertura_custo: n(x.cobertura_custo),
        liquido_ecommerce: n(x.liquido_ecommerce), liquido_omni: n(x.liquido_omni),
        plano_receita_liquida: meta, plano_cmv: cm, var_vs_plano: meta ? p(liq / meta - 1) : null,
        margem_plano: meta ? p(1 - cm / meta) : null,
        acumulado_mes: liq == null ? null : r(acc[m].l), acumulado_plano_mes: r(acc[m].p),
        meta: mt.has(x.data) ? mt.get(x.data) : null,
        var_vs_meta: mt.get(x.data) ? p(liq / mt.get(x.data) - 1) : null,
        acumulado_meta_mes: mt.has(x.data) ? r((accMeta[m] = (accMeta[m] || 0) + mt.get(x.data))) : null,
        super_meta: st.has(x.data) ? st.get(x.data) : null,
        var_vs_super: st.get(x.data) && liq != null ? p(liq / st.get(x.data) - 1) : null,
        acumulado_super_mes: st.has(x.data) ? r((accSuper[m] = (accSuper[m] || 0) + st.get(x.data))) : null,
        ...extra25,
        var_vs_2025_semana: liq != null && extra25.liquido_2025_semana ? p(liq / extra25.liquido_2025_semana - 1) : null,
        var_vs_2025_dia: liq != null && extra25.liquido_2025_dia ? p(liq / extra25.liquido_2025_dia - 1) : null,
      };
    });
  },
});

dash.calc('mes_resumo', {
  title: 'Venda do dia e do mês',
  inputs: ['dia', 'faturado', 'base25', 'resumo_dia'],
  fn: (dia, faturado, base25, resumo_dia) => {
    const r = (x) => Math.round(x * 100) / 100;
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const soma = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const ds = [...dia].sort((a, b) => (a.data < b.data ? -1 : 1));
    const h = ds.length ? ds[ds.length - 1] : null;
    const doMes = h ? ds.filter((x) => x.data.slice(0, 7) === h.data.slice(0, 7)) : [];
    const rh = h ? resumo_dia.find((x) => x.data === h.data) : null;
    const ateHora = rh ? Number(rh.ate_hora) : 23;
    const lyHoje = h ? base25.filter((x) => x.data26 === h.data && Number(x.hora) <= ateHora) : [];
    const datasMes = doMes.map((x) => x.data);
    const lyMes = base25.filter((x) => datasMes.includes(x.data26));
    const pct = (rows, c, s) => (soma(rows, c) ? p(soma(rows, s) / soma(rows, c)) : null);
    const sale = {
      pct_sale_hoje: h ? pct([h], 'captado', 'captado_sale') : null,
      pct_sale_hoje_2025: pct(lyHoje, 'captado', 'captado_sale'),
      pct_sale_mes: pct(doMes, 'captado', 'captado_sale'),
      pct_sale_mes_2025: pct(lyMes, 'captado', 'captado_sale'),
      captado_sale_mes: r(soma(doMes, 'captado_sale')),
    };
    const dias = [...dia].sort((a, b) => (a.data < b.data ? -1 : 1));
    const hoje = dias.length ? dias[dias.length - 1] : null;
    const mes = hoje ? hoje.data.slice(0, 7) : '';
    const fat = faturado.filter((x) => !hoje || x.data <= hoje.data).sort((a, b) => (a.data < b.data ? -1 : 1));
    const ult = fat.length ? fat[fat.length - 1] : null;
    const mesFat = mes;
    return [{
      ...sale,
      hoje: hoje ? hoje.data : null,
      captado_hoje: hoje ? r(Number(hoje.captado) || 0) : null,
      pedidos_hoje: hoje ? Number(hoje.pedidos) || 0 : null,
      captado_mes: r(dias.filter((x) => x.data.slice(0, 7) === mes).reduce((s, x) => s + (Number(x.captado) || 0), 0)),
      faturado_dia: ult ? ult.data : null,
      faturado_liquido_dia: ult ? r(Number(ult.liquido) || 0) : null,
      faturado_liquido_mes: r(fat.filter((x) => x.data.slice(0, 7) === mesFat).reduce((s, x) => s + (Number(x.liquido) || 0), 0)),
    }];
  },
});

dash.calc('meta_resumo', {
  title: 'Meta do mês × faturado',
  inputs: ['faturado', 'meta', 'dia'],
  fn: (faturado, meta, dia) => {
    const r = (x) => Math.round(x * 100) / 100;
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const hoje = dia.map((x) => x.data).sort().pop() || '9999-12-31';
    const mes = hoje.slice(0, 7);
    const fat = faturado.filter((x) => x.data <= hoje && x.data.slice(0, 7) === mes).sort((a, b) => (a.data < b.data ? -1 : 1));
    const ult = fat.length ? fat[fat.length - 1].data : null;
    const m = meta.filter((x) => x.data.slice(0, 7) === mes);
    const real = sum(fat.filter((x) => x.data.slice(0, 7) === mes), 'liquido');
    if (!m.length) return [{ mes, ate: ult, tem_meta: false, realizado: r(real) }];
    const metaMes = sum(m, 'meta_total');
    const metaAte = sum(m.filter((x) => ult && x.data <= ult), 'meta_total');
    const restantes = m.filter((x) => !ult || x.data > ult).length;
    const falta = Math.max(metaMes - real, 0);
    const superMes = sum(m, 'super_total'), superAte = sum(m.filter((x) => ult && x.data <= ult), 'super_total');
    const faltaSuper = Math.max(superMes - real, 0);
    return [{
      super_mes: r(superMes), super_ate_dia: r(superAte), pct_super_ate_dia: superAte ? p(real / superAte) : null,
      pct_super_mes: superMes ? p(real / superMes) : null, falta_super: r(faltaSuper), ritmo_super: restantes ? r(faltaSuper / restantes) : null,
      mes, ate: ult, tem_meta: true, meta_mes: r(metaMes), meta_ate_dia: r(metaAte), realizado: r(real),
      pct_meta_ate_dia: metaAte ? p(real / metaAte) : null, pct_meta_mes: metaMes ? p(real / metaMes) : null,
      falta: r(falta), dias_restantes: restantes, ritmo_necessario: restantes ? r(falta / restantes) : null,
    }];
  },
});

dash.calc('est_total', {
  title: 'Match de estoque: total',
  inputs: ['est_resumo'],
  fn: (est_resumo) => {
    const s = (f) => est_resumo.reduce((t, x) => t + (Number(x[f]) || 0), 0);
    const comp = s('skus_comparados'), ok = s('skus_iguais');
    return [{
      lojas: est_resumo.length, skus_comparados: comp, skus_iguais: ok, skus_divergentes: s('skus_divergentes'),
      pct_match: comp ? Math.round((ok / comp) * 10000) / 10000 : null,
      qtd_diferente: s('qtd_diferente'), so_erp: s('so_erp'), so_vtex: s('so_vtex'), sem_cadastro_vtex: s('sem_cadastro_vtex'),
      pecas_erp: s('pecas_erp'), pecas_vtex: s('pecas_vtex'), diferenca_pecas: s('pecas_vtex') - s('pecas_erp'), pecas_divergentes: s('pecas_divergentes'),
    }];
  },
});

dash.calc('ate_ontem', {
  title: 'Meta até ontem',
  inputs: ['dia', 'faturado', 'meta'],
  fn: (dia, faturado, meta) => {
    const r = (x) => Math.round(x * 100) / 100;
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const hoje = dia.map((x) => x.data).sort().pop() || '';
    const ini = hoje.slice(0, 8) + '01';
    const dentro = (x) => x.data >= ini && x.data < hoje;
    const ms = meta.filter(dentro), cap = sum(dia.filter(dentro), 'captado');
    const fat = faturado.filter(dentro), liq = sum(fat, 'liquido');
    const ultFat = fat.map((x) => x.data).sort().pop() || null;
    const ateFat = ms.filter((x) => ultFat && x.data <= ultFat);
    const mc = sum(ms, 'meta_captado'), scap = sum(ms, 'super_captado'), ml = sum(ateFat, 'meta_total'), sl = sum(ateFat, 'super_total');
    const ontem = ms.length ? ms[ms.length - 1].data : null;
    return [{
      de: ini, ate: ontem, dias: ms.length,
      captado: r(cap), meta_captado: r(mc), pct_meta_captado: mc ? p(cap / mc) : null,
      super_captado: r(scap), pct_super_captado: scap ? p(cap / scap) : null,
      faturado_ate: ultFat, liquido: r(liq), meta_liquido: r(ml), pct_meta_liquido: ml ? p(liq / ml) : null,
      super_liquido: r(sl), pct_super_liquido: sl ? p(liq / sl) : null,
    }];
  },
});

dash.calc('faturado_resumo', {
  title: 'Faturado do mês × plano',
  inputs: ['faturado_dia'],
  fn: (faturado_dia) => {
    if (!faturado_dia.length) return [];
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const f = faturado_dia.filter((x) => x.liquido != null);
    const ate = f.length ? f[f.length - 1].data : null;
    if (!ate) return [{ mes: faturado_dia[0].data.slice(0, 7), ate: null, liquido: 0, vendido: 0, devolvido: 0, taxa_devolucao: null, margem_bruta: null, plano: 0, atingimento: null, margem_plano: null }];
    const sum = (k, rows = f) => rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const comPlano = f.filter((x) => x.plano_receita_liquida != null);
    const liq = sum('liquido'), vend = sum('vendido'), dev = sum('devolvido'), cmv = sum('cmv');
    const lp = sum('liquido', comPlano), pl = sum('plano_receita_liquida', comPlano), cmp = sum('plano_cmv', comPlano);
    const s25 = f.every((x) => x.liquido_2025_semana != null) ? sum('liquido_2025_semana') : null, d25 = f.every((x) => x.liquido_2025_dia != null) ? sum('liquido_2025_dia') : null;
    return [{
      liquido_2025_semana: s25 == null ? null : r(s25), var_vs_2025_semana: s25 ? p(liq / s25 - 1) : null,
      liquido_2025_dia: d25 == null ? null : r(d25), var_vs_2025_dia: d25 ? p(liq / d25 - 1) : null,
      mes: ate.slice(0, 7), ate, liquido: r(liq), vendido: r(vend), devolvido: r(dev),
      taxa_devolucao: vend ? p(dev / vend) : null, margem_bruta: liq ? p(1 - cmv / liq) : null,
      plano: r(pl), atingimento: pl ? p(lp / pl) : null, margem_plano: pl ? p(1 - cmp / pl) : null,
    }];
  },
});
