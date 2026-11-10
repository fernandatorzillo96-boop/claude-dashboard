// Aba Plano BF: plano diário de lojas e site (BF26 Apoio Executivo, abas 05f, 05i e 05j)
// × realizado 2026 × 2025 × out/26 × out/25 (mesmos dias do mês), com margem, projeção e a tendência outubro → novembro.

dash.loader('lojas_venda', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('lojas_por_loja', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });

dash.loader('lojas_out25', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });

dash.calc('pbf_dia', {
  title: 'Plano BF: dia a dia por canal',
  description: 'Plano líquido diário de lojas (R$ 8,5 mi) e site (R$ 2,7 mi) das abas 05i e 05f, com 2025, out/26 e out/25 nos mesmos dias do mês, e o realizado como nas abas 05f/05i/05j: site = faturado líquido do 3351 (e-commerce + omni), com % SALE e desconto do captado VTEX; rede = base comercial líquida (vendas − devoluções, todas as lojas e o CD); lojas = rede − site. Out/25: lojas = base comercial líquida de outubro/2025; site = faturado líquido do 3351 de outubro/2025 (% SALE do captado VTEX 2025).',
  inputs: ['plano_canais', 'dia', 'faturado', 'lojas_venda', 'base25', 'lojas_out25'],
  fn: (plano_canais, dia, faturado, lojas_venda, base25, lojas_out25) => {
    const n = (x) => (x == null || x === '' ? null : Number(x));
    const z = (x) => Number(x) || 0;
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const hoje = dia.map((x) => x.data).sort().pop() || '';
    const cap = new Map(dia.map((x) => [x.data, x]));
    const fat = new Map(faturado.map((x) => [x.data, x]));
    const base = new Map(lojas_venda.filter((x) => x.tem_liquido).map((x) => [x.data, x]));
    // site: faturado líquido do 3351; SALE, valor DE e receita com DE do captado VTEX do mesmo dia
    const site = (d) => {
      const f = fat.get(d); if (!f) return null;
      const v = cap.get(d) || {};
      return { r: z(f.liquido), p: z(f.pecas_liquidas ?? f.pecas), cmv: n(f.cmv), sale: z(v.captado_sale), sb: z(v.captado), de: z(v.valor_de), rde: z(v.captado), parcial: d >= hoje };
    };
    // rede: base comercial líquida inteira (traz as notas do site nas lojas e no CD); lojas = rede − site
    const rede = (d) => {
      const b = base.get(d), s = site(d); if (!b || !s) return null;
      return { r: z(b.venda_liquida), p: z(b.pecas_liquidas), cmv: n(b.cmv_liquido), sale: z(b.venda_sale_liquida), de: z(b.valor_de_liquido), parcial: s.parcial };
    };
    const lojas = (d) => {
      const t = rede(d), s = site(d); if (!t) return null;
      const lr = t.r - s.r;
      return { r: lr, p: t.p - s.p, cmv: t.cmv == null || s.cmv == null ? null : t.cmv - s.cmv, sale: t.sale - s.sale, sb: lr, de: t.de - s.de, rde: lr, parcial: t.parcial };
    };
    // outubro/2025, mesmo dia do mês. Site: faturado líquido do 3351 de outubro/2025 (se importado), com o % SALE do captado VTEX 2025
    const cap25 = new Map();
    for (const x of base25) {
      if (!String(x.data25).startsWith('2025-10')) continue;
      const a = cap25.get(x.data25) || { sale: 0, sb: 0 };
      a.sale += z(x.captado_sale); a.sb += z(x.captado);
      cap25.set(x.data25, a);
    }
    const o25s = new Map();
    for (const [d, f] of fat) {
      if (!d.startsWith('2025-10')) continue;
      const c = cap25.get(d);
      o25s.set(d, { r: z(f.liquido), p: z(f.pecas_liquidas ?? f.pecas), cmv: n(f.cmv), sale: c ? c.sale : 0, sb: c ? c.sb : 0, de: null, rde: null });
    }
    const o25l = new Map(lojas_out25.filter((x) => x.tem_liquido).map((x) => [x.data, { r: z(x.venda_liquida), p: z(x.pecas_liquidas), sale: z(x.venda_sale_liquida), sb: z(x.venda_liquida), de: z(x.valor_de_liquido), rde: z(x.venda_liquida), cmv: n(x.cmv_liquido) }]));
    const campos = ['r25', 'p25', 'sale25', 'sale_base25', 'cmv25', 'rc25', 'de25', 'rde25', 'plano_r', 'plano_p', 'plano_cmv', 'plano_sale', 'plano_cheio', 'o26_r', 'o26_p', 'o26_sale', 'o26_sale_base', 'o26_cmv', 'o26_rc', 'o26_de', 'o26_rde'];
    const linha = (canal, data, etapa, b, real, o25) => ({
      chave: canal + ' · ' + data, canal, data, etapa, ...Object.fromEntries(campos.map((k) => [k, r(b[k])])),
      real_r: real ? r(real.r) : null, real_p: real ? real.p : null, real_sale: real ? r(real.sale) : null, real_sale_base: real ? r(real.sb) : null,
      real_cmv: real && real.cmv != null ? r(real.cmv) : null, real_de: real ? r(real.de) : null, real_rde: real ? r(real.rde) : null, parcial: !!(real && real.parcial),
      o25_r: o25 ? r(o25.r) : null, o25_p: o25 ? o25.p : null, o25_sale: o25 ? r(o25.sale) : null, o25_sale_base: o25 ? r(o25.sb) : null,
      o25_de: o25 && o25.de != null ? r(o25.de) : null, o25_rde: o25 && o25.rde != null ? r(o25.rde) : null, o25_cmv: o25 && o25.cmv != null ? r(o25.cmv) : null,
      atingimento: real && b.plano_r ? p(real.r / b.plano_r) : null, var_2025: real && b.r25 ? p(real.r / b.r25 - 1) : null,
      mb_real: real && real.cmv != null && real.r ? p(1 - real.cmv / real.r) : null, pct_sale_real: real && real.sb ? p(real.sale / real.sb) : null,
    });
    const out = [], porData = new Map();
    for (const x of plano_canais) {
      const b = Object.fromEntries(campos.map((k) => [k, n(x[k]) ?? 0]));
      const d25 = '2025-10-' + x.data.slice(8, 10);
      const real = x.canal === 'Site' ? site(x.data) : lojas(x.data);
      const o25 = (x.canal === 'Site' ? o25s : o25l).get(d25) || null;
      out.push(linha(x.canal, x.data, x.etapa, b, real, o25));
      const g = porData.get(x.data) || { etapa: x.etapa, b: Object.fromEntries(campos.map((k) => [k, 0])), reais: {}, o25: {} };
      campos.forEach((k) => (g.b[k] += b[k]));
      g.reais[x.canal] = real; g.o25[x.canal] = o25;
      porData.set(x.data, g);
    }
    const soma = (a, b) => (!a || !b ? null : { r: a.r + b.r, p: a.p + b.p, cmv: a.cmv == null || b.cmv == null ? null : a.cmv + b.cmv, sale: a.sale + b.sale, sb: a.sb + b.sb,
      de: a.de == null || b.de == null ? null : a.de + b.de, rde: a.rde == null || b.rde == null ? null : a.rde + b.rde, parcial: !!(a.parcial || b.parcial) });
    for (const [data, g] of porData) out.push(linha('Rede', data, g.etapa, g.b, soma(g.reais.Lojas, g.reais.Site), soma(g.o25.Lojas, g.o25.Site)));
    const ordem = { Rede: 0, Lojas: 1, Site: 2 };
    return out.sort((a, b) => ordem[a.canal] - ordem[b.canal] || (a.data < b.data ? -1 : 1));
  },
});

dash.calc('pbf_resumo', {
  title: 'Plano BF: resumo por canal',
  description: 'Do dia 1 até a data de corte (último dia com lojas e site; sem lojas importadas, o último dia de cada canal), por canal: receita, peças, preço médio, % SALE, margem e desconto de 2025, out/25, plano, realizado e out/26; projeção do mês (tendência = realizado + plano restante corrigido pelo desempenho contra o plano).',
  inputs: ['pbf_dia'],
  fn: (pbf_dia) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    // mesmo período para os três: até o último dia com lojas e site (rede); sem isso, cada canal até o seu último dia
    const fechados = (c) => pbf_dia.filter((x) => x.canal === c && x.real_r != null && !x.parcial).map((x) => x.data);
    const corteRede = fechados('Rede').pop() || null;
    return ['Rede', 'Lojas', 'Site'].map((canal) => {
      const xs = pbf_dia.filter((x) => x.canal === canal);
      const corte = corteRede || fechados(canal).pop() || null;
      const f = xs.filter((x) => corte && x.data <= corte && x.real_r != null && !x.parcial);
      const S = (k, rows = f) => rows.reduce((t, x) => t + (Number(x[k]) || 0), 0);
      const comCmv = f.filter((x) => x.real_cmv != null);
      // out/25 só conta se tiver todos os dias do período (senão a comparação fica torta)
      const o25 = f.every((x) => x.o25_r != null) ? f : [];
      const resto = xs.filter((x) => !corte || x.data > corte);
      const rr = S('real_r'), pr = S('plano_r'), r25 = S('r25'), ro = S('o26_r');
      const mbReal = comCmv.length ? 1 - S('real_cmv', comCmv) / S('real_r', comCmv) : null;
      const fator = pr ? rr / pr : null;
      return {
        canal, de: xs.length ? xs[0].data : null, corte, dias: f.length,
        receita_2025: r(r25), receita_plano: r(pr), receita_real: r(rr), receita_out26: r(ro),
        pecas_2025: S('p25'), pecas_plano: Math.round(S('plano_p')), pecas_real: S('real_p'), pecas_out26: S('o26_p'),
        preco_medio_2025: r(r25 / S('p25')), preco_medio_plano: r(pr / S('plano_p')), preco_medio_real: r(rr / S('real_p')), preco_medio_out26: r(ro / S('o26_p')),
        pct_sale_2025: p(S('sale25') / S('sale_base25')), pct_sale_plano: p(S('plano_sale') / pr), pct_sale_real: p(S('real_sale') / S('real_sale_base')), pct_sale_out26: p(S('o26_sale') / S('o26_sale_base')),
        mb_2025: p(1 - S('cmv25') / S('rc25')), mb_plano: p(1 - S('plano_cmv') / pr), mb_real: p(mbReal), mb_out26: p(1 - S('o26_cmv') / S('o26_rc')),
        desconto_2025: p(1 - S('rde25') / S('de25')), desconto_plano: p(1 - pr / S('plano_cheio')), desconto_real: p(1 - S('real_rde') / S('real_de')), desconto_out26: p(1 - S('o26_rde') / S('o26_de')),
        receita_out25: o25.length ? r(S('o25_r', o25)) : null, pecas_out25: o25.length ? S('o25_p', o25) : null,
        preco_medio_out25: o25.length ? r(S('o25_r', o25) / S('o25_p', o25)) : null, pct_sale_out25: o25.length ? p(S('o25_sale', o25) / S('o25_sale_base', o25)) : null,
        desconto_out25: o25.length && o25.every((x) => x.o25_de != null) ? p(1 - S('o25_rde', o25) / S('o25_de', o25)) : null,
        mb_out25: o25.length && o25.every((x) => x.o25_cmv != null) ? p(1 - S('o25_cmv', o25) / S('o25_r', o25)) : null, dias_out25: o25.length,
        var_receita_plano: p(rr / pr - 1), var_receita_2025: p(rr / r25 - 1), var_receita_out26: p(rr / ro - 1),
        atingimento: p(rr / pr),
        mes_receita_2025: r(S('r25', xs)), mes_receita_plano: r(S('plano_r', xs)), mes_pecas_2025: S('p25', xs), mes_pecas_plano: Math.round(S('plano_p', xs)),
        mes_mb_2025: p(1 - S('cmv25', xs) / S('rc25', xs)), mes_mb_plano: p(1 - S('plano_cmv', xs) / S('plano_r', xs)),
        mes_pct_sale_2025: p(S('sale25', xs) / S('sale_base25', xs)), mes_pct_sale_plano: p(S('plano_sale', xs) / S('plano_r', xs)),
        projecao_tendencia: fator == null ? null : r(rr + S('plano_r', resto) * fator),
        projecao_real_mais_plano: r(rr + S('plano_r', resto)),
        projecao_pecas_tendencia: fator == null || !S('plano_p') ? null : Math.round(S('real_p') + S('plano_p', resto) * (S('real_p') / S('plano_p'))),
        projecao_pecas_real_mais_plano: Math.round(S('real_p') + S('plano_p', resto)),
        tendencia_vs_plano: fator == null ? null : p(fator - 1),
      };
    });
  },
});

dash.calc('pbf_indicadores', {
  title: 'Plano BF: indicadores do mesmo período',
  description: 'Por indicador e canal (lojas, site e rede), do dia 1 à data de corte: 2025, out/26 e plano de novembro nos mesmos dias, e o realizado 2026; diferenças do realizado (em % para valores, em pontos percentuais para % SALE, desconto e margem) e share de cada canal na rede (receita e peças).',
  inputs: ['pbf_resumo'],
  fn: (pbf_resumo) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const ind = [['Receita', 'receita', 'brl'], ['Preço médio', 'preco_medio', 'brl0'], ['Desconto médio sobre DE', 'desconto', 'pp'],
      ['% SALE na receita', 'pct_sale', 'pp'], ['Margem bruta', 'mb', 'pp'], ['Peças vendidas', 'pecas', 'int']];
    const rede = pbf_resumo.find((x) => x.canal === 'Rede') || {};
    const out = [];
    ind.forEach(([nome, k, tipo], i) => {
      for (const canal of ['Lojas', 'Site', 'Rede']) {
        const x = pbf_resumo.find((y) => y.canal === canal);
        if (!x || !x.corte) continue;
        const v = (col) => x[k + '_' + col];
        const d = (u, w) => (u == null || w == null || !w ? null : tipo === 'pp' ? p(u - w) : p(u / w - 1));
        const sh = (col) => (k === 'receita' || k === 'pecas') && rede[k + '_' + col] ? p(x[k + '_' + col] / rede[k + '_' + col]) : null;
        out.push({
          chave: nome + ' · ' + canal, ordem: i * 3 + ['Lojas', 'Site', 'Rede'].indexOf(canal), indicador: nome, canal, tipo, de: x.de, corte: x.corte,
          v2025: v('2025'), out26: v('out26'), real: v('real'), plano: v('plano'),
          d_2025: d(v('real'), v('2025')), d_out26: d(v('real'), v('out26')), d_plano: d(v('real'), v('plano')),
          share_2025: sh('2025'), share_out26: sh('out26'), share_real: sh('real'), share_plano: sh('plano'),
        });
      }
    });
    return out;
  },
});

dash.calc('pbf_tendencia', {
  title: 'Plano BF: tendência outubro → novembro',
  description: 'Mesmos dias do mês (dia 1 à data de corte): quanto novembro andou sobre outubro em 2025 (nov/25 ÷ out/25), no realizado 2026 (nov/26 ÷ out/26) e no plano (plano nov/26 ÷ out/26); e o novembro/26 implícito na curva de 2025 (out/26 × nov/25 ÷ out/25), contra o plano e o realizado. Em pontos percentuais para preço, desconto, % SALE e margem quando são taxas.',
  inputs: ['pbf_resumo'],
  fn: (pbf_resumo) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const ind = [['Receita', 'receita', 'brl'], ['Preço médio', 'preco_medio', 'brl0'], ['Desconto médio sobre DE', 'desconto', 'pp'],
      ['% SALE na receita', 'pct_sale', 'pp'], ['Margem bruta', 'mb', 'pp'], ['Peças vendidas', 'pecas', 'int']];
    const out = [];
    ind.forEach(([nome, k, tipo], i) => {
      for (const canal of ['Lojas', 'Site', 'Rede']) {
        const x = pbf_resumo.find((y) => y.canal === canal);
        if (!x || !x.corte) continue;
        const v = (c) => x[k + '_' + c];
        const d = (u, w) => (u == null || w == null || !w ? null : tipo === 'pp' ? p(u - w) : p(u / w - 1));
        // implícito: aplica a variação out→nov de 2025 sobre out/26 (soma de pontos nas taxas, multiplicação nos valores)
        const imp = v('out25') == null || v('2025') == null || v('out26') == null ? null
          : tipo === 'pp' ? p(v('out26') + (v('2025') - v('out25'))) : v('out25') ? r(v('out26') * (v('2025') / v('out25'))) : null;
        out.push({
          chave: nome + ' · ' + canal, ordem: i * 3 + ['Lojas', 'Site', 'Rede'].indexOf(canal), indicador: nome, canal, tipo, de: x.de, corte: x.corte,
          out25: v('out25'), nov25: v('2025'), var_2025: d(v('2025'), v('out25')),
          out26: v('out26'), real: v('real'), var_real: d(v('real'), v('out26')),
          plano: v('plano'), var_plano: d(v('plano'), v('out26')),
          implicito: imp, plano_vs_implicito: d(v('plano'), imp), real_vs_implicito: d(v('real'), imp),
        });
      }
    });
    return out;
  },
});

dash.calc('pbf_projecao', {
  title: 'Plano BF: projeção do mês',
  description: 'Por canal: novembro de 2025, plano do mês, tendência (realizado + plano restante corrigido pelo desempenho contra o plano) e realizado + plano restante.',
  inputs: ['pbf_resumo'],
  fn: (pbf_resumo) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const out = [];
    for (const x of pbf_resumo) {
      const linhas = [['Receita', 'brl', x.mes_receita_2025, x.mes_receita_plano, x.projecao_tendencia, x.projecao_real_mais_plano],
        ['Peças vendidas', 'int', x.mes_pecas_2025, x.mes_pecas_plano, x.projecao_pecas_tendencia, x.projecao_pecas_real_mais_plano],
        ['Margem bruta', 'pct', x.mes_mb_2025, x.mes_mb_plano, null, null],
        ['% SALE na receita', 'pct', x.mes_pct_sale_2025, x.mes_pct_sale_plano, null, null]];
      for (const [indicador, tipo, a, b, c, d] of linhas) out.push({ chave: x.canal + ' · ' + indicador, canal: x.canal, indicador, tipo, mes_2025: a, mes_plano: b, tendencia: c, real_mais_plano: d, tend_vs_plano: c != null && b ? p(c / b - 1) : null });
    }
    return out;
  },
});

dash.calc('pbf_etapas', {
  title: 'Plano BF: por etapa',
  description: 'Por canal e etapa da campanha (só novembro), nos dias já fechados: receita realizada × plano × 2025, margem e o plano total da etapa.',
  inputs: ['pbf_dia'],
  fn: (pbf_dia) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const g = new Map();
    for (const x of pbf_dia) { const k = x.canal + '|' + x.etapa; if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
    return [...g.values()].map((xs) => {
      const f = xs.filter((x) => x.real_r != null && !x.parcial), c = f.filter((x) => x.real_cmv != null);
      const S = (k, rows = f) => rows.reduce((t, x) => t + (Number(x[k]) || 0), 0);
      const rr = S('real_r'), pr = S('plano_r'), r25 = S('r25');
      const mb = c.length ? 1 - S('real_cmv', c) / S('real_r', c) : null;
      return {
        chave: xs[0].canal + ' · ' + xs[0].etapa, canal: xs[0].canal, etapa: xs[0].etapa, inicio: xs[0].data, fim: xs[xs.length - 1].data, dias_fechados: f.length,
        receita_real: r(rr), receita_plano: r(pr), atingimento: pr ? p(rr / pr) : null, var_2025: r25 ? p(rr / r25 - 1) : null,
        mb_real: p(mb), mb_plano: pr ? p(1 - S('plano_cmv') / pr) : null, mb_2025: S('rc25') ? p(1 - S('cmv25') / S('rc25')) : null,
        plano_etapa: r(S('plano_r', xs)),
      };
    });
  },
});

(function () {
  const B = window.BF;
  if (!B) return;
  const sec = document.getElementById('planobf');
  const selCanal = document.getElementById('sel-pbf-canal');
  let canal = 'Rede';
  try { canal = localStorage.getItem('pbf_canal') || 'Rede'; } catch {}
  selCanal.value = canal;
  selCanal.addEventListener('change', () => { canal = selCanal.value; try { localStorage.setItem('pbf_canal', canal); } catch {} B.desenhar(); });

  const fmtV = (t, v) => (t === 'brl' ? B.F.brl(v) : t === 'brl0' ? B.F.brl0(v) : t === 'int' ? B.F.int(v) : B.F.pct(v));
  const fmtD = (t, v) => (B.vazio(v) ? '—' : t === 'pp' ? (v > 0 ? '+' : v < 0 ? '−' : '') + B.nf1.format(Math.abs(v) * 100) + ' p.p.' : B.F.delta(v));
  
  function tabelaIndicadores() {
    const tb = document.getElementById('tb-pbf-ind');
    const rows = B.linhas('pbf_indicadores');
    const ths = [...tb.querySelectorAll('th')];
    tb.tBodies[0].replaceChildren(...rows.map((x) => {
      const tr = document.createElement('tr');
      tr.dataset.key = x.chave;
      if (x.canal === 'Rede') tr.className = 'pbf-rede';
      if (x.canal === 'Lojas') tr.className = 'pbf-ini';
      ths.forEach((th) => {
        const f = th.dataset.field, td = document.createElement('td');
        if (th.classList.contains('n')) td.className = 'n';
        if (f === 'indicador') td.textContent = x.canal === 'Lojas' ? x.indicador : '';
        else if (f === 'canal') td.textContent = x.canal === 'Rede' ? 'Rede (total)' : x.canal === 'Site' ? 'Site + app' : 'Lojas físicas';
        else if (f.startsWith('d_')) { td.textContent = fmtD(x.tipo, x[f]); if (!/SALE|Desconto/.test(x.indicador)) B.tomDelta(td, x[f]); }
        else if (f.startsWith('share_')) td.textContent = x[f] == null ? '' : B.F.pct(x[f]);
        else td.textContent = fmtV(x.tipo, x[f]);
        tr.append(td);
      });
      return tr;
    }));
    const r = rows[0];
    document.getElementById('pbf-ind-periodo').textContent = r && r.corte ? `${B.dataCurta(r.de)} a ${B.dataCurta(r.corte)}` : '—';
  }

  function tabelaTendencia() {
    const tb = document.getElementById('tb-pbf-tend');
    const rows = B.linhas('pbf_tendencia');
    const ths = [...tb.querySelectorAll('th')];
    tb.tBodies[0].replaceChildren(...rows.map((x) => {
      const tr = document.createElement('tr');
      tr.dataset.key = x.chave;
      if (x.canal === 'Rede') tr.className = 'pbf-rede';
      if (x.canal === 'Lojas') tr.className = 'pbf-ini';
      ths.forEach((th) => {
        const f = th.dataset.field, td = document.createElement('td');
        if (th.classList.contains('n')) td.className = 'n';
        if (f === 'indicador') td.textContent = x.canal === 'Lojas' ? x.indicador : '';
        else if (f === 'canal') td.textContent = x.canal === 'Rede' ? 'Rede (total)' : x.canal === 'Site' ? 'Site + app' : 'Lojas físicas';
        else if (/^var_|_vs_/.test(f)) td.textContent = fmtD(x.tipo, x[f]);
        else td.textContent = fmtV(x.tipo, x[f]);
        tr.append(td);
      });
      return tr;
    }));
    // leitura da receita, por canal
    const rec = rows.filter((x) => x.indicador === 'Receita');
    const pct = (v) => (B.vazio(v) ? '—' : B.F.delta(v));
    const nome = { Lojas: 'Nas lojas', Site: 'No site', Rede: 'Na rede' };
    const frases = rec.map((x) => x.var_2025 == null
      ? `${nome[x.canal]}: falta outubro/2025 líquido para comparar (${x.canal === 'Lojas' ? 'importe a base comercial de outubro/2025' : x.canal === 'Site' ? 'importe o 3351 de outubro/2025' : 'precisa das lojas e do site de outubro/2025'}).`
      : `${nome[x.canal]}, novembro/25 andou ${pct(x.var_2025)} sobre outubro/25; o plano pede ${pct(x.var_plano)} sobre outubro/26 e o realizado está em ${pct(x.var_real)}.`);
    document.getElementById('pbf-tend-leitura').textContent = frases.join(' ');
  }

  function tabelaProjecao() {
    const tb = document.getElementById('tb-pbf-proj');
    const ths = [...tb.querySelectorAll('th')];
    tb.tBodies[0].replaceChildren(...B.linhas('pbf_projecao').filter((x) => x.canal === canal).map((x) => {
      const tr = document.createElement('tr');
      tr.dataset.key = x.chave;
      ths.forEach((th) => {
        const f = th.dataset.field, td = document.createElement('td');
        if (th.classList.contains('n')) td.className = 'n';
        td.textContent = f === 'indicador' ? x.indicador : f === 'tend_vs_plano' ? B.F.delta(x[f]) : fmtV(x.tipo, x[f]);
        if (f === 'tend_vs_plano') B.tomDelta(td, x[f]);
        tr.append(td);
      });
      return tr;
    }));
  }

  function desenharPlanoBF() {
    const res = B.linhas('pbf_resumo').find((x) => x.canal === canal);
    // números do topo: mesma marcação, com a linha do canal escolhido
    sec.querySelectorAll('[data-source="pbf_resumo"][data-field]').forEach((el) => {
      el.dataset.where = 'canal=' + canal;
      if (!res) return;
      B.preencher(el, res[el.dataset.field]);
      if (el.dataset.fmt === 'delta') B.tomDelta(el, res[el.dataset.field]);
    });
    const tend = B.linhas('pbf_tendencia').find((x) => x.chave === 'Receita · ' + canal);
    sec.querySelectorAll('[data-source="pbf_tendencia"][data-field]').forEach((el) => {
      el.dataset.where = 'chave=' + encodeURIComponent('Receita · ' + canal);
      if (!tend) return;
      B.preencher(el, tend[el.dataset.field]);
      B.tomDelta(el, tend[el.dataset.field]);
    });
    const st = B.linhas('status')[0] || {};
    const bt = document.getElementById('btn-lojas-importar');
    bt.hidden = !B.okUrl(st.url_lojas); if (!bt.hidden) bt.href = st.url_lojas;
    document.getElementById('nota-pbf-lojas').hidden = !!(B.linhas('lojas_venda').length) || canal === 'Site';

    tabelaIndicadores();
    tabelaTendencia();
    tabelaProjecao();

    const c = B.cores();
    const xs = B.linhas('pbf_dia').filter((x) => x.canal === canal);
    const cats = xs.map((x) => x.data), lab = B.dataCurta;
    const tip = (i) => `${B.dataCurta(xs[i].data)} · ${xs[i].etapa}${xs[i].parcial ? ' (hoje, parcial)' : ''}`;
    const elR = document.getElementById('ch-pbf-receita');
    if (!B.falhou(elR, canal === 'Site' ? 'dia' : canal === 'Lojas' ? 'lojas_venda' : 'dia')) B.combo(elR, {
      cats, label: lab, tipTitle: tip,
      bars: [{ name: 'Realizado 2026', vals: xs.map((x) => x.real_r), color: c.a }],
      lines: [{ name: 'Plano', vals: xs.map((x) => x.plano_r), color: c.b, dash: '5 4' }, { name: '2025', vals: xs.map((x) => x.r25), color: c.mudo, width: 1.5 }],
      fmtY: B.F.brl, fmtTip: B.F.brl0, height: 260,
    });
    // acumulado com projeção
    const elA = document.getElementById('ch-pbf-acum');
    if (!B.falhou(elA, 'dia')) {
      let a = 0, pl = 0, l = 0, pr = 0;
      const corte = res && res.corte, fator = res && res.receita_plano ? res.receita_real / res.receita_plano : null;
      const real = [], plano = [], ly = [], proj = [];
      xs.forEach((x) => {
        pl += x.plano_r || 0; l += x.r25 || 0;
        if (x.real_r != null && !x.parcial && corte && x.data <= corte) { a += x.real_r; real.push(a); pr = a; proj.push(x.data === corte ? a : null); }
        else { real.push(null); if (fator != null && corte && x.data > corte) { pr += (x.plano_r || 0) * fator; proj.push(pr); } else proj.push(null); }
        plano.push(pl); ly.push(l);
      });
      B.combo(elA, {
        cats, label: lab, tipTitle: (i) => `Até ${B.dataCurta(xs[i].data)} · ${xs[i].etapa}`, bars: [],
        lines: [{ name: 'Realizado 2026', vals: real, color: c.a, width: 2.5 }, { name: 'Projeção (tendência)', vals: proj, color: c.a, dash: '3 3' },
          { name: 'Plano', vals: plano, color: c.b, dash: '5 4' }, { name: '2025', vals: ly, color: c.mudo, width: 1.5 }],
        fmtY: B.F.brl, fmtTip: B.F.brl, height: 260,
      });
    }
    // margem bruta por dia
    const elM = document.getElementById('ch-pbf-mb');
    if (!B.falhou(elM, 'dia')) {
      const pc = (x) => (x == null || !isFinite(x) ? null : x);
      B.combo(elM, {
        cats, label: lab, tipTitle: tip, bars: [], zero: false,
        lines: [{ name: '2026', vals: xs.map((x) => (x.parcial ? null : x.mb_real)), color: c.a, width: 2.5 },
          { name: 'Plano', vals: xs.map((x) => pc(x.plano_r ? 1 - x.plano_cmv / x.plano_r : null)), color: c.b, dash: '5 4' }, { name: '2025', vals: xs.map((x) => pc(x.rc25 ? 1 - x.cmv25 / x.rc25 : null)), color: c.mudo, width: 1.5 }],
        fmtY: (v) => B.nf0.format(v * 100) + '%', fmtTip: B.F.pct, height: 220,
      });
    }
    B.tabela(document.getElementById('tb-pbf-etapas'), B.linhas('pbf_etapas').filter((x) => x.canal === canal), {
      inicio: 'data', fim: 'data', receita_real: 'brl', receita_plano: 'brl', atingimento: 'pct', var_2025: 'delta', mb_real: 'pct', mb_plano: 'pct', mb_2025: 'pct', plano_etapa: 'brl',
    }, { var_2025: (x) => x.var_2025, atingimento: (x) => (x.atingimento == null ? null : x.atingimento - 1) });
    B.tabela(document.getElementById('tb-pbf-dia'), xs.filter((x) => x.real_r != null).slice().reverse(),
      { data: 'data', real_r: 'brl0', plano_r: 'brl0', atingimento: 'pct', r25: 'brl0', var_2025: 'delta', real_p: 'int', mb_real: 'pct', pct_sale_real: 'pct' },
      { var_2025: (x) => x.var_2025, atingimento: (x) => (x.atingimento == null ? null : x.atingimento - 1) });
    B.tabela(document.getElementById('tb-pbf-lojas'), B.linhas('lojas_por_loja'), {
      venda_bruta: 'brl0', pecas: 'int', preco_medio: 'brl0', pct_sale: 'pct', desconto_sobre_de: 'pct', margem_bruta: 'pct', venda_liquida: 'brl0', devolvido: 'brl0', dias: 'int',
    });
  }
  window.BF_ABAS = window.BF_ABAS || {};
  window.BF_ABAS.planobf = desenharPlanoBF;
  if (B.aba() === 'planobf') B.desenhar();
})();
