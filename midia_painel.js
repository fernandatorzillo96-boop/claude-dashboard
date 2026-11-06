// Aba Mídia e site: GA4 (tráfego, funil, páginas, canais, tempo real), Google Ads (pelo GA4) e Meta Ads,
// com ROI de mídia sobre o captado VTEX (site) e sobre a rede (site + lojas).

dash.loader('midia_dia', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_canais', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_origens', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_paginas_entrada', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_paginas_vistas', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_funil', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('ga4_tempo_real', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });
dash.loader('meta_campanhas', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });

dash.loader('google_campanhas', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });

dash.loader('ga4_entrada_det', { description: 'Lê a resposta JSON do servidor VTEX BF26 como linhas', fn: ({ answer }) => {
  let a = answer;
  if (a && !Array.isArray(a) && Array.isArray(a.content)) a = a.content.map((c) => c.text || '').join('');
  if (typeof a === 'string') a = JSON.parse(a);
  if (!Array.isArray(a)) throw new Error('Resposta inesperada do servidor VTEX BF26');
  return a;
} });

dash.calc('midia_roi_dia', {
  title: 'Mídia × venda por dia',
  description: 'Por dia do período de mídia: investimento Google Ads (da API do Google Ads quando conectada; senão o custo importado no GA4) e Meta Ads, captado VTEX e venda bruta das lojas do mesmo dia, ROI de mídia (receita bruta ÷ investimento) do site e da rede, ROAS de cada plataforma, sessões do GA4 e conversão (pedidos VTEX ÷ sessões).',
  inputs: ['midia_dia', 'dia', 'lojas_venda'],
  fn: (midia_dia, dia, lojas_venda) => {
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const v = new Map(dia.map((x) => [x.data, x])), l = new Map(lojas_venda.map((x) => [x.data, x]));
    return midia_dia.map((x) => {
      const s = v.get(x.data) || {}, lj = l.get(x.data);
      const inv = x.investimento_total == null ? null : Number(x.investimento_total);
      const cap = s.captado == null ? null : Number(s.captado), loja = lj ? Number(lj.venda_bruta) : null;
      return {
        data: x.data, google_investimento: x.google_investimento ?? null, meta_investimento: x.meta_investimento ?? null, investimento_total: inv,
        captado_site: cap, pedidos_site: s.pedidos ?? null, venda_lojas: loja,
        roi_site: inv && cap != null ? r(cap / inv) : null, roi_rede: inv && cap != null && loja != null ? r((cap + loja) / inv) : null,
        meta_roas: x.meta_roas ?? null, google_roas_ga4: x.google_roas_ga4 ?? null, google_roas: x.google_roas ?? null, google_fonte: x.google_fonte ?? null,
        sessoes: x.sessoes ?? null, conversao_vtex: x.sessoes && s.pedidos != null ? p(s.pedidos / x.sessoes) : null, conversao_ga4: x.conversao_ga4 ?? null,
        custo_por_pedido: inv && s.pedidos ? r(inv / s.pedidos) : null,
      };
    });
  },
});

dash.calc('midia_resumo', {
  title: 'Mídia no período',
  description: 'Soma do período de mídia (até hoje): investimento por plataforma, ROI de mídia do site (captado VTEX ÷ investimento) e da rede (site + lojas, só nos dias com lojas importadas), ROAS das plataformas, custo por pedido, sessões e conversão.',
  inputs: ['midia_roi_dia', 'midia_dia'],
  fn: (midia_roi_dia, midia_dia) => {
    const r = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
    const p = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
    const S = (a, k) => a.reduce((t, x) => t + (Number(x[k]) || 0), 0);
    const f = midia_roi_dia.filter((x) => x.captado_site != null);
    const m = midia_dia.filter((x) => f.some((y) => y.data === x.data));
    const inv = S(f, 'investimento_total'), g = S(f, 'google_investimento'), me = S(f, 'meta_investimento');
    const cl = f.filter((x) => x.venda_lojas != null), invL = S(cl, 'investimento_total');
    const ses = S(m, 'sessoes');
    const temInv = f.some((x) => x.investimento_total != null), temGa = m.some((x) => x.sessoes != null);
    const nz = (ok, v) => (ok ? v : null);
    return [{
      de: f.length ? f[0].data : null, ate: f.length ? f[f.length - 1].data : null, dias: f.length,
      investimento_total: nz(temInv, r(inv)), google_investimento: nz(f.some((x) => x.google_investimento != null), r(g)), meta_investimento: nz(f.some((x) => x.meta_investimento != null), r(me)),
      captado_site: r(S(f, 'captado_site')), pedidos_site: S(f, 'pedidos_site'),
      roi_site: inv ? r(S(f, 'captado_site') / inv) : null,
      roi_rede: invL ? r((S(cl, 'captado_site') + S(cl, 'venda_lojas')) / invL) : null, dias_rede: cl.length,
      meta_roas: me ? r(S(m, 'meta_receita') / me) : null, meta_compras: nz(me > 0, S(m, 'meta_compras')), meta_receita: nz(me > 0, r(S(m, 'meta_receita'))),
      google_roas_ga4: g ? r(S(m, 'receita_google_ga4') / g) : null,
      google_roas: g && m.some((x) => x.google_fonte === 'Google Ads') ? r(S(m, 'google_receita') / g) : null, google_conversoes: r(S(m, 'google_conversoes')),
      google_fonte: m.some((x) => x.google_fonte === 'Google Ads') ? 'API do Google Ads' : m.some((x) => x.google_fonte === 'GA4') ? 'GA4' : null,
      custo_por_pedido: inv && S(f, 'pedidos_site') ? r(inv / S(f, 'pedidos_site')) : null,
      sessoes: nz(temGa, ses), usuarios: nz(temGa, S(m, 'usuarios')), conversao_vtex: ses ? p(S(f, 'pedidos_site') / ses) : null, conversao_ga4: ses ? p(S(m, 'compras_ga4') / ses) : null,
      custo_por_sessao: inv && ses ? r(inv / ses) : null, receita_ga4: nz(temGa, r(S(m, 'receita_ga4'))),
    }];
  },
});

(function () {
  const B = window.BF;
  if (!B) return;
  const sel = document.getElementById('sel-md');
  sel.replaceChildren(...B.presets.map((p, i) => new Option(p[0], String(i))));
  sel.addEventListener('change', () => { const [a, b] = B.periodoDe(B.presets[Number(sel.value)]); dash.setParams({ md_inicio: a, md_fim: b }); });
  const syncSel = () => {
    const pr = dash.params();
    const i = B.presets.findIndex((p) => { const [x, y] = B.periodoDe(p); return x === pr.md_inicio && y === pr.md_fim; });
    if (i >= 0) sel.value = String(i);
  };
  document.getElementById('btn-rt').addEventListener('click', () => dash.refresh('ga4_tempo_real'));
  const selDet = document.getElementById('sel-md-det');
  selDet.addEventListener('change', () => dash.setParams({ md_det: selDet.value }));
  document.getElementById('tb-md-entrada').addEventListener('click', (ev) => {
    if (ev.target.closest('th')) return;
    const tr = ev.target.closest('tr[data-key]');
    if (tr) { dash.setParams({ md_pagina: tr.dataset.key }); document.getElementById('card-md-det').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  function avisos() {
    const st = B.linhas('status')[0] || {};
    const msgs = [];
    if (st.ga4_configurado === false) msgs.push('GA4 ainda não conectado (faltam GA4_PROPERTY_ID e GA4_CREDENTIALS no servidor).');
    else if (st.ga4_erro) msgs.push('GA4: ' + st.ga4_erro);
    if (st.ga4_configurado && st.google_ga4_erro) msgs.push(st.google_ga4_erro);
    if (st.meta_configurado === false) msgs.push('Meta Ads ainda não conectado (faltam META_ACCESS_TOKEN e META_AD_ACCOUNT_ID no servidor).');
    else if (st.meta_erro) msgs.push(st.meta_erro);
    if (st.google_ads_erro) msgs.push(st.google_ads_erro);
    else if (!st.google_ads_configurado && st.google_ads_falta) msgs.push('Google Ads direto ainda não conectado (falta: ' + st.google_ads_falta + '); até lá, o investimento do Google vem do GA4.');
    const bg = document.getElementById('btn-google-ads');
    bg.hidden = !(B.okUrl(st.url_google_ads));
    if (!bg.hidden) { bg.href = st.url_google_ads; bg.textContent = st.google_ads_configurado ? 'Reconectar Google Ads' : 'Conectar Google Ads'; }
    const el = document.getElementById('nota-midia');
    el.textContent = msgs.map((m) => (m.length > 300 ? m.slice(0, 300) + '…' : m)).join(' ');
    el.hidden = !msgs.length;
  }

  function desenharMidia() {
    syncSel();
    avisos();
    const c = B.cores();
    const d = B.linhas('midia_roi_dia');
    const cats = d.map((x) => x.data);
    const el1 = document.getElementById('ch-md-inv');
    if (!B.falhou(el1, 'midia_dia')) B.combo(el1, {
      cats, label: B.dataCurta,
      bars: [{ name: 'Google Ads', vals: d.map((x) => x.google_investimento), color: c.b }, { name: 'Meta Ads', vals: d.map((x) => x.meta_investimento), color: c.d }],
      lines: [], fmtY: B.F.brl, fmtTip: B.F.brl0, height: 240,
    });
    const el2 = document.getElementById('ch-md-roi');
    if (!B.falhou(el2, 'midia_dia')) B.combo(el2, {
      cats, label: B.dataCurta, bars: [], zero: false,
      lines: [{ name: 'ROI mídia site (captado ÷ invest.)', vals: d.map((x) => x.roi_site), color: c.a, width: 2.5 }, { name: 'ROI mídia rede', vals: d.map((x) => x.roi_rede), color: c.c },
        { name: 'ROAS Meta (plataforma)', vals: d.map((x) => x.meta_roas), color: c.d, dash: '5 4' }, { name: 'ROAS Google', vals: d.map((x) => x.google_roas ?? x.google_roas_ga4), color: c.b, dash: '5 4' }],
      fmtY: (v) => B.nf1.format(v) + 'x', fmtTip: (v) => (B.vazio(v) ? '—' : B.nf1.format(v) + 'x'), height: 240,
    });
    const el3 = document.getElementById('ch-md-ses');
    if (!B.falhou(el3, 'midia_dia')) B.combo(el3, {
      cats, label: B.dataCurta, bars: [{ name: 'Sessões (GA4)', vals: d.map((x) => x.sessoes), color: c.a }], lines: [],
      fmtY: B.F.int, fmtTip: B.F.int, height: 220,
    });
    const el4 = document.getElementById('ch-md-conv');
    if (!B.falhou(el4, 'midia_dia')) B.combo(el4, {
      cats, label: B.dataCurta, bars: [], zero: false,
      lines: [{ name: 'Pedidos VTEX ÷ sessões', vals: d.map((x) => x.conversao_vtex), color: c.a, width: 2.5 }, { name: 'Compras GA4 ÷ sessões', vals: d.map((x) => x.conversao_ga4), color: c.mudo, width: 1.5 }],
      fmtY: (v) => B.nf1.format(v * 100) + '%', fmtTip: B.F.pct, height: 220,
    });
    // tempo real
    const rt = B.linhas('ga4_tempo_real');
    const res = rt.find((x) => x.tipo === 'resumo');
    document.getElementById('rt-quando').textContent = res ? B.F.hm(res.atualizado_em) : '—';
    const min = rt.filter((x) => x.tipo === 'minuto');
    const el5 = document.getElementById('ch-rt');
    if (!B.falhou(el5, 'ga4_tempo_real')) B.combo(el5, {
      cats: min.map((x) => x.minutos_atras), label: (m) => (m === 0 ? 'agora' : '−' + m), tipTitle: (i) => (min[i].minutos_atras === 0 ? 'Último minuto' : `Há ${min[i].minutos_atras} min`),
      bars: [{ name: 'Usuários ativos por minuto', vals: min.map((x) => x.usuarios_ativos), color: c.a }], lines: [], fmtY: B.F.int, fmtTip: B.F.int, height: 160,
    });
    B.tabela(document.getElementById('tb-rt-pag'), rt.filter((x) => x.tipo === 'pagina'), { usuarios_ativos: 'int', visualizacoes: 'int' });
    B.tabela(document.getElementById('tb-rt-disp'), rt.filter((x) => x.tipo === 'dispositivo'), { usuarios_ativos: 'int' });
    B.tabela(document.getElementById('tb-md-funil'), B.linhas('ga4_funil'), { usuarios: 'int', eventos: 'int', pct_do_inicio: 'pct', pct_da_etapa_anterior: 'pct' });
    B.tabela(document.getElementById('tb-md-canais'), B.linhas('ga4_canais'), {
      sessoes: 'int', pct_sessoes: 'pct', taxa_engajamento: 'pct', add_to_cart: 'int', compras: 'int', receita: 'brl0', pct_receita: 'pct', conversao: 'pct', ticket_medio: 'brl0',
    });
    B.tabela(document.getElementById('tb-md-meta'), B.linhas('meta_campanhas'), {
      meta_investimento: 'brl0', meta_impressoes: 'int', meta_cliques: 'int', ctr: 'pct', cpc: 'brlc', meta_compras: 'int', meta_receita: 'brl0', meta_roas: 'dec', custo_por_compra: 'brl0',
    });
    B.tabela(document.getElementById('tb-md-google'), B.linhas('google_campanhas'), {
      google_investimento: 'brl0', google_impressoes: 'int', google_cliques: 'int', ctr: 'pct', cpc: 'brlc', google_conversoes: 'dec', google_receita: 'brl0', google_roas: 'dec', custo_por_conversao: 'brl0',
    });
    B.tabela(document.getElementById('tb-md-origens'), B.linhas('ga4_origens'), { sessoes: 'int', compras: 'int', receita: 'brl0', conversao: 'pct' });
    B.tabela(document.getElementById('tb-md-entrada'), B.linhas('ga4_paginas_entrada'), { sessoes: 'int', taxa_engajamento: 'pct', add_to_cart: 'int', compras: 'int', receita: 'brl0', conversao: 'pct' });
    const pr = dash.params();
    document.getElementById('md-det-pag').textContent = pr.md_pagina || '—';
    selDet.value = pr.md_det || 'origem';
    B.tabela(document.getElementById('tb-md-det'), B.linhas('ga4_entrada_det'), { sessoes: 'int', pct_sessoes: 'pct', taxa_engajamento: 'pct', usuarios: 'int', novos_usuarios: 'int', compras: 'int', receita: 'brl0' });
    B.tabela(document.getElementById('tb-md-vistas'), B.linhas('ga4_paginas_vistas'), { visualizacoes: 'int', usuarios: 'int', tempo_medio_s: 'int' });
  }
  window.BF_ABAS = window.BF_ABAS || {};
  window.BF_ABAS.midia = desenharMidia;
  if (B.aba() === 'midia') B.desenhar();
})();
