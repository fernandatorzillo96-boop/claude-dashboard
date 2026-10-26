// Servidor MCP (Streamable HTTP) do painel Black Friday 2026 — somente leitura na VTEX.
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { state, load } from './store.js';
import { start, sweepProgress } from './sync.js';
import { vendasPorHora, vendasPorDia, resultadoPromocoes, faturadoLiquido, status, aFaturar, vendasPorGrupo, topReferencias, AGRUPAMENTOS, faturamentoPorLoja, entregaPorTransportadora } from './metrics.js';
import { importar3351 } from './erp3351.js';
import { diagnosticoOctadesk, startOctadesk, atendimentoPorDia, atendimentoPorGrupo, statusOctadesk } from './octadesk.js';
import { uploadPage } from './upload-page.js';

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

function buildServer() {
  const s = new McpServer({ name: 'vtex-bf26', version: '1.0.0' });

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
    description: 'Última varredura do estoque VTEX: total, reservado e disponível por warehouse (lojas e CD).',
    inputSchema: {}, annotations: ro,
  }, async () => json((state.inventory?.warehouses || []).map((w) => ({ ...w, atualizado_em: state.inventory.atualizado_em }))));

  s.registerTool('bf_resumo_catalogo', {
    title: 'Resumo de estoque e catálogo',
    description: 'Uma linha: estoque disponível total (todos os estoques), quanto dele está em SKUs ativos (%), SKUs com estoque, SKUs ativos, produtos ativos e produtos visíveis no site.',
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

  s.registerTool('bf_a_faturar', {
    title: 'Pedidos a faturar',
    description: 'Pedidos captados desde o início do acompanhamento que ainda não foram faturados nem cancelados, pelo status atual na VTEX: pedidos, peças, valor e pedido mais antigo.',
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

  s.registerTool('bf_status', {
    title: 'Status da sincronização',
    description: 'Quando os dados foram atualizados pela última vez, erros e cobertura.',
    inputSchema: {}, annotations: ro,
  }, async () => json([{ ...status()[0], ...statusOctadesk() }]));

  return s;
}

const app = express();
app.disable('x-powered-by');

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

app.get('/', (req, res) => res.send('ok'));

load();
start();
startOctadesk();
app.listen(config.port, () => {
  console.log(`Servidor no ar na porta ${config.port}`);
  const base = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
  console.log(`URL do conector (cole no Claude): ${base}/mcp/${config.accessSecret}`);
  console.log(`Página para importar o 3351: ${base}/importar/${config.accessSecret}`);
});
