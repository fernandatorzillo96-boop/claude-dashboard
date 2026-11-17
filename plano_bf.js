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
  description: 'Plano líquido diário: lojas = meta diária do varejo (Diárias Varejo nov/26, R$ 8,175 mi; peças, SALE, valor DE e CMV do plano 05i na mesma proporção) e site = aba 05f (R$ 2,7 mi), com 2025, out/26 e out/25 nos mesmos dias do mês, e o realizado da base comercial líquida (vendas − devoluções) pelo Canal: lojas = Varejo; site + app = E-commerce + E-commerce Omni; rede = lojas + site. Dias de bases antigas, sem Canal: site = faturado líquido do 3351 (% SALE e desconto do captado VTEX) e lojas = rede − site. Out/25: lojas = base comercial líquida de outubro/2025; site = faturado líquido do 3351 de outubro/2025 (% SALE do captado VTEX 2025).',
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
    // Base comercial com Canal: lojas = Varejo; site + app = E-commerce + E-commerce Omni (tudo da mesma base, líquido).
    const doCanal = (b, px, parcial) => ({
      r: z(b[px + 'venda_liquida']), p: z(b[px + 'pecas_liquidas']), cmv: n(b[px + 'cmv_liquido']),
      sale: z(b[px + 'venda_sale_liquida']), sb: z(b[px + 'venda_liquida']), de: z(b[px + 'valor_de_liquido']), rde: z(b[px + 'venda_liquida']), parcial,
    });
    // site sem Canal na base: faturado líquido do 3351; SALE, valor DE e receita com DE do captado VTEX do mesmo dia
    const site3351 = (d) => {
      const f = fat.get(d); if (!f) return null;
      const v = cap.get(d) || {};
      return { r: z(f.liquido), p: z(f.pecas_liquidas ?? f.pecas), cmv: n(f.cmv), sale: z(v.captado_sale), sb: z(v.captado), de: z(v.valor_de), rde: z(v.captado), parcial: d >= hoje };
    };
    const site = (d) => {
      const b = base.get(d);
      if (b && b.tem_canal) return doCanal(b, 'site_', d >= hoje);
      return site3351(d);
    };
    // rede: base comercial líquida inteira (lojas + notas do site nas lojas e no CD)
    const rede = (d) => {
      const b = base.get(d), s = site(d); if (!b || !s) return null;
      return { r: z(b.venda_liquida), p: z(b.pecas_liquidas), cmv: n(b.cmv_liquido), sale: z(b.venda_sale_liquida), de: z(b.valor_de_liquido), parcial: s.parcial };
    };
    // lojas: Varejo da base (com Canal); sem Canal, rede − site (3351), como a aba 05i
    const lojas = (d) => {
      const b = base.get(d);
      if (b && b.tem_canal) return doCanal(b, 'lojas_', d >= hoje);
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

// Projeção pela curva: o desempenho contra o plano de cada dia da semana (seg, ter, ...) nos dias fechados
// é aplicado ao plano de cada dia restante do mesmo dia da semana. Sem dia da semana observado: desempenho geral.
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const dowDe = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
dash.calc('pbf_curva_fatores', {
  title: 'Plano BF: desempenho contra o plano por dia da semana',
  description: 'Por canal e dia da semana, nos dias fechados até a data de corte: realizado, plano dos mesmos dias, quantos dias e o fator (realizado ÷ plano) usado na projeção pela curva. Peças com fator próprio.',
  inputs: ['pbf_dia', 'pbf_resumo'],
  fn: (pbf_dia, pbf_resumo) => {
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const r = (x) => Math.round(x * 100) / 100;
    const out = [];
    for (const canal of ['Lojas', 'Site', 'Rede']) {
      const res = pbf_resumo.find((x) => x.canal === canal) || {};
      const f = pbf_dia.filter((x) => x.canal === canal && res.corte && x.data <= res.corte && x.real_r != null && !x.parcial);
      const geral = f.reduce((t, x) => t + x.plano_r, 0) ? f.reduce((t, x) => t + x.real_r, 0) / f.reduce((t, x) => t + x.plano_r, 0) : null;
      const geralP = f.reduce((t, x) => t + (x.plano_p || 0), 0) ? f.reduce((t, x) => t + (x.real_p || 0), 0) / f.reduce((t, x) => t + (x.plano_p || 0), 0) : null;
      for (const dw of [1, 2, 3, 4, 5, 6, 0]) {
        const xs = f.filter((x) => dowDe(x.data) === dw);
        const rr = xs.reduce((t, x) => t + x.real_r, 0), pr = xs.reduce((t, x) => t + x.plano_r, 0);
        const rp = xs.reduce((t, x) => t + (x.real_p || 0), 0), pp = xs.reduce((t, x) => t + (x.plano_p || 0), 0);
        const fator = pr ? rr / pr : geral, fatorP = pp ? rp / pp : geralP;
        out.push({ chave: canal + ' · ' + dw, canal, dow: dw, dia_semana: DIAS_SEMANA[dw], dias: xs.length, realizado: r(rr), plano: r(pr),
          fator: p(fator), vs_plano: fator == null ? null : p(fator - 1), fator_pecas: p(fatorP), usa_geral: !pr, fator_geral: p(geral) });
      }
    }
    return out;
  },
});

dash.calc('pbf_curva', {
  title: 'Plano BF: projeção dia a dia pela curva',
  description: 'Por canal e dia: plano, realizado (até a data de corte) e, nos dias seguintes, a projeção = plano do dia × fator do mesmo dia da semana; acumulados de plano e de realizado + projeção.',
  inputs: ['pbf_dia', 'pbf_resumo', 'pbf_curva_fatores'],
  fn: (pbf_dia, pbf_resumo, fatores) => {
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const out = [];
    for (const canal of ['Lojas', 'Site', 'Rede']) {
      const res = pbf_resumo.find((x) => x.canal === canal) || {};
      const fat = new Map(fatores.filter((x) => x.canal === canal).map((x) => [x.dow, x]));
      let acP = 0, acX = 0, acPP = 0, acXP = 0;
      for (const x of pbf_dia.filter((y) => y.canal === canal)) {
        const dw = dowDe(x.data), fz = fat.get(dw) || {};
        const fechado = res.corte && x.data <= res.corte && x.real_r != null && !x.parcial;
        const proj = fechado ? null : fz.fator == null ? null : x.plano_r * fz.fator;
        const projP = fechado ? null : fz.fator_pecas == null ? null : (x.plano_p || 0) * fz.fator_pecas;
        const v = fechado ? x.real_r : proj, vp = fechado ? x.real_p || 0 : projP;
        acP += x.plano_r || 0; acPP += x.plano_p || 0; acX += v || 0; acXP += vp || 0;
        out.push({ chave: canal + ' · ' + x.data, canal, data: x.data, dia_semana: DIAS_SEMANA[dw], etapa: x.etapa, tipo: fechado ? 'Realizado' : 'Projeção',
          plano_r: r(x.plano_r), real_r: fechado ? r(x.real_r) : null, fator: fechado ? null : fz.fator, projecao_r: r(proj), valor_r: r(v),
          vs_plano: v != null && x.plano_r ? p(v / x.plano_r - 1) : null, plano_acum: r(acP), valor_acum: res.corte ? r(acX) : null, acum_vs_plano: res.corte && acP ? p(acX / acP - 1) : null,
          plano_p: x.plano_p == null ? null : Math.round(x.plano_p), valor_p: vp == null ? null : Math.round(vp), pecas_acum: Math.round(acXP), plano_pecas_acum: Math.round(acPP) });
      }
    }
    return out;
  },
});

// Venda por semana (segunda a domingo, dentro do mês) por canal: plano, realizado e projeção pela curva.
dash.calc('pbf_semana', {
  title: 'Plano BF: venda por semana × plano',
  description: 'Lojas, site e rede por semana (segunda a domingo): plano da semana, plano até a data de corte, realizado, % do plano, realizado + projeção pela curva para a semana, e acumulados do mês.',
  inputs: ['pbf_curva'],
  fn: (pbf_curva) => {
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const seg = (d) => { const t = new Date(d + 'T12:00:00Z'); return new Date(t - ((t.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
    const curta = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
    const out = [];
    for (const canal of ['Lojas', 'Site', 'Rede']) {
      const g = new Map();
      for (const x of pbf_curva.filter((y) => y.canal === canal)) { const k = seg(x.data); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
      let aP = 0, aR = 0, aPate = 0, aV = 0, i = 0;
      for (const xs of g.values()) {
        i++;
        const ini = xs[0].data, fim = xs[xs.length - 1].data;
        const fech = xs.filter((x) => x.tipo === 'Realizado');
        const plano = xs.reduce((t, x) => t + (x.plano_r || 0), 0);
        const planoAte = fech.reduce((t, x) => t + (x.plano_r || 0), 0);
        const real = fech.reduce((t, x) => t + (x.real_r || 0), 0);
        const proj = xs.reduce((t, x) => t + (x.valor_r || 0), 0);
        const status = !fech.length ? 'futura' : fech.length === xs.length ? 'fechada' : 'em andamento';
        aP += plano; aPate += planoAte; aR += real; aV += proj;
        out.push({ chave: canal + ' · ' + ini, canal, semana: 'Semana ' + i, periodo: ini === fim ? curta(ini) : curta(ini) + ' a ' + curta(fim), inicio: ini, status,
          plano_semana: r(plano), plano_ate_corte: status === 'futura' ? null : r(planoAte), realizado: status === 'futura' ? null : r(real),
          pct_plano: status === 'futura' || !planoAte ? null : p(real / planoAte), diferenca: status === 'futura' ? null : r(real - planoAte),
          projecao_semana: r(proj), projecao_vs_plano: plano ? p(proj / plano - 1) : null,
          plano_acumulado: r(aP), realizado_acumulado: status === 'futura' ? null : r(aR), pct_acumulado: status === 'futura' || !aPate ? null : p(aR / aPate),
          projecao_acumulada: r(aV) });
      }
    }
    return out;
  },
});

dash.calc('pbf_projecao', {
  title: 'Plano BF: projeção do mês por canal',
  description: 'Lojas, site e rede: novembro de 2025, plano do mês, tendência (realizado até a data de corte + plano restante corrigido pelo desempenho contra o plano), projeção pela curva (plano de cada dia restante × desempenho do mesmo dia da semana), realizado + plano restante, contra o plano e contra 2025, e o share de cada canal na tendência da rede.',
  inputs: ['pbf_resumo', 'pbf_curva'],
  fn: (pbf_resumo, pbf_curva) => {
    const fimCurva = (canal) => { const xs = pbf_curva.filter((x) => x.canal === canal); return xs[xs.length - 1] || {}; };
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const q = (a, b) => (a == null || !b ? null : Math.round((a / b) * 100) / 100);
    const out = [];
    for (const x of pbf_resumo) {
      const linhas = [['Receita', 'brl', x.mes_receita_2025, x.mes_receita_plano, x.projecao_tendencia, x.projecao_real_mais_plano],
        ['Peças vendidas', 'int', x.mes_pecas_2025, x.mes_pecas_plano, x.projecao_pecas_tendencia, x.projecao_pecas_real_mais_plano],
        ['Preço médio', 'brl0', q(x.mes_receita_2025, x.mes_pecas_2025), q(x.mes_receita_plano, x.mes_pecas_plano), q(x.projecao_tendencia, x.projecao_pecas_tendencia), q(x.projecao_real_mais_plano, x.projecao_pecas_real_mais_plano)],
        ['Margem bruta', 'pct', x.mes_mb_2025, x.mes_mb_plano, null, null],
        ['% SALE na receita', 'pct', x.mes_pct_sale_2025, x.mes_pct_sale_plano, null, null]];
      const fc = fimCurva(x.canal);
      const curva = { Receita: fc.valor_acum ?? null, 'Peças vendidas': fc.pecas_acum ?? null };
      curva['Preço médio'] = q(curva.Receita, curva['Peças vendidas']);
      for (const [indicador, tipo, a, b, c, d] of linhas) {
        const cv = curva[indicador] ?? null;
        out.push({ chave: x.canal + ' · ' + indicador, canal: x.canal, indicador, tipo, mes_2025: a, mes_plano: b, tendencia: c, real_mais_plano: d,
          tend_vs_plano: c != null && b ? p(c / b - 1) : null, tend_vs_2025: c != null && a ? p(c / a - 1) : null, share_tendencia: null,
          curva: cv, curva_vs_plano: cv != null && b ? p(cv / b - 1) : null });
      }
    }
    // share de cada canal na tendência da rede (receita e peças)
    for (const x of out) {
      const rede = out.find((y) => y.canal === 'Rede' && y.indicador === x.indicador);
      if (rede && rede.tendencia && x.tendencia != null && (x.tipo === 'brl' || x.tipo === 'int')) x.share_tendencia = p(x.tendencia / rede.tendencia);
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
    // um bloco por canal: lojas físicas, site + app e rede (total)
    const ordem = { Lojas: 0, Site: 1, Rede: 2 };
    const nome = { Lojas: 'Lojas físicas', Site: 'Site + app', Rede: 'Rede (total)' };
    const ind = [];
    const rows = B.linhas('pbf_projecao').slice();
    rows.forEach((x) => { if (!ind.includes(x.indicador)) ind.push(x.indicador); });
    rows.sort((a, b) => ordem[a.canal] - ordem[b.canal] || ind.indexOf(a.indicador) - ind.indexOf(b.indicador));
    tb.tBodies[0].replaceChildren(...rows.map((x, i) => {
      const tr = document.createElement('tr');
      tr.dataset.key = x.chave;
      const primeira = i === 0 || rows[i - 1].canal !== x.canal;
      if (primeira) tr.className = 'pbf-ini';
      if (x.canal === 'Rede') tr.classList.add('pbf-rede');
      ths.forEach((th) => {
        const f = th.dataset.field, td = document.createElement('td');
        if (th.classList.contains('n')) td.className = 'n';
        if (f === 'canal') { td.textContent = primeira ? nome[x.canal] || x.canal : ''; if (primeira) td.style.fontWeight = '600'; }
        else if (f === 'indicador') td.textContent = x.indicador;
        else if (f === 'tend_vs_plano' || f === 'tend_vs_2025' || f === 'curva_vs_plano') { td.textContent = B.F.delta(x[f]); B.tomDelta(td, x[f]); }
        else td.textContent = fmtV(x.tipo, x[f]);
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
    // venda por semana: lojas, site e rede em blocos
    const sm = B.linhas('pbf_semana');
    const ordemC = { Lojas: 0, Site: 1, Rede: 2 }, nomeC = { Lojas: 'Lojas físicas', Site: 'Site + app', Rede: 'Rede (total)' };
    const smO = sm.slice().sort((a, b) => ordemC[a.canal] - ordemC[b.canal] || a.inicio.localeCompare(b.inicio));
    B.tabela(document.getElementById('tb-pbf-semana'), smO.map((x, i) => ({ ...x, canal_nome: i === 0 || smO[i - 1].canal !== x.canal ? nomeC[x.canal] : '' })), {
      plano_semana: 'brl0', plano_ate_corte: 'brl0', realizado: 'brl0', pct_plano: 'pct', diferenca: 'brl0', projecao_semana: 'brl0', projecao_vs_plano: 'delta',
      plano_acumulado: 'brl0', realizado_acumulado: 'brl0', pct_acumulado: 'pct', projecao_acumulada: 'brl0',
    }, { diferenca: (x) => x.diferenca, projecao_vs_plano: (x) => x.projecao_vs_plano, pct_plano: (x) => (x.pct_plano == null ? null : x.pct_plano - 1), pct_acumulado: (x) => (x.pct_acumulado == null ? null : x.pct_acumulado - 1) });
    const stSm = new Map(sm.map((x) => [x.chave, x]));
    document.querySelectorAll('#tb-pbf-semana tbody tr').forEach((tr) => {
      const x = stSm.get(tr.dataset.key); if (!x) return;
      if (x.semana === 'Semana 1') tr.classList.add('pbf-ini');
      if (x.canal === 'Rede') tr.classList.add('pbf-rede');
      if (x.status === 'em andamento') tr.style.fontWeight = '600';
      if (x.status === 'futura') tr.style.color = 'var(--color-fg-muted, #777)';
    });
    const smC = sm.filter((x) => x.canal === canal);
    const elSm = document.getElementById('ch-pbf-semana');
    if (!B.falhou(elSm, 'dia')) B.combo(elSm, {
      cats: smC.map((x) => x.semana), label: (s0, i) => (smC[i] ? smC[i].semana.replace('Semana ', 'S') + ' · ' + smC[i].periodo : s0),
      bars: [{ name: 'Plano da semana', vals: smC.map((x) => x.plano_semana), color: c.b },
        { name: 'Realizado', vals: smC.map((x) => x.realizado), color: c.a },
        { name: 'Realizado + projeção pela curva', vals: smC.map((x) => (x.status === 'fechada' ? null : x.projecao_semana)), color: c.c }],
      lines: [],
      fmtY: B.F.brl, fmtTip: B.F.brl0, height: 240,
    });
    // projeção pela curva (dia da semana)
    const fz = B.linhas('pbf_curva_fatores').filter((x) => x.canal === canal);
    B.tabela(document.getElementById('tb-pbf-curva-fat'), fz, { realizado: 'brl0', plano: 'brl0', dias: 'int', fator: 'pct', vs_plano: 'delta', fator_pecas: 'pct' },
      { vs_plano: (x) => x.vs_plano });
    const cv = B.linhas('pbf_curva').filter((x) => x.canal === canal);
    const elC = document.getElementById('ch-pbf-curva');
    if (!B.falhou(elC, 'dia')) B.combo(elC, {
      cats: cv.map((x) => x.data), label: lab, tipTitle: (i) => `${B.dataCurta(cv[i].data)} · ${cv[i].dia_semana} · ${cv[i].etapa}`,
      bars: [{ name: 'Realizado', vals: cv.map((x) => x.real_r), color: c.a }, { name: 'Projeção pela curva', vals: cv.map((x) => x.projecao_r), color: c.c }],
      lines: [{ name: 'Plano', vals: cv.map((x) => x.plano_r), color: c.b, dash: '5 4' }],
      fmtY: B.F.brl, fmtTip: B.F.brl0, height: 260,
    });
    B.tabela(document.getElementById('tb-pbf-curva'), cv, {
      data: 'data', plano_r: 'brl0', valor_r: 'brl0', fator: 'pct', vs_plano: 'delta', plano_acum: 'brl0', valor_acum: 'brl0', acum_vs_plano: 'delta', valor_p: 'int',
    }, { vs_plano: (x) => x.vs_plano, acum_vs_plano: (x) => x.acum_vs_plano });
    document.querySelectorAll('#tb-pbf-curva tbody tr').forEach((tr) => { if (/Proje/.test(tr.cells[2]?.textContent || '')) tr.style.color = 'var(--color-fg-muted, #666)'; });
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
