// Cadastro de campanhas comerciais (calendário comercial do painel v2), salvo em DATA_DIR/campanhas.json.
// A Black Friday 2026 entra como primeira campanha histórica, com as metas já usadas no painel.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const ARQ = () => path.join(config.dataDir, 'campanhas.json');

const SEMENTE = [{
  id: 'black-friday-2026',
  nome: 'Black Friday 2026',
  inicio: '2026-11-01',
  fim: '2026-11-30',
  comp_inicio: '2025-11-02',
  comp_fim: '2025-12-01',
  meta_captado: 2967033.0,
  meta_faturamento: 2700000.01,
  supermeta: 3276000.01,
  meta_pecas: 10295,
  margem_planejada: 0.694,
  investimento: null,
  estoque_inicial: null,
  mecanicas: [
    { nome: 'Esquenta Compre 3 Pague 2', inicio: '2026-11-01', fim: '2026-11-06' },
    { nome: 'Esquenta Beach Friday', inicio: '2026-11-07', fim: '2026-11-15' },
    { nome: 'Toda SALE +20%', inicio: '2026-11-16', fim: '2026-11-24' },
    { nome: 'Black Friday', inicio: '2026-11-25', fim: '2026-11-30' },
  ],
  colecoes: [],
  observacoes: 'Primeira campanha cadastrada. Metas do e-commerce (site + app): faturado líquido R$ 2,7 mi (supermeta R$ 3,276 mi) e captado R$ 2,97 mi (super R$ 3,6 mi), pelas metas diárias do painel. Peças e margem planejadas = plano do site (BF26 Apoio Executivo). Plano da rede (lojas R$ 8,175 mi + site R$ 2,7 mi) na aba Plano por canal. Comparativo: mesmo dia da semana de 2025 (364 dias antes).',
}];

export function lerCampanhas() {
  try { return JSON.parse(fs.readFileSync(ARQ(), 'utf8')); } catch { return SEMENTE; }
}

const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));
const txt = (v, max) => (v == null ? null : String(v).slice(0, max));

export function gravarCampanhas(lista) {
  if (!Array.isArray(lista)) throw new Error('Envie a lista de campanhas.');
  if (lista.length > 200) throw new Error('Campanhas demais (máximo 200).');
  const ids = new Set();
  const limpa = lista.map((c) => {
    const x = {
      id: txt(c.id, 80), nome: txt(c.nome, 120), inicio: data(c.inicio), fim: data(c.fim), comp_inicio: data(c.comp_inicio), comp_fim: data(c.comp_fim),
      meta_captado: num(c.meta_captado), meta_faturamento: num(c.meta_faturamento), supermeta: num(c.supermeta), meta_pecas: num(c.meta_pecas),
      margem_planejada: num(c.margem_planejada), investimento: num(c.investimento), estoque_inicial: num(c.estoque_inicial),
      mecanicas: (Array.isArray(c.mecanicas) ? c.mecanicas : []).slice(0, 30).map((m) => ({ nome: txt(m.nome, 120), inicio: data(m.inicio), fim: data(m.fim) })).filter((m) => m.nome),
      colecoes: (Array.isArray(c.colecoes) ? c.colecoes : []).slice(0, 50).map((v) => txt(v, 80)).filter(Boolean),
      observacoes: txt(c.observacoes, 3000),
    };
    if (!x.id || !x.nome || !x.inicio || !x.fim || x.fim < x.inicio) throw new Error('Campanha sem nome ou com período inválido: ' + (x.nome || x.id || '?'));
    if (ids.has(x.id)) throw new Error('Campanha repetida: ' + x.id);
    ids.add(x.id);
    return x;
  });
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = ARQ() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(limpa, null, 1));
  fs.renameSync(tmp, ARQ());
  return limpa;
}
