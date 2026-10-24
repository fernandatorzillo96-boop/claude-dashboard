// Configuração lida das variáveis de ambiente (no Render: Environment).
import path from 'node:path';

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  port: Number(env('PORT', 3000)),
  account: env('VTEX_ACCOUNT', 'lojaaguadecoco'),
  environment: env('VTEX_ENV', 'vtexcommercestable'),
  appKey: env('VTEX_APP_KEY', ''),
  appToken: env('VTEX_APP_TOKEN', ''),
  // Para testes locais: aponta para um servidor falso no lugar da VTEX.
  baseUrlOverride: env('VTEX_BASE_URL', ''),
  // Código secreto que vai na URL do conector: /mcp/<ACCESS_SECRET>
  // Só letras e números (o valor gerado pelo Render pode ter / e +).
  accessSecret: env('ACCESS_SECRET', '').replace(/[^A-Za-z0-9]/g, ''),
  // Primeiro dia acompanhado (horário de Brasília).
  inicio: env('BF_INICIO', '2026-10-01'),
  dataDir: env('DATA_DIR', path.resolve('storage')),
  syncEveryMin: Number(env('SYNC_EVERY_MIN', 5)),
  fullRescanEveryMin: Number(env('FULL_RESCAN_EVERY_MIN', 60)),
  estoqueEveryMin: Number(env('ESTOQUE_EVERY_MIN', 180)),
  catalogoEveryMin: Number(env('CATALOGO_EVERY_MIN', 1440)),
  concurrency: Number(env('VTEX_CONCURRENCY', 4)),
  sweepConcurrency: Number(env('VTEX_SWEEP_CONCURRENCY', 6)),
  // Promoções ignoradas no ranking (política fixa do site, não é ação).
  promoIgnorar: new RegExp(env('PROMO_IGNORAR', 'frete gr'), 'i'),
  // Quando o SKU não tem Custo GEC: CMV estimado = preço DE × este fator
  // (custo ÷ varejo do site, SALE, da aba PREMISSAS | CALENDÁRIO).
  custoSobreDeEstimado: Number(env('CUSTO_SOBRE_DE_ESTIMADO', 0.1343)),
  // Fuso de Brasília sem horário de verão.
  utcOffsetHours: -3,
};

export function vtexBaseUrl() {
  if (config.baseUrlOverride) return config.baseUrlOverride.replace(/\/$/, '');
  return `https://${config.account}.${config.environment}.com.br`;
}
