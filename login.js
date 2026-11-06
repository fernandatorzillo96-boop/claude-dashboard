// Login do site do painel: usuários da variável PAINEL_USUARIOS e sessão em cookie assinado.
//
// PAINEL_USUARIOS = "email:senha:perfil;email2:senha2:perfil2"
//   perfil = admin (vê e importa 3351 / estoque) ou leitura (só vê). Padrão: leitura.
//   A senha pode ter ":" no meio; o perfil é sempre o último campo quando for admin/leitura.
import crypto from 'node:crypto';
import { config } from './config.js';

const DIAS_SESSAO = 30;
const COOKIE = 'painel_sessao';

export function usuarios() {
  const out = new Map();
  // tolera aspas em volta, espaços, quebras de linha e ";" sobrando
  const bruto = String(process.env.PAINEL_USUARIOS || '').trim().replace(/^["']|["']$/g, '');
  for (const item of bruto.split(/[;\n\r]+/)) {
    const t = item.trim().replace(/^["']|["']$/g, '');
    if (!t) continue;
    const partes = t.split(':');
    if (partes.length < 2) continue;
    const email = partes.shift().replace(/\s+/g, '').toLowerCase();
    let perfil = 'leitura';
    if (partes.length > 1 && /^(admin|leitura)$/i.test(partes[partes.length - 1].trim())) perfil = partes.pop().trim().toLowerCase();
    const senha = partes.join(':').trim();
    if (email && senha) out.set(email, { email, senha, perfil });
  }
  return out;
}

// Chave da assinatura: SESSAO_SECRET se existir, senão derivada do ACCESS_SECRET.
const chave = () => process.env.SESSAO_SECRET || crypto.createHash('sha256').update('painel:' + config.accessSecret).digest('hex');
const assinar = (txt) => crypto.createHmac('sha256', chave()).update(txt).digest('base64url');

const igual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// A sessão guarda a senha só como hash: trocar a senha na variável derruba as sessões antigas.
const marcaSenha = (u) => crypto.createHash('sha256').update(u.senha).digest('base64url').slice(0, 12);

function criarSessao(u) {
  const exp = Date.now() + DIAS_SESSAO * 864e5;
  const corpo = Buffer.from(JSON.stringify({ e: u.email, x: exp, s: marcaSenha(u) })).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

function lerCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}

export function usuarioDaSessao(req) {
  const v = lerCookies(req)[COOKIE];
  if (!v || !v.includes('.')) return null;
  const [corpo, sig] = v.split('.');
  if (!igual(sig, assinar(corpo))) return null;
  let d;
  try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch { return null; }
  if (!d || !d.x || d.x < Date.now()) return null;
  const u = usuarios().get(d.e);
  if (!u || d.s !== marcaSenha(u)) return null;
  return u;
}

const seguro = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';

function gravarCookie(res, req, valor, maxAgeSeg) {
  res.append('Set-Cookie', `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeg}${seguro(req) ? '; Secure' : ''}`);
}

// Trava simples contra tentativa de senha: 8 erros por IP em 15 min.
const tentativas = new Map();
const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function bloqueado(ip) {
  const t = tentativas.get(ip);
  return t && t.n >= 8 && Date.now() - t.desde < 15 * 60e3;
}
function falhou(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.desde > 15 * 60e3) tentativas.set(ip, { n: 1, desde: Date.now() });
  else t.n++;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function paginaLogin(erro = '', email = '', destino = '/painel/') {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Entrar · Painel Black Friday 2026</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;background:#f5f3ee;color:#1f1f1f;margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box}
 form{background:#fff;border:1px solid #e3ded4;border-radius:14px;padding:32px;width:100%;max-width:360px;box-sizing:border-box}
 h1{font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 4px} p{color:#666;margin:0 0 22px;font-size:14px}
 label{display:block;font-size:13px;color:#555;margin:14px 0 6px}
 input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #cfc8bb;border-radius:8px}
 button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:8px;background:#1f1f1f;color:#fff;font-size:15px;cursor:pointer}
 .erro{color:#b3261e;font-size:14px;margin-top:14px}
</style></head><body>
<form method="post" action="/login">
 <h1>Painel Black Friday 2026</h1>
 <p>Água de Coco · e-commerce</p>
 <input type="hidden" name="destino" value="${esc(destino)}">
 <label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}">
 <label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
 <button>Entrar</button>
 ${erro ? `<div class="erro">${esc(erro)}</div>` : ''}
</form></body></html>`;
}

const destinoSeguro = (d) => (typeof d === 'string' && /^\/painel(\/|$)/.test(d) && !d.startsWith('//') ? d : '/painel/');

export async function fazerLogin(req, res) {
  const ip = ipDe(req);
  const email = String(req.body?.email || '').replace(/\s+/g, '').toLowerCase();
  const destino = destinoSeguro(req.body?.destino);
  if (bloqueado(ip)) return res.status(429).type('html').send(paginaLogin('Muitas tentativas. Espere 15 minutos.', email, destino));
  const u = usuarios().get(email);
  const ok = u && igual(String(req.body?.senha || '').trim(), u.senha);
  if (!ok) {
    falhou(ip);
    // aparece nos Logs do Render (sem a senha) para saber o que deu errado
    console.log(`Login recusado: ${email || '(sem e-mail)'} · ${u ? 'senha diferente da cadastrada' : 'e-mail não está em PAINEL_USUARIOS'} · usuários cadastrados: ${[...usuarios().keys()].join(', ') || 'nenhum'}`);
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).type('html').send(paginaLogin('E-mail ou senha incorretos.', email, destino));
  }
  tentativas.delete(ip);
  gravarCookie(res, req, criarSessao(u), DIAS_SESSAO * 86400);
  console.log(`Login no painel: ${u.email}`);
  res.redirect(303, destino);
}

export function sair(req, res) {
  gravarCookie(res, req, '', 0);
  res.redirect(303, '/login');
}

// Middleware: exige sessão. Página → manda pro login; API → 401.
export function exigirLogin(req, res, next) {
  const u = usuarioDaSessao(req);
  if (!u) {
    if (req.path.startsWith('/api/') || req.method !== 'GET') return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.' });
    return res.redirect(302, '/login?destino=' + encodeURIComponent(req.originalUrl));
  }
  req.usuario = u;
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

export function exigirAdmin(req, res, next) {
  if (req.usuario?.perfil !== 'admin') return res.status(403).send('Só para administradores do painel.');
  next();
}
