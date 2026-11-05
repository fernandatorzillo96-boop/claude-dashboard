// Página para subir o arquivo de estoque das lojas (Excel do ERP) e baixar as divergências.
const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function estoquePage(st) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Match de estoque (ERP × VTEX)</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1f1f1f;line-height:1.45}
 h1{font-size:22px;margin:0 0 6px} p{color:#555;margin:0 0 18px}
 .box{border:1.5px dashed #b9b2a6;border-radius:12px;padding:28px;text-align:center;background:#faf8f4}
 button,a.btn{display:inline-block;margin-top:14px;padding:11px 20px;border:0;border-radius:8px;background:#1f1f1f;color:#fff;font-size:15px;text-decoration:none}
 button:disabled{opacity:.4}
 #msg{margin-top:18px;white-space:pre-line} .ok{color:#21733d} .erro{color:#b3261e}
 dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px;color:#555;margin-top:28px}
 dt{color:#888}
</style></head><body>
<h1>Estoque das lojas (ERP)</h1>
<p>Suba o Excel de estoque do ERP (colunas cd_empresa, cd_produto e Estoque atual). O painel compara loja a loja com o estoque da VTEX da última varredura. Cada importação substitui a anterior.</p>
<div class="box">
 <input type="file" id="f" accept=".xlsx,.xls,.csv">
 <br><button id="b" disabled>Importar</button>
</div>
<div id="msg"></div>
<p style="margin-top:22px"><a class="btn" href="${esc(st.csv)}">Baixar todas as divergências (Excel)</a></p>
<dl>
 <dt>Arquivo atual</dt><dd>${esc(st.estoque_erp_arquivo)}</dd>
 <dt>Importado em</dt><dd>${esc(st.estoque_erp_importado_em)}</dd>
 <dt>Estoque VTEX de</dt><dd>${esc(st.estoque_vtex_match_em)}</dd>
</dl>
<script>
const f=document.getElementById('f'),b=document.getElementById('b'),m=document.getElementById('msg');
const COLS=['ds_canal','cd_empresa','empresa','cd_produto','estoque atual','referencia','ds_referencia','tamanho','cor','sale','vlr varejo'];
f.onchange=()=>{b.disabled=!f.files.length;m.textContent='';};
b.onclick=async()=>{
  b.disabled=true;m.className='';m.textContent='Lendo o arquivo…';
  try{
    const arq=f.files[0];
    const wb=XLSX.read(await arq.arrayBuffer(),{dense:true});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});
    const head=(rows[0]||[]).map((c)=>String(c??'').trim().toLowerCase());
    const ix=COLS.map((c)=>head.indexOf(c));
    if(ix[1]<0||ix[3]<0||ix[4]<0)throw new Error('Não achei as colunas cd_empresa, cd_produto e Estoque atual.');
    const linhas=[];
    for(let i=1;i<rows.length;i++){const r=rows[i];if(!r||r[ix[3]]==null)continue;linhas.push(ix.map((j)=>j<0?null:r[j]));}
    m.textContent='Enviando '+linhas.length.toLocaleString('pt-BR')+' linhas…';
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nome_arquivo:arq.name,arquivo_em:new Date(arq.lastModified).toISOString(),colunas:COLS,linhas})});
    const j=await r.json();
    if(!j.ok)throw new Error(j.erro||'Falhou');
    m.className='ok';
    m.textContent='Importado: '+j.lojas+' lojas, '+j.linhas.toLocaleString('pt-BR')+' linhas, '+j.pecas.toLocaleString('pt-BR')+' peças.\\nAtualize o painel para ver o match.';
  }catch(e){m.className='erro';m.textContent='Erro: '+e.message;}
  b.disabled=false;
};
</script>
</body></html>`;
}
