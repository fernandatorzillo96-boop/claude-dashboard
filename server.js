// Servidor MCP (Streamable HTTP) do painel Black Friday 2026 — somente leitura na VTEX.
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { state, load } from './store.js';
import { start, sweepProgress } from './sync.js';
import { vendasPorHora, vendasPorDia, resultadoPromocoes, faturadoLiquido, status, aFaturar, vendasPorGrupo, topReferencias, AGRUPAMENTOS, faturamentoPorLoja, entregaPorTransportadora, entregaPedidos, entregaPedidosLista, tempoEtapas, tempoEtapasPedidos, eventosTransporte, vendasPorEstado, vendasPorVendedor, amostraCamposVendedor, vendasPorDepartamento } from './metrics.js';
import { importar3351 } from './erp3351.js';
import { diagnosticoOctadesk, startOctadesk, atendimentoPorDia, atendimentoPorGrupo, atendimentoTempo, statusOctadesk } from './octadesk.js';
import { uploadPage } from './upload-page.js';
import { estoquePage } from './estoque-page.js';
import { usuarios, paginaLogin, fazerLogin, sair, exigirLogin, exigirAdmin } from './login.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { carregarLojas, importarLojas, vendaLojas, statusLojas } from './lojas_venda.js';
import { lojasPage } from './lojas-page.js';
import { recordeCaptacao } from './recorde.js';
import { lerCampanhas, gravarCampanhas } from './campanhas.js';
import { ga4EntradaDetalhe, ga4NovosRecorrentes, midiaPorDia, ga4Canais, ga4Origens, ga4Paginas, ga4Funil, ga4TempoReal, metaCampanhas, statusMidia } from './midia.js';
import { googleAdsCampanhas, statusGoogleAds, urlConectar, concluirConexao, googleAdsTemCliente } from './googleads.js';
import { carregarMatch, importarEstoqueErp, matchResumo, matchDivergencias, matchCsv, statusMatch, TIPOS_DIVERGENCIA, estoqueSaude, usarVendaLojas } from './estoque_match.js';
usarVendaLojas(vendaLojas);

if (!config.accessSecret || config.accessSecret.length < 24) {
  console.error('Defina ACCESS_SECRET com pelo menos 24 caracteres.');
  process.exit(1);
}
if (!config.baseUrlOverride && (!config.appKey || !config.appToken)) {
  console.error('Defina VTEX_APP_KEY e VTEX_APP_TOKEN.');
  process.exit(1);
}

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const periodo = {
  inicio: z.string().optional().describe('Primeiro dia, AAAA-MM-DD (horário de Brasília). Padrão: início do acompanhamento.'),
  fim: z.string().optional().describe('Último dia, AAAA-MM-DD. Padrão: hoje.'),
};
const ro = { readOnlyHint: true, openWorldHint: false };
const baseUrl = () => (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '') : null);
const urlEstoque = () => (baseUrl() ? `${baseUrl()}/estoque/${config.accessSecret}` : null);

function buildServer(s = new McpServer({ name: 'vtex-bf26', version: '1.0.0' })) {

  s.registerTool('bf_vendas_por_hora', {
    title: 'Vendas captadas por hora',
    description: 'Captado VTEX (pedidos não cancelados) por dia e hora de Brasília: captado, pedidos (sem sufixo), peças, TM, preço médio, desconto médio, CMV (Custo GEC), lucro e margem bruta.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(vendasPorHora(inicio, fim)));

  s.registerTool('bf_vendas_por_dia', {
    title: 'Vendas captadas por dia',
    description: 'Mesmas métricas de bf_vendas_por_hora, somadas por dia.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(vendasPorDia(inicio, fim)));

  s.registerTool('bf_resultado_promocoes', {
    title: 'Resultado por promoção',
    description: 'Para cada promoção e cupom da VTEX no período: pedidos, peças, captado, captado de hoje, desconto concedido, CMV, lucro e margem bruta. Frete grátis fica de fora.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(resultadoPromocoes(inicio, fim)));

  s.registerTool('bf_estoque_por_warehouse', {
    title: 'Estoque disponível por estoque',
    description: 'Última varredura do estoque VTEX: total, reservado e disponível por warehouse (lojas e CD), com peças em SKUs sem foto.',
    inputSchema: {}, annotations: ro,
  }, async () => json((state.inventory?.warehouses || []).map((w) => ({ ...w, atualizado_em: state.inventory.atualizado_em }))));

  s.registerTool('bf_resumo_catalogo', {
    title: 'Resumo de estoque e catálogo',
    description: 'Uma linha: estoque disponível total (todos os estoques), quanto dele está em SKUs ativos (%), peças em SKUs sem foto (ativos/inativos, SALE/não SALE), SKUs com estoque, SKUs ativos, produtos ativos e produtos visíveis no site.',
    inputSchema: {}, annotations: ro,
  }, async () => json([{
    ...(state.catalogSummary || {}),
    estoque_total: state.inventory?.total ?? null,
    estoque_reservado: state.inventory?.reservado ?? null,
    estoque_disponivel: state.inventory?.disponivel ?? null,
    skus_com_estoque: state.inventory?.skus_com_estoque ?? null,
    estoque_disponivel_ativo: state.inventory?.disponivel_ativo ?? null,
    pct_estoque_ativo: state.inventory?.disponivel ? Math.round(((state.inventory.disponivel_ativo ?? 0) / state.inventory.disponivel) * 10000) / 10000 : null,
    estoque_disponivel_inativo: state.inventory?.disponivel_ativo != null ? state.inventory.disponivel - state.inventory.disponivel_ativo : null,
    skus_ativos_com_estoque: state.inventory?.skus_ativos_com_estoque ?? null,
    estoque_sem_foto: state.inventory?.disponivel_sem_foto ?? null,
    pct_estoque_sem_foto: state.inventory?.disponivel && state.inventory?.disponivel_sem_foto != null ? Math.round((state.inventory.disponivel_sem_foto / state.inventory.disponivel) * 10000) / 10000 : null,
    skus_sem_foto_com_estoque: state.inventory?.skus_sem_foto_com_estoque ?? null,
    estoque_sem_foto_ativo: state.inventory?.disponivel_sem_foto_ativo ?? null,
    estoque_sem_foto_inativo: state.inventory?.disponivel_sem_foto != null ? state.inventory.disponivel_sem_foto - (state.inventory.disponivel_sem_foto_ativo ?? 0) : null,
    skus_sem_foto_ativos_com_estoque: state.inventory?.skus_sem_foto_ativos_com_estoque ?? null,
    estoque_sem_foto_sale: state.inventory?.disponivel_sem_foto_sale ?? null,
    estoque_sem_foto_nao_sale: state.inventory?.disponivel_sem_foto_nao_sale ?? null,
    estoque_foto_desconhecida: state.inventory?.disponivel_foto_desconhecida ?? null,
    estoque_atualizado_em: state.inventory?.atualizado_em ?? null,
    varredura_em_andamento: sweepProgress.running,
    varredura_progresso: sweepProgress.total ? Math.round((sweepProgress.done / sweepProgress.total) * 100) / 100 : null,
  }]));

  s.registerTool('bf_faturado_liquido', {
    title: 'Faturado líquido de devolução',
    description: 'Por dia, do relatório 3351 importado: vendido, devolvido, líquido, peças, CMV (Custo GEC), lucro e margem bruta; e-commerce e omni.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(faturadoLiquido(inicio, fim)));

  s.registerTool('bf_vendas_por_grupo', {
    title: 'Vendas por coleção, idade do estoque ou grupo',
    description: 'Captado no período somado por um atributo da referência (cadastro do Planejamento BF): coleção, idade do estoque, grupo BF, departamento, grupo, categoria ou estamparia. Pedidos, peças, captado, participação, preço médio, desconto, CMV, margem e % SALE.',
    inputSchema: { ...periodo, agrupar: z.enum(AGRUPAMENTOS).optional().describe('Atributo. Padrão: colecao.') }, annotations: ro,
  }, async ({ inicio, fim, agrupar }) => json(vendasPorGrupo(inicio, fim, agrupar)));

  s.registerTool('bf_top_referencias', {
    title: 'Referências mais vendidas',
    description: 'As referências com maior captado no período, com produto, coleção, idade do estoque, peças, preço médio, desconto, margem e % SALE.',
    inputSchema: { ...periodo, limite: z.number().int().optional().describe('Quantas referências (padrão 50, máximo 500).') }, annotations: ro,
  }, async ({ inicio, fim, limite }) => json(topReferencias(inicio, fim, limite)));

  s.registerTool('bf_faturamento_por_loja', {
    title: 'Faturamento por loja (SLA)',
    description: 'Por warehouse (loja ou CD), das entregas de pedidos aprovados no período: quantas tiveram nota emitida até o prazo (padrão 1 dia útil após a aprovação do pagamento, pela data), % no prazo, % no mesmo dia, pendentes, pendentes atrasadas e dias até faturar.',
    inputSchema: { ...periodo, dias: z.number().optional().describe('Prazo em dias úteis após a aprovação. 0 = mesmo dia. Padrão 1.') }, annotations: ro,
  }, async ({ inicio, fim, dias }) => json(faturamentoPorLoja(inicio, fim, dias)));

  s.registerTool('bf_entrega_por_transportadora', {
    title: 'Entrega no prazo por transportadora',
    description: 'Por transportadora, das entregas já faturadas de pedidos do período: entregues, entregues no prazo prometido ao cliente (só a data), entregues com atraso, em aberto e em aberto já atrasadas, e % no prazo.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(entregaPorTransportadora(inicio, fim)));

  s.registerTool('bf_entrega_pedidos', {
    title: 'Entrega ao cliente por pedido',
    description: 'Pedidos aprovados do período (por data de criação) e a confirmação de entrega da VTEX (isDelivered em todos os pacotes): pedidos, dentro do prazo, entregues no prazo, entregues com atraso, em aberto no prazo e em aberto já atrasados. Linhas: total, entrega (casa) e retira em loja.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(entregaPedidos(inicio, fim)));

  s.registerTool('bf_entrega_pedidos_lista', {
    title: 'Lista de pedidos por situação de entrega',
    description: 'Pedidos do período (por data de criação) numa situação de entrega: abertos_atrasados (padrão), abertos_no_prazo, abertos (os dois), entregues_atrasados, entregues_no_prazo, entregues_sem_data ou todos. Traz pedido, dias de atraso, prazo prometido, transportadora, warehouse, nota fiscal, status da transportadora e valor. Ordenado pelos mais atrasados.',
    inputSchema: { ...periodo, situacao: z.enum(['abertos_atrasados', 'abertos_no_prazo', 'abertos', 'entregues_atrasados', 'entregues_no_prazo', 'entregues_sem_data', 'todos']).optional() },
    annotations: ro,
  }, async ({ inicio, fim, situacao }) => json(entregaPedidosLista(inicio, fim, situacao)));

  s.registerTool('bf_tempo_etapas', {
    title: 'Tempo por etapa: aprovação, nota, despacho e entrega',
    description: 'Por pacote de pedidos aprovados no período (por data de criação, sem cancelados), em três etapas: aprovação → nota (horas úteis), nota → despacho (horas úteis; despacho = primeiro evento da transportadora que já é coleta/postagem) e despacho → entrega (dias úteis seg–sex, e dias corridos). Horas úteis no horário do warehouse: lojas seg–sáb 10h–21h e dom 14h–20h; CD seg–sex 9h–16h. Traz média, mediana e p90 de cada etapa, pendentes em cada etapa, em trânsito e ciclo total (aprovação → entrega, dias corridos). Retira em loja entra só na primeira etapa. Agrupa por warehouse (padrão), transportadora, semana (segunda a domingo), dia ou total.',
    inputSchema: { ...periodo, agrupar: z.enum(['warehouse', 'transportadora', 'semana', 'dia', 'total']).optional().describe('Padrão: warehouse.') }, annotations: ro,
  }, async ({ inicio, fim, agrupar }) => json(tempoEtapas(inicio, fim, agrupar)));

  s.registerTool('bf_tempo_etapas_pedidos', {
    title: 'Pacotes com os horários de cada etapa',
    description: 'Um pacote por linha: pedido, loja/CD, transportadora, nota, horários de aprovação, nota, despacho e entrega, o evento usado como despacho, horas úteis em cada etapa e o que está em aberto. situacao: todos (padrão), aguardando_nota, aguardando_despacho, em_transito, entregues.',
    inputSchema: { ...periodo, situacao: z.enum(['todos', 'aguardando_nota', 'aguardando_despacho', 'em_transito', 'entregues']).optional() }, annotations: ro,
  }, async ({ inicio, fim, situacao }) => json(tempoEtapasPedidos(inicio, fim, situacao)));

  s.registerTool('bf_eventos_transporte', {
    title: 'Eventos de transporte (conferência do despacho)',
    description: 'Descrições de eventos da transportadora nos pacotes do período, quantas vezes aparecem, quantas vezes são o primeiro evento e se contam como despacho na regra atual. Também diz quantos pacotes já têm eventos e quantos já foram relidos com a versão que guarda o horário da nota e os eventos.',
    inputSchema: { ...periodo, limite: z.number().int().optional() }, annotations: ro,
  }, async ({ inicio, fim, limite }) => json(eventosTransporte(inicio, fim, limite)));

  s.registerTool('bf_a_faturar', {
    title: 'Pedidos a faturar',
    description: 'Pedidos criados de 2 dias atrás até agora (hoje, ontem e anteontem) que ainda não foram faturados nem cancelados, pelo status atual na VTEX: pedidos, peças, valor e pedido mais antigo.',
    inputSchema: {}, annotations: ro,
  }, async () => json(aFaturar()));

  s.registerTool('bf_octadesk_diagnostico', {
    title: 'Diagnóstico da conexão com o Octadesk',
    description: 'Testa as credenciais do Octadesk cadastradas no servidor (API nova e token de integração) e mostra o formato das respostas de tickets e chat, sem dados de clientes.',
    inputSchema: {}, annotations: ro,
  }, async () => json(await diagnosticoOctadesk()));

  s.registerTool('bf_atendimento_por_dia', {
    title: 'Chamados do Octadesk por dia',
    description: 'Tickets e conversas (chat/WhatsApp) abertos por dia no Octadesk, com o mesmo dia da semana de 2025 (364 dias antes): tickets, conversas, conversas com humano e com bot, total.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(atendimentoPorDia(inicio, fim)));

  s.registerTool('bf_atendimento_por_grupo', {
    title: 'Chamados do Octadesk por motivo, canal ou grupo',
    description: 'Quantidade de tickets (ou conversas) no período por motivo (campo personalizado), canal, grupo, status ou tag, com a participação e o mesmo período de 2025.',
    inputSchema: {
      ...periodo,
      agrupar: z.enum(['motivo', 'canal', 'grupo', 'status', 'tag']).optional().describe('Padrão: motivo.'),
      origem: z.enum(['tickets', 'chat']).optional().describe('Padrão: tickets.'),
    }, annotations: ro,
  }, async ({ inicio, fim, agrupar, origem }) => json(atendimentoPorGrupo(inicio, fim, agrupar, origem)));

  s.registerTool('bf_match_estoque_resumo', {
    title: 'Match de estoque por loja (ERP × VTEX)',
    description: 'Para cada loja e o CD do e-commerce: SKUs comparados entre o estoque do ERP (último arquivo importado) e o da VTEX (última varredura), iguais, divergentes, % de match, quantidade diferente, só no ERP, só na VTEX, SKU que não existe na VTEX, peças de cada lado.',
    inputSchema: {}, annotations: ro,
  }, async () => json(matchResumo()));

  s.registerTool('bf_match_estoque_divergencias', {
    title: 'Divergências de estoque (ERP × VTEX)',
    description: 'SKUs com estoque diferente entre o ERP e a VTEX, da maior diferença para a menor: loja, código reduzido, SKU VTEX, referência, produto, tamanho, cor, estoque ERP, estoque VTEX, reservado, diferença e tipo.',
    inputSchema: {
      loja: z.union([z.number(), z.string()]).nullable().optional().describe('Número da loja (cd_empresa; 64 = CD do e-commerce). Vazio = todas.'),
      tipo: z.enum(TIPOS_DIVERGENCIA).nullable().optional().describe('Tipo de divergência. Vazio = todos.'),
      limite: z.number().int().optional().describe('Máximo de linhas (padrão 300, até 2000).'),
    }, annotations: ro,
  }, async ({ loja, tipo, limite }) => json(matchDivergencias(loja, tipo, limite)));

  s.registerTool('bf_atendimento_tempo', {
    title: 'Tempo de resolução dos tickets por atendente ou motivo',
    description: 'Tickets do Octadesk abertos no período por atendente responsável ou por motivo: tickets, resolvidos, em aberto, tempo médio e mediano da abertura até a resolução (horas corridas), % resolvido em até 24 h, interações do atendente por ticket e o tempo médio do mesmo período de 2025.',
    inputSchema: { ...periodo, agrupar: z.enum(['atendente', 'motivo']).optional().describe('Padrão: atendente.') }, annotations: ro,
  }, async ({ inicio, fim, agrupar }) => json(atendimentoTempo(inicio, fim, agrupar)));

  s.registerTool('bf_venda_lojas', {
    title: 'Venda das lojas físicas (base comercial)',
    description: 'Venda das lojas importada da base comercial do varejo, por dia ou por loja: venda bruta (linhas de venda), peças, venda SALE (desconto ≥ 40% sobre a tabela), valor DE, CMV (custo GEC do plano), margem, desconto, venda líquida e devoluções.',
    inputSchema: { ...periodo, agrupar: z.enum(['dia', 'loja']).optional().describe('Padrão: dia.') }, annotations: ro,
  }, async ({ inicio, fim, agrupar }) => json(vendaLojas(inicio, fim, agrupar)));

  s.registerTool('bf_midia_por_dia', {
    title: 'Mídia e site por dia (GA4 + Meta Ads)',
    description: 'Por dia: sessões, usuários, compras e receita do GA4, carrinhos e checkouts; investimento, cliques e impressões do Google Ads (pelo GA4); investimento, compras, receita e ROAS do Meta Ads; investimento total.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await midiaPorDia(inicio, fim)));

  s.registerTool('bf_ga4_canais', {
    title: 'GA4 por canal',
    description: 'Sessões, usuários, engajamento, carrinhos, compras, receita, conversão e ticket médio do GA4 por canal (agrupamento padrão), no período.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await ga4Canais(inicio, fim)));

  s.registerTool('bf_ga4_novos_recorrentes', {
    title: 'GA4: novos × recorrentes',
    description: 'Usuários novos e recorrentes do GA4 (sem bots: além dos robôs que o GA4 já exclui, tira as sessões que entram por /Sistema/buscavazia) no período, nos mesmos dias do mês anterior e do ano anterior: usuários, sessões, engajamento, compras, receita e conversão; total de usuários únicos e quanto foi excluído como bot.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await ga4NovosRecorrentes(inicio, fim)));

  s.registerTool('bf_ga4_origens', {
    title: 'GA4 por origem/mídia e campanha',
    description: 'Sessões, compras, receita e conversão do GA4 por origem/mídia e campanha, no período.',
    inputSchema: { ...periodo, limite: z.number().int().optional() }, annotations: ro,
  }, async ({ inicio, fim, limite }) => json(await ga4Origens(inicio, fim, limite)));

  s.registerTool('bf_ga4_paginas', {
    title: 'GA4 páginas do site',
    description: 'Páginas de entrada (sessões, engajamento, carrinhos, compras, receita, conversão) ou páginas mais vistas (visualizações, usuários, tempo médio), no período.',
    inputSchema: { ...periodo, tipo: z.enum(['entrada', 'vistas']).optional(), limite: z.number().int().optional() }, annotations: ro,
  }, async ({ inicio, fim, tipo, limite }) => json(await ga4Paginas(inicio, fim, tipo, limite)));

  s.registerTool('bf_ga4_funil', {
    title: 'Funil de compra (GA4)',
    description: 'Usuários e eventos em cada etapa do funil no período: sessões, viu produto, carrinho, checkout, entrega, pagamento e compra, com % do início e da etapa anterior.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await ga4Funil(inicio, fim)));

  s.registerTool('bf_ga4_tempo_real', {
    title: 'GA4 em tempo real',
    description: 'Últimos 30 minutos no site: usuários ativos (total, por minuto, por página e por dispositivo) e eventos de carrinho, checkout e compra.',
    inputSchema: {}, annotations: ro,
  }, async () => json(await ga4TempoReal()));

  s.registerTool('bf_meta_campanhas', {
    title: 'Meta Ads por campanha',
    description: 'Investimento, impressões, cliques, CTR, CPC, compras, receita, ROAS e custo por compra de cada campanha do Meta Ads no período.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await metaCampanhas(inicio, fim)));

  s.registerTool('bf_google_campanhas', {
    title: 'Google Ads por campanha',
    description: 'Direto da API do Google Ads: investimento, impressões, cliques, CTR, CPC, conversões, valor de conversão, ROAS e custo por conversão de cada campanha no período.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(await googleAdsCampanhas(inicio, fim)));

  s.registerTool('bf_ga4_entrada_detalhe', {
    title: 'GA4: de onde vêm as sessões de uma página de entrada',
    description: 'Para uma página de entrada (ex.: /Sistema/buscavazia), sessões, % do total, engajamento, usuários, novos, compras e receita por origem/mídia, campanha, canal, dispositivo, país, cidade, URL completa (com a busca), navegador, dia, hora ou novo × recorrente.',
    inputSchema: { ...periodo, pagina: z.string().describe('Caminho da página de entrada, como aparece no GA4.'), agrupar: z.enum(['origem', 'campanha', 'canal', 'dispositivo', 'pais', 'cidade', 'url', 'navegador', 'dia', 'hora', 'novo']).optional(), limite: z.number().int().optional() }, annotations: ro,
  }, async ({ inicio, fim, pagina, agrupar, limite }) => json(await ga4EntradaDetalhe(pagina, inicio, fim, agrupar, limite)));

  s.registerTool('bf_vendas_por_estado', {
    title: 'Captado por estado (UF de entrega)',
    description: 'Ranking de estados pelo captado da VTEX (pedidos não cancelados), pela UF do endereço de entrega: captado, share, pedidos, peças, ticket médio, margem e % SALE.',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(vendasPorEstado(inicio, fim)));

  s.registerTool('bf_vendas_por_vendedor', {
    title: 'Vendas por código de vendedor',
    description: 'Captado da VTEX (não cancelados) por código de vendedor do pedido (campos de marketing / customData / utmi), com pedidos, peças, ticket, margem e o campo de onde o código veio. Com amostra = true, devolve exemplos dos campos de marketing gravados.',
    inputSchema: { ...periodo, amostra: z.boolean().optional() }, annotations: ro,
  }, async ({ inicio, fim, amostra }) => json(amostra ? amostraCamposVendedor() : vendasPorVendedor(inicio, fim)));

  s.registerTool('bf_vendas_por_departamento', {
    title: 'Vendas por departamento (código de vendedor)',
    description: 'Captado da VTEX com código de vendedor por departamento: Inside Sales (códigos 300 a 399), Personal Shopper (códigos que começam com 64) e Lojas físicas (demais). Pedidos, ticket, margem, share e quanto veio da prateleira infinita (UTM).',
    inputSchema: periodo, annotations: ro,
  }, async ({ inicio, fim }) => json(vendasPorDepartamento(inicio, fim)));

  s.registerTool('bf_estoque_saude', {
    title: 'Saúde do estoque (ERP): cobertura, giro e grade quebrada',
    description: 'Por loja e total, do último estoque do ERP importado: peças, % de referências e de peças com grade quebrada (P/M/G ou 36/38/40/42), peças vendidas no período (base comercial, Varejo), giro do período e cobertura em dias.',
    inputSchema: { ...periodo, grade: z.enum(['todas', 'letras', 'numeros']).optional() }, annotations: ro,
  }, async ({ inicio, fim, grade }) => json(estoqueSaude({ inicio, fim, grade })));

  s.registerTool('bf_recorde_captacao', {
    title: 'Recorde de captação (últimos 2 anos)',
    description: 'Maiores dias, horas e meses de captado da VTEX nos últimos 2 anos (limite da plataforma). Com iniciar = true, começa ou retoma a varredura em segundo plano; chame de novo para ver o progresso.',
    inputSchema: { iniciar: z.boolean().optional(), top: z.number().int().min(1).max(50).optional(), dia: z.string().optional(), inicio: z.string().optional(), fim: z.string().optional() }, annotations: ro,
  }, async ({ iniciar, top, dia, inicio, fim }) => json(recordeCaptacao({ iniciar, top, dia, inicio, fim })));

  s.registerTool('bf_status', {
    title: 'Status da sincronização',
    description: 'Quando os dados foram atualizados pela última vez, erros e cobertura.',
    inputSchema: {}, annotations: ro,
  }, async () => json([{ ...status()[0], ...statusOctadesk(), ...statusMatch(), ...statusLojas(), ...statusMidia(), ...statusGoogleAds(), url_lojas: baseUrl() ? `${baseUrl()}/lojas/${config.accessSecret}` : null, url_estoque: urlEstoque(), url_estoque_csv: urlEstoque() ? urlEstoque() + '/divergencias.csv' : null }]));

  return s;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const checkSecret = (req, res, next) => {
  if (req.params.secret !== config.accessSecret) return res.status(404).send('Not found');
  next();
};

app.post('/mcp/:secret', checkSecret, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Erro MCP:', err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null });
  }
});
const notAllowed = (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
app.get('/mcp/:secret', checkSecret, notAllowed);
app.delete('/mcp/:secret', checkSecret, notAllowed);

app.get('/importar/:secret', checkSecret, (req, res) => res.type('html').send(uploadPage(status()[0])));
app.post('/importar/:secret', checkSecret, express.text({ type: '*/*', limit: '80mb' }), (req, res) => {
  try {
    res.json({ ok: true, ...importar3351(req.body || '') });
  } catch (err) {
    res.status(400).json({ ok: false, erro: err.message });
  }
});

app.get('/lojas/:secret', checkSecret, (req, res) => res.type('html').send(lojasPage(statusLojas())));
app.post('/lojas/:secret', checkSecret, express.json({ limit: '80mb' }), (req, res) => {
  try { res.json({ ok: true, ...importarLojas(req.body) }); } catch (err) { res.status(400).json({ ok: false, erro: err.message }); }
});

app.get('/estoque/:secret', checkSecret, (req, res) => res.type('html').send(estoquePage({ ...statusMatch(), csv: `/estoque/${config.accessSecret}/divergencias.csv` })));
app.post('/estoque/:secret', checkSecret, express.json({ limit: '60mb' }), (req, res) => {
  try {
    res.json({ ok: true, ...importarEstoqueErp(req.body) });
  } catch (err) {
    res.status(400).json({ ok: false, erro: err.message });
  }
});
app.get('/estoque/:secret/divergencias.csv', checkSecret, (req, res) => {
  const loja = req.query.loja ? String(req.query.loja) : null;
  const tipo = req.query.tipo && TIPOS_DIVERGENCIA.includes(String(req.query.tipo)) ? String(req.query.tipo) : null;
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="divergencias_estoque${loja ? '_loja' + loja.replace(/\D/g, '') : ''}_${dia}.csv"`);
  res.send(matchCsv(loja, tipo));
});


// ---------- Site do painel com login (/login, /painel) ----------
// As mesmas ferramentas do conector, chamadas pelo navegador com sessão (sem o código secreto).
const WEB_TOOLS = new Set(['bf_vendas_por_hora', 'bf_vendas_por_dia', 'bf_resultado_promocoes', 'bf_estoque_por_warehouse', 'bf_resumo_catalogo',
  'bf_faturado_liquido', 'bf_vendas_por_grupo', 'bf_top_referencias', 'bf_faturamento_por_loja', 'bf_entrega_por_transportadora', 'bf_entrega_pedidos', 'bf_entrega_pedidos_lista', 'bf_a_faturar', 'bf_tempo_etapas', 'bf_tempo_etapas_pedidos',
  'bf_venda_lojas', 'bf_midia_por_dia', 'bf_ga4_canais', 'bf_ga4_novos_recorrentes', 'bf_ga4_origens', 'bf_ga4_paginas', 'bf_ga4_funil', 'bf_ga4_tempo_real', 'bf_meta_campanhas', 'bf_google_campanhas', 'bf_ga4_entrada_detalhe',
  'bf_atendimento_por_dia', 'bf_atendimento_por_grupo', 'bf_atendimento_tempo', 'bf_match_estoque_resumo', 'bf_match_estoque_divergencias', 'bf_recorde_captacao', 'bf_vendas_por_estado', 'bf_vendas_por_vendedor', 'bf_vendas_por_departamento', 'bf_estoque_saude', 'bf_status']);
const ferramentas = new Map();
buildServer({ registerTool: (nome, def, fn) => { if (WEB_TOOLS.has(nome)) ferramentas.set(nome, { schema: z.object(def.inputSchema || {}), fn }); } });

const pastaSite = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const urlenc = express.urlencoded({ extended: false, limit: '10kb' });

app.get('/login', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  if (!usuarios().size) return res.status(503).type('html').send(paginaLogin('Nenhum usuário cadastrado: defina PAINEL_USUARIOS no Render.'));
  res.type('html').send(paginaLogin('', '', String(req.query.destino || '/painel/')));
});
app.post('/login', urlenc, fazerLogin);
app.get('/sair', sair);
app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));

const painel = express.Router();
painel.use(exigirLogin);
painel.get('/api/eu', (req, res) => res.json({ email: req.usuario.email, perfil: req.usuario.perfil }));
painel.get('/api/:tool', async (req, res) => {
  const t = ferramentas.get(req.params.tool);
  if (!t) return res.status(404).json({ erro: 'Ferramenta desconhecida' });
  try {
    let args = {};
    if (req.query.args) args = JSON.parse(String(req.query.args));
    for (const k of Object.keys(args)) if (args[k] === null || args[k] === '') delete args[k];
    const r = await t.fn(t.schema.parse(args));
    let dados = JSON.parse(r.content.map((c) => c.text || '').join(''));
    if (req.params.tool === 'bf_status') {
      // no site, os links de importação são as páginas com login (só admin), nunca as URLs com o código secreto
      const adm = req.usuario.perfil === 'admin';
      dados = dados.map((x) => {
        const y = Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('url_')));
        y.url_importacao = adm ? '/painel/importar' : null;
        y.url_estoque = adm ? '/painel/estoque' : null;
        y.url_lojas = adm ? '/painel/lojas' : null;
        y.url_google_ads = adm && googleAdsTemCliente() ? '/painel/google-ads/conectar' : null;
        y.url_estoque_csv = '/painel/estoque/divergencias.csv';
        return y;
      });
    }
    res.json(dados);
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});
painel.get('/importar', exigirAdmin, (req, res) => res.type('html').send(uploadPage(status()[0])));
painel.post('/importar', exigirAdmin, express.text({ type: '*/*', limit: '80mb' }), (req, res) => {
  try { res.json({ ok: true, ...importar3351(req.body || '') }); } catch (err) { res.status(400).json({ ok: false, erro: err.message }); }
});
painel.get('/lojas', exigirAdmin, (req, res) => res.type('html').send(lojasPage(statusLojas())));
painel.post('/lojas', exigirAdmin, express.json({ limit: '80mb' }), (req, res) => {
  try { res.json({ ok: true, ...importarLojas(req.body) }); } catch (err) { res.status(400).json({ ok: false, erro: err.message }); }
});
// Google Ads: conectar a conta Google (OAuth) uma vez; o acesso fica guardado no servidor
const retornoGoogle = (req) => `https://${req.get('host')}/painel/google-ads/retorno`;
painel.get('/google-ads/conectar', exigirAdmin, (req, res) => {
  if (!googleAdsTemCliente()) return res.status(400).type('text').send('Faltam GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no Render.');
  res.redirect(302, urlConectar(retornoGoogle(req)));
});
painel.get('/google-ads/retorno', exigirAdmin, async (req, res) => {
  const pagina = (titulo, msg, ok) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px;line-height:1.5"><h1 style="font-size:22px;color:${ok ? '#21733d' : '#b3261e'}">${titulo}</h1><p>${msg}</p><p><a href="/painel/#midia">Voltar ao painel</a></p>`;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  if (req.query.error) return res.status(400).type('html').send(pagina('Conexão cancelada', 'O Google respondeu: ' + esc(req.query.error) + '.', false));
  try {
    const c = await concluirConexao(String(req.query.code || ''), String(req.query.state || ''), retornoGoogle(req));
    res.type('html').send(pagina('Google Ads conectado', `Conta: <b>${esc(c.conta || 'sem nome')}</b>${c.moeda ? ' (' + esc(c.moeda) + ')' : ''}. O investimento do Google passa a vir direto da API na aba Mídia e site.`, true));
  } catch (err) {
    res.status(400).type('html').send(pagina('Não conectou', esc(err.message), false));
  }
});
painel.get('/estoque', exigirAdmin, (req, res) => res.type('html').send(estoquePage({ ...statusMatch(), csv: '/painel/estoque/divergencias.csv' })));
painel.post('/estoque', exigirAdmin, express.json({ limit: '60mb' }), (req, res) => {
  try { res.json({ ok: true, ...importarEstoqueErp(req.body) }); } catch (err) { res.status(400).json({ ok: false, erro: err.message }); }
});
painel.get('/estoque/divergencias.csv', (req, res) => {
  const loja = req.query.loja ? String(req.query.loja) : null;
  const tipo = req.query.tipo && TIPOS_DIVERGENCIA.includes(String(req.query.tipo)) ? String(req.query.tipo) : null;
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="divergencias_estoque${loja ? '_loja' + loja.replace(/\D/g, '') : ''}_${dia}.csv"`);
  res.send(matchCsv(loja, tipo));
});
painel.get('/d3.min.js', (req, res) => res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules', 'd3', 'dist', 'd3.min.js')));
// Arquivos do site: procura em site/ e, se tiverem sido enviados soltos na raiz do repositório, na raiz.
// Só os arquivos desta lista são servidos (o resto do repositório nunca vai para o navegador).
const raiz = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVOS_SITE = ['index.html', 'app.js', 'calculos.js', 'dash.js', 'estilo.css', 'tema.css', 'plano_bf.js', 'midia_painel.js', 'data/plano_bf_canais.json', 'data/faturado_2025.json',
  'data/base_2025_por_hora.json', 'data/meta_diaria.json', 'data/plano_bf26_site_diario_v2.json', 'data/promocoes_bf25.json'];
const acharArquivo = (rel) => [path.join(pastaSite, rel), path.join(raiz, 'site', path.basename(rel)), path.join(raiz, path.basename(rel))].find((f) => fs.existsSync(f));
// Painel oficial = v2 (E-commerce Intelligence) em /painel/. O painel anterior fica em /painel/v1/.
const v2Index = () => [path.join(raiz, 'v2', 'index.html'), path.join(pastaSite, 'v2', 'index.html')].find((x) => fs.existsSync(x));
painel.get(['/', '/index.html'], (req, res, next) => {
  const f = v2Index();
  if (!f) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(f);
});
painel.get('/v1', (req, res) => {
  if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(301, '/painel/v1/');
  const f = acharArquivo('index.html');
  if (!f) return res.status(404).send('Painel anterior não encontrado');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(fs.readFileSync(f, 'utf8').replace('<head>', '<head>\n<base href="/painel/">'));
});
painel.get(['/:arquivo', '/data/:arquivo'], (req, res, next) => {
  const rel = req.path.replace(/^\//, '');
  if (!ARQUIVOS_SITE.includes(rel)) return next();
  const f = acharArquivo(rel);
  if (!f) return res.status(404).send('Arquivo do site não encontrado no servidor: ' + rel);
  res.sendFile(f);
});
// ---------- v2 (E-commerce Intelligence): mesma base, nova organização em /painel/v2/ ----------
const ARQUIVOS_V2 = ['index.html', 'v2.js', 'v2.css'];
painel.get(['/v2', '/v2/', '/v2/:arquivo'], (req, res, next) => {
  if (req.path === '/v2' || req.path === '/v2/' || req.params.arquivo === 'index.html') return res.redirect(301, '/painel/');
  const nome = req.params.arquivo;
  if (!ARQUIVOS_V2.includes(nome)) return next();
  const f = [path.join(raiz, 'v2', nome), path.join(pastaSite, 'v2', nome)].find((x) => fs.existsSync(x));
  if (!f) return res.status(404).send('Arquivo da v2 não encontrado no servidor: ' + nome);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(f);
});
// Campanhas comerciais: cadastro permanente (DATA_DIR/campanhas.json). Leitura para todos; gravação só admin.
painel.get('/api-campanhas', (req, res) => res.json(lerCampanhas()));
painel.post('/api-campanhas', exigirAdmin, express.json({ limit: '300kb' }), (req, res) => {
  try { res.json({ ok: true, campanhas: gravarCampanhas(req.body) }); } catch (err) { res.status(400).json({ ok: false, erro: err.message }); }
});
app.use('/painel', (req, res, next) => (req.originalUrl === '/painel' ? res.redirect(301, '/painel/') : next()), painel);

// 200 para o health check do Render; no navegador, segue para o painel
app.get('/', (req, res) => res.type('html').send('<!doctype html><meta http-equiv="refresh" content="0;url=/painel/"><a href="/painel/">ok</a>'));

load();
carregarMatch();
carregarLojas();
start();
startOctadesk();
app.listen(config.port, () => {
  console.log(`Servidor no ar na porta ${config.port}`);
  const base = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
  console.log(`URL do conector (cole no Claude): ${base}/mcp/${config.accessSecret}`);
  console.log(`Página para importar o 3351: ${base}/importar/${config.accessSecret}`);
  console.log(`Página da venda das lojas: ${base}/lojas/${config.accessSecret}`);
  console.log(`Página do estoque das lojas: ${base}/estoque/${config.accessSecret}`);
  console.log(`Site do painel (com login): ${base}/painel/ · usuários: ${[...usuarios().values()].map((u) => u.email + ' (' + u.perfil + ')').join(', ') || 'nenhum — defina PAINEL_USUARIOS'}`);
});
