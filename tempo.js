import { config } from './config.js';

const OFFSET_MS = config.utcOffsetHours * 3600 * 1000;

// ISO em UTC -> { data: 'YYYY-MM-DD', hora: 0..23 } no horário de Brasília
export function local(iso) {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return { data: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}

export function hojeLocal() {
  return local(new Date().toISOString()).data;
}

// Início do dia local (00:00 Brasília) em UTC
export function inicioDoDiaUTC(data) {
  return new Date(new Date(data + 'T00:00:00.000Z').getTime() - OFFSET_MS);
}

export function somaDias(data, n) {
  const d = new Date(data + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dataValida(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
