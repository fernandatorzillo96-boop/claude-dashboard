// Versão do site para o runtime do painel no Claude: mesma interface (dash.calc, dash.data,
// dash.onData, dash.params, dash.setParams, dash.colors, dash.setLink), lendo os dados
// do servidor com a sessão do login.
(function () {
  // Dados do painel. tool = ferramenta do servidor; args com {{param}}; file = arquivo fixo.
  const DATASETS = {
    hora: { tool: 'bf_vendas_por_hora' },
    dia: { tool: 'bf_vendas_por_dia' },
    faturado: { tool: 'bf_faturado_liquido' },
    status: { tool: 'bf_status' },
    catalogo: { tool: 'bf_resumo_catalogo' },
    warehouses: { tool: 'bf_estoque_por_warehouse' },
    afaturar: { tool: 'bf_a_faturar' },
    promos: { tool: 'bf_resultado_promocoes', args: { inicio: '{{promo_inicio}}', fim: '{{promo_fim}}' } },
    colecao: { tool: 'bf_vendas_por_grupo', args: { agrupar: 'colecao', inicio: '{{col_inicio}}', fim: '{{col_fim}}' } },
    idade: { tool: 'bf_vendas_por_grupo', args: { agrupar: 'idade_estoque', inicio: '{{col_inicio}}', fim: '{{col_fim}}' } },
    toprefs: { tool: 'bf_top_referencias', args: { inicio: '{{col_inicio}}', fim: '{{col_fim}}', limite: 50 } },
    lojas: { tool: 'bf_faturamento_por_loja', args: { inicio: '{{log_inicio}}', fim: '{{log_fim}}', dias: '{{sla_dias}}' } },
    transp: { tool: 'bf_entrega_por_transportadora', args: { inicio: '{{log_inicio}}', fim: '{{log_fim}}' } },
    atend_dia: { tool: 'bf_atendimento_por_dia', args: { inicio: '{{at_inicio}}', fim: '{{at_fim}}' } },
    atend_motivos: { tool: 'bf_atendimento_por_grupo', args: { agrupar: 'motivo', origem: 'tickets', inicio: '{{at_inicio}}', fim: '{{at_fim}}' } },
    atend_canais: { tool: 'bf_atendimento_por_grupo', args: { agrupar: 'canal', origem: 'chat', inicio: '{{at_inicio}}', fim: '{{at_fim}}' } },
    atend_tempo_at: { tool: 'bf_atendimento_tempo', args: { agrupar: 'atendente', inicio: '{{at_inicio}}', fim: '{{at_fim}}' } },
    atend_tempo_mot: { tool: 'bf_atendimento_tempo', args: { agrupar: 'motivo', inicio: '{{at_inicio}}', fim: '{{at_fim}}' } },
    est_resumo: { tool: 'bf_match_estoque_resumo' },
    est_div: { tool: 'bf_match_estoque_divergencias', args: { loja: '{{est_loja}}', tipo: '{{est_tipo}}', limite: 500 } },
    lojas_venda: { tool: 'bf_venda_lojas', args: { inicio: '2026-11-01', fim: '2026-11-30', agrupar: 'dia' } },
    lojas_out25: { tool: 'bf_venda_lojas', args: { inicio: '2025-10-01', fim: '2025-10-31', agrupar: 'dia' } },
    lojas_por_loja: { tool: 'bf_venda_lojas', args: { inicio: '2026-11-01', fim: '2026-11-30', agrupar: 'loja' } },
    midia_dia: { tool: 'bf_midia_por_dia', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}' } },
    ga4_canais: { tool: 'bf_ga4_canais', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}' } },
    ga4_origens: { tool: 'bf_ga4_origens', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}', limite: 30 } },
    ga4_paginas_entrada: { tool: 'bf_ga4_paginas', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}', tipo: 'entrada', limite: 50 } },
    ga4_paginas_vistas: { tool: 'bf_ga4_paginas', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}', tipo: 'vistas', limite: 50 } },
    ga4_funil: { tool: 'bf_ga4_funil', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}' } },
    ga4_tempo_real: { tool: 'bf_ga4_tempo_real' },
    google_campanhas: { tool: 'bf_google_campanhas', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}' } },
    ga4_entrada_det: { tool: 'bf_ga4_entrada_detalhe', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}', pagina: '{{md_pagina}}', agrupar: '{{md_det}}', limite: 50 } },
    meta_campanhas: { tool: 'bf_meta_campanhas', args: { inicio: '{{md_inicio}}', fim: '{{md_fim}}' } },
    plano_canais: { file: 'data/plano_bf_canais.json' },
    faturado25: { file: 'data/faturado_2025.json' },
    base25: { file: 'data/base_2025_por_hora.json' },
    meta: { file: 'data/meta_diaria.json' },
    plano: { file: 'data/plano_bf26_site_diario_v2.json' },
    promos25: { file: 'data/promocoes_bf25.json' },
  };
  const PADRAO = {
    promo_inicio: '2026-11-01', promo_fim: '2026-11-30', col_inicio: '2026-11-01', col_fim: '2026-11-30',
    log_inicio: '2026-11-01', log_fim: '2026-11-30', at_inicio: '2026-11-01', at_fim: '2026-11-30',
    sla_dias: 1, est_loja: null, est_tipo: null, md_inicio: '2026-11-01', md_fim: '2026-11-30', md_pagina: '/Sistema/buscavazia', md_det: 'origem',
  };
  const ATUALIZA_MIN = 5;

  let params = { ...PADRAO };
  try { params = { ...params, ...JSON.parse(localStorage.getItem('painel_params') || '{}') }; } catch {}
  const estado = {}; // id -> { status, data, error }
  const calcs = new Map(); // id -> { inputs, fn }
  const ouvintes = [];
  let agendado = false;

  const usa = (def) => JSON.stringify(def.args || {}).match(/\{\{(\w+)\}\}/g)?.map((x) => x.slice(2, -2)) || [];
  const resolver = (args) => {
    const out = {};
    for (const [k, v] of Object.entries(args || {})) {
      const m = typeof v === 'string' && v.match(/^\{\{(\w+)\}\}$/);
      out[k] = m ? params[m[1]] : v;
    }
    return out;
  };

  function avisar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      recalcular();
      ouvintes.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    });
  }

  function recalcular() {
    // calcs podem depender de outros calcs: repete até estabilizar
    for (let volta = 0; volta < 5; volta++) {
      let mudou = false;
      for (const [id, c] of calcs) {
        const ins = c.inputs.map((i) => estado[i]);
        if (ins.some((x) => !x || x.status === 'loading')) { if (estado[id]?.status !== 'loading') { estado[id] = { status: 'loading' }; mudou = true; } continue; }
        const ruim = ins.find((x) => x.status !== 'ok');
        if (ruim) { if (estado[id]?.status !== ruim.status) { estado[id] = { status: ruim.status }; mudou = true; } continue; }
        const chave = ins.map((x) => x.v).join('|');
        if (estado[id]?.chave === chave) continue;
        try { estado[id] = { status: 'ok', data: c.fn(...ins.map((x) => x.data)), chave, v: Math.random() }; }
        catch (e) { console.error('calc', id, e); estado[id] = { status: 'error', error: String(e), chave }; }
        mudou = true;
      }
      if (!mudou) break;
    }
  }

  const sair = () => { location.href = '/login?destino=' + encodeURIComponent(location.pathname + location.hash); };

  async function buscar(id) {
    const def = DATASETS[id];
    const atual = estado[id];
    if (!atual || atual.status !== 'ok') estado[id] = { status: 'loading' };
    avisar();
    try {
      let url;
      if (def.file) url = def.file;
      else {
        const a = resolver(def.args);
        url = 'api/' + def.tool + (Object.keys(a).length ? '?args=' + encodeURIComponent(JSON.stringify(a)) : '');
      }
      const r = await fetch(url, { credentials: 'same-origin', cache: def.file ? 'default' : 'no-store' });
      if (r.status === 401) return sair();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'HTTP ' + r.status);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error('Resposta inesperada');
      estado[id] = { status: 'ok', data, v: Math.random() };
    } catch (e) {
      console.error('dados', id, e);
      estado[id] = atual && atual.status === 'ok' ? atual : { status: 'error', error: String(e) };
    }
    avisar();
  }

  const todos = () => Object.keys(DATASETS).forEach((id) => buscar(id));

  window.dash = {
    loader() {},
    calc(id, def) { calcs.set(id, { inputs: def.inputs, fn: def.fn }); },
    data(id) { return estado[id] || { status: 'loading' }; },
    onData(f) { ouvintes.push(f); },
    params() { return { ...params }; },
    setParams(p) {
      params = { ...params, ...p };
      try { localStorage.setItem('painel_params', JSON.stringify(params)); } catch {}
      const mudaram = Object.keys(p);
      Object.entries(DATASETS).forEach(([id, def]) => { if (usa(def).some((k) => mudaram.includes(k))) buscar(id); });
      avisar();
    },
    setLink(nome) { history.replaceState(null, '', '#' + nome); },
    refresh: todos,
    colors: ['--serie-a', '--serie-b', '--serie-c', '--serie-d'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
  };

  // novembro fixo nos períodos: se o mês virar, os presets do app.js continuam valendo
  todos();
  setInterval(() => { if (!document.hidden) Object.entries(DATASETS).forEach(([id, d]) => { if (!d.file) buscar(id); }); }, ATUALIZA_MIN * 60e3);
  // tempo real do GA4: a cada minuto, só com a aba Mídia aberta
  setInterval(() => { if (!document.hidden && location.hash === '#midia') buscar('ga4_tempo_real'); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.entries(DATASETS).forEach(([id, d]) => { if (!d.file) buscar(id); }); });
})();
