// Página simples para importar o 3351 todo dia (funciona no celular).
const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function uploadPage(st) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Importar faturado (3351)</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1f1f1f;line-height:1.45}
 h1{font-size:22px;margin:0 0 6px} p{color:#555;margin:0 0 18px}
 .box{border:1.5px dashed #b9b2a6;border-radius:12px;padding:28px;text-align:center;background:#faf8f4}
 button{margin-top:14px;padding:11px 20px;border:0;border-radius:8px;background:#1f1f1f;color:#fff;font-size:15px}
 button:disabled{opacity:.4}
 #msg{margin-top:18px;white-space:pre-line} .ok{color:#21733d} .erro{color:#b3261e}
 dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px;color:#555;margin-top:28px}
 dt{color:#888}
</style></head><body>
<h1>Importar faturado do dia</h1>
<p>Relatório <b>3351</b> do ERP (o arquivo .XLS como sai do sistema). Cada importação substitui os dias que o arquivo contém; pode mandar o mês inteiro todo dia.</p>
<div class="box">
 <input type="file" id="f" accept=".xls,.XLS,.txt,.csv">
 <br><button id="b" disabled>Importar</button>
</div>
<div id="msg"></div>
<dl>
 <dt>Dias já importados</dt><dd>${esc(st.faturado_dias_importados)}</dd>
 <dt>Última importação</dt><dd>${esc(st.faturado_ultima_importacao)}</dd>
 <dt>Pedidos VTEX sincronizados</dt><dd>${esc(st.ultima_sincronizacao)}</dd>
</dl>
<script>
const f=document.getElementById('f'),b=document.getElementById('b'),m=document.getElementById('msg');
f.onchange=()=>{b.disabled=!f.files.length;m.textContent='';};
b.onclick=async()=>{
  b.disabled=true;m.className='';m.textContent='Enviando…';
  try{
    const buf=await f.files[0].arrayBuffer();
    const txt=new TextDecoder('windows-1252').decode(buf);
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'text/plain; charset=utf-8'},body:txt});
    const j=await r.json();
    if(!j.ok)throw new Error(j.erro||'Falhou');
    m.className='ok';
    m.textContent='Importado: '+j.dias+' dias ('+j.de+' a '+j.ate+'), '+j.linhas+' linhas.'+(j.valor_sem_custo?'\\nSem Custo GEC: R$ '+j.valor_sem_custo.toLocaleString('pt-BR'):'');
  }catch(e){m.className='erro';m.textContent='Erro: '+e.message;}
  b.disabled=false;
};
</script>
</body></html>`;
}
