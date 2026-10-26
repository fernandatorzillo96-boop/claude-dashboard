// Octadesk: diagnóstico de conexão (só leitura). Testa a API nova (x-api-key) e o token de integração (octa.).
const env = (k) => (process.env[k] || '').trim();

function forma(body) {
  if (Array.isArray(body)) return { tipo: 'lista', itens: body.length, campos: body[0] && typeof body[0] === 'object' ? Object.keys(body[0]).slice(0, 40) : [] };
  if (body && typeof body === 'object') {
    const lista = Object.entries(body).find(([, v]) => Array.isArray(v));
    return {
      tipo: 'objeto', chaves: Object.keys(body).slice(0, 30),
      lista_em: lista ? lista[0] : null, itens: lista ? lista[1].length : null,
      campos: lista && lista[1][0] && typeof lista[1][0] === 'object' ? Object.keys(lista[1][0]).slice(0, 40) : [],
    };
  }
  return { tipo: typeof body };
}

async function tenta(nome, url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    let body = null;
    try { body = JSON.parse(txt); } catch { body = null; }
    return { tentativa: nome, caminho: new URL(url).pathname + (new URL(url).search ? '?…' : ''), status: res.status, ...(body ? forma(body) : { texto: txt.slice(0, 120) }) };
  } catch (err) {
    return { tentativa: nome, caminho: url.replace(/^https?:\/\/[^/]+/, ''), erro: err.message };
  }
}

export async function diagnosticoOctadesk() {
  const token = env('OCTADESK_TOKEN'), sub = env('OCTADESK_SUBDOMINIO'), email = env('OCTADESK_EMAIL');
  let base = env('OCTADESK_API_URL').replace(/\/$/, '');
  if (base && !/^https?:\/\//.test(base)) base = 'https://' + base;
  const out = [{ tentativa: 'variaveis', token: token ? `preenchido (${token.length} caracteres, começa com ${token.slice(0, 5)})` : 'vazio', subdominio: sub || 'vazio', email: email ? 'preenchido' : 'vazio', api_url: base || 'vazio' }];
  if (!token) return out;

  // API nova
  if (base) {
    const h = { 'x-api-key': token, 'octa-agent-email': email, Accept: 'application/json' };
    out.push(await tenta('nova: tickets', `${base}/tickets?page=1&limit=2`, { headers: h }));
    out.push(await tenta('nova: chat', `${base}/chat?page=1&limit=2`, { headers: h }));
    out.push(await tenta('nova: tickets status', `${base}/tickets/status`, { headers: h }));
  }

  // Token de integração (API antiga)
  const login = await fetch('https://api.octadesk.services/login/apiToken', {
    method: 'POST', headers: { apiToken: token, username: email, subDomain: sub, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ erro: e.message }));
  const at = login.body && (login.body.token || login.body.access_token);
  out.push({ tentativa: 'antiga: login', status: login.status, erro: login.erro, recebeu_token: !!at, chaves: login.body ? Object.keys(login.body).slice(0, 10) : [] });
  if (at) {
    const h = { Authorization: `Bearer ${at}`, Accept: 'application/json' };
    const d = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
    out.push(await tenta('antiga: tickets search', `https://api.octadesk.services/tickets/search?openDate=${d}`, { headers: h }));
    out.push(await tenta('antiga: chat', `https://api.octadesk.services/chat/conversation?page=1&limit=2`, { headers: h }));
  }
  return out;
}
